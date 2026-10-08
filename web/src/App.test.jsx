import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createPlayer } from "./player";

vi.mock("./player", () => ({
  RATES: [1],
  createPlayer: vi.fn(() => ({ destroy: vi.fn(), setHansei: vi.fn(), load: vi.fn(), focus: vi.fn(), time: () => 90 })),
}));

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const localFiles = [
  { name: "2026-07-17 20-00-00.mp4", startedAt: "2026-07-17T20:00:00+09:00", duration: 4400, thumbnails: false, matchEnds: [], players: [] },
  { name: "2026-07-20 21-00-00.mp4", startedAt: "2026-07-20T21:00:00+09:00", duration: 600, thumbnails: false, matchEnds: [], players: [] },
];
let extraFiles;
let hansei;
let principles;
let calls;

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
  extraFiles = [];
  hansei = [
    { id: 1, recording: "2026-07-17 20-00-00.mp4", at: "2026-07-17T11:51:20.000Z", body: "高所を取る" },
    { id: 2, recording: "2026-07-17 20-00-00.mp4", at: null, body: "引きすぎ" },
  ];
  principles = [
    { slot: 0, body: "# 全体\n**声を出して、固まる**\n- 位置を声に出す\n- 遮蔽を使う" },
    { slot: 1, body: "" },
    { slot: 2, body: "" },
    { slot: 3, body: "" },
  ];
  calls = [];
  window.confirm = vi.fn(() => true);
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push([method, url, options.body]);
    if (url === "/api/hansei" && method === "GET") return response({ hansei });
    if (url === "/api/hansei" && method === "POST") {
      const saved = { id: 9, ...JSON.parse(options.body) };
      hansei = [...hansei, saved];
      return response(saved, 201);
    }
    if (url.startsWith("/api/hansei/") && method === "DELETE") return response({ deleted: true });
    if (url.startsWith("/api/hansei/") && method === "PUT") return response({ ...hansei.find((entry) => entry.id === Number(url.split("/").pop())), ...JSON.parse(options.body) });
    if (url === "/api/principles" && method === "GET") return response({ principles });
    if (url.startsWith("/api/principles/") && method === "PUT") {
      const saved = { slot: Number(url.split("/").pop()), ...JSON.parse(options.body) };
      principles = principles.map((entry) => (entry.slot === saved.slot ? saved : entry));
      return response(saved);
    }
    if (url === "/api/recordings") return response({ recordings: [...localFiles, ...extraFiles] });
    if (url.startsWith("/api/hansei?recording=")) return response({ hansei: hansei.filter((entry) => entry.recording === decodeURIComponent(url.split("=")[1])) });
    return response({}, 404);
  });
});

afterEach(cleanup);

describe("home", () => {
  describe("recording upload", () => {
    const sent = [];
    beforeEach(() => {
      sent.length = 0;
      vi.stubGlobal("XMLHttpRequest", class {
        upload = {};
        open(method, url) { this.method = method; this.url = url; }
        send(body) { sent.push([this.method, this.url, body]); this.status = 201; this.onload(); }
      });
    });
    afterEach(() => vi.unstubAllGlobals());
    const pick = (file) => userEvent.upload(document.querySelector('.home-upload input[type="file"]'), file);

    it("sends a file that already has an OBS name and reloads the list", async () => {
      render(<App />);
      await screen.findByText("Add recording");
      const file = new File(["x"], "2026-10-05 10-00-00.mp4", { type: "video/mp4" });
      await pick(file);
      await waitFor(() => expect(sent).toEqual([["PUT", "/media/rec/2026-10-05%2010-00-00.mp4", file]]));
      await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => url === "/api/recordings")).toHaveLength(2));
    });

    it("does not send when the name already exists", async () => {
      render(<App />);
      await screen.findByText("Add recording");
      await pick(new File(["x"], "2026-07-17 20-00-00.mp4", { type: "video/mp4" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("A recording with this name already exists.");
      expect(sent).toEqual([]);
    });

    it("asks for a name when the file has none and rejects a bad one", async () => {
      window.prompt = vi.fn(() => "bad.mp4");
      render(<App />);
      await screen.findByText("Add recording");
      await pick(new File(["x"], "clip.mp4", { type: "video/mp4" }));
      expect(window.prompt).toHaveBeenCalledWith("Recording name (YYYY-MM-DD hh-mm-ss.mp4)", expect.any(String));
      expect(await screen.findByRole("alert")).toHaveTextContent("Recording names must look like YYYY-MM-DD hh-mm-ss.mp4.");
      expect(sent).toEqual([]);
    });
  });

  describe("principles board", () => {
    const board = () => within(screen.getByRole("region", { name: "Principles" }));

    it("renders the Markdown of each slot and invites writing in an empty one", async () => {
      render(<App />);
      expect(await board().findByRole("heading", { name: "全体" })).toBeInTheDocument();
      expect(board().getByText("声を出して、固まる").tagName).toBe("STRONG");
      expect(board().getAllByRole("listitem").map((item) => item.textContent)).toEqual(["位置を声に出す", "遮蔽を使う"]);
      expect(board().getAllByText("Write your principles")).toHaveLength(3);
      await userEvent.click(board().getByText("声を出して、固まる"));
      expect(board().queryByRole("textbox")).not.toBeInTheDocument();
      await userEvent.click(board().getAllByText("Write your principles")[0]);
      expect(board().getByRole("textbox")).toHaveValue("");
    });

    const edit = (index) => userEvent.click(board().getAllByRole("button", { name: "Edit principles" })[index]);
    const puts = () => calls.filter(([method]) => method === "PUT");

    it("shows a single button until something is written", async () => {
      principles = principles.map((entry) => ({ ...entry, body: "" }));
      render(<App />);
      const start = await screen.findByRole("button", { name: "Write your principles" });
      expect(screen.queryByRole("button", { name: "Edit principles" })).not.toBeInTheDocument();
      await userEvent.click(start);
      expect(board().getByRole("textbox")).toHaveValue("");
      expect(board().getAllByRole("button", { name: "Edit principles" })).toHaveLength(3);
      await userEvent.click(board().getByRole("button", { name: "Cancel" }));
      expect(await screen.findByRole("button", { name: "Write your principles" })).toBeInTheDocument();
    });

    it("edits the raw Markdown and saves it with the Save button", async () => {
      render(<App />);
      await board().findByText("声を出して、固まる");
      await edit(1);
      await userEvent.type(board().getByRole("textbox", { name: "Edit principles" }), "# Ann\n- 先頭で突っ込まない");
      expect(board().getByText(/characters left/)).toHaveTextContent(`${500 - "# Ann\n- 先頭で突っ込まない".length} characters left`);
      await userEvent.click(board().getByRole("button", { name: "Save" }));
      expect(await board().findByRole("heading", { name: "Ann" })).toBeInTheDocument();
      expect(puts()[0].slice(1)).toEqual(["/api/principles/1", JSON.stringify({ body: "# Ann\n- 先頭で突っ込まない" })]);
      await waitFor(() => expect(board().getAllByRole("button", { name: "Edit principles" })[1]).toHaveFocus());
    });

    it("saves with Ctrl+Enter, cancels with Escape or Cancel, and does not save on blur", async () => {
      render(<App />);
      await board().findByText("声を出して、固まる");
      await edit(1);
      await userEvent.type(board().getByRole("textbox"), "捨てる{Escape}");
      expect(board().queryByRole("textbox")).not.toBeInTheDocument();
      await edit(1);
      await userEvent.type(board().getByRole("textbox"), "- 残す");
      await userEvent.tab();
      await userEvent.tab();
      expect(board().getByRole("textbox")).toHaveValue("- 残す");
      await userEvent.click(board().getByRole("button", { name: "Cancel" }));
      expect(puts()).toHaveLength(0);
      await edit(1);
      await userEvent.type(board().getByRole("textbox"), "- 残す{Control>}{Enter}{/Control}");
      await waitFor(() => expect(puts()).toHaveLength(1));
    });

    it("keeps one slot at a time: the others cannot be opened until it is saved or cancelled", async () => {
      render(<App />);
      await board().findByText("声を出して、固まる");
      await edit(1);
      const others = board().getAllByRole("button", { name: "Edit principles" });
      expect(others).toHaveLength(3);
      others.forEach((other) => expect(other).toBeDisabled());
      expect(board().getAllByRole("textbox")).toHaveLength(1);
      await userEvent.click(board().getByRole("button", { name: "Cancel" }));
      await edit(0);
      expect(board().getByRole("textbox").value).toContain("# 全体");
    });

    it("blocks saving past the limit and keeps the text when saving fails", async () => {
      render(<App />);
      await board().findByText("声を出して、固まる");
      await edit(1);
      const box = board().getByRole("textbox");
      await userEvent.click(box);
      await userEvent.paste("x".repeat(501));
      expect(board().getByText(/characters left/)).toHaveClass("over");
      expect(board().getByRole("button", { name: "Save" })).toBeDisabled();
      await userEvent.keyboard("{Control>}{Enter}{/Control}");
      expect(puts()).toHaveLength(0);
      await userEvent.clear(box);
      await userEvent.type(box, "- a");
      global.fetch.mockImplementationOnce(async () => response({ error: "invalid principle", details: ["Too long."] }, 400));
      await userEvent.click(board().getByRole("button", { name: "Save" }));
      expect(await board().findByRole("alert")).toHaveTextContent("Too long.");
      expect(board().getByRole("textbox").value).toBe("- a");
      expect(board().getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });

  describe("returning to the tab", () => {
    afterEach(() => vi.restoreAllMocks());
    const showTab = () => act(() => {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    it("reloads hansei and recordings without going back to loading", async () => {
      render(<App />);
      await screen.findByText("高所を取る");
      hansei = [...hansei, { id: 5, recording: localFiles[1].name, at: null, body: "別タブで追加" }];
      extraFiles = [{ ...localFiles[0], name: "2026-07-21 21-00-00.mp4" }];
      showTab();
      expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
      expect(screen.getByText("高所を取る")).toBeInTheDocument();
      expect(await screen.findByText("別タブで追加")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "2026-07-21 21-00-00" })).toBeInTheDocument();
    });

    it("keeps the current list when the reload fails", async () => {
      render(<App />);
      await screen.findByText("高所を取る");
      const before = global.fetch.mock.calls.length;
      global.fetch.mockImplementation(async () => response({ error: "down" }, 500));
      showTab();
      await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
      await act(async () => {});
      expect(screen.getByText("高所を取る")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("lists each recording, newest first", async () => {
    render(<App />);
    const rows = await waitFor(() => {
      const found = document.querySelectorAll(".home-recording-rows article");
      expect(found).toHaveLength(2);
      return [...found];
    });
    expect(rows.map((row) => within(row).getByRole("heading", { level: 3 }).textContent)).toEqual(["2026-07-20 21-00-00", "2026-07-17 20-00-00"]);
    expect(within(rows[0]).getByText("10m")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "Watch" })).toHaveAttribute("href", "#watch?rec=2026-07-17%2020-00-00.mp4");
  });

  it("marks recordings that are still being recorded or processed and refreshes when the server says they changed", async () => {
    extraFiles = [{ ...localFiles[1], name: "2026-07-21 21-00-00.mp4", duration: 0, state: "recording" }, { ...localFiles[1], name: "2026-07-22 21-00-00.mp4", state: "processing" }];
    render(<App />);
    expect(await screen.findByText("Recording in progress")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Watch" })).toHaveLength(3);
    expect(screen.getByText("10m · Processing")).toBeInTheDocument();
    extraFiles = [];
    await act(async () => { EventSource.last.listeners.recordings(); });
    await waitFor(() => expect(screen.queryByText("Recording in progress")).not.toBeInTheDocument());
  });

  it("shows both split recordings from the same day and keeps each hansei attached once", async () => {
    const later = { ...localFiles[0], name: "2026-07-17 22-00-00.mp4", startedAt: "2026-07-17T22:00:00+09:00" };
    extraFiles = [later];
    hansei = [
      { id: 1, at: null, recording: localFiles[0].name, body: "最初の動画" },
      { id: 2, at: null, recording: later.name, body: "次の動画" },
    ];
    render(<App />);
    const laterRow = (await screen.findByRole("heading", { name: "2026-07-17 22-00-00" })).closest("article");
    const earlierRow = screen.getByRole("heading", { name: "2026-07-17 20-00-00" }).closest("article");
    expect(within(laterRow).getByText("次の動画")).toBeInTheDocument();
    expect(within(earlierRow).getByText("最初の動画")).toBeInTheDocument();
    expect(within(laterRow).queryByText("最初の動画")).not.toBeInTheDocument();
    expect(within(laterRow).getByRole("link", { name: "Watch" })).toHaveAttribute("href", "#watch?rec=2026-07-17%2022-00-00.mp4");
    const titles = [...document.querySelectorAll(".home-recording-info h3")].map((heading) => heading.textContent);
    expect(titles.indexOf("2026-07-17 22-00-00")).toBeLessThan(titles.indexOf("2026-07-17 20-00-00"));
  });

  it("shows entries under their recording with time links to the player", async () => {
    render(<App />);
    const row = (await screen.findAllByRole("heading", { name: "2026-07-17 20-00-00" }))[0].closest("article");
    const list = within(row).getByRole("list", { name: "Notes" });
    expect(within(list).getByText("高所を取る")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "51:20" })).toHaveAttribute("href", "#watch?rec=2026-07-17%2020-00-00.mp4&t=3080");
  });

  it("lists timed entries in time order, then untimed ones, with the add button below", async () => {
    hansei = [
      { id: 1, at: null, recording: localFiles[0].name, body: "時間なし" },
      { id: 2, at: "2026-07-17T11:30:00.000Z", recording: localFiles[0].name, body: "後" },
      { id: 3, at: "2026-07-17T11:10:00.000Z", recording: localFiles[0].name, body: "先" },
    ];
    const user = userEvent.setup();
    render(<App />);
    const row = (await screen.findByRole("heading", { name: "2026-07-17 20-00-00" })).closest("article");
    const list = within(row).getByRole("list", { name: "Notes" });
    const bodies = () => within(list).getAllByRole("listitem").map((item) => item.querySelector(".hansei-body").textContent);
    expect(bodies()).toEqual(["先", "後", "時間なし"]);
    const open = within(row).getByRole("button", { name: "Add note" });
    expect(list.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(open);
    await user.type(within(row).getByRole("textbox"), "最後");
    await user.click(within(row).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(bodies()).toEqual(["先", "後", "時間なし", "最後"]));
  });

  it("shows an error when adding fails", async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = (await screen.findAllByRole("heading", { name: "2026-07-17 20-00-00" }))[0].closest("article");
    await user.click(within(row).getByRole("button", { name: "Add note" }));
    await user.type(within(row).getByRole("textbox"), "失敗する");
    global.fetch.mockImplementationOnce(async () => response({ error: "invalid hansei" }, 400));
    await user.click(within(row).getByRole("button", { name: "Add note" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("Could not add the note.");
    expect(within(row).getByRole("textbox")).toHaveValue("失敗する");
  });

  it("keeps entries whose recording is no longer there, without a link", async () => {
    hansei = [{ id: 3, recording: "2026-07-01 21-00-00.mp4", at: "2026-07-01T12:30:00.000Z", body: "古い日の反省" }];
    render(<App />);
    const row = (await screen.findByRole("heading", { name: "2026-07-01 21-00-00" })).closest("article");
    expect(within(row).getByText("古い日の反省")).toBeInTheDocument();
    expect(within(row).queryByRole("link", { name: "Watch" })).not.toBeInTheDocument();
  });

  it("adds an untimed entry, edits one and deletes one", async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = (await screen.findAllByRole("heading", { name: "2026-07-17 20-00-00" }))[0].closest("article");
    await user.click(within(row).getByRole("button", { name: "Add note" }));
    await user.type(within(row).getByRole("textbox", { name: "Add note for 2026-07-17 20-00-00" }), "退く判断");
    await user.click(within(row).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(within(row).getByText("退く判断")).toBeInTheDocument());
    const post = calls.find(([method, url]) => method === "POST" && url === "/api/hansei");
    expect(JSON.parse(post[2])).toEqual({ recording: localFiles[0].name, at: null, body: "退く判断" });

    await user.click(within(row).getByText("引きすぎ"));
    const edit = within(row).getByRole("textbox", { name: "Edit note" });
    await user.clear(edit);
    await user.type(edit, "引きすぎない{Enter}");
    await waitFor(() => expect(within(row).getByText("引きすぎない")).toBeInTheDocument());
    expect(calls.find(([method, url]) => method === "PUT" && url === "/api/hansei/2")[2]).toBe(JSON.stringify({ body: "引きすぎない" }));
    expect(within(row).getByRole("link", { name: "2026-07-17 20-00-00" })).toHaveAttribute("href", "#watch?rec=2026-07-17%2020-00-00.mp4");

    await user.click(within(within(row).getByText("高所を取る").closest("li")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(row).queryByText("高所を取る")).not.toBeInTheDocument());
    expect(calls.some(([method, url]) => method === "DELETE" && url === "/api/hansei/1")).toBe(true);
  });

  it("asks before deleting and shows save and delete failures in the row", async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = (await screen.findByRole("heading", { name: "2026-07-17 20-00-00" })).closest("article");
    const deleteButton = () => within(within(row).getByText("高所を取る").closest("li")).getByRole("button", { name: "Delete" });

    window.confirm = vi.fn(() => false);
    await user.click(deleteButton());
    expect(window.confirm).toHaveBeenCalledWith("Delete this note?");
    expect(calls.some(([method]) => method === "DELETE")).toBe(false);

    window.confirm = vi.fn(() => true);
    global.fetch.mockImplementationOnce(async () => response({ error: "down" }, 500));
    await user.click(deleteButton());
    expect(await within(row).findByRole("alert")).toHaveTextContent("Could not delete the note.");
    expect(within(row).getByText("高所を取る")).toBeInTheDocument();

    await user.click(within(row).getByText("引きすぎ"));
    const edit = within(row).getByRole("textbox", { name: "Edit note" });
    await user.clear(edit);
    global.fetch.mockImplementationOnce(async () => response({ error: "down" }, 500));
    await user.type(edit, "直す{Enter}");
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("Could not save the note."));
    expect(within(row).getByText("引きすぎ")).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("loads the new recording and time when the hash changes within Watch", async () => {
    window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(localFiles[0].name)}&t=90`);
    render(<App />);
    await waitFor(() => expect(createPlayer).toHaveBeenCalledTimes(1));
    expect(createPlayer.mock.calls[0][1]).toMatchObject({ recording: localFiles[0].name, startAt: 90 });
    const firstPlayer = createPlayer.mock.results[0].value;

    act(() => {
      window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(localFiles[1].name)}&t=180`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    await waitFor(() => expect(createPlayer).toHaveBeenCalledTimes(2));
    expect(firstPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(createPlayer.mock.calls[1][1]).toMatchObject({ recording: localFiles[1].name, startAt: 180 });
    expect(screen.getByRole("combobox", { name: "Recording" })).toHaveValue(localFiles[1].name);
  });

  it("recreates Watch for a different recording on the same day", async () => {
    const later = { ...localFiles[0], name: "2026-07-17 22-00-00.mp4", startedAt: "2026-07-17T22:00:00+09:00" };
    extraFiles = [later];
    window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(localFiles[0].name)}`);
    render(<App />);
    await waitFor(() => expect(createPlayer).toHaveBeenCalledTimes(1));
    act(() => {
      window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(later.name)}&t=50`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(createPlayer).toHaveBeenCalledTimes(2));
    expect(createPlayer.mock.calls[1][1]).toMatchObject({ recording: later.name, startAt: 50 });
    expect(screen.getByRole("combobox", { name: "Recording" })).toHaveValue(later.name);
    expect(calls.filter(([method, url]) => method === "GET" && url.startsWith("/api/hansei?recording="))).toEqual([
      ["GET", `/api/hansei?recording=${encodeURIComponent(localFiles[0].name)}`, undefined],
      ["GET", `/api/hansei?recording=${encodeURIComponent(later.name)}`, undefined],
    ]);
  });

  it("does not mix a delayed post into a different recording or clear its new input", async () => {
    const user = userEvent.setup();
    const later = { ...localFiles[0], name: "2026-07-17 22-00-00.mp4", startedAt: "2026-07-17T22:00:00+09:00" };
    extraFiles = [later];
    hansei = [{ id: 2, recording: later.name, at: null, body: "Bの既存反省" }];
    let finish;
    let submitted;
    const pending = new Promise((done) => { finish = () => done(response({ id: 9, ...submitted }, 201)); });
    const fetchNormally = global.fetch;
    global.fetch = vi.fn((url, options = {}) => {
      if (url === "/api/hansei" && options.method === "POST") {
        submitted = JSON.parse(options.body);
        return pending;
      }
      return fetchNormally(url, options);
    });
    window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(localFiles[0].name)}`);
    render(<App />);
    const picker = await screen.findByRole("combobox", { name: "Recording" });
    const input = screen.getByRole("textbox", { name: "Note" });
    await user.type(input, "Aに送った反省");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(submitted.recording).toBe(localFiles[0].name);

    await user.selectOptions(picker, later.name);
    await screen.findByText("Bの既存反省");
    await user.clear(input);
    await user.type(input, "Bの未送信本文");
    await act(async () => { finish(); await pending; });

    expect(picker).toHaveValue(later.name);
    expect(screen.queryByText("Aに送った反省")).not.toBeInTheDocument();
    expect(screen.getByText("Bの既存反省")).toBeInTheDocument();
    expect(input).toHaveValue("Bの未送信本文");
    expect(createPlayer.mock.results[0].value.focus).toHaveBeenCalledTimes(1);
  });

  it("edits and deletes in Watch with the same confirm and errors as home", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", `#watch?rec=${encodeURIComponent(localFiles[0].name)}`);
    render(<App />);
    const panel = await screen.findByRole("region", { name: "Notes" });
    await within(panel).findByText("引きすぎ");

    await user.click(within(panel).getByText("引きすぎ"));
    const edit = within(panel).getByRole("textbox", { name: "Edit note" });
    await user.clear(edit);
    global.fetch.mockImplementationOnce(async () => response({ error: "down" }, 500));
    await user.type(edit, "直す{Enter}");
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Could not save the note.");

    global.fetch.mockImplementationOnce(async () => response({ error: "down" }, 500));
    await user.click(within(within(panel).getByText("引きすぎ").closest("li")).getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this note?");
    await waitFor(() => expect(within(panel).getByRole("alert")).toHaveTextContent("Could not delete the note."));

    await user.click(within(within(panel).getByText("引きすぎ").closest("li")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(panel).queryByText("引きすぎ")).not.toBeInTheDocument());
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has only home and player tabs", () => {
    render(<App />);
    expect([...document.querySelectorAll(".header-tabs button")].map((button) => button.title)).toEqual(["Home", "Watch"]);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });
});
