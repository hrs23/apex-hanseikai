import { readObject } from "./json";
import type { IncomingMessage } from "node:http";
import type { Result } from "./hansei";

const CLIENT_LOG_MAX_BYTES = 8 * 1024;
const FIELD_MAX_CHARS = 2000;
const CLIENT_LOGS_PER_MINUTE = 60;

export const errorText = (error: unknown): string => (error instanceof Error ? error.stack ?? error.message : String(error));

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

let windowStart = 0;
let windowCount = 0;

export async function clientLog(req: IncomingMessage, ip: string | undefined): Promise<Result> {
  const body = await readObject(req, CLIENT_LOG_MAX_BYTES).catch(() => null);
  if (!body) return { status: 400, body: { error: "invalid log" } };
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  if (++windowCount > CLIENT_LOGS_PER_MINUTE) return { status: 429, body: { error: "too many logs" } };
  const fields: Record<string, string> = {};
  for (const key of ["kind", "message", "stack", "url", "detail"]) {
    const value = body[key];
    if (typeof value === "string") fields[key] = value.slice(0, FIELD_MAX_CHARS);
  }
  log("client_error", { ip, ua: String(req.headers["user-agent"] ?? "").slice(0, 200), ...fields });
  return { status: 200, body: { ok: true } };
}
