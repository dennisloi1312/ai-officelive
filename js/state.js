// Pure office state. Message payloads are untrusted; nothing here touches the DOM.

export const STALE_WORKING_MS = 20 * 60 * 1000;

export const SHAPES = [
  "sphere",
  "rounded_cube",
  "pill",
  "triangle",
  "cone",
  "pentagon",
  "hexagon",
  "star4",
  "star6",
  "clover",
  "rounded_square",
  "trio",
];

export const ACCESSORIES = ["none", "glasses", "stem", "antenna", "bow"];

const SHAPE_SET = new Set(SHAPES);
const ACCESSORY_SET = new Set(ACCESSORIES);
const STATUSES = new Set(["working", "idle", "waiting_user", "error", "done"]);

const PALETTE = [
  "#F4A261",
  "#7EB6FF",
  "#8ECA9A",
  "#C9A0FF",
  "#FFD166",
  "#FF8FAB",
  "#7DD3C7",
  "#F28B82",
  "#9BB7FF",
  "#E7C27D",
];

const MAX_BOTS = 80;
const MAX_NAME = 80;
const MAX_TEXT = 180;
const MAX_TEAM = 40;

export function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanTeam(value) {
  const team = cleanText(value, MAX_TEAM);
  return team || null;
}

function map() {
  return Object.create(null);
}

export function resolveLook(name, stored) {
  if (stored) return stored;
  const h = hashString(name || "");
  const accessoryRoll = h >>> 8;
  return {
    shape: SHAPES[h % SHAPES.length],
    color: PALETTE[(h >>> 4) % PALETTE.length],
    accessory: accessoryRoll % 3 === 0
      ? "none"
      : ACCESSORIES[1 + (accessoryRoll % (ACCESSORIES.length - 1))],
  };
}

export function idleModeFor(name) {
  return hashString(name) % 2 === 0 ? "sleep" : "wander";
}

export function effectiveStatus(bot, now = Date.now()) {
  if (!bot) return "idle";
  const status = bot.status || "idle";
  if (status === "working" && typeof bot.at === "number" && now - bot.at >= STALE_WORKING_MS) {
    return "idle";
  }
  return status;
}

export function visibleNames(state) {
  if (state.hasRoster) return state.roster.slice();
  const names = new Set([
    ...Object.keys(state.groups),
    ...Object.keys(state.looks),
    ...Object.keys(state.bots),
  ]);
  return [...names];
}

export function teamOf(name, groups) {
  const raw = groups[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : "General";
}

export function planFloors(names, groups) {
  const seen = new Set();
  const ops = [];
  const rest = [];
  for (const name of names) {
    const team = teamOf(name, groups);
    if (seen.has(team)) continue;
    seen.add(team);
    if (team.toLowerCase() === "ops") ops.push(team);
    else rest.push(team);
  }
  const order = [...ops, ...rest];
  if (order.length === 0) order.push("Office");
  const floors = order.slice(0, 6);
  const floorIndex = new Map();
  order.forEach((team, index) => {
    floorIndex.set(team, Math.min(index, floors.length - 1));
  });
  const assignments = names.map((name) => {
    const team = teamOf(name, groups);
    return {
      name,
      team,
      floor: floorIndex.has(team) ? floorIndex.get(team) : 0,
    };
  });
  return { floors, assignments };
}

function cleanLook(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const shape = SHAPE_SET.has(raw.shape) ? raw.shape : "sphere";
  const accessory = ACCESSORY_SET.has(raw.accessory) ? raw.accessory : "none";
  let color = "#7EB6FF";
  if (typeof raw.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.color)) {
    color = raw.color.toUpperCase();
  }
  return { shape, accessory, color };
}

function cleanStatus(value) {
  if (typeof value !== "string") return "idle";
  const status = value.trim().toLowerCase();
  return STATUSES.has(status) ? status : "idle";
}

function blank() {
  return {
    roster: [],
    hasRoster: false,
    groups: map(),
    looks: map(),
    bots: map(),
    routines: map(),
    usage: null,
    lastEventId: null,
    seen: new Set(),
    seenOrder: [],
  };
}

function remember(state, id) {
  if (!id || state.seen.has(id)) return false;
  state.seen.add(id);
  state.seenOrder.push(id);
  state.lastEventId = String(id);
  if (state.seenOrder.length > 600) {
    const old = state.seenOrder.shift();
    state.seen.delete(old);
  }
  return true;
}

function applyPayload(state, msg, at) {
  let changed = false;

  if (Array.isArray(msg.roster)) {
    const names = [];
    const used = new Set();
    for (const entry of msg.roster) {
      const name = cleanName(entry);
      if (!name || used.has(name)) continue;
      used.add(name);
      names.push(name);
      if (names.length >= MAX_BOTS) break;
    }
    state.roster = names;
    state.hasRoster = true;
    changed = true;
  }

  if (msg.groups && typeof msg.groups === "object" && !Array.isArray(msg.groups)) {
    for (const [key, value] of Object.entries(msg.groups)) {
      const name = cleanName(key);
      const team = cleanTeam(value);
      if (!name || !team) continue;
      state.groups[name] = team;
      changed = true;
    }
  }

  if (msg.looks && typeof msg.looks === "object" && !Array.isArray(msg.looks)) {
    for (const [key, value] of Object.entries(msg.looks)) {
      const name = cleanName(key);
      const look = cleanLook(value);
      if (!name || !look) continue;
      state.looks[name] = look;
      changed = true;
    }
  }

  if (typeof msg.bot === "string" && (msg.status !== undefined || msg.step !== undefined)) {
    const name = cleanName(msg.bot);
    if (name) {
      const prev = state.bots[name] || { status: "idle", step: "", at };
      state.bots[name] = {
        status: msg.status !== undefined ? cleanStatus(msg.status) : prev.status,
        step: msg.step !== undefined ? cleanText(msg.step, MAX_TEXT) : prev.step,
        at,
      };
      changed = true;
    }
  }

  if (msg.routines && typeof msg.routines === "object" && !Array.isArray(msg.routines)) {
    const name = cleanName(msg.routines.bot);
    if (name) {
      const items = Array.isArray(msg.routines.items) ? msg.routines.items : [];
      state.routines[name] = items.slice(0, 12).map((item) => ({
        name: cleanText(item && item.name, 120),
        schedule: cleanText(item && item.schedule, 120),
        next_run: cleanText(item && item.next_run, 40),
      })).filter((item) => item.name || item.schedule || item.next_run);
      changed = true;
    }
  }

  if (msg.type === "usage") {
    const pct = Number(msg.total_used_pct);
    const bots = map();
    if (msg.bots && typeof msg.bots === "object" && !Array.isArray(msg.bots)) {
      for (const [key, value] of Object.entries(msg.bots)) {
        const name = cleanName(key);
        const amount = Number(value);
        if (!name || !Number.isFinite(amount)) continue;
        bots[name] = amount;
      }
    }
    state.usage = {
      total_used_pct: Number.isFinite(pct) ? pct : null,
      resets_at: cleanText(msg.resets_at, 40),
      bots,
    };
    changed = true;
  }

  return changed;
}

function ingest(state, row) {
  if (!row || row.event !== "message" || typeof row.message !== "string") return false;
  if (row.id && !remember(state, String(row.id))) return false;
  if (!row.id) state.lastEventId = state.lastEventId || null;
  let msg;
  try {
    msg = JSON.parse(row.message);
  } catch {
    return false;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
  const at = Number.isFinite(row.time) ? row.time * 1000 : Date.now();
  return applyPayload(state, msg, at);
}

function copyMap(source, revive) {
  const out = map();
  if (!source || typeof source !== "object") return out;
  for (const [key, value] of Object.entries(source)) {
    const name = cleanName(key);
    if (!name) continue;
    const next = revive(value);
    if (next !== undefined) out[name] = next;
  }
  return out;
}

export function createStore() {
  let state = blank();
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) fn(state);
  }

  return {
    get() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      state = blank();
      emit();
    },
    hydrate(saved) {
      const next = blank();
      if (saved && typeof saved === "object") {
        if (Array.isArray(saved.roster)) {
          const names = [];
          for (const entry of saved.roster) {
            const name = cleanName(entry);
            if (name && !names.includes(name)) names.push(name);
            if (names.length >= MAX_BOTS) break;
          }
          next.roster = names;
        }
        next.hasRoster = saved.hasRoster === true;
        next.groups = copyMap(saved.groups, (value) => (typeof value === "string" ? cleanTeam(value) || undefined : undefined));
        next.looks = copyMap(saved.looks, (value) => cleanLook(value) || undefined);
        next.bots = copyMap(saved.bots, (value) => {
          if (!value || typeof value !== "object") return undefined;
          return {
            status: cleanStatus(value.status),
            step: cleanText(value.step, MAX_TEXT),
            at: Number.isFinite(value.at) ? value.at : Date.now(),
          };
        });
        next.routines = copyMap(saved.routines, (value) => (Array.isArray(value) ? value : undefined));
        if (saved.usage && typeof saved.usage === "object") {
          next.usage = {
            total_used_pct: Number.isFinite(Number(saved.usage.total_used_pct)) ? Number(saved.usage.total_used_pct) : null,
            resets_at: cleanText(saved.usage.resets_at, 40),
            bots: copyMap(saved.usage.bots, (value) => (Number.isFinite(Number(value)) ? Number(value) : undefined)),
          };
        }
        if (typeof saved.lastEventId === "string" && saved.lastEventId) {
          next.lastEventId = saved.lastEventId.slice(0, 80);
          next.seen.add(next.lastEventId);
          next.seenOrder.push(next.lastEventId);
        }
      }
      state = next;
      emit();
    },
    replaceFromMessages(rows) {
      const next = blank();
      const sorted = [...rows].sort((a, b) => (a.time || 0) - (b.time || 0) || String(a.id || "").localeCompare(String(b.id || "")));
      for (const row of sorted) ingest(next, row);
      state = next;
      emit();
    },
    applyMessage(row) {
      const changed = ingest(state, row);
      if (changed) emit();
      return changed;
    },
    snapshot() {
      return {
        roster: state.roster.slice(),
        hasRoster: state.hasRoster,
        groups: { ...state.groups },
        looks: { ...state.looks },
        bots: { ...state.bots },
        routines: { ...state.routines },
        usage: state.usage,
        lastEventId: state.lastEventId,
      };
    },
  };
}
