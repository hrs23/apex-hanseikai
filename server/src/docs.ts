import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import openapi from "../openapi.json";
import llms from "../llms.txt";

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>API</title>
<link rel="stylesheet" href="/docs/swagger-ui.css"></head>
<body><div id="ui"></div><script src="/docs/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui", docExpansion: "list" });</script></body></html>`;

const FILES: Record<string, string> = {
  "/docs/swagger-ui.css": "text/css; charset=utf-8",
  "/docs/swagger-ui-bundle.js": "text/javascript; charset=utf-8",
};

export function docsHandler(uiDir: string) {
  const spec = JSON.stringify(openapi);
  const files = new Map(Object.keys(FILES).map((path) => [path, readFileSync(join(uiDir, path.slice("/docs/".length)))]));
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const send = (type: string, body: string | Buffer) => {
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", "Content-Length": Buffer.byteLength(body) });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    if (path === "/openapi.json") send("application/json", spec);
    else if (path === "/llms.txt") send("text/plain; charset=utf-8", llms);
    else if (path === "/docs" || path === "/docs/") send("text/html; charset=utf-8", PAGE);
    else if (files.has(path)) send(FILES[path], files.get(path)!);
    else return false;
    return true;
  };
}
