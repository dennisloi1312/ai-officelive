import { el } from './dom.js';
import { floorPlan, presentBot, resolveLook } from './state.js';

const STATUS_LABEL = {
  working: 'Working',
  idle: 'Idle',
  waiting_user: 'Waiting',
  error: 'Error',
  done: 'Done',
};

const DOT = {
  working: 'dot-working',
  idle: 'dot-idle',
  waiting_user: 'dot-waiting',
  error: 'dot-error',
  done: 'dot-done',
};

const BANNERS = {
  demo: 'Sample office with made-up bots. Add #your-topic to this address to watch a live team. Treat that link like a password and don’t share it.',
  invalid: 'That hash isn’t a topic. Use 6–64 letters, numbers, underscores, or hyphens. Showing the sample office instead.',
  live: '',
};

function formatTime(ms) {
  if (!ms) return '—';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 10) / 10}%`;
}

export function mountUI(hooks) {
  const conn = document.getElementById('conn');
  const banner = document.getElementById('banner');
  const usage = document.getElementById('usage');
  const routines = document.getElementById('routines');
  const floors = document.getElementById('floors');
  const detail = document.getElementById('detail');
  const soundBtn = document.getElementById('sound-btn');
  const resetBtn = document.getElementById('reset-btn');
  const scroller = document.getElementById('panel-scroll');

  let state = {
    roster: [],
    groups: Object.create(null),
    looks: Object.create(null),
    bots: Object.create(null),
    routines: Object.create(null),
    usage: null,
  };
  let selected = null;
  let renderedKey = '';
  let scrolledFor = null;

  soundBtn.addEventListener('click', () => hooks.onSound());
  resetBtn.addEventListener('click', () => hooks.onReset());

  function contentKey(now) {
    const parts = [selected || ''];
    for (const name of state.roster) {
      const view = presentBot(state.bots[name], now, name);
      parts.push(name, view.status, view.quiet ? '1' : '0', view.step, state.groups[name] || '', String(view.updatedAt || 0));
    }
    parts.push(state.usage ? JSON.stringify(state.usage) : '');
    const routineNames = Object.keys(state.routines).sort();
    for (const name of routineNames) parts.push(name, JSON.stringify(state.routines[name]));
    return parts.join('\u0001');
  }

  function renderUsage() {
    usage.replaceChildren();
    if (!state.usage) {
      usage.hidden = true;
      return;
    }
    usage.hidden = false;
    const total = state.usage.total_used_pct;
    usage.appendChild(el('h2', 'card-title', 'Usage'));
    const meter = el('div', 'meter');
    const fill = el('div', 'meter-fill');
    const width = total == null ? 0 : Math.max(0, Math.min(100, Number(total)));
    fill.style.width = `${width}%`;
    meter.appendChild(fill);
    usage.appendChild(meter);
    const line = el('p', 'usage-line');
    line.appendChild(el('strong', null, formatPct(total)));
    line.appendChild(document.createTextNode(' used'));
    usage.appendChild(line);
    if (state.usage.resets_at) {
      usage.appendChild(el('p', 'muted', `Resets ${formatWhen(state.usage.resets_at)}`));
    }
  }

  function renderRoutines() {
    routines.replaceChildren();
    const names = state.roster.filter((name) => state.routines[name]?.length);
    const extras = Object.keys(state.routines).filter((name) => !state.roster.includes(name) && state.routines[name]?.length);
    const all = [...names, ...extras];
    if (!all.length) {
      routines.hidden = true;
      return;
    }
    routines.hidden = false;
    routines.appendChild(el('h2', 'card-title', 'Routines'));
    const list = el('ul', 'routine-list');
    for (const name of all) {
      for (const item of state.routines[name]) {
        const row = el('li', 'routine');
        const who = el('span', 'routine-bot', name);
        who.dir = 'auto';
        row.appendChild(who);
        const title = el('span', 'routine-name', item.name);
        title.dir = 'auto';
        row.appendChild(title);
        const when = [item.schedule, item.next_run ? formatWhen(item.next_run) : ''].filter(Boolean).join(' · ');
        if (when) row.appendChild(el('span', 'muted', when));
        list.appendChild(row);
      }
    }
    routines.appendChild(list);
  }

  function renderFloors(now) {
    const plan = floorPlan(state);
    floors.replaceChildren();
    const rosterEmpty = state.roster.length === 0;
    if (rosterEmpty) {
      floors.appendChild(el('p', 'empty', 'No bots yet. A roster from the last 12 hours will fill the building.'));
    }
    let selectedButton = null;
    for (const floor of plan) {
      if (rosterEmpty && floor.bots.length === 0) continue;
      const section = el('section', 'floor');
      const heading = el('h2', 'floor-title');
      const swatch = el('span', 'floor-swatch');
      swatch.style.backgroundColor = RUG_FOR(floor, plan);
      heading.appendChild(swatch);
      const label = el('span', null, floor.label);
      label.dir = 'auto';
      heading.appendChild(label);
      if (floor.overflowTeams > 0) heading.appendChild(el('span', 'muted', ` +${floor.overflowTeams}`));
      heading.appendChild(el('span', 'floor-count', String(floor.bots.length)));
      section.appendChild(heading);
      const list = el('ul', 'bot-list');
      for (const name of floor.bots) {
        const view = presentBot(state.bots[name], now, name);
        const item = el('li');
        const button = el('button', `bot${selected === name ? ' is-selected' : ''}`);
        button.type = 'button';
        button.setAttribute('aria-pressed', selected === name ? 'true' : 'false');
        const dot = el('span', `dot ${DOT[view.status] || 'dot-idle'}`);
        dot.setAttribute('aria-hidden', 'true');
        const main = el('span', 'bot-main');
        const botName = el('span', 'bot-name', name);
        botName.dir = 'auto';
        main.appendChild(botName);
        if (view.step) {
          const step = el('span', 'bot-step', view.step);
          step.dir = 'auto';
          main.appendChild(step);
        }
        const meta = el('span', 'bot-meta');
        const labelText = view.quiet ? `${STATUS_LABEL[view.status] || 'Idle'} · quiet` : (STATUS_LABEL[view.status] || 'Idle');
        meta.appendChild(el('span', 'bot-status', labelText));
        const time = document.createElement('time');
        time.textContent = formatTime(view.updatedAt);
        if (view.updatedAt) time.dateTime = new Date(view.updatedAt).toISOString();
        meta.appendChild(time);
        const pct = state.usage && state.usage.bots ? state.usage.bots[name] : null;
        if (pct != null) meta.appendChild(el('span', 'bot-pct', formatPct(pct)));
        button.append(dot, main, meta);
        button.addEventListener('click', () => hooks.onSelect(name));
        if (selected === name) selectedButton = button;
        item.appendChild(button);
        list.appendChild(item);
      }
      section.appendChild(list);
      floors.appendChild(section);
    }
    return selectedButton;
  }

  function renderDetail(now) {
    detail.replaceChildren();
    if (!selected || !state.roster.includes(selected)) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    const name = selected;
    const view = presentBot(state.bots[name], now, name);
    const look = resolveLook(name, state.looks[name]);
    const top = el('div', 'detail-top');
    const swatch = el('span', 'detail-swatch');
    swatch.style.backgroundColor = look.color;
    const text = el('div', 'detail-id');
    const title = el('strong', 'detail-name', name);
    title.dir = 'auto';
    const team = state.groups[name] || 'Lobby';
    const sub = el('span', 'muted');
    sub.dir = 'auto';
    sub.textContent = `${team} · ${view.quiet ? 'Idle · quiet' : (STATUS_LABEL[view.status] || 'Idle')}`;
    text.append(title, sub);
    const close = el('button', 'text-btn', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => hooks.onSelect(null));
    top.append(swatch, text, close);
    detail.appendChild(top);
    if (view.step) {
      const step = el('p', 'detail-step', view.step);
      step.dir = 'auto';
      detail.appendChild(step);
    }
    detail.appendChild(el('p', 'muted', view.updatedAt ? `Updated ${formatTime(view.updatedAt)}` : 'No update yet'));
    const items = state.routines[name] || [];
    if (items.length) {
      const list = el('ul', 'detail-routines');
      for (const item of items) {
        const row = el('li');
        row.dir = 'auto';
        const bits = [item.name, item.schedule, item.next_run ? formatWhen(item.next_run) : ''].filter(Boolean);
        row.textContent = bits.join(' · ');
        list.appendChild(row);
      }
      detail.appendChild(list);
    }
  }

  function render() {
    const now = Date.now();
    const y = scroller.scrollTop;
    renderUsage();
    renderRoutines();
    const selectedButton = renderFloors(now);
    renderDetail(now);
    scroller.scrollTop = y;
    if (selectedButton && scrolledFor !== selected) {
      selectedButton.scrollIntoView({ block: 'nearest' });
      scrolledFor = selected;
    }
    if (!selected) scrolledFor = null;
    renderedKey = contentKey(now);
  }

  window.setInterval(() => {
    if (contentKey(Date.now()) !== renderedKey) render();
  }, 1000);

  return {
    sync(next, selectedName) {
      state = next;
      selected = selectedName;
      render();
    },
    setSelected(name) {
      selected = name;
      render();
    },
    setMode(mode) {
      const label = mode === 'live' ? 'Live' : mode === 'connecting' ? 'Connecting' : mode === 'reconnecting' ? 'Reconnecting' : 'Demo';
      conn.textContent = label;
      conn.className = `conn chip ${mode || 'demo'}`;
      document.body.dataset.mode = mode || 'demo';
    },
    setBanner(kind) {
      const text = BANNERS[kind] || '';
      banner.textContent = text;
      banner.hidden = !text;
    },
    setSound(on) {
      soundBtn.textContent = on ? 'Sound on' : 'Sound off';
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    },
  };
}

function RUG_FOR(floor, plan) {
  const index = Math.max(0, plan.indexOf(floor));
  return ['#e7b15a', '#8ebfd4', '#f0b3be', '#9ed0ae', '#c3a4de', '#e3c07a'][index % 6];
}
