import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectEnds } from "./detect";
import { errorText, log } from "./log";
import { MAX_PLAYERS, RECORDING_NAME, audioNames, recordingActive, writing } from "./recording";

export interface Source { size: number; mtimeMs: number }
export interface Metadata {
  v: number;
  source: Source;
  duration?: number;
  startedAt?: string;
  players?: string[];
  tracks?: number;
  matchEnds?: number[];
  thumbs?: { sheets: number; every: number; cols: number; w: number; h: number };
  errors: Record<string, string>;
  retries: Record<string, { attempts: number; after: number }>;
}
interface Config { recordingsDir: string; cacheDir: string }
type Runner = (command: string, args: string[], signal?: AbortSignal) => Promise<string>;
const RETRY_DELAYS_MS = [600_000, 3_600_000, 21_600_000, 21_600_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const SCAN_MS = 10_000;
export type State = "recording" | "processing" | "ready";
export const sameSource = (a: Source | undefined, b: Source) => a?.size === b.size && a.mtimeMs === b.mtimeMs;

export async function readMetadata(dir: string): Promise<Metadata | null> {
  try {
    const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
    return meta.v === 1 && meta.source && meta.errors && meta.retries ? meta : null;
  } catch { return null; }
}

const TIMEOUTS_MS: Record<string, number> = { ffprobe: 120_000, ffmpeg: 3 * 3_600_000 };

export const run: Runner = (command, args, signal) => new Promise((accept, reject) => {
  const child = spawn("nice", ["-n", "10", command, ...args], { stdio: ["ignore", "pipe", "pipe"], timeout: TIMEOUTS_MS[command] ?? 600_000, signal });
  let output = "";
  let error = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { error = (error + data).slice(-2000); });
  child.on("error", reject);
  child.on("close", (code, signal) => code === 0 ? accept(output) : reject(new Error(signal ? `${command} killed by ${signal} (timeout)` : error.trim() || `${command} exited ${code}`)));
});

export class DerivedCache {
  private queue: string[] = [];
  private pending = new Set<string>();
  private running: Promise<void> | null = null;
  private timer?: NodeJS.Timeout;
  private probes = new Map<string, Promise<Metadata | null>>();
  private settled = new Set<string>();
  private names = "";
  constructor(private config: Config, private execute: Runner = run, private now = Date.now, private changed = () => {}) {}

  async scan(): Promise<void> {
    const names = (await readdir(this.config.recordingsDir).catch(() => [])).filter((name) => RECORDING_NAME.test(name)).sort().reverse();
    if (names.join() !== this.names) {
      this.names = names.join();
      this.changed();
    }
    for (const name of names) if (!this.settled.has(name)) this.enqueue(name);
  }
  start(): void {
    const scan = () => { void this.scan().catch((error) => log("derived_scan_failed", { error: errorText(error) })); };
    scan();
    this.timer = setInterval(scan, SCAN_MS);
    this.timer.unref();
  }
  stop(): void { clearInterval(this.timer); }
  private recording(): Promise<boolean> { return recordingActive(this.config.recordingsDir, this.now(), this.settled); }
  writing(name: string, source: Source): Promise<boolean> { return writing(join(this.config.recordingsDir, name), source.mtimeMs, this.now()); }
  enqueue(name: string, priority = false): void {
    if (!RECORDING_NAME.test(name)) return;
    if (this.pending.has(name)) {
      if (priority && this.queue.includes(name)) this.queue = [name, ...this.queue.filter((item) => item !== name)];
      return;
    }
    this.pending.add(name);
    if (priority) this.queue.unshift(name); else this.queue.push(name);
    this.running ??= this.drain().finally(() => { this.running = null; });
  }
  async idle(): Promise<void> { await this.running; }
  private async drain(): Promise<void> {
    while (this.queue.length) {
      const name = this.queue.shift()!;
      try { if (!(await this.recording())) await this.generate(name); }
      catch (error) { log("derived_failed", { name, error: errorText(error) }); }
      finally { this.pending.delete(name); }
    }
  }
  async metadata(name: string): Promise<Metadata | null> {
    if (!RECORDING_NAME.test(name)) return null;
    const previous = this.probes.get(name);
    if (previous) return previous;
    const promise = this.probe(name).finally(() => { this.probes.delete(name); });
    this.probes.set(name, promise);
    return promise;
  }
  private async save(name: string, meta: Metadata): Promise<boolean> {
    const source = await stat(join(this.config.recordingsDir, name));
    if (!sameSource(meta.source, source)) return false;
    const dir = join(this.config.cacheDir, name.slice(0, -4));
    await mkdir(dir, { recursive: true });
    const tempDir = await mkdtemp(join(dir, ".meta-"));
    try {
      const temp = join(tempDir, "meta.json");
      await writeFile(temp, JSON.stringify(meta));
      if (!sameSource(meta.source, await stat(join(this.config.recordingsDir, name)))) return false;
      await rename(temp, join(dir, "meta.json"));
      return true;
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  }
  private async probe(name: string): Promise<Metadata | null> {
    const file = join(this.config.recordingsDir, name);
    const source = await stat(file);
    if (!source.isFile() || await this.writing(name, source)) return null;
    const dir = join(this.config.cacheDir, name.slice(0, -4));
    const previous = await readMetadata(dir);
    const kept: Partial<Metadata> = sameSource(previous?.source, source) ? previous! : {};
    if (kept.duration !== undefined && kept.players) return previous;
    let info;
    try { info = JSON.parse(await this.execute("ffprobe", ["-v", "error", "-show_entries", "format=duration:format_tags=creation_time:stream=codec_type", "-of", "json", file])); }
    catch { info = {}; }
    const duration = Number(info.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      this.settled.add(name);
      return null;
    }
    const names = await audioNames(file).catch(() => []);
    const voices = info.streams.filter((stream: { codec_type: string }) => stream.codec_type === "audio").length - 1;
    const players = Array.from({ length: Math.min(Math.max(voices, 0), MAX_PLAYERS) }, (_, index) => names[index + 1] || `Player ${index + 1}`);
    const created = Date.parse(info.format.tags?.creation_time);
    const startedAt = Number.isFinite(created) ? new Date(created).toISOString() : undefined;
    const meta: Metadata = { errors: {}, retries: {}, ...kept, v: 1, source: { size: source.size, mtimeMs: source.mtimeMs }, duration, startedAt, players };
    return await this.save(name, meta) ? meta : null;
  }
  private async stage(name: string, meta: Metadata, key: string, action: (temp: string, signal: AbortSignal) => Promise<Partial<Metadata>>): Promise<void> {
    const retry = meta.retries[key];
    if (retry && (retry.attempts >= MAX_ATTEMPTS || this.now() < retry.after)) return;
    if (await this.recording()) return;
    this.changed();
    const dir = join(this.config.cacheDir, name.slice(0, -4));
    const temp = await mkdtemp(join(dir, ".generate-"));
    const began = Date.now();
    const controller = new AbortController();
    const watch = setInterval(() => { void this.recording().then((active) => { if (active) controller.abort(); }); }, 15_000);
    try {
      const result = await action(temp, controller.signal);
      if (!sameSource(meta.source, await stat(join(this.config.recordingsDir, name))) || await this.recording()) return;
      for (const file of await readdir(temp)) await rename(join(temp, file), join(dir, file));
      Object.assign(meta, result);
      delete meta.errors[key];
      delete meta.retries[key];
      log("derived_stage", { name, key, ms: Date.now() - began });
    } catch (error) {
      if (controller.signal.aborted) return log("derived_stage_aborted", { name, key, ms: Date.now() - began });
      const attempts = (retry?.attempts ?? 0) + 1;
      log("derived_stage_failed", { name, key, attempts, error: errorText(error) });
      meta.errors[key] = error instanceof Error ? error.message : String(error);
      meta.retries[key] = { attempts, after: this.now() + (RETRY_DELAYS_MS[attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!) };
    } finally {
      clearInterval(watch);
      await rm(temp, { recursive: true, force: true });
      await this.save(name, meta);
      this.changed();
    }
  }
  private todo(meta: Metadata): Record<string, boolean> {
    return { audio: meta.tracks === undefined, markers: meta.tracks !== undefined && meta.matchEnds === undefined, thumbs: !meta.thumbs };
  }
  state(meta: Metadata | null, writing: boolean): State {
    if (writing) return "recording";
    if (!meta) return "ready";
    return Object.entries(this.todo(meta)).some(([key, missing]) => missing && (meta.retries[key]?.attempts ?? 0) < MAX_ATTEMPTS) ? "processing" : "ready";
  }
  private async generate(name: string): Promise<void> {
    const meta = await this.metadata(name);
    if (!meta) return;
    const file = join(this.config.recordingsDir, name);
    if (this.todo(meta).audio) await this.stage(name, meta, "audio", async (temp, signal) => {
      const info = JSON.parse(await this.execute("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", file], signal));
      const count = info.streams.length;
      if (count > 1) {
        const args = ["-nostdin", "-y", "-v", "error", "-i", file];
        for (let n = 1; n < count; n++) args.push("-map", `0:a:${n}`, "-c", "copy", "-movflags", "+faststart", join(temp, `${n}.m4a`));
        await this.execute("ffmpeg", args, signal);
      }
      return { tracks: count };
    });
    if (this.todo(meta).markers) await this.stage(name, meta, "markers", async (_, signal) => ({ matchEnds: await detectEnds((c, a) => this.execute(c, a, signal), file, meta.tracks! > 1) }));
    if (this.todo(meta).thumbs) await this.stage(name, meta, "thumbs", async (temp, signal) => {
      await this.execute("ffmpeg", ["-nostdin", "-y", "-v", "error", "-skip_frame", "nokey", "-i", file, "-an", "-vf", "fps=1/10,scale=240:135:flags=area,tile=10x10", "-q:v", "6", "-start_number", "0", join(temp, "thumbs_%d.jpg")], signal);
      const sheets = (await readdir(temp)).length;
      if (!sheets) throw new Error("no thumbnails");
      return { thumbs: { sheets, every: 10, cols: 10, w: 240, h: 135 } };
    });
    if (!Object.values(this.todo(meta)).some(Boolean)) this.settled.add(name);
  }
}
