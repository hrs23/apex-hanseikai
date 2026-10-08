import { readFileSync } from "node:fs";
import type { Result } from "./hansei";
import { asObject } from "./json";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function siteConfig(file: string): Result {
  let raw: Record<string, unknown> = {};
  try { raw = asObject(JSON.parse(readFileSync(file, "utf8"))) ?? {}; } catch {}
  return {
    status: 200,
    body: {
      title: text(raw.title) || "反省会",
    },
  };
}
