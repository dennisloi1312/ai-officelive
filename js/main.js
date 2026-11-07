import { watchDemo, watchTopic } from './feed.js';
import { createOffice } from './office.js';
import { createSound } from './sound.js';
import { createEmptyState, topicFromHash } from './state.js';
import { mountUI } from './ui.js';

const stage = document.getElementById('stage');
const sound = createSound();
let selected = null;
let stopFeed = () => {};
let primed = false;
const previous = new Map();

const office = createOffice(stage, {
  onPick(name) {
    choose(name);
  },
});

const ui = mountUI({
  onSelect(name) {
    choose(name);
  },
  onReset() {
    office.resetCamera();
  },
  onSound() {
    const on = sound.toggle();
    ui.setSound(on);
    if (on) sound.blip('working');
  },
});

function choose(name) {
  selected = name || null;
  if (selected) office.focus(selected);
  else office.clearSelection();
  ui.setSelected(selected);
}

function onState(next, meta) {
  if (meta?.sound && primed && sound.enabled) {
    for (const name of next.roster) {
      const status = next.bots[name]?.status;
      const before = previous.get(name);
      if (before && status && before !== status) sound.blip(status);
    }
  }
  previous.clear();
  for (const name of next.roster) previous.set(name, next.bots[name]?.status || '');
  primed = true;
  if (selected && !next.roster.includes(selected)) {
    selected = null;
    office.clearSelection();
  }
  office.setState(next);
  ui.sync(next, selected);
}

function boot() {
  stopFeed();
  primed = false;
  previous.clear();
  selected = null;
  office.clearSelection();
  ui.setSelected(null);
  const parsed = topicFromHash(location.hash);
  if (!parsed.topic) {
    ui.setBanner(parsed.invalid ? 'invalid' : 'demo');
    stopFeed = watchDemo({ onStatus: ui.setMode, onState });
    return;
  }
  ui.setBanner('live');
  ui.setMode('connecting');
  office.setState(createEmptyState());
  stopFeed = watchTopic(parsed.topic, { onStatus: ui.setMode, onState });
}

window.addEventListener('hashchange', boot);
window.addEventListener('keydown', (event) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'Escape') choose(null);
  if ((event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey && !event.altKey) {
    office.resetCamera();
  }
});

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const applyMotion = () => office.setReduce(motion.matches);
applyMotion();
if (motion.addEventListener) motion.addEventListener('change', applyMotion);

boot();
