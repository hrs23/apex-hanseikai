import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WatchView from "../views/WatchView";

const syncSend = vi.hoisted(() => vi.fn());
const syncDraw = vi.hoisted(() => vi.fn(async () => {}));
const syncOptions = vi.hoisted(() => ({}));
vi.mock("./sync", () => ({ createSync: (options) => { syncOptions.current = options; return { send: syncSend, draw: syncDraw, setEnabled() {}, setTyping() {}, destroy() {} }; } }));

const recording = { name: "2026-10-03 21-00-00.mp4", startedAt: "2026-10-03T21:00:00+09:00", duration: 3600, players: [], matchEnds: [] };
let pause;
let play;

beforeEach(() => {
  window.location.hash = "#watch";
  syncSend.mockClear();
  syncDraw.mockClear();
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => ({
    ok: true,
    json: async () => url.startsWith("/api/recordings") ? { recordings: [recording] } : options.method === "POST" ? { id: 1, ...JSON.parse(options.body) } : { hansei: [] },
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openPlayer() {
  render(<WatchView />);
  await screen.findByRole("button", { name: "Play / Pause" });
  const video = document.querySelector("video");
  await waitFor(() => expect(video.getAttribute("src")).toContain("/media/rec/"));
  Object.defineProperty(video, "readyState", { configurable: true, value: 1 });
  Object.defineProperty(video, "duration", { configurable: true, value: 3600 });
  fireEvent.loadedMetadata(video);
  pause.mockClear();
  play.mockClear();
  syncSend.mockClear();
  video.currentTime = 100;
  return video;
}

describe("player interactions", () => {
  it("uses the time checkbox for both regular and quick hansei", async () => {
    const video = await openPlayer();
    const checkbox = screen.getByRole("checkbox", { name: "Time", exact: true });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    const input = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(input, { target: { value: "動画全体の反省" } });
    fireEvent.submit(input.form);
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const post = fetch.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(post[1].body).at).toBeNull();
    fireEvent.keyDown(video, { key: "c" });
    const quickTime = document.querySelector("#quickTime");
    expect(quickTime).toBeChecked();
    fireEvent.click(quickTime);
    expect(quickTime).not.toBeChecked();
    expect(document.querySelector("#quickAt")).toHaveTextContent("");
    fireEvent.keyDown(document.querySelector("#quickBody"), { key: "Tab" });
    expect(quickTime).toBeChecked();
    expect(document.querySelector("#quickAt")).toHaveTextContent("1:40");
  });

  it("copies links on HTTP without opening a prompt and reports clipboard failure", async () => {
    const video = await openPlayer();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const prompt = vi.spyOn(window, "prompt").mockImplementation(() => {});
    const copy = vi.fn(() => true);
    document.execCommand = copy;
    fireEvent.click(screen.getByRole("button", { name: "Copy link to this moment" }));
    expect(copy).toHaveBeenCalledWith("copy");
    await waitFor(() => expect(document.querySelector("#osd")).toHaveTextContent("Link copied"));
    expect(prompt).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(100);
    copy.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Copy link to this moment" }));
    await waitFor(() => expect(document.querySelector("#osd")).toHaveTextContent("Could not copy link"));
    expect(prompt).not.toHaveBeenCalled();
    delete document.execCommand;
  });

  it("shows volume changes and reflects muting in the volume slider", async () => {
    const video = await openPlayer();
    const slider = screen.getByRole("slider", { name: "Volume" });
    fireEvent.input(slider, { target: { value: "0.35" } });
    expect(video.volume).toBe(0.35);
    expect(document.querySelector("#osd")).toHaveTextContent("Volume 35%");
    expect(slider).toHaveAttribute("aria-valuetext", "35%");
    fireEvent.click(screen.getByRole("button", { name: "Mute", exact: true }));
    expect(document.querySelector("#osd")).toHaveTextContent("Muted");
    expect(slider).toHaveValue("0");
    fireEvent.click(screen.getByRole("button", { name: "Unmute", exact: true }));
    expect(video.muted).toBe(false);
    expect(slider).toHaveValue("0.35");
  });

  it("keeps shortcuts open while selecting text and closes only through its close control", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "?" });
    const help = document.querySelector("#help");
    const text = screen.getByText("Slower / faster");
    fireEvent.click(text);
    fireEvent.doubleClick(text);
    fireEvent.click(help);
    expect(help).toBeVisible();
    expect(document.querySelector("#player")).not.toHaveClass("is-fill");
    expect(pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close shortcuts" }));
    expect(help).not.toBeVisible();
    expect(video).toHaveFocus();
  });

  it("shows each seek independently and replaces feedback immediately when reversing", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "l" });
    fireEvent.keyDown(video, { key: "l" });
    expect(document.querySelector("#seekForward")).toHaveTextContent("10 seconds");
    fireEvent.keyDown(video, { key: "j" });
    expect(document.querySelector("#seekForward")).not.toBeVisible();
    expect(document.querySelector("#seekBack")).toBeVisible();
    expect(document.querySelector("#seekBack")).toHaveTextContent("10 seconds");
    expect(video.currentTime).toBe(110);
  });

  it("uses Ctrl arrows for minute jumps and ordinary arrows for five-second jumps", async () => {
    const video = await openPlayer();
    const forward = new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, bubbles: true, cancelable: true });
    video.dispatchEvent(forward);
    expect(video.currentTime).toBe(160);
    expect(forward.defaultPrevented).toBe(true);
    fireEvent.keyDown(video, { key: "ArrowLeft", ctrlKey: true });
    expect(video.currentTime).toBe(100);
    fireEvent.keyDown(video, { key: "ArrowRight" });
    expect(video.currentTime).toBe(105);
    fireEvent.keyDown(video, { key: "ArrowLeft", shiftKey: true });
    expect(video.currentTime).toBe(104);
  });

  it("leaves Ctrl arrows available for text editing", async () => {
    const video = await openPlayer();
    const input = screen.getByRole("textbox", { name: "Note" });
    input.focus();
    const move = new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(move);
    expect(video.currentTime).toBe(100);
    expect(move.defaultPrevented).toBe(false);
  });

  it("returns from both hansei inputs to video without changing playback", async () => {
    const video = await openPlayer();
    const input = screen.getByRole("textbox", { name: "Note" });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(video).toHaveFocus();
    fireEvent.keyDown(video, { key: "c" });
    const quick = document.querySelector("#quickBody");
    expect(quick).toHaveFocus();
    fireEvent.keyDown(quick, { key: "Escape" });
    expect(video).toHaveFocus();
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("returns focus after posting a hansei without pausing or starting playback", async () => {
    const video = await openPlayer();
    const input = screen.getByRole("textbox", { name: "Note" });
    input.focus();
    fireEvent.change(input, { target: { value: "次は早めに退く" } });
    fireEvent.submit(input.form);
    await waitFor(() => expect(video).toHaveFocus());
    expect(input).toHaveValue("");
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("shows timed hansei over the video near their time and jumps between them", async () => {
    fetch.mockImplementation(async (url) => ({
      ok: true,
      json: async () => url.startsWith("/api/recordings") ? { recordings: [recording] } : { hansei: [
        { id: 1, recording: recording.name, at: "2026-10-03T12:05:00.000Z", body: "高所を取る" },
        { id: 2, recording: recording.name, at: "2026-10-03T12:10:00.000Z", body: "引く" },
        { id: 3, recording: recording.name, at: null, body: "時間なし" },
      ] },
    }));
    const video = await openPlayer();
    await screen.findByText("高所を取る");
    const notes = document.querySelector("#notes");
    fireEvent.timeUpdate(video);
    expect(notes).toBeEmptyDOMElement();
    video.currentTime = 297;
    fireEvent.timeUpdate(video);
    expect(notes).toBeEmptyDOMElement();
    video.currentTime = 303;
    fireEvent.timeUpdate(video);
    expect(notes).toHaveTextContent("5:00高所を取る");
    video.currentTime = 310;
    fireEvent.timeUpdate(video);
    expect(notes).toBeEmptyDOMElement();
    fireEvent.keyDown(video, { key: "e" });
    expect(video.currentTime).toBe(600);
    expect(document.querySelector("#osd")).toHaveTextContent("Next note");
    expect(syncSend.mock.lastCall[1]).toBe("Next note");
    fireEvent.keyDown(video, { key: "q" });
    expect(video.currentTime).toBe(300);
    fireEvent.keyDown(video, { key: "Ｅ" });
    expect(video.currentTime).toBe(600);
  });

  it("says the recording is still being processed and updates when the server reports a change", async () => {
    fetch.mockImplementation(async (url) => ({ ok: true, json: async () => url.startsWith("/api/recordings") ? { recordings: [{ ...recording, state: "processing" }] } : { hansei: [] } }));
    await openPlayer();
    await waitFor(() => expect(document.querySelector("#matchNo")).toHaveTextContent("Processing"));
    fetch.mockImplementation(async (url) => ({ ok: true, json: async () => url.startsWith("/api/recordings") ? { recordings: [{ ...recording, state: "ready", matchEnds: [600] }] } : { hansei: [] } }));
    syncOptions.current.onRecordings();
    await waitFor(() => expect(document.querySelector("#matchNo")).toHaveTextContent(/^Match 1$/));
  });

  it("offers player views only for recordings with separate audio tracks", async () => {
    await openPlayer();
    expect(document.querySelector("#views")).not.toBeVisible();
    cleanup();
    fetch.mockImplementation(async (url) => ({
      ok: true,
      json: async () => url.startsWith("/api/recordings") ? { recordings: [{ ...recording, players: ["Player 1", "Player 2", "Player 3"] }] } : { hansei: [] },
    }));
    const video = await openPlayer();
    expect(document.querySelector("#views")).toBeVisible();
    fireEvent.keyDown(video, { key: "2" });
    expect(screen.getByRole("button", { name: "2 Player 2" })).toHaveClass("is-on");
    expect(document.querySelector("#voice").getAttribute("src")).toContain("/2.m4a");
  });

  it("adds a quick hansei with Enter and keeps Shift+Enter and IME confirmation for typing", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "c" });
    const quick = document.querySelector("#quickBody");
    fireEvent.change(quick, { target: { value: "引く" } });
    fireEvent.keyDown(quick, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(quick, { key: "Enter", isComposing: true });
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.keyDown(quick, { key: "Enter" });
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1));
    expect(document.querySelector("#quick")).not.toBeVisible();
  });

  it("pauses a playing video while the quick hansei input is open and resumes on close", async () => {
    const video = await openPlayer();
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    fireEvent.keyDown(video, { key: "c" });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    fireEvent.keyDown(document.querySelector("#quickBody"), { key: "Escape" });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("goes fullscreen with F and keeps the fill layout until the browser leaves fullscreen", async () => {
    const video = await openPlayer();
    const player = document.querySelector("#player");
    const setFullscreen = (element) => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: element });
      fireEvent(document, new Event("fullscreenchange"));
    };
    player.requestFullscreen = vi.fn(async () => setFullscreen(player));
    document.exitFullscreen = vi.fn(async () => setFullscreen(null));
    fireEvent.keyDown(video, { key: "f" });
    expect(player.requestFullscreen).toHaveBeenCalled();
    expect(player).toHaveClass("is-fill");
    fireEvent.keyDown(video, { key: "f" });
    expect(player).not.toHaveClass("is-fill");
    delete document.fullscreenElement;
    delete document.exitFullscreen;
  });

  it("fills the window with T, and Escape closes help or the quick input before leaving it", async () => {
    const video = await openPlayer();
    const player = document.querySelector("#player");
    fireEvent.keyDown(video, { key: "t" });
    expect(player).toHaveClass("is-fill");
    fireEvent.keyDown(video, { key: "?" });
    fireEvent.keyDown(video, { key: "Escape" });
    expect(document.querySelector("#help")).not.toBeVisible();
    expect(player).toHaveClass("is-fill");
    fireEvent.keyDown(video, { key: "c" });
    fireEvent.keyDown(document.querySelector("#quickBody"), { key: "Escape" });
    expect(document.querySelector("#quick")).not.toBeVisible();
    expect(player).toHaveClass("is-fill");
    fireEvent.keyDown(video, { key: "Escape" });
    expect(player).not.toHaveClass("is-fill");
  });

  it("shows a play or pause mark on toggle and closes the quick input with its button", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "k" });
    expect(document.querySelector("#bezel")).toHaveClass("show");
    expect(document.querySelector("#bezel").dataset.state).toBe("play");
    fireEvent.keyDown(video, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "Close note input" }));
    expect(document.querySelector("#quick")).not.toBeVisible();
    expect(video).toHaveFocus();
  });

  describe("Watch Party catch-up", () => {
    const remote = (position) => ({ recording: recording.name, playing: true, position, rate: 1, view: 1, at: 1000, from: "other", seq: 1 });

    it("keeps correcting drift even when the browser reports a low readyState while playing", async () => {
      window.location.hash = "#watch?sync=1";
      const video = await openPlayer();
      Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
      video.currentTime = 100;
      syncOptions.current.apply(remote(200), 1000, true);
      expect(video.currentTime).toBe(200);
    });

    it("lands exactly on the frame where someone paused", async () => {
      window.location.hash = "#watch?sync=1";
      const video = await openPlayer();
      video.currentTime = 100.2;
      syncOptions.current.apply({ ...remote(100.5), playing: false }, 1000);
      expect(video.currentTime).toBe(100.5);
    });

    it("spaces out drift corrections", async () => {
      window.location.hash = "#watch?sync=1";
      const video = await openPlayer();
      Object.defineProperty(video, "paused", { configurable: true, value: true });
      syncOptions.current.apply(remote(200), 1000, true);
      expect(video.currentTime).toBe(200);
      video.currentTime = 100;
      syncOptions.current.apply(remote(200), 1000, true);
      expect(video.currentTime).toBe(100);
    });

    it("does not restart a recording that already ended for everyone", async () => {
      window.location.hash = "#watch?sync=1";
      const video = await openPlayer();
      Object.defineProperty(video, "paused", { configurable: true, value: true });
      syncOptions.current.apply(remote(3700), 1000, true);
      expect(play).not.toHaveBeenCalled();
    });
  });

  it("says over the picture that someone in the party is typing a note", async () => {
    window.location.hash = "#watch?sync=1";
    await openPlayer();
    const notes = document.querySelector("#notes");
    syncOptions.current.onViewers(2, 1);
    expect(notes).toHaveTextContent("Someone is typing");
    const party = await screen.findByRole("button", { name: /2 watching/ });
    expect(party).not.toHaveTextContent("typing");
    syncOptions.current.onViewers(2, 0);
    expect(notes).toBeEmptyDOMElement();
  });

  it("shows a spinner over the picture until enough data is buffered, and nothing while paused", async () => {
    const video = await openPlayer();
    const mark = document.querySelector("#state");
    Object.defineProperty(video, "currentSrc", { configurable: true, value: "/media/rec/x.mp4" });
    Object.defineProperty(video, "paused", { configurable: true, value: true });
    fireEvent.pause(video);
    expect(mark).not.toBeVisible();
    fireEvent.waiting(video);
    expect(mark).toBeVisible();
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    fireEvent.canPlay(video);
    expect(mark).toBeVisible();
    Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
    fireEvent.timeUpdate(video);
    expect(mark).not.toBeVisible();
  });

  it("shows skips as arrows without a label for others", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "l" });
    expect(document.querySelector("#seekForward")).toHaveTextContent("10 seconds");
    expect(syncSend.mock.lastCall[1]).toBeUndefined();
  });

  it("names jumps relatively, including when there is nowhere to go", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "d" });
    expect(document.querySelector("#osd")).toHaveTextContent("No next match end");
    fireEvent.keyDown(video, { key: "a" });
    expect(document.querySelector("#osd")).toHaveTextContent("No previous match end");
    fireEvent.keyDown(video, { key: "e" });
    expect(document.querySelector("#osd")).toHaveTextContent("No next note");
  });

  it("seeks to the end when another viewer jumps past the end", async () => {
    const video = await openPlayer();
    fireEvent.click(screen.getByRole("button", { name: /Watch Party/ }));
    syncOptions.current.apply({ recording: recording.name, playing: true, position: 3599, rate: 1, view: 1, at: Date.now() - 5000, from: "other", seq: 9 });
    expect(video.currentTime).toBe(3600);
  });

  it("keeps the typed note in the quick box when saving fails", async () => {
    const video = await openPlayer();
    const ok = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, options = {}) => {
      if (options.method === "POST" && url === "/api/hansei") throw new TypeError("Failed to fetch");
      return ok(url, options);
    });
    fireEvent.keyDown(video, { key: "c" });
    const box = document.querySelector("#quickBody");
    box.value = "do not lose me";
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(document.querySelector("#osd")).toHaveTextContent("Could not add the note"));
    expect(document.querySelector("#quick").hidden).toBe(false);
    expect(document.querySelector("#quickBody").value).toBe("do not lose me");
  });

  it("draws the buffered ranges on the seek bar", async () => {
    const video = await openPlayer();
    const ranges = [[0, 360], [1800, 2160]];
    Object.defineProperty(video, "buffered", { configurable: true, value: { length: 2, start: (i) => ranges[i][0], end: (i) => ranges[i][1] } });
    fireEvent(video, new Event("progress"));
    const value = document.querySelector("#buffered").style.backgroundImage;
    expect(value).toContain("var(--pl-buffer) 0% max(10%");
    expect(value).toContain("var(--pl-buffer) 50% max(60%");
  });

  it("shows match and note events on the seek bar and jumps when they are clicked", async () => {
    recording.matchEnds = [100, 300];
    const ok = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, options = {}) => url.startsWith("/api/hansei?") ? { ok: true, json: async () => ({ hansei: [{ id: 1, recording: recording.name, at: "2026-10-03T21:00:50+09:00", body: "first note", created_at: "" }] }) } : ok(url, options));
    const video = await openPlayer();
    fireEvent(video, new Event("durationchange"));
    await waitFor(() => expect(document.querySelectorAll(".pl-event-note")).toHaveLength(1));
    expect(document.querySelectorAll(".pl-event-matchEnd")).toHaveLength(2);
    const kinds = [...document.querySelectorAll(".pl-event")].map((button) => (button.className.includes("matchEnd") ? "end" : "note"));
    expect(kinds.lastIndexOf("note")).toBeLessThan(kinds.indexOf("end"));
    expect(document.querySelector(".pl-event-matchEnd").style.left).toBe(`${(100 / 3600) * 100}%`);
    fireEvent.keyDown(video, { key: "d" });
    expect(video.currentTime).toBe(240);
    expect(document.querySelector("#osd")).toHaveTextContent("Match 2 end −60s");
    fireEvent.click(document.querySelectorAll(".pl-event-matchEnd")[1]);
    expect(video.currentTime).toBe(300);
    expect(document.querySelector("#osd")).toHaveTextContent("Match 2 end");
    fireEvent.click(document.querySelector(".pl-event-note"));
    expect(video.currentTime).toBe(50);
    expect(document.querySelector("#osd")).toHaveTextContent("Note 0:50");
    expect(syncSend.mock.lastCall[1]).toBe("Note 0:50");
    recording.matchEnds = [];
  });

  it("moves the quick note box by its grip inside the picture until it is closed", async () => {
    const video = await openPlayer();
    fireEvent.keyDown(video, { key: "c" });
    const box = document.querySelector("#quick");
    const grip = document.querySelector("#quickGrip");
    grip.setPointerCapture = () => {};
    document.querySelector("#stage").getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 600 });
    box.getBoundingClientRect = () => ({ left: 220, top: 540, right: 780, bottom: 584 });
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 230, clientY: 560 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 130, clientY: 260 });
    expect(box.style.translate).toBe("-100px -300px");
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 2000, clientY: -2000 });
    expect(box.style.translate).toBe("220px -540px");
    fireEvent.pointerUp(grip, { pointerId: 1 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(box.style.translate).toBe("220px -540px");
    fireEvent.keyDown(document.querySelector("#quickBody"), { key: "Escape" });
    fireEvent.keyDown(video, { key: "c" });
    expect(box.style.translate).toBe("");
  });

  describe("drawing on the paused picture", () => {
    async function openPaused() {
      const video = await openPlayer();
      const ink = document.querySelector("#ink");
      Object.defineProperty(video, "paused", { configurable: true, value: true });
      video.setPointerCapture = () => {};
      ink.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900 });
      return { video, ink };
    }
    const drag = (video, from, to) => {
      fireEvent.pointerDown(video, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 1, clientX: to[0], clientY: to[1] });
      fireEvent.pointerUp(video, { pointerId: 1, clientX: to[0], clientY: to[1] });
      fireEvent.click(video);
    };

    it("draws a line by dragging, shares it, and keeps the click from starting playback", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { video, ink } = await openPaused();
      drag(video, [160, 90], [800, 450]);
      expect(ink.querySelector("polyline:not(.edge)").getAttribute("points")).toBe("0.1,0.1 0.1,0.1 0.5,0.5");
      await waitFor(() => expect(syncDraw).toHaveBeenCalledTimes(2));
      expect(syncDraw.mock.calls.map(([line]) => line)).toEqual([{ stroke: 1, points: [0.1, 0.1], recording: recording.name }, { stroke: 1, points: [0.5, 0.5], recording: recording.name }]);
      vi.advanceTimersByTime(400);
      expect(play).not.toHaveBeenCalled();
      fireEvent.click(video);
      vi.advanceTimersByTime(400);
      expect(play).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("keeps every click working after a drag that ends without a normal release", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { video, ink } = await openPaused();
      fireEvent.pointerDown(video, { pointerId: 1, button: 0, clientX: 160, clientY: 90 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 1, clientX: 800, clientY: 450 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 0, clientX: 900, clientY: 500 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 1, clientX: 1000, clientY: 600 });
      expect(ink.querySelector("polyline:not(.edge)").getAttribute("points")).toBe("0.1,0.1 0.1,0.1 0.5,0.5");
      fireEvent.keyDown(video, { key: "c" });
      fireEvent.click(screen.getByRole("button", { name: "Close note input" }));
      expect(document.querySelector("#quick")).not.toBeVisible();
      fireEvent.pointerDown(video, { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
      fireEvent.click(video, { clientX: 300, clientY: 300 });
      vi.advanceTimersByTime(400);
      expect(play).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("places the line on the whole picture when one player's view is open", async () => {
      recording.players = ["One", "Two", "Three", "Four"];
      const { video, ink } = await openPaused();
      await waitFor(() => expect(screen.getByRole("button", { name: "4 Four" })).toBeVisible());
      fireEvent.keyDown(video, { key: "4" });
      expect(ink.getAttribute("viewBox")).toBe("0.5 0.5 0.5 0.5");
      drag(video, [0, 0], [1600, 900]);
      expect(ink.querySelector("polyline:not(.edge)").getAttribute("points")).toBe("0.5,0.5 0.5,0.5 1,1");
      recording.players = [];
    });

    it("does not draw while playing, on a plain click, or by touch", async () => {
      const { video, ink } = await openPaused();
      fireEvent.pointerDown(video, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 1, clientX: 12, clientY: 10 });
      fireEvent.pointerUp(video, { pointerId: 1, clientX: 12, clientY: 10 });
      fireEvent.pointerDown(video, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 0, clientX: 300, clientY: 300 });
      fireEvent.pointerMove(video, { pointerId: 1, buttons: 1, clientX: 600, clientY: 300 });
      fireEvent.pointerDown(video, { pointerId: 2, button: 0, pointerType: "touch", clientX: 10, clientY: 10 });
      fireEvent.pointerMove(video, { pointerId: 2, buttons: 1, pointerType: "touch", clientX: 300, clientY: 300 });
      Object.defineProperty(video, "paused", { configurable: true, value: false });
      drag(video, [160, 90], [800, 450]);
      expect(ink.children).toHaveLength(0);
      expect(syncDraw).not.toHaveBeenCalled();
    });

    it("shows lines from others and erases everything when the picture moves or X is pressed", async () => {
      const { video, ink } = await openPaused();
      const line = { recording: recording.name, from: "other", stroke: 1, points: [0.2, 0.2, 0.3, 0.3] };
      syncOptions.current.onDraw(line);
      syncOptions.current.onDraw({ ...line, points: [0.4, 0.4] });
      syncOptions.current.onDraw({ ...line, recording: "2026-10-04 21-00-00.mp4", stroke: 2 });
      expect(ink.querySelectorAll(".edge")).toHaveLength(1);
      expect(ink.children).toHaveLength(2);
      expect(ink.querySelector("polyline:not(.edge)").getAttribute("points")).toBe("0.2,0.2 0.2,0.2 0.3,0.3 0.4,0.4");
      fireEvent.seeking(video);
      expect(ink.children).toHaveLength(0);
      syncOptions.current.onDraw(line);
      fireEvent.play(video);
      expect(ink.children).toHaveLength(0);
      syncOptions.current.onDraw(line);
      syncOptions.current.onDraw({ ...line, points: [] });
      expect(ink.children).toHaveLength(0);
      drag(video, [160, 90], [800, 450]);
      syncDraw.mockClear();
      fireEvent.keyDown(video, { key: "x" });
      expect(ink.children).toHaveLength(0);
      await waitFor(() => expect(syncDraw).toHaveBeenCalledWith({ stroke: 0, points: [], recording: recording.name }));
    });
  });
});
