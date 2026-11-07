/** Untrusted ntfy payloads become a plain office state. No DOM and no network. */

export const STALE_MS = 20 * 60 * 1000;
export const DONE_MS = 8000;
export const MAX_BOTS = 100;

export const STATUSES = new Set(['working', 'idle', 'waiting_user', 'error', 'done']);

const SHAPES = new Set([
  'sphere',
  'rounded_cube',
  'pill',
  'triangle',
  'cone',
  'pentagon',
  'hexagon',
  'star4',
  'star6',
  'clover',
  'rounded_square',
  'trio',
]);

const ACCESSORIES = new Set(['none', 'glasses', 'stem', 'antenna', 'bow']);

const SEED_COLORS = ['#1E86FC', '#F2A3C7', '#2F9E8F', '#7C6BD6', '#E08A3C', '#E2B143', '#6FBE6A', '#E07A6A', '#5B8DEF', '#D47CA6'];
const SEED_SHAPES = ['sphere', 'rounded_cube', 'pill', 'hexagon', 'star6', 'clover', 'rounded_square', 'cone'];

const TOPIC_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function isTopic(value) {
  return typeof value === 'string' && TOPIC_RE.test(value);
}

export function topicFromHash(hash) {
  let raw = String(hash || '').replace(/^#/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return { topic: null, invalid: true };
  }
  raw = raw.trim();
  if (!raw) return { topic: null, invalid: false };
  if (TOPIC_RE.test(raw)) return { topic: raw, invalid: false };
  return { topic: null, invalid: true };
}

export function hashName(name) {
  let h = 2166136261;
  const text = String(name || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function idlePersona(name) {
  const slot = hashName(name) % 3;
  if (slot === 0) return 'sleep';
  if (slot === 1) return 'wander';
  return 'relax';
}

export function clip(text, max) {
  const chars = Array.from(String(text));
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max).join('');
}

export function sanitizeName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = clip(value.trim(), 80);
  if (!trimmed) return null;
  if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') return null;
  return trimmed;
}

function sanitizeTeam(value) {
  if (typeof value !== 'string') return null;
  const trimmed = clip(value.trim(), 40);
  return trimmed || null;
}

export function parseHex(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

export function defaultLook(name) {
  const h = hashName(name || 'bot');
  return {
    shape: SEED_SHAPES[h % SEED_SHAPES.length],
    color: SEED_COLORS[h % SEED_COLORS.length],
    accessory: 'none',
  };
}

export function sanitizeLook(input, prev) {
  const look = { ...(prev || defaultLook('bot')) };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return look;
  if (typeof input.shape === 'string' && SHAPES.has(input.shape)) look.shape = input.shape;
  if (typeof input.accessory === 'string' && ACCESSORIES.has(input.accessory)) look.accessory = input.accessory;
  const color = parseHex(input.color);
  if (color) look.color = color;
  return look;
}

export function resolveLook(name, stored) {
  const seeded = defaultLook(name);
  if (!stored) return seeded;
  return sanitizeLook(stored, seeded);
}

export function createEmptyState() {
  return {
    roster: [],
    groups: Object.create(null),
    looks: Object.create(null),
    bots: Object.create(null),
    routines: Object.create(null),
    usage: null,
    lastEventId: null,
  };
}

export function sanitizeRoster(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const name = sanitizeName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_BOTS) break;
  }
  return out;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sanitizeUsage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const total = finiteNumber(payload.total_used_pct);
  const bots = Object.create(null);
  if (payload.bots && typeof payload.bots === 'object' && !Array.isArray(payload.bots)) {
    for (const key of Object.keys(payload.bots)) {
      const name = sanitizeName(key);
      const n = finiteNumber(payload.bots[key]);
      if (!name || n == null) continue;
      bots[name] = Math.round(n * 10) / 10;
      if (Object.keys(bots).length >= MAX_BOTS) break;
    }
  }
  return {
    total_used_pct: total == null ? null : Math.round(total * 10) / 10,
    resets_at: typeof payload.resets_at === 'string' ? clip(payload.resets_at.trim(), 40) : '',
    bots,
  };
}

export function sanitizeRoutineItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const name = typeof item.name === 'string' ? clip(item.name.trim(), 80) : '';
    if (!name) continue;
    out.push({
      name,
      schedule: typeof item.schedule === 'string' ? clip(item.schedule.trim(), 80) : '',
      next_run: typeof item.next_run === 'string' ? clip(item.next_run.trim(), 40) : '',
    });
    if (out.length >= 12) break;
  }
  return out;
}

function isOps(label) {
  return label.trim().toLowerCase() === 'ops';
}

function cmpLabel(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Ops is the ground floor. Other teams keep a stable code-unit order, capped at 6 floors. */
export function floorPlan(state) {
  const buckets = new Map();
  const order = [];

  function bucketFor(label) {
    const ops = isOps(label);
    const key = ops ? '__ops__' : label;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, bots: [], overflowTeams: 0 };
      buckets.set(key, bucket);
      order.push(bucket);
    }
    return bucket;
  }

  for (const name of state.roster) {
    const raw = state.groups[name];
    const label = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Lobby';
    bucketFor(label).bots.push(name);
  }

  const ops = order.filter((bucket) => bucket.key === '__ops__');
  const rest = order.filter((bucket) => bucket.key !== '__ops__').sort((a, b) => cmpLabel(a.label, b.label));
  let floors = [...ops, ...rest];
  if (floors.length === 0) {
    floors = [{ key: '__lobby__', label: 'Lobby', bots: [], overflowTeams: 0 }];
  }
  if (floors.length > 6) {
    const head = floors.slice(0, 5);
    const extra = floors.slice(5);
    head.push({
      key: '__more__',
      label: extra.length === 1 ? extra[0].label : extra[0].label,
      bots: extra.flatMap((floor) => floor.bots),
      overflowTeams: extra.length > 1 ? extra.length - 1 : 0,
    });
    floors = head;
  }
  return floors;
}

export function presentBot(bot, now, name) {
  const raw = bot && STATUSES.has(bot.status) ? bot.status : 'idle';
  const updatedAt = bot && Number.isFinite(Number(bot.updatedAt)) ? Number(bot.updatedAt) : 0;
  const age = updatedAt ? Math.max(0, now - updatedAt) : Number.POSITIVE_INFINITY;
  let status = raw;
  let quiet = false;
  if (raw === 'working' && age > STALE_MS) {
    status = 'idle';
    quiet = true;
  } else if (raw === 'done' && age > DONE_MS) {
    status = 'idle';
  }
  return {
    status,
    raw,
    quiet,
    persona: idlePersona(name || ''),
    age,
    step: bot && typeof bot.step === 'string' ? bot.step : '',
    updatedAt,
  };
}

export function visualMode(presentation) {
  if (presentation.status === 'working') return 'working';
  if (presentation.status === 'waiting_user') return 'waiting';
  if (presentation.status === 'error') return 'error';
  if (presentation.status === 'done') return 'celebrate';
  if (presentation.persona === 'sleep') return 'sleep';
  if (presentation.persona === 'wander') return 'wander';
  return 'relax';
}

function eventTimeMs(event) {
  const t = Number(event && event.time);
  if (!Number.isFinite(t) || t <= 0) return Date.now();
  return t > 1e12 ? t : t * 1000;
}

export function decodeMessage(message) {
  if (typeof message === 'string') {
    const trimmed = message.replace(/^\uFEFF/, '').trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  }
  if (message && typeof message === 'object' && !Array.isArray(message)) return message;
  return null;
}

export function applyPayload(state, payload, at) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  let changed = false;

  if ('roster' in payload) {
    const roster = sanitizeRoster(payload.roster);
    if (roster) {
      state.roster = roster;
      changed = true;
    }
  }

  if (payload.groups && typeof payload.groups === 'object' && !Array.isArray(payload.groups)) {
    for (const key of Object.keys(payload.groups)) {
      const name = sanitizeName(key);
      const team = sanitizeTeam(payload.groups[key]);
      if (!name || !team) continue;
      state.groups[name] = team;
      changed = true;
    }
  }

  if (payload.looks && typeof payload.looks === 'object' && !Array.isArray(payload.looks)) {
    for (const key of Object.keys(payload.looks)) {
      const name = sanitizeName(key);
      if (!name) continue;
      state.looks[name] = sanitizeLook(payload.looks[key], state.looks[name] || defaultLook(name));
      changed = true;
    }
  }

  const statusName = sanitizeName(payload.bot);
  const status = typeof payload.status === 'string' && STATUSES.has(payload.status) ? payload.status : null;
  if (statusName && status) {
    const prev = state.bots[statusName] || { status: 'idle', step: '', updatedAt: 0 };
    let step = prev.step || '';
    if ('step' in payload) step = typeof payload.step === 'string' ? clip(payload.step, 500) : step;
    state.bots[statusName] = { status, step, updatedAt: at };
    changed = true;
  }

  if (payload.routines && typeof payload.routines === 'object' && !Array.isArray(payload.routines)) {
    const name = sanitizeName(payload.routines.bot);
    if (name && Array.isArray(payload.routines.items)) {
      const items = sanitizeRoutineItems(payload.routines.items);
      if (items.length === 0) delete state.routines[name];
      else state.routines[name] = items;
      changed = true;
    }
  }

  if (payload.type === 'usage') {
    state.usage = sanitizeUsage(payload);
    changed = true;
  }

  return changed;
}

/** Apply one ntfy row. Returns true when the office state changed. */
export function applyEvent(state, event) {
  if (!event || typeof event !== 'object') return false;
  if (event.event === 'message' && event.id != null) {
    const id = String(event.id);
    if (id.length > 0 && id.length <= 80) state.lastEventId = id;
  }
  if (event.event !== 'message') return false;
  let payload = null;
  try {
    payload = decodeMessage(event.message);
  } catch {
    return false;
  }
  if (!payload) return false;
  return applyPayload(state, payload, eventTimeMs(event));
}

export function stateFromPlain(data) {
  const state = createEmptyState();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return state;
  const roster = sanitizeRoster(data.roster);
  if (roster) state.roster = roster;
  if (data.groups && typeof data.groups === 'object') {
    applyPayload(state, { groups: data.groups }, 0);
  }
  if (data.looks && typeof data.looks === 'object') {
    applyPayload(state, { looks: data.looks }, 0);
  }
  if (data.bots && typeof data.bots === 'object' && !Array.isArray(data.bots)) {
    for (const key of Object.keys(data.bots)) {
      const name = sanitizeName(key);
      const bot = data.bots[key];
      if (!name || !bot || typeof bot !== 'object') continue;
      if (!STATUSES.has(bot.status)) continue;
      const updatedAt = Number(bot.updatedAt);
      state.bots[name] = {
        status: bot.status,
        step: typeof bot.step === 'string' ? clip(bot.step, 500) : '',
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      };
    }
  }
  if (data.routines && typeof data.routines === 'object' && !Array.isArray(data.routines)) {
    for (const key of Object.keys(data.routines)) {
      const name = sanitizeName(key);
      if (!name) continue;
      applyPayload(state, { routines: { bot: name, items: data.routines[key] } }, 0);
    }
  }
  if (data.usage && typeof data.usage === 'object') {
    state.usage = sanitizeUsage({ type: 'usage', ...data.usage });
  }
  if (typeof data.lastEventId === 'string' && data.lastEventId.length > 0 && data.lastEventId.length <= 80) {
    state.lastEventId = data.lastEventId;
  }
  return state;
}

function hoursFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

/** Sample office used when the URL has no topic. */
export function createDemoState() {
  const now = Date.now();
  const state = createEmptyState();
  applyPayload(state, {
    roster: ['Kai', 'Momo', 'Pixel', 'Dot', 'Quill', '小墨', '研究｜文獻研究員', 'Nori'],
    groups: {
      Kai: 'Ops',
      Momo: 'Ops',
      Pixel: 'Design',
      Dot: 'Design',
      Quill: 'Writing',
      小墨: 'Writing',
      '研究｜文獻研究員': '研究',
      Nori: '研究',
    },
    looks: {
      Kai: { shape: 'sphere', color: '#1E86FC', accessory: 'antenna' },
      Momo: { shape: 'pill', color: '#F2A3C7', accessory: 'bow' },
      Pixel: { shape: 'clover', color: '#6FBE6A', accessory: 'glasses' },
      Dot: { shape: 'rounded_square', color: '#E07A6A', accessory: 'antenna' },
      Quill: { shape: 'triangle', color: '#E08A3C', accessory: 'none' },
      小墨: { shape: 'star6', color: '#E2B143', accessory: 'bow' },
      '研究｜文獻研究員': { shape: 'rounded_cube', color: '#2F9E8F', accessory: 'glasses' },
      Nori: { shape: 'hexagon', color: '#7C6BD6', accessory: 'stem' },
    },
  }, now);
  const scripts = [
    ['Kai', 'working', 'Sorting the morning queue'],
    ['Momo', 'idle', 'People-watching the lobby'],
    ['Pixel', 'working', 'Nudging the layout grid'],
    ['Dot', 'idle', 'Stretching between tasks'],
    ['Quill', 'error', 'Draft file missing'],
    ['小墨', 'done', 'Sent the recap'],
    ['研究｜文獻研究員', 'working', '正在整理本週文獻'],
    ['Nori', 'waiting_user', 'Need a source checked'],
  ];
  for (const [bot, status, step] of scripts) {
    applyPayload(state, { bot, status, step }, now);
  }
  applyPayload(state, {
    routines: {
      bot: 'Kai',
      items: [{ name: 'Inbox sweep', schedule: 'every 30 min', next_run: hoursFromNow(25 * 60 * 1000) }],
    },
  }, now);
  applyPayload(state, {
    routines: {
      bot: '研究｜文獻研究員',
      items: [{ name: '文獻掃描', schedule: 'daily 09:00', next_run: hoursFromNow(5 * 60 * 60 * 1000) }],
    },
  }, now);
  applyPayload(state, {
    type: 'usage',
    total_used_pct: 37,
    resets_at: hoursFromNow(6 * 60 * 60 * 1000),
    bots: {
      Kai: 8.2,
      Momo: 3.4,
      Pixel: 5.4,
      Dot: 1.2,
      Quill: 2.2,
      小墨: 1.1,
      '研究｜文獻研究員': 11.5,
      Nori: 4,
    },
  }, now);
  return state;
}
