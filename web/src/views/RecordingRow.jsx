import { Download, Play, Plus, Send } from "lucide-react";
import { useState } from "react";
import { THUMB, audioUrl, formatDuration, formatTime, stem, thumbTile } from "../lib/format";
import { t } from "../lib/i18n";
import { playable, secondsFromAt, stateLabel } from "../lib/recordings";
import { HanseiItem } from "./shared";
import { useHanseiEdits } from "./useHansei";

const watchHref = (file) => `#watch?rec=${encodeURIComponent(file.name)}`;

function Thumbnail({ recording }) {
  const { file } = recording;
  if (!file || !playable(file)) return <span className="home-recording-thumbnail"><span className="home-thumb-sprite" /></span>;
  const { sheet, col, row } = thumbTile((file.duration || 0) / 2);
  const last = THUMB.cols - 1;
  const sprite = file.thumbnails
    ? { backgroundImage: `url("${audioUrl(stem(file.name), `thumbs_${sheet}.jpg`)}")`, backgroundSize: `${THUMB.cols * 100}% ${THUMB.cols * 100}%`, backgroundPosition: `${col / last * 100}% ${row / last * 100}%` }
    : undefined;
  return (
    <a className="home-recording-thumbnail" href={watchHref(file)} aria-label={t("Watch {name}", { name: stem(file.name) })}>
      <span className="home-thumb-sprite" style={sprite} />
    </a>
  );
}

function timeLink(entry, file) {
  if (!entry.at || !file) return null;
  const seconds = Math.max(0, Math.floor(secondsFromAt(entry.at, file.startedAt) + 1e-6));
  return <a className="hansei-time" href={`${watchHref(file)}&t=${seconds}`}>{formatTime(seconds)}</a>;
}

function HanseiSection({ recording, setHansei }) {
  const { hansei } = recording;
  const { error, add, save, remove } = useHanseiEdits(recording.name, setHansei);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    if (await add(null, body)) setText("");
    setSaving(false);
  }

  return (
    <div className="home-entries">
      {hansei.length > 0 && (
        <ol className="hansei-list home-hansei" aria-label={t("Notes")}>
          {hansei.map((entry) => (
            <HanseiItem key={entry.id} entry={entry} time={timeLink(entry, recording.file)} onSave={save} onDelete={remove} />
          ))}
        </ol>
      )}
      {error && <div className="row-error" role="alert">{error}</div>}
      {open ? (
        <form className="home-entry-form" onSubmit={submit}>
          <input autoFocus value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)} maxLength={500} placeholder={t("Note")} aria-label={t("Add note for {name}", { name: stem(recording.file.name) })} />
          <button type="submit" disabled={saving || !text.trim()}><Send aria-hidden="true" />{t("Add note")}</button>
        </form>
      ) : recording.file && (
        <div className="home-entry-add">
          <button type="button" className="home-entry-open" onClick={() => setOpen(true)}><Plus aria-hidden="true" />{t("Add note")}</button>
        </div>
      )}
    </div>
  );
}

export default function RecordingRow({ recording, setHansei }) {
  const { file } = recording;
  const watch = file && playable(file);
  const id = `recording-${encodeURIComponent(recording.name)}`;
  return (
    <article aria-labelledby={id}>
      <Thumbnail recording={recording} />
      <div className="home-recording-info">
        <h3 id={id}>{watch ? <a href={watchHref(file)}>{stem(recording.name)}</a> : stem(recording.name)}</h3>
        <span>{[formatDuration(file?.duration), stateLabel(file?.state)].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="home-recording-actions">
        {watch && (
          <a href={watchHref(file)}>
            <Play aria-hidden="true" />
            {t("Watch")}
          </a>
        )}
        {watch && <a className="home-recording-download" href={`/media/rec/${encodeURIComponent(file.name)}`} download={file.name} title={t("Download recording")} aria-label={t("Download recording")}><Download aria-hidden="true" /></a>}
      </div>
      <HanseiSection recording={recording} setHansei={setHansei} />
    </article>
  );
}
