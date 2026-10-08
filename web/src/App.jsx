import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, House, Play } from "lucide-react";
import HomeView from "./views/HomeView";
import WatchView from "./views/WatchView";
import { copyText } from "./lib/clipboard";
import { lang, setLang, t } from "./lib/i18n";
import { useConfig } from "./lib/recordings";

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const view = hash.startsWith("#watch") ? "watch" : "home";
  const title = useConfig()?.title ?? "";
  const [copied, setCopied] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiRef = useRef(null);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!aiOpen) return;
    const close = (event) => (event.type === "keydown" ? event.key === "Escape" : !aiRef.current?.contains(event.target)) && setAiOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [aiOpen]);

  function changeView(next) {
    window.location.hash = next === "home" ? "" : next;
  }

  const prompt = [t("Try the API and show me what I can do."), t("Guide: {url}", { url: `${location.origin}/llms.txt` }), t("API: {url}", { url: `${location.origin}/openapi.json` })].join("\n");

  async function copyPrompt() {
    setCopied(await copyText(prompt));
    setTimeout(() => setCopied(false), 2000);
  }

  const tab = (name, title, Icon) => (
    <button title={title} className={view === name ? "active" : ""} onClick={() => changeView(name)} aria-current={view === name ? "page" : undefined}>
      <Icon aria-hidden="true" /><span>{title}</span>
    </button>
  );

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <button className="brand" onClick={() => changeView("home")} aria-label={t("Open Home")}>{title}</button>
            <div className="ai-wrap" ref={aiRef}>
              <button className="header-ai" onClick={() => setAiOpen(!aiOpen)} aria-expanded={aiOpen} aria-label={t("Prompt for your AI")} title={t("Prompt for your AI")}><Bot aria-hidden="true" /></button>
              {aiOpen && (
                <div className="ai-pop" role="dialog" aria-label={t("Prompt for your AI")}>
                  <span className="ai-label">{t("Paste into your AI")}</span>
                  <div className="ai-box">
                    <pre>{prompt}</pre>
                    <button type="button" onClick={copyPrompt} aria-label={t("Copy")} title={t("Copy")}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="header-right">
            <nav className="header-tabs" aria-label={t("Pages")}>
              {tab("home", t("Home"), House)}
              {tab("watch", t("Watch"), Play)}
            </nav>
            <a className="header-link" href="/docs">API</a>
            <select className="header-link" value={lang} onChange={(event) => setLang(event.target.value)} aria-label="Language">
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
      </header>
      {view === "home" ? <HomeView /> : <WatchView key={hash} />}
    </>
  );
}
