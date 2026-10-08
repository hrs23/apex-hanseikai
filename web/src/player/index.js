import { copyText } from "../lib/clipboard";
import { formatTime, stem } from "../lib/format";
import { t } from "../lib/i18n";
import { report } from "../lib/report";
import { setupAudio } from "./audio";
import { createContext } from "./context";
import { setupInk } from "./ink";
import { setupKeys } from "./keys";
import { setupQuick } from "./quick";
import { setupRemote } from "./remote";
import { setupScreen } from "./screen";
import { setupSeekbar } from "./seekbar";

const VIEWS = [{}, { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }];
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const METADATA_TIMEOUT_MS = 10_000;
const MAX_VIDEO_RETRIES = 5;

export function createPlayer(root, { recording, startAt = 0, view = 0, sync = false, onRemoteRecording, onViewers, onHansei, onHanseiChange, onStep }) {
  const ctx = createContext(root);
  const { $, video, s, act, osd } = ctx;
  const viewOf = (n) => (n <= s.players.length ? VIEWS[n] : undefined);
  let currentView = VIEWS[view] ? view : 0;
  let lastPlayerView = 1;
  let loadSeq = 0;
  let announceNext = false;
  let videoErrors = 0;

  const audio = setupAudio(ctx);
  const seekbar = setupSeekbar(ctx);
  const screen = setupScreen(ctx);
  const remote = setupRemote(ctx, { enabled: sync, view: () => currentView, setView: applyView, screen, onRemoteRecording, onViewers: (count, typing) => { onViewers(count); seekbar.setTyping(typing > 0); }, onHansei: onHanseiChange, onRecordings: () => { if (s.name) void fetchMetadata(); }, onDraw: (line) => ink.receive(line) });
  const ink = setupInk(ctx, { send: remote.draw });
  const quick = setupQuick(ctx, { onHansei, setTyping: remote.setTyping });

  function applyView(wanted) {
    currentView = wanted;
    const n = viewOf(wanted) ? wanted : 0;
    const v = VIEWS[n];
    if (n) lastPlayerView = n;
    video.style.transform = n ? `scale(2) translate(${-50 * v.col}%, ${-50 * v.row}%)` : "";
    ink.setView(v);
    audio.setTrack(n);
    $("views").hidden = !s.players.length;
    $("views").replaceChildren(...[t("All"), ...s.players].map((name, index) => {
      const button = document.createElement("button");
      const key = document.createElement("kbd");
      button.type = "button";
      button.dataset.view = index;
      button.className = index === n ? "is-on" : "";
      key.textContent = index;
      button.append(key, ` ${name}`);
      return button;
    }));
    if (s.players.length) osd(n ? s.players[n - 1] : t("All"));
  }

  act.userPlay = (playing, announce = true) => {
    if (playing) {
      const desired = { ...remote.snapshot(), playing: true };
      video.play().catch(() => {});
      if (announce) remote.send(desired);
    } else {
      video.pause();
      if (announce) remote.send();
    }
  };
  act.userSeek = (time, feedback = false, action) => {
    const target = Math.min(video.duration || Infinity, Math.max(0, time));
    if (action) osd(action);
    else if (feedback) screen.showSeek(video.currentTime, target);
    video.currentTime = target;
    remote.send(undefined, action);
  };
  act.skip = (seconds) => act.userSeek(video.currentTime + seconds, true);
  act.userView = (n) => {
    if (!viewOf(n)) return;
    applyView(n);
    remote.send();
  };
  const userRate = (rate) => {
    video.playbackRate = rate;
    $("rate").value = String(rate);
    remote.send();
  };
  function stepRate(delta) {
    const index = RATES.indexOf(video.playbackRate);
    const next = RATES[Math.min(RATES.length - 1, Math.max(0, (index < 0 ? RATES.indexOf(1) : index) + delta))];
    userRate(next);
    osd(t("Speed {rate}x", { rate: next }));
  }

  async function fetchMetadata() {
    const name = s.name;
    try {
      const response = await fetch(`/api/recordings?day=${name.slice(0, 10)}`, { cache: "no-store", signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
      if (!response.ok) return;
      const item = (await response.json()).recordings.find((entry) => entry.name === `${name}.mp4`);
      if (name !== s.name || !item) return;
      if (s.players.join() !== item.players.join()) {
        s.players = item.players;
        applyView(currentView);
      }
      seekbar.setInfo(item);
    } catch (error) {
      report("player-metadata", error, name);
    }
  }

  function load(name, from = 0, resume = false) {
    const seq = ++loadSeq;
    const url = `/media/rec/${encodeURIComponent(name)}`;
    let recover = null;
    videoErrors = 0;
    s.ready = false;
    s.name = stem(name);
    seekbar.reset();
    audio.stop();
    video.src = url;
    void fetchMetadata();
    video.onloadedmetadata = () => {
      if (seq !== loadSeq) return;
      s.ready = true;
      if (recover) {
        video.currentTime = Math.min(recover.time, video.duration || recover.time);
        if (recover.playing) video.play().catch(() => {});
        recover = null;
        $("msg").hidden = true;
        return;
      }
      const pending = remote.takePending();
      if (pending) {
        applyView(currentView);
        remote.apply(pending);
        return;
      }
      const outside = from && from >= video.duration;
      if (from && !outside) video.currentTime = from;
      applyView(currentView);
      if (resume) act.userPlay(true, announceNext);
      else if (announceNext) remote.send();
      announceNext = false;
      if (outside) osd(t("{time} is outside this recording (ends at {end})", { time: formatTime(from), end: formatTime(video.duration) }));
    };
    video.onerror = () => {
      if (seq !== loadSeq) return;
      report("video-error", new Error(`code ${video.error?.code}: ${video.error?.message || ""}`), name);
      if (videoErrors >= MAX_VIDEO_RETRIES) {
        $("msg").textContent = t("Playback error: could not open recording. Reload the page to retry");
        $("msg").hidden = false;
        return;
      }
      const delay = 1000 * ++videoErrors;
      recover ??= { time: video.currentTime || from, playing: !video.paused || resume };
      $("msg").textContent = t("Reconnecting…");
      $("msg").hidden = false;
      setTimeout(() => {
        if (seq !== loadSeq) return;
        s.ready = false;
        video.src = url;
      }, delay);
    };
    $("msg").hidden = true;
  }

  ctx.on(video, "playing", () => { videoErrors = 0; });
  $("rate").onchange = () => {
    userRate(+$("rate").value);
    ctx.focus();
  };
  $("link").onclick = async () => {
    const hash = remote.isOn() ? "#watch?sync=1" : `#watch?rec=${encodeURIComponent(`${s.name}.mp4`)}&t=${Math.floor(video.currentTime)}&v=${currentView}`;
    osd(await copyText(`${location.origin}${location.pathname}${hash}`) ? t("Link copied") : t("Could not copy link"));
  };
  $("views").onclick = (e) => {
    const button = e.target.closest("[data-view]");
    if (button) act.userView(+button.dataset.view);
  };
  root.querySelectorAll("[data-skip]").forEach((b) => { b.onclick = () => act.skip(+b.dataset.skip); });

  setupKeys(ctx, {
    screen, audio, seekbar, quick, ink, stepRate, onStep,
    views: { current: () => currentView, lastPlayer: () => lastPlayerView, numbers: () => VIEWS.map((_, n) => n) },
  });

  load(recording, startAt, true);

  return {
    focus: ctx.focus,
    time: () => video.currentTime || 0,
    seek: (time) => {
      act.userSeek(time);
      act.userPlay(true);
    },
    setHansei: seekbar.setNotes,
    setSync: remote.setEnabled,
    load: (name, announceToOthers = true) => {
      announceNext = announceToOthers;
      osd(stem(name));
      load(name, 0, !video.paused);
    },
    destroy() {
      loadSeq++;
      video.onerror = null;
      ctx.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  };
}
