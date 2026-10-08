import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { principlesApi } from "../lib/api";
import { t } from "../lib/i18n";
import { LIMITS, blocks, inline } from "../lib/principles";
import { report } from "../lib/report";

const overallExample = () => [t("# Team"), t("**Talk, then ==move together==.**"), t("- Call the ==enemy position== and count"), t("- Cover each other when falling back"), t("## Next time"), t("- ==Plan the final ring early== [▶ 10/7](#watch?rec=2026-10-07%2021-00-00.mp4&t=3300)")].join("\n");
const personalExample = () => [t("# Role | Legend"), t("**The ==one thing== to fix first.**"), t("- Check both sides before moving out"), t("## Next time"), t("- ==Check the corner== before peeking [▶ 10/6](#watch?rec=2026-10-06%2021-00-00.mp4&t=1800)")].join("\n");

const EMPTY = ["", "", "", ""].map((body, slot) => ({ slot, body }));

function Inline({ text }) {
  const render = (nodes) => nodes.map((node, index) => {
    if (node.bold) return <strong key={index}>{render(node.children)}</strong>;
    if (node.mark) return <mark key={index}>{render(node.children)}</mark>;
    if (node.href) return node.href.startsWith("#") ? <a key={index} href={node.href}>{render(node.children)}</a> : <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">{render(node.children)}</a>;
    return node.text;
  });
  return render(inline(text));
}

function Rendered({ body }) {
  let leadUsed = false;
  return blocks(body).map((block, index) => {
    if (block.type === "heading") return block.level > 1 ? <h4 key={index}><Inline text={block.text} /></h4> : <h3 key={index}><Inline text={block.text} /></h3>;
    if (block.type === "list") return <ul key={index}>{block.items.map((item, at) => <li key={at}><Inline text={item} /></li>)}</ul>;
    const lead = !leadUsed;
    leadUsed = true;
    return <p key={index} className={lead ? "pb-lead" : undefined}><Inline text={block.text} /></p>;
  });
}

function Slot({ entry, locked, opened, onEdit, onSave }) {
  const [draft, setDraft] = useState(opened ? entry.body : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const view = useRef(null);
  const refocus = useRef(false);
  const countId = useId();
  const editing = draft !== null;
  const left = editing ? LIMITS.chars - [...draft.trim()].length : 0;
  const valid = left >= 0;

  useEffect(() => {
    if (!editing && refocus.current) view.current?.focus();
    refocus.current = false;
  }, [editing]);

  function start() {
    if (locked) return;
    setError("");
    setDraft(entry.body);
    onEdit(entry.slot);
  }

  function close() {
    refocus.current = true;
    setDraft(null);
    onEdit(null);
  }

  async function save() {
    if (!valid || saving) return;
    const body = draft.trim();
    if (body === entry.body) return close();
    setSaving(true);
    setError("");
    try {
      await onSave(entry.slot, body);
      close();
    } catch (failure) {
      setError(failure.details?.[0] || t("Could not save."));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape") close();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  }

  return (
    <article className={`pb-slot pb-${entry.slot}`}>
      {editing ? (
        <>
          <textarea autoFocus rows={Math.max(8, draft.split("\n").length + 1)} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={entry.slot === 0 ? overallExample() : personalExample()} aria-label={t("Edit principles")} aria-describedby={countId} />
          <div className="pb-foot">
            <span id={countId} className={left < 0 ? "pb-count over" : "pb-count"}>{t("{count} characters left", { count: left })}</span>
            <button type="button" onClick={close}>{t("Cancel")}</button>
            <button type="button" className="pb-save" disabled={!valid || saving} onClick={save}>{t("Save")}</button>
          </div>
        </>
      ) : (
        <div className="pb-view">
          {entry.body ? <Rendered body={entry.body} /> : <button type="button" className="pb-empty" disabled={locked} onClick={start}>{t("Write your principles")}</button>}
          <button ref={view} type="button" className="pb-edit" disabled={locked} aria-label={t("Edit principles")} title={t("Edit principles")} onClick={start}><Pencil aria-hidden="true" /></button>
        </div>
      )}
      {error && <div className="inline-error" role="alert"><span>{error}</span></div>}
    </article>
  );
}

export default function PrinciplesBoard() {
  const [entries, setEntries] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const editingRef = useRef(null);
  editingRef.current = editing;

  useEffect(() => {
    const load = () => principlesApi.list().then(setEntries).catch((failure) => report("principles-load", failure));
    load();
    const refresh = () => document.visibilityState === "visible" && editingRef.current === null && load();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  async function save(slot, body) {
    const saved = await principlesApi.save(slot, body);
    setEntries((list) => list.map((entry) => (entry.slot === saved.slot ? saved : entry)));
  }

  if (editing === null && entries.every((entry) => !entry.body)) {
    return (
      <section className="home-principles pb-minimal" aria-label={t("Principles")}>
        <button type="button" className="pb-start" onClick={() => setEditing(0)}><Pencil aria-hidden="true" />{t("Write your principles")}</button>
      </section>
    );
  }

  const slot = (entry) => <Slot key={entry.slot} entry={entry} locked={editing !== null && editing !== entry.slot} opened={editing === entry.slot} onEdit={setEditing} onSave={save} />;

  return (
    <section className="home-principles" aria-label={t("Principles")}>
      {slot(entries[0])}
      <div className="pb-people">{entries.slice(1).map(slot)}</div>
    </section>
  );
}
