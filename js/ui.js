import { el } from './dom.js';
import { floorPlan, presentBot, resolveLook, themeColor } from './state.js';

const LABEL = {
  working: 'Working',
  waiting_user: 'Waiting',
  error: 'Error',
  idle: 'Resting',
  done: 'Done',
};

const BANNERS = {
  demo: 'Sample office. Add #your-topic to this address to watch a live team. Treat that link like a password and don’t share it.',
  invalid: 'That hash isn’t a topic. Use 6–64 letters, numbers, underscores, or hyphens. Showing the sample office instead.',
  live: '',
};

function formatTime(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms > 1e14) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function tally(state, now) {
  const counts = { working: 0, waiting: 0, error: 0, resting: 0 };
  for (const name of state.roster) {
    const view = presentBot(state.bots[name], now, name);
    if (view.status === 'working') counts.working += 1;
    else if (view.status === 'waiting_user') counts.waiting += 1;
    else if (view.status === 'error') counts.error += 1;
    else counts.resting += 1;
  }
  return counts;
}

function countLine(parts) {
  return parts.filter((part) => part.value > 0).map((part) => {
    const word = part.value === 1 && part.one ? part.one : part.label;
    return `${part.value} ${word}`;
  }).join(' · ');
}

export function mountUI(hooks) {
  const conn = document.getElementById('conn');
  const banner = document.getElementById('banner');
  const summary = document.getElementById('summary');
  const left = document.getElementById('left');
  const right = document.getElementById('right');
  const activity = document.getElementById('activity');
  const card = document.getElementById('bot-card');
  const tabs = document.getElementById('floor-tabs');
  const clock = document.getElementById('clock');
  const soundBtn = document.getElementById('sound-btn');
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');

  let view = { state: null, floorIndex: 0, selected: null };
  let rendered = '';
  let bannerKind = 'live';
  let hintDismissed = false;
  let hintCollapsed = window.matchMedia('(max-width: 640px)').matches;
  const open = { waiting: true, finished: false, routines: false };

  soundBtn.addEventListener('click', () => hooks.onSound());
  zoomIn.addEventListener('click', () => hooks.onZoom(1));
  zoomOut.addEventListener('click', () => hooks.onZoom(-1));
  const drawer = document.getElementById('drawer');
  const drawerToggle = document.getElementById('drawer-toggle');
  if (drawer && drawerToggle) {
    drawerToggle.addEventListener('click', () => {
      const opened = drawer.classList.toggle('is-open');
      drawerToggle.setAttribute('aria-expanded', opened ? 'true' : 'false');
      drawerToggle.textContent = opened ? 'Hide panels' : 'Panels';
    });
  }
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.addEventListener('click', () => hooks.onClose());

  function views(now) {
    const state = view.state;
    return state.roster.map((name) => ({ name, ...presentBot(state.bots[name], now, name) }));
  }

  function thumbnail(look) {
    const node = el('span', `thumb thumb-${look.shape || 'sphere'}`);
    node.style.background = look.color;
    node.setAttribute('aria-hidden', 'true');
    node.append(el('i', 'eye'), el('i', 'eye'));
    return node;
  }

  function avatar(name, look) {
    const node = el('span', 'avatar');
    node.style.background = look.color;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function botButton(item, selected) {
    const button = el('button', `bot-row${selected === item.name ? ' is-selected' : ''}`);
    button.type = 'button';
    const look = resolveLook(item.name, view.state.looks[item.name]);
    const text = el('span', 'bot-copy');
    const name = el('span', 'bot-name', item.name);
    name.dir = 'auto';
    text.appendChild(name);
    if (item.step) {
      const step = el('span', 'bot-step', item.step);
      step.dir = 'auto';
      text.appendChild(step);
    }
    const tone = item.status === 'waiting_user' ? 'waiting' : item.status;
    const status = el('span', `status-pill tone-${tone}`);
    const mark = el('span', `status-dot dot-${tone}`);
    mark.setAttribute('aria-hidden', 'true');
    status.append(mark, document.createTextNode(LABEL[item.status] || 'Resting'));
    button.append(avatar(item.name, look), text, status);
    button.setAttribute('aria-label', `${item.name}, ${LABEL[item.status] || 'Resting'}${item.step ? `, ${item.step}` : ''}`);
    button.addEventListener('click', () => hooks.onBot(item.name));
    return button;
  }

  function section(key, title, count, extraClass, body) {
    const wrap = el('section', `glass sub ${extraClass || ''}${count ? ' has' : ''}`);
    const head = el('button', 'sub-head');
    head.type = 'button';
    const label = el('span', 'sub-title');
    label.append(el('span', 'chev', open[key] ? '▾' : '▸'), document.createTextNode(` ${title}`));
    const badge = el('span', 'count-pill', String(count));
    head.append(label, badge);
    head.setAttribute('aria-expanded', open[key] ? 'true' : 'false');
    head.addEventListener('click', () => {
      open[key] = !open[key];
      render();
    });
    wrap.appendChild(head);
    if (open[key]) wrap.appendChild(body);
    return wrap;
  }

  function renderFloors(floors) {
    const list = el('div', 'floor-list');
    for (let index = floors.length - 1; index >= 0; index -= 1) {
      const floor = floors[index];
      const button = el('button', `floor-row${index === view.floorIndex ? ' is-active' : ''}`);
      button.type = 'button';
      button.setAttribute('aria-current', index === view.floorIndex ? 'true' : 'false');
      const badge = el('span', 'badge', String(index + 1));
      badge.style.background = themeColor(floor.theme);
      const name = el('span', 'floor-name', floor.label);
      name.dir = 'auto';
      const dots = el('span', 'dots');
      dots.title = 'Each dot is that bot’s own color, not its status.';
      floor.bots.slice(0, 6).forEach((bot) => {
        const dot = el('span', 'mini');
        dot.style.background = resolveLook(bot, view.state.looks[bot]).color;
        dots.appendChild(dot);
      });
      button.append(badge, name, dots, el('span', 'floor-count', String(floor.bots.length)));
      button.addEventListener('click', () => hooks.onFloor(index));
      list.appendChild(button);
    }
    return list;
  }

  function renderTabs(floors) {
    tabs.replaceChildren();
    for (let index = floors.length - 1; index >= 0; index -= 1) {
      const floor = floors[index];
      const button = el('button', `tab${index === view.floorIndex ? ' is-active' : ''}`);
      button.type = 'button';
      button.style.setProperty('--tab', themeColor(floor.theme));
      const name = el('span', null, floor.label);
      name.dir = 'auto';
      button.append(el('span', 'tab-index', String(index + 1)), name);
      button.addEventListener('click', () => hooks.onFloor(index));
      tabs.appendChild(button);
    }
  }

  function renderSummary(counts) {
    summary.replaceChildren();
    const items = [
      ['working', counts.working, 'working'],
      ['waiting', counts.waiting, 'waiting'],
      [counts.error === 1 ? 'error' : 'errors', counts.error, 'errors'],
      ['resting', counts.resting, 'resting'],
    ];
    items.forEach(([label, value, kind]) => {
      const chip = el('span', `sum sum-${kind}`);
      const mark = el('span', `status-dot dot-${kind === 'errors' ? 'error' : kind === 'resting' ? 'idle' : kind}`);
      mark.setAttribute('aria-hidden', 'true');
      const number = el('b', null, String(value));
      chip.append(mark, number, document.createTextNode(` ${label}`));
      summary.appendChild(chip);
    });
    const live = document.getElementById('live');
    if (live) {
      const sentence = `${counts.working} working, ${counts.waiting} waiting, ${counts.error} ${counts.error === 1 ? 'error' : 'errors'}, ${counts.resting} resting`;
      if (live.dataset.sentence !== sentence) {
        live.dataset.sentence = sentence;
        live.textContent = sentence;
      }
    }
  }

  function renderLeft(floors, people) {
    left.replaceChildren();
    const block = el('section', 'glass floors-card');
    const title = el('h2', 'card-label', 'Floors');
    const legend = el('p', 'legend', 'Dots show each bot’s color, not status.');
    block.append(title, legend, renderFloors(floors));
    left.appendChild(block);

    const waiting = people.filter((item) => item.status === 'waiting_user');
    const waitBody = el('div', 'sub-body');
    if (!waiting.length) waitBody.appendChild(el('p', 'empty', 'Nobody is waiting.'));
    waiting.forEach((item) => waitBody.appendChild(botButton(item, view.selected)));
    left.appendChild(section('waiting', 'Waiting on me', waiting.length, 'wait-card', waitBody));

    const finished = people.filter((item) => item.raw === 'done');
    const doneBody = el('div', 'sub-body');
    if (!finished.length) doneBody.appendChild(el('p', 'empty', 'Nothing finished yet.'));
    finished.forEach((item) => doneBody.appendChild(botButton(item, view.selected)));
    left.appendChild(section('finished', 'Finished', finished.length, '', doneBody));

    const routineBody = el('div', 'sub-body');
    const names = Object.keys(view.state.routines).filter((name) => view.state.routines[name]?.length);
    if (!names.length) routineBody.appendChild(el('p', 'empty', 'No routines yet.'));
    names.forEach((name) => {
      view.state.routines[name].forEach((item) => {
        const row = el('p', 'routine');
        const who = el('b', null, name);
        who.dir = 'auto';
        row.appendChild(who);
        const detail = el('span', null, [item.name, item.schedule, item.next_run ? formatWhen(item.next_run) : ''].filter(Boolean).join(' · '));
        detail.dir = 'auto';
        row.appendChild(detail);
        routineBody.appendChild(row);
      });
    });
    left.appendChild(section('routines', 'Routines', names.length, '', routineBody));
  }

  function renderRight(floors, people, now) {
    right.replaceChildren();
    const floor = floors[view.floorIndex] || floors[0];
    if (!floor) {
      right.appendChild(el('p', 'empty', 'No floors yet.'));
      return;
    }
    const cardWrap = el('section', 'glass floor-card');
    const head = el('header', 'floor-head');
    head.style.background = themeColor(floor.theme);
    const title = el('h2', null, floor.label);
    title.dir = 'auto';
    const here = people.filter((item) => floor.bots.includes(item.name));
    const working = here.filter((item) => item.status === 'working').length;
    const waiting = here.filter((item) => item.status === 'waiting_user').length;
    const errors = here.filter((item) => item.status === 'error').length;
    const resting = here.filter((item) => item.status === 'idle').length;
    head.append(title, el('p', 'floor-stat', `${working} working`), el('p', 'floor-sub', countLine([
      { value: waiting, label: 'waiting' },
      { value: errors, label: errors === 1 ? 'error' : 'errors' },
      { value: resting, label: 'resting' },
    ])));
    const list = el('div', 'floor-bots');
    if (!here.length) list.appendChild(el('p', 'empty', 'This floor is empty.'));
    here.forEach((item) => list.appendChild(botButton(item, view.selected)));
    cardWrap.append(head, list);
    if (view.state.usage && view.state.usage.total_used_pct != null) {
      const usage = el('p', 'usage-line', `${view.state.usage.total_used_pct}% used`);
      if (view.state.usage.resets_at) usage.appendChild(el('span', null, ` · resets ${formatWhen(view.state.usage.resets_at)}`));
      cardWrap.appendChild(usage);
    }
    right.appendChild(cardWrap);
    void now;
  }

  function renderActivity() {
    activity.replaceChildren();
    const wrap = el('section', 'glass');
    wrap.appendChild(el('h2', 'card-label', 'Activity'));
    const list = el('ul', 'feed');
    const items = (view.state.activity || []).slice().reverse().slice(0, 6);
    if (!items.length) list.appendChild(el('li', 'empty', 'No activity yet.'));
    items.forEach((item) => {
      const row = el('li');
      row.appendChild(el('time', null, formatTime(item.at)));
      const name = el('b', null, item.bot);
      name.dir = 'auto';
      row.appendChild(name);
      const step = el('span', null, item.step || LABEL[item.status] || '');
      step.dir = 'auto';
      row.appendChild(step);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    activity.appendChild(wrap);
  }

  function renderCard(people, floors, now) {
    card.replaceChildren();
    const item = people.find((entry) => entry.name === view.selected);
    const backdrop = document.getElementById('backdrop');
    if (!item) {
      card.hidden = true;
      if (backdrop) backdrop.hidden = true;
      return;
    }
    card.hidden = false;
    const handle = el('button', 'grabber', '');
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Close details');
    handle.addEventListener('click', () => hooks.onClose());
    card.appendChild(handle);
    const floor = floors.find((entry) => entry.bots.includes(item.name));
    const look = resolveLook(item.name, view.state.looks[item.name]);
    const top = el('div', 'card-top');
    const id = el('div');
    const name = el('h2', null, item.name);
    name.dir = 'auto';
    const team = el('p', 'muted', floor ? floor.label : 'Lobby');
    team.dir = 'auto';
    id.append(name, team);
    const close = el('button', 'icon-btn', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close details');
    close.addEventListener('click', () => hooks.onClose());
    top.append(thumbnail(look), id, close);
    const chip = el('p', `status-chip chip-${item.status === 'waiting_user' ? 'waiting' : item.status}`);
    const age = formatAge(item.age);
    chip.textContent = age ? `${LABEL[item.status] || 'Resting'} · ${age}` : (LABEL[item.status] || 'Resting');
    card.append(top, chip);
    if (item.step) {
      const step = el('p', 'card-step', item.step);
      step.dir = 'auto';
      card.appendChild(step);
    }
    const tiles = el('div', 'tiles');
    const usageValue = view.state.usage && view.state.usage.bots ? view.state.usage.bots[item.name] : null;
    const routineCount = view.state.routines[item.name]?.length || 0;
    [
      [formatAge(item.age) || '—', 'in status'],
      [usageValue == null ? '—' : `${usageValue}%`, 'usage'],
      [String(routineCount), routineCount === 1 ? 'routine' : 'routines'],
    ].forEach(([value, label]) => {
      const tile = el('div', 'tile');
      tile.append(el('b', null, value), el('span', null, label));
      tiles.appendChild(tile);
    });
    card.appendChild(tiles);
    const recent = (view.state.activity || []).filter((entry) => entry.bot === item.name).slice(-3).reverse();
    if (recent.length) {
      card.appendChild(el('p', 'legend', 'Last steps'));
      const list = el('ul', 'recent');
      recent.forEach((entry) => {
        const row = el('li');
        row.append(el('time', null, formatTime(entry.at) || '—'), document.createTextNode(` ${entry.step || LABEL[entry.status] || ''}`));
        list.appendChild(row);
      });
      card.appendChild(list);
    }
    const center = el('button', 'primary', `Focus on ${item.name}`);
    center.type = 'button';
    center.addEventListener('click', () => hooks.onBot(item.name));
    card.appendChild(center);
    if (backdrop) backdrop.hidden = false;
    void now;
  }

  function render() {
    if (!view.state) return;
    const now = Date.now();
    clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const floors = floorPlan(view.state);
    const people = views(now);
    renderSummary(tally(view.state, now));
    renderTabs(floors);
    renderLeft(floors, people);
    renderRight(floors, people, now);
    renderActivity();
    renderCard(people, floors, now);
    rendered = key(now);
  }

  function key(now) {
    const state = view.state;
    if (!state) return '';
    const bucket = Math.floor(now / 15000);
    return [
      view.floorIndex,
      view.selected || '',
      open.waiting, open.finished, open.routines,
      bucket,
      state.roster.join(','),
      (state.activity || []).length,
      state.usage ? state.usage.total_used_pct : '',
      ...state.roster.map((name) => {
        const item = presentBot(state.bots[name], now, name);
        return `${name}:${item.status}:${item.raw}:${item.step}`;
      }),
    ].join('|');
  }

  function paintBanner() {
    const text = BANNERS[bannerKind] || '';
    banner.replaceChildren();
    if (!text || hintDismissed) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.classList.toggle('is-collapsed', hintCollapsed);
    const body = el('span', 'hint-text', hintCollapsed ? 'Sample office' : text);
    const actions = el('span', 'hint-actions');
    if (hintCollapsed) {
      const more = el('button', 'hint-more', 'Show');
      more.type = 'button';
      more.addEventListener('click', () => {
        hintCollapsed = false;
        paintBanner();
      });
      actions.appendChild(more);
    }
    const close = el('button', 'hint-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss hint');
    close.addEventListener('click', () => {
      hintDismissed = true;
      banner.hidden = true;
    });
    actions.appendChild(close);
    banner.append(body, actions);
  }

  window.setInterval(() => {
    if (view.state && key(Date.now()) !== rendered) render();
  }, 1000);

  return {
    sync(next) {
      view = next;
      render();
    },
    setMode(mode) {
      const label = mode === 'live' ? 'Live' : mode === 'connecting' ? 'Connecting' : mode === 'reconnecting' ? 'Reconnecting' : 'Demo';
      conn.textContent = label;
      conn.className = `conn ${mode || 'demo'}`;
      document.body.dataset.mode = mode || 'demo';
      const live = document.getElementById('live');
      if (live) live.textContent = label;
    },
    setBanner(kind) {
      bannerKind = kind;
      paintBanner();
    },
    setSound(on) {
      soundBtn.classList.toggle('is-on', !!on);
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    },
  };
}
