/** Sprite scale and nameplate layout. Pure data: no DOM, no network. */

/** 7×6 px masks drawn at 1.25× the live pixel size. */
export const SPRITE_SCALE = 1.25;

/** How many fullwidth characters fit on one nameplate line. */
export const NAME_CHARS = { wide: 7, narrow: 6 };

const BAR = '｜';

export function scaledSpriteSize(cols = 7, rows = 6) {
  return { w: cols * SPRITE_SCALE, h: rows * SPRITE_SCALE };
}

/**
 * Keep the fullwidth bar and CJK characters intact.
 * A line that is too long breaks after the team, the bar, and two role
 * characters (`研究｜文獻` / `研究員`), which is how the live office fits
 * the long research and web-dev names.
 */
export function nameplateText(name, maxChars) {
  const chars = Array.from(String(name ?? ''));
  const limit = Math.max(1, maxChars | 0);
  if (chars.length <= limit) return chars.join('');
  const bar = chars.indexOf(BAR);
  if (bar >= 0) {
    const splitAt = bar + 3;
    if (splitAt > bar && splitAt < chars.length && splitAt <= limit) {
      return `${chars.slice(0, splitAt).join('')}\n${chars.slice(splitAt).join('')}`;
    }
  }
  let at = Math.min(limit, chars.length - 1);
  if (chars[at] === BAR) at += 1;
  if (at >= chars.length) at = chars.length - 1;
  if (at < 1) at = 1;
  return `${chars.slice(0, at).join('')}\n${chars.slice(at).join('')}`;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function rowsOf(list) {
  const sorted = list.slice().sort((a, b) => a.anchorY - b.anchorY || a.anchorX - b.anchorX);
  const rows = [];
  for (const tag of sorted) {
    const row = rows.find((entry) => Math.abs(entry.y - tag.anchorY) < 28);
    if (row) row.tags.push(tag);
    else rows.push({ y: tag.anchorY, tags: [tag] });
  }
  for (const row of rows) row.tags.sort((a, b) => a.anchorX - b.anchorX);
  return rows;
}

/**
 * Place nameplates under their seats. On a wide view the live research row
 * stays in one line inside the room. On a narrow view, tags that cannot sit
 * beside the others move into the corridor just below that room so the floor
 * plan is not cropped to make labels fit.
 */
export function layoutNameplates(tags, context) {
  const { rooms = {}, hall = null, viewW = 1, viewH = 1, avoid = null, gap = 3 } = context || {};
  const out = (tags || []).map((tag) => ({
    ...tag,
    x: tag.ax,
    y: tag.ay,
    hidden: false,
    corridor: false,
  }));
  const byRoom = new Map();
  for (const tag of out) {
    const key = tag.room || '';
    const list = byRoom.get(key) || [];
    list.push(tag);
    byRoom.set(key, list);
  }
  const corridor = [];
  for (const [room, list] of byRoom) {
    const rect = rooms[room];
    if (!rect) {
      for (const tag of list) {
        tag.x = clamp(tag.ax, 2, viewW - tag.w - 2);
        tag.y = clamp(tag.ay, 2, viewH - tag.h - 2);
      }
      continue;
    }
    for (const row of rowsOf(list)) {
      const placed = [];
      for (const tag of row.tags) {
        const minX = rect.x + 2;
        const maxX = rect.x + rect.w - tag.w - 2;
        if (maxX < minX) {
          corridor.push(tag);
          continue;
        }
        let x = clamp(tag.ax, minX, maxX);
        const prev = placed[placed.length - 1];
        if (prev && x < prev.x + prev.w + gap) x = prev.x + prev.w + gap;
        if (x + tag.w > rect.x + rect.w - 2) {
          corridor.push(tag);
          continue;
        }
        const minY = rect.y + 2;
        const maxY = rect.y + rect.h - tag.h - 2;
        tag.x = x;
        tag.y = maxY >= minY ? clamp(tag.ay, minY, maxY) : tag.ay;
        placed.push(tag);
      }
    }
  }
  if (hall) {
    const parked = [];
    corridor.sort((a, b) => a.anchorX - b.anchorX);
    for (const tag of corridor) {
      tag.corridor = true;
      let x = clamp(tag.anchorX - tag.w / 2, hall.x + 2, hall.x + hall.w - tag.w - 2);
      let y = hall.y;
      for (let guard = 0; guard < 6; guard += 1) {
        const box = { x, y, w: tag.w, h: tag.h };
        const hit = parked.find((other) => overlaps(box, other));
        if (!hit) break;
        const next = hit.x + hit.w + gap;
        if (next + tag.w <= hall.x + hall.w - 2) x = next;
        else {
          y = Math.min(hit.y + hit.h + gap, hall.y + Math.max(0, hall.h - tag.h - 2));
          x = clamp(tag.anchorX - tag.w / 2, hall.x + 2, hall.x + hall.w - tag.w - 2);
        }
      }
      tag.x = x;
      tag.y = y;
      parked.push(tag);
    }
  }
  for (const tag of out) {
    if (avoid && overlaps(tag, avoid)) {
      const left = avoid.x - tag.w - gap;
      if (left >= 2) tag.x = left;
      else tag.y = Math.max(2, avoid.y - tag.h - gap);
    }
    tag.x = clamp(tag.x, 2, Math.max(2, viewW - tag.w - 2));
    tag.y = clamp(tag.y, 2, Math.max(2, viewH - tag.h - 2));
  }
  return out;
}
