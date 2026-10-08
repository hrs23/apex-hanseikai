import { audioUrl } from "../lib/format";
import { t } from "../lib/i18n";

const STORAGE = { volume: "webplayer:volume", muted: "webplayer:muted" };

export function setupAudio(ctx) {
  const { $, video, voice, on, s } = ctx;
  let volume = 1;
  let muted = false;
  let track = 0;
  try {
    volume = +localStorage.getItem(STORAGE.volume) || 1;
    muted = localStorage.getItem(STORAGE.muted) === "1";
  } catch {}

  function apply() {
    const level = muted ? 0 : volume;
    video.volume = voice.volume = volume;
    video.muted = muted || track !== 0;
    voice.muted = muted;
    $("mute").dataset.state = muted || volume === 0 ? "muted" : "on";
    $("vol").value = level;
    $("vol").setAttribute("aria-valuetext", `${Math.round(level * 100)}%`);
    $("mute").title = muted ? t("Unmute (M)") : t("Mute (M)");
    $("mute").setAttribute("aria-label", muted ? t("Unmute") : t("Mute"));
  }

  function setVolume(next, mute = false) {
    volume = Math.min(1, Math.max(0, next));
    muted = mute || volume === 0;
    apply();
    ctx.osd(muted ? t("Muted") : t("Volume {percent}%", { percent: Math.round(volume * 100) }));
    try {
      localStorage.setItem(STORAGE.volume, String(volume || 1));
      localStorage.setItem(STORAGE.muted, muted ? "1" : "0");
    } catch {}
  }

  function stop() {
    voice.pause();
    voice.removeAttribute("src");
  }

  function setTrack(n) {
    track = n > s.players.length ? 0 : n;
    apply();
    if (track === 0) return stop();
    voice.src = audioUrl(s.name, `${track}.m4a`);
    voice.playbackRate = video.playbackRate;
    voice.currentTime = video.currentTime;
    if (!video.paused) voice.play().catch(() => {});
  }

  const align = () => {
    if (Math.abs(voice.currentTime - video.currentTime) > 0.3) voice.currentTime = video.currentTime;
  };
  const keepInSync = () => {
    if (track === 0 || !voice.src || voice.seeking || video.seeking || video.paused) return;
    align();
  };
  const playVoice = () => {
    if (!track) return;
    align();
    voice.play().catch(() => {});
  };
  on(video, "play", playVoice);
  on(video, "playing", playVoice);
  on(video, "pause", () => voice.pause());
  on(video, "waiting", () => voice.pause());
  on(video, "seeked", keepInSync);
  on(video, "ratechange", () => { voice.playbackRate = video.playbackRate; });
  const timer = setInterval(keepInSync, 500);
  ctx.cleanup(() => {
    clearInterval(timer);
    stop();
  });

  $("mute").onclick = () => (muted ? setVolume(volume || 1, false) : setVolume(volume, true));
  $("vol").oninput = () => setVolume(+$("vol").value);

  return { setTrack, stop, nudge: (delta) => setVolume((muted ? 0 : volume) + delta) };
}
