import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { startServer } from "./harness.mjs";

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

test("serves the OpenAPI spec and the Swagger UI page", async () => {
  const spec = await (await fetch(`${server.base}/openapi.json`)).json();
  assert.equal(spec.openapi, "3.0.3");
  assert.deepEqual(Object.keys(spec.paths).sort(), [
    "/api/config", "/api/hansei", "/api/hansei/{id}", "/api/health", "/api/log", "/api/principles", "/api/principles/{slot}", "/api/recordings",
    "/media/audio/{recording}/{file}", "/media/rec/{name}", "/sync/draw", "/sync/event", "/sync/presence", "/sync/state", "/sync/stream",
  ]);
  const page = await fetch(`${server.base}/docs`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SwaggerUIBundle/);
  for (const asset of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
    const response = await fetch(`${server.base}/docs/${asset}`);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 10_000);
  }
});

test("serves llms.txt", async () => {
  const response = await fetch(`${server.base}/llms.txt`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^# Apex Hanseikai/);
});

test("the documented GET endpoints answer", async () => {
  const spec = JSON.parse(readFileSync("openapi.json", "utf8"));
  for (const path of ["/api/health", "/api/config", "/api/hansei", "/api/principles", "/api/recordings", "/sync/state"]) {
    assert.ok(spec.paths[path].get, `${path} is documented`);
    assert.equal((await fetch(`${server.base}${path}`)).status, 200, path);
  }
  assert.equal((await fetch(`${server.base}/api/hansei/999`, { method: "DELETE" })).status, 404);
  assert.equal((await fetch(`${server.base}/media/rec/2026-01-01%2000-00-00.mp4`)).status, 404);
  assert.equal((await fetch(`${server.base}/sync/stream?client=bad%20id`)).status, 400);
});
