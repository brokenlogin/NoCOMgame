// The other four sectors of the space RPG, jump gates between them, and random events.
// Each sector is its own void (CONFIG.terrain.voids) 4500m from the next, registered with
// space.js (addZone) so low gravity, the starry sky and "fell off" all work there too.
//
//   Nebula Drift   purple fog, gas clouds with plasma pockets, ion storms, hidden caches,
//                  Haven station (Captain Mira Sol)
//   Cryo-9         an ice moon you can land on and walk around: Frostfall mining base,
//                  ice crystal deposits, an ice cave, the Wyrm's crater
//   The Scrapyard  wrecked fleets, salvage, a moving debris field, Rustport (scavenger hub)
//   The Void Rift  Hive structures with void shards, gravity wells, Last Light outpost
//   Kepler Reach   (home, spaceWorld.js) gets meteor showers and distress calls
//
// Fly into a gate's ring (or press E near it) to pick where to jump. Gates unlock with the
// story or your level (SECTORS[...].unlock in spaceData.js).

import * as THREE from 'three';
import { SECTORS, SECTOR_IDS, MATERIALS } from './spaceData.js';
import { itemTexture } from './itemTextures.js';
import { makeLabel } from './spaceRpg.js';
import { rng } from './spaceQuests.js';

const V = (a) => new THREE.Vector3(...a);

export function setupSectors(api) {
  const { game, fx, hud, ship } = api;
  const { scene, world } = game;
  const colliders = world.colliders;
  const solids = world.solidBoxes;
  const roots = {};
  const backdrops = {};
  const nodes = []; // shootable resource nodes
  const hazards = []; // per-frame hazard checks: fn(dt, ctx)

  // ---------- Materials ----------
  const M = {
    hull: new THREE.MeshStandardMaterial({ color: 0x6a707a, roughness: 0.6, metalness: 0.4, bumpMap: itemTexture('brushed'), bumpScale: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8, metalness: 0.2 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xffffff, map: itemTexture('hazard'), roughness: 0.7 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a4a28, roughness: 0.9, metalness: 0.3, bumpMap: itemTexture('grit'), bumpScale: 1.2 }),
    rust2: new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85, metalness: 0.35, bumpMap: itemTexture('brushed'), bumpScale: 0.8 }),
    ice: new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.35, metalness: 0.05, bumpMap: itemTexture('grit'), bumpScale: 0.6 }),
    iceDeep: new THREE.MeshStandardMaterial({ color: 0x8fc8e8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.9, bumpMap: itemTexture('grit'), bumpScale: 0.8 }),
    flesh: new THREE.MeshStandardMaterial({ color: 0x4a1a4a, roughness: 0.5, metalness: 0.1, emissive: 0x3a0a4a, emissiveIntensity: 0.4, bumpMap: itemTexture('scales'), bumpScale: 1.5 }),
    fleshGlow: new THREE.MeshStandardMaterial({ color: 0xff5ad0, emissive: 0xff2ab0, emissiveIntensity: 1.6 }),
  };
  const glow = (color, i = 1.4) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i });

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
  function mesh(parent, geo, mat, x, y, z, walk = false) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    m.updateMatrixWorld(true);
    if (walk) colliders.push(m);
    return m;
  }
  function label(parent, text, sub, x, y, z, color = '#e9f4ff', scale = 0.03) {
    const l = makeLabel([{ text, size: 56, color, bold: true }, ...(sub ? [{ text: sub, size: 34, color: '#bcd4e8' }] : [])], { scale });
    l.position.set(x, y, z);
    parent.add(l);
    return l;
  }
  function lumpy(r, mat, rnd, squash = 0.8) {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const s = 0.75 + rnd() * 0.5;
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * squash, p.getZ(k) * s);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }

  // A station: deck, landing pad, buildings with lit windows, antenna, name sign
  function station(root, [x, y, z], { name, sub, color = 0x5fd4ff, mat = M.hull, size = 40 }) {
    box(root, x, y, z, size, 1.2, size, mat);
    box(root, x, y + 0.04, z - size / 2 - 9, 18, 1, 18, M.dark); // landing pad off the north edge
    box(root, x, y + 0.06, z - size / 2 - 9, 14, 0.06, 14, M.hazard, { walk: false });
    const win = glow(color, 1.2);
    for (const [dx, dz, w, h, d] of [[-12, 12, 10, 7, 8], [13, 10, 8, 10, 10], [12, -12, 9, 5, 7]]) {
      box(root, x + dx, y + h, z + dz, w, h, d, M.dark, { wall: true });
      box(root, x + dx, y + h * 0.7, z + dz - d / 2 - 0.03, w * 0.8, 0.6, 0.05, win, { walk: false });
      box(root, x + dx, y + h * 0.4, z + dz - d / 2 - 0.03, w * 0.8, 0.6, 0.05, win, { walk: false });
    }
    box(root, x - 16, y + 16, z - 16, 0.5, 15, 0.5, M.hull, { walk: false });
    const beacon = mesh(root, new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color }), x - 16, y + 16.6, z - 16);
    label(root, name, sub, x, y + 12, z + size / 2 + 2, '#' + new THREE.Color(color).getHexString());
    // Home portal back to the main map
    const portal = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 12, 40), glow(0x7aff9a, 0.9));
    portal.position.set(x, y + 1.6, z + size / 2 - 3);
    root.add(portal);
    homePortals.push(portal);
    label(root, '🏠 Home', '', x, y + 3.1, z + size / 2 - 3, '#7aff9a', 0.012);
    return { beacon };
  }
  const homePortals = [];

  // Shootable resource node: a rock (or wreck chunk) with glowing crystals
  function node(root, p, material, { color, r = 2.2, hp = 50, rnd, base, crystals = 6, sector, respawn = 60 }) {
    const g = new THREE.Group();
    const rock = base ? base() : lumpy(r, M.dark.clone(), rnd);
    g.add(rock);
    const cm = glow(color, 1.5);
    for (let k = 0; k < crystals; k++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + rnd() * 0.5, 0), cm);
      const dir = new THREE.Vector3(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).normalize();
      c.position.copy(dir).multiplyScalar(r * 0.85);
      c.scale.y = 1.8;
      c.lookAt(dir.multiplyScalar(5));
      c.rotateX(Math.PI / 2);
      g.add(c);
    }
    g.position.copy(p);
    root.add(g);
    const n = { g, hp, maxHp: hp, material, respawn: 0, respawnTime: respawn, sector, color };
    g.userData.radius = r;
    g.userData.info = () => ({ name: MATERIALS[material].name, hp: n.hp / n.maxHp, color: '#5fe8ff' });
    g.userData.onLaser = (dmg) => {
      if (n.hp <= 0) return;
      n.hp -= dmg;
      fx.sparks(g.position, color, 4);
      if (n.hp <= 0) {
        g.visible = false;
        n.respawn = n.respawnTime;
        fx.explode(g.position, 0.8, color, { debris: true });
        let amount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < api.skill('prospector'); i++) if (Math.random() < 0.25) amount++;
        api.gain(material, amount);
        api.reward(0, amount * 3, true);
      }
    };
    nodes.push(n);
    return n;
  }

  // ---------- Zones ----------
  for (const id of SECTOR_IDS) {
    if (id === 'home') continue;
    const s = SECTORS[id];
    game.space.addZone({ ...s.zone, floor: s.floor ?? s.arrive[1] - 45, arrive: () => [s.arrive[0] + (Math.random() - 0.5) * 3, s.arrive[1], s.arrive[2] + (Math.random() - 0.5) * 3] });
    roots[id] = new THREE.Group();
    roots[id].visible = false;
    scene.add(roots[id]);
    backdrops[id] = new THREE.Group();
    backdrops[id].visible = false;
    scene.add(backdrops[id]);
  }
  roots.home = new THREE.Group();
  scene.add(roots.home);

  // ---------- Jump gates ----------
  const gates = {};
  for (const id of SECTOR_IDS) {
    const s = SECTORS[id];
    const g = new THREE.Group();
    const col = new THREE.Color(s.color);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 1.6, 16, 64), new THREE.MeshStandardMaterial({ color: 0x8a90a0, metalness: 0.7, roughness: 0.3 }));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.5, 8, 64), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 }));
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (let k = 0; k < 6; k++) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5, 2.2), M.dark);
      const a = (k / 6) * Math.PI * 2;
      pylon.position.set(Math.cos(a) * 18, Math.sin(a) * 18, 0);
      pylon.rotation.z = a;
      ring.add(pylon);
    }
    g.add(ring, inner, swirl);
    const tag = makeLabel([{ text: '🌀 JUMP GATE', size: 56, color: '#' + col.getHexString(), bold: true }, { text: 'Fly in or press E to pick a sector', size: 34, color: '#d8e8ff' }], { scale: 0.04 });
    tag.position.y = 22;
    g.add(tag);
    g.position.copy(V(s.gate));
    (roots[id] || roots.home).add(g);
    // The ring faces into its sector
    g.lookAt(V(s.center).setY(s.gate[1]));
    gates[id] = { g, inner, swirl, pos: V(s.gate), normal: V(s.center).setY(s.gate[1]).sub(V(s.gate)).normalize() };
  }
  const gateUnlocked = (id) => {
    const st = api.st;
    if (id === 'home' || st.gates.includes(id)) return true;
    const u = SECTORS[id].unlock || {};
    if ((u.story != null && st.story >= u.story) || (u.level != null && api.level() >= u.level) || st.flags[`gate:${id}`]) {
      st.gates.push(id);
      api.save();
      return true;
    }
    return false;
  };
  let jumpCool = 0;
  function jumpMenu(from) {
    const opts = SECTOR_IDS.filter((id) => id !== from).map((id) => {
      const s = SECTORS[id];
      const ok = gateUnlocked(id);
      const u = s.unlock || {};
      return [`${ok ? '🌀' : '🔒'} ${s.name}${ok ? '' : ` (story or level ${u.level})`}`, () => jump(id), !ok];
    });
    api.openDialog('🌀 Jump gate', 'Where to, pilot? Gates are unlocked by the story, or once you\'re experienced enough.', [...opts, ['Stay here', api.closeDialog]]);
  }
  function jump(to) {
    api.closeDialog();
    const g = gates[to];
    fx.sfx('warp');
    fx.shake(0.4);
    hud.banner('JUMPING…', SECTORS[to].name, SECTORS[to].color);
    const dest = g.pos.clone().addScaledVector(g.normal, 60);
    ship.teleport(dest);
    jumpCool = 3;
    api.emit({ type: 'jump', of: to });
  }
  api.actions.push((p) => {
    if (!ship.piloting) return null;
    for (const [id, g] of Object.entries(gates)) {
      if (g.pos.distanceTo(p) < 60) return { text: 'E: Use the jump gate', fn: () => jumpMenu(id) };
    }
    return null;
  });

  // ---------- Nebula Drift ----------
  {
    const R = roots.nebula, B = backdrops.nebula, rnd = rng(501);
    const s = SECTORS.nebula;
    station(R, s.arrive.map((v, i) => (i === 1 ? v - 0.5 : v)), { name: '✦ HAVEN', sub: 'Free station of the Drift', color: 0xc58bff });
    // Glowing gas clouds (sprites far away and big soft blobs nearby)
    const cloudTex = softTexture();
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Color().setHSL(0.75 + rnd() * 0.15, 0.7, 0.45 + rnd() * 0.2);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: c, transparent: true, opacity: 0.35 + rnd() * 0.25, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      const v = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.5, rnd() * 2 - 1).normalize().multiplyScalar(420);
      sp.position.copy(v);
      sp.scale.setScalar(160 + rnd() * 220);
      B.add(sp);
    }
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Color().setHSL(0.78 + rnd() * 0.12, 0.6, 0.5);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: c, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set((rnd() - 0.5) * 1200, 20 + rnd() * 80, s.center[2] + (rnd() - 0.5) * 1200);
      sp.scale.setScalar(90 + rnd() * 120);
      R.add(sp);
    }
    // Plasma pockets to harvest, asteroids (kept clear of Haven and the Talon Fortress)
    const clear = (p) => p.distanceTo(V(s.arrive)) > 90 && p.distanceTo(new THREE.Vector3(250, 55, -5900)) > 110;
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Vector3((rnd() - 0.5) * 1100, 20 + rnd() * 70, s.center[2] + (rnd() - 0.5) * 1100);
      if (clear(p)) node(R, p, 'plasma', { color: 0xd06bff, r: 2.6, hp: 60, rnd, sector: 'nebula', crystals: 8 });
    }
    for (let i = 0; i < 60; i++) {
      const m = lumpy(2 + rnd() * 7, new THREE.MeshStandardMaterial({ color: 0x4a3a5a, roughness: 1, flatShading: true }), rnd);
      m.position.set((rnd() - 0.5) * 1250, rnd() * 100 - 10, s.center[2] + (rnd() - 0.5) * 1250);
      if (!clear(m.position)) continue;
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      R.add(m);
      m.updateMatrixWorld();
      colliders.push(m);
    }
    // Ion storms: drain shields, zap you, crackle with lightning
    const storms = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Vector3((rnd() - 0.5) * 900, 50, s.center[2] + (rnd() - 0.5) * 900);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), new THREE.MeshBasicMaterial({ color: 0x7a9aff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
      sphere.position.copy(c);
      R.add(sphere);
      storms.push({ c, home: c.clone(), sphere, t: rnd() * 10, zap: 0 });
    }
    const bolt = new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.9 });
    hazards.push((dt, ctx) => {
      if (ctx.sector !== 'nebula') return;
      for (const st of storms) {
        st.t += dt;
        st.c.copy(st.home).add(new THREE.Vector3(Math.sin(st.t * 0.05) * 120, Math.sin(st.t * 0.08) * 20, Math.cos(st.t * 0.04) * 120));
        st.sphere.position.copy(st.c);
        // Lightning inside the storm
        if (Math.random() < dt * 3) {
          const pts = [];
          let p = st.c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 120, 60, (Math.random() - 0.5) * 120));
          for (let k = 0; k < 8; k++) {
            pts.push(p.clone());
            p.add(new THREE.Vector3((Math.random() - 0.5) * 30, -16, (Math.random() - 0.5) * 30));
          }
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bolt.clone());
          R.add(line);
          game.flash?.(pts[4], { color: 0xbfd8ff, intensity: 20, distance: 80, duration: 0.15 });
          let t = 0;
          fx.addEffect((dt2) => {
            t += dt2;
            line.material.opacity = 0.9 * (1 - t / 0.2);
            if (t < 0.2) return true;
            R.remove(line);
            line.geometry.dispose();
            line.material.dispose();
            return false;
          });
        }
        if (ship.piloting && ship.position.distanceTo(st.c) < 80) {
          st.zap -= dt;
          if (st.zap <= 0) {
            st.zap = 0.6;
            ship.damage(4, 'an ion storm', st.c, 'ion');
            hud.toast('⚡ Ion storm! Your shields are draining', '#bfd8ff');
          }
        }
      }
    });
    api.blipSources.push((out, here) => {
      if (here === 'nebula') for (const st of storms) out.push({ p: st.c, kind: 'neutral', size: 2.2 });
    });
  }

  // ---------- Cryo-9 Ice Moon ----------
  {
    const R = roots.cryo, B = backdrops.cryo, rnd = rng(902);
    const s = SECTORS.cryo;
    const MOON = { x: 0, z: -10150, r: 430 };
    // The moon's surface: a huge frozen plain with a craggy rim
    const plain = new THREE.Mesh(new THREE.CylinderGeometry(MOON.r, MOON.r * 0.92, 30, 64, 1), M.snow);
    plain.position.set(MOON.x, -15, MOON.z);
    plain.receiveShadow = true;
    R.add(plain);
    plain.updateMatrixWorld();
    colliders.push(plain);
    const under = new THREE.Mesh(new THREE.SphereGeometry(MOON.r * 0.95, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.iceDeep);
    under.position.set(MOON.x, -28, MOON.z);
    under.scale.y = 0.45;
    R.add(under);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * (MOON.r - 30);
      const x = MOON.x + Math.cos(a) * d, z = MOON.z + Math.sin(a) * d;
      if (Math.hypot(x - s.arrive[0], z - s.arrive[2]) < 45) continue; // keep the base clear
      const h = 6 + rnd() * 26;
      const spire = mesh(R, new THREE.ConeGeometry(1.5 + rnd() * 4, h, 6), rnd() < 0.5 ? M.ice : M.iceDeep, x, h / 2, z, true);
      spire.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const rim = lumpy(14 + rnd() * 16, M.ice, rnd, 0.6);
      rim.position.set(MOON.x + Math.cos(a) * (MOON.r - 6), 0, MOON.z + Math.sin(a) * (MOON.r - 6));
      R.add(rim);
      rim.updateMatrixWorld();
      colliders.push(rim);
    }
    // Frostfall base: domes and a landing pad
    const [bx, , bz] = s.arrive;
    box(R, bx, 0.6, bz, 36, 1.2, 36, M.hull);
    box(R, bx, 0.64, bz - 27, 18, 1, 18, M.dark);
    box(R, bx, 0.7, bz - 27, 14, 0.06, 14, M.hazard, { walk: false });
    for (const [dx, dz, r] of [[-11, 9, 6], [11, 9, 5], [12, -9, 4]]) {
      const dome = mesh(R, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.hull, bx + dx, 0.6, bz + dz);
      dome.updateMatrixWorld();
      solids.push(new THREE.Box3().setFromObject(dome).expandByScalar(-r * 0.25));
      mesh(R, new THREE.TorusGeometry(r, 0.18, 6, 32), glow(0xbff4ff, 1.2), bx + dx, 1.4, bz + dz).rotation.x = Math.PI / 2;
    }
    label(R, '❄ FROSTFALL', 'Cryo-9 mining base', bx, 12, bz + 20, '#bff4ff');
    const portal = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 12, 40), glow(0x7aff9a, 0.9));
    portal.position.set(bx, 2.2, bz + 15);
    R.add(portal);
    homePortals.push(portal);
    // Ice crystal deposits, richest inside the cave
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, d = 60 + rnd() * (MOON.r - 100);
      node(R, new THREE.Vector3(MOON.x + Math.cos(a) * d, 2, MOON.z + Math.sin(a) * d), 'ice', { color: 0x9ff0ff, r: 2.5, hp: 55, rnd, sector: 'cryo', crystals: 9 });
    }
    // The ice cave: a long arched tunnel lying on the plain
    const caveStart = new THREE.Vector3(-260, 0, -10050);
    for (let i = 0; i < 14; i++) {
      const z = caveStart.z - i * 14;
      const arch = mesh(R, new THREE.TorusGeometry(16, 3, 8, 20, Math.PI), i % 2 ? M.ice : M.iceDeep, caveStart.x, 0, z);
      arch.updateMatrixWorld();
      if (i % 3 === 1) node(R, new THREE.Vector3(caveStart.x + (rnd() - 0.5) * 14, 2, z), 'ice', { color: 0x9ff0ff, r: 2, hp: 40, rnd, sector: 'cryo', crystals: 7, respawn: 45 });
    }
    label(R, '❄ ICE CAVE', '', caveStart.x, 22, caveStart.z + 6, '#bff4ff');
    // The Wyrm's crater (the Frost Wyrm lives here, spaceBosses.js)
    const crater = mesh(R, new THREE.TorusGeometry(40, 6, 10, 48), M.ice, 150, 0, -10350);
    crater.rotation.x = Math.PI / 2;
    mesh(R, new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: 0x05101a }), 150, 0.4, -10350).rotation.x = -Math.PI / 2;
    // Sky: a giant frozen planet and its rings
    const big = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.8, fog: false }));
    big.position.set(-200, 160, -350);
    B.add(big);
    const ring = new THREE.Mesh(new THREE.RingGeometry(180, 260, 64), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = -Math.PI / 2 + 0.3;
    big.add(ring);
    api.cryo = { MOON, crater: new THREE.Vector3(150, 0, -10350), cave: caveStart };
  }

  // ---------- The Scrapyard ----------
  {
    const R = roots.scrap, B = backdrops.scrap, rnd = rng(1403);
    const s = SECTORS.scrap;
    station(R, s.arrive.map((v, i) => (i === 1 ? v - 0.5 : v)), { name: '⚙ RUSTPORT', sub: 'Scavenger clan hub · no questions asked', color: 0xe0b060, mat: M.rust });
    // Cranes on Rustport
    for (const dx of [-18, 18]) {
      box(R, s.arrive[0] + dx, 30 + 14, s.arrive[2] + 18, 1.2, 14, 1.2, M.rust2, { walk: false });
      box(R, s.arrive[0] + dx * 0.6, 30 + 14.6, s.arrive[2] + 18, 14, 1, 1, M.rust2, { walk: false });
    }
    // Wrecked fleets: broken hulks you can land on and walk around
    const wrecks = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const len = 40 + rnd() * 60;
      const c = new THREE.Vector3((rnd() - 0.5) * 1000, 20 + rnd() * 60, s.center[2] + (rnd() - 0.5) * 1000);
      if (c.distanceTo(V(s.arrive)) < 140) c.x += 300;
      g.position.copy(c);
      g.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.6);
      R.add(g);
      const segs = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < segs; k++) {
        const w = 10 + rnd() * 8, h = 6 + rnd() * 6, d = len / segs - 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rnd() < 0.5 ? M.rust : M.rust2);
        m.position.set((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, -len / 2 + k * (len / segs) + (rnd() - 0.5) * 3);
        m.rotation.set((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.4);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 8, 12), M.dark);
      eng.rotation.x = Math.PI / 2;
      eng.position.z = len / 2 + 2;
      g.add(eng);
      g.updateMatrixWorld(true);
      g.traverse((o) => o.isMesh && colliders.push(o));
      wrecks.push(c);
      // Salvage nodes around each wreck
      for (let k = 0; k < 3; k++) {
        const p = c.clone().add(new THREE.Vector3((rnd() - 0.5) * 50, (rnd() - 0.5) * 20, (rnd() - 0.5) * 50));
        node(R, p, rnd() < 0.7 ? 'scrap' : 'iron', {
          color: 0xffb03a, r: 2.2, hp: 45, rnd, sector: 'scrap', crystals: 4,
          base: () => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2, 3), M.rust2.clone());
            b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
            return b;
          },
        });
      }
    }
    // The debris field: chunks swirling around a point. They hurt to fly into.
    const field = new THREE.Vector3(-150, 45, -14800);
    const junk = [];
    for (let i = 0; i < 46; i++) {
      const sz = 2 + rnd() * 5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.4, sz * (0.6 + rnd())), rnd() < 0.5 ? M.rust : M.rust2);
      R.add(m);
      junk.push({ m, r: 60 + rnd() * 140, a: rnd() * Math.PI * 2, y: (rnd() - 0.5) * 50, speed: (0.1 + rnd() * 0.2) * (rnd() < 0.5 ? 1 : -1), spin: new THREE.Vector3(rnd(), rnd(), rnd()), size: sz });
    }
    label(R, '⚠ DEBRIS FIELD', 'Fly carefully', field.x, field.y + 40, field.z, '#ffb03a');
    let bump = 0;
    hazards.push((dt, ctx) => {
      if (ctx.sector !== 'scrap') return;
      bump = Math.max(0, bump - dt);
      for (const j of junk) {
        j.a += j.speed * dt;
        j.m.position.set(field.x + Math.cos(j.a) * j.r, field.y + j.y, field.z + Math.sin(j.a) * j.r);
        j.m.rotation.x += j.spin.x * dt;
        j.m.rotation.y += j.spin.y * dt;
        if (ship.piloting && bump <= 0 && j.m.position.distanceTo(ship.position) < j.size + 2.5) {
          bump = 0.6;
          ship.damage(14, 'space junk', j.m.position.clone(), 'crash');
          ship.velocity.add(ship.position.clone().sub(j.m.position).setLength(25));
          fx.sparks(ship.position, 0xffb03a, 12);
        }
      }
    });
    // Dusty orange haze in the sky
    const tex = softTexture();
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color().setHSL(0.07 + rnd() * 0.04, 0.6, 0.35), transparent: true, opacity: 0.3, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(new THREE.Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.6, rnd() * 2 - 1).normalize().multiplyScalar(420));
      sp.scale.setScalar(200 + rnd() * 160);
      B.add(sp);
    }
    api.scrap = { field, wrecks, lair: new THREE.Vector3(-320, 60, -15050) };
  }

  // ---------- The Void Rift ----------
  {
    const R = roots.rift, B = backdrops.rift, rnd = rng(1904);
    const s = SECTORS.rift;
    station(R, s.arrive.map((v, i) => (i === 1 ? v - 0.5 : v)), { name: '☄ LAST LIGHT', sub: 'Research outpost at the edge of the Rift', color: 0xff5ad0 });
    // The Rift: a huge swirling vortex
    const core = new THREE.Vector3(100, 60, -19300);
    const vortex = new THREE.Group();
    vortex.position.copy(core);
    R.add(vortex);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(20 + k * 22, 2 + k, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.85 - k * 0.04, 0.9, 0.5 - k * 0.05), transparent: true, opacity: 0.55 - k * 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2 + (rnd() - 0.5) * 0.3;
      vortex.add(m);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 20), new THREE.MeshBasicMaterial({ color: 0x080008 }));
    vortex.add(eye);
    label(R, '⚠ THE RIFT', 'Gravity well: do not fly into the eye', core.x, core.y + 70, core.z, '#ff5ad0');
    // Smaller wells too
    const wells = [{ c: core, r: 320, pull: 26, kill: 24 }];
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Vector3((rnd() - 0.5) * 900, 50, s.center[2] + (rnd() - 0.5) * 700);
      const m = new THREE.Mesh(new THREE.TorusGeometry(12, 1.5, 8, 40), new THREE.MeshBasicMaterial({ color: 0xc06bff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(c);
      R.add(m);
      wells.push({ c, r: 140, pull: 18, kill: 8, m });
    }
    api.forces.push((p) => {
      if (api.sector() !== 'rift') return null;
      const total = new THREE.Vector3();
      for (const w of wells) {
        const d = p.distanceTo(w.c);
        if (d > w.r) continue;
        total.add(w.c.clone().sub(p).setLength(w.pull * (1.2 - d / w.r)));
      }
      return total.lengthSq() ? total : null;
    });
    let burn = 0;
    hazards.push((dt, ctx) => {
      if (ctx.sector !== 'rift') return;
      vortex.rotation.y += dt * 0.25;
      vortex.children.forEach((m, k) => (m.rotation.z += dt * (0.3 + k * 0.1)));
      for (const w of wells) if (w.m) w.m.rotation.y += dt * 1.5;
      burn = Math.max(0, burn - dt);
      if (!ship.piloting || burn > 0) return;
      for (const w of wells) {
        if (ship.position.distanceTo(w.c) < w.kill + 6) {
          burn = 0.4;
          ship.damage(10, 'the Rift', w.c, 'crash');
          hud.toast('⚠ The gravity well is tearing your hull apart!', '#ff5ad0');
        }
      }
    });
    // Hive structures: pulsing organic blobs with tendrils and void shard crystals
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Vector3((rnd() - 0.5) * 1000, 30 + rnd() * 60, s.center[2] + (rnd() - 0.5) * 1000);
      if (c.distanceTo(V(s.arrive)) < 150 || c.distanceTo(core) < 160) continue;
      const g = new THREE.Group();
      g.position.copy(c);
      R.add(g);
      const r = 10 + rnd() * 14;
      const body = lumpy(r, M.flesh, rnd, 0.9);
      g.add(body);
      for (let k = 0; k < 6; k++) {
        const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
        const pts = [];
        for (let j = 0; j <= 5; j++) pts.push(dir.clone().multiplyScalar(r * 0.8 + j * (5 + rnd() * 3)).add(new THREE.Vector3(Math.sin(j) * 3, Math.cos(j * 1.3) * 3, 0)));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 1.2 - k * 0.1, 6), M.flesh));
        const pod = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), M.fleshGlow);
        pod.position.copy(pts[5]);
        g.add(pod);
      }
      g.updateMatrixWorld(true);
      colliders.push(body);
      blobs.push(g);
      node(R, c.clone().add(new THREE.Vector3(0, r + 2, 0)), 'void', { color: 0xff5ad0, r: 2, hp: 90, rnd, sector: 'rift', crystals: 7, respawn: 90 });
    }
    hazards.push((dt, ctx) => {
      if (ctx.sector !== 'rift') return;
      const t = performance.now() / 1000;
      blobs.forEach((g, i) => g.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.03));
      M.fleshGlow.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.6;
    });
    // Sky: a red-violet swirl
    const tex = softTexture();
    for (let i = 0; i < 30; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color().setHSL(0.88 + rnd() * 0.1, 0.8, 0.4), transparent: true, opacity: 0.35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(new THREE.Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.8, rnd() * 2 - 1).normalize().multiplyScalar(420));
      sp.scale.setScalar(180 + rnd() * 200);
      B.add(sp);
    }
    api.rift = { core, wells };
  }

  // ---------- Kepler Reach events: meteor showers and distress calls ----------
  const meteors = [];
  const meteorMat = new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 1, flatShading: true, emissive: 0xff4a10, emissiveIntensity: 0.5 });
  let showerT = 0, nextShower = 200 + Math.random() * 120;
  let distress = null, nextDistress = 140 + Math.random() * 120;
  const meteorRnd = rng(77);
  function startShower() {
    showerT = 40;
    hud.toast('☄ Meteor shower incoming! Shoot the rocks for ore, or get out of the way', '#ffb03a');
    fx.sfx('alarm');
  }
  function spawnMeteor(around) {
    const g = lumpy(1.5 + Math.random() * 2.5, meteorMat, meteorRnd);
    g.position.copy(around).add(new THREE.Vector3((Math.random() - 0.5) * 300, 220, (Math.random() - 0.5) * 300));
    roots.home.add(g);
    const m = { g, v: new THREE.Vector3((Math.random() - 0.5) * 20, -55 - Math.random() * 25, (Math.random() - 0.5) * 20), life: 9, hp: 20 };
    g.userData.radius = 3;
    g.userData.hostile = true;
    g.userData.info = () => ({ name: 'Meteor', hp: m.hp / 20, color: '#ffb03a' });
    g.userData.onLaser = (dmg) => {
      m.hp -= dmg;
      if (m.hp <= 0 && m.life > 0) {
        m.life = 0;
        fx.explode(g.position, 1, 0xffa040);
        api.gain(Math.random() < 0.5 ? 'ore' : 'iron', 1 + Math.floor(Math.random() * 2));
        api.reward(3, 6, true);
      }
    };
    meteors.push(m);
  }
  api.targetSources.push((list) => {
    for (const m of meteors) list.push(m.g);
    for (const n of nodes) if (n.g.visible) list.push(n.g);
  });
  hazards.push((dt, ctx) => {
    if (ctx.sector === 'home' && ship.piloting) {
      nextShower -= dt;
      if (nextShower <= 0) {
        nextShower = 240 + Math.random() * 160;
        startShower();
      }
      nextDistress -= dt;
      if (nextDistress <= 0 && !distress) {
        nextDistress = 260 + Math.random() * 200;
        const a = Math.random() * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * (250 + Math.random() * 300), 40 + Math.random() * 40, -900 + Math.sin(a) * (250 + Math.random() * 300));
        const pod = new THREE.Group();
        pod.add(new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 2.5, 6, 12), M.hull));
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a3a }));
        lamp.position.y = 2.6;
        pod.add(lamp);
        pod.position.copy(p);
        roots.home.add(pod);
        distress = { p, pod, lamp, life: 180, hold: 0 };
        hud.toast('📡 Distress signal detected! Find the escape pod (yellow on radar)', '#ffd23d');
        fx.sfx('alarm');
      }
    }
    if (showerT > 0) {
      showerT -= dt;
      if (Math.random() < dt * 4) spawnMeteor(ship.piloting ? ship.position : api.currentPos());
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life -= dt;
      m.g.position.addScaledVector(m.v, dt);
      m.g.rotation.x += dt;
      if (Math.random() < 0.5) fx.emit(m.g.position, null, 0xff7a1a, 0.8);
      if (ship.piloting && m.life > 0 && m.g.position.distanceTo(ship.position) < 5) {
        ship.damage(15, 'a meteor', m.g.position.clone(), 'crash');
        fx.explode(m.g.position, 1, 0xffa040);
        m.life = 0;
      }
      if (m.life <= 0) {
        roots.home.remove(m.g);
        meteors.splice(i, 1);
      }
    }
    if (distress) {
      distress.life -= dt;
      distress.lamp.visible = Math.sin(performance.now() / 150) > 0;
      distress.pod.rotation.y += dt;
      if (ship.piloting && ship.position.distanceTo(distress.p) < 18) {
        distress.hold += dt;
        hud.scan(distress.hold / 3, 'Docking with the escape pod…');
        if (distress.hold >= 3) {
          hud.scan(null);
          const lvl = api.level();
          game.chat('🛟 "Thank the stars! Get me back to the station!" You rescued a stranded pilot.', true);
          api.reward(120 + lvl * 30, 80 + lvl * 10);
          api.rep('command', 3);
          api.loot?.rollDrop?.(distress.p, { luck: 0.5 });
          distress.life = 0;
        }
      } else if (distress.hold > 0) {
        distress.hold = 0;
        hud.scan(null);
      }
      if (distress.life <= 0) {
        roots.home.remove(distress.pod);
        distress = null;
      }
    }
  });
  api.blipSources.push((out, here) => {
    if (here === 'home' && distress) out.push({ p: distress.p, kind: 'loot', size: 1.5, sticky: true });
    for (const n of nodes) if (n.sector === here && n.g.visible) out.push({ p: n.g.position, kind: 'ore', size: 0.7 });
    for (const [id, g] of Object.entries(gates)) if (id === here) out.push({ p: g.pos, kind: 'gate', size: 1.4, sticky: true });
    if (here) out.push({ p: V(SECTORS[here].arrive), kind: 'station', size: 1.2, sticky: true });
    for (const m of meteors) out.push({ p: m.g.position, kind: 'enemy', size: 0.6 });
  });

  // ---------- Per frame ----------
  const sectorBg = { nebula: new THREE.Color(0x120820), cryo: new THREE.Color(0x050a14), scrap: new THREE.Color(0x120a06), rift: new THREE.Color(0x0c0210) };
  const sectorFog = {
    nebula: new THREE.FogExp2(0x2a1446, 0.0026),
    scrap: new THREE.FogExp2(0x2a1a10, 0.0011),
    rift: new THREE.FogExp2(0x1a0418, 0.0014),
  };
  let shownSector = null;
  let homeCool = 0;
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace ? ctx.sector : null;
    // Only draw the sector you're in
    if (here !== shownSector) {
      for (const id of Object.keys(roots)) if (id !== 'home') roots[id].visible = id === here;
      for (const id of Object.keys(backdrops)) backdrops[id].visible = id === here;
      // Kepler Reach's planets and sun belong to home; other sectors keep just the stars
      for (const c of game.space.sky?.children || []) if (!c.isPoints) c.visible = !here || here === 'home';
      shownSector = here;
    }
    if (here && here !== 'home') {
      if (scene.background !== sectorBg[here]) scene.background = sectorBg[here];
      const fog = sectorFog[here] || null;
      if (scene.fog !== fog) scene.fog = fog;
      backdrops[here].position.copy(game.camera.position);
    } else if (here === 'home' && (Object.values(sectorBg).includes(scene.background) || Object.values(sectorFog).includes(scene.fog))) {
      scene.fog = null;
      scene.background = new THREE.Color(0x02030a);
    }
    for (const h of hazards) h(dt, ctx);

    // Resource nodes respawn and slowly turn
    for (const n of nodes) {
      if (n.respawn > 0) {
        n.respawn -= dt;
        if (n.respawn <= 0) {
          n.hp = n.maxHp;
          n.g.visible = true;
        }
      }
      if (n.sector === here) n.g.rotation.y += dt * 0.15;
    }

    // Gates: spin, light up when unlocked, fly through the ring to open the menu
    jumpCool = Math.max(0, jumpCool - dt);
    for (const [id, g] of Object.entries(gates)) {
      g.inner.rotation.z += dt * 0.8;
      g.swirl.rotation.z -= dt * 0.4;
      g.swirl.material.opacity = 0.18 + Math.sin(performance.now() / 400) * 0.06;
      if (ship.piloting && jumpCool <= 0 && !api.dlgOpen && id === here) {
        const rel = ship.position.clone().sub(g.pos);
        const along = rel.dot(g.normal);
        if (Math.abs(along) < 3 && rel.addScaledVector(g.normal, -along).length() < 15) {
          jumpCool = 3;
          jumpMenu(id);
        }
      }
    }

    // Home portals at sector stations
    homeCool = Math.max(0, homeCool - dt);
    for (const p of homePortals) {
      p.rotation.y += dt * 0.8;
      if (!ship.piloting && homeCool <= 0 && p.getWorldPosition(new THREE.Vector3()).distanceTo(ctx.player.position.clone().setY(ctx.player.position.y + 1.6)) < 1.4) {
        homeCool = 2;
        ctx.player.respawn();
      }
    }
  });

  // ---------- Crew in the new sectors ----------
  const at = (id, dx, dz, dy = 0) => {
    const a = SECTORS[id].arrive;
    return new THREE.Vector3(a[0] + dx, a[1] - 0.5 + dy, a[2] + dz);
  };
  api.addNpc({ id: 'mira', name: 'Captain Mira Sol', role: 'Haven · Missions', sector: 'nebula', faction: 'command', color: 0x9a5aff, pos: at('nebula', -4, 6), services: ['jobs'],
    lines: ['The Drift hides a lot of things. Pirates, mostly.', 'Haven is free. We intend to keep it that way.', 'Stay out of the ion storms unless you like your shields crispy.'] });
  api.addNpc({ id: 'quill', name: 'Trader Quill', role: 'Haven · Market · Upgrades', sector: 'nebula', faction: 'command', color: 0xd8b0ff, pos: at('nebula', 5, 6), services: ['market', 'upgrades', 'weapons'],
    lines: ['Tech is cheap out here. Everything else? Not so much.', 'Plasma from the clouds sells nicely, friend.'] });
  api.addNpc({ id: 'hale', name: 'Doc Hale', role: 'Haven · Repairs', sector: 'nebula', faction: 'command', color: 0xffffff, pos: at('nebula', 10, -12), services: ['repair'],
    lines: ['Patch you up, patch your ship up. Same thing really.'] });
  api.addNpc({ id: 'okoro', name: 'Chief Okoro', role: 'Frostfall · Missions', sector: 'cryo', faction: 'command', color: 0x5ab8ff, pos: at('cryo', -4, 6), services: ['jobs'],
    lines: ['Welcome to Frostfall. Mind the cold, and mind the ground. Sometimes it moves.', 'Ice crystals keep this base alive.'] });
  api.addNpc({ id: 'rin', name: 'Engineer Rin', role: 'Frostfall · Market · Repairs', sector: 'cryo', faction: 'command', color: 0xbff4ff, pos: at('cryo', 5, 6), services: ['market', 'repair', 'upgrades'],
    lines: ['Fuel is dirt cheap here. We make it out of ice.', 'The cave to the west is full of crystals. And echoes.'] });
  api.addNpc({ id: 'gizmo', name: 'Boss Gizmo', role: 'Rustport · Scavenger clans', sector: 'scrap', faction: 'scav', color: 0xe0a040, pos: at('scrap', -4, 6), services: ['jobs'],
    lines: ['Everything out here belongs to someone. Usually me.', 'Scavs don\'t ask questions. Scavs ask prices.'] });
  api.addNpc({ id: 'mags', name: 'Tinker Mags', role: 'Rustport · Black market', sector: 'scrap', faction: 'scav', color: 0xb8a070, pos: at('scrap', 5, 6), services: ['market', 'weapons', 'shipyard'],
    lines: ['Contraband? Never heard of it. How much have you got?', 'I buy scrap, I sell ships. Circle of life.'] });
  api.addNpc({ id: 'rusty', name: 'Old Rusty', role: 'Rustport · Repairs', sector: 'scrap', faction: 'scav', color: 0x8a5a3a, pos: at('scrap', 10, -12), services: ['repair'],
    lines: ['Duct tape and prayers, kid. Works every time.'] });
  api.addNpc({ id: 'varga', name: 'Dr. Ilse Varga', role: 'Last Light · Research', sector: 'rift', faction: 'command', color: 0xff5ad0, pos: at('rift', -4, 6), services: ['jobs'],
    lines: ['The Rift is not a place. It is a wound.', 'Every void shard you bring me is a page of a book nobody has read.'] });
  api.addNpc({ id: 'tov', name: 'Quartermaster Tov', role: 'Last Light · Market · Repairs', sector: 'rift', faction: 'command', color: 0xc06bff, pos: at('rift', 5, 6), services: ['market', 'repair', 'upgrades', 'weapons'],
    lines: ['Luxury goods are worth nothing out here. Medicine is worth everything.'] });

  return { gates, roots, nodes, jump, gateUnlocked };
}

let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
