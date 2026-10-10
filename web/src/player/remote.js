import { stem } from "../lib/format";
import { t } from "../lib/i18n";
import { createSync } from "./sync";

const DRIFT_LIMIT = 1.5;
const EVENT_LIMIT = 0.7;
const PAUSED_LIMIT = 0.01;
const CORRECTION_GAP_MS = 5000;

export function setupRemote(ctx, { enabled, view, setView, screen, onRemoteRecording, onViewers, onHansei, onRecordings, onDraw, onColor }) {
  const { $, video, on, osd, s } = ctx;
  let active = enabled;
  let pending = null;
  let lastCorrection = -Infinity;
  let blocked = false;

  const current = () => (s.name ? `${s.name}.mp4` : "");
  const snapshot = () => ({ recording: current(), playing: !video.paused, position: video.currentTime, rate: video.playbackRate, view: view() });

  function apply(state, now = Date.now(), drift = false) {
    if (!state || !active) return;
    if (current() !== state.recording) {
      pending = state;
      onRemoteRecording(state.recording);
      osd(stem(state.recording));
      return;
    }
    if (!s.ready) { pending = state; return; }
    if (state.view !== undefined && state.view !== view()) setView(state.view);
    if (video.playbackRate !== state.rate) {
      video.playbackRate = state.rate;
      $("rate").value = String(state.rate);
      osd(t("Speed {rate}x", { rate: state.rate }));
    }
    const target = state.position + (state.playing ? Math.max(0, now - state.at) / 1000 * state.rate : 0);
    if (state.playing && target >= video.duration) {
      if (video.currentTime !== video.duration) video.currentTime = video.duration;
      if (!video.paused) video.pause();
      return;
    }
    if (!state.playing && !video.paused) {
      video.pause();
      screen.flashBezel(false);
    }
    const limit = !state.playing ? PAUSED_LIMIT : drift ? DRIFT_LIMIT : EVENT_LIMIT;
    if (Math.abs(video.currentTime - target) > limit && !(drift && performance.now() - lastCorrection < CORRECTION_GAP_MS)) {
      if (!drift) {
        if (state.action) osd(state.action);
        else screen.showSeek(video.currentTime, target);
      }
      video.currentTime = target;
      lastCorrection = performance.now();
    }
    if (state.playing && video.paused) {
      if (!drift) screen.flashBezel(true);
      video.play().catch(() => {
        if (!blocked) osd(t("Tap to play in sync"));
        blocked = true;
      });
    }
  }

  const session = createSync({ read: snapshot, apply, onViewers, onHansei, onRecordings, onDraw: (line) => { if (line.recording === current()) onDraw(line); }, onColor, enabled });
  ctx.cleanup(() => {
    session.setTyping(false);
    session.destroy();
  });
  on(video, "playing", () => { blocked = false; });

  return {
    snapshot,
    send: (state, action) => session.send(state, action),
    draw: (line) => session.draw({ ...line, recording: current() }),
    setTyping: (value) => session.setTyping(value),
    isOn: () => active,
    setEnabled(value) {
      active = value;
      session.setEnabled(value);
    },
    takePending() {
      if (!pending || current() !== pending.recording) return null;
      const state = pending;
      pending = null;
      return state;
    },
    apply,
  };
}
