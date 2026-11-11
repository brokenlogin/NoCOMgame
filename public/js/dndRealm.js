// The Realm of Embervale: a fantasy land in its own void east of the map
// (CONFIG.terrain.voids), reached by the 📜 portal near spawn. This file builds the places,
// people and monsters; dndRpg.js runs the game on top of them.
//
//   Embervale village   inn, temple, smithy, mayor's hall, herbalist, market, tavern
//   Whispering Woods    north of the village: goblins, wolves, spiders, the goblin camp
//   East Road           bandits (Captain Vex)
//   Crypt of the Fallen King  graves, the rune-sealed door, Varkas inside
//   Mountain Pass       orcs, ogres and Grimtooth's troll bridge over the chasm
//   Kharak              the dwarf hold beyond the bridge (Durin's forge)
//   Dragon's Peak       volcanic slopes, cultists, and Ignaroth's lair at the top
// Waystones in every zone let you fast travel once you've touched them.

import * as THREE from 'three';
import { makeLabel } from './spaceRpg.js';
import { itemTexture } from './itemTextures.js';
import { MONSTERS, ENCOUNTERS } from './dndData.js';
import { mulberry32 } from './mgShared.js';

export const REALM = { x0: 400, x1: 1100, z0: -250, z1: 450 };
const Y = 20;
export const ZONES = {
  village: { name: 'Embervale', c: [520, Y, 0], r: 65, color: '#ffd23d' },
  woods: { name: 'Whispering Woods', c: [520, Y, 200], r: 65, color: '#6adf6a' },
  road: { name: 'East Road', c: [650, Y, 0], r: 40, color: '#d8b080' },
  crypt: { name: 'Crypt of the Fallen King', c: [720, Y, 200], r: 60, color: '#9aa8c8' },
  pass: { name: 'Mountain Pass', c: [900, Y, 110], r: 70, color: '#c8b8a0' },
  kharak: { name: 'Kharak, Hold of the Dwarves', c: [920, Y, -110], r: 55, color: '#ffb070' },
  peak: { name: "Dragon's Peak", c: [720, Y, -130], r: 70, color: '#ff6a3a' },
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildRealm(game) {
  const { scene, world } = game;
  const root = new THREE.Group();
  scene.add(root);
  const rnd = mulberry32(777);
  const mats = {};
  const mat = (color, o = {}) => (mats[color + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
  function box(x, top, z, w, h, d, color, { walk = true, solid = false, o = {}, parent = root } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
    m.position.set(x, top - h / 2, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    m.updateMatrixWorld();
    if (walk) world.colliders.push(m);
    if (solid) world.solidBoxes.push(new THREE.Box3().setFromObject(m));
    return m;
  }
  function mesh(geo, color, x, y, z, o = {}) {
    const m = new THREE.Mesh(geo, mat(color, o));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  }
  const label = (lines, scale = 0.01) => makeLabel(lines.map((l, i) => (typeof l === 'string' ? { text: l, size: i ? 34 : 50, color: i ? '#e8dcc0' : '#ffe8b0', bold: !i } : l)), { scale, bg: 'rgba(40,24,10,0.78)' });
  const grassTex = itemTexture('grit');

  // ---------- Ground and roads ----------
  const ground = (x, z, w, d, color, top = Y) => box(x, top, z, w, 3, d, color, { o: { bumpMap: grassTex, bumpScale: 1.2 } });
  ground(520, 0, 130, 130, 0x5a8a3a); // village
  ground(520, 200, 130, 130, 0x2f5a2a); // woods
  ground(720, 200, 120, 120, 0x4a4a48); // crypt
  ground(650, 0, 140, 16, 0x8a6a40); // east road (village to the crossroads)
  ground(720, 72, 16, 136, 0x8a6a40); // north to the crypt
  ground(720, -35, 16, 70, 0x6a4a3a); // south to the peak
  ground(520, 102, 12, 76, 0x8a6a40); // path to the woods
  ground(785, 0, 130, 16, 0x8a6a40); // east to the pass
  ground(845, 15, 16, 30, 0x8a6a40);
  ground(870, 100, 60, 160, 0x8a7a68); // pass, west side (before the chasm)
  ground(945, 100, 50, 160, 0x8a7a68); // pass, east side (after the chasm)
  ground(940, -15, 16, 110, 0x7a6a58); // road from the pass to Kharak
  ground(920, -110, 100, 80, 0x6a5a4a); // Kharak
  ground(720, -130, 140, 140, 0x3a2a24); // peak base
  // Pass bridge over the chasm (x 900..920)
  box(910, Y + 0.2, 110, 24, 1, 6, 0x6a4a2a);
  for (const s of [-1, 1]) box(910, Y + 1.4, 110 + s * 3, 24, 0.3, 0.3, 0x5a3a1a, { walk: false });
  const bridgeGate = box(912, Y + 4, 110, 1, 4, 6, 0x4a3a2a, { walk: false, solid: true }); // Grimtooth's barricade
  // Peak: terraces climbing to the lair (lair top at Y+22)
  const TERRACES = [[700, -110, 70, 70, 4], [690, -150, 50, 50, 9], [690, -175, 34, 30, 14], [700, -195, 40, 26, 19], [720, -215, 36, 30, 22]];
  for (const [x, z, w, d, h] of TERRACES) box(x, Y + h, z, w, h + 3, d, 0x4a3028, { o: { bumpMap: grassTex, bumpScale: 2 } });
  for (let i = 0; i < TERRACES.length - 1; i++) {
    const [x1, z1, , , h1] = TERRACES[i], [x2, z2, , , h2] = TERRACES[i + 1];
    const ramp = box((x1 + x2) / 2, Y + (h1 + h2) / 2, (z1 + z2) / 2, 6, 1, Math.hypot(x2 - x1, z2 - z1) + 6, 0x5a3a2a);
    ramp.lookAt(x2, ramp.position.y, z2);
    ramp.rotateX(Math.atan2(h2 - h1, Math.hypot(x2 - x1, z2 - z1)) * -1);
    ramp.updateMatrixWorld();
  }
  // Lava pools
  const lavaMat = { emissive: 0xff3a00, emissiveIntensity: 1.3 };
  for (const [x, z, r] of [[760, -100, 9], [660, -90, 7], [745, -165, 6], [650, -170, 8]]) {
    const l = mesh(new THREE.CircleGeometry(r, 24), 0xff5a10, x, Y + 0.05, z, lavaMat);
    l.rotation.x = -Math.PI / 2;
  }

  // ---------- Props ----------
  function tree(x, z, dark = false, s = 1) {
    const h = (5 + rnd() * 4) * s;
    mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, h, 7), 0x5a3a20, x, Y + h / 2, z);
    const leaves = dark ? 0x2a4a2a : 0x3f7a3a;
    for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry((3 - k * 0.7) * s, 3.5 * s, 8), leaves, x, Y + h - 1 + k * 1.8 * s, z, { flatShading: true });
    world.solidBoxes.push(new THREE.Box3().setFromCenterAndSize(V(x, Y + 2, z), V(0.9 * s, 4, 0.9 * s)));
  }
  function house(x, z, w, d, wall, roof, ry = 0, sign) {
    const g = new THREE.Group();
    g.position.set(x, Y, z);
    g.rotation.y = ry;
    root.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), mat(wall, { map: itemTexture('wood') }));
    body.position.y = 2.5;
    const top = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.6, 3.5, 4), mat(roof, { flatShading: true }));
    top.position.y = 6.75;
    top.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), mat(0x4a2a10));
    door.position.set(0, 1.2, d / 2 + 0.05);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), mat(0xffd27a, { emissive: 0xffa040, emissiveIntensity: 0.8 }));
    win.position.set(w / 4, 3, d / 2 + 0.05);
    g.add(body, top, door, win);
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    g.updateMatrixWorld(true);
    world.solidBoxes.push(new THREE.Box3().setFromObject(body));
    if (sign) {
      const l = label([sign], 0.012);
      l.position.set(x, Y + 9.5, z);
      root.add(l);
    }
    return g;
  }
  function lamp(x, z) {
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6), 0x2a2a2a, x, Y + 1.6, z);
    mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), 0xffc070, x, Y + 3.3, z, { emissive: 0xffa040, emissiveIntensity: 1.5 });
  }
  function rock(x, z, s, color = 0x7a7068, top = Y) {
    const geo = new THREE.IcosahedronGeometry(s, 0);
    const m = mesh(geo, color, x, top + s * 0.4, z, { flatShading: true });
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.updateMatrixWorld();
    world.colliders.push(m);
    world.solidBoxes.push(new THREE.Box3().setFromObject(m).expandByScalar(-s * 0.35));
  }

  // Village
  house(500, -30, 9, 7, 0xb89a70, 0x8a3a2a, 0, '🍺 The Gilded Tankard (inn)');
  house(545, -28, 8, 8, 0xe8e2d0, 0x3a5a8a, 0, '⛪ Temple of the Dawn');
  mesh(new THREE.CylinderGeometry(1.2, 1.4, 10, 8), 0xe8e2d0, 545, Y + 5, -33);
  house(480, 20, 7, 6, 0x9a8a7a, 0x4a4a4a, Math.PI / 2, '⚒️ Hilda\'s Smithy');
  mesh(new THREE.BoxGeometry(1.6, 1, 1.6), 0x2a2a2a, 486, Y + 0.5, 26, { emissive: 0xff5a10, emissiveIntensity: 0.9 });
  house(560, 22, 10, 8, 0xc8b090, 0x6a2a6a, -Math.PI / 2, '🏛️ Mayor\'s Hall');
  house(530, 40, 6, 6, 0xa8c890, 0x3a6a3a, Math.PI, '🌿 Wren\'s Herbs & Potions');
  for (const [x, z] of [[470, -50], [575, -55], [470, 50], [585, 50], [460, -10], [590, -10]]) house(x, z, 6, 5, 0xa89070, 0x7a4a2a, rnd() * 6);
  // Well and market stalls in the square
  mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 16), 0x8a8a8a, 520, Y + 0.6, 0);
  mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 16), 0x3a6aaa, 520, Y + 1.15, 0, { emissive: 0x0a2a4a });
  world.solidBoxes.push(new THREE.Box3().setFromCenterAndSize(V(520, Y + 0.6, 0), V(3.2, 1.2, 3.2)));
  for (const [x, z, c] of [[508, 10, 0xd84a3a], [532, 10, 0x3a8ad8], [508, -10, 0xd8b83a]]) {
    box(x, Y + 1, z, 3, 1, 1.6, 0x7a5a3a, { walk: false });
    mesh(new THREE.BoxGeometry(3.4, 0.15, 2.2), c, x, Y + 2.8, z);
  }
  for (const [x, z] of [[512, -14], [528, -14], [512, 14], [528, 14], [520, 60], [520, -60], [455, 0], [585, 0]]) lamp(x, z);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) > 0.95 || Math.abs(Math.cos(a)) > 0.97) continue; // gaps for the roads
    tree(520 + Math.cos(a) * 60, Math.sin(a) * 60);
  }
  const vsign = label(['EMBERVALE', 'Talk to the villagers (E) · K: character sheet'], 0.02);
  vsign.position.set(520, Y + 12, 0);
  root.add(vsign);

  // Woods: dense trees, the goblin camp, the old oak
  for (let i = 0; i < 90; i++) {
    const x = 460 + rnd() * 120, z = 140 + rnd() * 120;
    if (Math.abs(x - 520) < 6 && z < 175) continue; // keep the path open
    if (Math.hypot(x - 545, z - 235) < 14) continue; // the camp clearing
    tree(x, z, true, 0.8 + rnd() * 0.6);
  }
  tree(505, 190, true, 2.2); // the old oak
  const CAMP = V(545, Y, 235);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    mesh(new THREE.ConeGeometry(2, 3, 5), 0x6a5a3a, CAMP.x + Math.cos(a) * 9, Y + 1.5, CAMP.z + Math.sin(a) * 9, { flatShading: true });
  }
  const campfire = mesh(new THREE.ConeGeometry(0.8, 1.6, 6), 0xff7a1a, CAMP.x, Y + 0.8, CAMP.z, { emissive: 0xff5a00, emissiveIntensity: 2 });
  const cage = new THREE.Group();
  cage.position.set(CAMP.x + 5, Y, CAMP.z - 4);
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat(0x3a3a3a, { metalness: 0.6 }));
    bar.position.set(Math.cos((i / 8) * Math.PI * 2) * 1.1, 1.3, Math.sin((i / 8) * Math.PI * 2) * 1.1);
    cage.add(bar);
  }
  root.add(cage);
  const campLabel = label(['🔥 Goblin Camp'], 0.014);
  campLabel.position.set(CAMP.x, Y + 6, CAMP.z);
  root.add(campLabel);

  // East road: a wrecked cart (the bandits' handiwork)
  box(640, Y + 1.2, 6, 3, 1, 2, 0x6a4a2a, { walk: false });
  mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 12), 0x3a2a1a, 641, Y + 0.6, 7.1);

  // Crypt: graves, dead trees, the mausoleum with its rune door
  for (let i = 0; i < 40; i++) {
    const x = 670 + rnd() * 100, z = 150 + rnd() * 70;
    if (Math.abs(x - 720) < 5) continue;
    box(x, Y + 1 + rnd() * 0.5, z, 0.8, 1.2, 0.25, 0x8a8a8a, { walk: false });
  }
  for (let i = 0; i < 10; i++) tree(665 + rnd() * 110, 145 + rnd() * 80, true, 0.7);
  box(720, Y + 8, 240, 30, 8, 26, 0x5a5a62, { solid: true, walk: false }); // mausoleum (back part)
  for (const dx of [-10, -5, 5, 10]) mesh(new THREE.CylinderGeometry(0.8, 0.9, 8, 10), 0x7a7a82, 720 + dx, Y + 4, 225);
  box(720, Y + 9, 225, 26, 1, 4, 0x6a6a72, { walk: false });
  const runeDoor = box(720, Y + 5, 226.5, 5, 5, 0.6, 0x3a3a5a, { walk: false, solid: true, o: { emissive: 0x3a5aff, emissiveIntensity: 0.6 } });
  const SANCTUM = V(720, Y, 213); // inner yard behind the door... (Varkas waits by the door, inside)
  const cryptLabel = label(['⚰️ Crypt of the Fallen King'], 0.016);
  cryptLabel.position.set(720, Y + 13, 226);
  root.add(cryptLabel);

  // Pass: cliffs and boulders; the chasm between x 900 and 920
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    rock(845 + rnd() * 120, 110 + side * (55 + rnd() * 15), 3 + rnd() * 4, 0x8a7a6a);
  }
  for (let i = 0; i < 12; i++) rock(850 + rnd() * 110, 50 + rnd() * 120, 1 + rnd() * 1.5, 0x7a6a5a);
  const passLabel = label(['🌉 Grimtooth\'s Bridge', 'Toll: your life (or a good argument)'], 0.014);
  passLabel.position.set(910, Y + 7, 110);
  root.add(passLabel);

  // Kharak: a great stone gate carved into the mountain
  box(920, Y + 18, -150, 90, 18, 8, 0x6a6a6a, { solid: true, walk: false });
  for (const dx of [-8, 8]) box(920 + dx, Y + 12, -145, 4, 12, 3, 0x8a8a8a, { solid: true, walk: false });
  box(920, Y + 13, -145, 20, 2, 3, 0x8a8a8a, { walk: false });
  mesh(new THREE.BoxGeometry(12, 10, 0.4), 0x4a3020, 920, Y + 5, -146.3, { emissive: 0x2a1000 });
  const forge = mesh(new THREE.BoxGeometry(3, 2, 3), 0x3a3a3a, 905, Y + 1, -120, { emissive: 0xff5a10, emissiveIntensity: 1 });
  void forge;
  box(912, Y + 1, -120, 2, 1, 1, 0x5a5a5a, { walk: false }); // anvil
  const kLabel = label(['⛏️ KHARAK', 'Hold of the Dwarves'], 0.02);
  kLabel.position.set(920, Y + 21, -146);
  root.add(kLabel);

  // Peak: the dragon's lair at the top, charred trees, an altar for the cultists
  for (let i = 0; i < 14; i++) {
    const x = 660 + rnd() * 120, z = -80 - rnd() * 50;
    mesh(new THREE.CylinderGeometry(0.2, 0.35, 4, 6), 0x1a1a1a, x, Y + 6, z);
  }
  box(700, Y + 10, -150, 6, 1, 3, 0x2a1a1a); // altar
  mesh(new THREE.ConeGeometry(0.5, 1.4, 6), 0xff7a1a, 700, Y + 10.8, -150, { emissive: 0xff4a00, emissiveIntensity: 2 });
  const LAIR = V(720, Y + 22, -215);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mesh(new THREE.ConeGeometry(1.2, 6, 5), 0x2a1a14, LAIR.x + Math.cos(a) * 16, LAIR.y + 3, LAIR.z + Math.sin(a) * 13, { flatShading: true });
  }
  const gold = mesh(new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffc23a, LAIR.x + 8, LAIR.y, LAIR.z - 8, { metalness: 0.9, roughness: 0.3 });
  void gold;
  const lairLabel = label(["🐉 Ignaroth's Lair"], 0.016);
  lairLabel.position.set(LAIR.x, LAIR.y + 14, LAIR.z);
  root.add(lairLabel);

  // ---------- Portal to the realm (near spawn) and back ----------
  const PORTAL = { x: 0, z: 14 };
  function makePortal(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 12, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 }));
    ring.position.y = 1.6;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    disc.position.y = 1.6;
    g.add(ring, disc);
    g.userData = { ring, disc };
    return g;
  }
  const portal = makePortal(0xffa030);
  const pl = label(['📜 Realm of Embervale', 'A tabletop-style fantasy RPG'], 0.008);
  pl.position.y = 3.4;
  portal.add(pl);
  scene.add(portal);
  const homePortal = makePortal(0x7aff9a);
  homePortal.position.set(520, Y, -62);
  const hl = label(['🏠 Back to the map'], 0.008);
  hl.position.y = 3.4;
  homePortal.add(hl);
  root.add(homePortal);

  // ---------- Waystones (fast travel) ----------
  const waystones = Object.entries({
    village: [520, 8], woods: [520, 150], crypt: [720, 150], pass: [860, 110], kharak: [935, -90], peak: [720, -75],
  }).map(([zone, [x, z]]) => {
    const g = new THREE.Group();
    g.position.set(x, Y, z);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1, 3.4, 0.7), mat(0x8a8a92));
    stone.position.y = 1.7;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x5ab8ff, emissive: 0x2a8aff, emissiveIntensity: 1.5 }));
    rune.position.set(0, 2.2, 0.38);
    g.add(stone, rune);
    root.add(g);
    world.solidBoxes.push(new THREE.Box3().setFromCenterAndSize(V(x, Y + 1.7, z), V(1, 3.4, 0.7)));
    return { zone, pos: V(x, Y, z), rune };
  });

  // ---------- Fantasy people ----------
  function humanoid({ skin = 0xe8b890, tunic = 0x5a6a8a, legs = 0x3a2a1a, hair = 0x4a2a10, beard = false, hat = null, robe = false, size = 1, horns = false } = {}) {
    const g = new THREE.Group();
    const s = size;
    const b = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mat(color));
      m.position.set(x * s, y * s, z * s);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const legsL = new THREE.Group(), legsR = new THREE.Group();
    for (const [lg, sx] of [[legsL, -1], [legsR, 1]]) {
      lg.position.set(sx * 0.15 * s, 0.9 * s, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.9 * s, 0.24 * s), mat(robe ? tunic : legs));
      m.position.y = -0.45 * s;
      m.castShadow = true;
      lg.add(m);
      g.add(lg);
    }
    b(robe ? 0.7 : 0.6, robe ? 1.4 : 0.8, 0.38, tunic, 0, robe ? 1.05 : 1.3, 0);
    b(0.08 + 0.6, 0.12, 0.4, 0x3a2a1a, 0, 1.0, 0); // belt
    for (const sx of [-1, 1]) b(0.18, 0.75, 0.2, tunic, sx * 0.4, 1.35, 0);
    for (const sx of [-1, 1]) b(0.16, 0.16, 0.16, skin, sx * 0.4, 0.92, 0);
    b(0.42, 0.45, 0.42, skin, 0, 1.95, 0);
    b(0.44, 0.15, 0.44, hair, 0, 2.2, 0.01);
    for (const sx of [-1, 1]) b(0.07, 0.07, 0.02, 0x111111, sx * 0.1, 2.0, -0.22);
    if (beard) b(0.42, 0.35, 0.12, hair, 0, 1.75, -0.2);
    if (hat === 'wizard') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, 0.9 * s, 10), mat(tunic));
      c.position.y = 2.65 * s;
      g.add(c);
    } else if (hat === 'hood') b(0.5, 0.5, 0.5, tunic, 0, 2.1, 0.03);
    else if (hat === 'helm') b(0.48, 0.3, 0.48, 0x9a9aa2, 0, 2.25, 0);
    else if (hat === 'crown') b(0.46, 0.14, 0.46, 0xffc23a, 0, 2.32, 0);
    if (horns) for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.3 * s, 6), mat(0xe8e0c8));
      h.position.set(sx * 0.18 * s, 2.3 * s, 0);
      h.rotation.z = -sx * 0.4;
      g.add(h);
    }
    g.userData.legs = [legsL, legsR];
    return g;
  }

  // ---------- Monsters (overworld and boss models) ----------
  function creature(id) {
    const def = MONSTERS[id];
    const s = def.size || 1;
    const c = def.color;
    let g;
    if (def.model === 'goblin') g = humanoid({ skin: c || 0x6a9a3a, tunic: 0x5a4a2a, legs: 0x3a2a1a, hair: 0x2a3a1a, size: 0.7 * s, hat: id === 'gruk' ? 'helm' : null });
    else if (def.model === 'orc') g = humanoid({ skin: c || 0x5a8a4a, tunic: 0x4a3a2a, hair: 0x1a1a1a, size: 1.2 * s, horns: id === 'troll' });
    else if (def.model === 'humanoid') g = humanoid({ tunic: c || 0x5a4a3a, hat: def.spell ? 'hood' : null, robe: !!def.spell, size: s });
    else if (def.model === 'skeleton') g = humanoid({ skin: 0xe8e4d8, tunic: c || 0xd8d4c8, legs: 0xd8d4c8, hair: 0xe8e4d8, size: s, hat: id === 'varkas' ? 'crown' : null });
    else if (def.model === 'zombie') g = humanoid({ skin: c || 0x7a9a6a, tunic: 0x4a4a5a, hair: 0x2a2a2a, size: s });
    else if (def.model === 'wolf') {
      g = new THREE.Group();
      const m = (w, h, d, x, y, z, color = c || 0x6a6a6a) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mat(color));
        b.position.set(x * s, y * s, z * s);
        b.castShadow = true;
        g.add(b);
        return b;
      };
      m(0.6, 0.55, 1.3, 0, 0.8, 0);
      m(0.45, 0.45, 0.6, 0, 1.05, -0.8);
      m(0.25, 0.2, 0.3, 0, 0.95, -1.15);
      for (const sx of [-1, 1]) m(0.08, 0.2, 0.08, sx * 0.15, 1.35, -0.75);
      m(0.15, 0.15, 0.6, 0, 0.95, 0.85);
      g.userData.legs = [];
      for (const [x, z] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) {
        const l = new THREE.Group();
        l.position.set(x * s, 0.6 * s, z * s);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.6 * s, 0.14 * s), mat(c || 0x6a6a6a));
        b.position.y = -0.3 * s;
        l.add(b);
        g.add(l);
        g.userData.legs.push(l);
      }
      for (const sx of [-1, 1]) m(0.06, 0.06, 0.02, sx * 0.12, 1.1, -1.11, 0xffd23d);
    } else if (def.model === 'spider') {
      g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), mat(0x1a1a1a));
      body.position.y = 0.9;
      body.scale.z = 1.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(0x2a1a1a));
      head.position.set(0, 0.85, -1);
      g.add(body, head);
      g.userData.legs = [];
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
        const l = new THREE.Group();
        l.position.set(sx * 0.5, 0.9, -0.5 + i * 0.35);
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), mat(0x111111));
        b.position.x = sx * 0.6;
        l.add(b);
        l.rotation.z = sx * -0.6;
        g.add(l);
        g.userData.legs.push(l);
      }
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mat(0xff2020, { emissive: 0xff0000, emissiveIntensity: 1 }));
        e.position.set(sx * 0.15, 0.95, -1.4);
        g.add(e);
      }
      g.scale.setScalar(s);
    } else if (def.model === 'dragon') {
      g = new THREE.Group();
      const red = mat(0xa8201a, { roughness: 0.6, bumpMap: itemTexture('scales'), bumpScale: 1.5 });
      const belly = mat(0xe8a03a);
      const part = (geo, m2, x, y, z) => {
        const p = new THREE.Mesh(geo, m2);
        p.position.set(x, y, z);
        p.castShadow = true;
        g.add(p);
        return p;
      };
      const body = part(new THREE.CapsuleGeometry(3, 7, 8, 16), red, 0, 5, 0);
      body.rotation.x = Math.PI / 2;
      part(new THREE.CapsuleGeometry(2.4, 5, 6, 12), belly, 0, 3.6, 0).rotation.x = Math.PI / 2;
      const neck = part(new THREE.CylinderGeometry(1.2, 2, 7, 12), red, 0, 9, -6);
      neck.rotation.x = -0.8;
      const head = part(new THREE.BoxGeometry(2.6, 2.2, 4.4), red, 0, 12, -9.5);
      part(new THREE.BoxGeometry(2, 1, 2.4), red, 0, 11.3, -12);
      for (const sx of [-1, 1]) {
        const horn = part(new THREE.ConeGeometry(0.35, 2.4, 8), mat(0xe8e0c8), sx * 0.9, 13.6, -8.6);
        horn.rotation.x = 0.7;
        part(new THREE.SphereGeometry(0.3, 8, 6), mat(0xffd23d, { emissive: 0xffa000, emissiveIntensity: 2 }), sx * 0.8, 12.5, -11.6);
        const wing = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 3, 1, true), mat(0x7a1410, { side: THREE.DoubleSide }));
        wing.position.set(sx * 7, 9, 0);
        wing.rotation.set(0, 0, sx * -1.3);
        wing.scale.z = 0.15;
        g.add(wing);
        for (const z of [-3, 3]) part(new THREE.CylinderGeometry(0.8, 0.6, 4, 8), red, sx * 2.4, 2, z);
      }
      const tail = part(new THREE.ConeGeometry(1.6, 12, 8), red, 0, 4, 10);
      tail.rotation.x = Math.PI / 2 + 0.2;
      void head;
      g.scale.setScalar(s);
      g.userData.legs = [];
    }
    const tag = label([def.name], 0.009);
    tag.position.y = def.model === 'dragon' ? 15 * s : 2.7 * (s || 1);
    g.add(tag);
    g.userData.tag = tag;
    return g;
  }

  // ---------- Villagers and other characters ----------
  const NPCS = [
    { id: 'brannoc', name: 'Mayor Brannoc', role: 'Quests', pos: [557, 13], face: Math.PI, look: { tunic: 0x6a2a6a, hair: 0x8a8a8a, beard: true, hat: 'crown' } },
    { id: 'maren', name: 'Sister Maren', role: 'Temple · Healing', pos: [545, -22], face: 0, look: { tunic: 0xf0ead8, robe: true, hat: 'hood', hair: 0xd8b070 } },
    { id: 'bram', name: 'Bram the Innkeeper', role: 'Inn · Rest · Rumors', pos: [500, -24], face: 0, look: { tunic: 0x8a5a3a, beard: true, hair: 0x5a3a1a } },
    { id: 'hilda', name: 'Hilda the Smith', role: 'Weapons · Armor', pos: [486, 22], face: -Math.PI / 2, look: { tunic: 0x4a4a4a, hair: 0xd8a040 } },
    { id: 'wren', name: 'Wren the Herbalist', role: 'Potions', pos: [530, 35], face: Math.PI, look: { tunic: 0x4a8a4a, robe: true, hair: 0x8a3a1a } },
    { id: 'garrick', name: 'Garrick the Hunter', role: 'Bounties', pos: [526, 64], face: Math.PI, look: { tunic: 0x5a6a3a, hat: 'hood', beard: true } },
    { id: 'agatha', name: 'Old Agatha', role: 'Villager', pos: [474, -44], face: 0, look: { tunic: 0x6a5a7a, robe: true, hair: 0xd8d8d8 } },
    { id: 'pip', name: 'Pip the Bard', role: 'Songs · Dice', pos: [510, -16], face: 0, look: { tunic: 0xd83a8a, hat: 'wizard', hair: 0xffd23d } },
    { id: 'durin', name: 'Durin Forgefist', role: 'Master Smith · Quests', pos: [910, -116], face: Math.PI, look: { tunic: 0x6a3a2a, beard: true, hair: 0xd85a1a, size: 0.8, hat: 'helm' } },
    { id: 'thora', name: 'Thora Stonebraid', role: 'Dwarven Wares', pos: [930, -116], face: Math.PI, look: { tunic: 0x3a4a6a, beard: true, hair: 0x5a3a1a, size: 0.8 } },
    { id: 'grimtooth', name: 'Grimtooth', role: 'Bridge Troll', pos: [906, 110], face: -Math.PI / 2, look: { skin: 0x4a6a4a, tunic: 0x3a2a1a, size: 2.1, horns: true } },
  ];
  for (const n of NPCS) {
    const g = humanoid(n.look);
    g.position.set(n.pos[0], Y, n.pos[1]);
    g.rotation.y = n.face;
    root.add(g);
    const tag = label([n.name, n.role], 0.0085);
    tag.position.y = 2.75 * (n.look.size || 1) + 0.2;
    g.add(tag);
    n.g = g;
    n.tag = tag;
    n.p = g.position;
  }

  // ---------- Places to interact with (E) ----------
  // kind: check (skill check), boss (fight), pick (collect), chest
  const SPOTS = [
    { id: 'cage', kind: 'check', label: 'Free Elsie from the cage', pos: [CAMP.x + 5, CAMP.z - 4] },
    { id: 'gruk', kind: 'boss', boss: 'gruk', label: 'Challenge Gruk', pos: [CAMP.x - 3, CAMP.z + 2], group: ['gruk', 'goblin'] },
    { id: 'brawl', kind: 'boss', boss: 'brawl', label: 'Pick a fight with the rowdy bandits', pos: [492, -20], group: ['bandit', 'bandit', 'bandit'], model: 'bandit' },
    { id: 'banditCaptain', kind: 'boss', boss: 'banditCaptain', label: 'Confront Captain Vex', pos: [645, 2], group: ['banditCaptain', 'bandit'] },
    { id: 'runedoor', kind: 'check', label: 'Study the rune-sealed door', pos: [720, 229] },
    { id: 'varkas', kind: 'boss', boss: 'varkas', label: 'Face Varkas the Wight Lord', pos: [720, 219], group: ['varkas', 'skeleton'], need: 'runedoor' },
    { id: 'bridge', kind: 'check', label: 'Talk to Grimtooth', pos: [903, 110], hidden: true },
    { id: 'flamePriest', kind: 'boss', boss: 'flamePriest', label: 'Interrupt the Pyre-Priest\'s ritual', pos: [700, -146], y: 10, group: ['flamePriest', 'cultist', 'cultist'] },
    { id: 'ignaroth', kind: 'boss', boss: 'ignaroth', label: 'Wake the dragon. Fight IGNAROTH', pos: [LAIR.x, LAIR.z + 6], y: 22, group: ['ignaroth'], model: 'ignaroth' },
    // Moonpetals in the woods
    ...[[480, 160], [560, 165], [470, 230], [575, 250], [500, 255], [540, 180]].map(([x, z], i) => ({ id: `moonpetal${i}`, kind: 'pick', item: 'moonpetal', label: 'Pick the moonpetal', pos: [x, z] })),
    { id: 'ring', kind: 'pick', item: 'ring', label: 'Pick up the ring', pos: [690, 180] },
    ...[[470, 260, 'woods'], [775, 165, 'crypt'], [960, 160, 'pass'], [690, -175, 'peak']].map(([x, z, zone], i) => ({ id: `tablet${i}`, kind: 'pick', item: 'tablet', check: 'INT', dc: 12, label: 'Read the ancient tablet', pos: [x, z], zone, y: zone === 'peak' ? 14 : 0 })),
    // Treasure chests (some locked)
    ...[[495, 185, 0], [580, 230, 1], [760, 240, 1], [680, 165, 0], [880, 160, 1], [960, 60, 0], [950, -120, 0], [735, -200, 1]].map(([x, z, locked], i) => ({ id: `chest${i}`, kind: 'chest', locked: !!locked, label: locked ? 'Pick the lock on the chest' : 'Open the chest', pos: [x, z], y: z < -150 ? 19 : 0 })),
  ];
  const groundAt = (s) => Y + (s.y || 0);
  for (const s of SPOTS) {
    const p = V(s.pos[0], groundAt(s), s.pos[1]);
    s.p = p;
    if (s.kind === 'boss') {
      const g = creature(s.model === 'bandit' ? 'bandit' : s.boss);
      g.position.copy(p);
      root.add(g);
      s.g = g;
    } else if (s.kind === 'pick') {
      const g = s.item === 'moonpetal'
        ? mesh(new THREE.OctahedronGeometry(0.35, 0), 0x7ab8ff, p.x, p.y + 0.5, p.z, { emissive: 0x3a8aff, emissiveIntensity: 1.6 })
        : s.item === 'ring'
          ? mesh(new THREE.TorusGeometry(0.15, 0.05, 6, 16), 0xffd23d, p.x, p.y + 0.3, p.z, { metalness: 0.9, emissive: 0x6a4a00, emissiveIntensity: 1 })
          : mesh(new THREE.BoxGeometry(1.4, 2, 0.3), 0x6a6a72, p.x, p.y + 1, p.z, { emissive: 0x3a5aff, emissiveIntensity: 0.4 });
      s.g = g;
    } else if (s.kind === 'chest') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), mat(0x7a4a20, { map: itemTexture('wood') }));
      base.position.y = 0.35;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 0.85), mat(0x6a3a10));
      lid.position.y = 0.82;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.05), mat(0xffc23a, { metalness: 0.8 }));
      lock.position.set(0, 0.6, 0.42);
      g.add(base, lid, lock);
      g.position.copy(p);
      root.add(g);
      s.g = g;
      s.lid = lid;
    }
  }

  // ---------- Roaming monsters ----------
  const ROAM = { woods: 6, crypt: 6, pass: 6, peak: 5 };
  const roamers = [];
  for (const [zone, n] of Object.entries(ROAM)) {
    for (let i = 0; i < n; i++) roamers.push({ zone, g: null, group: null, respawn: 1 + i * 0.5, home: null, goal: null, wait: 0 });
  }
  function spawnRoamer(r) {
    const z = ZONES[r.zone];
    const list = ENCOUNTERS[r.zone];
    r.group = list[Math.floor(Math.random() * list.length)];
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (z.r - 18);
    let x = z.c[0] + Math.cos(a) * d, zz = z.c[2] + Math.sin(a) * d;
    let y = Y;
    if (r.zone === 'peak') {
      const t = TERRACES[Math.floor(Math.random() * 3)];
      x = t[0] + (Math.random() - 0.5) * t[2] * 0.6;
      zz = t[1] + (Math.random() - 0.5) * t[3] * 0.6;
      y = Y + t[4];
    }
    if (r.zone === 'pass') x = Math.min(x, 895); // monsters stay on the near side of the chasm
    r.g = creature(r.group[0]);
    r.g.position.set(x, y, zz);
    r.home = r.g.position.clone();
    r.goal = r.home.clone();
    root.add(r.g);
  }
  function killRoamer(r) {
    if (r.g) root.remove(r.g);
    r.g = null;
    r.respawn = 60;
  }

  return {
    root, ZONES, NPCS, SPOTS, waystones, roamers, portal, homePortal, PORTAL, campfire, cage, runeDoor, bridgeGate, SANCTUM, LAIR, Y,
    spawnRoamer, killRoamer, creature, humanoid,
    zoneAt(p) {
      let best = null, bd = Infinity;
      for (const [id, z] of Object.entries(ZONES)) {
        const d = Math.hypot(p.x - z.c[0], p.z - z.c[2]);
        if (d < z.r && d < bd) {
          best = id;
          bd = d;
        }
      }
      return best;
    },
    inRealm: (p) => p.x > REALM.x0 && p.x < REALM.x1 && p.z > REALM.z0 && p.z < REALM.z1,
    arrive: V(520, Y + 0.5, -54),
  };
}
