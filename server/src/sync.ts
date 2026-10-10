import type { IncomingMessage, ServerResponse } from "node:http";
import { readObject } from "./json";
import { clientIp, log } from "./log";
import { MAX_PLAYERS, RECORDING_NAME } from "./recording";

const CLIENT_ID = /^[\w-]{1,40}$/;
const EVENT_MAX_BYTES = 1024;
const PING_MS = 20_000;
const ACTION_MAX_CHARS = 40;
const EMPTY_ROOM_MS = 30_000;
const COLORS = 6;

interface PlaybackState {
  recording: string;
  playing: boolean;
  position: number;
  rate: number;
  view: number;
  at: number;
  from: string;
  seq: number;
}

interface Client {
  res: ServerResponse;
  color?: number;
  active: boolean;
  typing: boolean;
}

interface Room {
  clients: Map<string, Client>;
  state: PlaybackState | null;
}

let sequence = 0;
const clientSequences = new Map<string, number>();

const room: Room = { clients: new Map(), state: null };
let emptyTimer: NodeJS.Timeout | undefined;

function expireWhenEmpty(): void {
  clearTimeout(emptyTimer);
  if (viewers()) return;
  emptyTimer = setTimeout(() => {
    if (viewers()) return;
    room.state = null;
    clientSequences.clear();
  }, EMPTY_ROOM_MS);
  emptyTimer.unref();
}

function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event: string, data: unknown, except?: string): void {
  for (const [id, { res }] of room.clients) if (id !== except) send(res, event, data);
}

export function notifyHansei(recording: string): void {
  broadcast("hansei", { recording });
}

export function notifyRecordings(): void {
  broadcast("recordings", {});
}

function viewers(typing = false): number {
  let count = 0;
  for (const client of room.clients.values()) if (client.active && (!typing || client.typing)) count++;
  return count;
}

function announceViewers(): void {
  broadcast("viewers", { count: viewers(), typing: viewers(true) });
  expireWhenEmpty();
}

function current(state: PlaybackState): PlaybackState {
  if (!state.playing) return state;
  return { ...state, position: state.position + ((Date.now() - state.at) / 1000) * state.rate, at: Date.now() };
}

function sendSnapshot(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ state: room.state ? current(room.state) : null, serverTime: Date.now() }));
}

function stream(req: IncomingMessage, res: ServerResponse, client: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  room.clients.get(client)?.res.end();
  room.clients.set(client, { res, active: false, typing: false });
  send(res, "state", room.state ? current(room.state) : null);
  log("sync_connect", { client: client.slice(0, 8), clients: room.clients.size, ip: clientIp(req) });
  announceViewers();
  const timer = setInterval(() => send(res, "ping", {}), PING_MS);
  res.on("error", () => {});
  req.on("close", () => {
    clearInterval(timer);
    if (room.clients.get(client)?.res === res) room.clients.delete(client);
    log("sync_disconnect", { client: client.slice(0, 8), clients: room.clients.size });
    announceViewers();
  });
}

const readBody = (req: IncomingMessage) => readObject(req, EVENT_MAX_BYTES).catch(() => null);

async function presence(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const entry = typeof body?.client === "string" ? room.clients.get(body.client) : undefined;
  if (!entry || typeof body?.active !== "boolean") {
    res.writeHead(400).end();
    return;
  }
  entry.active = body.active;
  entry.typing = body.typing === true;
  if (entry.color === undefined) {
    const used = new Set([...room.clients.values()].map((other) => other.color));
    let color = (Number(body.color) >>> 0) % COLORS;
    for (let tries = 1; tries < COLORS && used.has(color); tries++) color = (color + 1) % COLORS;
    entry.color = color;
    send(entry.res, "color", { color });
  }
  announceViewers();
  res.writeHead(204).end();
}

async function update(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const { recording, client, playing, position, rate, view, clientSeq, sentAt, action } = body ?? {};
  if (
    typeof recording !== "string" || !RECORDING_NAME.test(recording) ||
    typeof client !== "string" || !CLIENT_ID.test(client) ||
    typeof playing !== "boolean" ||
    typeof position !== "number" || !Number.isFinite(position) || position < 0 ||
    typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 4 ||
    typeof view !== "number" || !Number.isInteger(view) || view < 0 || view > MAX_PLAYERS ||
    typeof clientSeq !== "number" || !Number.isSafeInteger(clientSeq) || clientSeq < 1 ||
    typeof sentAt !== "number" || !Number.isFinite(sentAt)
  ) {
    res.writeHead(400).end();
    return;
  }
  if (clientSeq > (clientSequences.get(client) ?? 0)) {
    clientSequences.set(client, clientSeq);
    log("sync_state", { client: client.slice(0, 8), recording, playing, position: Math.round(position * 10) / 10, rate, view, action, viewers: room.clients.size });
    room.state = { recording, playing, position, rate, view, at: Math.min(Date.now(), Math.max(Date.now() - 5000, sentAt)), from: client, seq: ++sequence };
    broadcast("state", typeof action === "string" ? { ...room.state, action: action.slice(0, ACTION_MAX_CHARS) } : room.state, client);
    expireWhenEmpty();
  }
  sendSnapshot(res);
}

async function draw(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const { client, recording, stroke, points } = body ?? {};
  if (
    typeof client !== "string" || !room.clients.has(client) ||
    typeof recording !== "string" || !RECORDING_NAME.test(recording) ||
    typeof stroke !== "number" || !Number.isSafeInteger(stroke) ||
    !Array.isArray(points) || points.length % 2 !== 0 ||
    !points.every((value) => typeof value === "number" && value >= 0 && value <= 1)
  ) {
    res.writeHead(400).end();
    return;
  }
  broadcast("draw", { recording, from: client, stroke, points, color: room.clients.get(client)!.color ?? 0 }, client);
  res.writeHead(204).end();
}

export function handleSync(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/sync/")) return false;
  if (url.pathname === "/sync/state" && req.method === "GET") {
    sendSnapshot(res);
  } else if (url.pathname === "/sync/stream" && req.method === "GET") {
    const client = url.searchParams.get("client") ?? "";
    if (!CLIENT_ID.test(client)) res.writeHead(400).end();
    else stream(req, res, client);
  } else if (url.pathname === "/sync/event" && req.method === "POST") {
    update(req, res).catch(() => res.destroy());
  } else if (url.pathname === "/sync/presence" && req.method === "POST") {
    presence(req, res).catch(() => res.destroy());
  } else if (url.pathname === "/sync/draw" && req.method === "POST") {
    draw(req, res).catch(() => res.destroy());
  } else {
    res.writeHead(404).end();
  }
  return true;
}
