import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el } from './dom.js';
import { clip, hashName } from './state.js';

const geos = new Map();

function sharedGeo(key, build) {
  let geometry = geos.get(key);
  if (!geometry) {
    geometry = build();
    geometry.userData.shared = true;
    geos.set(key, geometry);
  }
  return geometry;
}

function glossy(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
  });
}

let basics = null;
function basicLib() {
  if (basics) return basics;
  const make = (color) => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    material.userData.shared = true;
    return material;
  };
  basics = {
    eye: make('#ffffff'),
    pupil: make('#1c1917'),
    cheek: make('#fda4af'),
    mouth: make('#292524'),
  };
  basics.cheek.transparent = true;
  basics.cheek.opacity = 0.7;
  basics.cheek.depthWrite = false;
  return basics;
}

function starShape(points, outer, inner) {
  const shape = new THREE.Shape();
  const steps = points * 2;
  for (let i = 0; i < steps; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return sharedGeo(`star-${points}`, () => new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 2,
  }));
}

function buildShape(shape, material) {
  const group = new THREE.Group();
  const add = (mesh) => {
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (shape === 'sphere') {
    add(new THREE.Mesh(sharedGeo('sphere', () => new THREE.SphereGeometry(0.5, 24, 18))));
  } else if (shape === 'pill') {
    add(new THREE.Mesh(sharedGeo('pill', () => new THREE.CapsuleGeometry(0.34, 0.42, 6, 16, 1))));
  } else if (shape === 'triangle') {
    const mesh = add(new THREE.Mesh(sharedGeo('tri', () => new THREE.ConeGeometry(0.52, 0.92, 4))));
    mesh.rotation.y = Math.PI / 4;
  } else if (shape === 'cone') {
    add(new THREE.Mesh(sharedGeo('cone', () => new THREE.ConeGeometry(0.48, 0.98, 18))));
  } else if (shape === 'pentagon') {
    const mesh = add(new THREE.Mesh(sharedGeo('pent', () => new THREE.CylinderGeometry(0.5, 0.5, 0.7, 5))));
    mesh.rotation.y = Math.PI / 5;
  } else if (shape === 'hexagon') {
    const mesh = add(new THREE.Mesh(sharedGeo('hex', () => new THREE.CylinderGeometry(0.5, 0.52, 0.66, 6))));
    mesh.rotation.y = Math.PI / 6;
  } else if (shape === 'star4') {
    add(new THREE.Mesh(starShape(4, 0.62, 0.28))).position.z = -0.2;
  } else if (shape === 'star6') {
    add(new THREE.Mesh(starShape(6, 0.62, 0.34))).position.z = -0.2;
  } else if (shape === 'rounded_square') {
    add(new THREE.Mesh(sharedGeo('rsq', () => new RoundedBoxGeometry(0.92, 0.66, 0.92, 4, 0.2))));
  } else if (shape === 'clover') {
    const geo = sharedGeo('lobe', () => new THREE.SphereGeometry(0.28, 16, 12));
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const lobe = add(new THREE.Mesh(geo));
      lobe.position.set(Math.cos(angle) * 0.22, 0.38 + Math.sin(angle) * 0.22, 0);
    }
    add(new THREE.Mesh(sharedGeo('core', () => new THREE.SphereGeometry(0.2, 14, 10)))).position.y = 0.38;
  } else if (shape === 'trio') {
    const geo = sharedGeo('trio', () => new THREE.SphereGeometry(0.26, 16, 12));
    add(new THREE.Mesh(geo)).position.set(-0.2, 0.26, 0);
    add(new THREE.Mesh(geo)).position.set(0.2, 0.26, 0);
    add(new THREE.Mesh(geo)).position.set(0, 0.66, 0);
  } else {
    add(new THREE.Mesh(sharedGeo('rcube', () => new RoundedBoxGeometry(0.86, 0.8, 0.86, 4, 0.22))));
  }
  return group;
}

function groundGroup(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scalar = 0.74 / Math.max(size.y, 0.001);
  group.scale.setScalar(scalar);
  group.updateMatrixWorld(true);
  const next = new THREE.Box3().setFromObject(group);
  const center = next.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= next.min.y;
  group.position.z -= center.z;
  group.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(group);
  return {
    height: fitted.max.y,
    front: fitted.max.z,
    minX: fitted.min.x,
    maxX: fitted.max.x,
    eyeY: fitted.max.y * 0.64,
    top: fitted.max.y,
  };
}

function makeArm(material) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(sharedGeo('arm', () => new THREE.CapsuleGeometry(0.07, 0.16, 4, 8, 1)), material);
  mesh.position.y = -0.14;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function makeAccessory(kind, material) {
  const group = new THREE.Group();
  const stickMat = glossy('#44403c');
  stickMat.userData.shared = false;
  if (kind === 'antenna') {
    const stick = new THREE.Mesh(sharedGeo('stick', () => new THREE.CylinderGeometry(0.02, 0.025, 0.28, 8)), stickMat);
    stick.position.y = 0.16;
    stick.castShadow = true;
    const ball = new THREE.Mesh(sharedGeo('ball', () => new THREE.SphereGeometry(0.07, 12, 10)), material);
    ball.position.y = 0.32;
    ball.castShadow = true;
    group.add(stick, ball);
  } else if (kind === 'stem') {
    const stem = glossy('#65a30d');
    const stick = new THREE.Mesh(sharedGeo('stem', () => new THREE.CylinderGeometry(0.018, 0.024, 0.2, 6)), stem);
    stick.position.y = 0.1;
    const leaf = new THREE.Mesh(sharedGeo('leaf', () => new THREE.SphereGeometry(0.07, 10, 8)), stem);
    leaf.scale.set(1.5, 0.5, 0.7);
    leaf.position.set(0.07, 0.2, 0);
    leaf.rotation.z = -0.5;
    group.add(stick, leaf);
  } else if (kind === 'bow') {
    const bowMat = glossy(material.color.clone().offsetHSL(0.02, 0.05, 0.12));
    const petal = sharedGeo('bow', () => new THREE.SphereGeometry(0.09, 10, 8));
    const left = new THREE.Mesh(petal, bowMat);
    left.scale.set(1.3, 0.8, 0.6);
    left.position.x = -0.1;
    const right = new THREE.Mesh(petal, bowMat);
    right.scale.set(1.3, 0.8, 0.6);
    right.position.x = 0.1;
    const knot = new THREE.Mesh(sharedGeo('knot', () => new THREE.SphereGeometry(0.045, 8, 6)), bowMat);
    group.add(left, right, knot);
  } else if (kind === 'glasses') {
    const frame = glossy('#292524');
    const ring = sharedGeo('ring', () => new THREE.TorusGeometry(0.09, 0.016, 8, 16));
    const left = new THREE.Mesh(ring, frame);
    left.position.x = -0.14;
    const right = new THREE.Mesh(ring, frame);
    right.position.x = 0.14;
    const bridge = new THREE.Mesh(sharedGeo('bridge', () => new THREE.BoxGeometry(0.1, 0.02, 0.02)), frame);
    group.add(left, right, bridge);
  }
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}

function makeFace(anchors) {
  const mats = basicLib();
  const face = new THREE.Group();
  const eyeGeo = sharedGeo('eye', () => new THREE.SphereGeometry(0.085, 14, 10));
  const pupilGeo = sharedGeo('pupil', () => new THREE.SphereGeometry(0.04, 10, 8));
  const left = new THREE.Mesh(eyeGeo, mats.eye);
  left.position.set(-0.15, 0, 0);
  const right = new THREE.Mesh(eyeGeo, mats.eye);
  right.position.set(0.15, 0, 0);
  const lp = new THREE.Mesh(pupilGeo, mats.pupil);
  lp.position.set(-0.15, -0.01, 0.06);
  const rp = new THREE.Mesh(pupilGeo, mats.pupil);
  rp.position.set(0.15, -0.01, 0.06);
  const mouth = new THREE.Mesh(sharedGeo('mouth', () => new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI)), mats.mouth);
  mouth.position.y = -0.14;
  mouth.rotation.z = Math.PI;
  const cheek = sharedGeo('cheek', () => new THREE.SphereGeometry(0.035, 8, 6));
  const cl = new THREE.Mesh(cheek, mats.cheek);
  cl.position.set(-0.22, -0.06, 0.01);
  cl.scale.set(1.2, 0.7, 0.4);
  const cr = new THREE.Mesh(cheek, mats.cheek);
  cr.position.set(0.22, -0.06, 0.01);
  cr.scale.set(1.2, 0.7, 0.4);
  face.add(left, right, lp, rp, mouth, cl, cr);
  const span = Math.max(0.5, anchors.maxX - anchors.minX);
  face.scale.setScalar(THREE.MathUtils.clamp(span / 0.62, 0.78, 1.15));
  face.position.set(0, anchors.eyeY, anchors.front + 0.06);
  return { face, mouth };
}

function makeZzz() {
  const wrap = el('div', 'bubble sleep');
  ['z', 'z', 'Z'].forEach((glyph, index) => wrap.appendChild(el('span', `z z${index + 1}`, glyph)));
  return wrap;
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function loopPoint(t, area) {
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

export function createCharacter(name, look) {
  const bodyMat = glossy(look.color || '#60a5fa');
  const root = new THREE.Group();
  const pose = new THREE.Group();
  const fitted = buildShape(look.shape, bodyMat);
  const anchors = groundGroup(fitted);
  pose.add(fitted);

  const armL = makeArm(bodyMat);
  const armR = makeArm(bodyMat);
  armL.position.set(anchors.minX - 0.02, anchors.eyeY * 0.55, 0.02);
  armR.position.set(anchors.maxX + 0.02, anchors.eyeY * 0.55, 0.02);
  pose.add(armL, armR);

  const { face, mouth } = makeFace(anchors);
  pose.add(face);
  const accessory = makeAccessory(look.accessory, bodyMat);
  if (look.accessory === 'glasses') {
    accessory.position.set(0, 0, 0.1);
    face.add(accessory);
  } else if (look.accessory === 'bow') {
    accessory.position.set(anchors.maxX * 0.35, anchors.top - 0.04, 0.05);
    pose.add(accessory);
  } else if (look.accessory && look.accessory !== 'none') {
    accessory.position.set(0, anchors.top - 0.02, 0);
    pose.add(accessory);
  }
  root.add(pose);

  const nameEl = el('div', 'name-label');
  nameEl.dir = 'auto';
  const nameDot = el('span', 'status-dot');
  const nameText = el('span', 'name-text', name);
  nameEl.append(nameDot, nameText);
  const nameTag = new CSS2DObject(nameEl);
  nameTag.position.set(0, anchors.height + 0.22, 0);
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

  const sleepTag = new CSS2DObject(makeZzz());
  sleepTag.visible = false;
  root.add(sleepTag);

  root.traverse((obj) => {
    if (obj.isCSS2DObject) obj.raycast = () => {};
  });

  return {
    root,
    pose,
    pickRoot: pose,
    bodyMat,
    armL,
    armR,
    mouth,
    anchors,
    nameTag,
    nameDot,
    stepEl,
    stepTag,
    alertEl,
    alertTag,
    sleepTag,
    stepShown: '',
    phase: (hashName(name) % 628) / 100,
    motion: { yaw: 0, x: 0, z: 0, path: (hashName(name) % 100) / 100, ready: false, shake: 1, mode: '' },
  };
}

export function updateCharacter(visual, ctx) {
  const dt = Math.min(ctx.dt || 0, 0.05);
  const t = ctx.t || 0;
  const mode = ctx.mode;
  const reduce = !!ctx.reduce;
  const lambda = reduce ? 18 : 6;
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
  let targetY = 0.42;
  let yaw = 0.15;
  let rotX = 0;
  let hop = 0;

  if (mode === 'error' && motion.mode !== 'error') motion.shake = 0;
  motion.mode = mode;
  const hold = !!ctx.hold || reduce;

  if (mode === 'wander' && ctx.path && !hold) {
    motion.path += dt * 0.05;
    const ahead = loopPoint(motion.path + 0.01, ctx.path);
    const here = loopPoint(motion.path, ctx.path);
    targetX = here.x;
    targetZ = here.z;
    targetY = 0;
    yaw = Math.atan2(ahead.x - here.x, ahead.z - here.z);
  } else if (mode === 'sleep' && ctx.lounge) {
    targetX = ctx.lounge.x;
    targetZ = ctx.lounge.z;
    targetY = 0.32;
    yaw = 0.4;
    rotX = -0.55;
  } else if (mode === 'error') {
    rotX = 0.42;
    targetY = 0.4;
  } else if (mode === 'celebrate') {
    const u = ctx.celebrateT || 0;
    hop = Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * (reduce ? 0 : 0.42);
    targetY = 0.42 + hop;
  }

  motion.x = damp(motion.x, targetX, lambda, dt);
  motion.z = damp(motion.z, targetZ, lambda, dt);
  visual.root.position.x = motion.x;
  visual.root.position.z = motion.z;
  const period = mode === 'working' ? 1.8 : 2.6;
  const floatY = hold ? 0 : Math.sin((t / period) * Math.PI * 2 + phase) * 0.04;
  visual.root.position.y = damp(visual.root.position.y, targetY, lambda, dt) + floatY;
  motion.yaw = dampAngle(motion.yaw, yaw, lambda, dt);
  visual.root.rotation.y = motion.yaw;
  visual.pose.rotation.x = damp(visual.pose.rotation.x, rotX, lambda, dt);
  if (mode === 'error' && motion.shake < 0.42) {
    motion.shake += dt;
    const fade = 1 - motion.shake / 0.42;
    visual.pose.rotation.z = Math.sin(motion.shake * 36) * fade * 0.12;
  } else {
    motion.shake = Math.max(motion.shake, 1);
    visual.pose.rotation.z = damp(visual.pose.rotation.z, 0, 8, dt);
  }

  const bob = hold ? 0 : Math.sin((t / period) * Math.PI * 2 + phase);
  const squash = bob * (mode === 'working' ? 0.03 : 0.018);
  visual.pose.scale.set(1 - squash, 1 + squash + hop * 0.12, 1 - squash);

  const wave = Math.sin(t * 12 + phase);
  let alx = 0.25;
  let arx = 0.25;
  if (mode === 'working') {
    alx = -1.15 + wave * 0.38;
    arx = -1.15 + Math.sin(t * 12 + phase + 1.3) * 0.38;
  } else if (mode === 'waiting') {
    arx = -2.5;
    alx = 0.2;
  } else if (mode === 'celebrate') {
    alx = -2.2;
    arx = -2.2;
  } else if (mode === 'error') {
    alx = 0.6;
    arx = 0.7;
  }
  visual.armL.rotation.x = damp(visual.armL.rotation.x, alx, 8, dt);
  visual.armR.rotation.x = damp(visual.armR.rotation.x, arx, 8, dt);

  const smiling = mode !== 'error';
  visual.mouth.rotation.z = smiling ? Math.PI : 0;
  visual.mouth.scale.setScalar(mode === 'celebrate' ? 1.2 : 0.92);

  const height = visual.anchors.height;
  const alertOn = mode === 'waiting' || mode === 'error';
  visual.alertEl.textContent = mode === 'error' ? '×' : '!';
  visual.alertEl.className = mode === 'error' ? 'bubble bad' : 'bubble alert';
  visual.alertTag.visible = alertOn;
  visual.alertTag.position.set(0.42, height * 0.72, 0);
  const step = ctx.showStep ? clip(ctx.step || '', 80) : '';
  if (visual.stepShown !== step) {
    visual.stepEl.textContent = step;
    visual.stepShown = step;
  }
  visual.stepTag.visible = Boolean(step);
  visual.stepTag.position.set(0, height + 0.55, 0);
  visual.sleepTag.visible = mode === 'sleep';
  visual.sleepTag.position.set(0.36, height * 0.85, 0);
  visual.nameTag.visible = !!ctx.showName;
  visual.nameTag.position.set(0, height + 0.24, 0);
  const tone = ctx.status === 'waiting_user' ? 'waiting' : (ctx.status || 'idle');
  visual.nameDot.className = `status-dot dot-${tone}`;
}
