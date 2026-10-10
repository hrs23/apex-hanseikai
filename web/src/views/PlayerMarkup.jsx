import { Download, Expand, GripVertical, Link2, LoaderCircle, MessageSquare, Pause, Play, RectangleHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { t } from "../lib/i18n";
import { RATES } from "../player";

const shortcuts = () => [
  ["Space K", t("Play / Pause")],
  ["← →", t("Back / forward 5s (Shift: 1s)")],
  ["J L", t("Back / forward 10s (Shift: 1m)")],
  ["Ctrl+← Ctrl+→", t("Back / forward 1m")],
  ["< >", t("Slower / faster")],
  ["M ↑ ↓", t("Mute / volume up / down")],
  [`F ${t("Double-click")}`, t("Fullscreen")],
  ["T", t("Fill the window")],
  [t("Double-tap"), t("Skip 10 seconds (touch)")],
  ["0 1 2 3 4", t("All / each player")],
  ["Tab", t("All ⇔ previous player")],
  ["C", t("Add a note at the current time")],
  [t("Drag"), t("Draw on the paused picture")],
  ["X", t("Erase the lines")],
  ["Q E", t("Previous / next note")],
  ["A D", t("Previous / next match end, 60s earlier")],
  ["Shift+P Shift+N", t("Older / newer recording")],
  ["? Esc", t("Shortcuts / close")],
];

export default function PlayerMarkup({ picker, sync, recording }) {
  return (
    <>
      <div id="player" className="pl-player">
        <div className="pl-toolbar">
          {picker}
          <div id="views" className="pl-views" role="group" aria-label={t("View")} hidden />
          <span className="pl-spacer" />
          {sync}
        </div>
        <div id="help" hidden>
          <div className="pl-help-panel">
          <button id="helpClose" type="button" aria-label={t("Close shortcuts")} title={t("Close (Esc)")}><X aria-hidden="true" /></button>
          <table>
            <tbody>
              {shortcuts().map(([keys, text]) => (
                <tr key={keys}>
                  <td>{keys.split(" ").map((key) => <kbd key={key}>{key}</kbd>)}</td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div id="stage">
          <video id="video" tabIndex={0} aria-label={t("Recording player")} playsInline />
          <svg id="ink" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" />
          <div id="notes" />
          <div id="osd" role="status" aria-live="polite" />
          <div id="bezel" className="pl-bezel" data-state="play"><Play className="when-play" aria-hidden="true" /><Pause className="when-pause" aria-hidden="true" /></div>
          <div id="state" className="pl-state" hidden><LoaderCircle className="spin" aria-hidden="true" /></div>
          <div id="seekBack" className="pl-seek-feedback" hidden />
          <div id="seekForward" className="pl-seek-feedback" hidden />
          <div id="quick" hidden>
            <span id="quickGrip" aria-hidden="true"><GripVertical /></span>
            <label className="pl-time-option"><input id="quickTime" type="checkbox" defaultChecked />{t("Time")}<span id="quickAt" /></label>
            <textarea id="quickBody" rows={1} maxLength={500} placeholder={t("Note (Enter to add · Esc to close)")} aria-label={t("Note")} />
            <button id="quickClose" type="button" title={t("Close (Esc)")} aria-label={t("Close note input")}><X aria-hidden="true" /></button>
          </div>
        </div>
        <div id="controls">
          <div id="seekwrap">
            <div id="eventLane" aria-label={t("Events")} />
            <div id="seekbar">
              <div id="buffered" />
              <input id="seek" type="range" min="0" max="0" step="0.1" defaultValue="0" aria-label={t("Seek")} />
            </div>
            <div id="preview" hidden>
              <div id="pvimg" hidden />
              <span id="pvtime" />
            </div>
          </div>
          <div id="row">
            <div className="pl-group">
              <button id="play" type="button" data-state="paused" title={t("Play / Pause (Space)")} aria-label={t("Play / Pause")}>
                <Play className="when-paused" aria-hidden="true" />
                <Pause className="when-playing" aria-hidden="true" />
              </button>
              <span id="time">0:00 / 0:00</span>
              <span id="matchNo" title={t("Current match based on match end markers")} />
            </div>
            <span className="pl-spacer" />
            <div className="pl-group">
              <select id="rate" defaultValue="1" aria-label={t("Speed")}>
                {RATES.map((r) => <option key={r} value={r}>{r}x</option>)}
              </select>
              <select id="quality" aria-label={t("Quality")} hidden><option value="high" /><option value="low" /></select>
              <span className="pl-group">
                <button id="mute" type="button" data-state="on" title={t("Mute (M)")} aria-label={t("Mute")}>
                  <Volume2 className="when-on" aria-hidden="true" />
                  <VolumeX className="when-muted" aria-hidden="true" />
                </button>
                <input id="vol" type="range" min="0" max="1" step="0.05" defaultValue="1" aria-label={t("Volume")} />
              </span>
              <a href={`/media/rec/${encodeURIComponent(recording)}`} download={recording} title={t("Download recording")} aria-label={t("Download recording")}><Download aria-hidden="true" /></a>
              <button id="quickBtn" type="button" title={t("Add a note at the current time (C)")} aria-label={t("Note")}><MessageSquare aria-hidden="true" /></button>
              <button id="link" type="button" title={t("Copy link to this moment")} aria-label={t("Copy link to this moment")}><Link2 aria-hidden="true" /></button>
              <button id="fill" type="button" title={t("Fill the window (T)")} aria-label={t("Fill the window")}><RectangleHorizontal aria-hidden="true" /></button>
              <button id="fs" type="button" title={t("Fullscreen (F)")} aria-label={t("Fullscreen")}><Expand aria-hidden="true" /></button>
              <button id="helpBtn" type="button" title={t("Shortcuts (?)")} aria-label={t("Shortcuts")}>?</button>
            </div>
          </div>
          <div className="pl-skips">
            {[-60, -5, 5, 60].map((n) => <button key={n} type="button" data-skip={n} aria-label={n < 0 ? t("Back {n} seconds", { n: -n }) : t("Forward {n} seconds", { n })}>{n < 0 ? "−" : "+"}{Math.abs(n) === 60 ? "1m" : `${Math.abs(n)}s`}</button>)}
          </div>
        </div>
      </div>
      <div id="msg" role="status" hidden />
      <audio id="voice" preload="auto" />
    </>
  );
}
