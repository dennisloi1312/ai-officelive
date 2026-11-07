import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const geos = new Map();

function groundGeometry(geo) {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const cx = (box.max.x + box.min.x) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  geo.translate(-cx, -box.min.y, -cz);
  geo.computeBoundingBox();
  return geo;
}

function cached(key, build) {
  if (!geos.has(key)) geos.set(key, groundGeometry(build()));
  return geos.get(key);
}

function polygonShape(sides, radius) {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function starShape(points, outer, inner) {
  const shape = new THREE.Shape();
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 3,
  });
}

function bodyGeometry(shape) {
  switch (shape) {
    case "rounded_cube":
      return cached(shape, () => new RoundedBoxGeometry(0.74, 0.74, 0.74, 2, 0.14));
    case "pill":
      return cached(shape, () => new THREE.CapsuleGeometry(0.26, 0.46, 4, 10));
    case "triangle":
      return cached(shape, () => extrude(polygonShape(3, 0.5), 0.3));
    case "cone":
      return cached(shape, () => new THREE.ConeGeometry(0.4, 0.86, 14));
    case "pentagon":
      return cached(shape, () => extrude(polygonShape(5, 0.46), 0.3));
    case "hexagon":
      return cached(shape, () => extrude(polygonShape(6, 0.46), 0.3));
    case "star4":
      return cached(shape, () => extrude(starShape(4, 0.5, 0.24), 0.26));
    case "star6":
      return cached(shape, () => extrude(starShape(6, 0.5, 0.28), 0.26));
    case "rounded_square":
      return cached(shape, () => new RoundedBoxGeometry(0.82, 0.72, 0.32, 2, 0.16));
    case "sphere":
    default:
      return cached("sphere", () => new THREE.SphereGeometry(0.42, 16, 12));
  }
}

const eyeWhite = new THREE.MeshLambertMaterial({ color: 0xfffdfb, flatShading: true });
const pupilMat = new THREE.MeshLambertMaterial({ color: 0x2a211c, flatShading: true });
const blushMat = new THREE.MeshLambertMaterial({ color: 0xff9eb5, flatShading: true });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x3a2a22, flatShading: true });
const metalMat = new THREE.MeshLambertMaterial({ color: 0xd5dbe6, flatShading: true });
const tipMat = new THREE.MeshLambertMaterial({ color: 0xffe08a, flatShading: true });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x67c56d, flatShading: true });
const stemMat = new THREE.MeshLambertMaterial({ color: 0x3f8f45, flatShading: true });

const eyeGeo = new THREE.SphereGeometry(0.085, 10, 8);
const pupilGeo = new THREE.SphereGeometry(0.042, 8, 6);
const shineGeo = new THREE.SphereGeometry(0.02, 6, 5);
const footGeo = new THREE.SphereGeometry(0.09, 8, 6);
const blushGeo = new THREE.SphereGeometry(0.05, 8, 6);

function owned(color) {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  material.userData.owned = true;
  return material;
}

function bowColor(hex) {
  const color = new THREE.Color(hex);
  if (color.r > 0.75 && color.b > 0.45) return "#f2c14e";
  return "#ff7aa2";
}

function addEyes(parent, eyeY, eyeZ, spread, scale) {
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeWhite);
    eye.position.set(side * spread, eyeY, eyeZ);
    eye.scale.setScalar(scale);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(side * spread + side * 0.012 * scale, eyeY - 0.01 * scale, eyeZ + 0.06 * scale);
    pupil.scale.setScalar(scale);
    const shine = new THREE.Mesh(shineGeo, eyeWhite);
    shine.position.set(side * spread + 0.02 * scale, eyeY + 0.025 * scale, eyeZ + 0.08 * scale);
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.position.set(side * spread * 1.55, eyeY - 0.08, eyeZ - 0.02);
    blush.scale.set(1, 0.7, 0.5);
    parent.add(eye, pupil, shine, blush);
    eyes.push(eye);
  }
  return eyes;
}

function addMouth(parent, eyeY, eyeZ, scale) {
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.075 * scale, 0.016 * scale, 5, 10, Math.PI),
    pupilMat,
  );
  mouth.position.set(0, eyeY - 0.15 * scale, eyeZ + 0.02);
  mouth.rotation.z = Math.PI;
  parent.add(mouth);
  return mouth;
}

function addAccessory(parent, accessory, color, eyeY, eyeZ, spread, headY) {
  if (accessory === "glasses") {
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 12), glassMat);
      ring.position.set(side * spread, eyeY, eyeZ + 0.045);
      parent.add(ring);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(spread * 0.7, 0.02, 0.02), glassMat);
    bridge.position.set(0, eyeY, eyeZ + 0.04);
    parent.add(bridge);
  } else if (accessory === "antenna") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), metalMat);
    pole.position.set(0.04, headY + 0.16, 0);
    pole.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), tipMat);
    ball.position.set(0.04, headY + 0.36, 0);
    ball.castShadow = true;
    parent.add(pole, ball);
  } else if (accessory === "stem") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.26, 6), stemMat);
    pole.position.set(0, headY + 0.12, 0);
    pole.castShadow = true;
    const leafA = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), leafMat);
    leafA.scale.set(1.3, 0.55, 0.7);
    leafA.position.set(0.08, headY + 0.26, 0);
    leafA.rotation.z = -0.5;
    const leafB = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), leafMat);
    leafB.scale.set(1.2, 0.5, 0.7);
    leafB.position.set(-0.07, headY + 0.22, 0);
    leafB.rotation.z = 0.6;
    parent.add(pole, leafA, leafB);
  } else if (accessory === "bow") {
    const cloth = owned(bowColor(color));
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), cloth);
    knot.position.set(0, headY - 0.02, eyeZ * 0.35);
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), cloth);
      loop.scale.set(1.25, 0.72, 0.55);
      loop.position.set(side * 0.12, headY + 0.02, eyeZ * 0.3);
      loop.rotation.z = side * -0.4;
      parent.add(loop);
    }
    parent.add(knot);
  }
}

function addCluster(parent, material, kind) {
  const spots = kind === "clover"
    ? [
        [0, 0.34, 0.12, 0.24],
        [-0.24, 0.28, -0.08, 0.22],
        [0.24, 0.28, -0.08, 0.22],
        [0, 0.12, -0.02, 0.12],
      ]
    : [
        [0, 0.62, 0.02, 0.24],
        [-0.22, 0.26, 0.08, 0.2],
        [0.22, 0.26, 0.08, 0.2],
      ];
  const geo = new THREE.SphereGeometry(1, 14, 10);
  for (const [x, y, z, r] of spots) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.setScalar(r);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
  }
  if (kind === "clover") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 6), stemMat);
    stem.position.set(0, 0.08, 0);
    parent.add(stem);
  }
}

export function createCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const material = owned(look.color);
  let headY = 0.8;

  if (look.shape === "clover" || look.shape === "trio") {
    addCluster(body, material, look.shape);
    headY = look.shape === "trio" ? 0.86 : 0.58;
  } else {
    const mesh = new THREE.Mesh(bodyGeometry(look.shape), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    mesh.geometry.computeBoundingBox();
    headY = mesh.geometry.boundingBox.max.y;
  }

  body.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body);
  const size = bounds.getSize(new THREE.Vector3());
  let eyeY = bounds.min.y + size.y * 0.66;
  let eyeZ = bounds.max.z + 0.025;
  let spread = Math.min(0.17, Math.max(0.09, size.x * 0.22));
  let eyeScale = Math.min(1, Math.max(0.7, size.x / 0.7));

  if (look.shape === "cone") {
    eyeY = bounds.min.y + size.y * 0.4;
    eyeZ = bounds.max.z * 0.42;
    spread = 0.1;
    eyeScale = 0.78;
  } else if (look.shape === "clover") {
    eyeY = 0.36;
    eyeZ = 0.3;
    spread = 0.09;
    eyeScale = 0.72;
  } else if (look.shape === "trio") {
    eyeY = 0.66;
    eyeZ = 0.22;
    spread = 0.08;
    eyeScale = 0.68;
  } else if (look.shape === "star4" || look.shape === "star6") {
    eyeScale = 0.78;
    spread = 0.1;
  }

  const eyes = addEyes(body, eyeY, eyeZ, spread, eyeScale);
  const mouth = addMouth(body, eyeY, eyeZ, eyeScale);
  addAccessory(body, look.accessory, look.color, eyeY, eyeZ, spread, Math.max(headY, bounds.max.y));

  if (look.shape !== "clover" && look.shape !== "trio") {
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, material);
      foot.scale.set(0.85, 0.62, 1);
      foot.position.set(side * spread, 0.05, Math.max(0.08, eyeZ * 0.25));
      foot.castShadow = true;
      body.add(foot);
    }
  }

  const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 3, 6);
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-Math.max(spread + 0.12, size.x * 0.42), eyeY - 0.02, 0);
  rightArm.position.set(Math.max(spread + 0.12, size.x * 0.42), eyeY - 0.02, 0);
  for (const pivot of [leftArm, rightArm]) {
    const arm = new THREE.Mesh(armGeo, material);
    arm.position.y = -0.16;
    arm.castShadow = true;
    pivot.add(arm);
    body.add(pivot);
  }

  return {
    root,
    body,
    leftArm,
    rightArm,
    eyes,
    mouth,
    headY: Math.max(headY, bounds.max.y),
  };
}

export function disposeOwned(object) {
  object.traverse((node) => {
    if (node.material && node.material.userData && node.material.userData.owned) {
      node.material.dispose();
    }
  });
}
