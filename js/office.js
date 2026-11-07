import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createCharacter, updateCharacter } from './characters.js';
import { el } from './dom.js';
import { sceneMood } from './lighting.js';
import { DONE_MS, STALE_MS, floorPlan, presentBot, resolveLook, visualMode } from './state.js';

const FLOOR_W = 14;
const FLOOR_D = 10;
const FLOOR_H = 3.6;
const SLAB = 0.26;
const WALL_T = 0.16;
const WALL_H = FLOOR_H - SLAB;
const RUGS = ['#e7b15a', '#8ebfd4', '#f0b3be', '#9ed0ae', '#c3a4de', '#e3c07a'];

function shade(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, cast = true) {
  return shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), cast);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((obj) => {
    if (obj.element && obj.element.remove) obj.element.remove();
    if (obj.geometry && !obj.geometry.userData.shared) geometries.add(obj.geometry);
    const list = obj.material == null ? [] : (Array.isArray(obj.material) ? obj.material : [obj.material]);
    for (const material of list) {
      if (!material.userData?.shared) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function makeMaterials() {
  const lambert = (color) => {
    const material = new THREE.MeshLambertMaterial({ color });
    material.userData.shared = true;
    return material;
  };
  const basic = (color) => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    material.userData.shared = true;
    return material;
  };
  const windowMat = basic('#c5e2f4');
  windowMat.side = THREE.DoubleSide;
  return {
    wood: lambert('#e6c59a'),
    woodDark: lambert('#c49662'),
    plaster: lambert('#f7f1e7'),
    trim: lambert('#ead7bc'),
    roof: lambert('#d27b56'),
    roofDark: lambert('#b86446'),
    stone: lambert('#efe4d4'),
    stair: lambert('#e6d5bf'),
    metal: lambert('#8d97a3'),
    pot: lambert('#d27b56'),
    leaf: lambert('#7dae5a'),
    leafDark: lambert('#4e8b44'),
    sofa: lambert('#f0b7c0'),
    paper: lambert('#fffaf3'),
    frame: lambert('#4c5563'),
    gold: lambert('#e6b14a'),
    path: lambert('#efe2cb'),
    grass: lambert('#b7d390'),
    cloud: lambert('#fffdf8'),
    windowMat,
    lampMat: basic('#f4efe6'),
    rugs: RUGS.map((color) => lambert(color)),
    skyMat: null,
  };
}

function makeDesk(width, mats) {
  const group = new THREE.Group();
  const top = box(width, 0.08, 0.78, mats.wood);
  top.position.y = 0.7;
  group.add(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.07, 0.7, 0.07, mats.woodDark);
    leg.position.set(sx * (width * 0.4), 0.35, sz * 0.28);
    group.add(leg);
  }
  const monitor = box(Math.max(0.42, width * 0.38), 0.34, 0.06, mats.frame);
  monitor.position.set(0, 0.96, 0.22);
  group.add(monitor);
  const screenMat = new THREE.MeshBasicMaterial({ color: '#2a3142', toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.32, width * 0.3), 0.22), screenMat);
  screen.position.set(0, 0.97, 0.26);
  screen.castShadow = false;
  group.add(screen);
  const keys = box(width * 0.36, 0.025, 0.12, mats.frame);
  keys.position.set(0, 0.75, -0.08);
  group.add(keys);
  group.userData.screenMat = screenMat;
  return group;
}

function makeStool(mats) {
  const group = new THREE.Group();
  const seat = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.08, 8), mats.wood));
  seat.position.y = 0.36;
  const post = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.34, 6), mats.woodDark));
  post.position.y = 0.16;
  group.add(seat, post);
  return group;
}

function makePlant(mats, scale) {
  const group = new THREE.Group();
  const pot = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.18, 7), mats.pot));
  pot.position.y = 0.09;
  const crown = shade(new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), mats.leaf));
  crown.position.y = 0.36;
  const sprout = shade(new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), mats.leafDark));
  sprout.position.set(0.12, 0.48, 0.04);
  group.add(pot, crown, sprout);
  group.scale.setScalar(scale);
  return group;
}

function makeSofa(mats) {
  const group = new THREE.Group();
  const base = box(1.7, 0.26, 0.62, mats.sofa);
  base.position.y = 0.2;
  const back = box(1.7, 0.38, 0.14, mats.sofa);
  back.position.set(0, 0.46, -0.24);
  const left = box(0.14, 0.28, 0.62, mats.sofa);
  left.position.set(-0.84, 0.34, 0);
  const right = box(0.14, 0.28, 0.62, mats.sofa);
  right.position.set(0.84, 0.34, 0);
  group.add(base, back, left, right);
  return group;
}

function makeTree(mats, x, z, scale) {
  const group = new THREE.Group();
  const trunk = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.7, 6), mats.woodDark));
  trunk.position.y = 0.35;
  const a = shade(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.05, 7), mats.leaf));
  a.position.y = 1.1;
  const b = shade(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.75, 7), mats.leafDark));
  b.position.y = 1.5;
  group.add(trunk, a, b);
  group.position.set(x, -0.62, z);
  group.scale.setScalar(scale);
  return group;
}

function makeCloud(mats) {
  const group = new THREE.Group();
  [[0, 0, 0, 1], [0.9, 0.12, 0.15, 0.72], [-0.8, 0.05, -0.1, 0.64]].forEach(([x, y, z, s]) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 6), mats.cloud);
    puff.position.set(x, y, z);
    puff.scale.setScalar(s);
    group.add(puff);
  });
  return group;
}

function makeClock(mats) {
  const group = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), mats.paper);
  const rim = shade(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 18), mats.woodDark), false);
  group.add(face, rim);
  const hand = (length, width, material) => {
    const geometry = new THREE.BoxGeometry(width, length, 0.015);
    geometry.translate(0, length / 2, 0.02);
    return new THREE.Mesh(geometry, material);
  };
  const hour = hand(0.14, 0.035, mats.frame);
  const minute = hand(0.22, 0.025, mats.frame);
  const secondMat = new THREE.MeshBasicMaterial({ color: '#d2554a', toneMapped: false });
  const second = hand(0.24, 0.012, secondMat);
  group.add(hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.01), mats.frame);
    const angle = (i / 4) * Math.PI * 2;
    tick.position.set(Math.sin(angle) * 0.24, Math.cos(angle) * 0.24, 0.02);
    tick.rotation.z = -angle;
    group.add(tick);
  }
  group.userData.hands = { hour, minute, second };
  return group;
}

function layoutSpots(count) {
  if (count <= 0) return [];
  const rows = count > 4 ? 2 : 1;
  const per = Math.ceil(count / rows);
  const gap = Math.min(2.3, 10.4 / per);
  const span = gap * per;
  const start = -span / 2 + gap / 2;
  const desksZ = rows === 1 ? [1.45] : [0.2, 1.9];
  const spots = [];
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    const n = row === rows - 1 ? count - cursor : per;
    for (let i = 0; i < n; i += 1) {
      const z = desksZ[row];
      spots.push({
        x: start + i * gap,
        deskZ: z,
        seatZ: z - 1.02,
        deskW: Math.min(1.65, gap * 0.8),
      });
    }
    cursor += n;
  }
  return spots;
}

export function createOffice(stage, hooks) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !coarse,
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

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('view');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Animated three-dimensional office. Drag to look around, scroll or pinch to zoom.');
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.classList.add('labels');
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d7e8f6');
  scene.fog = new THREE.Fog('#d7e8f6', 70, 160);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.15, 400);
  camera.position.set(18, 14, 20);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.18;
  controls.minDistance = 3.2;
  controls.maxDistance = 72;
  controls.maxTargetRadius = 24;
  controls.zoomSpeed = 0.75;
  controls.rotateSpeed = coarse ? 0.55 : 0.7;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const mats = makeMaterials();
  const hemi = new THREE.HemisphereLight('#d0eafc', '#e7d3b8', 0.9);
  const ambient = new THREE.AmbientLight('#fff8f0', 0.7);
  const sunLight = new THREE.DirectionalLight('#fff4e2', 1.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024);
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.045;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 90;
  scene.add(sunLight.target);
  const fill = new THREE.DirectionalLight('#fff6ec', 0.85);
  fill.position.set(10, 16, 14);
  scene.add(hemi, ambient, sunLight, fill);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.magFilter = THREE.LinearFilter;
  skyTex.minFilter = THREE.LinearFilter;
  skyTex.generateMipmaps = false;
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, toneMapped: false });
  skyMat.fog = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 20, 16), skyMat);
  scene.add(sky);

  const grass = shade(new THREE.Mesh(new THREE.CircleGeometry(26, 40), mats.grass), false);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.62;
  grass.receiveShadow = true;
  scene.add(grass);

  const path = box(1.7, 0.05, 3.4, mats.path, false);
  path.position.set(0, -0.6, FLOOR_D / 2 + 2.5);
  scene.add(path);
  scene.add(makeTree(mats, -11, -4, 1.15));
  scene.add(makeTree(mats, 12, 2, 0.9));
  scene.add(makeTree(mats, -9, 8, 0.75));
  scene.add(makeTree(mats, 8, -8, 1));

  const clouds = [-8, 2, 11].map((x, index) => {
    const cloud = makeCloud(mats);
    cloud.position.set(x, 16 + index * 1.4, -12 - index * 3);
    cloud.userData.baseX = x;
    scene.add(cloud);
    return cloud;
  });

  const rand = mulberry32(0x51a7);
  const starPositions = [];
  for (let i = 0; i < 70; i += 1) {
    starPositions.push((rand() - 0.5) * 90, 12 + rand() * 40, (rand() - 0.5) * 90);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: '#fff6e4',
    size: 0.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  starMat.fog = false;
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffe1a8', toneMapped: false }),
  );
  sunMesh.material.fog = false;
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#f4f0e4', toneMapped: false }),
  );
  moonMesh.material.fog = false;
  const crater = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ded6c4', toneMapped: false }),
  );
  crater.position.set(0.7, 0.4, 1.5);
  moonMesh.add(crater);
  scene.add(sunMesh, moonMesh);

  const structure = new THREE.Group();
  scene.add(structure);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.035, 6, 22),
    new THREE.MeshBasicMaterial({ color: '#f2c14b', toneMapped: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const glassDay = new THREE.Color('#c5e2f4');
  const glassNight = new THREE.Color('#ffcc88');
  const lampOff = new THREE.Color('#f3eee6');
  const lampOn = new THREE.Color('#ffd27a');
  const workA = new THREE.Color('#d7f6ff');
  const workB = new THREE.Color('#7ad7ff');
  const tmp = new THREE.Vector3();
  const sunDir = new THREE.Vector3();

  let floorCount = 1;
  let buildingCenterY = 1;
  let state = null;
  let builtSig = '';
  let records = [];
  let pickables = [];
  let clockHands = null;
  let hovered = null;
  let selected = null;
  let userMoved = false;
  let flying = false;
  let flyKind = '';
  const flyPos = new THREE.Vector3();
  const flyTarget = new THREE.Vector3();
  let reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentMood = sceneMood(new Date());
  const clock = new THREE.Clock();
  let elapsed = 0;
  let frames = 0;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  function paintSky(top, bottom) {
    const ctx = skyCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    skyTex.needsUpdate = true;
  }

  function applyMood(mood) {
    currentMood = mood;
    paintSky(mood.top, mood.bottom);
    scene.fog.color.set(mood.fog);
    scene.background.set(mood.bottom);
    ambient.color.set(mood.ambientColor);
    ambient.intensity = mood.ambient;
    hemi.color.set(mood.hemiSky);
    hemi.groundColor.set(mood.hemiGround);
    hemi.intensity = 0.75 + mood.ambient * 0.35;
    sunLight.color.set(mood.sunColor);
    sunLight.intensity = mood.sun * 1.15;
    const src = mood.sunVis > mood.moonVis ? mood.sunPoint : mood.moonPoint;
    sunDir.set(src.x, Math.max(6, src.y), src.z).normalize();
    sunLight.position.set(0, buildingCenterY, 0).addScaledVector(sunDir, 30);
    sunLight.target.position.set(0, buildingCenterY, 0);
    sunLight.target.updateMatrixWorld();
    mats.grass.color.set(mood.grass);
    mats.windowMat.color.copy(glassDay).lerp(glassNight, THREE.MathUtils.clamp(mood.window, 0, 1));
    mats.lampMat.color.copy(lampOff).lerp(lampOn, THREE.MathUtils.clamp(mood.lamp, 0, 1));
    sunMesh.visible = mood.sunVis > 0.4;
    moonMesh.visible = mood.moonVis > 0.4;
    sunMesh.position.set(mood.sunPoint.x, mood.sunPoint.y, mood.sunPoint.z);
    moonMesh.position.set(mood.moonPoint.x, mood.moonPoint.y, mood.moonPoint.z);
    stars.material.opacity = Math.max(0, mood.stars);
    stars.visible = mood.stars > 0.04;
    document.body.classList.toggle('night', !!mood.night);
    document.documentElement.style.setProperty('--sky', mood.bottom);
  }

  function framePose() {
    const aspect = Math.max(camera.aspect || 1, 0.35);
    const fov = (camera.fov * Math.PI) / 180;
    const height = floorCount * FLOOR_H + 3.4;
    const width = FLOOR_W + 6;
    const distV = (height * 0.5) / Math.tan(fov / 2);
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const distH = (width * 0.5) / Math.tan(fovH / 2);
    const dist = Math.max(distV, distH) * (aspect < 0.9 ? 1.22 : 1.12);
    const target = new THREE.Vector3(0.2, (floorCount - 1) * FLOOR_H * 0.46 + 0.4, 0.3);
    const dir = new THREE.Vector3(0.82, 0.7, 1.05).normalize();
    return { target, position: target.clone().add(dir.multiplyScalar(dist)) };
  }

  function snapHome() {
    const pose = framePose();
    controls.target.copy(pose.target);
    camera.position.copy(pose.position);
    controls.update();
    userMoved = false;
    flying = false;
  }

  function fitShadow() {
    buildingCenterY = ((Math.max(floorCount, 1) - 1) * FLOOR_H) / 2;
    const span = Math.max(16, floorCount * 4 + 10);
    const cam = sunLight.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.updateProjectionMatrix();
  }

  function addWindows(parent) {
    const halfW = FLOOR_W / 2;
    const halfD = FLOOR_D / 2;
    for (const x of [-3.8, 0, 3.8]) {
      const frame = box(1.28, 1.12, 0.05, mats.trim, false);
      frame.position.set(x, 1.58, -halfD + WALL_T + 0.02);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.9), mats.windowMat);
      pane.position.set(x, 1.58, -halfD + WALL_T + 0.06);
      pane.castShadow = false;
      parent.add(frame, pane);
    }
    for (const z of [-1.6, 1.3]) {
      for (const side of [-1, 1]) {
        const x = side * (halfW - WALL_T - 0.05);
        const frame = box(0.05, 1.05, 1.15, mats.trim, false);
        frame.position.set(x, 1.62, z);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.82), mats.windowMat);
        pane.position.set(x + side * -0.01, 1.62, z);
        pane.rotation.y = Math.PI / 2;
        pane.castShadow = false;
        parent.add(frame, pane);
      }
    }
  }

  function buildStructure(floors) {
    for (const child of [...structure.children]) {
      structure.remove(child);
      disposeTree(child);
    }
    records = [];
    pickables = [];
    clockHands = null;
    floorCount = floors.length;

    floors.forEach((floor, index) => {
      const group = new THREE.Group();
      group.position.y = index * FLOOR_H;
      const halfW = FLOOR_W / 2;
      const halfD = FLOOR_D / 2;
      const slab = box(FLOOR_W, SLAB, FLOOR_D, mats.wood);
      slab.position.y = -SLAB / 2;
      group.add(slab);
      const back = box(FLOOR_W, WALL_H, WALL_T, mats.plaster);
      back.position.set(0, WALL_H / 2, -halfD + WALL_T / 2);
      const left = box(WALL_T, WALL_H, FLOOR_D, mats.plaster);
      left.position.set(-halfW + WALL_T / 2, WALL_H / 2, 0);
      const right = box(WALL_T, WALL_H, FLOOR_D, mats.plaster);
      right.position.set(halfW - WALL_T / 2, WALL_H / 2, 0);
      group.add(back, left, right);
      addWindows(group);

      const rug = box(9.2, 0.025, 3.2, mats.rugs[index % mats.rugs.length], false);
      rug.position.set(0, 0.02, 1.15);
      group.add(rug);
      const lip = box(FLOOR_W - 0.3, 0.08, 0.1, mats.rugs[index % mats.rugs.length], false);
      lip.position.set(0, 0.05, halfD - 0.08);
      group.add(lip);

      const plantA = makePlant(mats, 1);
      plantA.position.set(-5.7, 0, -3.5);
      const plantB = makePlant(mats, 0.8);
      plantB.position.set(5.6, 0, -3.3);
      group.add(plantA, plantB);

      const sofa = makeSofa(mats);
      sofa.position.set(4.35, 0, 3.15);
      group.add(sofa);

      const cord = box(0.03, 0.28, 0.03, mats.metal, false);
      cord.position.set(0, WALL_H - 0.14, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mats.lampMat);
      bulb.position.set(0, WALL_H - 0.32, 0);
      group.add(cord, bulb);

      if (index === 0) {
        const plinth = box(FLOOR_W + 1.5, 0.36, FLOOR_D + 1.4, mats.stone);
        plinth.position.y = -SLAB - 0.18;
        group.add(plinth);
        for (let s = 0; s < 3; s += 1) {
          const step = box(2.4, 0.14, 0.46, mats.stair);
          step.position.set(0, -0.1 - (2 - s) * 0.16, halfD + 0.15 + (2 - s) * 0.46);
          group.add(step);
        }
        const mat = box(1.1, 0.03, 0.7, mats.roof, false);
        mat.position.set(0, 0.03, halfD - 0.7);
        group.add(mat);
        const clock = makeClock(mats);
        clock.position.set(0, 2.72, -halfD + WALL_T + 0.05);
        group.add(clock);
        clockHands = clock.userData.hands;
      }

      if (index === floors.length - 1) {
        const shape = new THREE.Shape();
        const w = FLOOR_W / 2 + 0.45;
        shape.moveTo(-w, 0);
        shape.lineTo(0, 1.3);
        shape.lineTo(w, 0);
        shape.closePath();
        const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_D + 0.9, bevelEnabled: false });
        roofGeo.translate(0, 0, -(FLOOR_D + 0.9) / 2);
        const roof = shade(new THREE.Mesh(roofGeo, mats.roof));
        roof.position.y = WALL_H - 0.02;
        const chimney = box(0.42, 0.7, 0.42, mats.roofDark);
        chimney.position.set(2.4, WALL_H + 0.85, -0.6);
        const pole = box(0.05, 0.4, 0.05, mats.metal, false);
        pole.position.set(0, WALL_H + 1.45, 0);
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 8, 6),
          new THREE.MeshBasicMaterial({ color: '#fff6ea', toneMapped: false }),
        );
        ball.position.set(0, WALL_H + 1.7, 0);
        group.add(roof, chimney, pole, ball);
      }

      const tag = el('div', 'floor-label');
      tag.textContent = floor.label;
      if (floor.overflowTeams > 0) tag.appendChild(el('span', null, ` +${floor.overflowTeams}`));
      tag.style.borderColor = RUGS[index % RUGS.length];
      const label = new CSS2DObject(tag);
      label.position.set(0, 0.42, halfD + 0.05);
      group.add(label);

      const spots = layoutSpots(floor.bots.length);
      let sleepers = 0;
      floor.bots.forEach((name, botIndex) => {
        const spot = spots[botIndex];
        const look = resolveLook(name, state.looks[name]);
        const visual = createCharacter(name, look);
        visual.root.position.set(spot.x, 0.4, spot.seatZ);
        group.add(visual.root);
        const desk = makeDesk(spot.deskW, mats);
        desk.position.set(spot.x, 0, spot.deskZ);
        const stool = makeStool(mats);
        stool.position.set(spot.x, 0, spot.seatZ);
        group.add(desk, stool);
        if (botIndex === 0) {
          const mug = new THREE.Group();
          const cup = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 8), mats.paper), false);
          cup.position.y = 0.05;
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8), mats.paper);
          handle.rotation.y = Math.PI / 2;
          handle.position.set(0.08, 0.05, 0);
          mug.add(cup, handle);
          mug.position.set(spot.deskW * 0.28, 0.75, 0.12);
          desk.add(mug);
        }
        visual.pickRoot.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.userData.botName = name;
          pickables.push(obj);
        });
        const personaSleep = presentBot(state.bots[name], Date.now(), name).persona === 'sleep';
        const sleepIndex = personaSleep ? sleepers++ : 0;
        records.push({
          name,
          visual,
          seat: { x: spot.x, z: spot.seatZ },
          sleep: { x: 3.55 - sleepIndex * 0.62, z: 3.18, y: 0.46 },
          wander: { minX: -5.2, maxX: 2.3, minZ: 2.55, maxZ: 4.05 },
          screenMat: desk.userData.screenMat,
        });
      });

      if (floor.bots.length === 0) {
        const desk = makeDesk(1.7, mats);
        desk.position.set(0, 0, 1.45);
        const stool = makeStool(mats);
        stool.position.set(0, 0, 0.43);
        group.add(desk, stool);
      }

      if (floor.key === '__ops__') {
        const reception = makeDesk(2.05, mats);
        reception.position.set(-4.6, 0, 3.15);
        reception.rotation.y = -0.5;
        const bell = new THREE.Group();
        const foot = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 8), mats.metal), false);
        const dome = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold), false);
        dome.position.y = 0.03;
        bell.add(foot, dome);
        bell.position.set(0.45, 0.76, 0.05);
        reception.add(bell);
        group.add(reception);
      }

      structure.add(group);
    });

    if (floorCount > 1) {
      for (let level = 0; level < floorCount - 1; level += 1) {
        for (let stepIndex = 0; stepIndex < 7; stepIndex += 1) {
          const step = box(1.05, 0.11, 0.38, mats.stair);
          step.position.set(
            -FLOOR_W / 2 - 0.9,
            level * FLOOR_H + 0.1 + stepIndex * ((FLOOR_H - 0.15) / 7),
            -1.7 + stepIndex * 0.46,
          );
          structure.add(step);
        }
      }
    }
    fitShadow();
    applyMood(currentMood);
  }

  function signature(floors) {
    const parts = [];
    for (const floor of floors) {
      parts.push(floor.key, floor.label, String(floor.overflowTeams), floor.bots.join('\u0001'));
    }
    for (const name of state.roster) {
      const look = resolveLook(name, state.looks[name]);
      parts.push(look.shape, look.color, look.accessory);
    }
    return parts.join('\u0002');
  }

  function setState(next) {
    state = next;
    const floors = floorPlan(next);
    const sig = signature(floors);
    if (sig !== builtSig) {
      builtSig = sig;
      buildStructure(floors);
      if (!userMoved) snapHome();
    }
  }

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.botName || null : null;
  }

  function focus(name) {
    selected = name || null;
    if (!name) return;
    const record = records.find((item) => item.name === name);
    if (!record) return;
    record.visual.root.getWorldPosition(tmp);
    flyTarget.set(tmp.x, tmp.y + 0.55, tmp.z);
    flyPos.set(tmp.x + 2.4, tmp.y + 2.7, Math.max(tmp.z + 3.6, FLOOR_D / 2 + 1.8));
    flying = true;
    flyKind = 'bot';
    userMoved = true;
  }

  function resetCamera() {
    const pose = framePose();
    flyTarget.copy(pose.target);
    flyPos.copy(pose.position);
    flying = true;
    flyKind = 'home';
  }

  controls.addEventListener('start', () => {
    flying = false;
    userMoved = true;
  });

  const down = { active: false, id: 0, x: 0, y: 0 };
  renderer.domElement.addEventListener('pointerdown', (event) => {
    down.active = true;
    down.id = event.pointerId;
    down.x = event.clientX;
    down.y = event.clientY;
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!down.active || event.pointerId !== down.id) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    down.active = false;
    if (dx * dx + dy * dy > 49) return;
    hooks.onPick(pick(event.clientX, event.clientY));
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const name = pick(event.clientX, event.clientY);
    if (name === hovered) return;
    hovered = name;
    renderer.domElement.style.cursor = name ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hovered = null;
    renderer.domElement.style.cursor = '';
  });

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    if (!userMoved && builtSig) snapHome();
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(stage);
  resize();
  applyMood(currentMood);

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    frames += 1;
    if (flying) {
      const alpha = 1 - Math.exp(-4.2 * dt);
      controls.target.lerp(flyTarget, alpha);
      camera.position.lerp(flyPos, alpha);
      if (camera.position.distanceTo(flyPos) < 0.06) {
        flying = false;
        if (flyKind === 'home') userMoved = false;
      }
    }
    controls.update();

    const nowDate = new Date();
    const now = nowDate.getTime();
    if (frames === 1 || frames % 180 === 0) applyMood(sceneMood(nowDate));
    if (clockHands) {
      const seconds = nowDate.getSeconds() + nowDate.getMilliseconds() / 1000;
      const minutes = nowDate.getMinutes() + seconds / 60;
      const hours = (nowDate.getHours() % 12) + minutes / 60;
      clockHands.hour.rotation.z = (-hours * Math.PI * 2) / 12;
      clockHands.minute.rotation.z = (-minutes * Math.PI * 2) / 60;
      clockHands.second.rotation.z = reduce ? clockHands.second.rotation.z : (-seconds * Math.PI * 2) / 60;
    }
    clouds.forEach((cloud, index) => {
      cloud.position.x = cloud.userData.baseX + Math.sin(elapsed * 0.07 + index) * 1.6;
      cloud.visible = !currentMood.night;
    });

    let selectedRecord = null;
    for (const record of records) {
      const presentation = presentBot(state?.bots[record.name], now, record.name);
      const mode = visualMode(presentation);
      let fade = 1;
      if (presentation.quiet) {
        const into = presentation.age - STALE_MS;
        if (into >= 0 && into < 1600) fade = 0.55 + 0.45 * (into / 1600);
      }
      updateCharacter(record.visual, {
        dt,
        t: elapsed,
        mode,
        fade,
        celebrateT: mode === 'celebrate' ? Math.min(1, presentation.age / DONE_MS) : 0,
        seat: record.seat,
        sleep: record.sleep,
        wander: record.wander,
        camera,
        reduce,
        showStep: hovered === record.name || selected === record.name,
        showName: stage.clientWidth >= 820 || hovered === record.name || selected === record.name,
        step: presentation.step,
      });
      const screen = record.screenMat;
      if (presentation.status === 'working') {
        screen.color.copy(workA).lerp(workB, 0.5 + 0.5 * Math.sin(elapsed * 5 + record.visual.phase));
      } else if (presentation.status === 'waiting_user') screen.color.set('#ffe3a6');
      else if (presentation.status === 'error') screen.color.set('#ffb1a8');
      else if (presentation.status === 'done') screen.color.set('#ffe7a0');
      else screen.color.set('#2a3142');
      if (selected === record.name) selectedRecord = record;
    }

    if (selectedRecord) {
      selectedRecord.visual.root.getWorldPosition(tmp);
      ring.visible = true;
      ring.position.set(tmp.x, tmp.y - selectedRecord.visual.root.position.y + 0.045, tmp.z);
      ring.rotation.z = elapsed * 0.7;
      const pulse = 1 + Math.sin(elapsed * 3) * 0.06;
      ring.scale.setScalar(pulse);
    } else {
      ring.visible = false;
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (frames === 1) document.body.dataset.ready = '1';
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
    focus,
    clearSelection() {
      selected = null;
    },
    resetCamera,
    setReduce(value) {
      reduce = !!value;
    },
    resize,
  };
}

function blankOffice() {
  return {
    setState() {},
    focus() {},
    clearSelection() {},
    resetCamera() {},
    setReduce() {},
    resize() {},
  };
}
