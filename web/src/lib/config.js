const DEFAULTS = { title: "反省会" };

let cache = null;

export function loadConfig() {
  cache ??= fetch("/api/config")
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
    .then((value) => ({ ...DEFAULTS, ...value }));
  return cache;
}
