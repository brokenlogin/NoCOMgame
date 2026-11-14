import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { weldParts } from './weld.js';
import { CONFIG } from './config.js';
import { itemTexture } from './itemTextures.js';

// Player character: a space-suited explorer. Fabric suit in the player's color, glossy armor
// plates, a glass helmet with a real face inside (eyes blink, looks up/down with your aim),
// a backpack with jetpack tanks, and jointed arms/legs (knees, elbows, feet) that walk, run,
// jump and squash on landing.
//
// Everyone's face, hair and helmet gadget are picked from their name, so each player looks
// a bit different but the same on every screen.
//
// The group's origin sits at the player's feet, and -Z is forward. The file is still called
// capsule.js (and the function createCapsuleMesh) so other code keeps working:
//   userData.body  the torso mesh; its material is the suit color (hit flashes use it)
//   userData.rig   { legs, arms, torso, head, flames, holding, ... } for animation and held items

const TAU = Math.PI * 2;
const FRONT = Math.PI * 1.5; // SphereGeometry phi that faces -Z

const SKIN = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21, 0xffe0bd, 0xb5f2a0];
const HAIR = [0x2a1b10, 0x5a3825, 0xa0522d, 0xe8c070, 0x151515, 0xd94f2b, 0x6b8cff, 0xff6fb5, 0xeeeeee, 0x47d18a];
const EYES = [0x3b2a1a, 0x2a6fdb, 0x2e8b57, 0x6b4f2a, 0x7a3fb0, 0x111111];
const HAIR_STYLES = ['short', 'spiky', 'bun', 'mohawk', 'curly', 'bald', 'short', 'spiky'];
const MOUTHS = ['smile', 'grin', 'smirk', 'o', 'flat', 'smile'];
const TOPPERS = ['antenna', 'none', 'fin', 'ears', 'lamp', 'twin', 'antenna'];

// ---------- Cheap shadows ----------
// Drawing all the parts a second time for the shadow is as much work as drawing the character.
// Nobody can tell a helmet's shadow from a ball's, so each limb gets one invisible rounded
// shape the size of its parts, and only those cast the shadow. They live on their own layer,
// which the shadow camera sees and the normal camera doesn't.
export const SHADOW_ONLY_LAYER = 7;
const shadowBall = new THREE.SphereGeometry(1, 12, 8);
const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const _partBox = new THREE.Box3(), _limbBox = new THREE.Box3();
function addShadowShapes(root, skip) {
  const limbs = [];
  root.traverse((o) => {
    if (!o.isMesh && !skip.has(o)) limbs.push(o);
  });
  for (const limb of limbs) {
    _limbBox.makeEmpty();
    for (const ch of limb.children) {
      if (!ch.isMesh || !ch.castShadow || !ch.visible) continue;
      if (ch.geometry.boundingBox === null) ch.geometry.computeBoundingBox();
      ch.updateMatrix();
      _limbBox.union(_partBox.copy(ch.geometry.boundingBox).applyMatrix4(ch.matrix));
      ch.castShadow = false;
    }
    if (_limbBox.isEmpty()) continue;
    const shape = new THREE.Mesh(shadowBall, shadowMat);
    _limbBox.getCenter(shape.position);
    _limbBox.getSize(shape.scale).multiplyScalar(0.54); // a touch bigger than the ball that fits inside
    shape.scale.x = Math.max(shape.scale.x, 0.02);
    shape.scale.y = Math.max(shape.scale.y, 0.02);
    shape.scale.z = Math.max(shape.scale.z, 0.02);
    shape.castShadow = true;
    shape.layers.set(SHADOW_ONLY_LAYER);
    limb.add(shape);
  }
}

// Every character is made of the same few dozen shapes, so each shape is built once and shared
// (G.Sphere(...) instead of new THREE.SphereGeometry(...)). Never change one after it's made.
const sharedShapes = new Map();
const shared = (Ctor) => (...args) => {
  const key = `${Ctor.name}|${args.join(',')}`;
  let g = sharedShapes.get(key);
  if (!g) sharedShapes.set(key, (g = new Ctor(...args)));
  return g;
};
const G = {
  Sphere: shared(THREE.SphereGeometry), Cylinder: shared(THREE.CylinderGeometry), Capsule: shared(THREE.CapsuleGeometry),
  Cone: shared(THREE.ConeGeometry), Box: shared(THREE.BoxGeometry), Torus: shared(THREE.TorusGeometry),
  Circle: shared(THREE.CircleGeometry), Plane: shared(THREE.PlaneGeometry), Ring: shared(THREE.RingGeometry),
};

// Rounded boxes are slow to build and every character uses the same ones, so each size is
// built once and shared (never changed after it's made)
const roundedBoxes = new Map();
function roundedBox(w, h, d, r) {
  const key = `${w}|${h}|${d}|${r}`;
  let g = roundedBoxes.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
    roundedBoxes.set(key, g);
  }
  return g;
}

export function createCapsuleMesh(color = 0xffffff, name = '', { tag = true } = {}) {
  const s = CONFIG.playerHeight / 2; // the model is built 2m tall, then scaled
  const look = pickLooks(name ? `n:${name}` : `c:${color}`);

  // ---------- Materials ----------
  const suit = new THREE.Color(color);
  const fabric = fabricTexture();
  const suitMat = new THREE.MeshStandardMaterial({
    color: suit, roughness: 0.68, metalness: 0.02, map: fabric, bumpMap: fabric, bumpScale: 1.5,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: suit.clone().lerp(new THREE.Color(0xffffff), 0.6), roughness: 0.28, metalness: 0.08,
    bumpMap: itemTexture('grit'), bumpScale: 0.15, side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: suit.clone().multiplyScalar(0.38), roughness: 0.55, metalness: 0.15, bumpMap: itemTexture('grit'), bumpScale: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.8, bumpMap: itemTexture('grit'), bumpScale: 0.6 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xc3c9d2, roughness: 0.3, metalness: 0.85, bumpMap: itemTexture('brushed'), bumpScale: 0.5, roughnessMap: itemTexture('brushed'),
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: suit.clone().lerp(new THREE.Color(0xffffff), 0.45) });
  const linerMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.9, side: THREE.BackSide });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture(look), roughness: 0.62 });
  const noseMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.62 });
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.5, bumpMap: itemTexture('grit'), bumpScale: 1 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: look.eyes, roughness: 0.15 });
  const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const visorMat = new THREE.MeshStandardMaterial({
    map: visorTexture(), transparent: true, roughness: 0.04, metalness: 0.35, depthWrite: false, side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(s);
  group.add(model);

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const rbox = roundedBox;

  // ---------- Legs: hip -> knee -> foot ----------
  const legs = [], knees = [], feet = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.15 * side, 0.92, 0);
    model.add(hip);
    add(hip, G.Capsule(0.12, 0.24, 6, 14), suitMat, 0, -0.21, 0); // thigh
    add(hip, rbox(0.15, 0.17, 0.05, 0.02), plateMat, 0, -0.2, -0.11).rotation.x = 0.06; // thigh plate
    add(hip, rbox(0.05, 0.08, 0.06, 0.015), trimMat, 0.12 * side, -0.16, 0); // side pocket

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    add(knee, G.Sphere(0.1, 14, 10), plateMat, 0, 0, -0.045).scale.set(1, 1, 0.75); // knee pad
    add(knee, G.Capsule(0.105, 0.2, 6, 14), suitMat, 0, -0.19, 0); // shin
    add(knee, G.Cylinder(0.125, 0.13, 0.08, 16), trimMat, 0, -0.32, 0); // boot cuff

    const foot = new THREE.Group();
    foot.position.y = -0.36;
    knee.add(foot);
    add(foot, rbox(0.22, 0.13, 0.34, 0.05), darkMat, 0, -0.055, -0.05); // boot
    add(foot, rbox(0.24, 0.035, 0.37, 0.015), soleMat, 0, -0.1, -0.05); // sole
    add(foot, rbox(0.225, 0.025, 0.345, 0.01), glowMat, 0, -0.03, -0.05); // light strip
    add(foot, G.Sphere(0.11, 14, 8, 0, TAU, 0, Math.PI / 2), plateMat, 0, -0.08, -0.15).scale.set(1, 0.55, 0.85); // toe cap

    legs.push(hip);
    knees.push(knee);
    feet.push(foot);
  }

  // Hips
  add(model, G.Sphere(0.25, 22, 14), suitMat, 0, 0.98, 0).scale.set(1.05, 0.62, 0.8);

  // ---------- Torso (pivots at the waist) ----------
  const torso = new THREE.Group();
  torso.position.y = 1.02;
  model.add(torso);
  const profile = [
    [0, -0.06], [0.235, -0.06], [0.255, 0.02], [0.27, 0.12], [0.3, 0.25],
    [0.325, 0.38], [0.32, 0.47], [0.28, 0.55], [0.18, 0.6], [0, 0.61],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = add(torso, new THREE.LatheGeometry(profile, 28), suitMat);
  body.scale.z = 0.7;

  // Chest armor and belly ribs (slices of a cylinder hugging the front)
  const chest = add(torso, G.Cylinder(0.335, 0.29, 0.3, 24, 1, true, Math.PI - 0.95, 1.9), plateMat, 0, 0.33, 0);
  chest.scale.z = 0.74;
  for (const y of [0.1, 0.16]) {
    add(torso, G.Cylinder(0.29, 0.285, 0.035, 20, 1, true, Math.PI - 0.8, 1.6), trimMat, 0, y, 0).scale.z = 0.74;
  }
  // Name badge on the left chest, status lights on the right
  const badge = add(torso, G.Circle(0.058, 28), new THREE.MeshBasicMaterial({ map: badgeTexture(name, glowMat.color) }), -0.13, 0.37, -0.218);
  badge.rotation.y = -2.82;
  badge.castShadow = false;
  for (let i = 0; i < 3; i++) {
    const light = add(torso, G.Sphere(0.013, 8, 6), i === 0 ? glowMat : sparkleMat, 0.09 + i * 0.035, 0.31 - i * 0.004, -0.225 + i * 0.006);
    light.castShadow = false;
  }

  // Belt with buckle and pouches
  const belt = add(torso, G.Torus(0.255, 0.04, 8, 28), trimMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.73;
  add(torso, rbox(0.12, 0.08, 0.04, 0.015), metalMat, 0, 0, -0.19);
  add(torso, G.Sphere(0.012, 8, 6), glowMat, 0, 0, -0.212).castShadow = false;
  for (const side of [-1, 1]) {
    add(torso, rbox(0.09, 0.1, 0.07, 0.02), darkMat, 0.2 * side, -0.01, -0.11).rotation.y = -0.6 * side;
  }

  // Collar
  const collar = add(torso, G.Torus(0.17, 0.045, 8, 24), trimMat, 0, 0.58, 0);
  collar.rotation.x = Math.PI / 2;
  collar.scale.y = 0.85;

  // Air hoses from the backpack over the shoulders to the collar
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.17 * side, 0.52, 0.24),
      new THREE.Vector3(0.21 * side, 0.67, 0.12),
      new THREE.Vector3(0.17 * side, 0.63, -0.06),
      new THREE.Vector3(0.11 * side, 0.56, -0.13),
    ]);
    add(torso, new THREE.TubeGeometry(curve, 16, 0.022, 8, false), darkMat);
  }

  // Backpack: shell, vented panel, side tanks with jet nozzles
  add(torso, rbox(0.46, 0.5, 0.2, 0.06), plateMat, 0, 0.32, 0.27);
  add(torso, rbox(0.32, 0.3, 0.03, 0.012), trimMat, 0, 0.36, 0.375);
  for (let i = 0; i < 4; i++) add(torso, rbox(0.24, 0.02, 0.02, 0.008), darkMat, 0, 0.27 + i * 0.06, 0.392);
  const flames = [];
  for (const side of [-1, 1]) {
    add(torso, G.Cylinder(0.065, 0.065, 0.4, 18), metalMat, 0.2 * side, 0.3, 0.36);
    add(torso, G.Sphere(0.065, 16, 8, 0, TAU, 0, Math.PI / 2), metalMat, 0.2 * side, 0.5, 0.36);
    add(torso, G.Cylinder(0.068, 0.068, 0.025, 18), trimMat, 0.2 * side, 0.42, 0.36); // tank band
    add(torso, G.Cylinder(0.035, 0.055, 0.07, 14), darkMat, 0.2 * side, 0.065, 0.36); // nozzle
    // Jetpack flame (hidden until the jetpack fires)
    const flame = new THREE.Group();
    flame.position.set(0.2 * side, 0.03, 0.36);
    const outer = new THREE.Mesh(G.Cone(0.06, 0.45, 12), flameOuterMat);
    outer.rotation.x = Math.PI; // point down
    outer.position.y = -0.22;
    const inner = new THREE.Mesh(G.Cone(0.03, 0.25, 8), flameInnerMat);
    inner.rotation.x = Math.PI;
    inner.position.y = -0.12;
    flame.add(outer, inner);
    flame.visible = false;
    torso.add(flame);
    flames.push(flame);
  }
  const blinkers = [];
  add(torso, G.Cylinder(0.01, 0.01, 0.3, 6), metalMat, 0.15, 0.68, 0.3);
  blinkers.push(add(torso, G.Sphere(0.028, 10, 8), glowMat, 0.15, 0.84, 0.3));

  // ---------- Arms: shoulder -> elbow -> hand ----------
  const arms = [], elbows = [], hands = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.375 * side, 0.47, 0);
    torso.add(shoulder);
    add(shoulder, G.Sphere(0.1, 14, 10), suitMat); // joint
    add(shoulder, G.Sphere(0.135, 18, 10, 0, TAU, 0, Math.PI * 0.55), plateMat, 0.01 * side, 0.02, 0).scale.set(1.05, 0.9, 1); // pad
    add(shoulder, G.Capsule(0.085, 0.16, 6, 12), suitMat, 0, -0.15, 0); // upper arm
    add(shoulder, G.Cylinder(0.094, 0.094, 0.035, 14), trimMat, 0, -0.2, 0); // arm band

    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    add(elbow, G.Sphere(0.075, 12, 8), plateMat, 0, 0, 0.025).scale.set(1, 1, 0.8);
    add(elbow, G.Capsule(0.08, 0.13, 6, 12), suitMat, 0, -0.12, 0); // forearm
    add(elbow, G.Cylinder(0.094, 0.086, 0.11, 14), plateMat, 0, -0.17, 0); // gauntlet
    if (side === -1) add(elbow, rbox(0.05, 0.065, 0.02, 0.008), glowMat, 0, -0.165, -0.095).castShadow = false; // wrist screen

    // Glove: palm, curled fingers, thumb
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    add(hand, rbox(0.065, 0.1, 0.1, 0.028), darkMat, 0, -0.035, 0);
    add(hand, rbox(0.058, 0.075, 0.095, 0.024), darkMat, -0.006 * side, -0.1, 0.004).rotation.z = 0.25 * side;
    const thumb = add(hand, G.Capsule(0.022, 0.04, 4, 8), darkMat, -0.022 * side, -0.05, -0.055);
    thumb.rotation.x = -0.5;

    shoulder.rotation.z = 0.08 * side;
    arms.push(shoulder);
    elbows.push(elbow);
    hands.push(hand);
  }

  // ---------- Head: neck -> helmet with a face inside ----------
  const neck = new THREE.Group();
  neck.position.y = 0.58;
  torso.add(neck);
  add(neck, G.Cylinder(0.09, 0.1, 0.1, 14), suitMat, 0, 0.02, 0);
  const helm = new THREE.Group();
  helm.position.y = 0.16;
  neck.add(helm);

  // The face (built first so it sits inside the helmet)
  const head = new THREE.Group();
  head.position.y = -0.02;
  helm.add(head);
  add(head, G.Sphere(0.2, 32, 22), skinMat);
  add(head, G.Sphere(0.022, 10, 8), noseMat, 0, -0.012, -0.2);
  for (const side of [-1, 1]) {
    add(head, G.Sphere(0.04, 10, 8), noseMat, 0.195 * side, -0.01, 0).scale.set(0.5, 1, 0.8); // ear
  }
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.072 * side, 0.025, -0.178);
    head.add(eye);
    add(eye, G.Sphere(0.042, 16, 12), eyeWhiteMat).scale.set(1, 1.15, 0.55);
    add(eye, G.Sphere(0.025, 12, 10), pupilMat, 0, -0.002, -0.017).scale.set(1, 1.1, 0.6);
    add(eye, G.Sphere(0.008, 6, 6), sparkleMat, 0.009, 0.012, -0.031).castShadow = false;
    eyes.push(eye);
    const brow = add(head, rbox(0.065, 0.016, 0.02, 0.007), hairMat, 0.072 * side, 0.09, -0.168);
    brow.rotation.z = look.mouth === 'smirk' && side === 1 ? 0.35 : -0.12 * side;
  }
  buildHair(head, look, hairMat, add, rbox);

  // Helmet shell with a front opening for the visor
  const R = 0.27, W = 1.9, T0 = 0.92, T1 = 2.2;
  add(helm, G.Sphere(R, 36, 24, FRONT + W / 2, TAU - W, 0, Math.PI), plateMat);
  add(helm, G.Sphere(R, 14, 10, FRONT - W / 2, W, 0, T0), plateMat);
  add(helm, G.Sphere(R, 14, 6, FRONT - W / 2, W, T1, Math.PI - T1), plateMat);
  add(helm, G.Sphere(R * 0.965, 24, 16), linerMat).castShadow = false;
  const visor = add(helm, G.Sphere(R * 1.012, 24, 14, FRONT - W / 2 - 0.03, W + 0.06, T0 - 0.03, T1 - T0 + 0.06), visorMat);
  visor.castShadow = false;
  visor.renderOrder = 2;
  // Visor rim: top and bottom arcs, and the two sides
  const arc = W + 0.06;
  for (const t of [T0 - 0.02, T1 + 0.02]) {
    const g = new THREE.TorusGeometry(R * Math.sin(t) * 1.01, 0.016, 6, 24, arc);
    g.rotateX(Math.PI / 2);
    g.rotateY(arc / 2 + Math.PI / 2);
    g.translate(0, R * Math.cos(t), 0);
    add(helm, g, trimMat);
  }
  for (const phi of [FRONT - arc / 2, FRONT + arc / 2]) {
    const g = new THREE.TorusGeometry(R * 1.01, 0.016, 6, 14, T1 - T0 + 0.04);
    g.rotateZ(Math.PI / 2 - T1 - 0.02);
    g.rotateY(phi + Math.PI);
    add(helm, g, trimMat);
  }
  // Ear modules and neck ring
  for (const side of [-1, 1]) {
    add(helm, G.Cylinder(0.065, 0.07, 0.06, 18), trimMat, 0.268 * side, 0, 0.02).rotation.z = Math.PI / 2;
    const ring = add(helm, G.Torus(0.042, 0.01, 6, 18), glowMat, 0.3 * side, 0, 0.02);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = false;
  }
  add(helm, G.Torus(0.205, 0.042, 8, 28), trimMat, 0, -0.2, 0).rotation.x = Math.PI / 2;
  buildTopper(helm, look, { add, rbox, metalMat, trimMat, plateMat, glowMat, blinkers });

  // A character is ~110 little parts. Parts that never move on their own (same limb, same
  // material) are welded into one mesh each, so it draws in about a third of the work.
  weldParts(model, { keep: new Set([body, ...blinkers]), remember: true });
  // ...and its shadow is cast by a few simple rounded shapes (one per limb) instead of every part
  addShadowShapes(model, new Set([...flames, ...eyes]));
  for (const e of eyes) e.traverse((o) => (o.castShadow = false)); // inside the helmet anyway

  if (name && tag) group.add(createNameTag(name));

  group.userData.body = body;
  group.userData.rig = {
    model, legs, knees, feet, arms, elbows, hands, torso, head: neck, eyes, blinkers, flames,
    flashMats: [plateMat, trimMat], suitMat,
    phase: Math.random() * 10, amp: 0, air: 0, land: 0, wasGround: true, time: Math.random() * 10,
    blink: 1 + Math.random() * 3,
  };
  return group;
}

// ---------- Hair and helmet gadgets ----------

function buildHair(head, look, mat, add, rbox) {
  const cap = (theta = 1.05) => add(head, G.Sphere(0.212, 26, 12, 0, TAU, 0, theta), mat);
  const back = () => add(head, G.Sphere(0.214, 22, 14, FRONT + 1.15, TAU - 2.3, 0, 2.05), mat);
  const onHead = (dir, r, geo) => {
    const m = add(head, geo, mat, dir.x * r, dir.y * r, dir.z * r);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return m;
  };
  const rnd = rng(look.seed ^ 0x9e3779b9);
  switch (look.hairStyle) {
    case 'short':
      cap();
      back();
      break;
    case 'spiky':
      cap(1.0);
      back();
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU, t = 0.15 + rnd() * 0.75;
        const dir = new THREE.Vector3(Math.cos(a) * Math.sin(t), Math.cos(t), Math.sin(a) * Math.sin(t));
        if (dir.z < -0.6) dir.z = -0.6; // keep spikes out of the eyes
        onHead(dir.normalize(), 0.2, G.Cone(0.045, 0.13, 6));
      }
      break;
    case 'bun':
      cap();
      back();
      add(head, G.Sphere(0.065, 14, 10), mat, 0, 0.17, 0.12);
      break;
    case 'mohawk':
      for (let i = 0; i < 6; i++) {
        const t = -0.55 + i * 0.34; // front to back over the top
        const m = add(head, rbox(0.04, 0.09, 0.06, 0.015), mat, 0, Math.cos(t) * 0.215, Math.sin(t) * 0.215);
        m.rotation.x = t;
      }
      break;
    case 'curly':
      for (let i = 0; i < 22; i++) {
        const a = rnd() * TAU, t = rnd() * 1.25;
        const dir = new THREE.Vector3(Math.cos(a) * Math.sin(t), Math.cos(t), Math.sin(a) * Math.sin(t));
        if (dir.z < 0 && dir.y < 0.55) dir.y = 0.55; // leave the face clear
        dir.normalize();
        add(head, G.Sphere(0.05, 10, 8), mat, dir.x * 0.19, dir.y * 0.19, dir.z * 0.19);
      }
      break;
    // 'bald': nothing, just a shiny head
  }
}

function buildTopper(helm, look, { add, rbox, metalMat, trimMat, plateMat, glowMat, blinkers }) {
  const antenna = (x, tilt) => {
    const rod = add(helm, G.Cylinder(0.008, 0.01, 0.2, 6), metalMat, x, 0.3, 0.05);
    rod.rotation.z = tilt;
    blinkers.push(add(helm, G.Sphere(0.024, 10, 8), glowMat, x - Math.sin(tilt) * 0.1, 0.3 + Math.cos(tilt) * 0.1, 0.05));
  };
  switch (look.topper) {
    case 'antenna':
      antenna(0.12, -0.35);
      break;
    case 'twin':
      antenna(0.12, -0.4);
      antenna(-0.12, 0.4);
      break;
    case 'fin':
      add(helm, rbox(0.035, 0.1, 0.3, 0.015), plateMat, 0, 0.27, 0.05);
      add(helm, rbox(0.038, 0.02, 0.26, 0.008), glowMat, 0, 0.3, 0.05).castShadow = false;
      break;
    case 'ears':
      for (const side of [-1, 1]) {
        const ear = add(helm, G.Cone(0.07, 0.13, 4), trimMat, 0.14 * side, 0.25, 0.02);
        ear.rotation.z = -0.45 * side;
        const inner = add(helm, G.Cone(0.04, 0.08, 4), glowMat, 0.142 * side, 0.245, -0.012);
        inner.rotation.z = -0.45 * side;
      }
      break;
    case 'lamp': {
      const lamp = add(helm, G.Cylinder(0.045, 0.05, 0.06, 16), metalMat, 0, 0.24, -0.125);
      lamp.rotation.x = Math.PI / 2 + 0.5;
      const lens = add(helm, G.Circle(0.038, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), 0, 0.226, -0.153);
      lens.rotation.x = 0.5 + Math.PI; // face forward and a bit down
      lens.rotation.y = Math.PI;
      lens.castShadow = false;
      break;
    }
    // 'none'
  }
}

// ---------- Looks from a name ----------

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickLooks(key) {
  const seed = hashString(key);
  const r = rng(seed);
  const pick = (list) => list[Math.floor(r() * list.length)];
  return {
    seed,
    skin: pick(SKIN),
    hair: pick(HAIR),
    eyes: pick(EYES),
    hairStyle: pick(HAIR_STYLES),
    mouth: pick(MOUTHS),
    topper: pick(TOPPERS),
    freckles: r() < 0.3,
  };
}

// ---------- Textures ----------

let fabricTex = null;
// Padded suit fabric: quilted panels with stitching, near-white so the suit color shows through
function fabricTexture() {
  if (fabricTex) return fabricTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let i = 0; i < 5000; i++) {
    const v = 215 + Math.floor(r() * 40);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  // Panel seams with a soft shadow
  for (let i = 0; i <= 4; i++) {
    const p = i * (S / 4);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, p - 2, S, 4);
    ctx.fillRect(p - 2, 0, 4, S);
  }
  // Stitches next to the seams
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  for (let i = 0; i < 4; i++) {
    const p = i * (S / 4) + 8;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
  }
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(2, 2);
  fabricTex.colorSpace = THREE.SRGBColorSpace;
  fabricTex.anisotropy = 4;
  return fabricTex;
}

let visorTex = null;
// Tinted glass with a couple of glare streaks
function visorTexture() {
  if (visorTex) return visorTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(110,190,255,0.2)';
  ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(30, 30);
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-6, -40, 10, 80);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(10, -40, 4, 80);
  ctx.restore();
  visorTex = new THREE.CanvasTexture(c);
  visorTex.colorSpace = THREE.SRGBColorSpace;
  return visorTex;
}

// Skin with mouth, cheeks and freckles, wrapped around the head sphere (the face is at u = 0.75)
function faceTexture(look) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(look.skin).getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.75;
  // Cheeks
  ctx.fillStyle = 'rgba(255,90,110,0.28)';
  for (const dx of [-36, 36]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, 146, 13, 7, 0, 0, TAU);
    ctx.fill();
  }
  if (look.freckles) {
    ctx.fillStyle = 'rgba(120,60,30,0.45)';
    const r = rng(look.seed);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(cx + side * (24 + r() * 22), 136 + r() * 14, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  // Mouth
  const my = 160;
  ctx.strokeStyle = '#5a1f1f';
  ctx.fillStyle = '#6b1d24';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (look.mouth) {
    case 'smile':
      ctx.arc(cx, my - 8, 13, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
      break;
    case 'grin':
      ctx.arc(cx, my - 5, 14, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 11, my - 5, 22, 4);
      break;
    case 'smirk':
      ctx.moveTo(cx - 12, my);
      ctx.quadraticCurveTo(cx + 2, my + 4, cx + 13, my - 6);
      ctx.stroke();
      break;
    case 'o':
      ctx.ellipse(cx, my, 6, 8, 0, 0, TAU);
      ctx.fill();
      break;
    default: // flat
      ctx.moveTo(cx - 10, my);
      ctx.lineTo(cx + 10, my);
      ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Round chest badge with the player's initial
function badgeTexture(name, glow) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = `#${glow.getHexString()}`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(32, 32, 27, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((name || '★').trim().charAt(0).toUpperCase() || '★', 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false });
const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });

// Show/hide the jetpack flames, flickering while on. Call every frame.
export function setJetFlames(group, on) {
  const flames = group.userData.rig?.flames;
  if (!flames) return;
  for (const f of flames) {
    f.visible = on;
    if (on) f.scale.set(1, 0.75 + Math.random() * 0.5, 1);
  }
}

// Walk/run/jump/land animation, blinking, and looking up/down. Call every frame.
// `pitch` is where they're aiming (radians, up is positive); the head follows it.
export function animateCharacter(group, speed, onGround, dt, pitch = 0) {
  const rig = group.userData.rig;
  if (!rig) return;
  dt = Math.min(dt, 0.1);
  rig.time += dt;
  const targetAmp = onGround ? Math.min(1, speed / CONFIG.sprintSpeed) : 0;
  rig.amp += (targetAmp - rig.amp) * Math.min(1, dt * 10);
  rig.air += ((onGround ? 0 : 1) - rig.air) * Math.min(1, dt * 8);
  rig.phase += dt * (4 + speed * 1.1);
  // Landing: a quick squash that springs back
  if (onGround && !rig.wasGround) rig.land = 1;
  rig.wasGround = onGround;
  rig.land = Math.max(0, rig.land - dt * 4);
  const squash = rig.land * rig.land * (3 - 2 * rig.land);

  const amp = rig.amp, air = rig.air, ph = rig.phase;
  const swing = Math.sin(ph) * amp * 0.7;
  const idle = (1 - amp) * (1 - air);

  // Legs: the knee bends while that leg swings forward; feet stay roughly flat
  const [legL, legR] = rig.legs;
  const [kneeL, kneeR] = rig.knees;
  legL.rotation.x = swing - air * 0.5 + squash * 0.45;
  legR.rotation.x = -swing + air * 0.25 + squash * 0.45;
  kneeL.rotation.x = -(Math.max(0, Math.cos(ph)) * 1.1 + 0.08) * amp - air * 0.9 - squash * 0.9;
  kneeR.rotation.x = -(Math.max(0, -Math.cos(ph)) * 1.1 + 0.08) * amp - air * 0.35 - squash * 0.9;
  const flat = 0.7 - air * 0.4;
  rig.feet[0].rotation.x = -(legL.rotation.x + kneeL.rotation.x) * flat;
  rig.feet[1].rotation.x = -(legR.rotation.x + kneeR.rotation.x) * flat;
  // Spread legs and crouches lower the body so the planted foot stays on the ground
  rig.model.position.y = -((1 - Math.cos(swing)) * 0.8 + squash * 0.09) * (CONFIG.playerHeight / 2);

  // Arms swing opposite the legs and pump harder when running; in the air they fly out
  const [armL, armR] = rig.arms;
  const [elbowL, elbowR] = rig.elbows;
  const sway = Math.sin(rig.time * 1.7) * 0.05 * idle;
  armL.rotation.x = -swing * 1.1 + air * 0.35 + sway;
  armR.rotation.x = swing * 1.1 + air * 0.35 - sway;
  armL.rotation.z = -0.08 - air * 0.7 - squash * 0.2;
  armR.rotation.z = 0.08 + air * 0.7 + squash * 0.2;
  elbowL.rotation.x = 0.2 + amp * 0.9 + air * 0.5;
  elbowR.rotation.x = 0.2 + amp * 0.9 + air * 0.5;
  // Holding an item (heldItems.js): right arm raised forward and straight
  if (rig.holding) {
    armR.rotation.x = 1.15 + swing * 0.12;
    armR.rotation.z = 0.08;
    elbowR.rotation.x = 0;
  }
  // A swing/chop that player just did (heldItems.js sets rig.swing = { t, d, kind })
  if (rig.swing) {
    rig.swing.t += dt;
    const k = Math.min(1, rig.swing.t / rig.swing.d);
    const base = rig.holding ? 1.15 : 0.2;
    if (rig.swing.kind === 'mine') {
      // overhead: arm up and back, then down hard in front
      const up = k < 0.4 ? Math.sin((k / 0.4) * Math.PI * 0.5) : k < 0.62 ? 1 - (k - 0.4) / 0.22 * 1.6 : -0.6 * (1 - (k - 0.62) / 0.38);
      armR.rotation.x = base + up * 1.5;
      elbowR.rotation.x = Math.max(0, up) * 0.6;
    } else {
      // side swing across the body
      const arc = Math.sin(k * Math.PI);
      armR.rotation.x = base + arc * 0.5;
      armR.rotation.z = 0.08 - arc * 0.9;
    }
    if (k >= 1) rig.swing = null;
  }

  // Torso leans into the run, twists with the stride, breathes when idle
  const look = THREE.MathUtils.clamp(pitch || 0, -1.3, 1.3);
  rig.torso.rotation.x = -amp * 0.14 - squash * 0.25 + look * 0.12;
  rig.torso.rotation.y = swing * 0.18;
  rig.torso.scale.set(1, 1 + Math.sin(rig.time * 2.2) * 0.012 * idle, 1);
  rig.head.rotation.x = look * 0.55 + squash * 0.15;
  rig.head.rotation.y = -swing * 0.15;

  // Blink every few seconds
  rig.blink -= dt;
  if (rig.blink < -0.13) rig.blink = 2 + Math.random() * 3.5;
  const lid = rig.blink < 0 ? Math.max(0.1, Math.abs(rig.blink + 0.065) / 0.065) : 1;
  for (const e of rig.eyes) e.scale.y = lid;

  // Blinking antenna lights
  const on = rig.time % 1.4 < 0.9;
  for (const b of rig.blinkers) b.visible = on;

  // Hit flashes (combat.js lights up the suit material) cover the armor too
  for (const m of rig.flashMats) {
    m.emissive.copy(rig.suitMat.emissive);
    m.emissiveIntensity = rig.suitMat.emissiveIntensity;
  }
}

function createNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 12);
  ctx.fill();
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = CONFIG.playerHeight + 0.5;
  return sprite;
}
