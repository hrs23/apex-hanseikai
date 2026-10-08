import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BAR_MAX = 24;
const RED_V = 148;
const RED_U = 123;
const BUTTON_V = 152;
const BUTTON_U = 119;
const BAR_MIN = 2;
const BUTTON_MIN = 4;
const WINDOW = 10;
const RED_MIN = 2;
const TAIL = 20;
const DEDUP = 150;

export interface Frame { time: number; bar: boolean; red: boolean; button: boolean }

export function matchEnds(frames: Frame[]): number[] {
  const n = frames.length;
  const found: number[] = [];
  frames.forEach(({ time, bar, button }, i) => {
    if (button && !frames[i - 1]?.button && frames.slice(i, i + BUTTON_MIN).filter((frame) => frame.button).length === BUTTON_MIN) found.push(time);
    if (!bar || frames[i - 1]?.bar || frames[i - 2]?.bar || !frames.slice(i + 1, i + BAR_MIN + 1).some((frame) => frame.bar)) return;
    const red = frames.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).filter((frame) => frame.red);
    if (red.length >= RED_MIN) found.push(red[0].time);
    else if (n - i <= TAIL) found.push(time);
  });
  const ends: number[] = [];
  for (const time of found.sort((a, b) => a - b)) if (!ends.length || time - ends.at(-1)! > DEDUP) ends.push(time);
  return ends;
}

const values = (text: string, key: string) => [...text.matchAll(new RegExp(`${key}=([\\d.]+)`, "g"))].map((match) => Number(match[1]));

export async function detectEnds(execute: (command: string, args: string[]) => Promise<string>, file: string, grid: boolean): Promise<number[]> {
  const temp = await mkdtemp(join(tmpdir(), "detect-"));
  try {
    const print = (key: string, name: string) => `metadata=print:key=lavfi.signalstats.${key}:file=${join(temp, name)}`;
    await execute("ffmpeg", ["-nostdin", "-y", "-v", "error", "-skip_frame", "nokey", "-i", file, "-an", "-filter_complex",
      `[0:v]${grid ? "crop=iw/2:ih/2:0:0," : ""}scale=640:360:flags=fast_bilinear,split=3[a][b][c];[a]crop=240:12:190:345,signalstats,${print("YMAX", "bar")}[x];[b]crop=8:8:478:344,signalstats,${print("VAVG", "v")},${print("UAVG", "u")}[y];[c]crop=8:8:478:300,signalstats,${print("VAVG", "v2")},${print("UAVG", "u2")}[z]`,
      "-map", "[x]", "-f", "null", "-", "-map", "[y]", "-f", "null", "-", "-map", "[z]", "-f", "null", "-"]);
    const [bar, v, u, v2, u2] = await Promise.all(["bar", "v", "u", "v2", "u2"].map((name) => readFile(join(temp, name), "utf8")));
    const times = [...bar.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1]));
    const ymax = values(bar, "YMAX");
    const vavg = values(v, "VAVG");
    const uavg = values(u, "UAVG");
    const vavg2 = values(v2, "VAVG");
    const uavg2 = values(u2, "UAVG");
    const isButton = (vv: number, uu: number) => vv >= RED_V && uu <= RED_U && vv <= BUTTON_V && uu >= BUTTON_U;
    return matchEnds(times.map((time, index) => {
      const red = vavg[index] >= RED_V && uavg[index] <= RED_U;
      return { time, bar: ymax[index] <= BAR_MAX, red, button: isButton(vavg[index], uavg[index]) || isButton(vavg2[index], uavg2[index]) };
    }));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
