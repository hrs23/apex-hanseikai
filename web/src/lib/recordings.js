import { useEffect, useState } from "react";
import { loadConfig } from "./config";
import { t } from "./i18n";

let cache = null;

export function loadRecordings() {
  cache ??= fetch("/api/recordings", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Could not load recordings");
      return response.json();
    })
    .then((payload) => (Array.isArray(payload.recordings) ? payload.recordings : []))
    .finally(() => { cache = null; });
  return cache;
}

function useLoaded(load, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let active = true;
    load().then((loaded) => active && setValue(loaded));
    return () => {
      active = false;
    };
  }, []);
  return value;
}

export const useConfig = () => useLoaded(loadConfig, null);

export function watchRecordings(onChange) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const source = new EventSource(`/sync/stream?client=${id}`);
  source.addEventListener("recordings", onChange);
  return () => source.close();
}

export const playable = (file) => file.state !== "recording";
export const stateLabel = (state) => (state === "recording" ? t("Recording in progress") : state === "processing" ? t("Processing") : "");

const pad = (n) => String(n).padStart(2, "0");
export const RECORDING_NAME = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.mp4$/;
export const recordingName = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.mp4`;

export function uploadRecording(file, name, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `/media/rec/${encodeURIComponent(name)}`);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => (request.status === 201 ? resolve() : reject(new Error(JSON.parse(request.responseText || "{}").error || `HTTP ${request.status}`)));
    request.onerror = () => reject(new Error(t("Network error")));
    request.send(file);
  });
}

export const atFromSeconds = (startedAt, seconds) => new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
export const secondsFromAt = (at, startedAt) => (Date.parse(at) - Date.parse(startedAt)) / 1000;

const byTime = (a, b) => Number(!a.at) - Number(!b.at) || (a.at ?? "").localeCompare(b.at ?? "") || a.id - b.id;

export function buildRecordings(files, hansei) {
  const rows = new Map(files.map((file) => [file.name, { name: file.name, file, hansei: [] }]));
  for (const entry of hansei) {
    if (!rows.has(entry.recording)) rows.set(entry.recording, { name: entry.recording, file: null, hansei: [] });
    rows.get(entry.recording).hansei.push(entry);
  }
  const all = [...rows.values()];
  for (const row of all) row.hansei.sort(byTime);
  return all.sort((a, b) => b.name.localeCompare(a.name));
}
