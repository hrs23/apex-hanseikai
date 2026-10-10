import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { clientIp, log } from "./log";
import { DerivedCache, readMetadata, sameSource, type State } from "./derived";
import { RECORDING_NAME, recordingStart } from "./recording";
import { uploadRecording } from "./upload";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const SAFE_NAME = /^[^/\\]+$/;
const RATE_WINDOW_MS = 3000;

export interface MediaConfig {
  recordingsDir: string;
  cacheDir: string;
}

interface Recording {
  name: string;
  state: State;
  startedAt: string;
  duration: number;
  players: string[];
  thumbnails: boolean;
  matchEnds: number[];
  height: number;
  low: "ready" | "processing" | null;
  progress: number;
}

export async function listRecordings(config: MediaConfig, cache: DerivedCache, day?: string): Promise<Recording[]> {
  if (!existsSync(config.recordingsDir)) return [];
  const entries = await Promise.all((await readdir(config.recordingsDir)).map(async (name) => {
    const match = RECORDING_NAME.exec(name);
    if (!match || day && match[1] !== day) return null;
    let source;
    try { source = await stat(join(config.recordingsDir, name)); } catch { return null; }
    if (!source.isFile()) return null;
    const meta = await readMetadata(join(config.cacheDir, name.slice(0, -4)));
    return { name, match, source, meta: sameSource(meta?.source, source) ? meta : null };
  }));
  const result: Recording[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const { name, match, source } = entry;
    const meta = entry.meta?.players ? entry.meta : await cache.metadata(name);
    cache.enqueue(name, !!day);
    result.push({
      name,
      state: cache.state(meta, await cache.writing(name, source)),
      startedAt: meta?.startedAt ?? recordingStart(match).toISOString(),
      duration: meta?.duration ?? 0,
      players: meta?.tracks === undefined ? [] : meta.players ?? [],
      matchEnds: meta?.matchEnds ?? [],
      thumbnails: !!meta?.thumbs,
      height: meta?.height ?? 0,
      low: cache.low(name, meta),
      progress: cache.progress(name),
    });
  }
  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function serveFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  let stat;
  try {
    stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404).end();
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const headers: Record<string, string | number> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    ETag: etag,
  };
  if (req.headers["if-none-match"] === etag) {
    log("media", { url: req.url, status: 304 });
    res.writeHead(304, headers).end();
    return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(stat.size - Number(range[2]), 0);
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
      return;
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers["Content-Length"] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === "HEAD" || !stat.size) {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  const began = Date.now();
  let sent = 0;
  let mark = began;
  let marked = 0;
  let peak = 0;
  stream.on("data", (chunk) => {
    sent += chunk.length;
    const now = Date.now();
    if (now - mark < RATE_WINDOW_MS) return;
    if (marked) peak = Math.max(peak, (sent - marked) * 8 / (now - mark) / 1000);
    mark = now;
    marked = sent;
  });
  stream.on("error", () => res.destroy());
  res.on("close", () => {
    stream.destroy();
    log("media", { url: req.url, status, range: `${start}-${end}`, sent, complete: sent === end - start + 1, ms: Date.now() - began, peakMbps: Math.round(peak * 10) / 10, ip: clientIp(req) });
  });
  stream.pipe(res);
}

export function handleMedia(req: IncomingMessage, res: ServerResponse, config: MediaConfig, cache: DerivedCache): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/media/")) return false;
  const upload = req.method === "PUT";
  if (req.method !== "GET" && req.method !== "HEAD" && !upload) {
    res.writeHead(405).end();
    return true;
  }
  let parts: string[];
  try { parts = url.pathname.slice("/media/".length).split("/").map((part) => decodeURIComponent(part)); }
  catch { res.writeHead(400).end(); return true; }
  if (parts.some((part) => !SAFE_NAME.test(part) || part === "." || part === "..")) {
    res.writeHead(400).end();
    return true;
  }
  if (upload) {
    if (parts.length === 2 && parts[0] === "rec" && RECORDING_NAME.test(parts[1])) {
      uploadRecording(req, res, config.recordingsDir, parts[1]).then((saved) => saved && cache.enqueue(parts[1], true));
    } else {
      res.writeHead(400).end();
    }
  } else if (parts.length === 2 && parts[0] === "rec" && RECORDING_NAME.test(parts[1])) {
    cache.enqueue(parts[1], true);
    serveFile(req, res, join(config.recordingsDir, parts[1]));
  } else if (parts.length === 3 && parts[0] === "audio" && /^(\d+\.m4a|thumbs_\d+\.jpg|low\.mp4)$/.test(parts[2])) {
    serveFile(req, res, join(config.cacheDir, parts[1], parts[2]));
  } else {
    res.writeHead(404).end();
  }
  return true;
}
