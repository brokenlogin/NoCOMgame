// Space! Walk into the blue portal near spawn to visit Station NoCOM, a space station
// floating in an open chasm (CONFIG.terrain.voids). Inside the space zone:
//   - the sky turns black with stars, planets and a far-off sun, and the land is hidden
//   - gravity is low (CONFIG.space.gravity), great with the jetpack
//   - floating asteroids around the station to hop between
// Falling off sends you back to the station. The return portal on the deck takes you home.
//
// This is the start of the space RPG: put new space stuff (quests, NPCs, shops, planets...)
// in its own file and use game.space.inSpace() / game.space.STATION to hook in.

import * as THREE from 'three';
import { makeSign, teleport } from './mgShared.js';

const STATION = { x: 0, y: 30, z: -400 }; // deck top center
// Matches the void in CONFIG.terrain.voids. Big enough to fly a starship around in (spaceRpg.js)
const ZONE = { x0: -700, x1: 700, z0: -1900, z1: -312 };
const PORTAL = { x: 14, z: 0 }; // on the main map, near spawn

export function setupSpace(game) {
  const { scene, world, camera, CONFIG } = game;
  const gravityScale = CONFIG.space?.gravity ?? 0.35;
  const colliders = world.colliders;
  const solid = world.solidBoxes;

  // Every space zone (each is a void in CONFIG.terrain.voids). spaceSectors.js adds more with addZone.
  // floor: fall below it and you're put back at arrive()
  const ZONES = [{ ...ZONE, floor: STATION.y - 45, arrive: () => arrive() }];
  const zoneAt = (p) => ZONES.find((z) => p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) || null;
  const inZone = (p) => !!zoneAt(p);

  // ---------- Station ----------
  const station = new THREE.Group();
  scene.add(station);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2fb8ff, emissiveIntensity: 1.2 });

  function box(x, top, z, w, h, d, mat, { walk = true, wall = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, top - h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    station.add(m);
    m.updateMatrixWorld();
    if (walk) colliders.push(m);
    if (wall) solid.push(new THREE.Box3().setFromObject(m));
    return m;
  }

  const S = STATION;
  // Main deck: a cross of walkways around a central hub
  box(S.x, S.y, S.z, 14, 1, 14, metal);
  box(S.x, S.y, S.z - 16, 4, 1, 18, metal);
  box(S.x, S.y, S.z + 16, 4, 1, 18, metal);
  box(S.x - 16, S.y, S.z, 18, 1, 4, metal);
  box(S.x + 16, S.y, S.z, 18, 1, 4, metal);
  // Landing pads at the ends
  for (const [dx, dz] of [[0, -28], [0, 28], [-28, 0], [28, 0]]) {
    box(S.x + dx, S.y, S.z + dz, 10, 1, 10, dark);
    const light = box(S.x + dx, S.y + 0.05, S.z + dz, 8, 0.1, 0.3, glow, { walk: false });
    light.rotation.y = dx ? Math.PI / 2 : 0;
  }
  // Glowing trim around the hub
  for (const [dx, dz, w, d] of [[0, -7, 14, 0.3], [0, 7, 14, 0.3], [-7, 0, 0.3, 14], [7, 0, 0.3, 14]]) {
    box(S.x + dx, S.y + 0.06, S.z + dz, w, 0.12, d, glow, { walk: false });
  }
  // Central tower with an antenna
  box(S.x, S.y + 6, S.z, 3, 6, 3, dark, { wall: true });
  box(S.x, S.y + 12, S.z, 0.3, 6, 0.3, metal, { walk: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  beacon.position.set(S.x, S.y + 12.3, S.z);
  station.add(beacon);

  const sign = makeSign(game, '🚀 Station NoCOM', { width: 6, height: 1.4, color: '#bfe8ff' });
  scene.remove(sign);
  sign.position.set(S.x, S.y + 4.2, S.z + 1.6);
  station.add(sign);
  const sub = makeSign(game, 'Talk to the crew on deck (E) · your ship is in the north hangar', { width: 6, height: 0.8 });
  scene.remove(sub);
  sub.position.set(S.x, S.y + 3, S.z + 1.6);
  station.add(sub);

  // ---------- Asteroids to hop between ----------
  const rock = new THREE.MeshStandardMaterial({ color: 0x6f6660, roughness: 1, flatShading: true });
  const rng = mulberry32(4242);
  const asteroids = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const dist = 22 + rng() * 50;
    const r = 1.5 + rng() * 3.5;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rock);
    // Lumpy
    const pos = m.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const s = 0.8 + rng() * 0.4;
      pos.setXYZ(k, pos.getX(k) * s, pos.getY(k) * s * 0.7, pos.getZ(k) * s);
    }
    m.geometry.computeVertexNormals();
    m.position.set(S.x + Math.cos(a) * dist, S.y - 6 + rng() * 24, S.z + Math.sin(a) * dist);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    station.add(m);
    m.updateMatrixWorld();
    colliders.push(m);
    asteroids.push({ m, spin: (rng() - 0.5) * 0.2 });
  }

  // ---------- Portals ----------
  function makePortal(color, label) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.12, 12, 40),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 })
    );
    ring.position.y = 1.6;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    disc.position.y = 1.6;
    const s = makeSign(game, label, { width: 3, height: 0.7 });
    scene.remove(s);
    s.position.y = 3.6;
    g.add(ring, disc, s);
    g.userData = { ring, disc, sign: s };
    return g;
  }
  const toSpace = makePortal(0x3aa0ff, '🚀 Space');
  toSpace.position.set(PORTAL.x, 0, PORTAL.z);
  scene.add(toSpace);
  const home = makePortal(0x7aff9a, '🏠 Home');
  home.position.set(S.x, S.y, S.z + 26);
  station.add(home);

  // ---------- Space sky (follows the camera, only visible in space) ----------
  const sky = new THREE.Group();
  sky.visible = false;
  scene.add(sky);
  {
    const n = 3500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize().multiplyScalar(470);
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(0.55 + rng() * 0.15, 0.4, 0.7 + rng() * 0.3);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false })));
  }
  const planet = (r, color, pos, ring) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({ color, roughness: 0.9, fog: false }));
    m.position.copy(pos);
    sky.add(m);
    if (ring) {
      const rg = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 2.2, 64),
        new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false })
      );
      rg.rotation.x = -Math.PI / 2 + 0.4;
      m.add(rg);
    }
    return m;
  };
  const gasGiant = planet(70, 0xc9a26b, new THREE.Vector3(-260, 120, -330), 0xe6d0a0);
  planet(26, 0xb5452e, new THREE.Vector3(300, 60, -200));
  planet(14, 0x4f8fd6, new THREE.Vector3(160, 220, 280));
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(22, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false }));
  sunMesh.position.set(330, 200, 120);
  sky.add(sunMesh);

  // ---------- Switching between the normal world and space ----------
  const normal = { background: scene.background.clone(), fog: scene.fog };
  const spaceBg = new THREE.Color(0x02030a);
  let inSpace = false;
  function setSpace(on) {
    if (on === inSpace) return;
    inSpace = on;
    sky.visible = on;
    scene.background = on ? spaceBg : normal.background;
    scene.fog = on ? null : normal.fog;
    world.setLandVisible(!on);
  }

  // ---------- Per frame ----------
  let cooldown = 0;
  const arrive = () => [S.x + (Math.random() - 0.5) * 4, S.y + 0.5, S.z + 20 + (Math.random() - 0.5) * 2];
  game.addSystem((dt, game) => {
    const player = game.player;
    const p = player.position;
    cooldown = Math.max(0, cooldown - dt);

    toSpace.position.y = world.terrain.groundHeight(PORTAL.x, PORTAL.z);
    for (const pt of [toSpace, home]) {
      pt.userData.ring.rotation.y += dt * 0.8;
      pt.userData.disc.rotation.y = pt.userData.ring.rotation.y;
    }
    beacon.material.color.setHex(Math.sin(performance.now() * 0.004) > 0 ? 0xff4040 : 0x401010);
    gasGiant.rotation.y += dt * 0.02;
    for (const a of asteroids) a.m.rotation.y += a.spin * dt; // (visual only; colliders barely move)

    const zone = zoneAt(p);
    const here = !!zone;
    // Low gravity while you're in the space zone
    player.gravityScale = here ? gravityScale : 1;

    if (cooldown === 0) {
      if (near(p, toSpace.position)) {
        teleport(player, ...arrive());
        cooldown = 2;
        game.chat('🚀 Welcome to Station NoCOM! Low gravity up here. Walk into the green portal to go home.', true);
      } else if (near(p, home.getWorldPosition(new THREE.Vector3()))) {
        player.respawn();
        cooldown = 2;
      }
    }
    // Fell off the station (or whatever you were standing on in this zone): back on deck
    if (zone && p.y < zone.floor) teleport(player, ...zone.arrive());
  });

  // The sky follows the camera, and space mode follows whoever the camera is looking from
  const follow = () => {
    sky.position.copy(camera.position);
    setSpace(inZone(camera.position));
    requestAnimationFrame(follow);
  };
  follow();

  return {
    STATION,
    ZONE,
    ZONES,
    addZone: (z) => ZONES.push(z),
    inZone,
    zoneAt,
    sky, // stars/planets/sun group (drawn as a backdrop by spaceRpg.js)
    inSpace: () => inSpace,
  };
}

function near(p, q) {
  const dx = p.x - q.x, dz = p.z - q.z;
  return dx * dx + dz * dz < 1.3 ** 2 && Math.abs(p.y - q.y) < 3;
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
