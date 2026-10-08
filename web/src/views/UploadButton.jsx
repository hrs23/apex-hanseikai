import { Upload } from "lucide-react";
import { useState } from "react";
import { t } from "../lib/i18n";
import { RECORDING_NAME, recordingName, uploadRecording } from "../lib/recordings";

export default function UploadButton({ existing, onDone }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  async function choose(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const name = RECORDING_NAME.test(file.name) ? file.name : window.prompt(t("Recording name (YYYY-MM-DD hh-mm-ss.mp4)"), recordingName(new Date(file.lastModified)));
    if (!name) return;
    if (!RECORDING_NAME.test(name)) return setError(t("Recording names must look like YYYY-MM-DD hh-mm-ss.mp4."));
    if (existing.has(name)) return setError(t("A recording with this name already exists."));
    setError("");
    setProgress(0);
    try {
      await uploadRecording(file, name, setProgress);
      onDone();
    } catch (failure) {
      setError(t("Upload failed: {message}", { message: failure.message }));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="home-upload">
      <label className="home-entry-open">
        <Upload aria-hidden="true" />
        {progress === null ? t("Add recording") : t("Uploading {percent}%", { percent: Math.round(progress * 100) })}
        <input type="file" accept="video/mp4,.mp4" onChange={choose} disabled={progress !== null} hidden />
      </label>
      {error && <div className="row-error" role="alert">{error}</div>}
    </div>
  );
}
