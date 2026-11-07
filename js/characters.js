import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el } from './dom.js';
import { hashName } from './state.js';

const geos = new Map();
let segments = null;

const LOGOS = [
  { kind: 'sphere', color: '#9B6BF0' },
  { kind: 'pill', color: '#2EC4B6' },
  { kind: 'sphere', color: '#3DDC6A' },
  { kind: 'pill', color: '#F5A24A' },
  { kind: 'triangle', color: '#A67C52' },
  { kind: 'drop', color: '#C9A6E8' },
  { kind: 'sphere', color: '#FF4D9A' },
];

const NAMED = {
  Kai: 0,
  Momo: 1,
  Jun: 2,
  Sol: 3,
  Ren: 4,
  小墨: 5,
  Pixel: 6,
};

const STATUS_RING = {
  working: '#34C759',
  waiting_user: '#F5A524',
  error: '#FF5A5F',
  done: '#5AA9FF',
};

function seg() {
  if (segments == null) {
    const coarse = window.matchMedia('(pointer: coarse), (max-width: 640px)').matches;
    segments = coarse ? 20 : 32;
  }
  return segments;
}

function sharedGeo(key, build) {
  const id = `${key}@${seg()}`;
  let geometry = geos.get(id);
  if (!geometry) {
    geometry = build();
    geometry.userData.shared = true;
    geos.set(id, geometry);
  }
  return geometry;
}

function logoFor(name) {
  if (Object.prototype.hasOwnProperty.call(NAMED, name)) return LOGOS[NAMED[name]];
  return LOGOS[hashName(name) % LOGOS.length];
}

function lathe(key, profile) {
  return sharedGeo(key, () => new THREE.LatheGeometry(profile, seg()));
}

function headGeometry(kind) {
  const s = seg();
  if (kind === 'pill') {
    return sharedGeo('pill', () => {
      const geo = new THREE.CapsuleGeometry(0.25, 0.34, 8, s);
      geo.rotateZ(Math.PI / 2);
      return geo;
    });
  }
  if (kind === 'triangle') {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const y = -0.3 + t * 0.58;
      const grow = Math.sin(Math.min(t / 0.2, 1) * Math.PI / 2);
      const taper = Math.max(0, 1 - Math.max(0, t - 0.18) / 0.82) ** 1.05;
      pts.push(new THREE.Vector2(Math.max(0.018, 0.36 * grow * (Number.isFinite(taper) ? taper : 0)), y));
    }
    return lathe('triangle', pts);
  }
  if (kind === 'drop') {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const y = -0.3 + t * 0.68;
      const r = 0.3 * Math.sin(Math.PI * Math.max(0, t) ** 0.78) * (1 - t * 0.08);
      pts.push(new THREE.Vector2(Math.max(0.015, Number.isFinite(r) ? r : 0.015), y));
    }
    return lathe('drop', pts);
  }
  return sharedGeo('sphere', () => new THREE.SphereGeometry(0.34, s, Math.max(16, s - 8)));
}

function footOf(kind) {
  if (kind === 'pill') return 0.25;
  if (kind === 'triangle' || kind === 'drop') return 0.3;
  return 0.34;
}

const EYE_TILT = -0.42;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createCharacter(name) {
  const logo = logoFor(name);
  const s = seg();
  const material = new THREE.MeshPhysicalMaterial({
    color: logo.color,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
  });
  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);

  const head = new THREE.Mesh(headGeometry(logo.kind), material);
  if (logo.kind === 'triangle') head.rotation.z = -0.18;
  head.castShadow = true;
  pose.add(head);

  const eyeGeo = sharedGeo('eye', () => new THREE.CapsuleGeometry(0.034, 0.062, 4, Math.max(8, s / 2)));
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const eyes = new THREE.Mesh(sharedGeo(`eyes-${logo.kind}`, () => {
    const z = logo.kind === 'sphere' ? 0.3 : 0.24;
    const y = logo.kind === 'drop' ? 0.02 : 0.04;
    const parts = [-0.075, 0.075].map((x) => {
      const clone = eyeGeo.clone();
      clone.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, EYE_TILT)),
        new THREE.Vector3(1, 1, 1),
      ));
      return clone;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    return geometry;
  }), eyeMat);
  head.add(eyes);

  const ring = new THREE.Mesh(
    sharedGeo('status-ring', () => new THREE.RingGeometry(0.36, 0.46, s === 20 ? 32 : 48)),
    new THREE.MeshBasicMaterial({ color: '#34C759', side: THREE.DoubleSide, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1;
  ring.visible = false;
  const halo = new THREE.Mesh(
    sharedGeo('select-ring', () => new THREE.RingGeometry(0.48, 0.54, s === 20 ? 32 : 48)),
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -1;
  halo.visible = false;
  root.add(ring, halo);

  const nameEl = el('div', 'name-label');
  nameEl.dir = 'auto';
  const nameDot = el('span', 'status-dot');
  nameEl.append(nameDot, el('span', 'name-text', name));
  const nameTag = new CSS2DObject(nameEl);
  nameTag.visible = false;
  root.add(nameTag);

  const stepEl = el('div', 'bubble step');
  stepEl.dir = 'auto';
  const stepTag = new CSS2DObject(stepEl);
  stepTag.visible = false;
  root.add(stepTag);

  const alertEl = el('div', 'bubble alert', '!');
  const alertTag = new CSS2DObject(alertEl);
  alertTag.visible = false;
  root.add(alertTag);
  const errorEl = el('div', 'bubble bad', '×');
  const errorTag = new CSS2DObject(errorEl);
  errorTag.visible = false;
  root.add(errorTag);
  const doneEl = el('div', 'bubble done-mark', '✓');
  const doneTag = new CSS2DObject(doneEl);
  doneTag.visible = false;
  root.add(doneTag);

  const sleepEl = el('div', 'bubble sleep');
  sleepEl.style.color = '#8E8E93';
  ['z', 'z', 'Z'].forEach((glyph, index) => {
    const letter = el('span', `z z${index + 1}`, glyph);
    letter.style.color = '#8E8E93';
    sleepEl.appendChild(letter);
  });
  const sleepTag = new CSS2DObject(sleepEl);
  sleepTag.visible = false;
  root.add(sleepTag);

  root.traverse((obj) => {
    if (obj.isCSS2DObject) obj.raycast = () => {};
  });

  const foot = footOf(logo.kind);
  return {
    root,
    pose,
    pickRoot: pose,
    bodyMat: material,
    smile: eyes,
    ring,
    halo,
    nameTag,
    nameDot,
    stepEl,
    stepTag,
    alertTag,
    errorTag,
    doneTag,
    sleepTag,
    stepShown: '',
    foot,
    phase: (hashName(name) % 628) / 100,
    motion: { shake: 1, mode: '', moving: false, sit: 1 },
  };
}

export function updateCharacter(visual, ctx) {
  const dt = Math.min(ctx.dt || 0, 0.05);
  const t = ctx.t || 0;
  const mode = ctx.mode;
  const reduce = !!ctx.reduce;
  const hold = !!ctx.hold || reduce;
  const motion = visual.motion;
  const phase = visual.phase;
  const visit = ctx.visit || null;
  const gait = ctx.gait || 'sit';
  const sitting = gait === 'sit';
  const walking = gait === 'walk';
  const sitY = 0.42 + visual.foot * 0.18;
  const walkY = visual.foot;

  if (!motion.ready) {
    motion.ready = true;
    motion.x = ctx.seat.x;
    motion.z = ctx.seat.z;
    motion.sit = 1;
    visual.root.position.set(ctx.seat.x, sitY, ctx.seat.z);
  }

  const goalX = visit ? visit.x : ctx.seat.x;
  const goalZ = visit ? visit.z : ctx.seat.z;
  const dx = goalX - motion.x;
  const dz = goalZ - motion.z;
  const dist = Math.hypot(dx, dz);
  let yaw = Math.PI / 5;
  if (!hold && walking && dist > 0.05) {
    const step = Math.min(dist, (reduce ? dist : 1.55 * dt));
    motion.x += (dx / dist) * step;
    motion.z += (dz / dist) * step;
    yaw = Math.atan2(dx, dz);
    motion.moving = dist > 0.1;
  } else {
    if (!hold && dist <= 0.05) {
      motion.x = goalX;
      motion.z = goalZ;
    }
    motion.moving = false;
    if (visit) yaw = Math.atan2(visit.faceX - motion.x, visit.faceZ - motion.z);
  }

  visual.root.position.x = motion.x;
  visual.root.position.z = motion.z;
  const bob = walking && motion.moving && !reduce ? Math.sin((t / 0.28) * Math.PI * 2 + phase) * 0.022 : 0;
  const targetY = sitting ? sitY : walkY;
  visual.root.position.y = damp(visual.root.position.y, targetY, 10, dt) + bob;

  let yawNow = motion.yaw == null ? yaw : motion.yaw;
  let spin = yaw - yawNow;
  while (spin > Math.PI) spin -= Math.PI * 2;
  while (spin < -Math.PI) spin += Math.PI * 2;
  yawNow += spin * (1 - Math.exp(-16 * dt));
  motion.yaw = yawNow;
  visual.root.rotation.y = yawNow;

  motion.sit = damp(motion.sit, sitting ? 1 : 0, 10, dt);
  const nod = ctx.nod ? Math.sin(Math.min(ctx.nod, 1) * Math.PI) * 0.22 : 0;
  const lean = sitting ? 0.16 * motion.sit : nod;
  visual.pose.rotation.x = damp(visual.pose.rotation.x, lean, 10, dt);
  const stepLean = walking && motion.moving && !reduce ? Math.sin((t / 0.28) * Math.PI * 2 + phase) * 0.07 : 0;
  visual.pose.rotation.z = stepLean;

  if (mode === 'error' && motion.mode !== 'error') motion.shake = 0;
  motion.mode = mode;
  if (mode === 'error' && !reduce && motion.shake < 0.3 && !motion.moving) {
    motion.shake += dt;
    visual.pose.position.x = Math.sin((motion.shake / 0.3) * Math.PI * 2) * 0.02;
  } else {
    motion.shake = Math.max(motion.shake, 1);
    visual.pose.position.x = damp(visual.pose.position.x, 0, 10, dt);
  }

  const status = ctx.status || 'idle';
  const resting = status === 'idle';
  const ringOn = !resting && Object.prototype.hasOwnProperty.call(STATUS_RING, status);
  const selected = !!ctx.selected;
  const floorY = 0.03 - visual.root.position.y;
  visual.ring.position.y = floorY;
  visual.halo.position.y = floorY - 0.004;
  visual.ring.rotation.set(-Math.PI / 2, 0, 0);
  visual.halo.rotation.set(-Math.PI / 2, 0, 0);
  visual.ring.visible = ringOn;
  visual.halo.visible = ringOn && selected;
  if (ringOn) {
    visual.ring.material.color.set(STATUS_RING[status]);
    const scale = selected ? 1.15 : 1;
    visual.ring.scale.setScalar(scale);
    visual.halo.scale.setScalar(scale);
  }

  const alertOn = status === 'waiting_user';
  visual.alertTag.visible = alertOn;
  const hop = alertOn && !hold && (t % 2) < 0.35 ? Math.sin(((t % 2) / 0.35) * Math.PI) * 0.06 : 0;
  visual.alertTag.position.set(0.02, visual.foot + 0.28 + hop, 0);
  visual.errorTag.visible = status === 'error';
  visual.errorTag.position.set(0.02, visual.foot + 0.28, 0);
  visual.doneTag.visible = status === 'done';
  visual.doneTag.position.set(0.02, visual.foot + 0.28, 0);
  const step = ctx.showStep ? String(ctx.step || '').slice(0, 80) : '';
  if (visual.stepShown !== step) {
    visual.stepEl.textContent = step;
    visual.stepShown = step;
  }
  visual.stepTag.visible = Boolean(step);
  visual.stepTag.position.set(0, visual.foot + 0.46, 0);
  visual.sleepTag.visible = resting && sitting && !motion.moving;
  visual.sleepTag.position.set(0.16, visual.foot + 0.32, 0);
  visual.nameTag.visible = !!ctx.showName;
  visual.nameTag.position.set(0, visual.foot + 0.38, 0);
  const tone = status === 'waiting_user' ? 'waiting' : status;
  visual.nameDot.className = `status-dot dot-${tone}`;
}
