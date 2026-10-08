import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { startServer } from "./harness.mjs";

let server;
let base;
before(async () => {
  server = await startServer({ APP_REVISION: "abc123" });
  base = server.base;
});
after(() => server.stop());

const send = async (method, path, body) => {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, headers: response.headers, text };
};

const list = async (query) => (await send("GET", `/api/hansei${query}`)).json.hansei;

test("health", async () => {
  const response = await send("GET", "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true, revision: "abc123" });
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await send("POST", "/api/health", {})).status, 405);
});

test("health returns 503 when the hansei table is missing", async () => {
  const broken = await startServer();
  try {
    const db = new DatabaseSync(join(broken.dir, "x.db"));
    db.exec("DROP TABLE hansei");
    db.close();
    const direct = await fetch(`${broken.base}/api/health`);
    assert.equal(direct.status, 503);
    assert.deepEqual(await direct.json(), { ok: false });
  } finally {
    broken.stop();
  }
});

test("adds hansei, lists them by time (untimed last) and deletes one", async () => {
  const recording = "2026-10-03 13-00-00.mp4";
  const query = `?recording=${encodeURIComponent(recording)}`;
  const late = await send("POST", "/api/hansei", { recording, at: "2026-10-03T14:00:00.789+09:00", body: "  遅い  " });
  assert.equal(late.status, 201);
  assert.equal(late.json.recording, recording);
  assert.equal(late.json.at, "2026-10-03T05:00:00.000Z");
  assert.equal(late.json.body, "遅い");
  assert.ok(late.json.created_at);
  await send("POST", "/api/hansei", { recording, at: null, body: "時間なし\n2行目" });
  await send("POST", "/api/hansei", { recording, at: "2026-10-03T04:30:00Z", body: "早い" });
  assert.deepEqual((await list(query)).map((hansei) => hansei.body), ["早い", "遅い", "時間なし\n2行目"]);
  const edited = await send("PUT", `/api/hansei/${late.json.id}`, { body: " 遅い（直した） " });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.body, "遅い（直した）");
  assert.equal(edited.json.at, late.json.at);
  assert.equal((await send("PUT", `/api/hansei/${late.json.id}`, { body: "" })).status, 400);
  assert.equal((await send("PUT", "/api/hansei/999999", { body: "x" })).status, 404);
  assert.deepEqual(await send("DELETE", `/api/hansei/${late.json.id}`).then((r) => r.json), { id: late.json.id, recording, deleted: true });
  assert.equal((await list(query)).length, 2);
  const again = await send("DELETE", `/api/hansei/${late.json.id}`);
  assert.equal(again.status, 404);
  assert.deepEqual(again.json, { error: "not found" });
});

test("keeps recordings from the same day separate and lists everything by recording", async () => {
  const first = "2026-12-04 21-00-00.mp4";
  const second = "2026-12-04 22-00-00.mp4";
  for (const recording of [second, first]) assert.equal((await send("POST", "/api/hansei", { recording, at: null, body: recording })).status, 201);
  assert.deepEqual((await list(`?recording=${encodeURIComponent(first)}`)).map((row) => row.recording), [first]);
  const all = (await list("")).filter((hansei) => hansei.recording.startsWith("2026-12-04"));
  assert.deepEqual(all.map((hansei) => hansei.body), [first, second]);
});

test("rejects invalid hansei", async () => {
  const recording = "2026-12-01 21-00-00.mp4";
  const valid = { recording, at: null, body: "ok" };
  const cases = [
    [{ ...valid, recording: "../file.mp4" }, "Invalid recording."],
    [{ at: null, body: "no recording" }, "Invalid recording."],
    [{ ...valid, at: "not a date" }, "Invalid time."],
    [{ ...valid, at: 5 }, "Invalid time."],
    [{ recording, body: "no at field" }, "Invalid time."],
    [{ ...valid, body: "" }, "A note must be 1 to 500 characters."],
    [{ ...valid, body: "あ".repeat(501) }, "A note must be 1 to 500 characters."],
  ];
  for (const [bad, detail] of cases) {
    const response = await send("POST", "/api/hansei", bad);
    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: "invalid hansei", details: [detail] });
  }
  const badRecording = await send("GET", "/api/hansei?recording=bad");
  assert.equal(badRecording.status, 400);
  assert.deepEqual(badRecording.json, { error: "invalid hansei", details: ["Invalid recording."] });
  assert.deepEqual(await list(`?recording=${encodeURIComponent(recording)}`), []);
});

test("rejects non-json and non-object bodies", async () => {
  for (const [type, body] of [["text/plain", "{}"], ["application/json", "nope"], ["application/json", "[]"]]) {
    const response = await fetch(`${base}/api/hansei`, { method: "POST", headers: { "Content-Type": type }, body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid hansei" });
  }
});

test("rejects oversized bodies and wrong methods", async () => {
  const big = await fetch(`${base}/api/hansei`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(128 * 1024 + 1),
  });
  assert.equal(big.status, 413);
  assert.deepEqual(await big.json(), { error: "request too large" });
  assert.equal((await send("PUT", "/api/hansei", {})).status, 405);
  assert.equal((await send("GET", "/api/hansei/1")).status, 405);
  assert.equal((await send("GET", "/api/nothing")).status, 404);
});

test("HEAD behaves like GET", async () => {
  const response = await fetch(`${base}/api/hansei`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("serves static files, cache headers and the SPA fallback", async () => {
  const index = await send("GET", "/");
  assert.equal(index.status, 200);
  assert.equal(index.headers.get("cache-control"), "no-cache");
  assert.match(index.text, /<div id="root">/);
  const fallback = await send("GET", "/unknown-route");
  assert.equal(fallback.status, 200);
  assert.match(fallback.text, /<div id="root">/);
  const asset = await send("GET", "/assets/index-abcd1234.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.equal(asset.headers.get("referrer-policy"), "no-referrer");
  assert.equal((await send("POST", "/", {})).status, 405);
});
