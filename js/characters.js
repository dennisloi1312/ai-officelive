import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el } from './dom.js';
import { clip, hashName } from './state.js';

const geos = new Map();
const sharedMats = new Map();
let segments = null;

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

function vinyl(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0,
  });
}

function lighter(color) {
  const next = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  next.getHSL(hsl);
  next.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.2));
  return next;
}

function compose(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const clone = geo.clone();
  clone.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  ));
  return clone;
}

function merged(key, buildParts) {
  return sharedGeo(key, () => {
    const parts = buildParts();
    const pieces = parts.map((part) => compose(
      part.geo,
      part.x,
      part.y,
      part.z,
      part.rx,
      part.ry,
      part.rz,
      part.sx,
      part.sy,
      part.sz,
    ));
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (key === 'glasses-book') {
      const pos = geometry.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 1) {
        const book = pos.getX(i) > 0.22;
        colors[i * 3] = book ? 0.96 : 0.98;
        colors[i * 3 + 1] = book ? 0.9 : 0.98;
        colors[i * 3 + 2] = book ? 0.72 : 0.97;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
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
      const petal = new THREE.SphereGeometry(0.14, s, Math.max(12, s - 8));
      const core = new THREE.SphereGeometry(0.09, s, Math.max(10, s - 8));
      return [
        { geo: petal, x: 0.18 },
        { geo: petal, x: -0.18 },
        { geo: petal, y: 0.18 },
        { geo: petal, y: -0.18 },
        { geo: core },
      ];
    });
  }
  if (role === 'research') return sharedGeo('capsule-head', () => new THREE.CapsuleGeometry(0.18, 0.34, 8, s, 1));
  if (role === 'dev') return sharedGeo('box-head', () => new RoundedBoxGeometry(0.56, 0.52, 0.5, 3, 0.12));
  if (role === 'qa') return sharedGeo('dome-head', () => new THREE.SphereGeometry(0.3, s, Math.max(10, s / 2), 0, Math.PI * 2, 0, Math.PI / 2));
  if (role === 'product') return sharedGeo('hex-head', () => new THREE.CylinderGeometry(0.3, 0.3, 0.48, 6));
  return sharedGeo('sphere-head', () => new THREE.SphereGeometry(0.3, s, Math.max(16, s - 8)));
}

function accessoryGeometry(role) {
  const s = seg();
  if (role === 'kai') {
    return merged('antenna', () => [
      { geo: new THREE.CylinderGeometry(0.018, 0.018, 0.16, Math.max(8, s / 2)), y: 0.08 },
      { geo: new THREE.SphereGeometry(0.045, s, Math.max(10, s / 2)), y: 0.18 },
    ]);
  }
  if (role === 'pink') {
    return merged('bow', () => {
      const petal = new THREE.SphereGeometry(0.07, Math.max(10, s / 2), 8);
      return [
        { geo: petal, x: -0.07, sx: 1.3, sy: 0.7, sz: 0.55 },
        { geo: petal, x: 0.07, sx: 1.3, sy: 0.7, sz: 0.55 },
        { geo: new THREE.SphereGeometry(0.035, 10, 8) },
      ];
    });
  }
  if (role === 'research') {
    return merged('glasses-book', () => {
      const ring = new THREE.TorusGeometry(0.08, 0.02, 8, Math.max(16, s / 2));
      return [
        { geo: ring, x: -0.11, z: 0.32 },
        { geo: ring, x: 0.11, z: 0.32 },
        { geo: new THREE.BoxGeometry(0.09, 0.02, 0.02), z: 0.32 },
        { geo: new THREE.BoxGeometry(0.18, 0.24, 0.05), x: 0.4, y: -0.3, z: 0.18, ry: -0.5, rz: -0.15 },
      ];
    });
  }
  if (role === 'dev') {
    return merged('phones', () => [
      { geo: new THREE.TorusGeometry(0.32, 0.04, 8, Math.max(16, s), Math.PI), y: 0.04 },
      { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), x: -0.32, rz: Math.PI / 2 },
      { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), x: 0.32, rz: Math.PI / 2 },
    ]);
  }
  if (role === 'qa') {
    return merged('glass', () => [
      { geo: new THREE.TorusGeometry(0.11, 0.02, 8, Math.max(14, s / 2)), x: 0.34, y: -0.02, z: 0.08 },
      { geo: new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8), x: 0.46, y: -0.16, rz: 0.9 },
    ]);
  }
  return merged('board', () => [
    { geo: new THREE.BoxGeometry(0.16, 0.22, 0.02), x: 0.3, y: -0.12, z: 0.08, rz: -0.15 },
    { geo: new THREE.BoxGeometry(0.1, 0.035, 0.025), x: 0.3, y: -0.02, z: 0.09, rz: -0.15 },
  ]);
}

function faceY(role) {
  if (role === 'qa') return 0.12;
  if (role === 'dev' || role === 'product') return 0.02;
  return 0;
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
  const rimMat = vinyl(lighter(color));
  rimMat.side = THREE.BackSide;

  const root = new THREE.Group();
  const figure = new THREE.Group();
  const pose = new THREE.Group();
  root.add(figure);
  figure.add(pose);

  const headGeo = headGeometry(role);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = role === 'qa' ? 0.5 : 0.62;
  head.castShadow = true;
  const rim = new THREE.Mesh(headGeo, rimMat);
  rim.position.copy(head.position);
  rim.scale.setScalar(1.03);
  rim.castShadow = false;
  pose.add(rim, head);

  const body = new THREE.Mesh(sharedGeo('body', () => new THREE.CapsuleGeometry(0.2, 0.18, 6, s, 1)), bodyMat);
  body.position.y = 0.3;
  body.castShadow = true;
  pose.add(body);

  const handGeo = sharedGeo('hand', () => new THREE.CapsuleGeometry(0.06, 0.12, 4, Math.max(8, s / 2), 1));
  const hands = new THREE.InstancedMesh(handGeo, bodyMat, 2);
  const legGeo = sharedGeo('leg', () => new THREE.CapsuleGeometry(0.07, 0.08, 4, Math.max(8, s / 2), 1));
  const legs = new THREE.InstancedMesh(legGeo, bodyMat, 2);
  const dummy = new THREE.Object3D();
  [[-0.28, 0.32, 0.04], [0.28, 0.32, 0.04]].forEach((pos, index) => {
    dummy.position.set(pos[0], pos[1], pos[2]);
    dummy.rotation.set(0, 0, index === 0 ? 0.4 : -0.4);
    dummy.updateMatrix();
    hands.setMatrixAt(index, dummy.matrix);
  });
  [[-0.09, 0.08, 0.02], [0.09, 0.08, 0.02]].forEach((pos, index) => {
    dummy.position.set(pos[0], pos[1], pos[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    legs.setMatrixAt(index, dummy.matrix);
  });
  hands.castShadow = true;
  legs.castShadow = true;
  pose.add(hands, legs);

  const eyeMat = sharedMat('eye', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.4, metalness: 0 }));
  const liteMat = sharedMat('lite', () => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const blushMat = sharedMat('blush', () => new THREE.MeshBasicMaterial({
    color: '#FF8FA3',
    transparent: true,
    opacity: 0.6,
    toneMapped: false,
    depthWrite: false,
  }));
  const smileMat = sharedMat('smile', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.45, metalness: 0 }));
  const eyeGeo = sharedGeo('eye', () => new THREE.SphereGeometry(0.055, Math.max(12, s / 2), 10));
  const shineGeo = sharedGeo('shine', () => new THREE.SphereGeometry(0.018, 8, 6));
  const face = new THREE.Group();
  face.add(new THREE.Mesh(merged('eyes', () => [
    { geo: eyeGeo, x: -0.11 },
    { geo: eyeGeo, x: 0.11 },
  ]), eyeMat));
  face.add(new THREE.Mesh(merged('shines', () => [
    { geo: shineGeo, x: -0.09, y: 0.02, z: 0.045 },
    { geo: shineGeo, x: 0.13, y: 0.02, z: 0.045 },
  ]), liteMat));
  const blush = new THREE.Mesh(merged('blush', () => [
    { geo: new THREE.CircleGeometry(0.045, 16), x: -0.16, y: -0.06 },
    { geo: new THREE.CircleGeometry(0.045, 16), x: 0.16, y: -0.06 },
  ]), blushMat);
  blush.position.z = 0.01;
  const smile = new THREE.Mesh(sharedGeo('smile', () => new THREE.TorusGeometry(0.04, 0.008, 8, 16, Math.PI)), smileMat);
  smile.position.set(0, -0.09, 0.02);
  smile.rotation.z = Math.PI;
  face.add(blush, smile);
  const faceZ = role === 'qa' || role === 'product' ? 0.34 : role === 'pink' ? 0.16 : role === 'dev' ? 0.28 : 0.24;
  face.position.set(0, head.position.y + faceY(role), faceZ);
  pose.add(face);

  let propMat = bodyMat;
  if (role === 'pink') propMat = vinyl('#F7F4F1');
  else if (role === 'dev') propMat = vinyl('#D1D5DB');
  else if (role === 'research') {
    propMat = vinyl('#ffffff');
    propMat.vertexColors = true;
  }
  else if (role !== 'kai') propMat = sharedMat('prop', () => vinyl('#F4F4F5'));
  const prop = new THREE.Mesh(accessoryGeometry(role), propMat);
  if (role === 'kai') prop.position.set(0, head.position.y + 0.28, 0);
  else if (role === 'pink') prop.position.set(0.16, head.position.y + 0.24, 0.06);
  else if (role === 'dev') prop.position.y = head.position.y;
  else prop.position.set(0, head.position.y, 0.02);
  prop.castShadow = true;
  pose.add(prop);

  const ring = new THREE.Mesh(
    sharedGeo('status-ring', () => new THREE.RingGeometry(0.34, 0.4, seg() === 20 ? 32 : 48)),
    new THREE.MeshStandardMaterial({ color: '#34C759', roughness: 0.5, metalness: 0, emissive: '#34C759', emissiveIntensity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.visible = false;
  root.add(ring);

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

  const sleepTag = new CSS2DObject((() => {
    const wrap = el('div', 'bubble sleep');
    ['z', 'z', 'Z'].forEach((glyph, index) => wrap.appendChild(el('span', `z z${index + 1}`, glyph)));
    return wrap;
  })());
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
    smile,
    ring,
    nameTag,
    nameDot,
    stepEl,
    stepTag,
    alertTag,
    sleepTag,
    stepShown: '',
    phase: (hashName(name) % 628) / 100,
    motion: { shake: 1, mode: '' },
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

  if (!motion.ready) {
    motion.ready = true;
    motion.x = ctx.seat.x;
    motion.z = ctx.seat.z;
    visual.root.position.set(ctx.seat.x, 0.42, ctx.seat.z);
  }

  let targetX = ctx.seat.x;
  let targetZ = ctx.seat.z;
  let yaw = 0.15;
  if (mode === 'wander' && ctx.path && !hold) {
    motion.path = (motion.path || 0) + dt * 0.045;
    const here = pointOn(motion.path, ctx.path);
    const ahead = pointOn(motion.path + 0.012, ctx.path);
    targetX = here.x;
    targetZ = here.z;
    yaw = Math.atan2(ahead.x - here.x, ahead.z - here.z);
  } else if (mode === 'sleep' && ctx.lounge) {
    targetX = ctx.lounge.x;
    targetZ = ctx.lounge.z;
    yaw = 0.35;
  }

  const lambda = reduce ? 18 : 6;
  motion.x = damp(motion.x, targetX, lambda, dt);
  motion.z = damp(motion.z, targetZ, lambda, dt);
  visual.root.position.x = motion.x;
  visual.root.position.z = motion.z;
  const floatY = hold || mode === 'wander' ? 0 : Math.sin((t / 3) * Math.PI * 2 + phase) * 0.02;
  visual.root.position.y = damp(visual.root.position.y, 0.42, lambda, dt) + floatY;

  let yawNow = motion.yaw == null ? yaw : motion.yaw;
  let spin = yaw - yawNow;
  while (spin > Math.PI) spin -= Math.PI * 2;
  while (spin < -Math.PI) spin += Math.PI * 2;
  yawNow += spin * (1 - Math.exp(-lambda * dt));
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

  const sway = !hold && mode === 'working' ? Math.sin((t / 1.2) * Math.PI * 2 + phase) * (4 * Math.PI / 180) : 0;
  visual.pose.rotation.z = sway;

  let stretch = 1;
  if (mode === 'celebrate' && !hold) {
    const age = (ctx.celebrateT || 0) * 8000;
    if (age < 400) {
      const u = age / 400;
      stretch = u < 0.45 ? 0.9 + (1.08 - 0.9) * (u / 0.45) : 1.08 + (1 - 1.08) * ((u - 0.45) / 0.55);
    }
  }
  visual.pose.scale.set(1, stretch, 1);

  const hover = ctx.hovered ? 1.05 : 1;
  const nextScale = damp(visual.figure.scale.x, hover, 16, dt);
  visual.figure.scale.setScalar(nextScale);

  const status = ctx.status || 'idle';
  const ringOn = Object.prototype.hasOwnProperty.call(STATUS_RING, status);
  visual.ring.visible = ringOn;
  if (ringOn) {
    visual.ring.material.color.set(STATUS_RING[status]);
    visual.ring.material.emissive.set(STATUS_RING[status]);
    const selected = !!ctx.selected;
    visual.ring.scale.setScalar(selected ? 1.15 : 1);
    visual.ring.material.emissiveIntensity = selected ? 0.15 : 0;
  }
  visual.bodyMat.emissive.set(colorOf(visual.bodyMat));
  visual.bodyMat.emissiveIntensity = ctx.selected ? 0.15 : 0;

  visual.smile.rotation.z = mode === 'error' ? 0 : Math.PI;
  visual.smile.scale.setScalar(mode === 'celebrate' ? 1.15 : 1);

  const alertOn = mode === 'waiting';
  visual.alertTag.visible = alertOn;
  const hop = alertOn && !hold && (t % 2) < 0.35 ? Math.sin(((t % 2) / 0.35) * Math.PI) * 0.08 : 0;
  visual.alertTag.position.set(0.02, 1.05 + hop, 0);
  const step = ctx.showStep ? clip(ctx.step || '', 80) : '';
  if (visual.stepShown !== step) {
    visual.stepEl.textContent = step;
    visual.stepShown = step;
  }
  visual.stepTag.visible = Boolean(step);
  visual.stepTag.position.set(0, 1.18, 0);
  visual.sleepTag.visible = mode === 'sleep';
  visual.sleepTag.position.set(0.22, 1.02, 0);
  visual.nameTag.visible = !!ctx.showName;
  visual.nameTag.position.set(0, 1.08, 0);
  const tone = status === 'waiting_user' ? 'waiting' : status;
  visual.nameDot.className = `status-dot dot-${tone}`;
}

function colorOf(material) {
  return material.color;
}

function pointOn(t, area) {
  const w = area.maxX - area.minX;
  const d = area.maxZ - area.minZ;
  const perim = 2 * (w + d);
  let dist = ((t % 1) + 1) % 1 * perim;
  if (dist < w) return { x: area.minX + dist, z: area.minZ };
  dist -= w;
  if (dist < d) return { x: area.maxX, z: area.minZ + dist };
  dist -= d;
  if (dist < w) return { x: area.maxX - dist, z: area.maxZ };
  dist -= w;
  return { x: area.minX, z: area.maxZ - dist };
}
