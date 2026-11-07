import { effectiveStatus, planFloors, visibleNames } from "./state.js";

const STATUS_LABEL = {
  working: "Working",
  idle: "Idle",
  waiting_user: "Waiting",
  error: "Error",
  done: "Done",
};

const MODE_LABEL = {
  demo: "Demo",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(ms) {
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}

export function createPanel(root, handlers) {
  let mode = "demo";
  let selected = null;
  let sound = false;
  let state = null;
  let scrolledFor = null;

  const scroll = el("div", "panel-scroll");
  root.append(scroll);

  root.addEventListener("click", (event) => {
    const soundButton = event.target.closest("[data-action='sound']");
    if (soundButton) {
      sound = !sound;
      handlers.onSound?.(sound);
      render();
      return;
    }
    const bot = event.target.closest(".bot");
    if (bot && scroll.contains(bot)) handlers.onSelect?.(bot.dataset.name || null);
  });

  function render() {
    const previousScroll = scroll.scrollTop;
    scroll.replaceChildren();

    const head = el("div", "sticky-head");
    const titleRow = el("div", "title-row");
    const titles = el("div");
    titles.append(el("h1", null, "AI Office"));
    titles.append(el("p", "tagline", "Bots at their desks"));
    const conn = el("p", `conn ${mode}`);
    conn.append(el("span", "conn-dot"));
    conn.append(document.createTextNode(MODE_LABEL[mode] || mode));
    conn.setAttribute("role", "status");
    titleRow.append(titles, conn);
    head.append(titleRow);

    if (mode === "demo") {
      const note = el("div", "note");
      note.append(el("p", null, "Sample office. Add a private ntfy topic to the address, like #your-topic. Treat that link as a password."));
      const zh = el("p", null, "示範辦公室。在網址加上 #你的主題 就能接上即時資料。這條連結如同密碼，請勿分享。");
      zh.lang = "zh-Hant";
      note.append(zh);
      head.append(note);
    } else {
      head.append(el("p", "note quiet", "Keep this address private. It is the only key to the stream."));
    }

    const soundButton = el("button", "text-button");
    soundButton.type = "button";
    soundButton.dataset.action = "sound";
    soundButton.setAttribute("aria-pressed", sound ? "true" : "false");
    soundButton.textContent = sound ? "Sound on" : "Sound off";
    head.append(soundButton);
    scroll.append(head);

    if (!state) {
      scroll.scrollTop = previousScroll;
      return;
    }

    const names = visibleNames(state);
    const plan = planFloors(names, state.groups);
    const now = Date.now();

    if (names.length === 0) {
      scroll.append(el("p", "empty", mode === "demo" ? "The demo roster is on its way." : "Waiting for a roster on this topic."));
    }

    const byFloor = plan.floors.map((team) => ({ team, bots: [] }));
    for (const assignment of plan.assignments) {
      byFloor[assignment.floor].bots.push(assignment);
    }

    for (let index = 0; index < byFloor.length; index += 1) {
      const floor = byFloor[index];
      if (names.length === 0) break;
      const section = el("section", "floor");
      const heading = el("h2", `floor-heading f${index}`);
      heading.append(el("span", "floor-index", String(index + 1)));
      heading.append(document.createTextNode(floor.team));
      section.append(heading);

      for (const assignment of floor.bots) {
        const info = state.bots[assignment.name] || { status: "idle", step: "", at: 0 };
        const status = effectiveStatus(info, now);
        const button = el("button", "bot");
        button.type = "button";
        button.dataset.name = assignment.name;
        if (assignment.name === selected) button.setAttribute("aria-current", "true");

        const top = el("div", "bot-top");
        const dot = el("span", `dot ${status}`);
        const name = el("span", "bot-name", assignment.name);
        const meta = el("span", "bot-meta", `${STATUS_LABEL[status] || "Idle"} · ${formatTime(info.at) || "—"}`);
        top.append(dot, name, meta);

        const step = el("div", "bot-step", info.step || "No update yet");
        button.append(top, step);
        section.append(button);
      }
      scroll.append(section);
    }

    if (state.usage) {
      const card = el("section", "side-card");
      card.append(el("h2", null, "Usage"));
      const pct = state.usage.total_used_pct;
      const line = el("p", "usage-total", formatPct(pct));
      card.append(line);
      if (Number.isFinite(pct)) {
        const track = el("div", "meter");
        const bar = el("div", "meter-bar");
        bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        track.append(bar);
        card.append(track);
      }
      if (state.usage.resets_at) {
        card.append(el("p", "fine", `Resets ${formatWhen(state.usage.resets_at)}`));
      }
      const usageNames = Object.keys(state.usage.bots).sort((a, b) => a.localeCompare(b));
      if (usageNames.length) {
        const list = el("ul", "mini-list");
        for (const name of usageNames) {
          const item = el("li");
          item.append(el("span", null, name), el("span", null, formatPct(state.usage.bots[name])));
          list.append(item);
        }
        card.append(list);
      }
      scroll.append(card);
    }

    const routineNames = Object.keys(state.routines).filter((name) => state.routines[name] && state.routines[name].length);
    if (routineNames.length) {
      const card = el("section", "side-card");
      card.append(el("h2", null, "Routines"));
      for (const name of routineNames) {
        card.append(el("h3", null, name));
        const list = el("ul", "mini-list routines");
        for (const item of state.routines[name]) {
          const row = el("li");
          row.append(el("span", "routine-name", item.name || "Routine"));
          const detail = [item.schedule, item.next_run ? formatWhen(item.next_run) : ""].filter(Boolean).join(" · ");
          if (detail) row.append(el("span", "fine", detail));
          list.append(row);
        }
        card.append(list);
      }
      scroll.append(card);
    }

    scroll.scrollTop = previousScroll;
    if (selected && selected !== scrolledFor) {
      for (const button of scroll.querySelectorAll(".bot")) {
        if (button.dataset.name === selected) {
          button.scrollIntoView({ block: "nearest" });
          scrolledFor = selected;
          break;
        }
      }
    }
  }

  return {
    setMode(next) {
      mode = next;
      render();
    },
    setSelected(name) {
      selected = name;
      if (name !== scrolledFor) scrolledFor = null;
      render();
    },
    renderState(next) {
      state = next;
      render();
    },
    getSelected() {
      return selected;
    },
  };
}

export function chime(kind) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!chime.ctx) chime.ctx = new AudioCtx();
  const ctx = chime.ctx;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = kind === "error" ? 196 : kind === "waiting_user" ? 523 : 680;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
  if (kind === "done") {
    const second = ctx.createOscillator();
    const gain2 = ctx.createGain();
    second.type = "sine";
    second.frequency.value = 880;
    gain2.gain.setValueAtTime(0.0001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.04, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    second.connect(gain2);
    gain2.connect(ctx.destination);
    second.start(now + 0.08);
    second.stop(now + 0.32);
  }
}
