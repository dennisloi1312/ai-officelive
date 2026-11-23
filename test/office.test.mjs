import assert from 'node:assert/strict';
import test from 'node:test';
import { pollRequest, usageFromEvents, watchTopic } from '../js/feed.js';
import {
  BUILDING,
  FLOORS,
  assignSeats,
  buildNav,
  findPath,
  pointInHall,
  teamRoom,
  visibleDesks,
} from '../js/layout.js';
import {
  NAME_CHARS,
  SPRITE_SCALE,
  layoutNameplates,
  nameplateText,
  scaledSpriteSize,
} from '../js/nameplates.js';
import { USAGE_REFRESH_LABEL, usageRefreshButton } from '../js/ui.js';
import { advanceAgent, createAgent, mentions, namedPartner } from '../js/motion.js';
import {
  DONE_MS,
  STALE_MS,
  createDemoState,
  createEmptyState,
  presentBot,
  sanitizeUsage,
  topicFromHash,
} from '../js/state.js';

test('sample office is separate from an empty live state', () => {
  const empty = createEmptyState();
  const demo = createDemoState();
  assert.equal(empty.roster.length, 0);
  assert.equal(empty.usage, null);
  assert.ok(demo.roster.length >= 8);
  assert.equal(demo.usage, null);
  assert.ok(demo.roster.includes('Kai'));
  assert.equal(demo.groups.Kai, 'Ops');
  assert.equal(demo.groups.Pink, undefined);
});

test('usage stays empty unless weekly_pct is present', () => {
  assert.equal(sanitizeUsage({ type: 'usage', total_used_pct: 37, bots: { Kai: 4 } }, Date.now()), null);
  assert.equal(sanitizeUsage({}, Date.now()), null);
  const usage = sanitizeUsage({ weekly_pct: 37, resets_at: '2026-11-07T18:00:00Z', plan: 'Pro' }, Date.now());
  assert.equal(usage.weekly_pct, 37);
  assert.equal(usage.plan, 'Pro');
});

test('stale working and finished statuses settle without inventing a new one', () => {
  const now = Date.now();
  const stale = presentBot({ status: 'working', step: 'Still listed', updatedAt: now - STALE_MS - 5 }, now, 'Kai');
  assert.equal(stale.status, 'idle');
  assert.equal(stale.raw, 'working');
  assert.equal(stale.quiet, true);
  assert.equal(stale.step, 'Still listed');
  const done = presentBot({ status: 'done', step: 'Shipped', updatedAt: now - DONE_MS - 5 }, now, 'Pink');
  assert.equal(done.status, 'idle');
  assert.equal(done.raw, 'done');
  const fresh = presentBot({ status: 'waiting_user', step: 'Need a look', updatedAt: now - 1000 }, now, 'Kai');
  assert.equal(fresh.status, 'waiting_user');
});

test('topic hash accepts only a topic, never a sample fallback flag', () => {
  assert.deepEqual(topicFromHash(''), { topic: null, invalid: false });
  assert.equal(topicFromHash('#abc').invalid, true);
  assert.equal(topicFromHash('#bad topic').invalid, true);
  assert.deepEqual(topicFromHash('#office_1'), { topic: 'office_1', invalid: false });
});

test('desks follow real groups and stay on the walkable floor', () => {
  const demo = createDemoState();
  const seats = assignSeats(
    ['Pink', 'Kai', 'Literature', 'Planner'],
    { Pink: 'Design', Kai: 'Ops', Literature: 'Research', Planner: 'Web Dev' },
  );
  assert.equal(seats.find((seat) => seat.name === 'Kai').room, 'ops');
  assert.equal(seats.find((seat) => seat.name === 'Kai').index, 0);
  assert.equal(seats.find((seat) => seat.name === 'Pink').room, 'design');
  assert.equal(seats.find((seat) => seat.name === 'Pink').index, 0);
  assert.equal(seats.find((seat) => seat.name === 'Literature').room, 'research');
  assert.equal(seats.find((seat) => seat.name === 'Planner').room, 'webdev');

  const all = assignSeats(demo.roster, demo.groups);
  assert.equal(all.length, demo.roster.length);
  assert.equal(new Set(all.map((seat) => `${seat.x},${seat.y}`)).size, all.length);
  const nav = buildNav(visibleDesks(all));
  for (const seat of all) {
    assert.equal(teamRoom(demo.groups[seat.name]), seat.room);
    assert.equal(nav.walkable(seat.x, seat.y), true, `${seat.name} at ${seat.x},${seat.y}`);
  }
  const from = all.find((seat) => seat.room === 'research');
  const to = all.find((seat) => seat.room === 'design');
  const path = findPath(nav, from.x, from.y, to.x, to.y);
  assert.ok(path.length > 4);
  assert.ok(path.some((point) => pointInHall(point.x, point.y)));
});

test('a bot walks only while working or waiting and the step names someone', () => {
  const roster = ['Kai', 'Pink', 'Quill'];
  assert.equal(mentions('Passing the draft to Pink', 'Pink'), true);
  assert.equal(mentions('Kaizen cleanup', 'Kai'), false);
  assert.equal(mentions('Pinky draft', 'Pink'), false);
  assert.equal(namedPartner('Passing the draft to Pink', 'Kai', roster, 'working'), 'Pink');
  assert.equal(namedPartner('Passing the draft to Pink', 'Kai', roster, 'idle'), null);
  assert.equal(namedPartner('Passing the draft to Pink', 'Kai', roster, 'error'), null);
  assert.equal(namedPartner('People-watching the lobby', 'Kai', roster, 'working'), null);

  const pathTo = (from, to) => [from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, to];
  const input = {
    dt: 0.05,
    reduce: false,
    seat: { x: 0, y: 0 },
    partner: { x: 120, y: 0 },
    key: 'Pink|Passing the draft to Pink',
    pathTo,
  };
  let agent = createAgent(0, 0);
  let walked = false;
  for (let i = 0; i < 160; i += 1) {
    agent = advanceAgent(agent, input);
    if (agent.walking) walked = true;
    if (i > 2 && agent.finished === input.key && agent.phase === 'sit') break;
  }
  assert.equal(agent.phase, 'sit');
  assert.equal(agent.finished, input.key);
  assert.equal(agent.x, 0);
  const again = advanceAgent(agent, input);
  assert.equal(again.phase, 'sit');
  assert.equal(again.walking, false);

  const still = advanceAgent(createAgent(10, 4), { ...input, reduce: true, seat: { x: 10, y: 4 } });
  assert.equal(still.x, 10);
  assert.equal(still.y, 4);
  assert.equal(still.walking, false);
  assert.equal(still.phase, 'sit');
});

const LIVE_ROSTER = [
  ['研究｜文獻研究員', 'Research'],
  ['研究｜寫作助理', 'Research'],
  ['研究｜審稿員', 'Research'],
  ['開發｜產品規劃', 'Web Dev'],
  ['開發｜測試員', 'Web Dev'],
  ['開發｜開發工程師', 'Web Dev'],
  ['Kai', 'Ops'],
  ['Pink', 'Design'],
];

function frameCamera(viewW, viewH, pad) {
  const bounds = {
    x: BUILDING.x - 8,
    y: BUILDING.y - 8,
    w: BUILDING.w + 16,
    h: BUILDING.h + 16,
  };
  const availW = Math.max(80, viewW - pad.left - pad.right);
  const availH = Math.max(80, viewH - pad.top - pad.bottom);
  const z = Math.min(7, Math.max(0.35, Math.min(availW / bounds.w, availH / bounds.h)));
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const screenCx = pad.left + availW / 2;
  const screenCy = pad.top + availH / 2;
  return {
    z,
    originX: screenCx - cx * z,
    originY: screenCy - cy * z,
    viewW,
    viewH,
  };
}

function measureName(name, narrow) {
  const text = nameplateText(name, narrow ? NAME_CHARS.narrow : NAME_CHARS.wide);
  const font = narrow ? 10 : 11;
  const lines = text.split('\n');
  let w = 0;
  for (const line of lines) {
    let px = 12;
    for (const ch of Array.from(line)) px += ch.codePointAt(0) < 128 ? font * 0.6 : font;
    w = Math.max(w, px);
  }
  const h = lines.length * (font + 3) + (narrow ? 4 : 18);
  return { text, w, h };
}

function liveScene(narrow, view, pad) {
  const cam = frameCamera(view.w, view.h, pad);
  const names = LIVE_ROSTER.map(([name]) => name);
  const groups = Object.fromEntries(LIVE_ROSTER);
  const seats = assignSeats(names, groups);
  const rooms = {};
  let hall = null;
  for (const floor of FLOORS) {
    const rect = {
      x: cam.originX + floor.x * cam.z,
      y: cam.originY + floor.y * cam.z,
      w: floor.w * cam.z,
      h: floor.h * cam.z,
    };
    if (floor.id === 'hhall') hall = rect;
    else if (floor.id === 'research' || floor.id === 'webdev' || floor.id === 'ops' || floor.id === 'design') {
      rooms[floor.id] = rect;
    }
  }
  const below = Math.max(14, 10 * SPRITE_SCALE * cam.z);
  const tags = seats.map((seat) => {
    const measured = measureName(seat.name, narrow);
    const anchorX = cam.originX + seat.x * cam.z;
    const anchorY = cam.originY + seat.y * cam.z;
    return {
      name: seat.name,
      room: seat.room,
      w: measured.w,
      h: measured.h,
      ax: anchorX - measured.w / 2,
      ay: anchorY + below,
      anchorX,
      anchorY,
    };
  });
  const placed = layoutNameplates(tags, {
    rooms,
    hall,
    viewW: view.w,
    viewH: view.h,
  });
  return { cam, rooms, hall, placed };
}

function byName(placed, name) {
  return placed.find((tag) => tag.name === name);
}

function inside(tag, rect) {
  return tag.y >= rect.y - 1 && tag.y + tag.h <= rect.y + rect.h + 1
    && tag.x >= rect.x - 1 && tag.x + tag.w <= rect.x + rect.w + 1;
}

test('character sprites draw at 1.25× the 7×6 base', () => {
  assert.equal(SPRITE_SCALE, 1.25);
  assert.deepEqual(scaledSpriteSize(7, 6), { w: 8.75, h: 7.5 });
});

test('live nameplates keep the fullwidth bar and wrap only the long roles', () => {
  assert.equal(nameplateText('研究｜文獻研究員', NAME_CHARS.wide), '研究｜文獻\n研究員');
  assert.equal(nameplateText('開發｜開發工程師', NAME_CHARS.wide), '開發｜開發\n工程師');
  assert.equal(nameplateText('研究｜寫作助理', NAME_CHARS.wide), '研究｜寫作助理');
  assert.equal(nameplateText('研究｜審稿員', NAME_CHARS.wide), '研究｜審稿員');
  assert.equal(nameplateText('開發｜產品規劃', NAME_CHARS.wide), '開發｜產品規劃');
  assert.equal(nameplateText('研究｜寫作助理', NAME_CHARS.narrow), '研究｜寫作\n助理');
  assert.equal(nameplateText('開發｜產品規劃', NAME_CHARS.narrow), '開發｜產品\n規劃');
  assert.equal(nameplateText('研究｜審稿員', NAME_CHARS.narrow), '研究｜審稿員');
  assert.equal(nameplateText('開發｜測試員', NAME_CHARS.narrow), '開發｜測試員');
  assert.equal(nameplateText('Kai', NAME_CHARS.wide), 'Kai');
  assert.equal(nameplateText('小墨', NAME_CHARS.narrow), '小墨');
  for (const name of ['研究｜文獻研究員', '研究｜寫作助理', '研究｜審稿員', '開發｜開發工程師']) {
    const text = nameplateText(name, NAME_CHARS.narrow);
    assert.equal(text.includes('｜'), true, name);
    assert.equal(text.includes('|'), false, name);
  }
});

test('desktop live row keeps every research and web name inside its room', () => {
  const { rooms, placed } = liveScene(false, { w: 1440, h: 900 }, {
    left: 300, right: 316, top: 74, bottom: 148,
  });
  assert.equal(placed.length, 8);
  assert.equal(placed.every((tag) => tag.hidden === false), true);
  const research = ['研究｜文獻研究員', '研究｜寫作助理', '研究｜審稿員'].map((name) => byName(placed, name));
  for (const tag of research) {
    assert.equal(tag.corridor, false, tag.name);
    assert.equal(inside(tag, rooms.research), true, tag.name);
  }
  const ys = research.map((tag) => tag.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 8);
  const web = ['開發｜產品規劃', '開發｜測試員', '開發｜開發工程師'].map((name) => byName(placed, name));
  for (const tag of web) {
    assert.equal(tag.corridor, false, tag.name);
    assert.equal(inside(tag, rooms.webdev), true, tag.name);
  }
  assert.equal(inside(byName(placed, 'Kai'), rooms.ops), true);
  assert.equal(inside(byName(placed, 'Pink'), rooms.design), true);
});

test('mobile live view parks 審稿員 and 開發工程師 in the corridor', () => {
  const stageH = 844 - 116 - Math.round(844 * 0.42);
  const { rooms, hall, placed } = liveScene(true, { w: 390, h: stageH }, {
    left: 8, right: 8, top: 6, bottom: 6,
  });
  assert.equal(placed.filter((tag) => !tag.hidden).length, 8);
  const literature = byName(placed, '研究｜文獻研究員');
  const writer = byName(placed, '研究｜寫作助理');
  const reviewer = byName(placed, '研究｜審稿員');
  const planner = byName(placed, '開發｜產品規劃');
  const tester = byName(placed, '開發｜測試員');
  const engineer = byName(placed, '開發｜開發工程師');
  assert.equal(literature.corridor, false);
  assert.equal(writer.corridor, false);
  assert.equal(inside(literature, rooms.research), true);
  assert.equal(inside(writer, rooms.research), true);
  assert.equal(reviewer.corridor, true);
  assert.ok(Math.abs(reviewer.y - hall.y) < 2);
  assert.ok(reviewer.y >= rooms.research.y + rooms.research.h - 8);
  assert.equal(planner.corridor, false);
  assert.equal(tester.corridor, false);
  assert.equal(inside(planner, rooms.webdev), true);
  assert.equal(inside(tester, rooms.webdev), true);
  assert.equal(engineer.corridor, true);
  assert.ok(Math.abs(engineer.y - hall.y) < 2);
  assert.equal(inside(byName(placed, 'Kai'), rooms.ops), true);
  assert.equal(inside(byName(placed, 'Pink'), rooms.design), true);
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(hit, false, `${a.name} overlaps ${b.name}`);
    }
  }
});

test('usage refresh re-polls with GET and never invents a number', async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  const previousSource = globalThis.EventSource;
  const previousWindow = globalThis.window;
  globalThis.window = {
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  globalThis.EventSource = class {
    constructor(url) {
      calls.push({ url: String(url), method: 'GET', kind: 'sse' });
      this.listeners = {};
    }
    addEventListener() {}
    close() {}
  };
  const rows = { current: '' };
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({
      url: String(url),
      method: opts.method || 'GET',
      body: opts.body,
    });
    if (rows.current === 'boom') throw new Error('offline');
    return { ok: true, status: 200, text: async () => rows.current };
  };
  const request = pollRequest('office1');
  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://ntfy.sh/office1/json?poll=1&since=12h');
  assert.equal(usageFromEvents([]), null);
  assert.equal(usageFromEvents([{
    id: 'no-usage',
    time: 10,
    event: 'message',
    message: JSON.stringify({ type: 'usage', total_used_pct: 99, bots: { Kai: 4 } }),
  }]), null);

  let state = null;
  const stop = watchTopic('office1', {
    onStatus() {},
    onState(next) { state = next; },
  });
  const empty = await stop.refresh();
  assert.equal(empty.ok, true);
  assert.equal(empty.usage, null);
  assert.equal(state.usage, null);

  rows.current = `${JSON.stringify({
    id: 'u1',
    time: 1700000000,
    event: 'message',
    message: JSON.stringify({ weekly_pct: 42, plan: 'Team' }),
  })}\n`;
  const loaded = await stop.refresh();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.usage.weekly_pct, 42);
  assert.equal(state.usage.weekly_pct, 42);
  assert.equal(state.usage.plan, 'Team');

  rows.current = 'boom';
  const failed = await stop.refresh();
  assert.equal(failed.ok, false);
  assert.equal(state.usage.weekly_pct, 42);

  assert.equal(calls.some((call) => call.method && call.method !== 'GET'), false);
  assert.equal(calls.some((call) => call.body != null), false);
  assert.equal(calls.some((call) => call.url.includes('/json?poll=1&since=12h')), true);
  stop();
  globalThis.fetch = previousFetch;
  globalThis.EventSource = previousSource;
  globalThis.window = previousWindow;
});

test('usage refresh button lives in the card and only calls the handler', async () => {
  class Node {
    constructor(tag) {
      this.tagName = tag;
      this.className = '';
      this.attrs = {};
      this.listeners = {};
      this.dataset = {};
      this.children = [];
      this.textContent = '';
    }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    removeAttribute(key) { delete this.attrs[key]; }
    append(...nodes) {
      for (const node of nodes) {
        this.children.push(node);
        this.textContent += typeof node === 'string' ? node : (node.textContent || '');
      }
    }
    appendChild(node) { this.append(node); return node; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
  }
  const previous = globalThis.document;
  globalThis.document = {
    createElement(tag) { return new Node(tag); },
    createElementNS(_ns, tag) { return new Node(tag); },
    createTextNode(text) { return text; },
  };
  const calls = [];
  const button = usageRefreshButton(() => {
    calls.push('refresh');
    return Promise.resolve({ ok: true, usage: null });
  });
  assert.equal(button.className, 'usage-refresh');
  assert.equal(button.textContent.includes(USAGE_REFRESH_LABEL), true);
  assert.equal(USAGE_REFRESH_LABEL, '手動刷新用量');
  button.listeners.click();
  await Promise.resolve();
  assert.deepEqual(calls, ['refresh']);
  globalThis.document = previous;
});
