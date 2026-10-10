import { report } from "../lib/report";

const START_PX = 4;
const BATCH = 100;
const COLORS = ["#ff8a00", "#00d5ff", "#7cff4f", "#ff5ad6", "#ffe83d", "#b48cff"];

export function setupInk(ctx, { send }) {
  const { $, video, on, s } = ctx;
  const layer = $("ink");
  const lines = new Map();
  const outbox = [];
  let box = { x: 0, y: 0, size: 1 };
  let count = 0;
  let mine = 0;
  let press = null;
  let sending = false;

  async function flush() {
    sending = true;
    while (outbox.length) {
      try {
        await send(outbox.shift());
      } catch (error) {
        report("sync-draw", error);
        outbox.length = 0;
      }
    }
    sending = false;
  }

  function queue(stroke, points) {
    const last = outbox.at(-1);
    if (points.length && last?.stroke === stroke && last.points.length && last.points.length < BATCH) last.points.push(...points);
    else outbox.push({ stroke, points });
    if (!sending) void flush();
  }

  function extend(key, points, color) {
    let line = lines.get(key);
    if (!line) {
      line = { els: ["edge", "core"].map((name) => {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        el.setAttribute("class", name);
        return el;
      }), text: `${points[0]},${points[1]}` };
      line.els[1].style.stroke = COLORS[color];
      lines.set(key, line);
      layer.append(...line.els);
    }
    for (let i = 0; i < points.length; i += 2) line.text += ` ${points[i]},${points[i + 1]}`;
    for (const el of line.els) el.setAttribute("points", line.text);
  }

  function erase() {
    if (press) press.live = false;
    lines.clear();
    layer.replaceChildren();
  }

  function add(x, y) {
    const { rect } = press;
    const at = (offset, length, start) => Math.round((start + Math.min(1, Math.max(0, offset / length)) * box.size) * 10000) / 10000;
    const next = [at(x - rect.left, rect.width, box.x), at(y - rect.top, rect.height, box.y)];
    const key = next.join();
    if (key === press.last) return;
    press.last = key;
    extend(`me:${press.stroke}`, next, mine);
    queue(press.stroke, next);
  }

  on(video, "pointerdown", (e) => {
    press = e.pointerType === "touch" ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, live: e.button === 0 && video.paused && s.ready, stroke: 0, last: "" };
  });
  on(video, "pointermove", (e) => {
    if (!press?.live || press.id !== e.pointerId) return;
    if (!(e.buttons & 1)) {
      press.live = false;
      return;
    }
    if (!press.stroke) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < START_PX) return;
      video.setPointerCapture(e.pointerId);
      press.stroke = ++count;
      press.rect = layer.getBoundingClientRect();
      add(press.x, press.y);
    }
    add(e.clientX, e.clientY);
  });
  on($("stage"), "click", (e) => {
    if (e.target !== video || !press?.stroke) return;
    press = null;
    e.stopPropagation();
  }, { capture: true });
  ["play", "seeking", "emptied"].forEach((name) => on(video, name, erase));

  return {
    setView(view) {
      box = view.col === undefined ? { x: 0, y: 0, size: 1 } : { x: view.col / 2, y: view.row / 2, size: 0.5 };
      layer.setAttribute("viewBox", `${box.x} ${box.y} ${box.size} ${box.size}`);
    },
    receive({ from, stroke, points, color }) {
      if (!points.length) erase();
      else if (video.paused) extend(`${from}:${stroke}`, points, color);
    },
    setColor(color) {
      mine = color;
    },
    eraseAll() {
      erase();
      queue(0, []);
    },
  };
}
