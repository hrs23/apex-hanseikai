import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const base = await mkdtemp(join(tmpdir(), "apex-detect-"));
await build({ entryPoints: ["src/detect.ts"], bundle: true, platform: "node", format: "esm", outfile: join(base, "detect.mjs") });
const { matchEnds } = await import(join(base, "detect.mjs"));
after(() => rm(base, { recursive: true, force: true }));

function frames(count, bars, reds, buttons = []) {
  return Array.from({ length: count }, (_, index) => ({ time: index * 2, bar: bars.includes(index), red: reds.includes(index) || buttons.includes(index), button: buttons.includes(index) }));
}

test("takes the first red frame after a black bar and ignores a repeat within the same match", () => {
  assert.deepEqual(matchEnds(frames(300, [50, 51, 52, 60, 61, 62], [53, 54, 55, 63, 64, 65])), [106]);
});

test("needs a sustained bar and two red frames, except at the very end of the recording", () => {
  assert.deepEqual(matchEnds(frames(300, [50, 120, 121, 122], [51, 52, 53, 123])), []);
  assert.deepEqual(matchEnds(frames(300, [290, 291, 292], [])), [580]);
});

test("takes a sustained lobby button without a bar, as when the player was already spectating", () => {
  assert.deepEqual(matchEnds(frames(300, [50, 51, 52, 53], [], [59, 60, 61, 62, 63])), [118]);
  assert.deepEqual(matchEnds(frames(300, [], [], [59, 60, 61, 70, 71, 72])), []);
  assert.deepEqual(matchEnds(frames(300, [50, 51], [52, 53, 54], [52, 53, 54, 55, 56])), [104]);
});

test("joins a bar across a single dropped frame", () => {
  assert.deepEqual(matchEnds(frames(300, [50, 52], [53, 54, 55])), [106]);
});

test("counts red frames shown just before the bar turns black", () => {
  assert.deepEqual(matchEnds(frames(300, [50, 51, 52], [44, 46, 47])), [88]);
});
