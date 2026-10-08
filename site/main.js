import { lang, setLang, t } from "../web/src/lib/i18n.js";
import "./style.css";
import watchPartyJapanese from "../docs/public/screenshots/watch-party.jpg";
import watchPartyEnglish from "../docs/public/screenshots/watch-party-en.jpg";

const watchPartyImage = lang === "ja" ? watchPartyJapanese : watchPartyEnglish;

const repo = "https://github.com/hrs23/apex-hanseikai";
const guide = `${import.meta.env.BASE_URL}docs/${lang}/`;
document.documentElement.lang = lang;
document.querySelector("#app").innerHTML = `
  <header class="wrap header">
    <a class="brand" href="./">Apex Hanseikai</a>
    <nav aria-label="${t("Site navigation")}">
      <a href="${repo}">GitHub</a>
      <select aria-label="${t("Language")}" id="language">
        <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
        <option value="ja" ${lang === "ja" ? "selected" : ""}>日本語</option>
      </select>
    </nav>
  </header>
  <main class="wrap">
    <section class="hero">
      <h1>${t("Review together.\nPlan the next play.")}</h1>
      <a class="button" href="${guide}solo.html">${t("Try it alone")}</a>
    </section>
    <div class="product">
    <figure class="preview"><a href="${watchPartyImage}" target="_blank" rel="noopener"><img src="${watchPartyImage}" width="1280" height="1292" alt="${t("Example screen with player views, comments and drawing.")}" /></a></figure>
    <section class="features" aria-label="${t("Features")}">
      <article><h2>${t("Synced playback")}</h2></article>
      <article><h2>${t("All views. Any player.")}</h2></article>
      <article><h2>${t("Match end detection")}</h2></article>
      <article><h2>${t("Timed comments")}</h2></article>
      <article><h2>${t("Draw on screen")}</h2></article>
      <article><h2>${t("Scene links")}</h2></article>
    </section>
    </div>
    <section class="getting-started" id="start">
      <h2>${t("Get started")}</h2>
      <div class="setup-sections">
        <a class="setup-card" href="${guide}solo.html">
          <h3>${t("Solo")} ↗</h3>
          <p>${t("Try it with any MP4.")}</p>
        </a>
        <a class="setup-card" href="${guide}squad.html">
          <h3>${t("Squad of three (advanced)")} ↗</h3>
          <p>${t("Record everyone into one video and review it together.")}</p>
        </a>
      </div>
    </section>
  </main>
  <footer class="wrap"><span>Apex Hanseikai · <a href="${repo}">${t("Open source")}</a></span><a href="${repo}/blob/main/docs/development.md">${t("Development & API")}</a></footer>
`;
document.querySelector("#language").addEventListener("change", (event) => setLang(event.target.value));
