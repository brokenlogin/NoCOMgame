import * as THREE from 'three';
import { CONFIG } from './config.js';

// Player character: a little space-suited explorer with a glowing visor, backpack,
// and arms/legs that swing when walking. The group's origin sits at the player's feet,
// and -Z is forward. (File is still called capsule.js so other code keeps working.)
export function createCapsuleMesh(color = 0xffffff, name = '') {
  const H = CONFIG.playerHeight; // ~2.0, everything below is scaled to it
  const s = H / 2;

  const suit = new THREE.Color(color);
  const suitMat = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.55, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: suit.clone().multiplyScalar(0.45), roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.3, metalness: 0.8 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a24,
    emissive: new THREE.Color(0x2fb8ff),
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.6,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: suit.clone().lerp(new THREE.Color(0xffffff), 0.5) });

  const group = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // --- Legs (pivot at the hip so they can swing) ---
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.15 * side * s, 0.78 * s, 0);
    group.add(hip);
    add(hip, new THREE.CapsuleGeometry(0.13 * s, 0.42 * s, 4, 10), suitMat, 0, -0.36 * s, 0);
    add(hip, new THREE.CylinderGeometry(0.145 * s, 0.145 * s, 0.1 * s, 12), trimMat, 0, -0.3 * s, 0); // knee pad
    add(hip, new THREE.BoxGeometry(0.24 * s, 0.14 * s, 0.36 * s), darkMat, 0, -0.71 * s, -0.05 * s); // boot
    legs.push(hip);
  }

  // --- Torso ---
  const torso = new THREE.Group();
  torso.position.y = 1.12 * s;
  group.add(torso);
  const body = add(torso, new THREE.CapsuleGeometry(0.31 * s, 0.32 * s, 6, 16), suitMat, 0, 0, 0);
  body.scale.set(1, 1, 0.8);
  add(torso, new THREE.TorusGeometry(0.29 * s, 0.045 * s, 8, 24), darkMat, 0, -0.24 * s, 0).rotation.x = Math.PI / 2; // belt
  add(torso, new THREE.BoxGeometry(0.1 * s, 0.07 * s, 0.05 * s), metalMat, 0, -0.24 * s, -0.27 * s); // buckle
  add(torso, new THREE.BoxGeometry(0.2 * s, 0.13 * s, 0.05 * s), trimMat, 0.05 * s, 0.1 * s, -0.25 * s); // chest panel
  add(torso, new THREE.SphereGeometry(0.025 * s, 8, 8), glowMat, 0.1 * s, 0.11 * s, -0.28 * s); // status light

  // Backpack with an antenna
  add(torso, new THREE.BoxGeometry(0.42 * s, 0.5 * s, 0.2 * s), trimMat, 0, 0.05 * s, 0.3 * s);
  add(torso, new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.4 * s, 10), metalMat, -0.12 * s, 0.05 * s, 0.42 * s);
  add(torso, new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.4 * s, 10), metalMat, 0.12 * s, 0.05 * s, 0.42 * s);
  // Jetpack flames under the two tanks (hidden until the jetpack fires)
  const flames = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Group();
    flame.position.set(0.12 * side * s, -0.15 * s, 0.42 * s);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.45 * s, 10), flameOuterMat);
    outer.rotation.x = Math.PI; // point down
    outer.position.y = -0.22 * s;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.25 * s, 8), flameInnerMat);
    inner.rotation.x = Math.PI;
    inner.position.y = -0.12 * s;
    flame.add(outer, inner);
    flame.visible = false;
    torso.add(flame);
    flames.push(flame);
  }
  add(torso, new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.4 * s, 6), metalMat, 0.15 * s, 0.45 * s, 0.32 * s);
  add(torso, new THREE.SphereGeometry(0.04 * s, 8, 8), glowMat, 0.15 * s, 0.66 * s, 0.32 * s);

  // --- Arms (pivot at the shoulder) ---
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.4 * side * s, 0.24 * s, 0);
    torso.add(shoulder);
    add(shoulder, new THREE.SphereGeometry(0.13 * s, 12, 10), trimMat, 0, 0, 0); // shoulder pad
    add(shoulder, new THREE.CapsuleGeometry(0.095 * s, 0.36 * s, 4, 10), suitMat, 0.02 * side * s, -0.28 * s, 0);
    add(shoulder, new THREE.SphereGeometry(0.1 * s, 10, 8), darkMat, 0.02 * side * s, -0.55 * s, 0); // glove
    shoulder.rotation.z = 0.08 * side;
    arms.push(shoulder);
  }

  // --- Head: helmet with a wrap-around visor ---
  const head = new THREE.Group();
  head.position.y = 1.7 * s;
  group.add(head);
  add(head, new THREE.SphereGeometry(0.27 * s, 24, 18), suitMat, 0, 0, 0);
  const visor = add(
    head,
    // A slice of a slightly bigger sphere, facing forward (-Z)
    new THREE.SphereGeometry(0.255 * s, 24, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.32),
    visorMat,
    0,
    0.01 * s,
    -0.035 * s
  );
  visor.scale.setScalar(1.08);
  add(head, new THREE.TorusGeometry(0.24 * s, 0.04 * s, 8, 24), trimMat, 0, -0.2 * s, 0).rotation.x = Math.PI / 2; // neck ring
  add(head, new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.06 * s, 12), metalMat, 0.27 * s, 0, 0).rotation.z = Math.PI / 2; // ear light
  add(head, new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.06 * s, 12), metalMat, -0.27 * s, 0, 0).rotation.z = Math.PI / 2;

  if (name) group.add(createNameTag(name));

  group.userData.body = body;
  group.userData.rig = { legs, arms, torso, head, flames, phase: Math.random() * 10, amp: 0 };
  return group;
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

// Swing arms and legs based on how fast the character is moving. Call every frame.
export function animateCharacter(group, speed, onGround, dt) {
  const rig = group.userData.rig;
  if (!rig) return;
  const targetAmp = onGround ? Math.min(1, speed / CONFIG.sprintSpeed) : 0;
  rig.amp += (targetAmp - rig.amp) * Math.min(1, dt * 10);
  rig.phase += dt * (4 + speed * 1.1);

  const swing = Math.sin(rig.phase) * rig.amp * 0.9;
  const [legL, legR] = rig.legs;
  const [armL, armR] = rig.arms;
  // In the air: tuck the legs, raise the arms
  const air = onGround ? 0 : 1;
  legL.rotation.x = swing - air * 0.35;
  legR.rotation.x = -swing + air * 0.15;
  armL.rotation.x = -swing * 0.8 - air * 0.6;
  armR.rotation.x = swing * 0.8 - air * 0.6;

  // Bob while walking, breathe while idle
  const s = CONFIG.playerHeight / 2;
  const bob = Math.abs(Math.cos(rig.phase)) * rig.amp * 0.05 + Math.sin(rig.phase * 0.35) * 0.008;
  rig.torso.position.y = 1.12 * s + bob;
  rig.head.position.y = 1.7 * s + bob;
  rig.torso.rotation.x = -rig.amp * 0.12; // lean into the run
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
