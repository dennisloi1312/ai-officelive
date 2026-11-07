/** Day and night colors from the viewer's local clock. Pure data, no rendering. */

const STOPS = [
  {
    t: 0,
    top: '#1b2744',
    bottom: '#3a4a6e',
    fog: '#2a3654',
    ambient: 0.62,
    ambientColor: '#d7e0f4',
    sun: 0.28,
    sunColor: '#9eb6dd',
    hemiSky: '#31456f',
    hemiGround: '#6e5646',
    grass: '#1e3328',
    trim: '#cbb89a',
    window: 1,
    lamp: 1,
    stars: 1,
    sunVis: 0,
    moonVis: 1,
    night: true,
  },
  {
    t: 5,
    top: '#1b2744',
    bottom: '#3a4a6e',
    fog: '#2a3654',
    ambient: 0.62,
    ambientColor: '#d7e0f4',
    sun: 0.28,
    sunColor: '#9eb6dd',
    hemiSky: '#31456f',
    hemiGround: '#6e5646',
    grass: '#1e3328',
    trim: '#cbb89a',
    window: 1,
    lamp: 1,
    stars: 1,
    sunVis: 0,
    moonVis: 1,
    night: true,
  },
  {
    t: 6.3,
    top: '#f7b98f',
    bottom: '#ffe3c8',
    fog: '#f4d0b6',
    ambient: 0.78,
    ambientColor: '#ffe8d4',
    sun: 1.05,
    sunColor: '#ffd2a8',
    hemiSky: '#ffd0b0',
    hemiGround: '#e4c2a2',
    grass: '#93b872',
    trim: '#f0d2ae',
    window: 0.28,
    lamp: 0.2,
    stars: 0,
    sunVis: 1,
    moonVis: 0,
    night: false,
  },
  {
    t: 8,
    top: '#9fd4f5',
    bottom: '#f7ead8',
    fog: '#d7e8f6',
    ambient: 0.7,
    ambientColor: '#fff8f0',
    sun: 1.45,
    sunColor: '#fff4e2',
    hemiSky: '#d0eafc',
    hemiGround: '#e7d3b8',
    grass: '#b7d390',
    trim: '#f3e2c8',
    window: 0.04,
    lamp: 0,
    stars: 0,
    sunVis: 1,
    moonVis: 0,
    night: false,
  },
  {
    t: 16.5,
    top: '#9fd4f5',
    bottom: '#f7ead8',
    fog: '#d7e8f6',
    ambient: 0.7,
    ambientColor: '#fff8f0',
    sun: 1.45,
    sunColor: '#fff4e2',
    hemiSky: '#d0eafc',
    hemiGround: '#e7d3b8',
    grass: '#b7d390',
    trim: '#f3e2c8',
    window: 0.04,
    lamp: 0,
    stars: 0,
    sunVis: 1,
    moonVis: 0,
    night: false,
  },
  {
    t: 18.4,
    top: '#f29a78',
    bottom: '#ffd2b8',
    fog: '#f0b89c',
    ambient: 0.74,
    ambientColor: '#ffd8c0',
    sun: 0.95,
    sunColor: '#ffb07a',
    hemiSky: '#ffb89a',
    hemiGround: '#e2b89a',
    grass: '#9cba72',
    trim: '#f0c8a4',
    window: 0.42,
    lamp: 0.45,
    stars: 0,
    sunVis: 1,
    moonVis: 0,
    night: false,
  },
  {
    t: 20.3,
    top: '#243156',
    bottom: '#4a3b58',
    fog: '#2c3550',
    ambient: 0.58,
    ambientColor: '#d5def2',
    sun: 0.26,
    sunColor: '#8899bb',
    hemiSky: '#2c3c64',
    hemiGround: '#5c463c',
    grass: '#24382c',
    trim: '#bba98c',
    window: 0.95,
    lamp: 1,
    stars: 0.9,
    sunVis: 0,
    moonVis: 1,
    night: true,
  },
  {
    t: 24,
    top: '#1b2744',
    bottom: '#3a4a6e',
    fog: '#2a3654',
    ambient: 0.62,
    ambientColor: '#d7e0f4',
    sun: 0.28,
    sunColor: '#9eb6dd',
    hemiSky: '#31456f',
    hemiGround: '#6e5646',
    grass: '#1e3328',
    trim: '#cbb89a',
    window: 1,
    lamp: 1,
    stars: 1,
    sunVis: 0,
    moonVis: 1,
    night: true,
  },
];

const COLOR_KEYS = ['top', 'bottom', 'fog', 'ambientColor', 'sunColor', 'hemiSky', 'hemiGround', 'grass', 'trim'];
const NUM_KEYS = ['ambient', 'sun', 'window', 'lamp', 'stars', 'sunVis', 'moonVis'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

function mixStop(a, b, t) {
  const out = { night: t < 0.5 ? a.night : b.night };
  for (const key of COLOR_KEYS) out[key] = lerpHex(a[key], b[key], t);
  for (const key of NUM_KEYS) out[key] = lerp(a[key], b[key], t);
  return out;
}

/** Local-hour sky, light, and interior glow. */
export function sceneMood(date) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let i = 0;
  while (i < STOPS.length - 2 && h >= STOPS[i + 1].t) i += 1;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const span = b.t - a.t || 1;
  const t = Math.min(1, Math.max(0, (h - a.t) / span));
  const mood = mixStop(a, b, t);
  mood.sunPoint = sunPoint(h);
  mood.moonPoint = moonPoint(h);
  mood.night = h < 6.1 || h >= 19.8;
  return mood;
}

function sunPoint(h) {
  const t = Math.min(1, Math.max(0, (h - 6.2) / (18.6 - 6.2)));
  const ang = t * Math.PI;
  return {
    x: -Math.cos(ang) * 52,
    y: Math.sin(ang) * 34 + 8,
    z: -22,
  };
}

function moonPoint(h) {
  const nightSpan = 24 - 18.6 + 6.2;
  const along = h >= 18.6 ? h - 18.6 : h + (24 - 18.6);
  const ang = Math.min(1, Math.max(0, along / nightSpan)) * Math.PI;
  return {
    x: Math.cos(ang) * 48,
    y: Math.sin(ang) * 30 + 10,
    z: -20,
  };
}
