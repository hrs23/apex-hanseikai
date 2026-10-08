import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSync } from "./sync";

class Events {
  static instance;
  listeners = new Map();
  constructor(url) { this.url = url; Events.instance = this; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  emit(name, value) { this.listeners.get(name)?.({ data: JSON.stringify(value) }); }
  close() {}
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const reply = (state) => ({ ok: true, json: async () => ({ state, serverTime: Date.now() }) });
const playback = (position, from = "another-tab", seq = 1) => ({ recording: "2026-01-03 22-00-00.mp4", playing: true, position, rate: 1, view: 4, at: Date.now(), from, seq });
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

let sync;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", Events);
  vi.spyOn(crypto, "randomUUID").mockReturnValue("this-tab");
});
afterEach(() => {
  sync?.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Watch Party pending operations", () => {
  it("does not drift back to an earlier seek while a later seek awaits acknowledgement", async () => {
    const first = deferred();
    const second = deferred();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(10));
    sync.send(playback(20));
    await flush();
    first.resolve(reply(playback(10, "this-tab", 1)));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(apply).not.toHaveBeenCalled();
    second.resolve(reply(playback(20, "this-tab", 2)));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(apply.mock.lastCall[0].position).toBe(20);
  });

  it("sends only the latest of several rapid operations while a request is in flight", async () => {
    const first = deferred();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(reply(playback(30, "this-tab", 3)));
    vi.stubGlobal("fetch", fetch);
    sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers: () => {}, enabled: true });
    for (const position of [10, 20, 30]) sync.send(playback(position));
    await flush();
    first.resolve(reply(playback(10, "this-tab", 1)));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).position).toBe(30);
  });

  it("does not apply stale SSE or clock snapshots over pending user intent", async () => {
    const request = deferred();
    vi.stubGlobal("fetch", vi.fn((url) => url === "/sync/event" ? request.promise : Promise.resolve(reply(playback(5)))));
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(30));
    await flush();
    Events.instance.emit("state", playback(5));
    Events.instance.emit("open");
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(apply).not.toHaveBeenCalled();
    request.resolve(reply(playback(30, "this-tab", 2)));
    await flush();
  });

  it("applies a newer remote pause after pending local operations finish", async () => {
    const request = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request.promise));
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(30));
    await flush();
    const paused = { ...playback(35, "another-tab", 3), playing: false };
    Events.instance.emit("state", paused);
    request.resolve(reply(playback(30, "this-tab", 2)));
    await flush();
    expect(apply).toHaveBeenCalledWith(paused, expect.any(Number));
  });

  it("drops queued broadcasts and ignores delayed acknowledgements after Watch Party is disabled", async () => {
    const request = deferred();
    const fetch = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(10));
    sync.send(playback(20));
    await flush();
    sync.setEnabled(false);
    request.resolve(reply(playback(10, "this-tab")));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
});


describe("Watch Party activation", () => {
  it("publishes the current playback when explicitly enabling an empty room", async () => {
    const current = playback(1830, "this-tab");
    const fetch = vi.fn((url) => Promise.resolve(reply(url === "/sync/state" ? null : current)));
    vi.stubGlobal("fetch", fetch);
    sync = createSync({ read: () => current, apply: vi.fn(), onViewers: () => {} });
    sync.setEnabled(true);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe("/sync/event");
    expect(JSON.parse(options.body)).toMatchObject({ position: 1830, playing: true, client: "this-tab" });
  });

  it("joins an existing room without broadcasting a local pause before the first SSE snapshot", async () => {
    const remote = playback(900);
    const fetch = vi.fn().mockResolvedValue(reply(remote));
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    sync = createSync({ read: () => ({ ...playback(0), playing: false }), apply, onViewers: () => {} });
    sync.setEnabled(true);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/sync/state");
    expect(apply).toHaveBeenCalledWith(remote, expect.any(Number));
  });

  it("does not seed a room on automatic join", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(null));
    vi.stubGlobal("fetch", fetch);
    sync = createSync({ read: () => ({ ...playback(0), playing: false }), apply: vi.fn(), onViewers: () => {}, enabled: true });
    Events.instance.emit("open");
    Events.instance.emit("state", null);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/sync/state");
  });

  it("does not publish if Watch Party is turned off while checking the room", async () => {
    const request = deferred();
    const fetch = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetch);
    sync = createSync({ read: () => playback(800), apply: vi.fn(), onViewers: () => {} });
    sync.setEnabled(true);
    sync.setEnabled(false);
    request.resolve(reply(null));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});


it("counts the others who are typing, and nobody while outside the party", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null)));
  vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
  const onViewers = vi.fn();
  sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers, enabled: true });
  Events.instance.emit("viewers", { count: 3, typing: 2 });
  expect(onViewers).toHaveBeenLastCalledWith(3, 2);
  sync.setTyping(true);
  Events.instance.emit("viewers", { count: 3, typing: 2 });
  expect(onViewers).toHaveBeenLastCalledWith(3, 1);
  sync.setEnabled(false);
  Events.instance.emit("viewers", { count: 2, typing: 1 });
  expect(onViewers).toHaveBeenLastCalledWith(2, 0);
});

it("posts drawn lines only while in the party, and reports a rejected one", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
  sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers: () => {} });
  await sync.draw({ recording: "r", stroke: 1, points: [0.1, 0.2] });
  expect(fetch.mock.calls.filter(([url]) => url === "/sync/draw")).toHaveLength(0);
  sync.setEnabled(true);
  await sync.draw({ recording: "r", stroke: 1, points: [0.1, 0.2] });
  const sent = fetch.mock.calls.find(([url]) => url === "/sync/draw");
  expect(JSON.parse(sent[1].body)).toEqual({ recording: "r", stroke: 1, points: [0.1, 0.2], client: "this-tab" });
  fetch.mockResolvedValue({ ok: false, status: 400 });
  await expect(sync.draw({ recording: "r", stroke: 1, points: [0.1, 0.2] })).rejects.toThrow("HTTP 400");
});

it("passes on lines drawn by others only while in the party", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null)));
  vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
  const onDraw = vi.fn();
  sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers: () => {}, onDraw });
  Events.instance.emit("draw", { recording: "r", from: "other", stroke: 1, points: [0.1, 0.2] });
  expect(onDraw).not.toHaveBeenCalled();
  sync.setEnabled(true);
  Events.instance.emit("draw", { recording: "r", from: "other", stroke: 1, points: [0.1, 0.2] });
  expect(onDraw).toHaveBeenCalledWith({ recording: "r", from: "other", stroke: 1, points: [0.1, 0.2] });
});

it("opens Watch Party over HTTP where randomUUID is unavailable", () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes) => bytes.fill(7) });
  sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers: () => {} });
  expect(Events.instance.url).toMatch(/^\/sync\/stream\?client=[a-f0-9]{32}$/);
});

describe("Watch Party recovery", () => {
  it("reopens the stream when nothing has been heard for a long time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null)));
    sync = createSync({ read: () => playback(0), apply: vi.fn(), onViewers: () => {}, enabled: true });
    const first = Events.instance;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Events.instance).not.toBe(first);
  });

  it("returns to the room's state after its own update failed to reach the server", async () => {
    const own = playback(36, "this-tab", 2);
    vi.stubGlobal("fetch", vi.fn((url) => url === "/sync/event" ? Promise.reject(new Error("offline")) : Promise.resolve(reply(own))));
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(46));
    await vi.advanceTimersByTimeAsync(2500);
    expect(apply).toHaveBeenCalledWith(own, expect.any(Number));
  });

  it("gives up on a hung request and resynchronizes afterwards", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn((url) => {
      calls.push(url);
      return url === "/sync/event" ? Promise.reject(new DOMException("timeout", "TimeoutError")) : Promise.resolve(reply(playback(5)));
    }));
    const apply = vi.fn();
    sync = createSync({ read: () => playback(0), apply, onViewers: () => {}, enabled: true });
    sync.send(playback(10));
    await vi.advanceTimersByTimeAsync(2500);
    expect(calls.filter((url) => url === "/sync/state").length).toBeGreaterThan(0);
    expect(apply).toHaveBeenCalled();
  });
});
