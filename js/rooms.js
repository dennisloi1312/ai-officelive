import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el } from './dom.js';
import { floorPlan, presentBot } from './state.js';

const ACCENT = '#1E86FC';
const FONT = 'Inter, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
const X0 = -6.5;
const X1 = -2.38;
const Z0 = 2.18;
const Z1 = 4.82;
const WALL = 1.62;
const FROST_H = 0.74;

function shade(mesh, cast = false) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, cast = false) {
  return shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), cast);
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture, ctx: canvas.getContext('2d') };
}

function paintBoard(ctx, w, h, counts) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#F6F3EC';
  ctx.fillRect(0, 0, w, h);
  const cols = [
    { title: '進行中', n: counts.working, color: '#1E86FC' },
    { title: '等待', n: counts.waiting, color: '#F5A524' },
    { title: '完成', n: counts.done, color: '#34C759' },
  ];
  const gap = 14;
  const colW = (w - gap * 4) / 3;
  cols.forEach((col, index) => {
    const x = gap + index * (colW + gap);
    ctx.fillStyle = '#E6E0D4';
    roundRect(ctx, x, 16, colW, h - 32, 14);
    ctx.fill();
    ctx.fillStyle = col.color;
    roundRect(ctx, x, 16, colW, 10, 4);
    ctx.fill();
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = '#1C1C20';
    ctx.fillText(col.title, x + 14, 62);
    ctx.font = '700 26px Inter, sans-serif';
    ctx.fillStyle = col.color;
    ctx.textAlign = 'right';
    ctx.fillText(String(col.n), x + colW - 14, 62);
    ctx.textAlign = 'left';
    const cards = Math.min(col.n, 4);
    for (let card = 0; card < cards; card += 1) {
      ctx.fillStyle = '#FFFCF7';
      roundRect(ctx, x + 12, 84 + card * 58, colW - 24, 46, 8);
      ctx.fill();
      ctx.fillStyle = col.color;
      roundRect(ctx, x + 22, 100 + card * 58, 36, 10, 4);
      ctx.fill();
    }
  });
}

function paintFloors(ctx, w, h, floors, state, now) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#F8FBFF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1E86FC';
  ctx.fillRect(0, 0, w, 8);
  ctx.fillStyle = '#1C1C20';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('樓層', 14, 36);
  const rows = floors.slice(0, 4);
  if (!rows.length) {
    ctx.fillStyle = '#64748B';
    ctx.fillText('—', 14, 78);
    return;
  }
  rows.forEach((floor, index) => {
    const y = 64 + index * 30;
    ctx.fillStyle = '#334155';
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(Array.from(floor.label).slice(0, 8).join(''), 14, y);
    floor.bots.slice(0, 8).forEach((name, bot) => {
      const view = presentBot(state.bots[name], now, name);
      let color = '#64748B';
      if (view.status === 'working') color = '#34C759';
      else if (view.status === 'waiting_user') color = '#F5A524';
      else if (view.status === 'error') color = '#FF5A5F';
      else if (view.status === 'done') color = '#5AA9FF';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(132 + bot * 16, y - 5, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function paintUsage(ctx, w, h, usage) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#F8FBFF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1E86FC';
  ctx.fillRect(0, 0, w, 8);
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = '#1C1C20';
  ctx.fillText('用量', 14, 36);
  if (!usage || !Number.isFinite(usage.weekly_pct)) {
    ctx.fillStyle = '#64748B';
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText('暫無用量資料', 14, 84);
    return;
  }
  const pct = usage.weekly_pct;
  const tone = pct >= 90 ? '#FF5A5F' : pct >= 75 ? '#F5A524' : '#1E86FC';
  ctx.font = '700 32px Inter, sans-serif';
  ctx.fillStyle = tone;
  ctx.fillText(`${pct}%`, 14, 74);
  ctx.fillStyle = '#E2E8F0';
  roundRect(ctx, 14, 96, w - 28, 18, 9);
  ctx.fill();
  ctx.fillStyle = tone;
  roundRect(ctx, 14, 96, Math.max(10, (w - 28) * (pct / 100)), 18, 9);
  ctx.fill();
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(14 + (w - 28) * 0.9, 90, 2, 30);
}

function addGlassRun(group, materials, length, x, z, rotY, gap) {
  const spans = [];
  if (!gap) spans.push([-length / 2, length / 2]);
  else {
    spans.push([-length / 2, gap.center - gap.width / 2], [gap.center + gap.width / 2, length / 2]);
  }
  const local = new THREE.Group();
  spans.forEach(([from, to]) => {
    const width = to - from;
    if (width < 0.08) return;
    const mid = (from + to) / 2;
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(width, FROST_H), materials.frost);
    lower.position.set(mid, FROST_H / 2, 0);
    const upperH = WALL - FROST_H;
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(width, upperH), materials.clear);
    upper.position.set(mid, FROST_H + upperH / 2, 0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, 0.05), materials.accent);
    rail.position.set(mid, WALL, 0);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.05), materials.accent);
    sill.position.set(mid, FROST_H, 0);
    local.add(lower, upper, rail, sill);
  });
  if (gap) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(gap.width, 0.045, 0.05), materials.accent);
    header.position.set(gap.center, WALL, 0);
    local.add(header);
  }
  local.position.set(x, 0, z);
  local.rotation.y = rotY;
  group.add(local);
}

function addChair(group, materials, x, z) {
  const seat = box(0.4, 0.07, 0.4, materials.upholstery, true);
  seat.position.set(x, 0.28, z);
  const back = box(0.38, 0.18, 0.05, materials.upholstery, true);
  back.position.set(x - 0.22, 0.34, z - 0.22);
  back.rotation.y = Math.PI / 4;
  const post = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), materials.leg));
  post.position.set(x, 0.16, z);
  const base = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 6), materials.leg));
  base.position.set(x, 0.06, z);
  group.add(seat, back, post, base);
}

function addOfficeSofa(group, materials, x, z) {
  const seat = box(1.2, 0.22, 0.52, materials.upholstery, true);
  seat.position.set(x, 0.32, z);
  const back = box(1.2, 0.18, 0.1, materials.upholstery, true);
  back.position.set(x, 0.38, z - 0.24);
  const armL = box(0.1, 0.14, 0.48, materials.upholstery);
  armL.position.set(x - 0.62, 0.32, z);
  const armR = box(0.1, 0.14, 0.48, materials.upholstery);
  armR.position.set(x + 0.62, 0.32, z);
  group.add(seat, back, armL, armR);
}

function addShelf(group, materials, x, z) {
  const frame = box(0.28, 1.15, 0.7, materials.white);
  frame.position.set(x, 0.62, z);
  group.add(frame);
  materials.books.forEach((material, index) => {
    const book = box(0.16, 0.28, 0.14, material);
    book.position.set(x + 0.08, 0.28 + Math.floor(index / 3) * 0.36, z - 0.22 + (index % 3) * 0.2);
    group.add(book);
  });
}

function addPot(group, materials, x, z, y = 0, scale = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.14, 7), materials.desk);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), materials.leaf);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), materials.leafDark);
  pot.position.set(0, 0.07, 0);
  leaf.position.set(0, 0.24, 0);
  bud.position.set(0.07, 0.22, 0.04);
  const cluster = new THREE.Group();
  cluster.add(pot, leaf, bud);
  cluster.scale.setScalar(scale);
  cluster.position.set(x, y, z);
  group.add(cluster);
}

/**
 * Kai's single office on the Ops floor.
 * Near walls (higher x / higher z) stay glass so the isometric camera can see in.
 */
export function addKaiOffice(parent, mats) {
  const group = new THREE.Group();
  parent.add(group);
  const accent = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4, metalness: 0.05 });
  const clear = new THREE.MeshStandardMaterial({
    color: '#e7eef6',
    roughness: 0.06,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frost = new THREE.MeshStandardMaterial({
    color: '#f3f6fa',
    roughness: 0.78,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const upholstery = new THREE.MeshStandardMaterial({ color: '#F7F6F3', roughness: 0.72 });
  const rugMat = new THREE.MeshStandardMaterial({ color: '#D5E6F8', roughness: 0.92 });
  const materials = {
    accent,
    clear,
    frost,
    upholstery,
    white: mats.white,
    desk: mats.desk,
    leg: mats.leg,
    books: mats.books,
    leaf: mats.leaf,
    leafDark: mats.leafDark,
  };

  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;
  const slab = box(X1 - X0, 0.035, Z1 - Z0, mats.shell);
  slab.position.set(cx, 0.02, cz);
  group.add(slab);

  const depth = Z1 - Z0;
  const width = X1 - X0;
  addGlassRun(group, materials, depth, X1, cz, Math.PI / 2, { center: 0, width: 0.86 });
  addGlassRun(group, materials, depth, X0, cz, Math.PI / 2, null);
  addGlassRun(group, materials, width, cx, Z1, 0, null);
  addGlassRun(group, materials, width, cx, Z0, 0, null);
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
    const post = box(0.07, WALL, 0.07, accent);
    post.position.set(x, WALL / 2, z);
    group.add(post);
  }

  const doorPivot = new THREE.Group();
  const door = box(0.78, 1.18, 0.045, frost);
  door.position.set(-0.39, 0.6, 0);
  const handle = box(0.08, 0.04, 0.04, accent);
  handle.position.set(-0.66, 0.62, 0.04);
  doorPivot.add(door, handle);
  doorPivot.position.set(X1, 0, cz - 0.43);
  doorPivot.rotation.y = 0.55;
  group.add(doorPivot);

  const sign = new CSS2DObject(el('div', 'door-sign', 'Kai · Ops'));
  sign.position.set(X1 + 0.02, 1.48, cz);
  sign.center.set(0.5, 1);
  group.add(sign);

  const glow = new THREE.MeshStandardMaterial({
    color: '#fff6e8',
    emissive: '#ffd7a1',
    emissiveIntensity: 0.9,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.58), glow);
  windowPane.position.set(X0 + 0.06, 1.18, 3.55);
  windowPane.rotation.y = Math.PI / 2;
  group.add(windowPane);
  const windowFrame = new THREE.Group();
  const trim = 0.045;
  [[0, 0.31, 1.02, trim], [0, -0.31, 1.02, trim], [-0.49, 0, trim, 0.62], [0.49, 0, trim, 0.62]].forEach(([lx, ly, w, h]) => {
    const piece = box(w, h, trim, accent);
    piece.position.set(lx, ly, 0);
    windowFrame.add(piece);
  });
  windowFrame.position.set(X0 + 0.05, 1.18, 3.55);
  windowFrame.rotation.y = Math.PI / 2;
  group.add(windowFrame);
  const lamp = new THREE.PointLight('#fff1dc', 0.45, 4.2, 2);
  lamp.position.set(-5.7, 1.4, 3.55);
  group.add(lamp);

  const rugEdge = box(2.15, 0.012, 1.55, accent);
  rugEdge.position.set(-4.7, 0.038, 3.4);
  const rug = box(2.02, 0.02, 1.42, rugMat);
  rug.position.set(-4.7, 0.05, 3.4);
  group.add(rugEdge, rug);

  const deskMain = box(0.68, 0.07, 1.45, mats.desk, true);
  deskMain.position.set(-5.95, 0.74, 3.45);
  const deskReturn = box(1.05, 0.07, 0.55, mats.desk, true);
  deskReturn.position.set(-5.4, 0.74, 4.22);
  group.add(deskMain, deskReturn);
  for (const [x, z] of [[-6.2, 2.85], [-6.2, 4.05], [-4.95, 4.22]]) {
    const leg = box(0.06, 0.7, 0.06, mats.leg);
    leg.position.set(x, 0.36, z);
    group.add(leg);
  }

  const boardCanvas = makeCanvas(540, 300);
  const boardMat = new THREE.MeshBasicMaterial({ map: boardCanvas.texture, toneMapped: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.9), boardMat);
  board.position.set(-4.55, 1.12, Z0 + 0.06);
  group.add(board);

  const bezel = new THREE.MeshStandardMaterial({ color: '#1C1C20', roughness: 0.45 });
  const floorScreen = makeCanvas(320, 180);
  const usageScreen = makeCanvas(320, 180);
  const screens = [
    { z: 3.86, canvas: floorScreen },
    { z: 3.1, canvas: usageScreen },
  ];
  screens.forEach((screen) => {
    const shell = box(0.035, 0.4, 0.58, bezel);
    shell.position.set(-5.68, 1.05, screen.z);
    const faceMat = new THREE.MeshStandardMaterial({
      map: screen.canvas.texture,
      color: '#12141a',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.6,
      metalness: 0,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), faceMat);
    face.position.set(-5.64, 1.05, screen.z);
    face.rotation.y = Math.PI / 2;
    const stand = box(0.04, 0.12, 0.08, mats.leg);
    stand.position.set(-5.66, 0.82, screen.z);
    group.add(shell, face, stand);
    screen.material = faceMat;
  });
  const monitors = screens.map((screen) => screen.material);
  const keys = box(0.28, 0.02, 0.14, bezel);
  keys.position.set(-5.7, 0.79, 3.45);
  group.add(keys);

  addChair(group, materials, -4.95, 3.32);
  addOfficeSofa(group, materials, -3.25, 3.05);
  addShelf(group, materials, -6.2, 2.55);
  addPot(group, materials, -3.7, 2.62);
  addPot(group, materials, -6.15, 4.42, 0, 0.85);
  addPot(group, materials, -2.75, 4.48, 0, 0.7);
  addPot(group, materials, -5.05, 4.28, 0.78, 0.45);

  group.traverse((obj) => {
    if (obj.isMesh) obj.userData.botName = 'Kai';
    if (obj.isCSS2DObject) obj.raycast = () => {};
  });

  let painted = '';
  return {
    group,
    desk: { x: -4.95, z: 3.32 },
    deskFace: { x: -4.05, z: 4.15 },
    sofa: { x: -3.25, z: 3.05 },
    sofaFace: { x: -2.4, z: 3.85 },
    boardSpot: { x: -4.55, z: 2.78 },
    boardFace: { x: -4.55, z: 2.2 },
    paintScreens(status, look, time, phase) {
      const mode = status === 'working' ? 'working'
        : status === 'waiting_user' ? 'waiting'
        : status === 'error' ? 'error'
        : status === 'done' ? 'done' : 'idle';
      monitors.forEach((mat) => {
        if (mat.userData.mode !== mode) {
          mat.userData.mode = mode;
          if (mode === 'working') {
            mat.color.set('#f7f8fa');
            mat.emissive.copy(look);
          } else if (mode === 'waiting') {
            mat.color.set('#3a2e1c');
            mat.emissive.set('#F5A524');
          } else if (mode === 'error') {
            mat.color.set('#3a1a1c');
            mat.emissive.set('#FF5A5F');
          } else if (mode === 'done') {
            mat.color.set('#d5dbe3');
            mat.emissive.copy(look);
          } else {
            mat.color.set('#101218');
            mat.emissive.set('#000000');
          }
        }
        if (mode === 'working') mat.emissiveIntensity = 0.48 + Math.sin(time * 2.2 + phase) * 0.07;
        else if (mode === 'waiting') mat.emissiveIntensity = 0.22;
        else if (mode === 'error') mat.emissiveIntensity = 0.26;
        else if (mode === 'done') mat.emissiveIntensity = 0.12;
        else mat.emissiveIntensity = 0;
      });
    },
    update(state, now) {
      if (!state) return;
      const floors = floorPlan(state);
      let working = 0;
      let waiting = 0;
      let done = 0;
      for (const name of state.roster) {
        const view = presentBot(state.bots[name], now, name);
        if (view.status === 'working') working += 1;
        else if (view.status === 'waiting_user') waiting += 1;
        else if (view.status === 'done') done += 1;
      }
      const pct = state.usage && Number.isFinite(state.usage.weekly_pct) ? state.usage.weekly_pct : 'none';
      const key = `${working}|${waiting}|${done}|${pct}|${floors.map((floor) => `${floor.label}:${floor.bots.join(',')}`).join(';')}`;
      if (key === painted) return;
      painted = key;
      paintBoard(boardCanvas.ctx, boardCanvas.canvas.width, boardCanvas.canvas.height, { working, waiting, done });
      paintFloors(floorScreen.ctx, floorScreen.canvas.width, floorScreen.canvas.height, floors, state, now);
      paintUsage(usageScreen.ctx, usageScreen.canvas.width, usageScreen.canvas.height, state.usage);
      boardCanvas.texture.needsUpdate = true;
      floorScreen.texture.needsUpdate = true;
      usageScreen.texture.needsUpdate = true;
    },
    dispose() {
      boardCanvas.texture.dispose();
      floorScreen.texture.dispose();
      usageScreen.texture.dispose();
      lamp.dispose();
    },
  };
}

export function addMeetingTable(parent, mats, x, z) {
  const top = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.07, 24), mats.white), true);
  top.position.set(x, 0.72, z);
  const leg = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.66, 8), mats.leg));
  leg.position.set(x, 0.34, z);
  parent.add(top, leg);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const stool = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.4, 12), mats.white), true);
    stool.position.set(x + Math.cos(angle) * 1.08, 0.2, z + Math.sin(angle) * 1.08);
    parent.add(stool);
  }
  const sprig = shade(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mats.leaf), false);
  sprig.position.set(x, 0.84, z);
  parent.add(sprig);
}

export function addWallArt(parent, mats) {
  const pieces = [
    { x: -4.5, color: '#1E86FC' },
    { x: 4.35, color: '#E7B15A' },
  ];
  pieces.forEach((piece) => {
    const frame = box(1.05, 0.68, 0.04, mats.white);
    frame.position.set(piece.x, 1.42, -4.78);
    const paint = new THREE.MeshStandardMaterial({ color: piece.color, roughness: 0.62 });
    const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.5, 0.02), paint);
    canvas.position.set(piece.x, 1.42, -4.75);
    canvas.receiveShadow = true;
    parent.add(frame, canvas);
  });
}
