import { THUMB, audioUrl, formatTime, nextBy, thumbTile } from "../lib/format";
import { t } from "../lib/i18n";
import { stateLabel } from "../lib/recordings";

const MATCH_END_LEAD = 60;
const NOTE_SECONDS = 8;

export function setupSeekbar(ctx) {
  const { $, video, on, osd, s, act } = ctx;
  let matchEnds = [];
  let notes = [];
  let typing = false;
  let hasThumbs = false;
  let state = "";
  let dragging = false;

  const showTime = (time = video.currentTime) => {
    $("time").textContent = `${formatTime(time)} / ${formatTime(video.duration)}`;
  };
  const setProgress = (time = $("seek").value) => {
    $("seekbar").style.setProperty("--p", `${(time / (video.duration || 1)) * 100}%`);
  };
  function showMatchNo(time = video.currentTime) {
    const ended = matchEnds.filter((m) => m <= time).length;
    const match = !matchEnds.length ? "" : ended >= matchEnds.length ? t("After Match {n}", { n: matchEnds.length }) : t("Match {n}", { n: ended + 1 });
    $("matchNo").textContent = [match, stateLabel(state)].filter(Boolean).join(" · ");
  }

  function showBuffered() {
    const d = video.duration;
    const stops = [];
    let at = "0%";
    for (let i = 0; d && i < video.buffered.length; i++) {
      const from = (video.buffered.start(i) / d) * 100;
      const to = (video.buffered.end(i) / d) * 100;
      const end = `max(${to}%, calc(${from}% + 6px))`;
      stops.push(`transparent ${at} ${from}%`, `var(--pl-buffer) ${from}% ${end}`);
      at = end;
    }
    $("buffered").style.backgroundImage = stops.length ? `linear-gradient(to right, ${stops.join(", ")}, transparent ${at} 100%)` : "none";
  }

  function renderMarks() {
    const d = video.duration;
    $("eventLane").textContent = "";
    if (d) {
      const events = [
        ...notes.map((note) => ({ kind: "note", at: note.seconds, jump: note.seconds, label: t("Note {time}", { time: formatTime(note.seconds) }), title: `${formatTime(note.seconds)}  ${note.body.length > 60 ? `${note.body.slice(0, 60)}…` : note.body}` })),
        ...matchEnds.map((end, i) => {
          const label = t("Match {n} end", { n: i + 1 });
          return { kind: "matchEnd", at: end, jump: end, label, title: `${label}  ${formatTime(end)}` };
        }),
      ];
      events.forEach((event) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `pl-event pl-event-${event.kind}`;
        button.dataset.jump = event.jump;
        button.dataset.label = event.label;
        button.title = event.title;
        button.setAttribute("aria-label", event.title);
        button.tabIndex = -1;
        button.style.left = `${(event.at / d) * 100}%`;
        $("eventLane").append(button);
      });
    }
    showMatchNo();
  }

  function showNotes(time = video.currentTime) {
    const active = notes.filter((note) => time >= note.seconds && time <= note.seconds + NOTE_SECONDS).slice(-4);
    const box = $("notes");
    const ids = `${active.map((note) => note.id).join()}${typing ? "+" : ""}`;
    if (box.dataset.ids === ids) return;
    box.dataset.ids = ids;
    box.replaceChildren(...active.map((note) => {
      const item = document.createElement("p");
      const time = document.createElement("b");
      time.textContent = formatTime(note.seconds);
      item.append(time, note.body);
      return item;
    }));
    if (typing) {
      const item = document.createElement("p");
      item.className = "pl-typing";
      item.textContent = t("Someone is typing");
      box.append(item);
    }
  }

  function showPreview(clientX) {
    const d = video.duration;
    if (!d) return;
    const r = $("seekwrap").getBoundingClientRect();
    const x = Math.min(r.width, Math.max(0, clientX - r.left));
    const time = (x / r.width) * d;
    const half = hasThumbs ? THUMB.w / 2 : 30;
    $("preview").style.left = `${Math.min(r.width - half, Math.max(half, x))}px`;
    $("pvtime").textContent = formatTime(time);
    $("pvimg").hidden = !hasThumbs;
    if (hasThumbs) {
      const { sheet, col, row } = thumbTile(time);
      const img = $("pvimg").style;
      img.backgroundImage = `url("${audioUrl(s.name, `thumbs_${sheet}.jpg`)}")`;
      img.backgroundPosition = `${-col * THUMB.w}px ${-row * THUMB.h}px`;
      img.backgroundSize = `${THUMB.cols * THUMB.w}px ${THUMB.cols * THUMB.h}px`;
    }
    $("preview").hidden = false;
  }

  on(video, "timeupdate", () => {
    if (!dragging) {
      $("seek").value = video.currentTime;
      setProgress();
    }
    showTime();
    showMatchNo();
    showNotes();
  });
  ["progress", "seeked", "emptied", "loadedmetadata"].forEach((name) => on(video, name, showBuffered));
  on(video, "durationchange", () => {
    showBuffered();
    showTime();
    $("seek").max = video.duration || 0;
    renderMarks();
  });
  $("seek").oninput = () => {
    dragging = true;
    const time = +$("seek").value;
    showTime(time);
    setProgress();
    showMatchNo(time);
    showNotes(time);
  };
  $("seek").onchange = () => {
    act.userSeek(+$("seek").value);
    dragging = false;
  };
  $("eventLane").onmousedown = (e) => e.preventDefault();
  $("eventLane").onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    act.userSeek(+button.dataset.jump, false, button.dataset.label);
    ctx.focus();
  };
  $("seekwrap").onmousemove = (e) => showPreview(e.clientX);
  $("seekwrap").onmouseleave = () => { $("preview").hidden = true; };

  return {
    reset() {
      matchEnds = [];
      hasThumbs = false;
      state = "";
      renderMarks();
    },
    setInfo(info) {
      hasThumbs = !!info.thumbnails;
      const ends = info.matchEnds || [];
      state = info.state;
      if (JSON.stringify(ends) !== JSON.stringify(matchEnds)) {
        matchEnds = ends;
        renderMarks();
      } else showMatchNo();
    },
    setTyping(value) {
      typing = value;
      showNotes();
    },
    setNotes(entries) {
      notes = entries;
      renderMarks();
      showNotes();
    },
    stepNote(dir) {
      const note = nextBy(notes, video.currentTime, dir, (item) => item.seconds);
      if (note) act.userSeek(note.seconds, false, dir > 0 ? t("Next note") : t("Previous note"));
      else osd(dir > 0 ? t("No next note") : t("No previous note"));
    },
    stepMark(dir) {
      const end = nextBy(matchEnds, video.currentTime + MATCH_END_LEAD, dir);
      if (end === undefined) osd(dir > 0 ? t("No next match end") : t("No previous match end"));
      else act.userSeek(Math.max(0, end - MATCH_END_LEAD), false, t("Match {n} end −{lead}s", { n: matchEnds.indexOf(end) + 1, lead: MATCH_END_LEAD }));
    },
  };
}
