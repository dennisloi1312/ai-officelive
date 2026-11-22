/** Corridor walks only when a working or waiting step names another bot. */

const SPEED = 62;
const MEET = 18;
const PAUSE = 1.15;

export function mentions(step, name) {
  const hay = String(step || '').toLowerCase();
  const token = String(name || '').toLowerCase();
  if (!token || hay.length < token.length) return false;
  let from = 0;
  while (from <= hay.length - token.length) {
    const at = hay.indexOf(token, from);
    if (at < 0) return false;
    const before = at === 0 || !/[\p{L}\p{N}_]/u.test(hay[at - 1]);
    const afterAt = at + token.length;
    const after = afterAt >= hay.length || !/[\p{L}\p{N}_]/u.test(hay[afterAt]);
    if (before && after) return true;
    from = at + token.length;
  }
  return false;
}

export function namedPartner(step, self, roster, status) {
  if (status !== 'working' && status !== 'waiting_user') return null;
  const names = (roster || [])
    .filter((name) => name && name !== self)
    .sort((a, b) => b.length - a.length);
  return names.find((name) => mentions(step, name)) || null;
}

export function createAgent(x, y) {
  return {
    x,
    y,
    phase: 'sit',
    key: '',
    finished: '',
    path: [],
    cursor: 0,
    pause: 0,
    walking: false,
  };
}

function moveAlong(agent, dt) {
  const target = agent.path[agent.cursor];
  if (!target) return true;
  const dx = target.x - agent.x;
  const dy = target.y - agent.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1.5) {
    agent.x = target.x;
    agent.y = target.y;
    agent.cursor += 1;
    return agent.cursor >= agent.path.length;
  }
  const step = Math.min(dist, SPEED * dt);
  agent.x += (dx / dist) * step;
  agent.y += (dy / dist) * step;
  agent.walking = true;
  return false;
}

function trimMeet(path, partner) {
  if (!partner || path.length < 2) return path;
  let end = path.length - 1;
  while (end > 0 && Math.hypot(path[end].x - partner.x, path[end].y - partner.y) < MEET) end -= 1;
  return path.slice(0, end + 1);
}

/**
 * @param {ReturnType<createAgent>} agent
 * @param {{ dt: number, reduce: boolean, seat: {x:number,y:number}, partner: {x:number,y:number}|null, key: string, pathTo: Function }} input
 */
export function advanceAgent(agent, input) {
  const dt = Math.min(Math.max(input.dt || 0, 0), 0.05);
  const next = {
    x: agent.x,
    y: agent.y,
    phase: agent.phase,
    key: agent.key,
    finished: agent.finished,
    path: agent.path,
    cursor: agent.cursor,
    pause: agent.pause,
    walking: false,
  };
  const seat = input.seat;
  if (input.reduce || !seat) {
    next.x = seat ? seat.x : next.x;
    next.y = seat ? seat.y : next.y;
    next.phase = 'sit';
    next.path = [];
    next.cursor = 0;
    next.walking = false;
    if (input.key) next.finished = input.key;
    return next;
  }
  const partner = input.partner;
  const key = partner ? input.key : '';
  if (next.phase === 'sit') {
    next.x += (seat.x - next.x) * Math.min(1, dt * 6);
    next.y += (seat.y - next.y) * Math.min(1, dt * 6);
    if (Math.hypot(seat.x - next.x, seat.y - next.y) < 0.6) {
      next.x = seat.x;
      next.y = seat.y;
    }
    if (partner && next.finished !== key) {
      const path = trimMeet(input.pathTo(seat, partner) || [], partner);
      if (path.length > 1) {
        next.phase = 'out';
        next.key = key;
        next.path = path;
        next.cursor = 0;
        next.pause = 0;
      } else {
        next.finished = key;
      }
    }
    return next;
  }
  if (!partner && next.phase !== 'back') {
    next.phase = 'back';
    next.path = input.pathTo({ x: next.x, y: next.y }, seat) || [];
    next.cursor = 0;
    next.pause = 0;
  }
  if (next.phase === 'out' || next.phase === 'back') {
    const arrived = moveAlong(next, dt);
    if (next.phase === 'out' && partner && Math.hypot(next.x - partner.x, next.y - partner.y) <= MEET) {
      next.phase = 'pause';
      next.pause = 0;
      next.walking = false;
    } else if (arrived) {
      if (next.phase === 'out') {
        next.phase = 'pause';
        next.pause = 0;
        next.walking = false;
      } else {
        next.phase = 'sit';
        next.finished = next.key || key;
        next.path = [];
        next.cursor = 0;
        next.x = seat.x;
        next.y = seat.y;
      }
    }
    return next;
  }
  if (next.phase === 'pause') {
    next.pause += dt;
    if (next.pause >= PAUSE) {
      next.phase = 'back';
      next.path = input.pathTo({ x: next.x, y: next.y }, seat) || [];
      next.cursor = 0;
    }
  }
  return next;
}
