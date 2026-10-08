export function setupKeys(ctx, { screen, audio, seekbar, quick, ink, stepRate, onStep, views }) {
  const { $, on, act } = ctx;
  const click = (id) => () => $(id).click();

  const shortcuts = {
    Tab: () => act.userView(views.current() ? 0 : views.lastPlayer()),
    " ": click("play"),
    k: click("play"),
    ArrowLeft: (e) => act.skip(e.shiftKey ? -1 : -5),
    ArrowRight: (e) => act.skip(e.shiftKey ? 1 : 5),
    j: (e) => act.skip(e.shiftKey ? -60 : -10),
    l: (e) => act.skip(e.shiftKey ? 60 : 10),
    "<": () => stepRate(-1),
    ">": () => stepRate(1),
    m: click("mute"),
    ArrowUp: () => audio.nudge(0.05),
    ArrowDown: () => audio.nudge(-0.05),
    f: click("fs"),
    t: click("fill"),
    c: () => quick.open(),
    x: () => ink.eraseAll(),
    a: () => seekbar.stepMark(-1),
    d: () => seekbar.stepMark(1),
    q: () => seekbar.stepNote(-1),
    e: () => seekbar.stepNote(1),
    ...Object.fromEntries(views.numbers().map((n) => [n, () => act.userView(n)])),
  };

  on(document, "keydown", (e) => {
    if (e.key === "Escape") {
      if (screen.helpOpen()) screen.toggleHelp(false);
      else screen.setFill(false);
      return;
    }
    const target = e.target;
    if (target.tagName === "SELECT" || target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && target.type !== "range")) return;
    if (target.isContentEditable) return;
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      act.skip(e.key === "ArrowLeft" ? -60 : 60);
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.normalize("NFKC");
    if (e.shiftKey && (key === "N" || key === "P")) {
      onStep?.(key === "N" ? 1 : -1);
      e.preventDefault();
      return;
    }
    if (key === "?") {
      screen.toggleHelp();
      e.preventDefault();
      return;
    }
    const action = shortcuts[key.length === 1 ? key.toLowerCase() : key];
    if (!action) return;
    action(e);
    e.preventDefault();
  });
}
