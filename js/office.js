import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createCharacter, updateCharacter } from './characters.js';
import { addKaiOffice, addMeetingTable, addWallArt } from './rooms.js';
import { DONE_MS, floorPlan, lookFor, presentBot, visualMode } from './state.js';

const W = 13.5;
const D = 10.2;
const BASE = 0.62;
const ROOM = 3.25;
const SLAB = BASE;
const OPEN = BASE + ROOM;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** cubic-bezier(0.65, 0, 0.35, 1), the floor-change curve. */
function easeInOut(t) {
  const x1 = 0.65;
  const y1 = 0;
  const x2 = 0.35;
  const y2 = 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u) => ((ay * u + by) * u + cy) * u;
  const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const dx = sampleDX(u);
    if (Math.abs(dx) < 1e-5) break;
    u -= (sampleX(u) - t) / dx;
  }
  return sampleY(Math.min(1, Math.max(0, u)));
}

function shade(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, cast = true) {
  return shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), cast);
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((obj) => {
    if (obj.element && obj.element.remove) obj.element.remove();
    if (obj.geometry && !obj.geometry.userData?.shared) geometries.add(obj.geometry);
    const list = obj.material == null ? [] : (Array.isArray(obj.material) ? obj.material : [obj.material]);
    for (const material of list) {
      if (!material.userData?.shared) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function makeMaterials() {
  const std = (color, roughness = 0.72) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    material.userData.shared = true;
    return material;
  };
  const glass = new THREE.MeshStandardMaterial({
    color: '#e7eef6',
    roughness: 0.08,
    metalness: 0.02,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  glass.userData.shared = true;
  glass.side = THREE.DoubleSide;
  const hairline = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12 });
  hairline.userData.shared = true;
  const   band = new THREE.MeshStandardMaterial({
    color: '#2B2B2E',
    roughness: 0.35,
    metalness: 0.18,
  });
  band.userData.shared = true;
  return {
    shell: std('#FAFAF8', 0.78),
    floor: std('#EDEDEA', 0.84),
    band,
    white: std('#FAFAF8', 0.7),
    desk: std('#EFE7D6', 0.62),
    sofa: std('#F7F6F3', 0.72),
    leg: std('#E7E4DE', 0.55),
    mullion: std('#FAFAF8', 0.4),
    laptop: std('#2B2B2E', 0.42),
    glass,
    hairline,
    leaf: std('#6FAE4F', 0.55),
    leafDark: std('#4F8F3A', 0.5),
    ground: std('#E6E6E3', 0.96),
    books: ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'].map((color) => std(color, 0.6)),
  };
}

function addPlant(parent, mats, x, z, scale) {
  const group = new THREE.Group();
  const pot = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.16 * scale, 0.18 * scale, 18), mats.desk));
  pot.position.y = 0.09 * scale;
  const lip = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.2 * scale, 0.05 * scale, 18), mats.white));
  lip.position.y = 0.18 * scale;
  const trunk = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 0.16 * scale, 8), mats.leg));
  trunk.position.y = 0.26 * scale;
  const crown = shade(new THREE.Mesh(new THREE.SphereGeometry(0.11 * scale, 14, 10), mats.leaf));
  crown.position.y = 0.38 * scale;
  const bud = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07 * scale, 10, 8), mats.leafDark));
  bud.position.set(0.08 * scale, 0.34 * scale, 0.04 * scale);
  group.add(pot, lip, trunk, crown, bud);
  group.position.set(x, 0, z);
  parent.add(group);
}

function addCurtain(parent, mats, width, height, x, z, rotY) {
  const wall = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mats.glass);
  pane.position.y = height / 2;
  const points = [];
  const cols = Math.max(2, Math.round(width / 2.4));
  for (let i = 0; i <= cols; i += 1) {
    const px = -width / 2 + (i * width) / cols;
    points.push(px, 0, 0, px, height, 0);
  }
  points.push(-width / 2, height * 0.55, 0, width / 2, height * 0.55, 0);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
    mats.hairline,
  );
  wall.add(pane, lines);
  wall.position.set(x, 0, z);
  wall.rotation.y = rotY;
  parent.add(wall);
}

function addDeskRow(parent, mats, z, opts = {}) {
  const count = opts.count ?? 4;
  const gap = opts.gap ?? 2.15;
  const origin = opts.origin ?? -3.5;
  const seats = [];
  for (let i = 0; i < count; i += 1) {
    const x = origin + i * gap;
    const stool = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.42, 22), mats.white));
    stool.position.set(x, 0.21, z - 1.35);
    parent.add(stool);
    const base = box(0.46, 0.025, 0.3, mats.laptop, false);
    base.position.set(x, 0.79, z + 0.05);
    const screenMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      emissive: '#0f172a',
      emissiveIntensity: 0.35,
      roughness: 0.45,
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.02), screenMat);
    screen.position.set(x, 0.96, z - 0.32);
    screen.castShadow = false;
    parent.add(base, screen);
    if (i % 2 === 0) {
      const mug = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.08, 10), mats.white), false);
      mug.position.set(x + 0.28, 0.82, z + 0.22);
      parent.add(mug);
    } else {
      const pad = box(0.22, 0.02, 0.16, mats.leg, false);
      pad.position.set(x - 0.22, 0.8, z + 0.18);
      parent.add(pad);
    }
    seats.push({ x, z: z - 1.35, screenMat });
  }
  const x0 = origin - 0.85;
  const x1 = origin + (count - 1) * gap + 0.85;
  const top = box(x1 - x0, 0.07, 1.05, mats.desk);
  top.position.set((x0 + x1) / 2, 0.74, z);
  parent.add(top);
  for (const x of [x0 + 0.15, (x0 + x1) / 2, x1 - 0.15]) {
    const leg = box(0.07, 0.74, 0.07, mats.leg);
    leg.position.set(x, 0.37, z);
    parent.add(leg);
  }
  return seats;
}

function addSofa(parent, mats, x, z, rot) {
  const group = new THREE.Group();
  const seat = box(1.55, 0.28, 0.62, mats.sofa);
  seat.position.y = 0.24;
  const back = box(1.55, 0.46, 0.14, mats.sofa);
  back.position.set(0, 0.52, -0.24);
  const armL = box(0.12, 0.32, 0.62, mats.sofa);
  armL.position.set(-0.78, 0.36, 0);
  const armR = box(0.12, 0.32, 0.62, mats.sofa);
  armR.position.set(0.78, 0.36, 0);
  group.add(seat, back, armL, armR);
  group.position.set(x, 0, z);
  group.rotation.y = rot || 0;
  parent.add(group);
}

function addShelf(parent, mats, x, z, rot) {
  const group = new THREE.Group();
  const frame = box(1.15, 1.55, 0.28, mats.white);
  frame.position.y = 0.78;
  group.add(frame);
  mats.books.forEach((material, index) => {
    const book = box(0.18, 0.34, 0.16, material, false);
    book.position.set(-0.38 + (index % 4) * 0.25, 0.32 + Math.floor(index / 4) * 0.48, 0.1);
    group.add(book);
  });
  group.position.set(x, 0, z);
  group.rotation.y = rot || 0;
  parent.add(group);
}

function addTheme(parent, mats, theme) {
  if (theme === 'lounge') {
    addSofa(parent, mats, 3.6, 3.15, 0.4);
    addSofa(parent, mats, 5.05, 2.15, -1.1);
    const table = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), mats.white));
    table.position.set(4.35, 0.36, 2.55);
    const cup = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12), mats.leg), false);
    cup.position.set(4.22, 0.45, 2.48);
    const cupB = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.09, 12), mats.white), false);
    cupB.position.set(4.5, 0.44, 2.66);
    const counter = box(0.62, 0.72, 0.38, mats.white);
    counter.position.set(5.35, 0.36, 3.55);
    const machine = box(0.28, 0.34, 0.22, mats.shell);
    machine.position.set(5.35, 0.89, 3.52);
    const spout = box(0.08, 0.06, 0.1, mats.laptop, false);
    spout.position.set(5.35, 0.78, 3.38);
    parent.add(table, cup, cupB, counter, machine, spout);
    return { x: 4.15, z: 1.85 };
  }
  if (theme === 'library') {
    addShelf(parent, mats, -5.15, -2.4, 0.15);
    addShelf(parent, mats, -5.15, -0.7, 0.15);
    addShelf(parent, mats, -3.55, -3.55, 0);
    return { x: -3.4, z: 3.1 };
  }
  if (theme === 'meeting') {
    const table = shade(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 32), mats.white));
    table.scale.set(1.35, 1, 1);
    table.position.set(3.9, 0.74, 2.7);
    parent.add(table);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const stool = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 16), mats.white));
      stool.position.set(3.9 + Math.cos(angle) * 1.7, 0.21, 2.7 + Math.sin(angle) * 1.15);
      parent.add(stool);
    }
    return { x: -4.6, z: 3.2 };
  }
  if (theme === 'media') {
    const stand = box(0.7, 0.5, 0.35, mats.white);
    stand.position.set(0.2, 0.25, -3.55);
    const tvMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.88, 0.06), tvMat);
    tv.position.set(0.2, 1.25, -3.7);
    const board = box(1.3, 0.8, 0.04, mats.floor, false);
    board.position.set(2.3, 1.35, -3.75);
    parent.add(stand, tv, board);
    addSofa(parent, mats, 0.2, -2.15, Math.PI);
    return { x: 4.4, z: 3.2 };
  }
  addPlant(parent, mats, 4.4, 3.2, 1.1);
  return { x: 4.2, z: 3.3 };
}

export function createOffice(stage, hooks) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    const fatal = document.getElementById('fatal');
    if (fatal) {
      fatal.hidden = false;
      fatal.textContent = 'This browser could not start the 3D view.';
    }
    return blankOffice();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('view');
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.classList.add('labels');
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#F2F2F0');
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 80);
  camera.position.set(16, 16, 16);
  const ISO = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(24);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minPolarAngle = 0.58;
  controls.maxPolarAngle = 1.08;
  controls.minZoom = 0.72;
  controls.maxZoom = 2.6;
  controls.zoomSpeed = 0.7;
  controls.rotateSpeed = 0.55;
  camera.lookAt(controls.target);
  const phoneQuery = window.matchMedia('(max-width: 640px)');
  function phoneLayout() {
    return phoneQuery.matches;
  }
  function syncControls() {
    const phone = phoneLayout();
    controls.enabled = !phone;
    controls.enableRotate = !phone;
    controls.enablePan = false;
    controls.minZoom = phone ? 0.45 : 0.72;
    controls.maxZoom = phone ? 3.4 : 2.6;
  }
  syncControls();
  phoneQuery.addEventListener('change', syncControls);
  renderer.domElement.style.touchAction = 'none';

  const hemi = new THREE.HemisphereLight('#ffffff', '#d5d8e0', 1.05);
  const ambient = new THREE.AmbientLight('#ffffff', 0.45);
  const sun = new THREE.DirectionalLight('#fffdf8', 2.05);
  sun.position.set(-14, 22, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 48;
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#f8fafc', 0.55);
  fill.position.set(-8, 10, -6);
  scene.add(hemi, ambient, sun, fill);

  const mats = makeMaterials();
  const ground = shade(new THREE.Mesh(new THREE.CircleGeometry(28, 56), mats.ground), false);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d');
  const shadowPaint = shadowCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
  shadowPaint.addColorStop(0, 'rgba(0,0,0,0.12)');
  shadowPaint.addColorStop(1, 'rgba(0,0,0,0)');
  shadowCtx.fillStyle = shadowPaint;
  shadowCtx.fillRect(0, 0, 128, 128);
  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(12, 40),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  scene.add(contact);

  const building = new THREE.Group();
  scene.add(building);
  const elevator = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
  postGeo.userData.shared = true;
  const posts = [];
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    const post = new THREE.Mesh(postGeo, mats.mullion);
    post.position.set(x, 0, z);
    post.castShadow = true;
    elevator.add(post);
    posts.push(post);
  }
  const shaftGlass = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1, 1.15), mats.glass);
  elevator.add(shaftGlass);
  elevator.position.set(W / 2 + 0.95, 0, 0.2);
  scene.add(elevator);
  const elevBars = [];

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.03, 8, 28),
    new THREE.MeshBasicMaterial({ color: '#A1A1AA', toneMapped: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  let state = null;
  let builtSig = '';
  let roomApis = [];
  let levels = [];
  let records = [];
  let pickables = [];
  let active = 0;
  let selected = null;
  let hovered = null;
  let reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let zoomAnim = null;
  let motion = null;
  let dragging = false;
  const clock = new THREE.Clock();
  let elapsed = 0;
  let frames = 0;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const desiredTarget = new THREE.Vector3();
  let snapped = false;
  let userZoomed = false;
  const pan = new THREE.Vector3();

  function buildInterior(parent, floor) {
    addCurtain(parent, mats, W - 0.8, 2.7, 0, -D / 2 + 0.28, 0);
    addCurtain(parent, mats, D - 1.2, 2.7, W / 2 - 0.28, 0.2, Math.PI / 2);
    const ops = floor.theme === 'lounge';
    if (ops) addPlant(parent, mats, 0.15, 3.85, 0.8);
    else addPlant(parent, mats, -5.3, 3.5, 1);
    addPlant(parent, mats, 5.2, -2.6, 0.9);
    addPlant(parent, mats, -5.4, -3.4, 0.75);
    const seats = ops
      ? [
        ...addDeskRow(parent, mats, -1.15, { origin: -0.2, gap: 1.75, count: 4 }),
        ...addDeskRow(parent, mats, 0.55, { origin: -0.2, gap: 1.75, count: 4 }),
      ]
      : [
        ...addDeskRow(parent, mats, -0.55),
        ...addDeskRow(parent, mats, 1.55),
      ];
    const lounge = addTheme(parent, mats, floor.theme || 'open');
    if (floor.theme !== 'meeting') addMeetingTable(parent, mats, ops ? 1.6 : 2.15, -4.05);
    addWallArt(parent, mats);
    const kaiOffice = ops ? addKaiOffice(parent, mats) : null;
    if (kaiOffice) {
      roomApis.push(kaiOffice);
      kaiOffice.group.traverse((obj) => {
        if (!obj.isMesh) return;
        pickables.push(obj);
      });
    }
    let sleepers = 0;
    let seatCursor = 0;
    floor.bots.forEach((name, index) => {
      const look = lookFor(state, name);
      const visual = createCharacter(name, look);
      const inOffice = name === 'Kai' && kaiOffice;
      const seat = seats[seatCursor % Math.max(seats.length, 1)];
      if (!inOffice) seatCursor += 1;
      const seatPos = inOffice
        ? { x: kaiOffice.desk.x, z: kaiOffice.desk.z, screenMat: null }
        : (seats.length ? seat : { x: -1 + index, z: 0, screenMat: null });
      visual.root.position.set(seatPos.x, 0.46, seatPos.z);
      parent.add(visual.root);
      visual.pickRoot.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.userData.botName = name;
        pickables.push(obj);
      });
      const persona = presentBot(state.bots[name], Date.now(), name).persona;
      const sleepIndex = persona === 'sleep' ? sleepers++ : 0;
      records.push({
        name,
        visual,
        seat: { x: seatPos.x, z: seatPos.z },
        face: inOffice ? kaiOffice.deskFace : null,
        screenMat: seatPos.screenMat,
        lounge: { x: lounge.x - sleepIndex * 0.45, z: lounge.z },
        homeKey: floor.key,
        floorKey: floor.key,
        office: inOffice ? kaiOffice : null,
        nextBoard: 7,
      });
    });
  }

  function build(floors) {
    roomApis.forEach((api) => api.dispose());
    roomApis = [];
    disposeTree(building);
    building.clear();
    records = [];
    pickables = [];
    elevBars.forEach((bar) => elevator.remove(bar));
    elevBars.length = 0;
    levels = floors.map((floor, index) => {
      const group = new THREE.Group();
      const plinth = box(W, 0.34, D, mats.shell);
      plinth.position.y = 0.17;
      const band = box(W - 0.45, 0.2, D - 0.45, mats.band);
      band.position.y = 0.42;
      const plate = box(W - 0.12, 0.08, D - 0.12, mats.floor);
      plate.position.y = BASE - 0.04;
      group.add(plinth, band, plate);
      const interior = new THREE.Group();
      interior.position.y = BASE;
      group.add(interior);
      buildInterior(interior, floor);
      building.add(group);
      const bar = box(1.05, 0.035, 1.05, mats.mullion, false);
      elevator.add(bar);
      elevBars.push(bar);
      return {
        key: floor.key,
        group,
        interior,
        y: index * SLAB,
        h: index === active ? OPEN : SLAB,
      };
    });
    if (!levels.length) active = 0;
    else active = Math.min(active, levels.length - 1);
  }

  function signature(floors) {
    return floors.map((floor) => `${floor.key}:${floor.theme}:${floor.bots.join('\u0001')}`).join('|')
      + '#'
      + (state?.roster || []).map((name) => {
        const look = lookFor(state, name);
        return `${look.shape}:${look.color}:${look.accessory}`;
      }).join(';');
  }

  function layoutInstant() {
    let cursor = 0;
    levels.forEach((level, index) => {
      const open = index === active;
      if (!open) {
        level.y = cursor;
        level.h = SLAB;
        cursor += SLAB;
      }
    });
    if (levels[active]) {
      levels[active].y = cursor;
      levels[active].h = OPEN;
    }
    levels.forEach((level, index) => {
      level.group.position.y = level.y;
      level.interior.visible = index === active;
      level.interior.scale.setScalar(1);
    });
    motion = null;
  }

  function poseTargets(index) {
    let cursor = 0;
    const targets = levels.map(() => ({ y: 0, h: SLAB }));
    levels.forEach((_, i) => {
      if (i === index) return;
      targets[i].y = cursor;
      targets[i].h = SLAB;
      cursor += SLAB;
    });
    if (levels[index]) {
      targets[index].y = cursor;
      targets[index].h = OPEN;
    }
    return targets;
  }

  function applyPose(pose) {
    levels.forEach((level, index) => {
      level.y = pose[index].y;
      level.h = pose[index].h;
      level.group.position.y = level.y;
      const openAmount = THREE.MathUtils.clamp((level.h - SLAB) / Math.max(OPEN - SLAB, 0.001), 0, 1);
      level.interior.visible = openAmount > 0.2;
      level.interior.scale.setScalar(0.9 + 0.1 * openAmount);
    });
  }

  function setState(next) {
    state = next;
    const floors = floorPlan(next);
    const sig = signature(floors);
    const previous = levels[active]?.key;
    if (sig !== builtSig) {
      builtSig = sig;
      const keep = floors.findIndex((floor) => floor.key === previous);
      if (keep >= 0) active = keep;
      build(floors);
      layoutInstant();
      snapped = false;
      if (!userZoomed) frameFloor();
    }
  }

  function frameFloor() {
    const rect = stage.getBoundingClientRect();
    const narrow = window.innerWidth <= 640;
    const left = narrow ? 12 : 312;
    const right = narrow ? 12 : 332;
    const top = narrow ? 148 : 16;
    const bottom = narrow ? 72 : 16;
    const availW = Math.max(140, rect.width - left - right);
    const availH = Math.max(140, rect.height - top - bottom);
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    const viewH = 12.8;
    const viewW = viewH * aspect;
    const span = (W + D) * 0.78;
    const tall = OPEN + (W + D) * 0.2;
    const zoomW = (availW / rect.width) * viewW / span;
    const zoomH = (availH / rect.height) * viewH / tall;
    const fitted = THREE.MathUtils.clamp(Math.min(zoomW, zoomH), controls.minZoom, controls.maxZoom);
    zoomAnim = { from: camera.zoom, to: fitted, start: performance.now(), dur: reduce ? 0 : 720 };
  }

  function setFloor(index) {
    if (!levels.length) return;
    const next = Math.max(0, Math.min(levels.length - 1, index));
    if (next === active) return;
    const from = levels.map((level) => ({ y: level.y, h: level.h }));
    active = next;
    motion = {
      start: performance.now(),
      dur: reduce ? 0 : 720,
      from,
      to: poseTargets(active),
    };
    userZoomed = false;
    pan.set(0, 0, 0);
    frameFloor();
  }

  function focusBot(name) {
    selected = name || null;
  }

  function clearBot() {
    selected = null;
  }

  function zoom(direction) {
    const next = THREE.MathUtils.clamp(camera.zoom * (direction > 0 ? 1.18 : 1 / 1.18), controls.minZoom, controls.maxZoom);
    userZoomed = true;
    zoomAnim = { from: camera.zoom, to: next, start: performance.now(), dur: 280 };
  }

  controls.addEventListener('start', () => {
    zoomAnim = null;
    dragging = true;
  });
  controls.addEventListener('end', () => {
    dragging = false;
  });

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.botName || null : null;
  }

  const down = { active: false, id: 0, x: 0, y: 0, moved: false };
  const pointers = new Map();
  let pinchDist = 0;
  let pinchZoom = 1;

  function touchDistance() {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function panPixels(dx, dy) {
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    right.y = 0;
    camUp.y = 0;
    if (right.lengthSq() < 1e-8 || camUp.lengthSq() < 1e-8) return;
    right.normalize();
    camUp.normalize();
    const height = Math.max(1, renderer.domElement.clientHeight);
    const scale = (camera.top - camera.bottom) / (camera.zoom * height);
    pan.x = THREE.MathUtils.clamp(pan.x + (-dx * right.x + dy * camUp.x) * scale, -9, 9);
    pan.z = THREE.MathUtils.clamp(pan.z + (-dx * right.z + dy * camUp.z) * scale, -9, 9);
  }

  renderer.domElement.addEventListener('wheel', () => {
    userZoomed = true;
    zoomAnim = null;
  }, { passive: true });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture?.(event.pointerId);
    if (phoneLayout()) {
      dragging = true;
      down.moved = pointers.size > 1 || down.moved;
      if (pointers.size === 2) {
        pinchDist = touchDistance();
        pinchZoom = camera.zoom;
        userZoomed = true;
        zoomAnim = null;
      } else if (pointers.size === 1) {
        down.active = true;
        down.id = event.pointerId;
        down.x = event.clientX;
        down.y = event.clientY;
        down.moved = false;
      }
      return;
    }
    down.active = true;
    down.id = event.pointerId;
    down.x = event.clientX;
    down.y = event.clientY;
    down.moved = false;
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    pointers.delete(event.pointerId);
    if (phoneLayout()) {
      dragging = pointers.size > 0;
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0 && event.pointerId === down.id && !down.moved) {
        const dx = event.clientX - down.x;
        const dy = event.clientY - down.y;
        if (dx * dx + dy * dy <= 49) hooks.onPick(pick(event.clientX, event.clientY));
      }
      return;
    }
    if (!down.active || event.pointerId !== down.id) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    down.active = false;
    if (dx * dx + dy * dy > 49) return;
    hooks.onPick(pick(event.clientX, event.clientY));
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (phoneLayout() && pointers.has(event.pointerId)) {
      const prev = pointers.get(event.pointerId);
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      prev.x = event.clientX;
      prev.y = event.clientY;
      if (dx || dy) down.moved = true;
      if (pointers.size === 1 && pinchDist === 0) panPixels(dx, dy);
      return;
    }
    if (event.pointerType === 'touch') return;
    const name = pick(event.clientX, event.clientY);
    if (name !== hovered) {
      hovered = name;
      renderer.domElement.style.cursor = name ? 'pointer' : '';
    }
  });
  function touchSpan(touches) {
    if (!touches || touches.length < 2) return 0;
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  function beginPinch(touches) {
    const span = touchSpan(touches);
    if (span <= 0) return;
    pinchDist = span;
    pinchZoom = camera.zoom;
    userZoomed = true;
    zoomAnim = null;
    down.moved = true;
  }

  function applyPinch(touches) {
    const span = touchSpan(touches);
    if (pinchDist <= 0 || span <= 0) return;
    camera.zoom = THREE.MathUtils.clamp(
      pinchZoom * (span / pinchDist),
      controls.minZoom,
      controls.maxZoom,
    );
    camera.updateProjectionMatrix();
    userZoomed = true;
    zoomAnim = null;
  }

  renderer.domElement.addEventListener('touchstart', (event) => {
    if (!phoneLayout() || event.touches.length < 2) return;
    beginPinch(event.touches);
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', (event) => {
    if (!phoneLayout() || event.touches.length < 2) return;
    event.preventDefault();
    if (pinchDist <= 0) beginPinch(event.touches);
    applyPinch(event.touches);
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) pinchDist = 0;
  });
  renderer.domElement.addEventListener('touchcancel', () => {
    pinchDist = 0;
  });
  renderer.domElement.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0;
    if (pointers.size < 2) pinchDist = 0;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hovered = null;
    renderer.domElement.style.cursor = '';
  });

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const aspect = width / height;
    const frustum = 6.4;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    const labels = labelRenderer.domElement;
    labels.style.inset = 'auto';
    labels.style.left = '0px';
    labels.style.top = '0px';
    if (levels.length && !userZoomed) frameFloor();
  }
  const observer = new ResizeObserver(() => resize());
  observer.observe(stage);
  resize();

  function mentions(step, name) {
    const hay = String(step || '').toLowerCase();
    const token = String(name || '').toLowerCase();
    if (!token || hay.length < token.length) return false;
    let from = 0;
    while (from <= hay.length - token.length) {
      const at = hay.indexOf(token, from);
      if (at < 0) return false;
      const before = at === 0 || !/[\p{L}\p{N}_]/u.test(hay[at - 1]);
      const afterAt = at + token.length;
      const after = afterAt >= hay.length || !/[\p{L}\p{N}_]/u.test(hay[afterAt]);
      if (before && after) return true;
      from = at + token.length;
    }
    return false;
  }

  function attachFloor(record, key) {
    if (record.floorKey === key) return;
    const level = levels.find((item) => item.key === key);
    if (!level) return;
    level.interior.add(record.visual.root);
    record.floorKey = key;
    const index = levels.indexOf(level);
    if (index >= 0 && index !== active) setFloor(index);
  }

  function approach(fromX, fromZ, toX, toZ, faceX, faceZ) {
    const dx = fromX - toX;
    const dz = fromZ - toZ;
    const dist = Math.hypot(dx, dz) || 1;
    const keep = Math.min(0.72, dist);
    return {
      x: toX + (dx / dist) * keep,
      z: toZ + (dz / dist) * keep,
      faceX: faceX == null ? toX : faceX,
      faceZ: faceZ == null ? toZ : faceZ,
    };
  }

  function namedPartner(record, presentation) {
    if (presentation.status !== 'working' && presentation.status !== 'waiting_user') return null;
    const names = records
      .map((item) => item.name)
      .filter((name) => name !== record.name)
      .sort((a, b) => b.length - a.length);
    const hit = names.find((name) => mentions(presentation.step, name));
    return hit ? records.find((item) => item.name === hit) : null;
  }

  function spotNear(record, x, z, faceX, faceZ) {
    return approach(record.visual.root.position.x, record.visual.root.position.z, x, z, faceX, faceZ);
  }

  function planMotion(record, presentation) {
    const partner = namedPartner(record, presentation);
    const errandKey = partner ? `${partner.name}|${presentation.step}` : '';
    if (!record.trip && partner && record.finishedErrand !== errandKey) {
      record.trip = { phase: 'stand', since: elapsed, kind: 'bot', partnerName: partner.name, key: errandKey };
    }
    if (!record.trip && !partner && !record.office && presentation.status === 'idle' && record.homeKey === '__ops__' && elapsed > 24) {
      const mates = records.filter((item) => item.homeKey === '__ops__');
      const index = mates.findIndex((item) => item.name === record.name);
      const period = 22;
      const clockT = (elapsed - 24) % (period * Math.max(mates.length, 1));
      if (Math.floor(clockT / period) === index && (clockT % period) < 2) {
        record.trip = { phase: 'stand', since: elapsed, kind: 'coffee', key: `coffee-${Math.floor(elapsed)}` };
      }
    }
    if (record.office) {
      const idle = presentation.status === 'idle';
      const spot = idle ? record.office.sofa : record.office.desk;
      const face = idle ? record.office.sofaFace : record.office.deskFace;
      record.seat.x = spot.x;
      record.seat.z = spot.z;
      record.face = face;
      if (record.trip && record.trip.kind === 'board' && idle) record.trip = null;
    }
    if (!record.trip && record.office && presentation.status === 'working' && !partner && elapsed > record.nextBoard) {
      record.trip = { phase: 'out', since: elapsed, kind: 'board', key: `board-${Math.floor(elapsed)}` };
      record.nextBoard = elapsed + 16;
    }
    if (!record.trip) {
      if (record.floorKey !== record.homeKey) attachFloor(record, record.homeKey);
      if (record.office) {
        const dist = Math.hypot(
          record.visual.root.position.x - record.seat.x,
          record.visual.root.position.z - record.seat.z,
        );
        return {
          visit: { x: record.seat.x, z: record.seat.z, faceX: record.face.x, faceZ: record.face.z },
          gait: dist > 0.2 ? 'walk' : 'sit',
          nod: 0,
        };
      }
      return { visit: null, gait: 'sit', nod: 0 };
    }
    const trip = record.trip;
    const age = elapsed - trip.since;
    const next = (phase) => {
      trip.phase = phase;
      trip.since = elapsed;
    };
    if (trip.kind === 'bot') {
      const who = records.find((item) => item.name === trip.partnerName);
      if (trip.phase === 'stand') {
        if (age >= 0.25 && who) {
          attachFloor(record, who.floorKey);
          trip.spot = approach(record.seat.x, record.seat.z, who.visual.root.position.x, who.visual.root.position.z, who.visual.root.position.x, who.visual.root.position.z);
          next('out');
        }
        return { visit: null, gait: 'stand', nod: 0 };
      }
      if (trip.phase === 'out' && trip.spot) {
        const visit = trip.spot;
        if (Math.hypot(record.visual.root.position.x - visit.x, record.visual.root.position.z - visit.z) < 0.12) next('pause');
        return { visit, gait: 'walk', nod: 0 };
      }
      if (trip.phase === 'pause') {
        if (age >= 1.3) next('back');
        return { visit: trip.spot || null, gait: 'stand', nod: Math.min(age / 0.7, 1) };
      }
      if (trip.phase === 'back') {
        if (record.floorKey !== record.homeKey) attachFloor(record, record.homeKey);
        if (Math.hypot(record.visual.root.position.x - record.seat.x, record.visual.root.position.z - record.seat.z) < 0.12) next('sit');
        return { visit: null, gait: 'walk', nod: 0 };
      }
    } else if (trip.kind === 'board' && record.office) {
      const spot = {
        x: record.office.boardSpot.x,
        z: record.office.boardSpot.z,
        faceX: record.office.boardFace.x,
        faceZ: record.office.boardFace.z,
      };
      if (trip.phase === 'out') {
        if (Math.hypot(record.visual.root.position.x - spot.x, record.visual.root.position.z - spot.z) < 0.16) next('pause');
        return { visit: spot, gait: 'walk', nod: 0 };
      }
      if (trip.phase === 'pause') {
        if (age >= 1.3) next('back');
        return { visit: spot, gait: 'stand', nod: Math.min(age / 0.7, 1) };
      }
      if (trip.phase === 'back') {
        if (Math.hypot(record.visual.root.position.x - record.seat.x, record.visual.root.position.z - record.seat.z) < 0.16) next('sit');
        return { visit: null, gait: 'walk', nod: 0 };
      }
    } else if (trip.phase === 'stand') {
      if (age >= 0.25) next('out');
      return { visit: null, gait: 'stand', nod: 0 };
    } else if (trip.phase === 'out') {
      const visit = { x: 4.05, z: 1.82, faceX: 4.35, faceZ: 2.55 };
      if (Math.hypot(record.visual.root.position.x - visit.x, record.visual.root.position.z - visit.z) < 0.16) {
        trip.spot = visit;
        next('pause');
      }
      return { visit, gait: 'walk', nod: 0 };
    } else if (trip.phase === 'pause') {
      if (age >= 1.25) next('back');
      return { visit: trip.spot, gait: 'stand', nod: Math.min(age / 0.7, 1) };
    } else if (trip.phase === 'back') {
      if (Math.hypot(record.visual.root.position.x - record.seat.x, record.visual.root.position.z - record.seat.z) < 0.16) next('sit');
      return { visit: null, gait: 'walk', nod: 0 };
    }
    if (age >= 0.28) {
      record.finishedErrand = trip.key;
      record.trip = null;
    }
    return { visit: null, gait: 'sit', nod: 0 };
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    frames += 1;
    const now = Date.now();
    if (motion) {
      const t = motion.dur <= 0 ? 1 : Math.min(1, (performance.now() - motion.start) / motion.dur);
      const eased = reduce ? 1 : easeInOut(t);
      applyPose(motion.from.map((item, index) => ({
        y: item.y + (motion.to[index].y - item.y) * eased,
        h: item.h + (motion.to[index].h - item.h) * eased,
      })));
      if (t >= 1) motion = null;
    }

    const totalH = levels.reduce((sum, level) => sum + level.h, 0) || SLAB;
    posts.forEach((post) => {
      post.scale.y = totalH;
      post.position.y = totalH / 2;
    });
    shaftGlass.scale.y = Math.max(totalH, 0.01);
    shaftGlass.position.y = totalH / 2;
    elevBars.forEach((bar, index) => {
      const level = levels[index];
      bar.visible = !!level;
      if (level) bar.position.y = level.y + 0.34;
    });

    const open = levels[active];
    const focusY = open ? open.y + open.h * 0.46 : 1.2;
    desiredTarget.set(0, focusY, 0.15);
    if (!snapped) {
      controls.target.copy(desiredTarget);
      camera.position.copy(desiredTarget).add(ISO);
      camera.lookAt(controls.target);
      snapped = true;
    } else if (phoneLayout()) {
      controls.target.set(desiredTarget.x + pan.x, desiredTarget.y, desiredTarget.z + pan.z);
      camera.position.copy(controls.target).add(ISO);
      camera.lookAt(controls.target);
    } else {
      controls.target.y = desiredTarget.y;
      controls.target.z = desiredTarget.z;
    }
    if (zoomAnim) {
      const t = Math.min(1, (performance.now() - zoomAnim.start) / zoomAnim.dur);
      const eased = 1 - (1 - t) ** 3;
      camera.zoom = zoomAnim.from + (zoomAnim.to - zoomAnim.from) * eased;
      if (t >= 1) zoomAnim = null;
      camera.updateProjectionMatrix();
    }
    if (!phoneLayout()) controls.update();

    for (const api of roomApis) api.update(state, now);

    for (const record of records) {
      const level = levels.find((item) => item.key === record.floorKey);
      const shown = level && level.interior.visible;
      record.visual.root.visible = !!shown;
      const presentation = presentBot(state?.bots[record.name], now, record.name);
      const mode = visualMode(presentation);
      const plan = planMotion(record, presentation);
      updateCharacter(record.visual, {
        dt,
        t: elapsed,
        mode,
        reduce,
        celebrateT: mode === 'celebrate' ? Math.min(1, presentation.age / DONE_MS) : 0,
        seat: record.seat,
        visit: plan.visit,
        gait: plan.gait,
        nod: plan.nod,
        face: record.face,
        showStep: selected === record.name,
        showName: hovered === record.name || selected === record.name,
        step: presentation.step,
        status: presentation.status,
        hovered: hovered === record.name,
        selected: selected === record.name,
        hold: !!motion || dragging,
      });
      const screen = record.screenMat;
      if (screen) {
        const working = presentation.status === 'working';
        screen.emissive.set(working ? '#38bdf8' : '#0f172a');
        screen.emissiveIntensity = working ? 0.55 + Math.sin(elapsed * 4 + record.visual.phase) * 0.2 : 0.2;
        screen.color.set(working ? '#e0f2fe' : '#334155');
      }
    }
    ring.visible = false;

    sun.target.position.set(0, focusY, 0);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (frames === 1) document.body.dataset.ready = '1';
    document.body.dataset.zoom = camera.zoom.toFixed(3);
  }

  renderer.setAnimationLoop(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else {
      clock.getDelta();
      renderer.setAnimationLoop(loop);
    }
  });

  return {
    setState,
    setFloor,
    focusBot,
    clearBot,
    zoom,
    setReduce(value) {
      reduce = !!value;
    },
    resize,
  };
}

function blankOffice() {
  return {
    setState() {},
    setFloor() {},
    focusBot() {},
    clearBot() {},
    zoom() {},
    setReduce() {},
    resize() {},
  };
}
