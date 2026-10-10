import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtemp, mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const base = await mkdtemp(join(tmpdir(), "apex-derived-"));
await build({ entryPoints: ["src/derived.ts"], bundle: true, platform: "node", format: "esm", outfile: join(base, "derived.mjs") });
const { DerivedCache, readMetadata } = await import(join(base, "derived.mjs"));
after(() => rm(base, { recursive: true, force: true }));
const name = "2026-09-27 21-00-00.mp4";
async function fixture() {
  const root = await mkdtemp(join(base, "case-"));
  const recordingsDir = join(root, "rec");
  const cacheDir = join(root, "audio");
  await mkdir(recordingsDir); await mkdir(cacheDir);
  const file = join(recordingsDir, name);
  await writeFile(file, "video");
  let now = Date.now();
  await utimes(file, new Date(now - 600_000), new Date(now - 600_000));
  const calls = [];
  let fail = false;
  let onGenerate = async () => {};
  const execute = async (command, args, signal) => {
    calls.push(command);
    if (command === "ffprobe") return JSON.stringify({ format: { duration: 120 }, streams: [{ codec_type: "audio", index: 0 }] });
    for (const [, file] of (args[args.indexOf("-filter_complex") + 1] ?? "").matchAll(/file=([^,[]+)/g)) await writeFile(file, "");
    if (!args.at(-1).endsWith(".jpg")) return "";
    if (fail) throw new Error("thumbnail failure");
    await onGenerate(signal);
    await writeFile(join(dirname(args.at(-1)), "thumbs_0.jpg"), "image");
    return "";
  };
  const cache = new DerivedCache({ recordingsDir, cacheDir }, execute, () => now);
  return { cache, calls, file, recordingsDir, dir: join(cacheDir, name.slice(0, -4)), advance: (ms) => { now += ms; }, fail: (v) => { fail = v; }, onGenerate: (fn) => { onGenerate = fn; }, now: () => now };
}
test("generates once and rebuilding after source replacement uses the new source", async () => {
  const f = await fixture();
  f.cache.enqueue(name); await f.cache.idle();
  const meta = await readMetadata(f.dir);
  assert.equal(meta.tracks, 1); assert.equal(meta.duration, 120); assert.equal(meta.thumbs.sheets, 1);
  const count = f.calls.length;
  f.cache.enqueue(name); await f.cache.idle(); assert.equal(f.calls.length, count);
  await writeFile(f.file, "different video");
  await utimes(f.file, new Date(f.now() - 400_000), new Date(f.now() - 400_000));
  f.cache.enqueue(name); await f.cache.idle();
  assert.notEqual((await readMetadata(f.dir)).source.size, meta.source.size);
  assert.ok(f.calls.length > count);
});
test("waits during recording, then generates", async () => {
  const f = await fixture();
  await utimes(f.file, new Date(f.now()), new Date(f.now()));
  f.cache.enqueue(name); await f.cache.idle(); assert.equal(f.calls.length, 0);
  f.advance(30_001); f.cache.enqueue(name); await f.cache.idle();
  assert.equal((await readMetadata(f.dir)).tracks, 1);
});
test("reports recording, processing and ready, names players after the audio tracks and says when something changed", async () => {
  const f = await fixture();
  let changes = 0;
  const cache = new DerivedCache({ recordingsDir: f.recordingsDir, cacheDir: join(f.dir, "..") }, async (command, args) => {
    if (command === "ffprobe") return JSON.stringify({ format: { duration: 120, tags: { creation_time: "2026-09-27T12:00:03.000000Z" } }, streams: [{ codec_type: "video" }, { codec_type: "audio" }, { codec_type: "audio" }, { codec_type: "audio" }] });
    for (const [, file] of (args[args.indexOf("-filter_complex") + 1] ?? "").matchAll(/file=([^,[]+)/g)) await writeFile(file, "");
    if (args.at(-1).endsWith(".jpg")) await writeFile(join(dirname(args.at(-1)), "thumbs_0.jpg"), "image");
    return "";
  }, f.now, () => { changes++; });
  assert.equal(cache.state(null, await cache.writing(name, { mtimeMs: f.now() })), "recording");
  const box = (type, ...parts) => { const body = Buffer.concat(parts.map((part) => Buffer.from(part))); const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4, "latin1"); return Buffer.concat([head, body]); };
  const trak = (handler, name) => box("trak", box("mdia", box("hdlr", Buffer.alloc(8), handler)), ...(name ? [box("udta", box("name", name))] : []));
  await writeFile(f.file, Buffer.concat([box("ftyp", "isom"), box("mdat", "x"), box("moov", box("mvhd", "x"), trak("vide", "video"), trak("soun", "Mix"), trak("soun", " Ann "), trak("soun"))]));
  await utimes(f.file, new Date(f.now() - 600_000), new Date(f.now() - 600_000));
  let meta = await cache.metadata(name);
  assert.deepEqual(meta.players, ["Ann", "Player 2"]);
  assert.equal(meta.startedAt, "2026-09-27T12:00:03.000Z");
  assert.equal(cache.state(meta, false), "processing");
  await cache.scan(); await cache.idle();
  meta = await readMetadata(f.dir);
  assert.deepEqual(meta.matchEnds, []);
  assert.equal(cache.state(meta, false), "ready");
  assert.equal(changes, 7);
  await cache.scan(); await cache.idle();
  assert.equal(changes, 7);
});

test("treats a recent file as finished once its MP4 boxes are complete", async () => {
  await build({ entryPoints: ["src/recording.ts"], bundle: true, platform: "node", format: "esm", outfile: join(base, "recording.mjs") });
  const { complete } = await import(join(base, "recording.mjs"));
  const box = (type, size, declared = size) => { const b = Buffer.alloc(size); b.writeUInt32BE(declared, 0); b.write(type, 4, "latin1"); return b; };
  const file = join(base, "boxes.mp4");
  const check = async (...boxes) => { await writeFile(file, Buffer.concat(boxes)); return complete(file); };
  assert.equal(await check(box("ftyp", 40), box("mdat", 100), box("moov", 60)), true);
  assert.equal(await check(box("ftyp", 40), box("free", 16), box("moov", 60), box("moof", 30), box("mdat", 100)), false);
  assert.equal(await check(box("ftyp", 40), box("mdat", 100)), false);
  assert.equal(await check(box("ftyp", 40), box("moov", 60), box("mdat", 100, 500)), false);
  const f = await fixture();
  await writeFile(f.file, Buffer.concat([box("ftyp", 40), box("mdat", 100), box("moov", 60)]));
  await utimes(f.file, new Date(f.now()), new Date(f.now()));
  f.cache.enqueue(name); await f.cache.idle();
  assert.equal((await readMetadata(f.dir)).thumbs.sheets, 1);
});

test("persists failure and retries after backoff", async () => {
  const f = await fixture(); f.fail(true);
  f.cache.enqueue(name); await f.cache.idle();
  let meta = await readMetadata(f.dir);
  assert.match(meta.errors.thumbs, /thumbnail failure/); assert.equal(meta.retries.thumbs.attempts, 1);
  const count = f.calls.length;
  f.cache.enqueue(name); await f.cache.idle(); assert.equal(f.calls.length, count);
  f.advance(600_001); f.fail(false); f.cache.enqueue(name); await f.cache.idle();
  meta = await readMetadata(f.dir); assert.equal(meta.thumbs.sheets, 1); assert.equal(meta.errors.thumbs, undefined);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(meta)));
});

test("does not publish generated metadata when a recording starts during the job", async () => {
  const f = await fixture();
  f.onGenerate(async () => {
    const active = join(f.recordingsDir, "2026-09-28 21-00-00.mp4");
    await writeFile(active, "active recording");
    await utimes(active, new Date(f.now()), new Date(f.now()));
  });
  f.cache.enqueue(name); await f.cache.idle();
  f.advance(30_001);
  const meta = await f.cache.metadata(name);
  assert.equal(meta.thumbs, undefined);
  f.onGenerate(async () => {});
  f.cache.enqueue(name); await f.cache.idle();
  assert.equal((await readMetadata(f.dir)).thumbs.sheets, 1);
});

test("aborts generation when a recording starts and does not count it as a failure", async (t) => {
  mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => mock.timers.reset());
  const f = await fixture();
  let aborted = false;
  f.onGenerate((signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); });
    const active = join(f.recordingsDir, "2026-09-28 21-00-00.mp4");
    writeFile(active, "active recording")
      .then(() => utimes(active, new Date(f.now()), new Date(f.now())))
      .then(() => mock.timers.tick(15_000));
  }));
  f.cache.enqueue(name); await f.cache.idle();
  assert.ok(aborted);
  const meta = await readMetadata(f.dir);
  assert.equal(meta.thumbs, undefined); assert.equal(meta.errors.thumbs, undefined); assert.equal(meta.retries.thumbs, undefined);
  f.advance(30_001); f.onGenerate(async () => {});
  f.cache.enqueue(name); await f.cache.idle();
  assert.equal((await readMetadata(f.dir)).thumbs.sheets, 1);
});

test("makes the 720p version only on request and again after its file is removed", async () => {
  const f = await fixture();
  const made = [];
  let halfway = 0;
  const cache = new DerivedCache({ recordingsDir: f.recordingsDir, cacheDir: join(f.dir, "..") }, async (command, args, signal, onOutput) => {
    if (command === "ffprobe") return JSON.stringify({ format: { duration: 120 }, streams: [{ codec_type: "video", height: 1440 }, { codec_type: "audio" }] });
    for (const [, file] of (args[args.indexOf("-filter_complex") + 1] ?? "").matchAll(/file=([^,[]+)/g)) await writeFile(file, "");
    if (args.at(-1).endsWith(".jpg")) await writeFile(join(dirname(args.at(-1)), "thumbs_0.jpg"), "image");
    if (args.at(-1).endsWith("low.mp4")) {
      made.push(args.join(" "));
      onOutput("out_time_us=60000000\nprogress=continue\n");
      halfway = cache.progress(name);
      await writeFile(args.at(-1), "small");
    }
    return "";
  }, f.now);
  cache.enqueue(name); await cache.idle();
  let meta = await readMetadata(f.dir);
  assert.equal(meta.height, 1440);
  assert.equal(cache.low(name, meta), null);
  assert.equal(made.length, 0);
  assert.equal(cache.request(name, "nothing"), false);
  assert.equal(cache.request("2026-09-27 22-00-00.mp4", "low"), false);
  assert.equal(cache.request(name, "low"), true);
  assert.equal(cache.low(name, meta), "processing");
  await cache.idle();
  meta = await readMetadata(f.dir);
  assert.equal(cache.low(name, meta), "ready");
  assert.match(made[0], /scale=-2:720/);
  assert.equal(halfway, 50);
  cache.enqueue(name); await cache.idle();
  cache.request(name, "low"); await cache.idle();
  assert.equal(made.length, 1);
  assert.equal(cache.low(name, await readMetadata(f.dir)), "ready");
  await rm(join(f.dir, "low.mp4"));
  assert.equal(cache.low(name, meta), null);
  cache.request(name, "low"); await cache.idle();
  assert.equal(made.length, 2);
  assert.equal(cache.low(name, await readMetadata(f.dir)), "ready");
});
