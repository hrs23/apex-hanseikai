import { useEffect, useMemo, useState } from "react";
import { hanseiApi } from "../lib/api";
import { t } from "../lib/i18n";
import { buildRecordings, loadRecordings, useConfig, watchRecordings } from "../lib/recordings";
import { report } from "../lib/report";
import PrinciplesBoard from "./PrinciplesBoard";
import RecordingRow from "./RecordingRow";
import UploadButton from "./UploadButton";
import { PageState } from "./shared";

export default function HomeView() {
  const [files, setFiles] = useState([]);
  const config = useConfig();
  const [hansei, setHansei] = useState([]);
  const [state, setState] = useState("loading");

  const recordings = useMemo(() => buildRecordings(files, hansei), [files, hansei]);

  async function fetchHome() {
    const [entries, recordings] = await Promise.all([hanseiApi.list(), loadRecordings()]);
    setHansei(entries);
    setFiles(recordings);
    setState("ready");
  }

  function loadHome() {
    setState("loading");
    fetchHome().catch(() => setState("error"));
  }

  useEffect(() => {
    loadHome();
    function refresh() {
      if (document.visibilityState === "visible") fetchHome().catch((error) => report("home-refresh", error));
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  useEffect(() => watchRecordings(() => loadRecordings().then(setFiles).catch((error) => report("home-refresh", error))), []);

  return (
    <main className="page-shell home-page">
      <section className="home-banner" aria-labelledby="home-title">
        <img src="/banner.webp" alt="" />
        <div className="home-banner-copy">
          <h1 id="home-title">{config?.title}</h1>
        </div>
      </section>
      <PrinciplesBoard />
      <section className="home-recordings" aria-labelledby="recordings-title">
        <h2 id="recordings-title">{t("Recordings")}</h2>
        <UploadButton existing={new Set(files.map((file) => file.name))} onDone={() => loadRecordings().then(setFiles).catch(() => {})} />
        <div role="region" aria-label={t("Recordings")}>
          <PageState state={state} onRetry={loadHome} />
          {state === "ready" && (recordings.length === 0 ? (
            <div className="empty-state"><strong>{t("No recordings yet")}</strong></div>
          ) : (
            <div className="home-recording-rows">
              {recordings.map((recording) => (
                <RecordingRow key={recording.name} recording={recording} setHansei={setHansei} />
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
