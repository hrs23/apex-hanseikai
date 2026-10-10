import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./harness.mjs";

const REC = "2026-10-05 21-00-00.mp4";
let server;
let BASE;

before(async () => {
  server = await startServer();
  BASE = server.base;
});
after(() => server.stop());

async function listen(client) {
  const controller = new AbortController();
  const response = await fetch(`${BASE}/sync/stream?client=${client}`, { signal: controller.signal });
  const reader = response.body.getReader();
  const events = [];
  let buffer = "";
  (async () => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value);
        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (name) events.push({ name, data: JSON.parse(data) });
        }
      }
    } catch {
      return;
    }
  })();
  return { events, close: () => controller.abort() };
}

let clientSeq = 0;
const post = (body) => fetch(`${BASE}/sync/event`, { method: "POST", body: JSON.stringify({ clientSeq: ++clientSeq, sentAt: Date.now(), ...body }) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test("an event reaches the other viewers but not the sender, and late joiners get the current state", async () => {
  const a = await listen("a");
  const b = await listen("b");
  await settle();
  assert.deepEqual(a.events.at(-1), { name: "viewers", data: { count: 0, typing: 0 } });
  const presence = (client, active) => fetch(`${BASE}/sync/presence`, { method: "POST", body: JSON.stringify({ client, active }) });
  assert.equal((await presence("a", true)).status, 204);
  await presence("b", true);
  await settle();
  assert.deepEqual(b.events.at(-1), { name: "viewers", data: { count: 2, typing: 0 } });
  await presence("b", false);
  await settle();
  assert.deepEqual(a.events.at(-1), { name: "viewers", data: { count: 1, typing: 0 } });
  assert.equal((await presence("nobody", true)).status, 400);
  await fetch(`${BASE}/sync/presence`, { method: "POST", body: JSON.stringify({ client: "a", active: true, typing: true }) });
  await settle();
  assert.deepEqual(b.events.at(-1), { name: "viewers", data: { count: 1, typing: 1 } });

  const response = await post({ recording: REC, client: "a", playing: true, position: 10, rate: 1, view: 3 });
  assert.equal(response.status, 200);
  await settle();
  const received = b.events.filter((event) => event.name === "state" && event.data);
  assert.equal(received.length, 1);
  assert.deepEqual({ ...received[0].data, at: 0, seq: 0 }, { recording: REC, playing: true, position: 10, rate: 1, view: 3, at: 0, from: "a", seq: 0 });
  assert.equal(a.events.filter((event) => event.name === "state" && event.data).length, 0);

  const other = "2026-10-06 21-00-00.mp4";
  await post({ recording: other, client: "b", playing: false, position: 0, rate: 1, view: 1 });
  await settle();
  assert.equal(a.events.filter((event) => event.name === "state" && event.data).at(-1).data.recording, other);

  const late = await listen("c");
  await settle();
  const joined = late.events.find((event) => event.name === "state").data;
  assert.equal(joined.recording, other);
  assert.equal(joined.playing, false);
  assert.equal(joined.view, 1);
  const created = await fetch(`${BASE}/api/hansei`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recording: REC, at: null, body: "共有" }) });
  assert.equal(created.status, 201);
  await settle();
  assert.deepEqual(late.events.at(-1), { name: "hansei", data: { recording: REC } });
  for (const stream of [a, b, late]) stream.close();
});

test("rejects invalid events", async () => {
  assert.equal((await post({ recording: "../x", client: "a", playing: true, position: 1, rate: 1, view: 1 })).status, 400);
  assert.equal((await post({ recording: REC, client: "a", playing: "yes", position: 1, rate: 1, view: 1 })).status, 400);
  assert.equal((await post({ recording: REC, client: "a", playing: true, position: -1, rate: 1, view: 1 })).status, 400);
  assert.equal((await post({ recording: REC, client: "a", playing: true, position: 1, rate: 1, view: 5 })).status, 400);
  assert.equal((await post({ recording: REC, client: "a", playing: true, position: 1, rate: 1, view: 0 })).status, 200);
  assert.equal((await post({ recording: REC, client: "a", playing: true, position: 1, rate: 1 })).status, 400);
  assert.equal((await fetch(`${BASE}/sync/stream?client=bad%20id`)).status, 400);
});

test("ignores reordered events and exposes current state with server time", async () => {
  const event = { recording: REC, client: "ordered", playing: false, position: 42, rate: 1, view: 1, clientSeq: 2 };
  const accepted = await post(event).then((r) => r.json());
  await post({ ...event, clientSeq: 1, position: 0 });
  const snapshot = await fetch(`${BASE}/sync/state`).then((r) => r.json());
  assert.equal(snapshot.state.position, 42);
  assert.equal(snapshot.state.seq, accepted.state.seq);
  assert.ok(Math.abs(snapshot.serverTime - Date.now()) < 1000);
});

test("accepts client error reports and rejects malformed ones", async () => {
  const ok = await fetch(`${BASE}/api/log`, { method: "POST", body: JSON.stringify({ kind: "video-error", message: "code 2", url: "http://x/#watch" }) });
  assert.equal(ok.status, 200);
  assert.equal((await fetch(`${BASE}/api/log`, { method: "POST", body: "not json" })).status, 400);
  assert.equal((await fetch(`${BASE}/api/log`)).status, 405);
});

test("passes the sender's action label to other viewers but not to late joiners", async () => {
  const listener = await listen("label-listener");
  await settle();
  await post({ recording: REC, client: "label-sender", playing: false, position: 5, rate: 1, view: 1, action: "Match 2 end" });
  await settle();
  assert.equal(listener.events.filter((event) => event.name === "state" && event.data).at(-1).data.action, "Match 2 end");
  const snapshot = await fetch(`${BASE}/sync/state`).then((r) => r.json());
  assert.equal(snapshot.state.action, undefined);
  listener.close();
});

test("many clients posting at once see one ordered history and end on the same state", async () => {
  const ids = ["m0", "m1", "m2", "m3", "m4", "m5"];
  const other = "2026-10-06 21-00-00.mp4";
  const streams = await Promise.all(ids.map((id) => listen(id)));
  await settle();
  const counters = Object.fromEntries(ids.map((id) => [id, 0]));
  const responses = await Promise.all(Array.from({ length: 150 }, (_, i) => {
    const client = ids[i % ids.length];
    const body = { recording: i % 7 === 0 ? other : REC, client, playing: i % 3 !== 0, position: i, rate: [0.5, 1, 2][i % 3], view: (i % 4) + 1, clientSeq: ++counters[client], sentAt: Date.now() };
    return fetch(`${BASE}/sync/event`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
  }));
  await settle();
  const final = await fetch(`${BASE}/sync/state`).then((r) => r.json());
  assert.ok(responses.every((r) => r.state), "every request got a snapshot");
  for (const [index, stream] of streams.entries()) {
    const seqs = stream.events.filter((event) => event.name === "state" && event.data).map((event) => event.data.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), `${ids[index]} saw states out of order`);
    assert.equal(new Set(seqs).size, seqs.length, `${ids[index]} saw a state twice`);
    const own = stream.events.some((event) => event.name === "state" && event.data?.from === ids[index]);
    assert.equal(own, false, `${ids[index]} was sent its own event`);
    if (final.state.from !== ids[index]) assert.equal(seqs.at(-1), final.state.seq, `${ids[index]} did not end on the final state`);
  }
  assert.equal((await fetch(`${BASE}/api/health`)).status, 200);
  for (const stream of streams) stream.close();
});


test("relays drawn lines to the other viewers without keeping them", async () => {
  const a = await listen("pen");
  const b = await listen("eye");
  await settle();
  const draw = (body) => fetch(`${BASE}/sync/draw`, { method: "POST", body: JSON.stringify({ client: "pen", recording: REC, stroke: 1, points: [0.1, 0.2, 0.3, 0.4], ...body }) });
  assert.equal((await draw()).status, 204);
  assert.equal((await draw({ points: [] })).status, 204);
  await settle();
  assert.deepEqual(b.events.filter((event) => event.name === "draw").map((event) => event.data), [
    { recording: REC, from: "pen", stroke: 1, points: [0.1, 0.2, 0.3, 0.4], color: 0 },
    { recording: REC, from: "pen", stroke: 1, points: [], color: 0 },
  ]);
  assert.equal(a.events.some((event) => event.name === "draw"), false);
  assert.equal((await draw({ client: "nobody" })).status, 400);
  assert.equal((await draw({ points: [0.1] })).status, 400);
  assert.equal((await draw({ points: [0.1, 1.5] })).status, 400);
  assert.equal((await draw({ recording: "../x" })).status, 400);
  assert.equal((await draw({ stroke: "1" })).status, 400);
  const late = await listen("late");
  await settle();
  assert.equal(late.events.some((event) => event.name === "draw"), false);
  for (const stream of [a, b, late]) stream.close();
});

test("gives each player their remembered pen color, or the next free one when it is taken", async () => {
  const join = async (client, color) => {
    const stream = await listen(client);
    await fetch(`${BASE}/sync/presence`, { method: "POST", body: JSON.stringify({ client, active: true, typing: false, color }) });
    await settle();
    return { ...stream, color: stream.events.find((event) => event.name === "color").data.color };
  };
  const first = await join("ann", null);
  const second = await join("bo", null);
  const third = await join("cy", "1");
  const home = await listen("home");
  assert.deepEqual([first.color, second.color, third.color], [0, 1, 2]);
  await fetch(`${BASE}/sync/draw`, { method: "POST", body: JSON.stringify({ client: "bo", recording: REC, stroke: 1, points: [0.1, 0.2] }) });
  await settle();
  assert.equal(first.events.find((event) => event.name === "draw").data.color, 1);
  assert.equal(home.events.some((event) => event.name === "color"), false);
  for (const stream of [first, second, third, home]) stream.close();
  await settle();
  const again = await join("cy-later", "2");
  assert.equal(again.color, 2);
  again.close();
});
