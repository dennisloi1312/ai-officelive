import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el } from './dom.js';
import { clip, hashName } from './state.js';

const geos = new Map();
const sharedMats = new Map();
let segments = null;

const HEAD_Y = 0.82;
const BODY_Y = 0.36;

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

function sharedMat(key, build) {
  let material = sharedMats.get(key);
  if (!material) {
    material = build();
    material.userData.shared = true;
    sharedMats.set(key, material);
  }
  return material;
}

function vinyl(color, vertexColors = false) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0,
    vertexColors,
  });
}

function compose(geo, part) {
  const clone = geo.clone();
  clone.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(part.x || 0, part.y || 0, part.z || 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rx || 0, part.ry || 0, part.rz || 0)),
    new THREE.Vector3(part.sx || 1, part.sy || 1, part.sz || 1),
  ));
  return clone;
}

function paint(geometry, choose) {
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    color.set(choose(pos.getX(i), pos.getY(i), pos.getZ(i)));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function merged(key, buildParts, tint) {
  return sharedGeo(key, () => {
    const parts = buildParts();
    const pieces = parts.map((part) => compose(part.geo, part));
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (tint) tint(geometry);
    const seen = new Set();
    parts.forEach((part) => {
      if (part.geo.userData.shared || seen.has(part.geo)) return;
      seen.add(part.geo);
      part.geo.dispose();
    });
    return geometry;
  });
}

function roleFor(name, look) {
  const named = {
    Kai: 'kai',
    Momo: 'pink',
    '研究｜文獻研究員': 'research',
    Jun: 'dev',
    Quill: 'qa',
    Nori: 'product',
  };
  if (named[name]) return named[name];
  const color = String(look.color || '').toUpperCase();
  const byColor = {
    '#3B82F6': 'kai',
    '#F472B6': 'pink',
    '#14B8A6': 'research',
    '#22C55E': 'dev',
    '#F97316': 'qa',
    '#8B5CF6': 'product',
  };
  if (byColor[color]) return byColor[color];
  if (look.accessory === 'bow' || look.shape === 'clover') return 'pink';
  if (look.accessory === 'glasses' || look.shape === 'pill') return 'research';
  if (look.shape === 'rounded_cube' || look.shape === 'rounded_square') return 'dev';
  if (look.shape === 'cone' || look.shape === 'triangle') return 'qa';
  if (look.shape === 'hexagon' || look.shape === 'pentagon') return 'product';
  if (look.accessory === 'antenna' || look.shape === 'sphere') return 'kai';
  return ['kai', 'pink', 'research', 'dev', 'qa', 'product'][hashName(name) % 6];
}

function headGeometry(role) {
  const s = seg();
  if (role === 'pink') {
    return merged('clover-head', () => {
      const petal = new THREE.SphereGeometry(0.125, s, Math.max(12, s - 8));
      const core = new THREE.SphereGeometry(0.07, s, Math.max(10, s - 8));
      return [
        { geo: petal, x: 0.16 },
        { geo: petal, x: -0.16 },
        { geo: petal, y: 0.16 },
        { geo: petal, y: -0.16 },
        { geo: core },
      ];
    });
  }
  if (role === 'research') return sharedGeo('capsule-head', () => new THREE.CapsuleGeometry(0.29, 0.05, 8, s, 1));
  if (role === 'dev') return sharedGeo('box-head', () => new RoundedBoxGeometry(0.58, 0.54, 0.5, 3, 0.14));
  if (role === 'product') return sharedGeo('hex-head', () => new THREE.CylinderGeometry(0.34, 0.34, 0.56, 6));
  return sharedGeo('sphere-head', () => new THREE.SphereGeometry(0.3, s, Math.max(16, s - 8)));
}

function accessoryGeometry(role) {
  const s = seg();
  if (role === 'kai') {
    return merged('antenna', () => [
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.22, Math.max(8, s / 2)), y: 0.11 },
      { geo: new THREE.SphereGeometry(0.055, s, Math.max(10, s / 2)), y: 0.24 },
    ]);
  }
  if (role === 'pink') {
    return merged('bow', () => {
      const lobe = new THREE.SphereGeometry(0.045, 12, 8);
      return [
        { geo: lobe, x: -0.045, sx: 1.35, sy: 0.72, sz: 0.55 },
        { geo: lobe, x: 0.045, sx: 1.35, sy: 0.72, sz: 0.55 },
        { geo: new THREE.SphereGeometry(0.026, 10, 8) },
      ];
    });
  }
  if (role === 'research') {
    return merged('glasses-book', () => {
      const ring = new THREE.TorusGeometry(0.09, 0.016, 8, Math.max(16, s / 2));
      return [
        { geo: ring, x: -0.09, y: 0.02, z: 0.32 },
        { geo: ring, x: 0.09, y: 0.02, z: 0.32 },
        { geo: new THREE.BoxGeometry(0.08, 0.018, 0.018), y: 0.02, z: 0.32 },
        { geo: new THREE.BoxGeometry(0.24, 0.32, 0.06), x: 0.3, y: -0.4, z: 0.26, ry: -0.5 },
      ];
    }, (geometry) => paint(geometry, (x) => (x > 0.2 ? '#F3E6C4' : '#F7F7F5')));
  }
  if (role === 'dev') {
    return merged('phones-laptop', () => [
      { geo: new THREE.TorusGeometry(0.36, 0.042, 8, Math.max(16, s), Math.PI), y: 0.06 },
      { geo: new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), x: -0.34, rz: Math.PI / 2 },
      { geo: new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), x: 0.34, rz: Math.PI / 2 },
      { geo: new THREE.BoxGeometry(0.28, 0.18, 0.028), y: -0.46, z: 0.22, rx: -0.55 },
    ], (geometry) => paint(geometry, (_x, y) => (y < -0.2 ? '#EEF0F4' : '#C9CED6')));
  }
  if (role === 'qa') {
    return merged('cap-glass', () => [
      { geo: new THREE.SphereGeometry(0.16, s, Math.max(10, s / 2)), y: 0.22, sy: 0.48 },
      { geo: new THREE.CylinderGeometry(0.18, 0.18, 0.025, Math.max(12, s / 2)), y: 0.16, z: 0.08, rx: 0.4 },
      { geo: new THREE.TorusGeometry(0.11, 0.018, 8, Math.max(16, s / 2)), x: 0.36, y: -0.48, z: 0.14 },
      { geo: new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), x: 0.36, y: -0.62, z: 0.14 },
    ], (geometry) => paint(geometry, (_x, y) => (y > -0.05 ? '#D7B07A' : '#C5C9D0')));
  }
  return merged('board', () => [
    { geo: new THREE.BoxGeometry(0.22, 0.3, 0.04), x: 0.32, y: -0.48, z: 0.24, ry: -0.6 },
    { geo: new THREE.BoxGeometry(0.12, 0.05, 0.05), x: 0.3, y: -0.32, z: 0.26, ry: -0.6 },
  ], (geometry) => paint(geometry, (_x, y) => (y > -0.38 ? '#D9D3CB' : '#F4F0E8')));
}

function faceZ(role) {
  if (role === 'pink') return 0.12;
  if (role === 'research') return 0.3;
  if (role === 'dev') return 0.3;
  if (role === 'product') return 0.36;
  return 0.32;
}

const STATUS_RING = {
  working: '#34C759',
  waiting_user: '#F5A524',
  error: '#FF5A5F',
  done: '#5AA9FF',
};

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createCharacter(name, look) {
  const role = roleFor(name, look);
  const color = look.color || '#3B82F6';
  const s = seg();
  const bodyMat = vinyl(color);
  const root = new THREE.Group();
  const figure = new THREE.Group();
  const pose = new THREE.Group();
  root.add(figure);
  figure.add(pose);

  const headY = role === 'pink' ? 0.94 : role === 'research' ? 0.9 : HEAD_Y;
  const head = new THREE.Mesh(headGeometry(role), bodyMat);
  head.position.y = headY;
  if (role === 'product') head.rotation.y = Math.PI / 6;
  head.castShadow = true;
  pose.add(head);

  const body = new THREE.Mesh(sharedGeo('body', () => new THREE.CapsuleGeometry(0.2, 0.18, 6, s, 1)), bodyMat);
  body.position.y = BODY_Y;
  body.castShadow = true;
  pose.add(body);

  const handGeo = sharedGeo('hand', () => new THREE.CapsuleGeometry(0.06, 0.12, 4, Math.max(8, s / 2), 1));
  const hands = new THREE.InstancedMesh(handGeo, bodyMat, 2);
  const legGeo = sharedGeo('leg', () => new THREE.CapsuleGeometry(0.07, 0.08, 4, Math.max(8, s / 2), 1));
  const legs = new THREE.InstancedMesh(legGeo, bodyMat, 2);
  const dummy = new THREE.Object3D();
  [[-1, Math.PI - 0.5], [1, -Math.PI + 0.5]].forEach(([side, tilt], index) => {
    dummy.position.set(side * 0.28, 0.28, 0.08);
    dummy.rotation.set(0.2, 0, tilt);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    hands.setMatrixAt(index, dummy.matrix);
  });
  [[-0.1, 0.08], [0.1, 0.08]].forEach((pos, index) => {
    dummy.position.set(pos[0], 0.06, 0.12);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    legs.setMatrixAt(index, dummy.matrix);
  });
  hands.castShadow = true;
  legs.castShadow = true;
  pose.add(hands, legs);

  const eyeMat = sharedMat('eye', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.45, metalness: 0 }));
  const liteMat = sharedMat('lite', () => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const blushMat = sharedMat('blush', () => new THREE.MeshBasicMaterial({
    color: '#FF8FA3',
    transparent: true,
    opacity: 0.6,
    toneMapped: false,
    depthWrite: false,
  }));
  const smileMat = sharedMat('smile', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.5, metalness: 0 }));
  const eyeGeo = sharedGeo('eye', () => new THREE.SphereGeometry(0.04, Math.max(12, s / 2), 10));
  const shineGeo = sharedGeo('shine', () => new THREE.SphereGeometry(0.014, 8, 6));
  const face = new THREE.Group();
  const eyes = new THREE.Mesh(merged('eyes', () => [
    { geo: eyeGeo, x: -0.09 },
    { geo: eyeGeo, x: 0.09 },
  ]), eyeMat);
  face.add(eyes);
  face.add(new THREE.Mesh(merged('shines', () => [
    { geo: shineGeo, x: -0.075, y: 0.016, z: 0.034 },
    { geo: shineGeo, x: 0.105, y: 0.016, z: 0.034 },
  ]), liteMat));
  const blush = new THREE.Mesh(merged('blush', () => [
    { geo: new THREE.CircleGeometry(0.042, 16), x: -0.15, y: -0.05 },
    { geo: new THREE.CircleGeometry(0.042, 16), x: 0.15, y: -0.05 },
  ]), blushMat);
  blush.position.z = 0.012;
  const smile = new THREE.Mesh(sharedGeo('smile', () => new THREE.TorusGeometry(0.036, 0.007, 8, 16, Math.PI)), smileMat);
  smile.position.set(0, -0.075, 0.02);
  smile.rotation.z = Math.PI;
  face.add(blush, smile);
  face.position.set(0, headY + (role === 'product' ? -0.02 : 0.02), faceZ(role));
  pose.add(face);

  let propMat = bodyMat;
  if (role === 'pink') propMat = vinyl('#F7F5F2');
  else if (role !== 'kai') propMat = vinyl('#ffffff', true);
  const prop = new THREE.Mesh(accessoryGeometry(role), propMat);
  if (role === 'kai') prop.position.set(0, headY + 0.3, 0);
  else if (role === 'pink') prop.position.set(0.14, headY + 0.2, 0.08);
  else prop.position.set(0, headY, 0);
  prop.castShadow = true;
  pose.add(prop);

  const ringMat = new THREE.MeshBasicMaterial({
    color: '#34C759',
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(
    sharedGeo('status-ring', () => new THREE.RingGeometry(0.34, 0.4, seg() === 20 ? 32 : 48)),
    ringMat,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  const halo = new THREE.Mesh(
    sharedGeo('select-ring', () => new THREE.RingGeometry(0.42, 0.47, seg() === 20 ? 32 : 48)),
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
  halo.position.y = 0.028;
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
  let meshCount = 0;
  root.traverse((obj) => {
    if (obj.isMesh) meshCount += 1;
  });
  if (meshCount > 12) throw new Error(`Character uses ${meshCount} meshes`);

  return {
    root,
    figure,
    pose,
    pickRoot: pose,
    bodyMat,
    eyes,
    smile,
    ring,
    halo,
    nameTag,
    nameDot,
    stepEl,
    stepTag,
    alertTag,
    sleepTag,
    stepShown: '',
    phase: (hashName(name) % 628) / 100,
    motion: { shake: 1, mode: '', moving: false },
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

  if (!motion.ready) {
    motion.ready = true;
    motion.x = ctx.seat.x;
    motion.z = ctx.seat.z;
    visual.root.position.set(ctx.seat.x, 0.42, ctx.seat.z);
  }

  const goalX = visit ? visit.x : ctx.seat.x;
  const goalZ = visit ? visit.z : ctx.seat.z;
  const dx = goalX - motion.x;
  const dz = goalZ - motion.z;
  const dist = Math.hypot(dx, dz);
  let yaw = Math.PI / 4;
  if (!hold && dist > 0.05) {
    const step = Math.min(dist, (reduce ? dist : 1.55 * dt));
    motion.x += (dx / dist) * step;
    motion.z += (dz / dist) * step;
    yaw = Math.atan2(dx, dz);
    motion.moving = dist > 0.12;
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
  visual.root.position.y = damp(visual.root.position.y, 0.42, hold ? 18 : 8, dt);

  let yawNow = motion.yaw == null ? yaw : motion.yaw;
  let spin = yaw - yawNow;
  while (spin > Math.PI) spin -= Math.PI * 2;
  while (spin < -Math.PI) spin += Math.PI * 2;
  yawNow += spin * (1 - Math.exp(-(hold ? 18 : 8) * dt));
  motion.yaw = yawNow;
  visual.root.rotation.y = yawNow;

  if (mode === 'error' && motion.mode !== 'error') motion.shake = 0;
  motion.mode = mode;
  if (mode === 'error' && !reduce && motion.shake < 0.3) {
    motion.shake += dt;
    const u = motion.shake / 0.3;
    visual.pose.position.x = Math.sin(u * Math.PI * 2) * 0.02;
  } else {
    motion.shake = Math.max(motion.shake, 1);
    visual.pose.position.x = damp(visual.pose.position.x, 0, 10, dt);
  }

  const sway = !hold && !motion.moving && mode === 'working'
    ? Math.sin((t / 1.2) * Math.PI * 2 + phase) * (4 * Math.PI / 180)
    : 0;
  visual.pose.rotation.z = sway;

  let stretch = 1;
  if (mode === 'celebrate' && !hold && !motion.moving) {
    const age = (ctx.celebrateT || 0) * 8000;
    if (age < 400) {
      const u = age / 400;
      stretch = u < 0.45 ? 0.9 + (1.08 - 0.9) * (u / 0.45) : 1.08 + (1 - 1.08) * ((u - 0.45) / 0.55);
    }
  }
  visual.pose.scale.set(1, stretch, 1);

  const idleStill = !motion.moving && (mode === 'sleep' || mode === 'wander' || mode === 'relax');
  const blink = idleStill && !reduce && ((t + phase) % 5) < 0.12;
  visual.eyes.scale.y = blink ? 0.14 : 1;

  const hover = ctx.hovered ? 1.05 : 1;
  visual.figure.scale.setScalar(damp(visual.figure.scale.x, hover, 16, dt));

  const status = ctx.status || 'idle';
  const ringOn = Object.prototype.hasOwnProperty.call(STATUS_RING, status);
  const selected = !!ctx.selected;
  visual.ring.visible = ringOn;
  visual.halo.visible = ringOn && selected;
  if (ringOn) {
    visual.ring.material.color.set(STATUS_RING[status]);
    const scale = selected ? 1.15 : 1;
    visual.ring.scale.setScalar(scale);
    visual.halo.scale.setScalar(scale);
  }
  visual.bodyMat.emissive.set(visual.bodyMat.color);
  visual.bodyMat.emissiveIntensity = selected ? 0.12 : 0;

  visual.smile.rotation.z = mode === 'error' ? 0 : Math.PI;
  visual.smile.scale.setScalar(mode === 'celebrate' ? 1.12 : 1);

  const alertOn = mode === 'waiting';
  visual.alertTag.visible = alertOn;
  const hop = alertOn && !hold && (t % 2) < 0.35 ? Math.sin(((t % 2) / 0.35) * Math.PI) * 0.08 : 0;
  visual.alertTag.position.set(0.02, 1.28 + hop, 0);
  const step = ctx.showStep ? clip(ctx.step || '', 80) : '';
  if (visual.stepShown !== step) {
    visual.stepEl.textContent = step;
    visual.stepShown = step;
  }
  visual.stepTag.visible = Boolean(step);
  visual.stepTag.position.set(0, 1.42, 0);
  visual.sleepTag.visible = mode === 'sleep' && !motion.moving;
  visual.sleepTag.position.set(0.18, 1.24, 0);
  visual.nameTag.visible = !!ctx.showName;
  visual.nameTag.position.set(0, 1.32, 0);
  const tone = status === 'waiting_user' ? 'waiting' : status;
  visual.nameDot.className = `status-dot dot-${tone}`;
}
