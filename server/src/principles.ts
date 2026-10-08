import type { DatabaseSync } from "node:sqlite";
import { NOT_FOUND, type Result } from "./hansei";

const SLOTS = 4;
const BODY_MAX_CHARS = 500;

export const PRINCIPLES_SCHEMA = `
CREATE TABLE IF NOT EXISTS principles (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 3),
  body TEXT NOT NULL
);
`;

export function listPrinciples(db: DatabaseSync): Result {
  const rows = db.prepare("SELECT slot, body FROM principles").all() as { slot: number; body: string }[];
  const bodies = new Map(rows.map((row) => [row.slot, row.body]));
  return { status: 200, body: { principles: Array.from({ length: SLOTS }, (_, slot) => ({ slot, body: bodies.get(slot) ?? "" })) } };
}

export function setPrinciple(db: DatabaseSync, slot: number, payload: Record<string, unknown>): Result {
  if (slot >= SLOTS) return NOT_FOUND;
  const body = typeof payload.body === "string" ? payload.body.trim() : null;
  if (body === null || [...body].length > BODY_MAX_CHARS) {
    return { status: 400, body: { error: "invalid principle", details: [`A principle must be at most ${BODY_MAX_CHARS} characters.`] } };
  }
  db.prepare("INSERT INTO principles (slot, body) VALUES (?, ?) ON CONFLICT(slot) DO UPDATE SET body = excluded.body").run(slot, body);
  return { status: 200, body: { slot, body } };
}
