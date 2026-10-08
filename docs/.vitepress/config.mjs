const pages = ["index", "solo", "squad", "reference"];
const labels = {
  en: ["Get started", "Solo", "Squad of three (advanced)", "Reference"],
  ja: ["はじめかた", "1人で使う", "3人で使う（応用）", "リファレンス"],
};
const locale = (lang) => ({
  label: lang === "ja" ? "日本語" : "English",
  lang,
  link: `/${lang}/`,
  themeConfig: {
    nav: [{ text: lang === "ja" ? "トップ" : "Home", link: "/../", target: "_self" }],
    sidebar: [{ items: pages.map((page, i) => ({ text: labels[lang][i], link: `/${lang}/${page === "index" ? "" : page}` })) }],
    outline: { label: lang === "ja" ? "このページ" : "On this page" },
    docFooter: { prev: lang === "ja" ? "前へ" : "Previous", next: lang === "ja" ? "次へ" : "Next" },
    sidebarMenuLabel: lang === "ja" ? "メニュー" : "Menu",
    returnToTopLabel: lang === "ja" ? "ページ上部へ" : "Return to top",
    darkModeSwitchLabel: lang === "ja" ? "テーマ" : "Appearance",
    editLink: { pattern: "https://github.com/hrs23/apex-hanseikai/edit/main/docs/:path", text: lang === "ja" ? "GitHubで編集" : "Edit on GitHub" },
  },
});

export default {
  vite: { optimizeDeps: { exclude: ["@theme/index"] } },
  title: "Apex Hanseikai",
  description: "Setup and Watch Party guides",
  base: "/apex-hanseikai/docs/",
  outDir: "../site-dist/docs",
  locales: { en: locale("en"), ja: locale("ja") },
  themeConfig: {
    search: { provider: "local", options: { miniSearch: { options: { tokenize: (text) => [...new Intl.Segmenter("ja", { granularity: "word" }).segment(text)].filter((part) => part.isWordLike).map((part) => part.segment) } }, locales: { ja: { translations: { button: { buttonText: "検索", buttonAriaLabel: "検索" }, modal: { noResultsText: "見つかりませんでした", resetButtonTitle: "検索をクリア", footer: { selectText: "選択", navigateText: "移動", closeText: "閉じる" } } } } } } },
    socialLinks: [{ icon: "github", link: "https://github.com/hrs23/apex-hanseikai" }],
  },
  head: [["style", {}, ":root{--vp-c-brand-1:#527b30;--vp-c-brand-2:#638e3d;--vp-c-brand-3:#527b30}.dark{--vp-c-brand-1:#c7ed91;--vp-c-brand-2:#b8dc84;--vp-c-brand-3:#95bb60;--vp-c-bg:#111513;--vp-c-bg-alt:#191f1a;--vp-c-bg-soft:#1b221c}"]],
};
