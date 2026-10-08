export function createContext(root) {
  const elements = new Map([...root.querySelectorAll("[id]")].map((element) => [element.id, element]));
  const $ = (id) => elements.get(id);
  const controller = new AbortController();
  const cleanups = [];
  let osdTimer = 0;
  const ctx = {
    $,
    video: $("video"),
    voice: $("voice"),
    s: { name: "", players: [], ready: false },
    act: {},
    on: (target, event, handler, options) => target.addEventListener(event, handler, { signal: controller.signal, ...options }),
    cleanup: (fn) => cleanups.push(fn),
    focus: () => ctx.video.focus({ preventScroll: true }),
    osd(text) {
      $("osd").textContent = text;
      $("osd").classList.add("show");
      clearTimeout(osdTimer);
      osdTimer = setTimeout(() => $("osd").classList.remove("show"), 1500);
    },
    destroy() {
      controller.abort();
      clearTimeout(osdTimer);
      cleanups.forEach((fn) => fn());
    },
  };
  return ctx;
}
