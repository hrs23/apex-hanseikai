const DEDUPE_MS = 10_000;
const MAX_REPORTS = 30;
const recent = new Map();
let count = 0;

export function report(kind, error, detail = "") {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const key = `${kind}:${message}`;
  const now = Date.now();
  if (count >= MAX_REPORTS || now - (recent.get(key) ?? -Infinity) < DEDUPE_MS) return;
  recent.set(key, now);
  count++;
  console.warn(`[${kind}]`, error, detail);
  const body = JSON.stringify({ kind, message, stack: error instanceof Error ? error.stack : "", url: location.href, detail: String(detail) });
  try {
    if (navigator.sendBeacon?.("/api/log", body)) return;
  } catch {}
  fetch("/api/log", { method: "POST", body, keepalive: true }).catch(() => {});
}

export function installErrorReporting() {
  window.addEventListener("error", (event) => {
    if (!event.error && !event.filename) return;
    report("window-error", event.error ?? event.message, `${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => report("unhandled-rejection", event.reason));
}
