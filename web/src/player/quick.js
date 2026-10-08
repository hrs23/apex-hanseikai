import { report } from "../lib/report";
import { formatTime, isSubmitKey } from "../lib/format";
import { t } from "../lib/i18n";

export function setupQuick(ctx, { onHansei, setTyping }) {
  const { $, video, osd, act } = ctx;
  let at = 0;
  let untimed = false;
  let resume = false;
  let moved = { x: 0, y: 0 };

  const showKind = () => {
    $("quickTime").checked = !untimed;
    $("quickAt").textContent = untimed ? "" : formatTime(at);
  };

  function open(draft) {
    if (!draft) {
      if ($("quick").hidden) resume = !video.paused;
      if (resume) act.userPlay(false);
    }
    at = draft ? draft.at : video.currentTime;
    untimed = draft?.untimed ?? false;
    $("quick").hidden = false;
    moved = { x: 0, y: 0 };
    $("quick").style.translate = "";
    setTyping(true);
    showKind();
    $("quickBody").value = draft?.body ?? "";
    $("quickBody").style.height = "auto";
    $("quickBody").style.height = `${Math.min($("quickBody").scrollHeight, 140)}px`;
    $("quickBody").focus();
  }

  function close() {
    $("quick").hidden = true;
    setTyping(false);
    ctx.focus();
    if (resume) act.userPlay(true);
    resume = false;
  }

  ctx.on(video, "mousedown", (e) => {
    if (!$("quick").hidden) e.preventDefault();
  });
  $("quickGrip").onmousedown = (e) => e.preventDefault();
  $("quickGrip").onpointerdown = (e) => {
    const grip = e.currentTarget;
    const box = $("quick").getBoundingClientRect();
    const stage = $("stage").getBoundingClientRect();
    const from = { x: e.clientX - moved.x, y: e.clientY - moved.y };
    const within = (value, room) => Math.min(Math.max(value, room[0]), room[1]);
    const room = { x: [moved.x + stage.left - box.left, moved.x + stage.right - box.right], y: [moved.y + stage.top - box.top, moved.y + stage.bottom - box.bottom] };
    grip.setPointerCapture(e.pointerId);
    grip.onpointermove = (move) => {
      moved = { x: within(move.clientX - from.x, room.x), y: within(move.clientY - from.y, room.y) };
      $("quick").style.translate = `${moved.x}px ${moved.y}px`;
    };
    grip.onpointerup = grip.onpointercancel = () => { grip.onpointermove = null; };
  };
  $("quickBtn").onclick = () => open();
  $("quickClose").onclick = close;
  $("quickTime").onchange = () => {
    untimed = !$("quickTime").checked;
    showKind();
    $("quickBody").focus();
  };
  $("quickBody").oninput = () => {
    const box = $("quickBody");
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
  };
  $("quickBody").onkeydown = async (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      $("quickTime").click();
      return;
    }
    if (!isSubmitKey(e)) return;
    e.preventDefault();
    const body = $("quickBody").value.trim();
    if (!body) return;
    const submittedAt = untimed ? null : at;
    const draft = { at, untimed, body };
    close();
    try {
      await onHansei(submittedAt, body);
      osd(submittedAt === null ? t("Note added") : t("Note added at {time}", { time: formatTime(submittedAt) }));
    } catch (error) {
      report("hansei-post", error);
      open(draft);
      osd(t("Could not add the note. Your text is kept; press Enter to retry"));
    }
  };

  return { open: () => open() };
}
