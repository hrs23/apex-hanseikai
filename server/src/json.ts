import type { IncomingMessage } from "node:http";

export class PayloadTooLarge extends Error {}

export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function readObject(req: IncomingMessage, max: number): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new PayloadTooLarge();
    chunks.push(chunk as Buffer);
  }
  try {
    return asObject(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return null;
  }
}
