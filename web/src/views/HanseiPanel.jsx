import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { formatTime, isSubmitKey } from "../lib/format";
import { t } from "../lib/i18n";
import { HanseiItem } from "./shared";

export default function HanseiPanel({ hansei, getTime, focusPlayer, onJump }) {
  const { entries, error, add, save, remove } = hansei;
  const [body, setBody] = useState("");
  const [untimed, setUntimed] = useState(false);

  function submitOnEnter(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      focusPlayer();
      return;
    }
    if (isSubmitKey(event)) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }

  async function submit(event) {
    event.preventDefault();
    const submitted = body;
    if (!(await add(untimed ? null : getTime(), submitted))) return;
    setBody((current) => (current === submitted ? "" : current));
    focusPlayer();
  }

  return (
    <section className="pl-hansei" aria-label={t("Notes")}>
      <h2><MessageSquare aria-hidden="true" />{t("Notes")}<span>{entries.length}</span></h2>
      <ol className="hansei-list">
        {entries.map((entry) => (
          <HanseiItem
            key={entry.id}
            entry={entry}
            time={entry.seconds !== null && <button type="button" className="hansei-time" onClick={() => onJump(entry.seconds)}>{formatTime(entry.seconds)}</button>}
            onSave={save}
            onDelete={remove}
          />
        ))}
      </ol>
      {error && <div className="row-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <label className="pl-time-option"><input type="checkbox" checked={!untimed} onChange={(event) => setUntimed(!event.target.checked)} />{t("Time")}</label>
        <textarea className="pl-body" rows={2} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={submitOnEnter} maxLength={500} placeholder={untimed ? t("Note for this video (Enter to add · Esc to return)") : t("Note at the current time (Enter to add · Esc to return)")} aria-label={t("Note")} required />
        <button type="submit"><Send aria-hidden="true" />{t("Add note")}</button>
      </form>
    </section>
  );
}
