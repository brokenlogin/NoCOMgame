// Places and enemies for the space RPG (spaceRpg.js sets this up).
//
//   Training rings  around Station NoCOM (flight school)
//   The Belt        asteroid field with glowing ore asteroids you can mine with ship lasers
//   Pirate drones   hang around the Belt and the Mothership and shoot at you
//   Outpost Kepler  a small trading outpost far out (Dockmaster Vega lives here)
//   Derelict Erebus a broken-down ship you can walk inside; the data core is at the far end
//   Pirate Mothership  boss: 4 turrets, then a shielded reactor core. You can land on it.
//
// Enemies are local to each player (everyone fights their own), so nothing here is synced.
// Everything sits inside the space void (CONFIG.terrain.voids).

import * as THREE from 'three';
import { makeSign } from './mgShared.js';
import { itemTexture } from './itemTextures.js';

export const LOC = {
  station: new THREE.Vector3(0, 30, -400),
  dock: new THREE.Vector3(0, 30, -428), // Station NoCOM's north landing pad
  belt: new THREE.Vector3(-260, 40, -820),
  outpost: new THREE.Vector3(360, 30, -1300),
  derelict: new THREE.Vector3(-430, 25, -1550),
  mothership: new THREE.Vector3(180, 70, -1720),
};

const RING_POINTS = [
  [0, 38, -485], [35, 48, -545], [95, 42, -525], [115, 36, -455], [75, 44, -385], [-45, 40, -360],
];

export function createSpaceWorld(game, hooks) {
  const { scene, world } = game;
  const op = game.opItems;
  const root = new THREE.Group();
  scene.add(root);
  const colliders = world.colliders;
  const solids = world.solidBoxes;
  const rng = mulberry32(90210);
  const laserTargets = new Set();
  const boomFx = (p, size, color) => (hooks.fx ? hooks.fx.explode(p, size, color) : op.puffFx(p, color));

  // ---------- Materials ----------
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6660, roughness: 1, flatShading: true, bumpMap: itemTexture('grit'), bumpScale: 1 });
  const oreMat = new THREE.MeshStandardMaterial({ color: 0x5fe8ff, emissive: 0x29b8ff, emissiveIntensity: 1.6, roughness: 0.2 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0xd98a4a, emissive: 0xa0501a, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.6 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.7, metalness: 0.3, bumpMap: itemTexture('brushed'), bumpScale: 0.6 });
  const hullDark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8, metalness: 0.2 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: itemTexture('hazard'), roughness: 0.7 });
  const pirateMat = new THREE.MeshStandardMaterial({ color: 0x4a1d1d, roughness: 0.6, metalness: 0.35, bumpMap: itemTexture('brushed'), bumpScale: 0.5 });
  const redGlow = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2010, emissiveIntensity: 2 });
  const blueGlow = new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2fb8ff, emissiveIntensity: 1.6 });
  const amberGlow = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xffa010, emissiveIntensity: 1.4 });

  function box(parent, x, top, z, w, h, d, mat, { walk = true, wall = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, top - h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    m.updateMatrixWorld(true);
    if (walk) colliders.push(m);
    if (wall) solids.push(new THREE.Box3().setFromObject(m));
    return m;
  }
  function sign(text, x, y, z, ry = 0, opts) {
    const s = makeSign(game, text, opts);
    scene.remove(s);
    s.position.set(x, y, z);
    s.rotation.y = ry;
    root.add(s);
    return s;
  }
  function lumpyRock(r, mat = rockMat) {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const s = 0.75 + rng() * 0.5;
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.8, p.getZ(k) * s);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }

  // ---------- Training rings ----------
  const ringMat = () => new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffb000, emissiveIntensity: 0.3 });
  const rings = RING_POINTS.map(([x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 10, 40), ringMat());
    m.position.set(x, y, z);
    const next = RING_POINTS[(i + 1) % RING_POINTS.length];
    const prev = i ? RING_POINTS[i - 1] : [LOC.dock.x, LOC.dock.y + 2, LOC.dock.z];
    // Face along the path through it
    const dir = new THREE.Vector3(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
    m.lookAt(m.position.clone().add(dir));
    root.add(m);
    return { m, pos: m.position.clone(), normal: dir };
  });
  let ringIndex = -1; // -1 = training not running
  function setRings(index) {
    ringIndex = index;
    rings.forEach((r, i) => {
      r.m.visible = index >= 0 && i >= index;
      r.m.material.emissiveIntensity = i === index ? 2.2 : 0.3;
      r.m.material.color.setHex(i === index ? 0xffe14d : 0x8a7a3a);
    });
  }
  setRings(-1);

  // ---------- The Belt ----------
  const B = LOC.belt;
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, d = 20 + rng() * 140;
    const m = lumpyRock(2 + rng() * 6);
    m.position.set(B.x + Math.cos(a) * d, B.y + (rng() - 0.5) * 50, B.z + Math.sin(a) * d * 0.8);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld();
    colliders.push(m);
  }
  // Ore asteroids: rock with glowing crystals. Shoot them to break them into ore.
  const ores = [];
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    const r = 2 + rng() * 1.5;
    g.add(lumpyRock(r, rockMat.clone())); // own materials, so a hit only flashes this one
    const material = i % 3 === 0 ? 'iron' : 'ore'; // every third rock is iron
    const crystalMat = (material === 'iron' ? ironMat : oreMat).clone();
    for (let k = 0; k < 7; k++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + rng() * 0.5, 0), crystalMat);
      const dir = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      c.position.copy(dir).multiplyScalar(r * 0.85);
      c.scale.y = 1.8;
      c.lookAt(dir.multiplyScalar(5));
      c.rotateX(Math.PI / 2);
      g.add(c);
    }
    const a = rng() * Math.PI * 2, d = 25 + rng() * 120;
    g.position.set(B.x + Math.cos(a) * d, B.y + (rng() - 0.5) * 40, B.z + Math.sin(a) * d * 0.8);
    root.add(g);
    const ore = { g, hp: 40, maxHp: 40, respawn: 0, material };
    g.userData.radius = r;
    g.userData.info = () => ({ name: material === 'iron' ? 'Iron asteroid' : 'Crystal ore', hp: ore.hp / ore.maxHp, color: '#5fe8ff' });
    g.userData.onLaser = (dmg) => {
      if (ore.hp <= 0) return;
      ore.hp -= dmg;
      flash(g);
      if (ore.hp <= 0) {
        g.visible = false;
        laserTargets.delete(g);
        ore.respawn = 45;
        op.puffFx(g.position.clone(), material === 'iron' ? 0xd98a4a : 0x5fe8ff);
        hooks.onOre?.(2 + Math.floor(Math.random() * 3), g.position.clone(), material);
      }
    };
    laserTargets.add(g);
    ores.push(ore);
  }

  // Quick white flash on something you hit
  function flash(obj) {
    obj.traverse((o) => {
      if (!o.isMesh || !o.material.emissive) return;
      if (o.userData.baseEmissive === undefined) {
        o.userData.baseEmissive = o.material.emissiveIntensity;
        o.userData.baseEmissiveColor = o.material.emissive.getHex();
      }
    });
    obj.userData.flash = 0.08;
  }

  // ---------- Outpost Kepler ----------
  const O = LOC.outpost;
  const outpost = new THREE.Group();
  root.add(outpost);
  box(outpost, O.x, O.y, O.z, 30, 1.5, 30, hullMat);
  box(outpost, O.x - 9, O.y + 0.03, O.z + 9, 9, 0.06, 9, hazardMat, { walk: false }); // landing pad
  for (const [dx, dz, w, h, d] of [[8, -8, 8, 6, 8], [-9, -9, 6, 9, 6], [10, 7, 6, 4, 9]]) {
    box(outpost, O.x + dx, O.y + h, O.z + dz, w, h, d, hullDark, { wall: true });
    // Glowing window strips
    box(outpost, O.x + dx, O.y + h * 0.7, O.z + dz + d / 2 + 0.02, w * 0.8, 0.5, 0.05, amberGlow, { walk: false });
  }
  box(outpost, O.x - 9, O.y + 22, O.z - 9, 0.4, 13, 0.4, hullMat, { walk: false }); // antenna
  const outpostBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc23a }));
  outpostBeacon.position.set(O.x - 9, O.y + 22.6, O.z - 9);
  outpost.add(outpostBeacon);
  sign('🛰️ OUTPOST KEPLER', O.x, O.y + 4, O.z + 15.2, 0, { width: 8, height: 1.6, color: '#ffd98a' });

  // ---------- Derelict Erebus ----------
  const D = LOC.derelict;
  const derelict = new THREE.Group();
  root.add(derelict);
  const SEG = 12, SEGS = 6, HALF_W = 4.5, H = 7;
  const lights = [];
  for (let i = 0; i < SEGS; i++) {
    const x = D.x + 30 - SEG / 2 - i * SEG;
    const sag = i === 3 ? -0.6 : 0; // a buckled section
    box(derelict, x, D.y + sag, D.z, SEG, 0.8, HALF_W * 2 + 1, hullMat); // floor
    // Walls (with hull breaches you can look out of)
    for (const s of [1, -1]) {
      const breach = (i === 2 && s === 1) || (i === 4 && s === -1);
      if (breach) {
        box(derelict, x - SEG / 4, D.y + H, D.z + s * (HALF_W + 0.3), SEG / 2, H, 0.6, hullMat, { walk: false, wall: true });
        box(derelict, x + SEG / 4, D.y + 1.5, D.z + s * (HALF_W + 0.3), SEG / 2, 1.5, 0.6, hullMat, { walk: false, wall: true });
      } else {
        box(derelict, x, D.y + H, D.z + s * (HALF_W + 0.3), SEG, H, 0.6, hullMat, { walk: false, wall: true });
      }
    }
    // Ceiling (missing over one section, so you can see the stars)
    if (i !== 1) box(derelict, x, D.y + H + 0.6, D.z, SEG, 0.6, HALF_W * 2 + 1.2, hullDark, { walk: false });
    // Ribs
    box(derelict, x + SEG / 2, D.y + H, D.z, 0.4, H, HALF_W * 2 + 1.4, hullDark, { walk: false });
    // Flickering emergency light
    const l = box(derelict, x, D.y + H - 0.2, D.z, 1.2, 0.15, 0.4, redGlow, { walk: false });
    lights.push({ m: l, phase: rng() * 10 });
    // Crates to weave between
    if (i % 2 === 1) box(derelict, x + 2, D.y + 1.2, D.z + (i % 4 === 1 ? 2.5 : -2.5), 1.6, 1.2, 1.6, hazardMat, { wall: true });
  }
  // West end wall, east end open with a ramp
  box(derelict, D.x - 36 - 0.3, D.y + H, D.z, 0.6, H, HALF_W * 2 + 1, hullMat, { walk: false, wall: true });
  const ramp = box(derelict, D.x + 33, D.y - 0.4, D.z, 6, 0.4, 6, hazardMat);
  ramp.rotation.z = 0.12;
  ramp.updateMatrixWorld();
  // Engine block and broken nose outside
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 10, 16), hullDark);
  engine.rotation.z = Math.PI / 2;
  engine.position.set(D.x - 41, D.y + 3.5, D.z);
  derelict.add(engine);
  // Floating debris
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rng() * 2, 0.2 + rng() * 0.4, 0.5 + rng() * 2), i % 3 ? hullMat : hullDark);
    m.position.set(D.x + (rng() - 0.5) * 100, D.y + (rng() - 0.3) * 30, D.z + (rng() - 0.5) * 60);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.userData.spin = (rng() - 0.5) * 0.6;
    derelict.add(m);
    lights.push({ debris: m });
  }
  sign('ERE  US', D.x + 30.4, D.y + H - 1.4, D.z, Math.PI / 2, { width: 6, height: 1.2, color: '#a8b0bc', bg: 'rgba(40,44,52,0.95)' });
  // The data core, at the far (west) end
  const core = new THREE.Group();
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 12), hullDark);
  pedestal.position.y = 0.5;
  const crystal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), blueGlow);
  crystal.position.y = 1.6;
  core.add(pedestal, crystal);
  core.position.set(D.x - 32, D.y, D.z);
  derelict.add(core);

  // ---------- Pirate drones ----------
  const drones = [];
  const bolts = [];
  const droneGeo = new THREE.SphereGeometry(0.9, 16, 12);
  function makeDrone(p, home) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(droneGeo, pirateMat.clone()));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), redGlow.clone());
    eye.position.z = -0.75;
    g.add(eye);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.7), hullDark);
      fin.rotation.z = (k / 4) * Math.PI * 2;
      fin.position.set(Math.sin((k / 4) * Math.PI * 2) * 0.9, Math.cos((k / 4) * Math.PI * 2) * 0.9, 0.3);
      g.add(fin);
    }
    g.position.copy(p);
    root.add(g);
    const d = { g, vel: new THREE.Vector3(), hp: 40, cool: 1 + Math.random() * 1.5, orbit: Math.random() * 6.28, home, stun: 0 };
    g.userData.hostile = true;
    g.userData.radius = 1.3;
    g.userData.info = () => ({ name: 'Pirate drone', hp: d.hp / 40 });
    g.userData.onLaser = (dmg, point, kind) => {
      d.hp -= dmg;
      if (kind === 'ion') d.stun = 3;
      flash(g);
      if (d.hp <= 0) killDrone(d);
    };
    laserTargets.add(g);
    drones.push(d);
    return d;
  }
  function killDrone(d) {
    const i = drones.indexOf(d);
    if (i < 0) return;
    drones.splice(i, 1);
    laserTargets.delete(d.g);
    root.remove(d.g);
    d.g.traverse((o) => o.isMesh && o.geometry !== droneGeo && o.geometry.dispose());
    boomFx(d.g.position.clone(), 1.2, 0xff7a1a);
    hooks.onKill?.('drone', d.g.position.clone());
  }
  function shoot(from, target, targetVel, speed = 80) {
    // Lead the target a little
    const t = from.distanceTo(target) / speed;
    const aim = target.clone().addScaledVector(targetVel, t * 0.6);
    const v = aim.sub(from).normalize().multiplyScalar(speed);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5040 }));
    m.position.copy(from);
    root.add(m);
    bolts.push({ m, v, life: 4, from: from.clone() });
  }

  // ---------- Pirate Mothership ----------
  const M = LOC.mothership;
  const mother = new THREE.Group();
  root.add(mother);
  const motherParts = [];
  const mbox = (x, top, z, w, h, d, mat, walk = true) => {
    const m = box(mother, M.x + x, M.y + top, M.z + z, w, h, d, mat, { walk });
    motherParts.push(m);
    return m;
  };
  mbox(0, 0, 0, 22, 10, 70, pirateMat); // main hull
  mbox(0, 6, 10, 10, 6, 18, pirateMat); // bridge
  mbox(0, 6.05, 10, 10.2, 0.6, 0.4, redGlow, false); // bridge window
  mbox(-14, -2, 8, 8, 4, 40, hullDark); // side pods
  mbox(14, -2, 8, 8, 4, 40, hullDark);
  mbox(0, 0.06, -20, 22.2, 0.8, 4, hazardMat, false); // hazard band
  for (const x of [-7, 0, 7]) mbox(x, -2, 37, 5, 5, 4, redGlow, false); // engine glow
  for (let i = 0; i < 8; i++) mbox(-11.05, -3, -28 + i * 8, 0.2, 1, 3, amberGlow, false); // windows
  for (let i = 0; i < 8; i++) mbox(11.05, -3, -28 + i * 8, 0.2, 1, 3, amberGlow, false);
  sign('☠ PIRATE MOTHERSHIP', M.x, M.y + 13.5, M.z + 19.1, 0, { width: 10, height: 1.6, color: '#ff8a7a', bg: 'rgba(30,8,8,0.9)' });
  // Turrets on top
  const turrets = [];
  for (const [x, z] of [[-6, -25], [6, -25], [-6, 25], [6, 25]]) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hullDark.clone());
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3, 10), pirateMat.clone());
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.9, -1.6);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), redGlow.clone());
    eye.position.set(0, 1.2, -0.8);
    g.add(dome, barrel, eye);
    g.position.set(M.x + x, M.y, M.z + z);
    mother.add(g);
    const t = { g, hp: 150, cool: 1 + Math.random(), alive: true, stun: 0 };
    g.userData.hostile = true;
    g.userData.radius = 2;
    g.userData.info = () => ({ name: 'Mothership turret', hp: t.hp / 150 });
    g.userData.onLaser = (dmg, point, kind) => {
      if (kind === 'ion') t.stun = 3;
      if (!t.alive) return;
      t.hp -= dmg;
      flash(g);
      if (t.hp <= 0) {
        t.alive = false;
        g.visible = false;
        laserTargets.delete(g);
        boomFx(g.position.clone(), 2.2, 0xff7a1a);
        hooks.onTurret?.(turrets.filter((tt) => tt.alive).length);
        if (turrets.every((tt) => !tt.alive)) dropShield();
      }
    };
    turrets.push(t);
  }
  // Reactor core under a shield, at the nose
  const reactor = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 16), new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3300, emissiveIntensity: 2.2 }));
  reactor.position.set(M.x, M.y - 7, M.z - 30);
  mother.add(reactor);
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shield.position.copy(reactor.position);
  mother.add(shield);
  const boss = { core: 600, maxCore: 600, alive: true, respawn: 0, spawnTimer: 0 };
  reactor.userData.hostile = shield.userData.hostile = true;
  reactor.userData.radius = 2.4;
  shield.userData.radius = 4.5;
  reactor.userData.info = () => ({ name: 'Mothership reactor', hp: boss.core / boss.maxCore, color: '#ff5a4a' });
  shield.userData.info = () => ({ name: 'Reactor shield', hp: 1, shield: 1, color: '#ff8a7a' });
  reactor.userData.onLaser = (dmg) => {
    if (!boss.alive || shield.visible) return;
    boss.core -= dmg;
    flash(reactor);
    if (boss.core <= 0) killMothership();
  };
  // The shield soaks shots until the turrets are gone
  shield.userData.onLaser = () => flash(shield);
  laserTargets.add(shield);
  function dropShield() {
    shield.visible = false;
    laserTargets.delete(shield);
    laserTargets.add(reactor);
    op.puffFx(reactor.position.clone(), 0xff4a4a);
    hooks.onShieldDown?.();
  }
  function killMothership() {
    boss.alive = false;
    laserTargets.delete(reactor);
    let n = 0;
    const blasts = setInterval(() => {
      const p = new THREE.Vector3(M.x + (Math.random() - 0.5) * 20, M.y + (Math.random() - 0.5) * 8, M.z + (Math.random() - 0.5) * 60);
      boomFx(p, 3.5, n % 2 ? 0xffa531 : 0xff5a2a);
      if (++n >= 10) {
        clearInterval(blasts);
        mother.visible = false;
        for (const m of motherParts) {
          const k = colliders.indexOf(m);
          if (k >= 0) colliders.splice(k, 1);
        }
      }
    }, 250);
    for (const d of [...drones]) if (d.home === 'mother') killDrone(d);
    boss.respawn = 300;
    hooks.onBoss?.();
  }
  function resetMothership() {
    boss.alive = true;
    boss.core = boss.maxCore;
    mother.visible = true;
    for (const m of motherParts) if (!colliders.includes(m)) colliders.push(m);
    for (const t of turrets) {
      t.alive = true;
      t.hp = 150;
      t.g.visible = true;
      laserTargets.add(t.g);
    }
    shield.visible = true;
    laserTargets.add(shield);
    laserTargets.delete(reactor);
  }
  for (const t of turrets) laserTargets.add(t.g);

  // ---------- Per frame ----------
  let time = 0;
  const _v = new THREE.Vector3();
  function update(dt, ctx) {
    time += dt;
    const target = ctx.piloting ? ctx.shipPos : ctx.playerPos;
    const targetVel = ctx.shipVel || _v.set(0, 0, 0);
    const nearBelt = target.distanceTo(B) < 420;
    const nearMother = boss.alive && target.distanceTo(M) < 450;

    // Ore respawns
    for (const o of ores) {
      if (o.respawn > 0) {
        o.respawn -= dt;
        if (o.respawn <= 0) {
          o.hp = o.maxHp;
          o.g.visible = true;
          laserTargets.add(o.g);
        }
      }
      o.g.rotation.y += dt * 0.1;
    }

    // Keep some drones around where you are
    const beltDrones = drones.filter((d) => d.home === 'belt').length;
    if (nearBelt && beltDrones < 4 && Math.random() < dt * 0.5) {
      const a = Math.random() * Math.PI * 2;
      makeDrone(new THREE.Vector3(B.x + Math.cos(a) * 160, B.y + 20, B.z + Math.sin(a) * 130), 'belt');
    }
    if (nearMother) {
      boss.spawnTimer -= dt;
      const escorts = drones.filter((d) => d.home === 'mother').length;
      if (escorts < 4 && boss.spawnTimer <= 0) {
        boss.spawnTimer = 6;
        makeDrone(new THREE.Vector3(M.x + (Math.random() - 0.5) * 20, M.y - 8, M.z + 30), 'mother');
      }
    }

    // Drones: chase, circle and shoot
    for (const d of [...drones]) {
      const home = d.home === 'belt' ? B : M;
      const dist = d.g.position.distanceTo(target);
      const engaged = dist < (ctx.piloting ? 260 : 90) && target.distanceTo(home) < 500;
      d.orbit += dt * 0.7;
      const goal = engaged
        ? target.clone().add(_v.set(Math.cos(d.orbit) * 30, 8 + Math.sin(d.orbit * 1.7) * 6, Math.sin(d.orbit) * 30))
        : home.clone().add(_v.set(Math.cos(d.orbit) * 60, 15, Math.sin(d.orbit) * 50));
      const want = goal.sub(d.g.position);
      const speed = engaged ? 34 : 14;
      if (want.length() > 1) want.setLength(speed);
      d.vel.lerp(want, Math.min(1, dt * 1.5));
      d.g.position.addScaledVector(d.vel, dt);
      d.g.lookAt(engaged ? target : d.g.position.clone().add(d.vel));
      d.g.rotateY(Math.PI); // its eye is on -Z
      d.stun = Math.max(0, d.stun - dt);
      if (d.stun > 0) {
        d.vel.multiplyScalar(0.9);
        if (Math.random() < 0.3) hooks.fx?.emit(d.g.position, null, 0x7ad8ff, 0.3);
      } else if (engaged && dist < 170) {
        d.cool -= dt;
        if (d.cool <= 0) {
          d.cool = 1.9 + Math.random() * 1.1;
          shoot(d.g.position.clone(), ctx.piloting ? target : target.clone().setY(target.y + 1), targetVel);
        }
      }
      // Drones that wandered far off give up and vanish
      if (d.g.position.distanceTo(home) > 700) killDroneQuiet(d);
    }

    // Turrets
    if (boss.alive) {
      for (const t of turrets) {
        if (!t.alive) continue;
        const dist = t.g.position.distanceTo(target);
        if (dist > 320) continue;
        t.stun = Math.max(0, t.stun - dt);
        if (t.stun > 0) continue;
        t.g.lookAt(target);
        t.g.rotateY(Math.PI);
        t.cool -= dt;
        if (t.cool <= 0) {
          t.cool = 1.1 + Math.random() * 0.5;
          shoot(t.g.position.clone().setY(t.g.position.y + 1.2), target, targetVel, 95);
        }
      }
      shield.material.opacity = 0.22 + Math.sin(time * 4) * 0.06;
      reactor.scale.setScalar(1 + Math.sin(time * 6) * 0.05);
    } else if (boss.respawn > 0) {
      boss.respawn -= dt;
      if (boss.respawn <= 0) resetMothership();
    }

    // Enemy bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      let hit = false;
      if (ctx.piloting) {
        if (b.m.position.distanceTo(ctx.shipPos) < 2.6) {
          ctx.damageShip(5, b.from);
          hit = true;
        }
      } else {
        _v.copy(ctx.playerPos).y += 1;
        if (b.m.position.distanceTo(_v) < 1.1) {
          ctx.damagePlayer(5);
          hit = true;
        }
      }
      if (hit || b.life <= 0) {
        root.remove(b.m);
        b.m.geometry.dispose();
        b.m.material.dispose();
        bolts.splice(i, 1);
      }
    }

    // Hit flashes
    for (const obj of laserTargets) tickFlash(obj, dt);
    for (const d of drones) tickFlash(d.g, dt);

    // Rings: fly through the lit one
    if (ringIndex >= 0 && ctx.piloting) {
      const r = rings[ringIndex];
      const rel = ctx.shipPos.clone().sub(r.pos);
      const along = rel.dot(r.normal);
      const off = rel.addScaledVector(r.normal, -along).length();
      if (Math.abs(along) < 2 && off < 4.8) {
        op.puffFx(r.pos.clone(), 0xffe14d);
        const next = ringIndex + 1;
        setRings(next < rings.length ? next : -1);
        hooks.onRing?.(next, rings.length);
      }
    }
    rings.forEach((r) => (r.m.rotation.z += dt * 0.5));

    // Derelict flicker and spinning debris
    for (const l of lights) {
      if (l.debris) l.debris.rotation.y += l.debris.userData.spin * dt;
      else l.m.visible = Math.sin(time * 9 + l.phase) + Math.sin(time * 23 + l.phase * 2) > -0.6;
    }
    crystal.rotation.y += dt * 1.5;
    crystal.position.y = 1.6 + Math.sin(time * 2) * 0.1;
    outpostBeacon.material.color.setHex(Math.sin(time * 3) > 0 ? 0xffc23a : 0x5a4010);
  }
  function killDroneQuiet(d) {
    const i = drones.indexOf(d);
    if (i < 0) return;
    drones.splice(i, 1);
    laserTargets.delete(d.g);
    root.remove(d.g);
  }
  function tickFlash(obj, dt) {
    if (!(obj.userData.flash > 0)) return;
    obj.userData.flash -= dt;
    const on = obj.userData.flash > 0;
    obj.traverse((o) => {
      if (!o.isMesh || !o.material.emissive || o.userData.baseEmissive === undefined) return;
      o.material.emissive.setHex(on ? 0xffffff : o.userData.baseEmissiveColor);
      o.material.emissiveIntensity = on ? 1 : o.userData.baseEmissive;
    });
  }

  // Things for the radar
  function blips(out) {
    for (const d of drones) out.push({ p: d.g.position, kind: 'enemy' });
    if (boss.alive) {
      for (const t of turrets) if (t.alive) out.push({ p: t.g.position, kind: 'enemy' });
      out.push({ p: reactor.getWorldPosition(new THREE.Vector3()), kind: 'boss', size: 1.6 });
    }
    for (const o of ores) if (o.g.visible) out.push({ p: o.g.position, kind: 'ore', size: 0.7 });
    return out;
  }

  return {
    LOC,
    update,
    blips,
    laserTargets: () => [...laserTargets, ...drones.map((d) => d.g)].filter((o, i, a) => a.indexOf(o) === i),
    startRings: (from = 0) => setRings(from),
    stopRings: () => setRings(-1),
    get ringIndex() { return ringIndex; },
    ringPos: (i) => rings[i]?.pos,
    corePos: () => core.getWorldPosition(new THREE.Vector3()),
    setCoreVisible: (v) => (core.visible = v),
    get bossAlive() { return boss.alive; },
    get shieldUp() { return shield.visible; },
    get turretsLeft() { return turrets.filter((t) => t.alive).length; },
    get bossHp() { return Math.max(0, boss.core) / boss.maxCore; },
    reactorPos: () => reactor.getWorldPosition(new THREE.Vector3()),
    clearEnemies() {
      for (const d of [...drones]) killDroneQuiet(d);
      for (const b of bolts) root.remove(b.m);
      bolts.length = 0;
    },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
