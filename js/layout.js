/** Top-down floor plan. Pure data: rooms, desks, and a walk grid. No DOM. */

export const CELL = 8;
export const WORLD = { w: 480, h: 360 };

export const BUILDING = { x: 8, y: 8, w: 464, h: 332 };

export const ROOMS = {
  research: { x: 18, y: 18, w: 188, h: 112 },
  webdev: { x: 274, y: 18, w: 188, h: 112 },
  ops: { x: 18, y: 198, w: 188, h: 112 },
  design: { x: 274, y: 198, w: 188, h: 112 },
};

/** How many desks to draw even when a room has fewer people. */
export const BASE_DESKS = { research: 3, webdev: 3, ops: 1, design: 1, overflow: 0 };

const WOOD = { deskW: 32, deskH: 14 };

function seat(deskX, deskY, deskW = WOOD.deskW, deskH = WOOD.deskH) {
  return {
    deskX,
    deskY,
    deskW,
    deskH,
    x: deskX + Math.round(deskW / 2),
    y: deskY + deskH + 12,
  };
}

const SEATS = {
  research: [seat(40, 32), seat(96, 32), seat(152, 32), seat(40, 86), seat(96, 86), seat(152, 86)],
  webdev: [seat(300, 32), seat(356, 32), seat(412, 32), seat(300, 86), seat(356, 86), seat(412, 86)],
  ops: [seat(32, 210), seat(78, 210), seat(124, 210), seat(32, 266), seat(78, 266), seat(124, 266)],
  design: [seat(400, 222), seat(324, 210), seat(324, 266), seat(364, 266), seat(400, 266), seat(364, 210)],
};

export const FLOORS = [
  { id: 'research', x: 18, y: 18, w: 188, h: 112, a: '#B7CFA0', b: '#D0E3BA' },
  { id: 'webdev', x: 274, y: 18, w: 188, h: 112, a: '#C9DDB4', b: '#E0EEC8' },
  { id: 'ops', x: 18, y: 198, w: 188, h: 112, a: '#B9CDE6', b: '#D4E2F3' },
  { id: 'design', x: 274, y: 198, w: 188, h: 112, a: '#F0C4D4', b: '#F8D9E6' },
  { id: 'vhall', x: 214, y: 18, w: 52, h: 308, a: '#E4CFA8', b: '#F6E6C8' },
  { id: 'hhall', x: 18, y: 138, w: 444, h: 52, a: '#E4CFA8', b: '#F6E6C8' },
];

export const WALLS = [
  { x: 206, y: 18, w: 8, h: 112 },
  { x: 266, y: 18, w: 8, h: 112 },
  { x: 206, y: 198, w: 8, h: 112 },
  { x: 266, y: 198, w: 8, h: 112 },
  { x: 18, y: 130, w: 188, h: 8 },
  { x: 274, y: 130, w: 188, h: 8 },
  { x: 18, y: 190, w: 188, h: 8 },
  { x: 274, y: 190, w: 188, h: 8 },
];

export const DOORS = [
  { id: 'research', x: 166, y: 130, w: 40, h: 8 },
  { id: 'webdev', x: 274, y: 130, w: 40, h: 8 },
  { id: 'ops', x: 166, y: 190, w: 40, h: 8 },
  { id: 'design', x: 274, y: 190, w: 40, h: 8 },
  { id: 'entrance', x: 226, y: 326, w: 28, h: 14 },
];

export const FURNITURE = [
  { id: 'shelf', x: 22, y: 36, w: 12, h: 46 },
  { id: 'board', x: 348, y: 20, w: 40, h: 8 },
  { id: 'counter', x: 156, y: 256, w: 44, h: 18 },
  { id: 'swatch', x: 450, y: 214, w: 8, h: 56 },
];

export const SIGNS = [
  { id: 'research', title: '研究', sub: 'Research', x: 26, y: 22 },
  { id: 'webdev', title: '網站開發', sub: 'Web Dev', x: 282, y: 22 },
  { id: 'ops', title: '營運', sub: 'Ops', x: 26, y: 204 },
  { id: 'design', title: '設計', sub: 'Design', x: 282, y: 204 },
  { id: 'break', title: '茶水間', sub: '', x: 160, y: 236 },
  { id: 'entrance', title: '入口', sub: '', x: 228, y: 308 },
];

export function teamRoom(label) {
  const key = String(label || '').trim().toLowerCase();
  if (key === 'ops') return 'ops';
  if (key === 'research') return 'research';
  if (key === 'web dev' || key === 'webdev') return 'webdev';
  if (key === 'design') return 'design';
  return 'overflow';
}

function anchorFirst(names, anchor) {
  if (!names.includes(anchor)) return names.slice();
  return [anchor, ...names.filter((name) => name !== anchor)];
}

function overflowSlot(index) {
  const col = index % 4;
  const side = Math.floor(index / 4) % 2;
  const row = Math.floor(index / 8);
  const deskX = side === 0 ? 28 + col * 38 : 318 + col * 38;
  const deskY = 146 + row * 18;
  return seat(deskX, deskY, 28, 10);
}

function extraSlot(room, index) {
  const area = ROOMS[room];
  if (!area) return overflowSlot(index);
  const col = index % 4;
  const row = Math.floor(index / 4);
  return seat(area.x + 10 + col * 40, area.y + 16 + row * 36, 28, 12);
}

export function slotFor(room, index) {
  const list = SEATS[room];
  if (list && index < list.length) return list[index];
  if (room === 'overflow') return overflowSlot(index);
  return extraSlot(room, index);
}

export function assignSeats(roster, groups) {
  const source = groups || {};
  const buckets = { research: [], webdev: [], ops: [], design: [], overflow: [] };
  for (const name of roster || []) {
    const room = teamRoom(source[name]);
    buckets[room].push(name);
  }
  buckets.ops = anchorFirst(buckets.ops, 'Kai');
  buckets.design = anchorFirst(buckets.design, 'Pink');
  const out = [];
  for (const room of Object.keys(buckets)) {
    buckets[room].forEach((name, index) => {
      out.push({ name, room, index, ...slotFor(room, index) });
    });
  }
  return out;
}

export function visibleDesks(assignments) {
  const counts = {
    research: BASE_DESKS.research,
    webdev: BASE_DESKS.webdev,
    ops: BASE_DESKS.ops,
    design: BASE_DESKS.design,
    overflow: 0,
  };
  for (const seat of assignments) {
    counts[seat.room] = Math.max(counts[seat.room] || 0, seat.index + 1);
  }
  const desks = [];
  for (const room of Object.keys(counts)) {
    for (let index = 0; index < counts[room]; index += 1) {
      const slot = slotFor(room, index);
      const who = assignments.find((seat) => seat.room === room && seat.index === index);
      desks.push({ room, index, ...slot, name: who ? who.name : '' });
    }
  }
  return desks;
}

export function boundsOf(roomIds) {
  const rects = (roomIds || []).map((id) => ROOMS[id]).filter(Boolean);
  if (!rects.length) return { x: BUILDING.x, y: BUILDING.y, w: BUILDING.w, h: BUILDING.h };
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}

function cellCenterInside(col, row, rect) {
  const x = col * CELL + CELL / 2;
  const y = row * CELL + CELL / 2;
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function baseDeskRects() {
  const rects = [];
  for (const room of Object.keys(BASE_DESKS)) {
    const count = BASE_DESKS[room] || 0;
    for (let index = 0; index < count; index += 1) {
      const slot = slotFor(room, index);
      rects.push({ x: slot.deskX, y: slot.deskY, w: slot.deskW, h: slot.deskH });
    }
  }
  return rects;
}

export function buildNav(desks) {
  const cols = WORLD.w / CELL;
  const rows = WORLD.h / CELL;
  const blocked = new Uint8Array(cols * rows);
  blocked.fill(1);
  const open = (rect) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (cellCenterInside(col, row, rect)) blocked[row * cols + col] = 0;
      }
    }
  };
  const shut = (rect) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (cellCenterInside(col, row, rect)) blocked[row * cols + col] = 1;
      }
    }
  };
  FLOORS.forEach(open);
  WALLS.forEach(shut);
  DOORS.forEach(open);
  FURNITURE.forEach(shut);
  const deskRects = desks && desks.length
    ? desks.map((desk) => ({ x: desk.deskX, y: desk.deskY, w: desk.deskW, h: desk.deskH }))
    : baseDeskRects();
  deskRects.forEach(shut);
  DOORS.forEach(open);
  return {
    cols,
    rows,
    blocked,
    walkable(x, y) {
      const col = Math.floor(x / CELL);
      const row = Math.floor(y / CELL);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
      return blocked[row * cols + col] === 0;
    },
  };
}

function nearestOpen(nav, x, y) {
  const col = Math.max(0, Math.min(nav.cols - 1, Math.floor(x / CELL)));
  const row = Math.max(0, Math.min(nav.rows - 1, Math.floor(y / CELL)));
  if (nav.blocked[row * nav.cols + col] === 0) return { col, row };
  for (let radius = 1; radius < 8; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) continue;
        if (nav.blocked[r * nav.cols + c] === 0) return { col: c, row: r };
      }
    }
  }
  return { col, row };
}

function simplify(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const next = points[i + 1];
    const cur = points[i];
    const colinear = (cur.x - prev.x) * (next.y - cur.y) === (cur.y - prev.y) * (next.x - cur.x);
    if (!colinear) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Four-direction path on the walk grid. Points are cell centers. */
export function findPath(nav, x0, y0, x1, y1) {
  const start = nearestOpen(nav, x0, y0);
  const goal = nearestOpen(nav, x1, y1);
  const key = (col, row) => row * nav.cols + col;
  const startKey = key(start.col, start.row);
  const goalKey = key(goal.col, goal.row);
  if (startKey === goalKey) {
    return [{ x: start.col * CELL + CELL / 2, y: start.row * CELL + CELL / 2 }];
  }
  const open = [startKey];
  const came = new Map();
  const score = new Map([[startKey, 0]]);
  const total = new Map([[startKey, Math.abs(goal.col - start.col) + Math.abs(goal.row - start.row)]]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (open.length) {
    open.sort((a, b) => (total.get(a) ?? 1e9) - (total.get(b) ?? 1e9));
    const current = open.shift();
    if (current === goalKey) break;
    const col = current % nav.cols;
    const row = Math.floor(current / nav.cols);
    for (const [dx, dy] of dirs) {
      const nextCol = col + dx;
      const nextRow = row + dy;
      if (nextCol < 0 || nextRow < 0 || nextCol >= nav.cols || nextRow >= nav.rows) continue;
      const nextKey = key(nextCol, nextRow);
      if (nav.blocked[nextKey]) continue;
      const nextScore = (score.get(current) ?? 1e9) + 1;
      if (nextScore >= (score.get(nextKey) ?? 1e9)) continue;
      came.set(nextKey, current);
      score.set(nextKey, nextScore);
      total.set(nextKey, nextScore + Math.abs(goal.col - nextCol) + Math.abs(goal.row - nextRow));
      if (!open.includes(nextKey)) open.push(nextKey);
    }
  }
  if (!came.has(goalKey) && startKey !== goalKey) return [];
  const cells = [goalKey];
  let cursor = goalKey;
  while (cursor !== startKey) {
    cursor = came.get(cursor);
    if (cursor == null) return [];
    cells.push(cursor);
  }
  cells.reverse();
  const points = cells.map((id) => ({
    x: (id % nav.cols) * CELL + CELL / 2,
    y: Math.floor(id / nav.cols) * CELL + CELL / 2,
  }));
  return simplify(points);
}

export function pointInHall(x, y) {
  const vertical = x >= 214 && x < 266 && y >= 18 && y < 326;
  const horizontal = y >= 138 && y < 190 && x >= 18 && x < 462;
  return vertical || horizontal;
}
