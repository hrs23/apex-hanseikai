import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { isSubmitKey } from "../lib/format";
import { t } from "../lib/i18n";

export function PageState({ state, onRetry }) {
  if (state === "loading") {
    return <LoaderCircle className="page-spinner spin" role="status" aria-label={t("Loading")} />;
  }
  if (state === "error") {
    return (
      <div className="inline-error" role="alert">
        <span>{t("Could not load.")}</span>
        <button onClick={onRetry}>{t("Retry")}</button>
      </div>
    );
  }
  return null;
}

export function HanseiItem({ entry, time, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);

  async function save() {
    const body = draft.trim();
    setDraft(null);
    if (body && body !== entry.body) await onSave(entry, body);
  }

  function onKeyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape") setDraft(null);
    if (isSubmitKey(event)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <li className={time ? undefined : "untimed"}>
      {time}
      {draft === null ? (
        <span className="hansei-body" role="button" tabIndex={0} title={t("Edit")} onClick={() => setDraft(entry.body)} onKeyDown={(event) => event.key === "Enter" && setDraft(entry.body)}>{entry.body}</span>
      ) : (
        <textarea className="hansei-edit" autoFocus rows={1} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} onBlur={save} aria-label={t("Edit note")} />
      )}
      <button type="button" className="hansei-delete" onClick={() => onDelete(entry)} aria-label={t("Delete")} title={t("Delete")}><Trash2 aria-hidden="true" /></button>
    </li>
  );
}
