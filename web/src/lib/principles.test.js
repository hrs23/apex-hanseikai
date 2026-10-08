import { expect, it } from "vitest";
import { blocks, inline } from "./principles";

it("splits bold and highlight out of a line, including one inside the other", () => {
  expect(inline("声を**出して**、==固まる==")).toEqual([
    { text: "声を" },
    { bold: true, children: [{ text: "出して" }] },
    { text: "、" },
    { mark: true, children: [{ text: "固まる" }] },
  ]);
  expect(inline("**上は==先頭==で**")).toEqual([
    { bold: true, children: [{ text: "上は" }, { mark: true, children: [{ text: "先頭" }] }, { text: "で" }] },
  ]);
  expect(inline("**** == plain")).toEqual([{ text: "**** == plain" }]);
});

it("links only to a scene or an https page", () => {
  expect(inline("見る [▶ 10/6](#watch?rec=a%20b.mp4&t=33)")).toEqual([
    { text: "見る " },
    { href: "#watch?rec=a%20b.mp4&t=33", children: [{ text: "▶ 10/6" }] },
  ]);
  expect(inline("[x](https://example.com/a)")).toEqual([{ href: "https://example.com/a", children: [{ text: "x" }] }]);
  expect(inline("[x](javascript:alert(1))")).toEqual([{ text: "[x](javascript:alert(1)" }, { text: ")" }]);
  expect(inline("[x](http://example.com) [y](/other)")).toEqual([{ text: "[x](http://example.com)" }, { text: " " }, { text: "[y](/other)" }]);
});

it("turns Markdown lines into headings, lists and paragraphs", () => {
  expect(blocks("# 全体\n\n## 次回\n**一言**\n- a\n* b\n続き")).toEqual([
    { type: "heading", level: 1, text: "全体" },
    { type: "heading", level: 2, text: "次回" },
    { type: "paragraph", text: "**一言**" },
    { type: "list", items: ["a", "b"] },
    { type: "paragraph", text: "続き" },
  ]);
});
