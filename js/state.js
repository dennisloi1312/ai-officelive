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
    activity: [],
    lastEventId: null,
  };
}

/** Known teams get a distinct room. Anything else is a plain open plan. */
export function floorTheme(label) {
  const key = String(label || '').trim().toLowerCase();
  if (key === 'ops') return 'lounge';
  if (key === 'research') return 'library';
  if (key === 'web dev' || key === 'webdev') return 'meeting';
  if (key === 'design') return 'media';
  return 'open';
}

export function themeColor(theme) {
  if (theme === 'lounge') return '#1F7A3A';
  if (theme === 'library') return '#2F5FD0';
  if (theme === 'meeting') return '#5B3FC4';
  if (theme === 'media') return '#C2185B';
  return '#3F3F46';
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

const TEAM_RANK = ['ops', 'research', 'web dev', 'design'];

function teamRank(label) {
  const index = TEAM_RANK.indexOf(label.trim().toLowerCase());
  return index === -1 ? 100 : index;
}

function cmpLabel(a, b) {
  const rank = teamRank(a) - teamRank(b);
  if (rank) return rank;
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
      bucket = { key, label, bots: [], overflowTeams: 0, theme: floorTheme(label) };
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
    floors = [{ key: '__lobby__', label: 'Lobby', bots: [], overflowTeams: 0, theme: 'open' }];
  }
  if (floors.length > 6) {
    const head = floors.slice(0, 5);
    const extra = floors.slice(5);
    head.push({
      key: '__more__',
      label: extra.length === 1 ? extra[0].label : extra[0].label,
      bots: extra.flatMap((floor) => floor.bots),
      overflowTeams: extra.length > 1 ? extra.length - 1 : 0,
      theme: 'open',
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
    state.activity.push({ at, bot: statusName, step, status });
    if (state.activity.length > 24) state.activity.splice(0, state.activity.length - 24);
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
  if (Array.isArray(data.activity)) {
    for (const item of data.activity) {
      if (!item || typeof item !== 'object') continue;
      const bot = sanitizeName(item.bot);
      if (!bot || !STATUSES.has(item.status)) continue;
      const at = Number(item.at);
      state.activity.push({
        at: Number.isFinite(at) ? at : 0,
        bot,
        step: typeof item.step === 'string' ? clip(item.step, 500) : '',
        status: item.status,
      });
    }
    if (state.activity.length > 24) state.activity.splice(0, state.activity.length - 24);
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
  const roster = [
    'Kai', 'Momo', 'Jun', 'Sol', 'Ren', '小墨',
    '研究｜文獻研究員', 'Nori', 'Lin', 'Page',
    'Quill', 'Byte', 'Commit', 'Branch',
      'Dot', 'Hue', 'Pixel', 'Frame',
  ];
  applyPayload(state, {
    roster,
    groups: {
      Kai: 'Ops', Momo: 'Ops', Jun: 'Ops', Sol: 'Ops', Ren: 'Ops', 小墨: 'Ops',
      '研究｜文獻研究員': 'Research', Nori: 'Research', Lin: 'Research', Page: 'Research',
      Quill: 'Web Dev', Byte: 'Web Dev', Commit: 'Web Dev', Branch: 'Web Dev',
      Pixel: 'Design', Dot: 'Design', Hue: 'Design', Frame: 'Design',
    },
    looks: {
      Kai: { shape: 'sphere', color: '#3B82F6', accessory: 'antenna' },
      Momo: { shape: 'pill', color: '#F472B6', accessory: 'bow' },
      Jun: { shape: 'rounded_cube', color: '#22C55E', accessory: 'none' },
      Sol: { shape: 'cone', color: '#F97316', accessory: 'none' },
      Ren: { shape: 'hexagon', color: '#8B5CF6', accessory: 'none' },
      小墨: { shape: 'pill', color: '#14B8A6', accessory: 'glasses' },
      '研究｜文獻研究員': { shape: 'rounded_cube', color: '#14B8A6', accessory: 'glasses' },
      Nori: { shape: 'hexagon', color: '#8B5CF6', accessory: 'stem' },
      Lin: { shape: 'sphere', color: '#2563EB', accessory: 'none' },
      Page: { shape: 'pill', color: '#94A3B8', accessory: 'glasses' },
      Quill: { shape: 'triangle', color: '#F97316', accessory: 'none' },
      Byte: { shape: 'rounded_cube', color: '#0EA5E9', accessory: 'antenna' },
      Commit: { shape: 'sphere', color: '#6366F1', accessory: 'none' },
      Branch: { shape: 'pill', color: '#10B981', accessory: 'stem' },
      Pixel: { shape: 'clover', color: '#F472B6', accessory: 'bow' },
      Dot: { shape: 'rounded_square', color: '#FB7185', accessory: 'antenna' },
      Hue: { shape: 'rounded_cube', color: '#E879F9', accessory: 'none' },
      Frame: { shape: 'cone', color: '#F43F5E', accessory: 'none' },
    },
  }, now);
  const scripts = [
    ['Kai', 'working', 'Sorting the morning queue'],
    ['Momo', 'idle', 'People-watching the lobby'],
    ['Jun', 'working', 'Clearing the handoff list'],
    ['Sol', 'working', 'Checking the lobby board'],
    ['Ren', 'idle', 'Resting between passes'],
    ['小墨', 'done', 'Sent the recap'],
    ['研究｜文獻研究員', 'working', '正在整理本週文獻'],
    ['Nori', 'waiting_user', 'Need a source checked'],
    ['Lin', 'working', 'Cross-reading two papers'],
    ['Page', 'idle', 'Shelving a citation'],
    ['Quill', 'error', 'Draft file missing'],
    ['Byte', 'working', 'Wiring the review build'],
    ['Commit', 'working', 'Splitting a long diff'],
    ['Branch', 'idle', 'Waiting on CI'],
    ['Pixel', 'idle', 'Resting by the board'],
    ['Dot', 'idle', 'Stretching between tasks'],
    ['Hue', 'working', 'Trying a warmer palette'],
    ['Frame', 'done', 'Exported the frames'],
  ];
  scripts.forEach(([bot, status, step], index) => {
    applyPayload(state, { bot, status, step }, now - (scripts.length - index) * 60000);
  });
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
      Kai: 8.2, Momo: 3.4, Jun: 4.1, Sol: 2.2, Ren: 1.4, 小墨: 1.1,
      '研究｜文獻研究員': 11.5, Nori: 4, Lin: 3.2, Page: 0.8,
      Quill: 2.2, Byte: 5.1, Commit: 3.6, Branch: 1.5,
      Pixel: 5.4, Dot: 1.2, Hue: 2.8, Frame: 1.7,
    },
  }, now);
  return state;
}
