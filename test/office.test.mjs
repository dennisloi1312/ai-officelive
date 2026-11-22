import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignSeats,
  buildNav,
  findPath,
  pointInHall,
  teamRoom,
  visibleDesks,
} from '../js/layout.js';
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
