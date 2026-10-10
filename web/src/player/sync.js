import { report } from "../lib/report";

const REQUEST_TIMEOUT_MS = 5000;
const STALE_STREAM_MS = 50_000;
const RECONNECT_MS = 3000;
const RESYNC_MS = 2000;
const CLOCK_SAMPLES = 5;
const COLOR_KEY = "webplayer:pen";

const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
const post = (url, body) => request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function createSync({ read, apply, onViewers, onHansei, onRecordings, onDraw, onColor, enabled = false }) {
  const client = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let active = enabled;
  let typing = false;
  let state = null;
  let clientSeq = 0;
  let offset = 0;
  let fresh = true;
  let closed = false;
  let outbox = null;
  let sending = false;
  let generation = 0;
  const samples = [];
  const busy = () => sending || outbox !== null;

  function receive(next, reset = false) {
    if (!next) { if (reset) state = null; return; }
    if (!reset && state && next.seq < state.seq) return;
    state = next;
    if (active && !busy() && next.from !== client) apply(next, Date.now() + offset);
  }
  async function measure() {
    const start = Date.now();
    try {
      const response = await request("/sync/state", { cache: "no-store" });
      if (!response.ok) return false;
      const payload = await response.json();
      if (closed) return false;
      const elapsed = Date.now() - start;
      samples.push({ elapsed, offset: payload.serverTime - (start + elapsed / 2) });
      if (samples.length > CLOCK_SAMPLES) samples.shift();
      offset = samples.reduce((best, sample) => (sample.elapsed < best.elapsed ? sample : best)).offset;
      receive(payload.state);
      return true;
    } catch (error) {
      report("sync-measure", error);
      return false;
    }
  }
  const presence = () => {
    let color = 0;
    try { color = Number(localStorage.getItem(COLOR_KEY)); } catch {}
    navigator.sendBeacon?.("/sync/presence", JSON.stringify({ client, active, typing, color }));
  };
  let events;
  let lastHeard = Date.now();
  let reconnectTimer = 0;
  function connect() {
    clearTimeout(reconnectTimer);
    events?.close();
    const source = new EventSource(`/sync/stream?client=${client}`);
    events = source;
    lastHeard = Date.now();
    const listen = (name, handler) => source.addEventListener(name, (event) => {
      lastHeard = Date.now();
      try { handler(event); } catch (error) { report("sync-event", error, name); }
    });
    listen("open", () => { fresh = true; samples.length = 0; presence(); void measure(); onRecordings?.(); });
    listen("ping", () => {});
    listen("state", (event) => {
      receive(JSON.parse(event.data), fresh);
      fresh = false;
    });
    listen("viewers", (event) => {
      const data = JSON.parse(event.data);
      onViewers(data.count, active ? data.typing - (typing ? 1 : 0) : 0);
    });
    listen("hansei", (event) => onHansei?.(JSON.parse(event.data).recording));
    listen("recordings", () => onRecordings?.());
    listen("draw", (event) => { if (active) onDraw?.(JSON.parse(event.data)); });
    listen("color", (event) => {
      const { color } = JSON.parse(event.data);
      try { localStorage.setItem(COLOR_KEY, color); } catch {}
      onColor?.(color);
    });
    source.addEventListener("error", () => {
      if (source.readyState === 2 && !closed && events === source) reconnectTimer = setTimeout(connect, RECONNECT_MS);
    });
  }
  connect();
  const streamTimer = setInterval(() => {
    if (Date.now() - lastHeard < STALE_STREAM_MS) return;
    report("sync-stream-stale", new Error(`no message for ${Math.round((Date.now() - lastHeard) / 1000)}s`));
    connect();
  }, 10_000);
  const clockTimer = setInterval(measure, 30_000);
  const driftTimer = setInterval(() => {
    if (active && !busy() && state?.playing) apply(state, Date.now() + offset, true);
  }, 2000);

  async function resync() {
    if (closed || !active || !await measure()) return;
    if (state && !busy()) apply(state, Date.now() + offset);
  }

  async function flush() {
    sending = true;
    try {
      while (outbox && !closed && active) {
        const body = { ...outbox, client, clientSeq: ++clientSeq };
        const sentGeneration = generation;
        outbox = null;
        try {
          const response = await post("/sync/event", body);
          if (!response.ok) throw new Error(`sync event rejected: HTTP ${response.status}`);
          const { state: acknowledged } = await response.json();
          if (!closed && sentGeneration === generation) receive(acknowledged);
        } catch (error) {
          report("sync-send", error);
          if (!closed) setTimeout(resync, RESYNC_MS);
        }
      }
    } finally {
      sending = false;
      if (!closed && active && !busy() && state && state.from !== client) apply(state, Date.now() + offset);
    }
  }

  function send(value = read(), action) {
    if (!active || !value?.recording || closed) return;
    outbox = { ...value, action, sentAt: Date.now() + offset };
    if (!sending) void flush();
  }
  return {
    send,
    async draw(line) {
      if (!active || closed) return;
      const response = await post("/sync/draw", { ...line, client });
      if (!response.ok) throw new Error(`sync draw rejected: HTTP ${response.status}`);
    },
    setTyping(value) {
      if (typing === value) return;
      typing = value;
      presence();
    },
    setEnabled(value) {
      if (active === value) return;
      generation++;
      active = value;
      outbox = null;
      presence();
      if (active && !busy() && state) apply(state, Date.now() + offset);
      else if (active && !state) {
        const activation = generation;
        void measure().then((available) => {
          if (available && !closed && active && activation === generation && !state) send();
        });
      }
    },
    destroy() {
      closed = true;
      clearTimeout(reconnectTimer);
      events.close();
      clearInterval(streamTimer);
      clearInterval(clockTimer);
      clearInterval(driftTimer);
    },
  };
}
