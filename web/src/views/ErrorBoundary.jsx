import { Component } from "react";
import { t } from "../lib/i18n";
import { report } from "../lib/report";

const RELOAD_KEY = "errorboundary:reloaded";
const RELOAD_GAP_MS = 30_000;

function reloadedRecently() {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY)) < RELOAD_GAP_MS;
  } catch {
    return true;
  }
}

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    report("render-error", error, info?.componentStack);
    if (reloadedRecently()) return;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {}
    location.reload();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="inline-error" role="alert">
        <span>{t("Something went wrong.")}</span>
        <button onClick={() => location.reload()}>{t("Reload")}</button>
      </div>
    );
  }
}
