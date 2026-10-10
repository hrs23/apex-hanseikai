import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serveAsset } from "./assets";
import { SCHEMA, createHansei, deleteHansei, listHansei, updateHansei, type Result } from "./hansei";
import { DerivedCache } from "./derived";
import { docsHandler } from "./docs";
import { handleMedia, listRecordings } from "./media";
import { removeStaleUploads } from "./upload";
import { PayloadTooLarge, readObject } from "./json";
import { PRINCIPLES_SCHEMA, listPrinciples, setPrinciple } from "./principles";
import { siteConfig } from "./site";
import { clientIp, clientLog, errorText, log } from "./log";
import { handleSync, notifyHansei, notifyRecordings } from "./sync";

const REQUEST_MAX_BYTES = 128 * 1024;

const configFile = resolve(process.env.CONFIG_FILE ?? "./config.json");
const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  dbPath: resolve(process.env.DB_PATH ?? "./data/apex.db"),
  webDist: resolve(process.env.WEB_DIST ?? "../web/dist"),
  revision: process.env.APP_REVISION ?? "development",
  swaggerUi: resolve(process.env.SWAGGER_UI_DIR ?? "./node_modules/swagger-ui-dist"),
  configFile,
  media: {
    recordingsDir: resolve(process.env.RECORDINGS_DIR ?? "./recordings"),
    cacheDir: resolve(process.env.CACHE_DIR ?? "./cache"),
  },
};

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");
db.exec(SCHEMA);
db.exec(PRINCIPLES_SCHEMA);

const isJson = (req: IncomingMessage) => /^application\/([\w.+-]+\+)?json$/.test(String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase());

function health(): Result {
  try {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hansei'").get()) return { status: 200, body: { ok: true, revision: config.revision } };
  } catch {}
  return { status: 503, body: { ok: false } };
}

const NOT_ALLOWED: Result = { status: 405, body: null };

async function api(req: IncomingMessage, url: URL): Promise<Result | null> {
  const method = req.method === "HEAD" ? "GET" : (req.method ?? "GET");
  const path = url.pathname;
  let match: RegExpMatchArray | null;
  if (path === "/api/health") return method === "GET" ? health() : NOT_ALLOWED;
  if (path === "/api/config") return method === "GET" ? siteConfig(config.configFile) : NOT_ALLOWED;
  if (path === "/api/recordings") {
    if (method !== "GET") return NOT_ALLOWED;
    const day = url.searchParams.get("day") ?? undefined;
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { status: 400, body: { error: "invalid day" } };
    return { status: 200, body: { recordings: await listRecordings(config.media, derived, day) } };
  }
  if (path === "/api/derived") {
    if (method !== "POST") return NOT_ALLOWED;
    return jsonBody(req, ({ recording, stage }) => derived.request(recording, stage) ? { status: 202, body: { recording, stage } } : { status: 400, body: { error: "invalid request" } }, "request");
  }
  if (path === "/api/log") return method === "POST" ? clientLog(req, clientIp(req)) : NOT_ALLOWED;
  if (path === "/api/principles") return method === "GET" ? listPrinciples(db) : NOT_ALLOWED;
  if ((match = path.match(/^\/api\/principles\/(\d+)$/))) {
    const slot = Number(match[1]);
    if (method !== "PUT") return NOT_ALLOWED;
    return principleSaved(await jsonBody(req, (payload) => setPrinciple(db, slot, payload), "principle"), slot);
  }
  if (path === "/api/hansei") {
    if (method === "GET") return listHansei(db, url.searchParams.get("recording"));
    if (method !== "POST") return NOT_ALLOWED;
    return changed(await jsonBody(req, (payload) => createHansei(db, payload)), "create");
  }
  if ((match = path.match(/^\/api\/hansei\/(\d+)$/))) {
    const id = Number(match[1]);
    if (method === "DELETE") return changed(deleteHansei(db, id), "delete");
    if (method === "PUT") return changed(await jsonBody(req, (payload) => updateHansei(db, id, payload)), "update");
    return NOT_ALLOWED;
  }
  return null;
}

async function jsonBody(req: IncomingMessage, action: (payload: Record<string, unknown>) => Result, name = "hansei"): Promise<Result> {
  const payload = isJson(req) ? await readObject(req, REQUEST_MAX_BYTES) : null;
  return payload ? action(payload) : { status: 400, body: { error: `invalid ${name}` } };
}

function principleSaved(result: Result, slot: number): Result {
  if (result.status < 300) log("principles", { slot });
  return result;
}

function changed(result: Result, op: string): Result {
  if (result.status < 300) {
    const { recording, id } = result.body as { recording: string; id: number };
    log("hansei", { op, id, recording });
    notifyHansei(recording);
  }
  return result;
}

function reply(req: IncomingMessage, res: ServerResponse, status: number, headers: Record<string, string>, body?: string | Buffer) {
  res.writeHead(status, {
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    ...headers,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const readOnly = method === "GET" || method === "HEAD";
  const json = (result: Result) => {
    if (result.status >= 400) log("http_error", { method, url: req.url, status: result.status });
    if (result.body === null) return reply(req, res, result.status, { "Content-Type": "text/plain" }, "Method Not Allowed");
    reply(req, res, result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }, JSON.stringify(result.body));
  };
  try {
    if (!readOnly && Number(req.headers["content-length"] ?? 0) > REQUEST_MAX_BYTES) throw new PayloadTooLarge();
    const url = new URL(req.url ?? "/", "http://localhost");
    const result = await api(req, url);
    if (result) return json(result);
    if (url.pathname.startsWith("/api/")) {
      return reply(req, res, 404, { "Content-Type": "text/plain", "Cache-Control": "no-store" }, "Not Found\n");
    }
    if (!readOnly) return reply(req, res, 405, { "Content-Type": "text/plain" }, "Method Not Allowed");
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return reply(req, res, 400, { "Content-Type": "text/plain" }, "Bad Request");
    }
    const asset = await serveAsset(config.webDist, path);
    if (!asset) return reply(req, res, 404, { "Content-Type": "text/plain" }, "Not Found");
    const headers: Record<string, string> = { "Content-Type": asset.type, "Content-Length": String(asset.body.length) };
    if (asset.cache) headers["Cache-Control"] = asset.cache;
    reply(req, res, 200, headers, asset.body);
  } catch (error) {
    if (error instanceof PayloadTooLarge) {
      res.shouldKeepAlive = false;
      return json({ status: 413, body: { error: "request too large" } });
    }
    log("request_failed", { method, url: req.url, error: errorText(error) });
    json({ status: 500, body: { error: "internal error" } });
  }
}

const derived = new DerivedCache(config.media, undefined, undefined, notifyRecordings);
derived.start();
void removeStaleUploads(config.media.recordingsDir);
const docs = docsHandler(config.swaggerUi);

const server = createServer((req, res) => {
  if (handleMedia(req, res, config.media, derived) || handleSync(req, res) || docs(req, res)) return;
  handle(req, res).catch((error) => {
    log("response_failed", { url: req.url, error: errorText(error) });
    res.destroy();
  });
});

server.requestTimeout = 0;
server.listen(config.port, config.host, () => {
  log("listening", { host: config.host, port: config.port, db: config.dbPath, revision: config.revision });
});

function shutdown(signal: string): void {
  log("shutdown", { signal });
  derived.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("uncaughtException", (error) => {
  log("uncaught_exception", { error: errorText(error) });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => log("unhandled_rejection", { error: errorText(reason) }));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
