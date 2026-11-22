/** Top-down pixel office. Idle bots stay at their desks. */

import { el } from './dom.js';
import {
  BUILDING,
  DOORS,
  FLOORS,
  FURNITURE,
  SIGNS,
  WALLS,
  WORLD,
  assignSeats,
  boundsOf,
  buildNav,
  findPath,
  teamRoom,
  visibleDesks,
} from './layout.js';
import { advanceAgent, createAgent, namedPartner } from './motion.js';
import { floorPlan, hashName, lookFor, presentBot } from './state.js';

const STATUS_COLOR = {
  working: '#34C759',
  waiting_user: '#F5A524',
  error: '#FF5A5F',
  done: '#5AA9FF',
  idle: '#9AA0A6',
};

const STATUS_WORD = {
  working: 'Working',
  waiting_user: 'Waiting',
  error: 'Error',
  done: 'Done',
  idle: 'Resting',
};

const SHAPES = {
  sphere: ['  ###  ', ' ##### ', '#######', '#######', ' ##### ', '  ###  '],
  rounded_cube: [' ##### ', '#######', '#######', '#######', '#######', ' ##### '],
  rounded_square: ['#######', '#######', '#######', '#######', '#######', '#######'],
  pill: ['  ###  ', ' ##### ', ' ##### ', ' ##### ', ' ##### ', '  ###  '],
  triangle: ['   #   ', '  ###  ', '  ###  ', ' ##### ', '#######', '#######'],
  cone: ['   #   ', '  ###  ', '  ###  ', ' ##### ', ' ##### ', '#######'],
  pentagon: ['  ###  ', ' ##### ', '#######', '#######', ' ##### ', '  ###  '],
  hexagon: ['  ###  ', ' ##### ', '#######', '#######', ' ##### ', '  ###  '],
  star4: ['   #   ', '  ###  ', '#######', '  ###  ', ' # # # ', '##   ##'],
  star6: [' # # # ', '#######', ' ##### ', '#######', ' # # # ', '  # #  '],
  clover: [' ## ## ', '#######', '#######', ' ##### ', '#######', '##   ##'],
  trio: [' ## ## ', '#######', ' ##### ', '#######', ' ##### ', '  ###  '],
};

const PLANTS = [
  [188, 24], [24, 108], [438, 24], [438, 104],
  [24, 292], [188, 292], [438, 292], [196, 344], [270, 344],
];

function shapeOf(kind) {
  return SHAPES[kind] || SHAPES.sphere;
}

function blit(ctx, mask, cx, cy, color, outline = '#142018') {
  const h = mask.length;
  const w = mask[0].length;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  ctx.fillStyle = outline;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (mask[y][x] !== '#') continue;
      ctx.fillRect(x0 + x + 1, y0 + y + 1, 1, 1);
    }
  }
  ctx.fillStyle = color;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (mask[y][x] === '#') ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
  return { x: x0, y: y0, w, h };
}

function checker(ctx, rect, a, b, size = 8) {
  for (let y = 0; y < rect.h; y += size) {
    for (let x = 0; x < rect.w; x += size) {
      const tx = rect.x + x;
      const ty = rect.y + y;
      ctx.fillStyle = ((Math.floor(tx / size) + Math.floor(ty / size)) % 2) === 0 ? a : b;
      ctx.fillRect(tx, ty, Math.min(size, rect.w - x), Math.min(size, rect.h - y));
    }
  }
}

function ring(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  const steps = 20;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), 2, 2);
  }
}

function drawPlant(ctx, x, y) {
  ctx.fillStyle = '#8D643C';
  ctx.fillRect(x + 3, y + 8, 6, 4);
  ctx.fillStyle = '#6B4424';
  ctx.fillRect(x + 2, y + 7, 8, 2);
  ctx.fillStyle = '#2F8A3E';
  ctx.fillRect(x + 2, y + 3, 8, 5);
  ctx.fillStyle = '#3EAF4E';
  ctx.fillRect(x + 4, y + 1, 4, 4);
  ctx.fillStyle = '#1E6B30';
  ctx.fillRect(x + 1, y + 4, 3, 3);
}

function drawDesk(ctx, desk, screen, time, typing) {
  ctx.fillStyle = 'rgba(20, 30, 20, 0.25)';
  ctx.fillRect(desk.deskX + 2, desk.deskY + 3, desk.deskW, desk.deskH);
  ctx.fillStyle = '#6B4423';
  ctx.fillRect(desk.deskX, desk.deskY, desk.deskW, desk.deskH);
  ctx.fillStyle = '#A56B38';
  ctx.fillRect(desk.deskX, desk.deskY, desk.deskW, 4);
  ctx.fillStyle = '#C48A52';
  ctx.fillRect(desk.deskX + 1, desk.deskY + 1, desk.deskW - 2, 2);
  const mx = desk.deskX + Math.round(desk.deskW / 2) - 6;
  const my = desk.deskY + 2;
  ctx.fillStyle = '#1C2822';
  ctx.fillRect(mx, my, 12, 8);
  ctx.fillStyle = screen;
  ctx.fillRect(mx + 1, my + 1, 10, 6);
  if (typing) {
    const scan = Math.floor(time * 3) % 5;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(mx + 1, my + 1 + scan, 10, 1);
  }
  ctx.fillStyle = '#3A322C';
  ctx.fillRect(desk.deskX + 10, desk.deskY + desk.deskH - 4, 12, 2);
}

function drawChair(ctx, x, y) {
  ctx.fillStyle = '#5A4030';
  ctx.fillRect(x - 5, y - 2, 10, 6);
  ctx.fillStyle = '#8B6848';
  ctx.fillRect(x - 4, y - 3, 8, 4);
}

function drawShelf(ctx, rect) {
  ctx.fillStyle = '#6B4A2E';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const colors = ['#3B6FD6', '#E0A23A', '#D4534A', '#6B4BB5', '#2F9E8F'];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = colors[(row + col) % colors.length];
      ctx.fillRect(rect.x + 2, rect.y + 3 + row * 11 + col, 8, 7);
    }
  }
}

function drawBoard(ctx, rect) {
  ctx.fillStyle = '#8D928A';
  ctx.fillRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
  ctx.fillStyle = '#F7F4EC';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = '#D9D4C8';
  ctx.fillRect(rect.x + 4, rect.y + 2, rect.w - 8, 1);
}

function drawCounter(ctx, rect) {
  ctx.fillStyle = '#8D643C';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = '#C4A574';
  ctx.fillRect(rect.x, rect.y, rect.w, 5);
  ctx.fillStyle = '#3A322C';
  ctx.fillRect(rect.x + 4, rect.y + 6, 8, 8);
  ctx.fillStyle = '#F2E4CC';
  ctx.fillRect(rect.x + 16, rect.y + 7, 5, 4);
  ctx.fillStyle = '#E07A6A';
  ctx.fillRect(rect.x + 24, rect.y + 7, 5, 4);
  ctx.fillStyle = '#5C4634';
  ctx.fillRect(rect.x + 6, rect.y + rect.h - 2, 4, 6);
  ctx.fillRect(rect.x + 28, rect.y + rect.h - 2, 4, 6);
}

function drawSwatch(ctx, rect) {
  const colors = ['#F26D8A', '#F5A524', '#34C759', '#5AA9FF', '#C9A6E8', '#1C1C20'];
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y + index * 9, rect.w, 8);
  });
}

function drawBot(ctx, actor, time, reduce) {
  const color = STATUS_COLOR[actor.status] || STATUS_COLOR.idle;
  ring(ctx, actor.x, actor.y, actor.selected ? 9 : 8, actor.selected ? '#FFFFFF' : color);
  if (actor.selected) ring(ctx, actor.x, actor.y, 11, color);
  const bob = actor.walking && !reduce ? Math.sin(time * 10 + actor.phase) * 1 : 0;
  const mask = shapeOf(actor.look.shape);
  const body = blit(ctx, mask, actor.x + bob, actor.y, actor.look.color);
  const eyeY = body.y + 2;
  const eyeX = body.x + Math.round(body.w / 2);
  const ox = actor.face === 'e' ? 1 : actor.face === 'w' ? -1 : 0;
  const oy = actor.face === 's' ? 1 : 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(eyeX - 3 + ox, eyeY + oy, 2, 2);
  ctx.fillRect(eyeX + 1 + ox, eyeY + oy, 2, 2);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(eyeX - 2 + ox, eyeY + 1 + oy, 1, 1);
  ctx.fillRect(eyeX + 2 + ox, eyeY + 1 + oy, 1, 1);
  const accessory = actor.look.accessory;
  if (accessory === 'antenna' || accessory === 'stem') {
    ctx.fillStyle = accessory === 'stem' ? '#2F8A3E' : '#1A1A1A';
    ctx.fillRect(eyeX, body.y - 3, 1, 3);
    ctx.fillStyle = accessory === 'stem' ? '#3EAF4E' : actor.look.color;
    ctx.fillRect(eyeX - 1, body.y - 5, 3, 2);
  } else if (accessory === 'glasses') {
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(eyeX - 4 + ox, eyeY + oy, 3, 1);
    ctx.fillRect(eyeX + 1 + ox, eyeY + oy, 3, 1);
  } else if (accessory === 'bow') {
    ctx.fillStyle = '#F2A3C7';
    ctx.fillRect(body.x + body.w - 2, eyeY, 3, 2);
    ctx.fillRect(body.x + body.w - 1, eyeY + 2, 2, 1);
  }
}

function dashes(ctx, points, color) {
  if (!points || points.length < 2) return;
  ctx.fillStyle = color;
  let on = true;
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const steps = Math.ceil(len / 4);
    for (let s = 0; s <= steps; s += 1) {
      carry += 1;
      if (carry % 2 === 0) on = !on;
      if (!on) continue;
      const t = s / steps;
      ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 2, 2);
    }
  }
  void color;
}

function paintArt(ctx, time, desks, actors, paths, reduce) {
  checker(ctx, { x: 0, y: 0, w: WORLD.w, h: WORLD.h }, '#E5D7BE', '#F3E7D2', 16);
  ctx.fillStyle = '#10261C';
  ctx.fillRect(BUILDING.x, BUILDING.y, BUILDING.w, BUILDING.h);
  ctx.fillStyle = '#1B3A2C';
  ctx.fillRect(BUILDING.x + 2, BUILDING.y + 2, BUILDING.w - 4, BUILDING.h - 4);
  for (const floor of FLOORS) checker(ctx, floor, floor.a, floor.b, 8);
  ctx.fillStyle = '#142E22';
  for (const wall of WALLS) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  for (const door of DOORS) {
    checker(ctx, door, '#E4CFA8', '#F6E6C8', 8);
    ctx.fillStyle = '#6B4423';
    ctx.fillRect(door.x, door.y, 3, door.h);
  }
  ctx.fillStyle = '#6B3030';
  ctx.fillRect(226, 308, 28, 14);
  ctx.fillStyle = '#8C403C';
  ctx.fillRect(228, 310, 24, 8);
  for (const piece of FURNITURE) {
    if (piece.id === 'shelf') drawShelf(ctx, piece);
    else if (piece.id === 'board') drawBoard(ctx, piece);
    else if (piece.id === 'counter') drawCounter(ctx, piece);
    else if (piece.id === 'swatch') drawSwatch(ctx, piece);
  }
  const typing = new Map(actors.map((actor) => [actor.name, actor]));
  for (const desk of desks) {
    const actor = desk.name ? typing.get(desk.name) : null;
    const screen = actor ? (STATUS_COLOR[actor.status] || '#2A3330') : '#24302C';
    const live = actor && actor.status === 'working' && !actor.walking && !reduce;
    drawDesk(ctx, desk, screen, time, live);
    drawChair(ctx, desk.x, desk.y);
  }
  for (const [x, y] of PLANTS) drawPlant(ctx, x, y);
  for (const path of paths) dashes(ctx, path, '#7B4FD6');
  const order = actors.slice().sort((a, b) => a.y - b.y);
  for (const actor of order) drawBot(ctx, actor, time, reduce);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function separate(boxes) {
  for (let pass = 0; pass < 28; pass += 1) {
    let hit = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.fixed && b.fixed) continue;
        if (!overlaps(a, b)) continue;
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX <= 0 || oy <= 0) continue;
        hit = true;
        const aWeight = a.fixed ? 0 : b.fixed ? 1 : (a.pri >= b.pri ? 0.25 : 1);
        const bWeight = b.fixed ? 0 : a.fixed ? 1 : (b.pri >= a.pri ? 0.25 : 1);
        const total = aWeight + bWeight || 1;
        if (overlapX < oy) {
          const dir = (a.x + a.w / 2) <= (b.x + b.w / 2) ? -1 : 1;
          a.x += dir * (overlapX + 2) * (aWeight / total);
          b.x -= dir * (overlapX + 2) * (bWeight / total);
        } else {
          const dir = (a.y + a.h / 2) <= (b.y + b.h / 2) ? -1 : 1;
          a.y += dir * (oy + 2) * (aWeight / total);
          b.y -= dir * (oy + 2) * (bWeight / total);
        }
      }
    }
    if (!hit) break;
  }
}

function faceOf(dx, dy, walking) {
  if (!walking) return 'n';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

export function createOffice(stage, hooks) {
  const canvas = document.createElement('canvas');
  canvas.className = 'view';
  canvas.setAttribute('aria-label', 'Top-down pixel office. Pan with a drag, pinch or scroll to zoom, and choose a bot.');
  const labels = el('div', 'map-labels');
  stage.appendChild(canvas);
  stage.appendChild(labels);
  const view = canvas.getContext('2d');
  if (!view) {
    const fatal = document.getElementById('fatal');
    if (fatal) {
      fatal.hidden = false;
      fatal.textContent = 'This browser could not start the office view.';
    }
    return {
      setState() {},
      setFloor() {},
      focusBot() {},
      clearBot() {},
      zoom() {},
      setReduce() {},
      resize() {},
    };
  }
  const art = document.createElement('canvas');
  art.width = WORLD.w;
  art.height = WORLD.h;
  const artCtx = art.getContext('2d');

  let state = null;
  let reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = null;
  let hovered = null;
  let active = -1;
  let framed = false;
  let userMoved = false;
  let frameTarget = { x: BUILDING.x, y: BUILDING.y, w: BUILDING.w, h: BUILDING.h };
  const cam = { x: WORLD.w / 2, y: WORLD.h / 2, z: 2 };
  const camTo = { x: cam.x, y: cam.y, z: cam.z };
  const agents = new Map();
  let assignments = [];
  let desks = [];
  let nav = buildNav();
  let seatKey = '';
  let viewW = 1;
  let viewH = 1;
  const pointers = new Map();
  let pinch = null;
  let dragging = false;
  const nodes = new Map();

  function insets() {
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    if (narrow) return { left: 8, right: 8, top: 6, bottom: 6 };
    const banner = document.getElementById('banner');
    const bannerOn = banner && !banner.hidden;
    return { left: 300, right: 316, top: bannerOn ? 96 : 74, bottom: 148 };
  }

  function fit(bounds) {
    const pad = insets();
    const availW = Math.max(80, viewW - pad.left - pad.right);
    const availH = Math.max(80, viewH - pad.top - pad.bottom);
    const z = Math.min(7, Math.max(0.35, Math.min(availW / bounds.w, availH / bounds.h)));
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const screenCx = pad.left + availW / 2;
    const screenCy = pad.top + availH / 2;
    return {
      x: cx - (screenCx - viewW / 2) / z,
      y: cy - (screenCy - viewH / 2) / z,
      z,
    };
  }

  function frame(bounds, pad = 18) {
    frameTarget = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      w: bounds.w + pad * 2,
      h: bounds.h + pad * 2,
    };
    const next = fit(frameTarget);
    camTo.x = next.x;
    camTo.y = next.y;
    camTo.z = next.z;
    if (!framed || reduce) {
      cam.x = next.x;
      cam.y = next.y;
      cam.z = next.z;
    }
  }

  function frameFloor(index) {
    const floors = floorPlan(state || { roster: [], groups: {} });
    const floor = floors[index];
    if (!floor || !floor.bots.length) {
      frame(BUILDING, 10);
      return;
    }
    const rooms = [...new Set(floor.bots.map((name) => teamRoom(state.groups[name])).filter((id) => ROOMS_SAFE(id)))];
    frame(rooms.length ? boundsOf(rooms) : BUILDING, 28);
  }

  function ROOMS_SAFE(id) {
    return id === 'research' || id === 'webdev' || id === 'ops' || id === 'design';
  }

  function syncSeats() {
    const next = assignSeats(state?.roster || [], state?.groups || {});
    const key = next.map((seat) => `${seat.name}:${seat.x}:${seat.y}`).join('|');
    if (key === seatKey) return;
    seatKey = key;
    assignments = next;
    desks = visibleDesks(next);
    nav = buildNav(desks);
    const keep = new Set(next.map((seat) => seat.name));
    for (const name of agents.keys()) {
      if (!keep.has(name)) agents.delete(name);
    }
    for (const seat of next) {
      const agent = agents.get(seat.name);
      if (!agent) agents.set(seat.name, createAgent(seat.x, seat.y));
      else if (agent.phase === 'sit') {
        agent.x = seat.x;
        agent.y = seat.y;
      }
    }
  }

  function pathTo(from, to) {
    return findPath(nav, from.x, from.y, to.x, to.y);
  }

  function project(x, y) {
    const originX = Math.round(viewW / 2 - cam.x * cam.z);
    const originY = Math.round(viewH / 2 - cam.y * cam.z);
    const scaleX = Math.round(WORLD.w * cam.z) / WORLD.w;
    const scaleY = Math.round(WORLD.h * cam.z) / WORLD.h;
    return { x: originX + x * scaleX, y: originY + y * scaleY };
  }

  function screenToWorld(sx, sy) {
    const originX = Math.round(viewW / 2 - cam.x * cam.z);
    const originY = Math.round(viewH / 2 - cam.y * cam.z);
    const scaleX = Math.round(WORLD.w * cam.z) / WORLD.w;
    const scaleY = Math.round(WORLD.h * cam.z) / WORLD.h;
    return { x: (sx - originX) / scaleX, y: (sy - originY) / scaleY };
  }

  function clampCamera(target) {
    const margin = 48;
    target.x = Math.min(BUILDING.x + BUILDING.w + margin, Math.max(BUILDING.x - margin, target.x));
    target.y = Math.min(BUILDING.y + BUILDING.h + margin, Math.max(BUILDING.y - margin, target.y));
  }

  function zoomAt(sx, sy, nextZ) {
    const before = screenToWorld(sx, sy);
    cam.z = Math.min(7, Math.max(0.35, nextZ));
    camTo.z = cam.z;
    const after = screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    clampCamera(cam);
    camTo.x = cam.x;
    camTo.y = cam.y;
  }

  function node(key, className) {
    let item = nodes.get(key);
    if (!item) {
      item = el('div', className);
      labels.appendChild(item);
      nodes.set(key, item);
    }
    item.hidden = false;
    return item;
  }

  function hideStale(prefix, keep) {
    for (const [key, item] of nodes) {
      if (key.startsWith(prefix) && !keep.has(key)) item.hidden = true;
    }
  }

  function layoutLabels(actors, hitboxes) {
    const boxes = [];
    const keep = new Set();
    for (const sign of SIGNS) {
      const key = `sign:${sign.id}`;
      keep.add(key);
      const item = node(key, 'room-sign');
      const title = item.querySelector('b') || el('b');
      const sub = item.querySelector('span') || el('span');
      if (!item.contains(title)) item.append(title, sub);
      if (title.textContent !== sign.title) title.textContent = sign.title;
      if (sub.textContent !== sign.sub) sub.textContent = sign.sub;
      sub.hidden = !sign.sub;
      const p = project(sign.x, sign.y);
      const w = item.offsetWidth || 64;
      const h = item.offsetHeight || 18;
      boxes.push({ el: item, x: p.x, y: p.y, w, h, fixed: true, pri: 0, ax: p.x, ay: p.y });
    }
    for (const actor of actors) {
      const p = project(actor.x, actor.y);
      const tagKey = `tag:${actor.name}`;
      keep.add(tagKey);
      const tag = node(tagKey, `map-tag${actor.selected ? ' is-selected' : ''}`);
      tag.classList.toggle('is-selected', actor.selected);
      const name = tag.querySelector('.map-name') || el('span', 'map-name');
      const stateEl = tag.querySelector('.map-state') || el('span', 'map-state');
      if (!tag.contains(name)) tag.append(name, stateEl);
      name.dir = 'auto';
      if (name.textContent !== actor.name) name.textContent = actor.name;
      const word = STATUS_WORD[actor.status] || 'Resting';
      stateEl.className = `map-state tone-${actor.status === 'waiting_user' ? 'waiting' : actor.status}`;
      if (stateEl.textContent !== word) stateEl.textContent = word;
      stateEl.hidden = cam.z < 1.25;
      const tw = tag.offsetWidth || 72;
      const th = tag.offsetHeight || 28;
      const below = Math.max(14, 10 * cam.z);
      boxes.push({
        kind: 'tag',
        el: tag,
        x: p.x - tw / 2,
        y: p.y + below,
        w: tw,
        h: th,
        fixed: false,
        pri: actor.selected || actor.hovered ? 4 : 1,
        ax: p.x - tw / 2,
        ay: p.y + below,
        name: actor.name,
      });
      const mark = actor.status === 'waiting_user' ? '!' : actor.status === 'error' ? '×' : actor.status === 'done' ? '✓' : '';
      if (mark) {
        const markKey = `mark:${actor.name}`;
        keep.add(markKey);
        const bubble = node(markKey, `map-mark mark-${actor.status === 'waiting_user' ? 'waiting' : actor.status}`);
        if (bubble.textContent !== mark) bubble.textContent = mark;
        const mw = bubble.offsetWidth || 18;
        const mh = bubble.offsetHeight || 18;
        boxes.push({
          kind: 'mark', el: bubble, x: p.x - mw / 2, y: p.y - 18 - mh, w: mw, h: mh, fixed: false, pri: 3, ax: p.x - mw / 2, ay: p.y - 18 - mh,
        });
      }
      if (actor.sleep) {
        const zKey = `zzz:${actor.name}`;
        keep.add(zKey);
        const zzz = node(zKey, 'map-zzz');
        if (!zzz.childElementCount) zzz.append(el('i', null, 'z'), el('i', null, 'z'), el('i', null, 'z'));
        const zw = zzz.offsetWidth || 22;
        const zh = zzz.offsetHeight || 28;
        const slot = hashName(actor.name) % 3;
        const zx = p.x + 4 + (slot - 1) * (zw + 6);
        const zy = p.y - zh - 10;
        boxes.push({
          kind: 'zzz', el: zzz, x: zx, y: zy, w: zw, h: zh, fixed: false, pri: 3, ax: zx, ay: zy,
        });
      }
      if (actor.step && (actor.selected || actor.hovered)) {
        const stepKey = `step:${actor.name}`;
        keep.add(stepKey);
        const step = node(stepKey, 'map-step');
        step.dir = 'auto';
        const text = actor.step.slice(0, 80);
        if (step.textContent !== text) step.textContent = text;
        const sw = step.offsetWidth || 120;
        const sh = step.offsetHeight || 22;
        boxes.push({
          kind: 'step', el: step, x: p.x - sw / 2, y: p.y - 36 - sh, w: sw, h: sh, fixed: false, pri: 5, ax: p.x - sw / 2, ay: p.y - 36 - sh,
        });
      }
    }
    hideStale('sign:', keep);
    hideStale('tag:', keep);
    hideStale('mark:', keep);
    hideStale('zzz:', keep);
    hideStale('step:', keep);
    const sprites = actors.map((actor) => {
      const p = project(actor.x, actor.y);
      const radius = Math.max(11, 8 * cam.z);
      return { x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2, fixed: true, pri: 0 };
    });
    separate([...boxes, ...sprites]);
    const zzz = boxes.filter((box) => box.kind === 'zzz');
    const nudgeZzz = () => {
      for (let pass = 0; pass < 16; pass += 1) {
        let moved = false;
        for (let i = 0; i < zzz.length; i += 1) {
          for (let j = i + 1; j < zzz.length; j += 1) {
            if (!overlaps(zzz[i], zzz[j])) continue;
            zzz[j].x += zzz[i].w + 4;
            moved = true;
          }
          for (const other of boxes) {
            if (other.kind === 'zzz' || other.fixed || !overlaps(zzz[i], other)) continue;
            zzz[i].y -= other.h + 3;
            moved = true;
          }
        }
        if (!moved) break;
      }
    };
    nudgeZzz();
    for (const box of boxes) {
      if (box.fixed || box.hidden) continue;
      const offscreen = box.ax < -12 || box.ay < -12 || box.ax > viewW - 8 || box.ay > viewH - 8;
      if (offscreen) {
        box.el.hidden = true;
        box.hidden = true;
      }
    }
    for (const box of boxes) {
      if (box.hidden) continue;
      box.x = Math.max(2, Math.min(viewW - box.w - 2, box.x));
      box.y = Math.max(2, Math.min(viewH - box.h - 2, box.y));
    }
    nudgeZzz();
    const tags = boxes.filter((box) => box.kind === 'tag' && !box.hidden);
    for (const tag of tags) {
      for (const sprite of sprites) {
        if (overlaps(tag, sprite)) tag.y = sprite.y + sprite.h + 2;
      }
    }
    tags.sort((a, b) => b.pri - a.pri);
    const dropped = new Set();
    for (const tag of tags) {
      const blocked = tags.some((other) => other !== tag && !dropped.has(other) && overlaps(tag, other))
        || boxes.some((other) => other.fixed && !other.hidden && overlaps(tag, other));
      if (blocked) {
        tag.el.hidden = true;
        tag.hidden = true;
        dropped.add(tag);
      }
    }
    for (const box of boxes) {
      if (box.hidden) continue;
      box.el.style.left = `${Math.round(box.x)}px`;
      box.el.style.top = `${Math.round(box.y)}px`;
      if (box.name) hitboxes.push({ name: box.name, x: box.x, y: box.y, w: box.w, h: box.h });
    }
  }

  function pick(sx, sy, hitboxes, actors) {
    for (const box of hitboxes) {
      if (sx >= box.x && sx <= box.x + box.w && sy >= box.y && sy <= box.y + box.h) return box.name;
    }
    const world = screenToWorld(sx, sy);
    let best = null;
    let bestD = 18;
    for (const actor of actors) {
      const dist = Math.hypot(actor.x - world.x, actor.y - world.y);
      if (dist < bestD) {
        best = actor.name;
        bestD = dist;
      }
    }
    return best;
  }

  let lastActors = [];
  let hitboxes = [];
  let last = performance.now();

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduce && !dragging && !pinch) {
      const k = 1 - Math.exp(-8 * dt);
      cam.x += (camTo.x - cam.x) * k;
      cam.y += (camTo.y - cam.y) * k;
      cam.z += (camTo.z - cam.z) * k;
    }
    syncSeats();
    const roster = state?.roster || [];
    const clockNow = Date.now();
    const seatByName = new Map(assignments.map((seat) => [seat.name, seat]));
    const actors = [];
    const paths = [];
    for (const name of roster) {
      const seat = seatByName.get(name);
      if (!seat) continue;
      const presentation = presentBot(state.bots[name], clockNow, name);
      const partnerName = namedPartner(presentation.step, name, roster, presentation.status);
      const partner = partnerName ? seatByName.get(partnerName) : null;
      const prev = agents.get(name) || createAgent(seat.x, seat.y);
      const agent = advanceAgent(prev, {
        dt,
        reduce,
        seat: { x: seat.x, y: seat.y },
        partner: partner ? { x: partner.x, y: partner.y } : null,
        key: partner ? `${partnerName}|${presentation.step}` : '',
        pathTo,
      });
      agents.set(name, agent);
      if (agent.walking || agent.phase === 'pause' || agent.phase === 'out' || agent.phase === 'back') {
        if (agent.path && agent.path.length > 1) paths.push(agent.path);
      }
      const face = faceOf(agent.x - prev.x, agent.y - prev.y, agent.walking);
      actors.push({
        name,
        x: agent.x,
        y: agent.y,
        look: lookFor(state, name),
        status: presentation.status,
        sleep: presentation.status === 'idle' && presentation.persona === 'sleep' && !agent.walking,
        walking: agent.walking,
        face,
        phase: (name.length * 1.7) % Math.PI,
        selected: selected === name,
        hovered: hovered === name,
        step: presentation.step,
      });
    }
    paintArt(artCtx, now / 1000, desks, actors, paths, reduce);
    view.setTransform(1, 0, 0, 1, 0, 0);
    view.imageSmoothingEnabled = false;
    view.clearRect(0, 0, canvas.width, canvas.height);
    const originX = Math.round(viewW / 2 - cam.x * cam.z);
    const originY = Math.round(viewH / 2 - cam.y * cam.z);
    const destW = Math.round(WORLD.w * cam.z);
    const destH = Math.round(WORLD.h * cam.z);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.imageSmoothingEnabled = false;
    view.drawImage(art, originX, originY, destW, destH);
    hitboxes = [];
    layoutLabels(actors, hitboxes);
    lastActors = actors;
    document.body.dataset.ready = '1';
    document.body.dataset.zoom = cam.z.toFixed(3);
    document.body.dataset.office = 'pixel';
    const walking = actors.filter((actor) => actor.walking).map((actor) => actor.name);
    document.body.dataset.walking = walking.join(',');
  }

  function loop(now) {
    tick(now);
    requestAnimationFrame(loop);
  }

  function resize() {
    viewW = Math.max(1, stage.clientWidth);
    viewH = Math.max(1, stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    if (!userMoved) {
      const next = fit(frameTarget);
      camTo.x = next.x;
      camTo.y = next.y;
      camTo.z = next.z;
      if (reduce) {
        cam.x = next.x;
        cam.y = next.y;
        cam.z = next.z;
      }
    }
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
    if (pointers.size === 2) {
      for (const item of pointers.values()) item.moved = true;
      const pts = [...pointers.values()];
      pinch = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        z: cam.z,
        ...localPoint({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 }),
      };
      dragging = false;
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) {
      const here = localPoint(event);
      hovered = pick(here.x, here.y, hitboxes, lastActors);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      return;
    }
    if (pointers.size >= 2 && pinch) {
      point.x = event.clientX;
      point.y = event.clientY;
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoomAt(pinch.x, pinch.y, pinch.z * (dist / pinch.dist));
      userMoved = true;
      return;
    }
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    if (Math.hypot(event.clientX - (point.originX || point.x), event.clientY - (point.originY || point.y)) > 5) {
      point.moved = true;
      dragging = true;
    }
    if (point.originX == null) {
      point.originX = point.x;
      point.originY = point.y;
    }
    if (dragging) {
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      clampCamera(cam);
      camTo.x = cam.x;
      camTo.y = cam.y;
      userMoved = true;
    }
    point.x = event.clientX;
    point.y = event.clientY;
  });
  function endPointer(event) {
    const point = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!point) return;
    if (!point.moved && pointers.size === 0) {
      const here = localPoint(event);
      const name = pick(here.x, here.y, hitboxes, lastActors);
      hooks.onPick(name);
    }
    if (pointers.size === 0) dragging = false;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const here = localPoint(event);
    const factor = event.deltaY > 0 ? 1 / 1.08 : 1.08;
    zoomAt(here.x, here.y, cam.z * factor);
    userMoved = true;
  }, { passive: false });

  const observer = new ResizeObserver(() => resize());
  observer.observe(stage);
  resize();
  frame(BUILDING, 8);
  framed = true;
  requestAnimationFrame(loop);

  return {
    setState(next) {
      state = next;
      syncSeats();
    },
    setFloor(index) {
      const changed = framed && index !== active;
      active = index;
      if (!changed) return;
      userMoved = false;
      frameFloor(index);
    },
    focusBot(name) {
      const changed = selected !== name;
      selected = name || null;
      if (!changed || !name) return;
      const agent = agents.get(name);
      if (!agent) return;
      const p = project(agent.x, agent.y);
      if (p.x > 48 && p.y > 48 && p.x < viewW - 48 && p.y < viewH - 48) return;
      camTo.x = agent.x;
      camTo.y = agent.y;
      userMoved = true;
    },
    clearBot() {
      selected = null;
    },
    zoom(direction) {
      zoomAt(viewW / 2, viewH / 2, cam.z * (direction > 0 ? 1.18 : 1 / 1.18));
      userMoved = true;
    },
    setReduce(value) {
      reduce = !!value;
    },
    resize,
  };
}
