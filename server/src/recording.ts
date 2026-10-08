import { open, readdir, stat, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

export const RECORDING_NAME = /^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{2})\.mp4$/;
const QUIET_MS = 30_000;
export const MAX_PLAYERS = 4;

async function* boxes(handle: FileHandle, total: number): AsyncGenerator<{ type: string; offset: number; size: number }> {
  const head = Buffer.alloc(16);
  for (let offset = 0, size = 0; offset < total; offset += size) {
    if ((await handle.read(head, 0, 16, offset)).bytesRead < 8) return;
    size = head.readUInt32BE(0) === 1 ? Number(head.readBigUInt64BE(8)) : head.readUInt32BE(0);
    if (size < 8) return;
    yield { type: head.toString("latin1", 4, 8), offset, size };
  }
}

export async function complete(file: string): Promise<boolean> {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return false;
  try {
    const total = (await handle.stat()).size;
    let moov = false;
    let end = 0;
    for await (const { type, offset, size } of boxes(handle, total)) {
      if (type === "moof") return false;
      moov ||= type === "moov";
      end = offset + size;
    }
    return moov && end === total;
  } finally { await handle.close(); }
}

function children(box: Buffer): [string, Buffer][] {
  const found: [string, Buffer][] = [];
  for (let offset = 0, size = 0; offset + 8 <= box.length; offset += size) {
    size = box.readUInt32BE(offset);
    if (size < 8 || offset + size > box.length) break;
    found.push([box.toString("latin1", offset + 4, offset + 8), box.subarray(offset + 8, offset + size)]);
  }
  return found;
}
const child = (box: Buffer | undefined, type: string) => box && children(box).find(([name]) => name === type)?.[1];

export async function audioNames(file: string): Promise<string[]> {
  const handle = await open(file, "r");
  try {
    for await (const { type, offset, size } of boxes(handle, (await handle.stat()).size)) {
      if (type !== "moov") continue;
      const moov = Buffer.alloc(size - 8);
      await handle.read(moov, 0, moov.length, offset + 8);
      return children(moov)
        .filter(([name, trak]) => name === "trak" && child(child(trak, "mdia"), "hdlr")?.toString("latin1", 8, 12) === "soun")
        .map(([, trak]) => child(child(trak, "udta"), "name")?.toString("utf8").trim() ?? "");
    }
    return [];
  } finally { await handle.close(); }
}

export const writing = async (file: string, mtimeMs: number, now: number): Promise<boolean> => now - mtimeMs < QUIET_MS && !(await complete(file));

export async function recordingActive(dir: string, now = Date.now(), settled = new Set<string>()): Promise<boolean> {
  let names: string[];
  try { names = await readdir(dir); } catch { return false; }
  for (const name of names) {
    if (!RECORDING_NAME.test(name) || settled.has(name)) continue;
    try { if (await writing(join(dir, name), (await stat(join(dir, name))).mtimeMs, now)) return true; } catch {}
  }
  return false;
}

export function recordingStart(match: RegExpExecArray): Date {
  const [year, month, day] = match[1].split("-").map(Number);
  return new Date(year, month - 1, day, Number(match[2]), Number(match[3]), Number(match[4]));
}
