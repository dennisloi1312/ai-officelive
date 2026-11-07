/** The only network path in the page: https://ntfy.sh/<topic>. */

import { applyEvent, createDemoState, createEmptyState, isTopic, stateFromPlain } from './state.js';

const NTFY_ORIGIN = 'https://ntfy.sh';

function cacheKey(topic) {
  return `ai-office:v1:${topic}`;
}

export function loadCache(topic) {
  if (!isTopic(topic)) return null;
  try {
    const raw = localStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    return stateFromPlain(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCache(topic, state) {
  if (!isTopic(topic)) return;
  try {
    const plain = {
      roster: state.roster,
      groups: { ...state.groups },
      looks: { ...state.looks },
      bots: { ...state.bots },
      routines: { ...state.routines },
      usage: state.usage,
      activity: state.activity,
      lastEventId: state.lastEventId,
    };
    localStorage.setItem(cacheKey(topic), JSON.stringify(plain));
  } catch {
    /* Quota or private mode. The live view still works. */
  }
}

function topicUrl(topic, suffix) {
  return `${NTFY_ORIGIN}/${encodeURIComponent(topic)}${suffix}`;
}

async function pollTopic(topic, signal) {
  const response = await fetch(topicUrl(topic, '/json?poll=1&since=12h'), {
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`ntfy ${response.status}`);
  const text = await response.text();
  const events = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      /* Skip a damaged row. */
    }
  }
  events.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
  return events;
}

function rememberFactory() {
  const seen = new Set();
  return function remember(id) {
    if (id == null) return true;
    const key = String(id);
    if (!key || key.length > 80) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 800) seen.delete(seen.values().next().value);
    return true;
  };
}

export function watchDemo(handlers) {
  handlers.onStatus('demo');
  handlers.onState(createDemoState(), { sound: false });
  return function stop() {};
}

/**
 * Replay the last 12 hours, then follow the SSE stream.
 * On a drop, reconnect with since=<last message id>.
 */
export function watchTopic(topic, handlers) {
  if (!isTopic(topic)) {
    handlers.onStatus('demo');
    handlers.onState(createDemoState());
    return function stop() {};
  }

  let stopped = false;
  let source = null;
  let timer = 0;
  let pollAbort = null;
  let backoff = 1000;
  let saveTimer = 0;
  const state = createEmptyState();
  const remember = rememberFactory();

  const cached = loadCache(topic);
  if (cached && (cached.roster.length || cached.usage || Object.keys(cached.routines).length)) {
    handlers.onState(cached, { sound: false });
  }
  handlers.onStatus('connecting');

  function publish(sound) {
    if (stopped) return;
    handlers.onState(state, { sound: !!sound });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!stopped) saveCache(topic, state);
    }, 250);
  }

  function ingest(event) {
    if (!remember(event && event.id)) return false;
    return applyEvent(state, event);
  }

  function connect(sinceId) {
    if (stopped) return;
    if (source) {
      source.close();
      source = null;
    }
    const suffix = sinceId ? `/sse?since=${encodeURIComponent(sinceId)}` : '/sse';
    const es = new EventSource(topicUrl(topic, suffix));
    source = es;

    const onRow = (ev) => {
      if (stopped || source !== es || !ev || !ev.data) return;
      let row = null;
      try {
        row = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (ingest(row)) publish(true);
    };

    es.addEventListener('message', onRow);
    es.addEventListener('open', onRow);
    es.onopen = () => {
      if (stopped || source !== es) return;
      backoff = 1000;
      handlers.onStatus('live');
    };
    es.onerror = () => {
      if (stopped || source !== es) return;
      es.close();
      if (source === es) source = null;
      handlers.onStatus('reconnecting');
      const wait = backoff;
      backoff = Math.min(backoff * 2, 15000);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => connect(state.lastEventId), wait);
    };
  }

  async function bootstrap() {
    pollAbort = new AbortController();
    try {
      const events = await pollTopic(topic, pollAbort.signal);
      if (stopped) return;
      for (const event of events) ingest(event);
      publish(false);
      connect(state.lastEventId);
    } catch (err) {
      if (stopped || err?.name === 'AbortError') return;
      handlers.onStatus('reconnecting');
      const wait = backoff;
      backoff = Math.min(backoff * 2, 15000);
      window.clearTimeout(timer);
      timer = window.setTimeout(bootstrap, wait);
    }
  }

  bootstrap();

  return function stop() {
    stopped = true;
    window.clearTimeout(timer);
    window.clearTimeout(saveTimer);
    if (pollAbort) pollAbort.abort();
    if (source) source.close();
    source = null;
  };
}
