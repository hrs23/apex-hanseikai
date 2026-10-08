import type { DatabaseSync } from "node:sqlite";
import { RECORDING_NAME } from "./recording";

const BODY_MAX_CHARS = 500;
const COLUMNS = "id, recording, at, body, created_at";

export interface Result {
  status: number;
  body: unknown;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS hansei (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording TEXT NOT NULL,
  at TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hansei_recording ON hansei(recording, at);
`;

const invalid = (detail: string): Result => ({ status: 400, body: { error: "invalid hansei", details: [detail] } });

export function listHansei(db: DatabaseSync, recording: string | null): Result {
  if (recording !== null && !RECORDING_NAME.test(recording)) return invalid("Invalid recording.");
  const rows = recording !== null
    ? db.prepare(`SELECT ${COLUMNS} FROM hansei WHERE recording = ? ORDER BY at IS NULL, at, id`).all(recording)
    : db.prepare(`SELECT ${COLUMNS} FROM hansei ORDER BY recording, at IS NULL, at, id`).all();
  return { status: 200, body: { hansei: rows } };
}

function noteBody(value: unknown): string | null {
  const body = typeof value === "string" ? value.trim() : "";
  return body && [...body].length <= BODY_MAX_CHARS ? body : null;
}

const invalidBody = () => invalid(`A note must be 1 to ${BODY_MAX_CHARS} characters.`);

export function createHansei(db: DatabaseSync, payload: Record<string, unknown>): Result {
  const { recording, at } = payload;
  if (typeof recording !== "string" || !RECORDING_NAME.test(recording)) return invalid("Invalid recording.");
  if (at !== null && (typeof at !== "string" || !Number.isFinite(Date.parse(at)))) return invalid("Invalid time.");
  const body = noteBody(payload.body);
  if (!body) return invalidBody();
  const normalized = at === null ? null : new Date(Math.floor(Date.parse(at as string) / 1000) * 1000).toISOString();
  const row = db
    .prepare(`INSERT INTO hansei (recording, at, body) VALUES (?, ?, ?) RETURNING ${COLUMNS}`)
    .get(recording, normalized, body);
  return { status: 201, body: row };
}

export const NOT_FOUND: Result = { status: 404, body: { error: "not found" } };

export function updateHansei(db: DatabaseSync, id: number, payload: Record<string, unknown>): Result {
  const body = noteBody(payload.body);
  if (!body) return invalidBody();
  const row = db.prepare(`UPDATE hansei SET body = ? WHERE id = ? RETURNING ${COLUMNS}`).get(body, id);
  return row ? { status: 200, body: row } : NOT_FOUND;
}

export function deleteHansei(db: DatabaseSync, id: number): Result {
  const row = db.prepare("DELETE FROM hansei WHERE id = ? RETURNING id, recording").get(id);
  return row ? { status: 200, body: { ...row, deleted: true } } : NOT_FOUND;
}
