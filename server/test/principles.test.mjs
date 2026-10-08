import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./harness.mjs";

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const send = async (method, path, body) => {
  const response = await fetch(server.base + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

test("always lists four slots and saves each one", async () => {
  assert.deepEqual((await send("GET", "/api/principles")).json.principles, [0, 1, 2, 3].map((slot) => ({ slot, body: "" })));
  const saved = await send("PUT", "/api/principles/2", { body: "  # Bo\n**回復は遮蔽の中で**\n- 声かけ  " });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json, { slot: 2, body: "# Bo\n**回復は遮蔽の中で**\n- 声かけ" });
  await send("PUT", "/api/principles/2", { body: "# Bo\n- 変更後" });
  assert.deepEqual((await send("GET", "/api/principles")).json.principles[2], { slot: 2, body: "# Bo\n- 変更後" });
  assert.equal((await send("PUT", "/api/principles/2", { body: "" })).status, 200);
  assert.equal((await send("GET", "/api/principles")).json.principles[2].body, "");
});

test("rejects too long text, bad bodies and unknown slots", async () => {
  const bad = [{}, { body: 1 }, { body: "x".repeat(501) }];
  for (const body of bad) {
    const response = await send("PUT", "/api/principles/0", body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.json.error, "invalid principle");
    assert.ok(response.json.details[0]);
  }
  assert.equal((await send("PUT", "/api/principles/0", { body: "- a\n- b\n- c\n- d\n- e" })).status, 200);
  assert.equal((await send("PUT", "/api/principles/0", { body: "x".repeat(500) })).status, 200);
  assert.equal((await send("PUT", "/api/principles/4", { body: "x" })).status, 404);
  const text = await fetch(`${server.base}/api/principles/0`, { method: "PUT", body: "x" });
  assert.deepEqual(await text.json(), { error: "invalid principle" });
  assert.equal((await send("POST", "/api/principles", {})).status, 405);
  assert.equal((await send("GET", "/api/principles/0")).status, 405);
});
