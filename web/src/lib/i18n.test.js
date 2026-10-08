import { readdirSync, readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("has Japanese for every text in the UI and falls back to English elsewhere", async () => {
  const texts = readdirSync("src", { recursive: true })
    .filter((name) => /\.jsx?$/.test(name) && !name.includes(".test."))
    .flatMap((name) => [...readFileSync(`src/${name}`, "utf8").matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]));
  expect(texts.length).toBeGreaterThan(100);
  const english = await import("./i18n");
  expect(english.lang).toBe("en");
  expect(english.t("Volume {percent}%", { percent: 40 })).toBe("Volume 40%");
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
  vi.resetModules();
  const japanese = await import("./i18n");
  expect(japanese.lang).toBe("ja");
  expect(japanese.t("Volume {percent}%", { percent: 40 })).toBe("音量 40%");
  expect(texts.filter((text) => japanese.t(text) === text)).toEqual([]);
  localStorage.setItem("lang", "en");
  vi.resetModules();
  expect((await import("./i18n")).lang).toBe("en");
  localStorage.removeItem("lang");
});
