// The only network client. The topic is sent to ntfy.sh and nowhere else.

const TOPIC_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function storageKey(topic) {
  return `ai-office:v1:${topic}`;
}

export function loadCache(topic) {
  try {
    const raw = localStorage.getItem(storageKey(topic));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function saveCache(topic, store) {
  try {
    localStorage.setItem(storageKey(topic), JSON.stringify(store.snapshot()));
  } catch {
    // Private mode or a full disk. The live view still works.
  }
}

function parseLines(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      if (row && row.event === "message") rows.push(row);
    } catch {
      // Skip a bad line and keep the rest of the backlog.
    }
  }
  return rows;
}

export function connectTopic(topic, store, setStatus) {
  if (!TOPIC_RE.test(topic)) {
    setStatus("reconnecting");
    return () => {};
  }

  let stopped = false;
  let source = null;
  let timer = 0;
  let attempt = 0;

  const clearTimer = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };

  async function pollOnce() {
    const response = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=12h`, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { accept: "application/x-ndjson" },
    });
    if (!response.ok) throw new Error("poll failed");
    return parseLines(await response.text());
  }

  async function poll() {
    let rows = await pollOnce();
    // ntfy can take a moment to make a just-published message visible to poll.
    if (rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (stopped) return;
      const again = await pollOnce();
      if (again.length) rows = again;
    }
    store.replaceFromMessages(rows);
    saveCache(topic, store);
  }

  function openStream() {
    if (stopped) return;
    if (source) {
      source.close();
      source = null;
    }
    const since = store.snapshot().lastEventId;
    const url = since
      ? `https://ntfy.sh/${topic}/sse?since=${encodeURIComponent(since)}`
      : `https://ntfy.sh/${topic}/sse`;
    const es = new EventSource(url);
    source = es;

    es.onopen = () => {
      if (source !== es) return;
      attempt = 0;
      setStatus("live");
    };

    es.onmessage = (event) => {
      if (source !== es) return;
      let row;
      try {
        row = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!row || typeof row !== "object") return;
      if (row.event === "message" && store.applyMessage(row)) saveCache(topic, store);
      setStatus("live");
    };

    es.onerror = () => {
      if (stopped || source !== es) return;
      source = null;
      setStatus("reconnecting");
      es.close();
      const delay = Math.min(15000, 800 * 2 ** attempt);
      attempt = Math.min(attempt + 1, 5);
      timer = window.setTimeout(openStream, delay);
    };
  }

  setStatus("connecting");
  poll()
    .catch(() => {
      if (!stopped) setStatus("reconnecting");
    })
    .then(() => {
      if (!stopped) openStream();
    });

  return function stop() {
    stopped = true;
    clearTimer();
    if (source) {
      source.close();
      source = null;
    }
  };
}
