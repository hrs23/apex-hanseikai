import { t } from "./i18n";

export const stem = (name) => name.replace(/\.mp4$/i, "");
export const THUMB = { w: 240, h: 135, cols: 10, per: 100, every: 10 };

export const audioUrl = (recording, file) => `/media/audio/${encodeURIComponent(recording)}/${file}`;

export function thumbTile(seconds) {
  const index = Math.floor(seconds / THUMB.every);
  const tile = index % THUMB.per;
  return { sheet: Math.floor(index / THUMB.per), col: tile % THUMB.cols, row: Math.floor(tile / THUMB.cols) };
}

export const isSubmitKey = (event) => {
  const native = event.nativeEvent ?? event;
  return event.key === "Enter" && !event.shiftKey && !native.isComposing && event.keyCode !== 229;
};

export function nextBy(items, now, direction, at = (item) => item) {
  return direction > 0 ? items.find((item) => at(item) > now + 1) : items.findLast((item) => at(item) < now - 1);
}

export function formatTime(seconds) {
  const s = Math.floor(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatDuration(seconds) {
  if (!seconds) return "";
  if (seconds < 60) return t("{n}s", { n: Math.round(seconds) });
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? t("{h}h {m}m", { h: Math.floor(minutes / 60), m: minutes % 60 }) : t("{n}m", { n: minutes });
}
