import { describe, expect, it } from "vitest";
import { RECORDING_NAME, atFromSeconds, buildRecordings, recordingName, secondsFromAt } from "./recordings";

const files = [
  { name: "2026-01-03 22-00-00.mp4", startedAt: "2026-01-03T22:00:00+09:00", duration: 3600 },
  { name: "2026-01-02 22-00-00.mp4", startedAt: "2026-01-02T22:00:00+09:00", duration: 5400 },
];

describe("recordings", () => {
  it("converts between seconds and absolute time", () => {
    const at = atFromSeconds("2026-01-03T22:00:00+09:00", 90);
    expect(at).toBe("2026-01-03T13:01:30.000Z");
    expect(secondsFromAt(at, "2026-01-03T22:00:00+09:00")).toBe(90);
  });

  it("keeps every recording from the same day, newest first", () => {
    const short = { name: "2026-01-03 21-00-00.mp4", startedAt: "2026-01-03T21:00:00+09:00", duration: 60 };
    const rows = buildRecordings([short, ...files], []);
    expect(rows.map((row) => row.file.name)).toEqual([files[0].name, short.name, files[1].name]);
  });

  it("groups notes by recording, sorts them by time with untimed last, and keeps notes of missing recordings", () => {
    const rows = buildRecordings(files, [
      { id: 1, at: null, recording: files[0].name },
      { id: 2, at: "2026-01-03T14:10:00.000Z", recording: files[0].name },
      { id: 3, at: "2026-01-03T14:00:00.000Z", recording: files[0].name },
      { id: 4, at: null, recording: "2026-01-03 20-00-00.mp4" },
    ]);
    expect(rows.map((row) => row.name)).toEqual([files[0].name, "2026-01-03 20-00-00.mp4", files[1].name]);
    expect(rows[0].hansei.map((entry) => entry.id)).toEqual([3, 2, 1]);
    expect(rows[1].file).toBeNull();
    expect(rows[1].hansei.map((entry) => entry.id)).toEqual([4]);
  });
});

describe("recording names", () => {
  it("formats a local time the way OBS names files", () => {
    const name = recordingName(new Date(2026, 9, 5, 7, 8, 9));
    expect(name).toBe("2026-10-05 07-08-09.mp4");
    expect(RECORDING_NAME.test(name)).toBe(true);
    expect(RECORDING_NAME.test("movie.mp4")).toBe(false);
  });
});
