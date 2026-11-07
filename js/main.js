import { createDemoRows, DEMO_BEATS } from "./demo.js";
import { connectTopic, loadCache } from "./ntfy.js";
import { createOffice } from "./office.js";
import { effectiveStatus } from "./state.js";
import { createStore } from "./state.js";
import { chime, createPanel } from "./ui.js";

const TOPIC_RE = /^[A-Za-z0-9_-]{6,64}$/;

function topicFromHash() {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return TOPIC_RE.test(value) ? value : null;
}

function main() {
  const viewport = document.getElementById("viewport");
  const panelRoot = document.getElementById("panel");
  const toggle = document.getElementById("panel-toggle");
  const store = createStore();
  let soundOn = false;
  let previous = new Map();

  const panel = createPanel(panelRoot, {
    onSelect(name) {
      panel.setSelected(name);
      office.setSelected(name);
      if (name) office.focus(name);
    },
    onSound(on) {
      soundOn = on;
    },
  });

  const office = createOffice(viewport, {
    onSelect(name) {
      panel.setSelected(name);
      office.setSelected(name);
      if (name) office.focus(name);
    },
    onViewError() {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = "This browser could not start the 3D view. The roster below still updates.";
      panelRoot.prepend(note);
    },
  });

  store.subscribe((state) => {
    office.sync(state);
    panel.renderState(state);
    if (!soundOn) {
      remember(state);
      return;
    }
    const names = new Set([...previous.keys(), ...Object.keys(state.bots)]);
    const now = Date.now();
    for (const name of names) {
      const next = state.bots[name];
      const prev = previous.get(name);
      const nextStatus = effectiveStatus(next, now);
      const prevStatus = prev ? prev.status : null;
      if (next && nextStatus !== prevStatus && (nextStatus === "done" || nextStatus === "error" || nextStatus === "waiting_user")) {
        chime(nextStatus);
      }
    }
    remember(state);
  });

  function remember(state) {
    previous = new Map();
    const now = Date.now();
    for (const [name, bot] of Object.entries(state.bots)) {
      previous.set(name, { status: effectiveStatus(bot, now) });
    }
  }

  let stopNet = () => {};
  let demoTimer = 0;
  let beat = 0;

  function stopDemo() {
    if (demoTimer) {
      window.clearInterval(demoTimer);
      demoTimer = 0;
    }
  }

  function start() {
    stopNet();
    stopNet = () => {};
    stopDemo();
    const topic = topicFromHash();
    if (!topic) {
      panel.setMode("demo");
      store.replaceFromMessages(createDemoRows(Date.now()));
      demoTimer = window.setInterval(() => {
        const payload = DEMO_BEATS[beat % DEMO_BEATS.length];
        beat += 1;
        store.applyMessage({
          id: `demo-beat-${Date.now()}-${beat}`,
          time: Math.floor(Date.now() / 1000),
          event: "message",
          message: JSON.stringify(payload),
        });
      }, 9000);
      return;
    }
    const cached = loadCache(topic);
    if (cached) store.hydrate(cached);
    else store.reset();
    panel.setMode("connecting");
    stopNet = connectTopic(topic, store, (mode) => panel.setMode(mode));
  }

  toggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("panel-collapsed");
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.textContent = collapsed ? "Show roster" : "Hide roster";
    office.resize();
  });

  window.addEventListener("hashchange", start);
  window.setInterval(() => {
    const state = store.get();
    if (state) panel.renderState(state);
  }, 15000);

  start();
}

main();
