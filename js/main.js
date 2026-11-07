import { watchDemo, watchTopic } from './feed.js';
import { createOffice } from './office.js';
import { createSound } from './sound.js';
import { createEmptyState, floorPlan, topicFromHash } from './state.js';
import { mountUI } from './ui.js';

const stage = document.getElementById('stage');
const sound = createSound();
let state = createEmptyState();
let floorIndex = 0;
let selected = null;
let mode = 'demo';
let stopFeed = () => {};
let primed = false;
const previous = new Map();

const office = createOffice(stage, {
  onPick(name) {
    if (name) selectBot(name);
    else closeBot();
  },
});

const ui = mountUI({
  onFloor(index) {
    selectFloor(index);
  },
  onBot(name) {
    selectBot(name);
  },
  onClose() {
    closeBot();
  },
  onZoom(direction) {
    office.zoom(direction);
  },
  onSound() {
    const on = sound.toggle();
    ui.setSound(on);
    if (on) sound.blip('working');
  },
});

function paint() {
  const floors = floorPlan(state);
  if (!floors.length) floorIndex = 0;
  else if (floorIndex >= floors.length) floorIndex = 0;
  office.setState(state);
  office.setFloor(floorIndex);
  if (selected) office.focusBot(selected);
  else office.clearBot();
  ui.sync({ state, floorIndex, selected });
}

function selectFloor(index) {
  const floors = floorPlan(state);
  floorIndex = Math.max(0, Math.min(floors.length - 1, index));
  const floor = floors[floorIndex];
  if (selected && floor && !floor.bots.includes(selected)) {
    selected = null;
    office.clearBot();
  }
  office.setFloor(floorIndex);
  ui.sync({ state, floorIndex, selected });
}

function selectBot(name) {
  selected = name;
  const floors = floorPlan(state);
  const index = floors.findIndex((floor) => floor.bots.includes(name));
  if (index >= 0) {
    floorIndex = index;
    office.setFloor(index);
  }
  office.focusBot(name);
  ui.sync({ state, floorIndex, selected });
}

function closeBot() {
  selected = null;
  office.clearBot();
  ui.sync({ state, floorIndex, selected });
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
  state = next;
  if (selected && !state.roster.includes(selected)) selected = null;
  paint();
}

function boot() {
  stopFeed();
  primed = false;
  previous.clear();
  selected = null;
  floorIndex = 0;
  const parsed = topicFromHash(location.hash);
  if (!parsed.topic) {
    mode = 'demo';
    ui.setBanner(parsed.invalid ? 'invalid' : 'demo');
    stopFeed = watchDemo({
      onStatus(next) {
        mode = next;
        ui.setMode(next);
      },
      onState,
    });
    return;
  }
  ui.setBanner('live');
  ui.setMode('connecting');
  state = createEmptyState();
  paint();
  stopFeed = watchTopic(parsed.topic, {
    onStatus(next) {
      mode = next;
      ui.setMode(next);
    },
    onState,
  });
}

window.addEventListener('hashchange', boot);
window.addEventListener('keydown', (event) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'Escape') closeBot();
  if (event.key === '+' || event.key === '=') office.zoom(1);
  if (event.key === '-' || event.key === '_') office.zoom(-1);
});

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const applyMotion = () => office.setReduce(motion.matches);
applyMotion();
if (motion.addEventListener) motion.addEventListener('change', applyMotion);

boot();
void mode;
