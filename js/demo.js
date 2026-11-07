// Sample office used when the page has no topic hash. No network.

function row(id, minutesAgo, now, payload) {
  return {
    id,
    time: Math.floor((now - minutesAgo * 60 * 1000) / 1000),
    event: "message",
    message: JSON.stringify(payload),
  };
}

export function createDemoRows(now = Date.now()) {
  const reset = new Date(now + 36 * 60 * 60 * 1000).toISOString();
  const nextDigest = new Date(now + 14 * 60 * 60 * 1000).toISOString();
  const nextSweep = new Date(now + 3 * 60 * 60 * 1000).toISOString();

  return [
    row("demo-roster", 40, now, {
      roster: ["Mochi", "Pip", "研究｜文獻研究員", "Nova", "Pebble", "Hex", "Clover", "星子"],
    }),
    row("demo-groups", 39, now, {
      groups: {
        Mochi: "Ops",
        Pip: "Ops",
        "研究｜文獻研究員": "Research",
        Nova: "Research",
        Pebble: "Research",
        Hex: "Build",
        Clover: "Build",
        星子: "Build",
      },
    }),
    row("demo-looks", 38, now, {
      looks: {
        Mochi: { shape: "sphere", color: "#F4A261", accessory: "bow" },
        Pip: { shape: "pill", color: "#7EB6FF", accessory: "antenna" },
        "研究｜文獻研究員": { shape: "rounded_cube", color: "#6FBF8A", accessory: "glasses" },
        Nova: { shape: "star6", color: "#C9A0FF", accessory: "stem" },
        Pebble: { shape: "rounded_square", color: "#F2C14E", accessory: "none" },
        Hex: { shape: "hexagon", color: "#FFD166", accessory: "none" },
        Clover: { shape: "clover", color: "#7DDE92", accessory: "stem" },
        星子: { shape: "star4", color: "#FF8FAB", accessory: "bow" },
      },
    }),
    row("demo-mochi", 6, now, { bot: "Mochi", status: "working", step: "Watering the lobby fern" }),
    row("demo-pip", 18, now, { bot: "Pip", status: "idle", step: "Napping by the front door" }),
    row("demo-lit", 3, now, { bot: "研究｜文獻研究員", status: "waiting_user", step: "這段要不要列入週報？" }),
    row("demo-nova", 2, now, { bot: "Nova", status: "working", step: "Summarising the paper" }),
    row("demo-pebble", 11, now, { bot: "Pebble", status: "idle", step: "Stretching between quotes" }),
    row("demo-hex", 8, now, { bot: "Hex", status: "error", step: "Build script exited" }),
    row("demo-clover", 1, now, { bot: "Clover", status: "done", step: "Pushed the patch" }),
    row("demo-hoshi", 5, now, { bot: "星子", status: "working", step: "Lining up the release notes" }),
    row("demo-usage", 12, now, {
      type: "usage",
      total_used_pct: 37,
      resets_at: reset,
      bots: { Mochi: 4.1, Nova: 11.4, Hex: 6.2, 星子: 2.8 },
    }),
    row("demo-routine-mochi", 15, now, {
      routines: {
        bot: "Mochi",
        items: [{ name: "Morning digest", schedule: "0 9 * * 1-5", next_run: nextDigest }],
      },
    }),
    row("demo-routine-hex", 15, now, {
      routines: {
        bot: "Hex",
        items: [{ name: "Nightly build", schedule: "0 2 * * *", next_run: nextSweep }],
      },
    }),
  ];
}

export const DEMO_BEATS = [
  { bot: "Nova", status: "done", step: "Filed the summary" },
  { bot: "Mochi", status: "idle", step: "Tea break in the lobby" },
  { bot: "Hex", status: "working", step: "Retrying the build" },
  { bot: "Clover", status: "working", step: "Sketching a fixture" },
  { bot: "星子", status: "waiting_user", step: "這個顏色可以嗎？" },
  { bot: "Pebble", status: "working", step: "Tagging quotes" },
  { bot: "Nova", status: "working", step: "Reading the next section" },
  { bot: "Mochi", status: "working", step: "Watering the lobby fern" },
];
