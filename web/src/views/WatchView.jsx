import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { loadRecordings, playable } from "../lib/recordings";
import { stem } from "../lib/format";
import { createPlayer } from "../player";
import "../player/player.css";
import HanseiPanel from "./HanseiPanel";
import PlayerMarkup from "./PlayerMarkup";
import { report } from "../lib/report";
import { PageState } from "./shared";
import { useHansei } from "./useHansei";

const LOAD_RETRIES = 3;
const loadPlayable = () => loadRecordings().then((all) => all.filter(playable));

function parseHash() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return { rec: params.get("rec") || "", t: Number(params.get("t")) || 0, v: Number(params.get("v")) || 0, sync: params.get("sync") === "1" };
}

function writeHash(name, sync) {
  window.history.replaceState(null, "", sync || !name ? "#watch?sync=1" : `#watch?rec=${encodeURIComponent(name)}`);
}

export default function WatchView() {
  const rootRef = useRef(null);
  const playerRef = useRef(null);
  const stepRef = useRef(() => {});
  const [recordings, setRecordings] = useState([]);
  const [state, setState] = useState("loading");
  const [selected, setSelected] = useState("");
  const [syncOn, setSyncOn] = useState(() => parseHash().sync);
  const [viewers, setViewers] = useState(0);
  const loadAttempts = useRef(0);
  const recording = recordings.find((item) => item.name === selected) ?? null;
  const hansei = useHansei(recording);
  const hanseiRef = useRef(hansei);
  hanseiRef.current = hansei;

  async function load() {
    if (!loadAttempts.current) setState("loading");
    try {
      const list = await loadPlayable();
      setRecordings(list);
      setSelected((list.find((item) => item.name === parseHash().rec) ?? list[0])?.name || "");
      loadAttempts.current = 0;
      setState("ready");
    } catch (error) {
      report("watch-load", error);
      if (loadAttempts.current < LOAD_RETRIES) setTimeout(load, 2000 * ++loadAttempts.current);
      else setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (state !== "ready" || !selected || !rootRef.current) return undefined;
    const { rec, t, v } = parseHash();
    playerRef.current = createPlayer(rootRef.current, {
      recording: selected,
      startAt: rec === selected ? t : 0,
      view: v,
      sync: syncOn,
      onViewers: setViewers,
      onHansei: (seconds, text) => hanseiRef.current.post(seconds, text),
      onHanseiChange: (name) => hanseiRef.current.reloadIfCurrent(name),
      onStep: (direction) => stepRef.current(direction),
      onRemoteRecording: (name) => {
        setSelected(name);
        writeHash(name, true);
        playerRef.current?.load(name, false);
        loadPlayable().then(setRecordings).catch((error) => report("recordings-refresh", error));
      },
    });
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [state]);

  useEffect(() => {
    playerRef.current?.setHansei(hansei.entries.filter((entry) => entry.seconds !== null));
  }, [hansei.entries, state]);

  function toggleSync() {
    const next = !syncOn;
    setSyncOn(next);
    writeHash(selected, next);
    playerRef.current?.setSync(next);
  }

  function choose(name) {
    setSelected(name);
    playerRef.current?.load(name);
    playerRef.current?.focus();
    writeHash(name, syncOn);
  }

  const index = recordings.findIndex((item) => item.name === selected);
  const older = recordings[index + 1]?.name;
  const newer = recordings[index - 1]?.name;
  stepRef.current = (direction) => {
    const name = direction > 0 ? newer : older;
    if (name) choose(name);
  };

  function jump(seconds) {
    playerRef.current?.seek(seconds);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="page-shell player-page">
      <PageState state={state} onRetry={load} />
      {state === "ready" && recordings.length === 0 && <div className="empty-state"><strong>{t("No recordings yet")}</strong></div>}
      {state === "ready" && recordings.length > 0 && (
        <div ref={rootRef} className={`pl-root${syncOn ? " is-sync" : ""}`}>
          <PlayerMarkup
            recording={selected}
            picker={
              <div className="pl-recording">
                <button type="button" onClick={() => choose(older)} disabled={!older} title={t("Older recording (Shift+P)")} aria-label={t("Older recording")}><ChevronLeft aria-hidden="true" /></button>
                <select className="pl-picker" value={selected} onChange={(event) => choose(event.target.value)} aria-label={t("Recording")}>
                  {recordings.map((item) => <option key={item.name} value={item.name}>{stem(item.name)}</option>)}
                </select>
                <button type="button" onClick={() => choose(newer)} disabled={!newer} title={t("Newer recording (Shift+N)")} aria-label={t("Newer recording")}><ChevronRight aria-hidden="true" /></button>
              </div>
            }
            sync={
              <button
                type="button"
                className={`pl-sync${syncOn ? " is-on" : ""}`}
                onClick={toggleSync}
                aria-pressed={syncOn}
                aria-label={t("Watch Party ({state}), {count} watching", { state: syncOn ? t("on") : t("off"), count: viewers })}
                title={syncOn ? t("In the party. Click to leave") : t("Watch together: recording, player view and playback stay in sync")}
              >
                <Users aria-hidden="true" />
                Watch Party
                <span className="pl-sync-count">{viewers}</span>
              </button>
            }
          />
          <HanseiPanel hansei={hansei} getTime={() => playerRef.current?.time() ?? 0} focusPlayer={() => playerRef.current?.focus()} onJump={jump} />
        </div>
      )}
    </main>
  );
}
