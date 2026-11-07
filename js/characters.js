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

let gradientMap = null;
let sharedMats = null;

function toonGradient() {
  if (gradientMap) return gradientMap;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ['#8f887f', '#c2bbb2', '#eee8e1', '#ffffff'].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index, 0, 1, 1);
  });
  gradientMap = new THREE.CanvasTexture(canvas);
  gradientMap.colorSpace = THREE.NoColorSpace;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.userData.shared = true;
  return gradientMap;
}

function toon(color) {
  const material = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
  return material;
}

function library() {
  if (sharedMats) return sharedMats;
  const map = toonGradient();
  const make = (color) => {
    const material = new THREE.MeshToonMaterial({ color, gradientMap: map });
    material.userData.shared = true;
    return material;
  };
  const basic = (color) => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    material.userData.shared = true;
    return material;
  };
  sharedMats = {
    eye: basic('#fffdf8'),
    pupil: basic('#241c18'),
    cheek: basic('#ff9db8'),
    mouth: basic('#3a2e2a'),
    lid: basic('#2a241f'),
    glasses: basic('#2c2825'),
    stem: make('#6aaa4f'),
    leaf: make('#8bc46a'),
    stick: basic('#3d342c'),
    sparkle: null,
  };
  sharedMats.cheek.transparent = true;
  sharedMats.cheek.opacity = 0.55;
  sharedMats.cheek.depthWrite = false;
  return sharedMats;
}

function blobTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  glow.addColorStop(0, 'rgba(50, 36, 24, 0.38)');
  glow.addColorStop(1, 'rgba(50, 36, 24, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.shared = true;
  return texture;
}

let blobMap = null;
let blobMat = null;

function sharedBlobMaterial() {
  if (!blobMap) blobMap = blobTexture();
  if (!blobMat) {
    blobMat = new THREE.MeshBasicMaterial({
      map: blobMap,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    blobMat.userData.shared = true;
  }
  return blobMat;
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
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 1,
    curveSegments: 1,
  }));
}

function buildShape(shape) {
  const mats = library();
  const group = new THREE.Group();
  const add = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (shape === 'sphere') {
    add(new THREE.Mesh(sharedGeo('sphere', () => new THREE.SphereGeometry(0.5, 10, 8)), mats.eye));
  } else if (shape === 'rounded_cube') {
    add(new THREE.Mesh(sharedGeo('rcube', () => new RoundedBoxGeometry(0.86, 0.86, 0.86, 2, 0.18)), mats.eye));
  } else if (shape === 'pill') {
    add(new THREE.Mesh(sharedGeo('pill', () => new THREE.CapsuleGeometry(0.32, 0.42, 3, 8, 1)), mats.eye));
  } else if (shape === 'triangle') {
    const mesh = add(new THREE.Mesh(sharedGeo('tri', () => new THREE.ConeGeometry(0.52, 0.96, 3)), mats.eye));
    mesh.rotation.y = Math.PI / 6;
  } else if (shape === 'cone') {
    add(new THREE.Mesh(sharedGeo('cone', () => new THREE.ConeGeometry(0.48, 1, 7)), mats.eye));
  } else if (shape === 'pentagon') {
    const mesh = add(new THREE.Mesh(sharedGeo('pent', () => new THREE.CylinderGeometry(0.5, 0.5, 0.72, 5)), mats.eye));
    mesh.rotation.y = Math.PI / 5;
  } else if (shape === 'hexagon') {
    const mesh = add(new THREE.Mesh(sharedGeo('hex', () => new THREE.CylinderGeometry(0.5, 0.52, 0.68, 6)), mats.eye));
    mesh.rotation.y = Math.PI / 6;
  } else if (shape === 'star4') {
    const mesh = add(new THREE.Mesh(starShape(4, 0.62, 0.28), mats.eye));
    mesh.position.z = -0.17;
  } else if (shape === 'star6') {
    const mesh = add(new THREE.Mesh(starShape(6, 0.62, 0.34), mats.eye));
    mesh.position.z = -0.17;
  } else if (shape === 'rounded_square') {
    add(new THREE.Mesh(sharedGeo('rsq', () => new RoundedBoxGeometry(0.92, 0.62, 0.92, 2, 0.16)), mats.eye));
  } else if (shape === 'clover') {
    const geo = sharedGeo('lobe', () => new THREE.SphereGeometry(0.28, 8, 6));
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const lobe = add(new THREE.Mesh(geo, mats.eye));
      lobe.position.set(Math.cos(angle) * 0.24, 0.36 + Math.sin(angle) * 0.24, 0);
    }
    const core = add(new THREE.Mesh(sharedGeo('core', () => new THREE.SphereGeometry(0.2, 8, 6)), mats.eye));
    core.position.y = 0.36;
  } else if (shape === 'trio') {
    const geo = sharedGeo('trio', () => new THREE.SphereGeometry(0.26, 8, 6));
    const left = add(new THREE.Mesh(geo, mats.eye));
    left.position.set(-0.22, 0.26, 0);
    const right = add(new THREE.Mesh(geo, mats.eye));
    right.position.set(0.22, 0.26, 0);
    const top = add(new THREE.Mesh(geo, mats.eye));
    top.position.set(0, 0.66, 0);
  } else {
    add(new THREE.Mesh(sharedGeo('rcube', () => new RoundedBoxGeometry(0.86, 0.86, 0.86, 2, 0.18)), mats.eye));
  }
  return group;
}

function groundGroup(group) {
  group.updateMatrixWorld(true);
  const first = new THREE.Box3().setFromObject(group);
  const size = first.getSize(new THREE.Vector3());
  const scalar = 0.86 / Math.max(size.y, 0.001);
  group.scale.setScalar(scalar);
  group.updateMatrixWorld(true);
  const next = new THREE.Box3().setFromObject(group);
  const center = next.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= next.min.y;
  group.position.z -= center.z;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return {
    height: box.max.y - box.min.y,
    front: box.max.z,
    minX: box.min.x,
    maxX: box.max.x,
    eyeY: box.max.y * 0.66,
    top: box.max.y,
  };
}

function paint(group, material) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.material = material;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function makeArm(material) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(
    sharedGeo('arm', () => new THREE.CapsuleGeometry(0.075, 0.2, 2, 6, 1)),
    material,
  );
  mesh.position.y = -0.16;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function makeAccessory(kind, material) {
  const mats = library();
  const group = new THREE.Group();
  if (kind === 'antenna') {
    const stick = new THREE.Mesh(sharedGeo('stick', () => new THREE.CylinderGeometry(0.02, 0.028, 0.36, 5)), mats.stick);
    stick.position.y = 0.2;
    stick.castShadow = true;
    const ball = new THREE.Mesh(sharedGeo('ball', () => new THREE.SphereGeometry(0.08, 8, 6)), material);
    ball.position.y = 0.42;
    ball.castShadow = true;
    group.add(stick, ball);
  } else if (kind === 'stem') {
    const stick = new THREE.Mesh(sharedGeo('stem-stick', () => new THREE.CylinderGeometry(0.018, 0.024, 0.22, 5)), mats.stem);
    stick.position.y = 0.12;
    const leaf = new THREE.Mesh(sharedGeo('leaf', () => new THREE.SphereGeometry(0.08, 6, 5)), mats.leaf);
    leaf.scale.set(1.4, 0.55, 0.8);
    leaf.position.set(0.08, 0.24, 0);
    leaf.rotation.z = -0.6;
    group.add(stick, leaf);
  } else if (kind === 'bow') {
    const bowMat = toon(material.color.clone().offsetHSL(0.04, 0.05, 0.18));
    const petal = sharedGeo('bow', () => new THREE.ConeGeometry(0.1, 0.2, 4));
    const left = new THREE.Mesh(petal, bowMat);
    left.rotation.z = Math.PI / 2;
    left.position.x = -0.1;
    const right = new THREE.Mesh(petal, bowMat);
    right.rotation.z = -Math.PI / 2;
    right.position.x = 0.1;
    const knot = new THREE.Mesh(sharedGeo('knot', () => new THREE.SphereGeometry(0.05, 6, 5)), bowMat);
    group.add(left, right, knot);
  } else if (kind === 'glasses') {
    const ring = sharedGeo('ring', () => new THREE.TorusGeometry(0.105, 0.02, 6, 12));
    const left = new THREE.Mesh(ring, mats.glasses);
    left.position.x = -0.16;
    const right = new THREE.Mesh(ring, mats.glasses);
    right.position.x = 0.16;
    const bridge = new THREE.Mesh(sharedGeo('bridge', () => new THREE.BoxGeometry(0.1, 0.02, 0.02)), mats.glasses);
    group.add(left, right, bridge);
  }
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}

function makeFace() {
  const mats = library();
  const face = new THREE.Group();
  const eyeGeo = sharedGeo('eye', () => new THREE.SphereGeometry(0.095, 8, 6));
  const pupilGeo = sharedGeo('pupil', () => new THREE.SphereGeometry(0.048, 7, 5));
  const left = new THREE.Mesh(eyeGeo, mats.eye);
  left.position.x = -0.16;
  const right = new THREE.Mesh(eyeGeo, mats.eye);
  right.position.x = 0.16;
  const lp = new THREE.Mesh(pupilGeo, mats.pupil);
  lp.position.set(-0.16, -0.008, 0.078);
  const rp = new THREE.Mesh(pupilGeo, mats.pupil);
  rp.position.set(0.16, -0.008, 0.078);
  const shine = sharedGeo('shine', () => new THREE.SphereGeometry(0.02, 5, 4));
  const ls = new THREE.Mesh(shine, mats.eye);
  ls.position.set(-0.14, 0.028, 0.09);
  const rs = new THREE.Mesh(shine, mats.eye);
  rs.position.set(0.18, 0.028, 0.09);
  const cheekGeo = sharedGeo('cheek', () => new THREE.SphereGeometry(0.04, 6, 5));
  const cl = new THREE.Mesh(cheekGeo, mats.cheek);
  cl.position.set(-0.24, -0.07, 0.02);
  cl.scale.set(1.3, 0.8, 0.5);
  const cr = new THREE.Mesh(cheekGeo, mats.cheek);
  cr.position.set(0.24, -0.07, 0.02);
  cr.scale.set(1.3, 0.8, 0.5);
  const mouth = new THREE.Mesh(sharedGeo('mouth', () => new THREE.TorusGeometry(0.07, 0.018, 4, 8, Math.PI)), mats.mouth);
  mouth.position.y = -0.16;
  mouth.rotation.z = Math.PI;
  const lidGeo = sharedGeo('lid', () => new THREE.BoxGeometry(0.15, 0.035, 0.04));
  const lidL = new THREE.Mesh(lidGeo, mats.lid);
  lidL.position.set(-0.16, 0.07, 0.06);
  lidL.visible = false;
  const lidR = new THREE.Mesh(lidGeo, mats.lid);
  lidR.position.set(0.16, 0.07, 0.06);
  lidR.visible = false;
  face.add(left, right, lp, rp, ls, rs, cl, cr, mouth, lidL, lidR);
  return { face, mouth, pupils: [lp, rp], lids: [lidL, lidR] };
}

function makeZzz() {
  const wrap = el('div', 'bubble sleep');
  ['z', 'z', 'Z'].forEach((glyph, index) => {
    const span = el('span', `z z${index + 1}`, glyph);
    wrap.appendChild(span);
  });
  wrap.style.display = 'none';
  return wrap;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

export function createCharacter(name, look) {
  const mats = library();
  const bodyMat = toon(look.color || '#7BA7C9');
  const root = new THREE.Group();
  const pose = new THREE.Group();
  const fitted = buildShape(look.shape);
  paint(fitted, bodyMat);
  const anchors = groundGroup(fitted);
  pose.add(fitted);

  const armL = makeArm(bodyMat);
  const armR = makeArm(bodyMat);
  armL.position.set(anchors.minX - 0.02, anchors.eyeY * 0.78, anchors.front * 0.05);
  armR.position.set(anchors.maxX + 0.02, anchors.eyeY * 0.78, anchors.front * 0.05);
  pose.add(armL, armR);

  const { face, mouth, pupils, lids } = makeFace();
  const faceScale = THREE.MathUtils.clamp((anchors.maxX - anchors.minX) / 0.62, 0.62, 1.05);
  face.scale.setScalar(faceScale);
  face.position.set(0, anchors.eyeY, anchors.front + 0.1);
  pose.add(face);

  const accessory = makeAccessory(look.accessory, bodyMat);
  if (look.accessory === 'glasses') {
    accessory.position.set(0, 0, 0.12);
    face.add(accessory);
  } else if (look.accessory === 'bow') {
    accessory.position.set(anchors.maxX * 0.45, anchors.top - 0.02, anchors.front * 0.2);
    pose.add(accessory);
  } else if (look.accessory === 'antenna' || look.accessory === 'stem') {
    accessory.position.set(0, anchors.top - 0.02, 0);
    pose.add(accessory);
  } else {
    pose.add(accessory);
  }
  root.add(pose);

  const blob = new THREE.Mesh(sharedGeo('blob', () => new THREE.CircleGeometry(0.42, 16)), sharedBlobMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.025;
  blob.scale.setScalar(THREE.MathUtils.clamp((anchors.maxX - anchors.minX) * 1.5, 0.7, 1.3));
  root.add(blob);

  const sparkleMat = new THREE.MeshBasicMaterial({
    color: '#ffe08a',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
  });
  const sparkles = new THREE.Group();
  const sparkGeo = sharedGeo('spark', () => new THREE.OctahedronGeometry(0.055, 0));
  for (let i = 0; i < 6; i += 1) {
    const bit = new THREE.Mesh(sparkGeo, sparkleMat);
    bit.visible = false;
    bit.userData.i = i;
    sparkles.add(bit);
  }
  root.add(sparkles);

  const nameEl = el('div', 'name-label', name);
  nameEl.dir = 'auto';
  const nameTag = new CSS2DObject(nameEl);
  nameTag.position.set(0, anchors.height + 0.22, 0);
  root.add(nameTag);

  const stepEl = el('div', 'bubble step');
  stepEl.dir = 'auto';
  stepEl.style.display = 'none';
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
  blob.raycast = () => {};
  sparkles.traverse((obj) => {
    obj.raycast = () => {};
  });

  return {
    root,
    pose,
    pickRoot: pose,
    bodyMat,
    armL,
    armR,
    accessory,
    wobble: look.accessory === 'antenna' || look.accessory === 'stem',
    face,
    mouth,
    pupils,
    lids,
    blob,
    sparkles,
    sparkleMat,
    anchors,
    nameTag,
    stepEl,
    stepTag,
    alertEl,
    alertTag,
    sleepTag,
    stepShown: '',
    phase: (hashName(name) % 628) / 100,
    motion: { yaw: 0.8, wx: 0, wz: 0, tx: 0, tz: 0, wait: 0, ready: false },
  };
}

export function updateCharacter(visual, ctx) {
  const { dt, t, mode, reduce } = ctx;
  const k = reduce ? 1 : 1 - Math.exp(-3.4 * dt);
  const motion = visual.motion;
  const phase = visual.phase;

  if (!motion.ready) {
    motion.ready = true;
    motion.wx = visual.root.position.x;
    motion.wz = visual.root.position.z;
    motion.tx = motion.wx;
    motion.tz = motion.wz;
  }

  let targetX = ctx.seat.x;
  let targetZ = ctx.seat.z;
  let targetY = 0.4;
  let yaw = motion.yaw;
  let rotX = 0;
  let rotZ = 0;

  const world = new THREE.Vector3();
  visual.root.getWorldPosition(world);
  const faceYaw = Math.atan2(ctx.camera.position.x - world.x, ctx.camera.position.z - world.z);

  if (mode === 'wander') {
    if (visual.lastMode !== 'wander') {
      motion.wx = visual.root.position.x;
      motion.wz = visual.root.position.z;
      motion.tx = motion.wx;
      motion.tz = motion.wz;
      motion.wait = 0.3;
    }
    const area = ctx.wander;
    if (motion.wait > 0) motion.wait -= dt;
    const dx = motion.tx - motion.wx;
    const dz = motion.tz - motion.wz;
    const dist = Math.hypot(dx, dz);
    if (motion.wait <= 0 && dist < 0.08) {
      motion.tx = THREE.MathUtils.lerp(area.minX, area.maxX, Math.random());
      motion.tz = THREE.MathUtils.lerp(area.minZ, area.maxZ, Math.random());
      motion.wait = reduce ? 0 : 0.6 + Math.random() * 1.8;
    } else if (dist >= 0.08 && motion.wait <= 0) {
      const step = Math.min(dist, (reduce ? 2.2 : 0.85) * dt);
      motion.wx += (dx / dist) * step;
      motion.wz += (dz / dist) * step;
      yaw = Math.atan2(dx, dz);
    }
    targetX = motion.wx;
    targetZ = motion.wz;
    targetY = Math.abs(Math.sin(t * 8 + phase)) * (reduce ? 0 : 0.045);
  } else if (mode === 'sleep') {
    targetX = ctx.sleep.x;
    targetZ = ctx.sleep.z;
    targetY = ctx.sleep.y;
    yaw = faceYaw;
    rotX = -1.15;
  } else {
    yaw = mode === 'relax' ? faceYaw + Math.sin(t * 0.7 + phase) * (reduce ? 0 : 0.45) : faceYaw;
    const breathe = reduce ? 0 : Math.sin(t * 2.1 + phase) * 0.018;
    targetY = 0.4 + breathe;
    if (mode === 'error') rotX = 0.5;
    if (mode === 'celebrate') {
      const hop = Math.abs(Math.sin(ctx.celebrateT * Math.PI * 3)) * (1 - ctx.celebrateT) * (reduce ? 0 : 0.5);
      targetY = 0.4 + hop;
    }
  }

  visual.root.position.x = lerp(visual.root.position.x, targetX, k);
  visual.root.position.z = lerp(visual.root.position.z, targetZ, k);
  visual.root.position.y = lerp(visual.root.position.y, targetY, k);
  motion.yaw = lerpAngle(motion.yaw, yaw, k);
  visual.root.rotation.y = motion.yaw;

  visual.pose.rotation.x = lerp(visual.pose.rotation.x, rotX, k);
  visual.pose.rotation.z = lerp(visual.pose.rotation.z, rotZ, k);
  visual.blob.position.y = -visual.root.position.y + 0.03;

  const wave = Math.sin(t * 13 + phase);
  let alx = 0.2;
  let arx = 0.2;
  let alz = 0.15;
  let arz = -0.15;
  if (mode === 'working') {
    alx = -1.05 + wave * 0.42;
    arx = -1.05 + Math.sin(t * 13 + phase + 1.4) * 0.42;
  } else if (mode === 'waiting') {
    arx = -2.55;
    arz = -0.25;
    alx = 0.25;
  } else if (mode === 'celebrate') {
    alx = -2.35;
    arx = -2.35;
    alz = 0.35;
    arz = -0.35;
  } else if (mode === 'error') {
    alx = 0.55;
    arx = 0.7;
  } else if (mode === 'sleep') {
    alx = 0.3;
    arx = 0.3;
  }

  visual.armL.rotation.x = lerp(visual.armL.rotation.x, alx, k);
  visual.armR.rotation.x = lerp(visual.armR.rotation.x, arx, k);
  visual.armL.rotation.z = lerp(visual.armL.rotation.z, alz, k);
  visual.armR.rotation.z = lerp(visual.armR.rotation.z, arz, k);

  if (visual.wobble) {
    visual.accessory.rotation.z = reduce ? 0 : Math.sin(t * 2.4 + phase) * 0.18;
  }

  const sleeping = mode === 'sleep';
  for (const lid of visual.lids) {
    lid.visible = sleeping;
    lid.position.y = sleeping ? 0.012 : 0.07;
  }
  for (const pupil of visual.pupils) {
    pupil.position.y = sleeping ? -0.02 : mode === 'error' ? -0.03 : -0.01;
  }
  if (mode === 'error') {
    visual.mouth.rotation.z = 0;
    visual.mouth.scale.setScalar(0.85);
  } else if (mode === 'celebrate') {
    visual.mouth.rotation.z = Math.PI;
    visual.mouth.scale.setScalar(1.25);
  } else if (sleeping) {
    visual.mouth.rotation.z = Math.PI;
    visual.mouth.scale.set(1, 0.35, 1);
  } else {
    visual.mouth.rotation.z = Math.PI;
    visual.mouth.scale.setScalar(0.9);
  }

  const fade = ctx.fade == null ? 1 : ctx.fade;
  const transparent = fade < 0.999;
  if (visual.bodyMat.transparent !== transparent) {
    visual.bodyMat.transparent = transparent;
    visual.bodyMat.needsUpdate = true;
  }
  visual.bodyMat.opacity = fade;

  const height = visual.anchors.height;
  const alertOn = mode === 'waiting' || mode === 'error';
  visual.alertEl.textContent = mode === 'error' ? '×' : '!';
  visual.alertEl.className = mode === 'error' ? 'bubble bad' : 'bubble alert';
  visual.alertTag.visible = alertOn;
  visual.alertTag.position.set(0.62, height * 0.62, 0);

  const step = ctx.showStep ? clip(ctx.step || '', 80) : '';
  if (visual.stepShown !== step) {
    visual.stepEl.textContent = step;
    visual.stepShown = step;
  }
  visual.stepTag.visible = Boolean(step);
  visual.stepTag.position.set(0, height + (alertOn ? 0.98 : 0.66), 0);
  visual.sleepTag.visible = sleeping;
  visual.sleepTag.position.set(0.55, height * 0.78, 0);
  visual.nameTag.visible = ctx.showName !== false;
  visual.nameTag.position.set(0, height + 0.24, 0);

  const celebrating = mode === 'celebrate';
  visual.sparkles.children.forEach((bit) => {
    const u = ctx.celebrateT || 0;
    const angle = (bit.userData.i / 6) * Math.PI * 2 + u * 5;
    const radius = 0.12 + u * 0.85;
    bit.position.set(Math.cos(angle) * radius, 0.4 + u * 1.15, Math.sin(angle) * radius);
    bit.visible = celebrating;
    bit.rotation.y = t * 3;
  });
  visual.sparkleMat.opacity = celebrating ? 1 - (ctx.celebrateT || 0) : 0;
  visual.lastMode = mode;

  const pulse = mode === 'waiting' && !reduce ? 1 + Math.sin(t * 3.3) * 0.03 : 1;
  visual.pose.scale.setScalar(pulse);
}
