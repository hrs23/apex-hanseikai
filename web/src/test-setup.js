import "@testing-library/jest-dom/vitest";

globalThis.EventSource = class {
  static last = null;
  listeners = {};
  constructor() { globalThis.EventSource.last = this; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  close() {}
};

if (!window.localStorage) {
  const values = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key) => values.has(key) ? values.get(key) : null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, String(value)),
    },
  });
}
