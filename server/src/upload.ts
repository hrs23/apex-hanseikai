import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { link, readdir, stat, unlink, utimes } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errorText, log } from "./log";
import { RECORDING_NAME, recordingStart } from "./recording";

const MAX_BYTES = 20 * 1024 ** 3;
const TEMP_PREFIX = ".upload-";
const STALE_MS = 3_600_000;

class Rejected extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function uploadRecording(req: IncomingMessage, res: ServerResponse, dir: string, name: string): Promise<boolean> {
  const size = Number(req.headers["content-length"]);
  const final = join(dir, name);
  const began = Date.now();
  const temp = join(dir, `${TEMP_PREFIX}${randomUUID()}`);
  try {
    if (!Number.isSafeInteger(size) || size < 12) throw new Rejected(411, "content-length required");
    if (size > MAX_BYTES) throw new Rejected(413, "file too large");
    if (existsSync(final)) throw new Rejected(409, "recording already exists");
    let received = 0;
    const check = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (received === 0 && chunk.toString("latin1", 4, 8) !== "ftyp") return done(new Rejected(415, "not an mp4 file"));
        received += chunk.length;
        done(received > size ? new Rejected(400, "body longer than content-length") : null, chunk);
      },
    });
    await pipeline(req, check, createWriteStream(temp, { flags: "wx" }));
    if (received !== size) throw new Rejected(400, "incomplete upload");
    try {
      await link(temp, final);
    } catch (error) {
      throw (error as NodeJS.ErrnoException).code === "EEXIST" ? new Rejected(409, "recording already exists") : error;
    }
    const start = recordingStart(RECORDING_NAME.exec(name)!);
    await utimes(final, start, start);
    log("upload_done", { name, bytes: size, ms: Date.now() - began });
    res.writeHead(201, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ name }));
    return true;
  } catch (error) {
    const status = error instanceof Rejected ? error.status : 500;
    log("upload_failed", { name, status, bytes: size, error: status === 500 ? errorText(error) : (error as Error).message });
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(status, { "Content-Type": "application/json", Connection: "close" }).end(JSON.stringify({ error: error instanceof Rejected ? error.message : "upload failed" }));
    }
    return false;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

export async function removeStaleUploads(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => []);
  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const file = join(dir, name);
    const info = await stat(file).catch(() => null);
    if (info && Date.now() - info.mtimeMs > STALE_MS) await unlink(file).catch(() => {});
  }
}
