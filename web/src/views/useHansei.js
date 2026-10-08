import { useEffect, useMemo, useRef, useState } from "react";
import { report } from "../lib/report";
import { hanseiApi } from "../lib/api";
import { t } from "../lib/i18n";
import { atFromSeconds, secondsFromAt } from "../lib/recordings";

const RELOAD_RETRIES = 3;

export function useHanseiEdits(recordingName, setList) {
  const [error, setError] = useState("");
  const latest = useRef(recordingName);
  latest.current = recordingName;
  const isCurrent = (name) => latest.current === name;

  async function create(at, body) {
    const name = latest.current;
    const saved = await hanseiApi.create(name, at, body);
    if (!isCurrent(name)) return false;
    setList((items) => [...items.filter((item) => item.id !== saved.id), saved]);
    return true;
  }

  async function attempt(message, action) {
    const name = latest.current;
    setError("");
    try {
      return await action();
    } catch (failure) {
      if (isCurrent(name)) setError(failure.details?.[0] || message);
      return false;
    }
  }

  return {
    error,
    setError,
    isCurrent,
    create,
    add: (at, body) => attempt(t("Could not add the note."), () => create(at, body)),
    save: (entry, body) => attempt(t("Could not save the note."), async () => {
      const saved = await hanseiApi.update(entry.id, body);
      setList((items) => items.map((item) => (item.id === saved.id ? saved : item)));
    }),
    remove: (entry) => window.confirm(t("Delete this note?")) && attempt(t("Could not delete the note."), async () => {
      await hanseiApi.remove(entry.id);
      setList((items) => items.filter((item) => item.id !== entry.id));
    }),
  };
}

export function useHansei(recording) {
  const [list, setList] = useState([]);
  const edits = useHanseiEdits(recording?.name, setList);
  const { isCurrent, setError } = edits;
  const toAt = (seconds) => (seconds === null ? null : atFromSeconds(recording.startedAt, seconds));

  function reload(name, attempt = 0) {
    return hanseiApi.list(name)
      .then((items) => {
        if (!isCurrent(name)) return;
        setList(items);
        setError("");
      })
      .catch((error) => {
        if (!isCurrent(name)) return;
        report("hansei-load", error, name);
        if (attempt < RELOAD_RETRIES) setTimeout(() => isCurrent(name) && reload(name, attempt + 1), 3000 * (attempt + 1));
        else setError(t("Could not load notes."));
      });
  }

  useEffect(() => {
    if (!recording) return;
    setList([]);
    setError("");
    reload(recording.name);
  }, [recording?.name]);

  const entries = useMemo(
    () =>
      list
        .map((entry) => ({ ...entry, seconds: entry.at && recording ? secondsFromAt(entry.at, recording.startedAt) : null }))
        .sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || a.id - b.id),
    [list, recording],
  );

  return {
    ...edits,
    entries,
    post: (seconds, text) => edits.create(toAt(seconds), text),
    add: (seconds, text) => edits.add(toAt(seconds), text),
    reloadIfCurrent: (name) => isCurrent(name) && reload(name),
  };
}
