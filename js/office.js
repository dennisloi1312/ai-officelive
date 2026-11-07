import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createCharacter, disposeOwned } from "./characters.js";
import { effectiveStatus, idleModeFor, planFloors, resolveLook, visibleNames } from "./state.js";

const FLOOR_H = 3.2;
const SLAB = 0.24;
const WIDTH = 12.8;
const DEPTH = 8.1;
const CELEBRATE_MS = 2800;

const ACCENTS = ["#f0b59a", "#f3d7a4", "#d5e4c4", "#e4d2f2", "#f6e0a8", "#f4c9d4"];

function floorY(index) {
  return index * FLOOR_H + SLAB;
}

function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#e4b56e";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 === 0 ? "rgba(176, 112, 48, 0.16)" : "rgba(255, 236, 196, 0.18)";
    g.fillRect(0, i * 32, 256, 32);
    g.strokeStyle = "rgba(120, 72, 28, 0.28)";
    g.beginPath();
    g.moveTo(0, i * 32 + 0.5);
    g.lineTo(256, i * 32 + 0.5);
    g.stroke();
    g.strokeStyle = "rgba(255, 248, 230, 0.25)";
    g.beginPath();
    g.moveTo(20 + ((i * 47) % 80), i * 32 + 10);
    g.bezierCurveTo(80, i * 32 + 6, 140, i * 32 + 22, 230, i * 32 + 12);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  return texture;
}

function lotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(256, 256, 30, 256, 256, 250);
  grad.addColorStop(0, "#f3ddb8");
  grad.addColorStop(0.55, "#e7c89a");
  grad.addColorStop(1, "#d2b184");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 48; i += 1) {
    g.fillStyle = `rgba(140, 90, 48, ${0.04 + (i % 5) * 0.015})`;
    g.beginPath();
    g.arc(18 + ((i * 97) % 476), 24 + ((i * 61) % 460), 1.5 + (i % 4), 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff6ea";
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = "#e0b089";
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = "#6a4632";
  g.font = "700 72px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("AI OFFICE", 256, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const SKY_STOPS = [
  { h: 0, top: "#1a2140", horizon: "#34325c", light: 0.38, window: 0.9, star: 1, lamp: 1, sun: "#ffd7a8" },
  { h: 5.4, top: "#243056", horizon: "#4d3d6c", light: 0.42, window: 0.8, star: 0.9, lamp: 1, sun: "#ffc08a" },
  { h: 6.5, top: "#f3b18a", horizon: "#f6d7b8", light: 0.78, window: 0.28, star: 0, lamp: 0.4, sun: "#ffe0b5" },
  { h: 7.5, top: "#8ecff5", horizon: "#f7e7cf", light: 1, window: 0.02, star: 0, lamp: 0.16, sun: "#fff6e4" },
  { h: 16.4, top: "#7ec4ef", horizon: "#f4e2c4", light: 1, window: 0.02, star: 0, lamp: 0.16, sun: "#fff1d6" },
  { h: 18.1, top: "#f0946a", horizon: "#f6c9a4", light: 0.68, window: 0.5, star: 0.12, lamp: 0.7, sun: "#ffb07a" },
  { h: 19.6, top: "#2a3568", horizon: "#463e6e", light: 0.36, window: 0.92, star: 0.9, lamp: 1, sun: "#d5e2ff" },
  { h: 24, top: "#1a2140", horizon: "#34325c", light: 0.38, window: 0.9, star: 1, lamp: 1, sun: "#ffd7a8" },
];

function mixHex(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

function skyAt(date) {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let i = 0;
  while (i < SKY_STOPS.length - 2 && hour > SKY_STOPS[i + 1].h) i += 1;
  const a = SKY_STOPS[i];
  const b = SKY_STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h || 1)));
  return {
    hour,
    top: mixHex(a.top, b.top, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    sun: mixHex(a.sun, b.sun, t),
    light: a.light + (b.light - a.light) * t,
    window: a.window + (b.window - a.window) * t,
    star: a.star + (b.star - a.star) * t,
    lamp: a.lamp + (b.lamp - a.lamp) * t,
  };
}

function matCache() {
  const cache = new Map();
  return (color, extra) => {
    const key = `${color}|${extra ? JSON.stringify(extra) : ""}`;
    if (!cache.has(key)) {
      cache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
    }
    return cache.get(key);
  };
}

function addBox(parent, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function layoutSeats(count) {
  if (count <= 0) return { seats: [], scale: 1 };
  const cols = count <= 3 ? count : Math.min(5, Math.ceil(Math.sqrt(count * 1.25)));
  const rows = Math.ceil(count / cols);
  const spanX = Math.min(2.35, 10.2 / cols);
  const spanZ = rows === 1 ? 0 : Math.min(2.35, 4.6 / (rows - 1));
  const scale = THREE.MathUtils.clamp(spanX / 2.15, 0.58, 1);
  const seats = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowCount = row === rows - 1 ? count - row * cols : cols;
    const x = (col - (rowCount - 1) / 2) * spanX;
    const z = rows === 1 ? -0.15 : -1.7 + row * spanZ;
    seats.push({ x, z });
  }
  return { seats, scale };
}

function buildDesk(lambert, accent) {
  const group = new THREE.Group();
  const wood = lambert("#e0a15c");
  const woodDark = lambert("#b8743f");
  const cream = lambert("#f6d7c4");
  const ink = lambert("#3c4150");
  const seat = addBox(group, 0.48, 0.1, 0.46, cream, 0, 0.46, -0.02);
  seat.castShadow = true;
  seat.receiveShadow = true;
  const back = addBox(group, 0.48, 0.38, 0.08, cream, 0, 0.68, -0.24);
  back.castShadow = true;
  for (const [x, z] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.12], [0.18, 0.12]]) {
    const leg = addBox(group, 0.06, 0.42, 0.06, woodDark, x, 0.21, z);
    leg.castShadow = true;
  }
  const top = addBox(group, 1.16, 0.08, 0.62, wood, 0, 0.76, 0.62);
  top.castShadow = true;
  top.receiveShadow = true;
  for (const [x, z] of [[-0.48, 0.4], [0.48, 0.4], [-0.48, 0.84], [0.48, 0.84]]) {
    const leg = addBox(group, 0.07, 0.72, 0.07, woodDark, x, 0.36, z);
    leg.castShadow = true;
  }
  const bezel = addBox(group, 0.52, 0.36, 0.05, ink, 0.22, 1.08, 0.46);
  bezel.rotation.y = -0.62;
  bezel.castShadow = true;
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x9fd7ee });
  screenMat.userData.owned = true;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.02), screenMat);
  screen.position.set(0, 0, 0.03);
  bezel.add(screen);
  const stand = addBox(group, 0.08, 0.16, 0.08, ink, 0.22, 0.88, 0.5);
  stand.castShadow = true;
  const keys = addBox(group, 0.34, 0.03, 0.12, lambert("#ece7e1"), -0.08, 0.82, 0.58);
  keys.castShadow = true;
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.09, 10), lambert(accent));
  mug.position.set(-0.36, 0.86, 0.7);
  mug.castShadow = true;
  group.add(mug);
  return { group, screenMat };
}

function buildPlant(lambert, scale) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.13 * scale, 0.18 * scale, 8), lambert("#e07a5f"));
  pot.position.y = 0.1 * scale;
  pot.castShadow = true;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.13 * scale, 0.04 * scale, 8), lambert("#6b4a32"));
  soil.position.y = 0.18 * scale;
  const leafGeo = new THREE.SphereGeometry(0.16 * scale, 8, 6);
  const leafMat = lambert("#6dbf73");
  for (const [x, y, z] of [[0, 0.38, 0], [-0.12, 0.3, 0.06], [0.12, 0.32, -0.04]]) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x * scale, y * scale, z * scale);
    leaf.castShadow = true;
    group.add(leaf);
  }
  group.add(pot, soil);
  return group;
}

function buildBuilding(floorNames, lambert, textures) {
  const group = new THREE.Group();
  const floors = Math.max(1, floorNames.length);
  const wall = lambert("#f4e4d2");
  const trim = lambert("#e7b18a");
  const edge = lambert("#c48a55");
  const rail = lambert("#fff8f0");
  const ink = lambert("#6a4632");
  const woodMat = new THREE.MeshLambertMaterial({ map: textures.wood, flatShading: true });
  const glassMats = [];
  const lampMats = [];
  const clocks = [];
  const signs = [];

  const height = floors * FLOOR_H;
  const plinth = addBox(group, WIDTH + 0.8, 0.28, DEPTH + 0.7, lambert("#e7c39a"), 0, 0.14, 0);
  plinth.receiveShadow = true;

  for (let i = 0; i < floors; i += 1) {
    const y = i * FLOOR_H;
    const top = floorY(i);
    const slab = addBox(group, WIDTH, SLAB, DEPTH, edge, 0, y + SLAB / 2, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    const floor = addBox(group, WIDTH - 0.28, 0.05, DEPTH - 0.28, woodMat, 0, top + 0.02, 0);
    floor.receiveShadow = true;

    const back = addBox(group, WIDTH, FLOOR_H - SLAB, 0.16, wall, 0, y + SLAB + (FLOOR_H - SLAB) / 2, -DEPTH / 2 + 0.08);
    back.receiveShadow = true;
    const left = addBox(group, 0.16, FLOOR_H - SLAB, DEPTH, wall, -WIDTH / 2 + 0.08, y + SLAB + (FLOOR_H - SLAB) / 2, 0);
    left.receiveShadow = true;
    const right = addBox(group, 0.16, FLOOR_H - SLAB, DEPTH, trim, WIDTH / 2 - 0.08, y + SLAB + (FLOOR_H - SLAB) / 2, 0);
    right.receiveShadow = true;

    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xc5e4f6,
      emissive: 0xffb36b,
      emissiveIntensity: 0,
      flatShading: true,
    });
    glassMats.push(glassMat);
    for (const x of [-3.4, 0, 3.4]) {
      const frame = addBox(group, 1.5, 1.15, 0.08, lambert("#fffaf4"), x, top + 1.45, -DEPTH / 2 + 0.2);
      const pane = addBox(group, 1.22, 0.9, 0.05, glassMat, x, top + 1.48, -DEPTH / 2 + 0.26);
      pane.castShadow = false;
      frame.castShadow = true;
    }

    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe1b0 });
    lampMats.push(lampMat);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampMat);
    bulb.position.set(0, y + FLOOR_H - 0.28, 0);
    group.add(bulb);
    addBox(group, 0.03, 0.22, 0.03, ink, 0, y + FLOOR_H - 0.12, 0);

    const railY = top + 0.2;
    addBox(group, WIDTH - 0.4, 0.1, 0.1, rail, 0, railY, DEPTH / 2 - 0.12);
    addBox(group, 0.1, 0.28, 0.1, trim, -WIDTH / 2 + 0.4, top + 0.28, DEPTH / 2 - 0.12);
    addBox(group, 0.1, 0.28, 0.1, trim, WIDTH / 2 - 0.4, top + 0.28, DEPTH / 2 - 0.12);

    const rugColor = ACCENTS[i % ACCENTS.length];
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.045, 18), lambert(rugColor));
    rug.position.set(i === 0 ? 3.15 : -3.7, top + 0.05, 1.85);
    rug.castShadow = true;
    rug.receiveShadow = true;
    group.add(rug);

    const plantA = buildPlant(lambert, 1);
    plantA.position.set(-WIDTH / 2 + 0.7, top, -DEPTH / 2 + 0.7);
    const plantB = buildPlant(lambert, 0.85);
    plantB.position.set(WIDTH / 2 - 0.7, top, DEPTH / 2 - 0.85);
    group.add(plantA, plantB);

    const clock = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), lambert("#fffaf4"));
    face.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 16), ink);
    const hourHand = new THREE.Group();
    const minuteHand = new THREE.Group();
    addBox(hourHand, 0.035, 0.14, 0.02, ink, 0, 0.07, 0.05);
    addBox(minuteHand, 0.025, 0.2, 0.02, lambert("#e07a5f"), 0, 0.1, 0.06);
    clock.add(face, rim, hourHand, minuteHand);
    clock.position.set(2.4, top + 1.72, -DEPTH / 2 + 0.28);
    group.add(clock);
    clocks.push({ hourHand, minuteHand });

    const signEl = document.createElement("div");
    signEl.className = `floor-sign f${i}`;
    signEl.textContent = floorNames[i];
    const sign = new CSS2DObject(signEl);
    sign.position.set(-WIDTH / 2 + 1.35, top + 2.2, DEPTH / 2 + 0.02);
    group.add(sign);
    signs.push(sign);

    if (floorNames[i] && floorNames[i].toLowerCase() === "ops") {
      const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.62), lambert("#f3b7be"));
      sofa.position.set(3.4, top + 0.42, 1.55);
      sofa.castShadow = true;
      sofa.receiveShadow = true;
      const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 0.16), lambert("#e89aaa"));
      sofaBack.position.set(3.4, top + 0.7, 1.28);
      sofaBack.castShadow = true;
      group.add(sofa, sofaBack);
      const big = buildPlant(lambert, 1.35);
      big.position.set(-4.6, top, 1.7);
      group.add(big);
    }
  }

  const roof = addBox(group, WIDTH + 0.9, 0.28, DEPTH + 0.7, lambert("#e07a5f"), 0, height + 0.14, 0);
  roof.castShadow = true;
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.85, 0.08), new THREE.MeshBasicMaterial({ map: textures.sign }));
  signBoard.position.set(0, height + 0.7, DEPTH / 2 + 0.16);
  group.add(signBoard);

  if (floors > 0) {
    for (let i = 0; i < 5; i += 1) {
      const awning = addBox(
        group,
        1.15,
        0.08,
        0.7,
        lambert(i % 2 === 0 ? "#f28b82" : "#fff6ea"),
        -2.3 + i * 1.15,
        floorY(0) + 2.35,
        DEPTH / 2 + 0.12,
      );
      awning.castShadow = true;
    }
  }

  return { group, glassMats, lampMats, clocks, signs, floors };
}

function makeLabel(name) {
  const anchor = document.createElement("div");
  anchor.className = "tag";

  const bang = document.createElement("div");
  bang.className = "bubble bang";
  bang.textContent = "!";
  bang.hidden = true;

  const bad = document.createElement("div");
  bad.className = "bubble bad";
  bad.textContent = "×";
  bad.hidden = true;

  const step = document.createElement("div");
  step.className = "bubble step";
  step.hidden = true;

  const zzz = document.createElement("div");
  zzz.className = "zzz";
  zzz.hidden = true;
  for (const glyph of ["z", "z", "Z"]) {
    const span = document.createElement("span");
    span.textContent = glyph;
    zzz.appendChild(span);
  }

  const nameEl = document.createElement("div");
  nameEl.className = "nametag";
  nameEl.textContent = name;

  anchor.append(bang, bad, step, zzz, nameEl);
  return { anchor, bang, bad, step, zzz, nameEl };
}

function disposeMeshTree(object) {
  object.traverse((node) => {
    if (node.geometry && !node.geometry.userData.keep) node.geometry.dispose();
    if (node.material && node.material.userData && node.material.userData.owned) node.material.dispose();
  });
}

export function createOffice(viewport, handlers) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
  camera.position.set(16, 12, 18);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    handlers.onViewError?.();
    return {
      sync() {},
      focus() {},
      setSelected() {},
      resize() {},
      dispose() {},
    };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = "view";
  viewport.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "labels";
  viewport.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.04;
  controls.minPolarAngle = 0.18;
  controls.minDistance = 4.5;
  controls.maxDistance = 42;
  controls.target.set(0, 3.2, 0);
  controls.zoomSpeed = 0.85;
  controls.rotateSpeed = 0.8;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  controls.enablePan = !coarse;
  controls.update();

  const hemi = new THREE.HemisphereLight(0xfff4e5, 0xe7c8a4, 2);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff6ea, 3.3);
  sunLight.position.set(10, 18, 14);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.radius = 3;
  sunLight.shadow.blurSamples = 6;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.04;
  const shadowCam = sunLight.shadow.camera;
  shadowCam.near = 1;
  shadowCam.far = 60;
  shadowCam.left = -18;
  shadowCam.right = 18;
  shadowCam.top = 18;
  shadowCam.bottom = -18;
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0xffe6cf, 1.15);
  fill.position.set(-8, 10, 8);
  scene.add(fill);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color("#8ecff5") },
      bottomColor: { value: new THREE.Color("#f7e7cf") },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vec3 n = normalize(position);
        vH = n.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vH;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      void main() {
        float t = smoothstep(-0.05, 0.55, vH);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 20, 14), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const starPositions = [];
  for (let i = 0; i < 180; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const y = 8 + Math.random() * 62;
    const r = Math.sqrt(Math.max(0, 70 * 70 - y * y));
    starPositions.push(Math.cos(theta) * r, y, Math.sin(theta) * r * 0.65 - 10);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xfff8ea,
    size: 0.45,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(3.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf6f1e6 }));
  scene.add(sun, moon);

  const textures = { wood: woodTexture(), sign: signTexture(), lot: lotTexture() };
  const lambert = matCache();
  const lot = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshLambertMaterial({ map: textures.lot }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.y = 0;
  lot.receiveShadow = true;
  scene.add(lot);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.045, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc857 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const bots = new Map();
  const pickables = [];
  let building = null;
  let floorKey = "";
  let selected = null;
  let hovered = null;
  let focusAnim = null;
  let userMoved = false;
  let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = true;
  let last = performance.now();

  const screenBright = new THREE.Color(0xe7f7ff);
  const screenWork = new THREE.Color(0x7ec8ea);
  const screenIdle = new THREE.Color(0x9bb0be);
  const screenError = new THREE.Color(0xff8d84);
  const screenDone = new THREE.Color(0xb6f3c4);
  const windowDay = new THREE.Color(0xc5e4f6);
  const windowNight = new THREE.Color(0x1d2744);
  const lampOff = new THREE.Color(0x8a7560);
  const lampOn = new THREE.Color(0xffe1b0);

  function resize() {
    const w = Math.max(1, viewport.clientWidth);
    const h = Math.max(1, viewport.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 800 ? 1.25 : 1.6));
    renderer.setSize(w, h, true);
    labelRenderer.setSize(w, h);
    if (!userMoved && !focusAnim) frameBuilding(floorCount, true);
  }

  let floorCount = 1;

  function frameBuilding(count, immediate) {
    floorCount = Math.max(1, count);
    const h = floorCount * FLOOR_H;
    const narrow = camera.aspect < 0.9;
    const targetY = Math.max(1.5, (h - FLOOR_H) * 0.46 + 0.2);
    const dist = (16.2 + Math.max(0, floorCount - 1) * 1.65) * (narrow ? 1.28 : 1);
    controls.maxDistance = 32 + floorCount * 4;
    if (immediate || !userMoved) {
      controls.target.set(0, targetY, 0);
      camera.position.set(dist * 0.74, dist * (narrow ? 0.7 : 0.56), dist * 0.9);
      controls.update();
    }
  }

  function clearBuilding() {
    if (!building) return;
    scene.remove(building.group);
    for (const sign of building.signs) sign.removeFromParent();
    disposeMeshTree(building.group);
    building = null;
  }

  function removeBot(name) {
    const bot = bots.get(name);
    if (!bot) return;
    scene.remove(bot.root);
    scene.remove(bot.desk);
    bot.label.removeFromParent();
    disposeOwned(bot.root);
    disposeMeshTree(bot.desk);
    if (bot.screenMat) bot.screenMat.dispose();
    if (bot.sparkMat) bot.sparkMat.dispose();
    bots.delete(name);
  }

  function addBot(name, look) {
    const character = createCharacter(look);
    const { anchor, bang, bad, step, zzz, nameEl } = makeLabel(name);
    const label = new CSS2DObject(anchor);
    label.position.set(0, character.headY + 0.08, 0);
    character.root.add(label);

    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    sparkMat.userData.owned = true;
    const sparkles = [];
    const sparkGeo = new THREE.OctahedronGeometry(0.055, 0);
    for (let i = 0; i < 8; i += 1) {
      const mesh = new THREE.Mesh(sparkGeo, sparkMat);
      mesh.visible = false;
      character.root.add(mesh);
      sparkles.push(mesh);
    }

    const desk = buildDesk(lambert, ACCENTS[hashHue(name) % ACCENTS.length]);
    scene.add(character.root, desk.group);

    const bot = {
      name,
      lookKey: lookKey(look),
      root: character.root,
      body: character.body,
      leftArm: character.leftArm,
      rightArm: character.rightArm,
      eyes: character.eyes,
      mouth: character.mouth,
      label,
      bang,
      bad,
      stepEl: step,
      zzz,
      nameEl,
      desk: desk.group,
      screenMat: desk.screenMat,
      sparkles,
      sparkMat,
      seat: new THREE.Vector3(),
      stand: new THREE.Vector3(),
      floorBase: 0,
      scale: 1,
      wander: new THREE.Vector3(),
      wanderWait: 0,
      placed: false,
      rawStatus: "idle",
      at: 0,
      step: "",
      celebrateUntil: 0,
      blinkIn: 1.5 + Math.random() * 2,
      blinking: 0,
      idleMode: idleModeFor(name),
    };
    bots.set(name, bot);
    return bot;
  }

  function retagPickables() {
    pickables.length = 0;
    for (const bot of bots.values()) {
      bot.root.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.bot = bot.name;
        pickables.push(node);
      });
      bot.desk.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.bot = bot.name;
        pickables.push(node);
      });
    }
  }

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    return hits[0].object.userData.bot || null;
  }

  const raycaster = new THREE.Raycaster();
  let pointerDown = null;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDown || pointerDown.id !== event.pointerId) return;
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    pointerDown = null;
    if (dx * dx + dy * dy > 36) return;
    const name = pick(event.clientX, event.clientY);
    handlers.onSelect?.(name);
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const name = pick(event.clientX, event.clientY);
    renderer.domElement.style.cursor = name ? "pointer" : "";
    if (name !== hovered) {
      hovered = name;
      refreshBubbles();
    }
  });
  controls.addEventListener("start", () => {
    focusAnim = null;
    userMoved = true;
  });

  function refreshBubbles() {
    for (const bot of bots.values()) {
      const show = Boolean(bot.step) && (bot.name === hovered || bot.name === selected);
      bot.stepEl.hidden = !show;
      if (show && bot.stepEl.textContent !== bot.step) bot.stepEl.textContent = bot.step;
    }
  }

  function sync(state) {
    const names = visibleNames(state);
    const plan = planFloors(names, state.groups);
    const key = plan.floors.join("\u0001");
    if (key !== floorKey) {
      clearBuilding();
      building = buildBuilding(plan.floors, lambert, textures);
      scene.add(building.group);
      floorKey = key;
      frameBuilding(plan.floors.length, !userMoved);
    }

    const byFloor = plan.floors.map(() => []);
    for (const assignment of plan.assignments) byFloor[assignment.floor].push(assignment);

    const keep = new Set(names);
    for (const name of [...bots.keys()]) {
      if (!keep.has(name)) removeBot(name);
    }

    for (let floor = 0; floor < byFloor.length; floor += 1) {
      const { seats, scale } = layoutSeats(byFloor[floor].length);
      byFloor[floor].forEach((assignment, index) => {
        const look = resolveLook(assignment.name, state.looks[assignment.name]);
        const keyLook = lookKey(look);
        let bot = bots.get(assignment.name);
        if (!bot) bot = addBot(assignment.name, look);
        else if (bot.lookKey !== keyLook) {
          disposeOwned(bot.body);
          bot.root.remove(bot.body);
          const next = createCharacter(look);
          bot.body = next.body;
          bot.leftArm = next.leftArm;
          bot.rightArm = next.rightArm;
          bot.eyes = next.eyes;
          bot.mouth = next.mouth;
          bot.root.add(next.body);
          bot.label.position.y = next.headY + 0.08;
          bot.lookKey = keyLook;
        }
        const seat = seats[index] || { x: 0, z: 0 };
        const base = floorY(floor);
        bot.floorBase = base;
        bot.scale = scale;
        bot.seat.set(seat.x, base + 0.46 * scale, seat.z);
        bot.stand.set(seat.x, base, seat.z + 1.05);
        bot.desk.position.set(seat.x, base, seat.z);
        bot.desk.scale.setScalar(scale);
        if (!bot.placed) {
          bot.root.position.copy(bot.seat);
          bot.placed = true;
        }
        const info = state.bots[assignment.name] || { status: "idle", step: "", at: 0 };
        if (info.status === "done" && (bot.rawStatus !== "done" || bot.at !== info.at)) {
          bot.celebrateUntil = performance.now() + CELEBRATE_MS;
        }
        bot.rawStatus = info.status;
        bot.at = info.at || 0;
        bot.step = info.step || "";
        if (bot.stepEl.textContent !== bot.step) bot.stepEl.textContent = bot.step;
        if (bot.nameEl.textContent !== assignment.name) bot.nameEl.textContent = assignment.name;
      });
    }
    retagPickables();
    refreshBubbles();
  }

  function focus(name) {
    const bot = bots.get(name);
    if (!bot) return;
    // Keep the camera in front of the open face so an upper floor never hides the bot.
    const destTarget = new THREE.Vector3(bot.root.position.x, bot.floorBase + 0.95, bot.root.position.z);
    const toPos = new THREE.Vector3(destTarget.x + 2.2, bot.floorBase + 2.15, DEPTH / 2 + 3.6);
    focusAnim = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget: destTarget,
      start: performance.now(),
    };
  }

  function setSelected(name) {
    selected = name;
    refreshBubbles();
  }

  function updateBot(bot, dt, elapsed, now) {
    let mode = effectiveStatus({ status: bot.rawStatus, at: bot.at }, now);
    const celebrating = bot.rawStatus === "done" && nowPerfWithin(bot, elapsed);
    if (mode === "done" && !celebrating) mode = "happy";
    if (reduceMotion && mode === "done") mode = "happy";

    const seated = mode === "working" || mode === "happy" || mode === "error" || (mode === "idle" && bot.idleMode === "sleep") || mode === "done";
    const goal = seated ? bot.seat : mode === "waiting_user" ? bot.stand : null;

    if (mode === "idle" && bot.idleMode === "wander" && !reduceMotion) {
      if (bot.wanderWait > 0) {
        bot.wanderWait -= dt;
      } else if (bot.root.position.distanceTo(bot.wander) < 0.12 || bot.wander.lengthSq() === 0) {
        bot.wanderWait = 1.2 + Math.random() * 2.2;
        bot.wander.set(
          THREE.MathUtils.clamp(bot.seat.x + (Math.random() * 2 - 1) * 2.2, -4.8, 4.8),
          bot.floorBase,
          THREE.MathUtils.clamp(bot.seat.z + 0.4 + Math.random() * 1.8, -2.4, 2.6),
        );
      } else {
        const dx = bot.wander.x - bot.root.position.x;
        const dz = bot.wander.z - bot.root.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        const step = Math.min(dist, dt * 0.85);
        bot.root.position.x += (dx / dist) * step;
        bot.root.position.z += (dz / dist) * step;
        const face = Math.atan2(dx, dz);
        bot.root.rotation.y = dampAngle(bot.root.rotation.y, face, 6, dt);
        bot.leftArm.rotation.x = Math.sin(elapsed * 8) * 0.45;
        bot.rightArm.rotation.x = -Math.sin(elapsed * 8) * 0.45;
      }
      bot.root.position.y = damp(bot.root.position.y, bot.floorBase, 6, dt);
    } else if (goal) {
      bot.root.position.x = damp(bot.root.position.x, goal.x, 4.5, dt);
      bot.root.position.z = damp(bot.root.position.z, goal.z, 4.5, dt);
      const baseY = goal.y;
      let y = baseY;
      if (mode === "done" && !reduceMotion) {
        const u = 1 - Math.max(0, bot.celebrateUntil - performance.now()) / CELEBRATE_MS;
        y += Math.abs(Math.sin(u * Math.PI * 3)) * 0.42;
      } else if (mode === "working" && !reduceMotion) {
        y += Math.sin(elapsed * 8) * 0.025;
      }
      bot.root.position.y = damp(bot.root.position.y, y, 6, dt);
      const face = mode === "waiting_user" ? 0.15 : 0.05;
      bot.root.rotation.y = dampAngle(bot.root.rotation.y, face, 5, dt);
    }

    const slumpX = mode === "error" ? 0.38 : mode === "idle" && bot.idleMode === "sleep" ? 0.18 : 0;
    const slumpZ = mode === "error" ? 0.32 : 0;
    bot.body.rotation.x = damp(bot.body.rotation.x, slumpX, 4, dt);
    bot.body.rotation.z = damp(bot.body.rotation.z, slumpZ, 4, dt);

    const pulse = mode === "waiting_user" && !reduceMotion ? 1 + Math.sin(elapsed * 3) * 0.035 : 1;
    const s = bot.scale * pulse;
    bot.body.scale.setScalar(s);

    if (mode === "working") {
      bot.leftArm.rotation.x = -0.8 + Math.sin(elapsed * 14) * 0.45;
      bot.rightArm.rotation.x = -0.8 + Math.sin(elapsed * 14 + Math.PI) * 0.45;
    } else if (mode === "waiting_user") {
      bot.rightArm.rotation.x = damp(bot.rightArm.rotation.x, -2.45, 6, dt);
      bot.leftArm.rotation.x = damp(bot.leftArm.rotation.x, -0.25, 6, dt);
    } else if (mode === "error" || (mode === "idle" && bot.idleMode === "sleep")) {
      bot.leftArm.rotation.x = damp(bot.leftArm.rotation.x, 0.55, 4, dt);
      bot.rightArm.rotation.x = damp(bot.rightArm.rotation.x, 0.7, 4, dt);
    } else if (mode !== "idle") {
      bot.leftArm.rotation.x = damp(bot.leftArm.rotation.x, -0.35, 4, dt);
      bot.rightArm.rotation.x = damp(bot.rightArm.rotation.x, -0.35, 4, dt);
    }

    bot.bang.hidden = mode !== "waiting_user";
    bot.bad.hidden = mode !== "error";
    bot.zzz.hidden = !(mode === "idle" && bot.idleMode === "sleep");

    bot.blinkIn -= dt;
    if (bot.blinkIn < 0) {
      bot.blinkIn = 2.4 + Math.random() * 3;
      bot.blinking = 0.12;
    }
    if (bot.blinking > 0) bot.blinking -= dt;
    const eyeScale = bot.blinking > 0 ? 0.15 : mode === "idle" && bot.idleMode === "sleep" ? 0.22 : 1;
    for (const eye of bot.eyes) {
      if (eye.userData.baseY === undefined) eye.userData.baseY = eye.scale.y || 1;
      eye.scale.y = eye.userData.baseY * eyeScale;
    }

    if (bot.mouth) {
      bot.mouth.rotation.z = mode === "error" ? 0.05 : Math.PI;
      const smile = mode === "happy" || mode === "done" ? 1.25 : 1;
      bot.mouth.scale.setScalar(smile);
    }

    const glow = 0.5 + 0.5 * Math.sin(elapsed * 6);
    if (mode === "working") bot.screenMat.color.copy(screenWork).lerp(screenBright, glow);
    else if (mode === "error") bot.screenMat.color.copy(screenError);
    else if (mode === "done" || mode === "happy") bot.screenMat.color.copy(screenDone);
    else bot.screenMat.color.copy(screenIdle);

    const showSpark = mode === "done" && !reduceMotion;
    bot.sparkles.forEach((spark, index) => {
      spark.visible = showSpark;
      if (!showSpark) return;
      const u = 1 - Math.max(0, bot.celebrateUntil - performance.now()) / CELEBRATE_MS;
      const angle = (index / bot.sparkles.length) * Math.PI * 2;
      const radius = 0.15 + u * 0.75;
      spark.position.set(Math.cos(angle) * radius, 0.55 + u * 1.15, Math.sin(angle) * radius);
      spark.scale.setScalar(1 - u * 0.4);
    });
    bot.sparkMat.opacity = showSpark ? Math.max(0, (bot.celebrateUntil - performance.now()) / CELEBRATE_MS) : 0;

    if (bot.name === selected) {
      ring.visible = true;
      ring.position.set(bot.root.position.x, bot.floorBase + 0.06, bot.root.position.z);
      ring.rotation.z = elapsed * 0.8;
    }
  }

  function nowPerfWithin(bot) {
    return performance.now() < bot.celebrateUntil;
  }

  function updateSky(date) {
    const skyState = skyAt(date);
    skyMat.uniforms.topColor.value.copy(skyState.top);
    skyMat.uniforms.bottomColor.value.copy(skyState.horizon);
    scene.fog = scene.fog || new THREE.Fog(0xffffff, 42, 96);
    scene.fog.color.copy(skyState.horizon);
    scene.background = skyState.horizon;
    sunLight.color.copy(skyState.sun);
    sunLight.intensity = 3.35 * skyState.light;
    hemi.intensity = 1.35 + skyState.light * 0.9;
    hemi.color.copy(skyState.sun);
    fill.intensity = 0.55 + skyState.light * 0.75;
    starMat.opacity = skyState.star * 0.95;
    const day = skyState.hour >= 6.2 && skyState.hour < 18.6;
    const span = day ? (skyState.hour - 6.2) / 12.4 : ((skyState.hour >= 18.6 ? skyState.hour - 18.6 : skyState.hour + 5.4) / 12);
    const angle = span * Math.PI;
    const body = day ? sun : moon;
    sun.visible = day;
    moon.visible = !day;
    body.position.set(Math.cos(angle) * 34, Math.sin(angle) * 20 + 7, -30);
    if (building) {
      for (const glass of building.glassMats) {
        glass.color.copy(windowDay).lerp(windowNight, skyState.window);
        glass.emissiveIntensity = skyState.window * 0.7;
      }
      for (const lamp of building.lampMats) {
        lamp.color.copy(lampOff).lerp(lampOn, 0.25 + skyState.lamp * 0.75);
      }
      const minutes = date.getHours() * 60 + date.getMinutes();
      const hourAngle = ((minutes % 720) / 720) * Math.PI * 2;
      const minuteAngle = ((date.getMinutes() + date.getSeconds() / 60) / 60) * Math.PI * 2;
      for (const clock of building.clocks) {
        clock.hourHand.rotation.z = -hourAngle;
        clock.minuteHand.rotation.z = -minuteAngle;
      }
    }
    document.documentElement.style.backgroundColor = `#${skyState.horizon.getHexString()}`;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now / 1000;
    if (focusAnim) {
      const k = Math.min(1, (now - focusAnim.start) / 900);
      const e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(focusAnim.fromPos, focusAnim.toPos, e);
      controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, e);
      if (k >= 1) focusAnim = null;
    }
    controls.update();
    ring.visible = false;
    const wall = Date.now();
    for (const bot of bots.values()) updateBot(bot, dt, elapsed, wall);
    updateSky(new Date());
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  renderer.setAnimationLoop(frame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    }
  });

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener?.("change", (event) => {
    reduceMotion = event.matches;
  });

  const observer = new ResizeObserver(() => resize());
  observer.observe(viewport);
  resize();
  frameBuilding(1, true);
  updateSky(new Date());

  return {
    sync,
    focus,
    setSelected,
    resize,
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

function lookKey(look) {
  return `${look.shape}|${look.color}|${look.accessory}`;
}

function hashHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i)) >>> 0;
  return h;
}

function damp(current, goal, speed, dt) {
  return current + (goal - current) * (1 - Math.exp(-speed * dt));
}

function dampAngle(current, goal, speed, dt) {
  let delta = goal - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-speed * dt));
}
