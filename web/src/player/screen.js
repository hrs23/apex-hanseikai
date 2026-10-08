import { t } from "../lib/i18n";

const DOUBLE_TAP_MS = 300;
const IDLE_MS = 2500;

export function setupScreen(ctx) {
  const { $, video, on, act } = ctx;
  let waiting = false;
  let idleTimer = 0;
  let seekTimer = 0;
  let clickTimer = 0;
  let lastTap = 0;
  let pointer = "mouse";

  let fill = false;
  const isFill = () => $("player").classList.contains("is-fill");
  const isFull = () => document.fullscreenElement === $("player");

  function wake() {
    $("player").classList.remove("idle");
    clearTimeout(idleTimer);
    if (!isFill()) return;
    idleTimer = setTimeout(() => {
      if (!video.paused && !$("controls").matches(":hover")) $("player").classList.add("idle");
    }, IDLE_MS);
  }

  function showFill() {
    const value = fill || isFull();
    $("player").classList.toggle("is-fill", value);
    document.documentElement.classList.toggle("pl-filled", value);
    wake();
  }
  function setFill(value) {
    fill = value;
    showFill();
  }
  function toggleFull() {
    if (isFull()) document.exitFullscreen();
    else if ($("player").requestFullscreen) $("player").requestFullscreen().catch(() => setFill(true));
    else setFill(!fill);
  }

  const toggleHelp = (show = $("help").hidden) => {
    $("help").hidden = !show;
  };

  function flashBezel(playing) {
    $("bezel").dataset.state = playing ? "play" : "pause";
    $("bezel").classList.remove("show");
    void $("bezel").offsetWidth;
    $("bezel").classList.add("show");
  }

  function showSeek(from, target) {
    const delta = target - from;
    if (Math.abs(delta) < 1) return;
    const forward = delta > 0;
    const feedback = $(forward ? "seekForward" : "seekBack");
    $(forward ? "seekBack" : "seekForward").hidden = true;
    feedback.textContent = `${forward ? "▶▶" : "◀◀"} ${t("{n} seconds", { n: Math.round(Math.abs(delta)) })}`;
    feedback.hidden = false;
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => { feedback.hidden = true; }, 800);
    $("stage").dataset.seek = forward ? "forward" : "backward";
    $("stage").classList.remove("seek-pulse");
    void $("stage").offsetWidth;
    $("stage").classList.add("seek-pulse");
  }

  const syncUi = () => {
    const stopped = video.paused || video.ended;
    const starved = video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && (!stopped || waiting);
    const loading = video.currentSrc && !video.ended && (video.seeking || starved);
    $("play").dataset.state = stopped ? "paused" : "playing";
    $("state").hidden = !loading;
  };
  const stalled = (value) => () => {
    waiting = value;
    syncUi();
  };
  ["play", "loadstart", "seeking", "seeked", "progress", "stalled", "suspend", "loadeddata", "canplay", "timeupdate", "pause", "ended"].forEach((name) => on(video, name, syncUi));
  on(video, "waiting", stalled(true));
  ["playing", "emptied"].forEach((name) => on(video, name, stalled(false)));

  ["mousemove", "mousedown", "touchstart"].forEach((name) => on($("player"), name, wake, { passive: true }));
  on(document, "keydown", wake, { passive: true });
  on(video, "pause", wake);

  $("play").onclick = () => {
    const playing = video.paused;
    act.userPlay(playing);
    flashBezel(playing);
  };
  on(document, "fullscreenchange", showFill);
  $("fs").onclick = toggleFull;
  $("fill").onclick = () => setFill(!fill);
  $("helpBtn").onclick = () => toggleHelp();
  $("helpClose").onclick = () => {
    toggleHelp(false);
    ctx.focus();
  };

  video.onpointerdown = (e) => { pointer = e.pointerType; };
  video.onclick = (e) => {
    clearTimeout(clickTimer);
    if (pointer === "touch") {
      const now = performance.now();
      const again = now - lastTap < DOUBLE_TAP_MS;
      lastTap = now;
      if (again) {
        const rect = video.getBoundingClientRect();
        return act.skip(e.clientX < rect.left + rect.width / 2 ? -10 : 10);
      }
    }
    clickTimer = setTimeout(() => $("play").click(), DOUBLE_TAP_MS);
  };
  video.ondblclick = () => {
    clearTimeout(clickTimer);
    if (pointer !== "touch") $("fs").click();
  };

  ctx.cleanup(() => {
    clearTimeout(idleTimer);
    clearTimeout(seekTimer);
    clearTimeout(clickTimer);
    if (isFull()) document.exitFullscreen();
    setFill(false);
  });

  return { setFill, toggleHelp, helpOpen: () => !$("help").hidden, flashBezel, showSeek };
}
