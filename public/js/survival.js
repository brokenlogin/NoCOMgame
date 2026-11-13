// Survival mode (the host picks Creative or Survival in the lobby; it's game.mode).
//
// Creative: the normal game, every item free from the Tab spawner.
// Survival: no spawner and no free dynamite (Y) or black holes (I). You start with a wooden
// pickaxe. Mine trees and rocks around the map (hold click on them), then press C to craft
// better pickaxes and weapons. Better ores need better pickaxes:
//   wood, stone, coal: any pickaxe · iron: stone pickaxe · gold: iron pickaxe · crystal: gold pickaxe
// Every item in the game is craftable; the strongest ones cost gold and crystal. Building blocks
// and torches too (building.js), and at night monsters come out (survivalNight.js).
// Mining is your own (everyone has their own rocks), and nodes grow back after a while.
//
// Contributors: new items you register show up in the crafting menu automatically (at gold tier).
// Put them in TIERS below if you want them cheaper or pricier.

import * as THREE from 'three';
import { ITEMS, registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { voidAmount } from './terrain.js';
import { BLOCKS } from './building.js';

const MATERIALS = {
  wood: { name: 'Wood', icon: '🪵' },
  stone: { name: 'Stone', icon: '🪨' },
  coal: { name: 'Coal', icon: '⚫' },
  iron: { name: 'Iron', icon: '🔩' },
  gold: { name: 'Gold', icon: '🥇' },
  crystal: { name: 'Crystal', icon: '💎' },
  spores: { name: 'Glow Spores', icon: '🍄' }, // only from Glowcaps on the ceiling
};

// What each kind of node looks like, how tough it is, what it drops, which pickaxe it needs
const NODES = {
  tree: { hp: 4, tier: 0, drops: { wood: [3, 5] } },
  stone: { hp: 4, tier: 0, drops: { stone: [2, 4] } },
  coal: { hp: 5, tier: 0, drops: { coal: [2, 3], stone: [0, 1] } },
  iron: { hp: 6, tier: 1, drops: { iron: [2, 3], stone: [0, 1] } },
  gold: { hp: 7, tier: 2, drops: { gold: [1, 2] } },
  crystal: { hp: 8, tier: 3, drops: { crystal: [1, 2] } },
  // Ceiling only (flip gravity with G to get up there). They hang upside down.
  stalactite: { hp: 5, tier: 0, drops: { stone: [2, 3], coal: [0, 1] }, ceiling: true },
  glowcap: { hp: 3, tier: 0, drops: { spores: [2, 4] }, ceiling: true },
  'ember-vent': { hp: 6, tier: 1, drops: { gold: [1, 2], coal: [1, 2] }, ceiling: true },
  geode: { hp: 7, tier: 2, drops: { crystal: [1, 2], stone: [0, 1] }, ceiling: true },
};

const PICKAXES = [
  { id: 'pickaxe-wood', name: 'Wooden Pickaxe', tier: 0, speed: 0.45, color: 0x8a5a2a, cost: {} },
  { id: 'pickaxe-stone', name: 'Stone Pickaxe', tier: 1, speed: 0.36, color: 0x8a8a8a, cost: { wood: 3, stone: 6 } },
  { id: 'pickaxe-iron', name: 'Iron Pickaxe', tier: 2, speed: 0.28, color: 0xd0d4dc, cost: { wood: 3, iron: 6 } },
  { id: 'pickaxe-gold', name: 'Golden Pickaxe', tier: 3, speed: 0.2, color: 0xffc23a, cost: { iron: 3, gold: 6 } },
];
const TIER_NAMES = ['Any pickaxe', 'Stone pickaxe', 'Iron pickaxe', 'Golden pickaxe'];

// Pickaxe model: wooden handle with a leather grip, curved head with two points, lashing.
// Grip at the origin, handle up, the pick points forward (-Z) like itemModels.js expects.
function buildPickaxe(T, p) {
  const g = new T.Group();
  const pick = new T.Group();
  const wood = new T.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.75 });
  const leather = new T.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.9 });
  const heads = [
    new T.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.8 }), // wood
    new T.MeshStandardMaterial({ color: 0x8c8a86, roughness: 1, flatShading: true }), // stone
    new T.MeshStandardMaterial({ color: 0xd6dbe2, roughness: 0.32, metalness: 0.5 }), // iron
    new T.MeshStandardMaterial({ color: 0xf2c440, roughness: 0.28, metalness: 0.5, emissive: 0x3a2800 }), // gold
  ];
  const headMat = heads[p.tier] || heads[0];

  // Handle
  const handle = new T.Mesh(new T.CylinderGeometry(0.02, 0.024, 0.58, 10), wood);
  handle.position.y = 0.2;
  pick.add(handle);
  const grip = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.14, 10), leather);
  grip.position.y = -0.02;
  pick.add(grip);
  const knob = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), wood);
  knob.position.y = -0.1;
  pick.add(knob);

  // Curved head: a slice of a ring, arching over the top of the handle, ends pointing front/back
  const R = 0.2, arc = 2.0, headY = 0.5;
  const ring = new T.Mesh(new T.TorusGeometry(R, p.tier === 1 ? 0.032 : 0.026, 8, 28, arc), headMat);
  ring.rotation.z = Math.PI / 2 - arc / 2; // center the arc on +Y
  const head = new T.Group();
  head.add(ring);
  // Pointed tips continuing the curve at both ends
  for (const s of [-1, 1]) {
    const ang = Math.PI / 2 + (s * arc) / 2;
    const tip = new T.Mesh(new T.ConeGeometry(p.tier === 1 ? 0.034 : 0.028, 0.11, 10), headMat);
    tip.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
    const tangent = new T.Vector3(-Math.sin(ang), Math.cos(ang), 0).multiplyScalar(s);
    tip.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tangent);
    tip.position.addScaledVector(tangent, 0.05);
    head.add(tip);
  }
  head.position.y = headY - R; // circle center below, so the top of the arc sits at headY
  head.rotation.y = Math.PI / 2; // arc runs front-to-back
  pick.add(head);

  // Socket and lashing where the head meets the handle
  const socket = new T.Mesh(new T.BoxGeometry(0.06, 0.07, 0.07), headMat);
  socket.position.y = headY - 0.005;
  pick.add(socket);
  for (const y of [headY - 0.06, headY - 0.085]) {
    const wrap = new T.Mesh(new T.TorusGeometry(0.026, 0.007, 6, 14), leather);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = y;
    pick.add(wrap);
  }

  pick.rotation.x = -0.35; // lean the top forward a little
  g.add(pick);
  return g;
}

// Weapon tiers. Anything not listed is tier 3.
const TIERS = {
  1: ['bat', 'plunger', 'boxing-glove', 'rubber-chicken', 'banana-peel', 'whoopee-cushion', 'cream-pie', 'confetti-popper', 'clown-horn', 'air-horn', 'sorry', 'boomerang', 'medkit'],
  2: ['sword', 'dynamite', 'potato-cannon', 'leaf-blower', 'grappling-hook', 'blink-dagger', 'giant-axe', 'anchor', 'land-mine', 'sticky-c4', 'dynamite-shotgun', 'insta-wall', 'balloon-gun', 'firework-launcher', 'falcon-punch', 'sneezing-powder', 'flash-potion', 'moon-boots', 'ice-field'],
  4: ['nuke', 'orbital-strike', 'singularity-cannon', 'meteor-shower', 'banhammer', 'laser-beam', 'god-potion', 'cosmic-snap', 'ice-age', 'time-stop', 'tsunami', 'gravity-bomb'],
};
const TIER_COST = {
  1: { wood: 4, stone: 2 },
  2: { wood: 2, iron: 4, coal: 2 },
  3: { iron: 4, gold: 4, coal: 3 },
  4: { iron: 4, gold: 4, crystal: 5 },
};
// Items with their own recipe instead of the tier price (checked before TIER_COST)
const CUSTOM_RECIPES = {
  'recall-stone': { cost: { stone: 3, coal: 1 }, makes: 2, tier: 0.6, group: 'Travel' },
  medkit: { cost: { spores: 3, wood: 1 }, makes: 1, tier: 0.7, group: 'Ceiling finds' },
  // Armor: priced like the matching pickaxe (armor.js)
  'armor-stone': { cost: { wood: 2, stone: 8 }, makes: 1, tier: 0.4, group: 'Armor' },
  'armor-iron': { cost: { wood: 2, iron: 6, coal: 1 }, makes: 1, tier: 0.41, group: 'Armor' },
  'armor-gold': { cost: { iron: 3, gold: 6 }, makes: 1, tier: 0.42, group: 'Armor' },
};
const NOT_CRAFTABLE = new Set(['ship-blasters', 'sp-blaster', ...PICKAXES.map((p) => p.id), ...Object.keys(MATERIALS), ...Object.keys(BLOCKS)]);
const tierOf = (id) => Number(Object.keys(TIERS).find((t) => TIERS[t].includes(id)) || 3);

export function setupSurvival(game) {
  const { scene, world, inventory, input } = game;
  game.mode ||= 'creative';
  const survival = () => game.mode === 'survival';

  // ---------- Materials and pickaxes are items ----------
  for (const [id, m] of Object.entries(MATERIALS)) {
    registerItem({ id, name: m.name, icon: m.icon, maxStack: 99, description: 'Crafting material. Press C to craft.', use: () => false });
  }
  const nodes = [];
  const ray = new THREE.Raycaster();
  let warnT = 0;
  for (const p of PICKAXES) {
    registerItemModel(p.id, (T) => buildPickaxe(T, p));
    registerItem({
      id: p.id,
      name: p.name,
      icon: '⛏️',
      description: `Hold click on trees and rocks to mine. Mines: ${['wood, stone, coal', '+ iron', '+ gold', '+ crystal'][p.tier]}.`,
      anim: 'swing',
      holdAnim: 'mine', // a proper chop each hit instead of shaking
      hold(ctx, dt, state) {
        state.t = (state.t ?? 0) - dt;
        if (state.t > 0) return;
        state.t = p.speed;
        ctx.playAnim?.('mine', p.speed * 0.95); // finish just before the next hit
        mineAt(ctx.origin, ctx.dir, p);
      },
    });
  }

  // ---------- Resource nodes on the map ----------
  const root = new THREE.Group();
  scene.add(root);
  const M = {
    trunk: new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: 0.9 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.8, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, flatShading: true }),
    coal: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }),
    // (very metallic materials render almost black here: there's no reflection map)
    iron: new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.45, metalness: 0.4, flatShading: true }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.3, metalness: 0.45, emissive: 0x5a3a00, flatShading: true }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x7ae8ff, roughness: 0.1, emissive: 0x2a9aff, emissiveIntensity: 1.2 }),
    limestone: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.85, flatShading: true }),
    capTop: new THREE.MeshStandardMaterial({ color: 0x8a4ad8, roughness: 0.5, emissive: 0x5a20b0, emissiveIntensity: 0.9 }),
    capStem: new THREE.MeshStandardMaterial({ color: 0xc8f0e8, roughness: 0.6, emissive: 0x2a8a7a, emissiveIntensity: 0.5 }),
    basalt: new THREE.MeshStandardMaterial({ color: 0x2c2a2e, roughness: 0.9, flatShading: true }),
    ember: new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.6, emissive: 0xff4a10, emissiveIntensity: 1.6 }),
    geodeShell: new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 0.95, flatShading: true }),
    geodeCrystal: new THREE.MeshStandardMaterial({ color: 0xc89aff, roughness: 0.1, emissive: 0x7a3aff, emissiveIntensity: 1.3 }),
  };
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
  // A boulder: a sphere bent by a few smooth random waves, squashed a bit, flat-shaded.
  // The bump is a function of direction, so the copies of each corner that three.js keeps
  // per triangle all move together and the rock stays one solid piece.
  // Returns the mesh plus surface(dir) -> point on its surface (for placing ore on it).
  function lumpy(r, rnd) {
    const waves = [];
    for (let k = 0; k < 4; k++) {
      const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      waves.push({ dir: dir.multiplyScalar(1.5 + rnd() * 2.5), ph: rnd() * Math.PI * 2, amp: 0.05 + rnd() * 0.07 });
    }
    const stretch = new THREE.Vector3(0.9 + rnd() * 0.3, 0.62 + rnd() * 0.18, 0.9 + rnd() * 0.3);
    const bump = (d) => {
      let b = 1;
      for (const w of waves) b += w.amp * Math.sin(w.dir.dot(d) + w.ph);
      return b;
    };
    const surface = (d) => {
      const u = d.clone().normalize();
      return u.multiplyScalar(r * bump(u)).multiply(stretch);
    };
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const p = surface(v);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, M.rock);
    mesh.rotation.y = rnd() * Math.PI * 2;
    return { mesh, surface: (d) => surface(d).applyAxisAngle(THREE.Object3D.DEFAULT_UP, mesh.rotation.y) };
  }
  function build(kind, rnd) {
    const g = new THREE.Group();
    if (kind === 'stalactite') {
      // A cluster of pale cones (they'll point down once flipped)
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const h = 1.2 + rnd() * 1.8;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.22 + rnd() * 0.18, h, 7), M.limestone);
        c.position.set((rnd() - 0.5) * 1.1, h / 2 - 0.1, (rnd() - 0.5) * 1.1);
        g.add(c);
      }
    } else if (kind === 'glowcap') {
      // Glowing mushrooms growing out of the ceiling
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const h = 0.5 + rnd() * 0.9;
        const x = (rnd() - 0.5) * 1.2, z = (rnd() - 0.5) * 1.2;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 8), M.capStem);
        stem.position.set(x, h / 2, z);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rnd() * 0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.capTop);
        cap.position.set(x, h - 0.02, z);
        cap.scale.y = 0.7;
        g.add(stem, cap);
      }
    } else if (kind === 'ember-vent') {
      // Hexagonal basalt columns with glowing ember cracks
      for (let k = 0; k < 4; k++) {
        const h = 0.6 + rnd() * 1.2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 6), M.basalt);
        col.position.set((k % 2 - 0.5) * 0.62, h / 2, (Math.floor(k / 2) - 0.5) * 0.55 + (k % 2) * 0.1);
        g.add(col);
        const crack = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.05, 6), M.ember);
        crack.position.set(col.position.x, h * (0.4 + rnd() * 0.4), col.position.z);
        g.add(crack);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.08, 6), M.ember);
        tip.position.set(col.position.x, h + 0.02, col.position.z);
        g.add(tip);
      }
    } else if (kind === 'geode') {
      // A cracked-open rock with purple crystals inside
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), M.geodeShell);
      shell.material.side = THREE.DoubleSide;
      shell.position.y = 0.45;
      g.add(shell);
      for (let k = 0; k < 7; k++) {
        const dir = new THREE.Vector3(rnd() - 0.5, rnd() * 0.6 + 0.4, rnd() - 0.5).normalize();
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + rnd() * 0.08, 0), M.geodeCrystal);
        c.scale.set(0.7, 2, 0.7);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        c.position.copy(dir).multiplyScalar(0.35).add(new THREE.Vector3(0, 0.45, 0));
        g.add(c);
      }
    } else if (kind === 'tree') {
      const h = 2.5 + rnd() * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 8), M.trunk);
      trunk.position.y = h / 2;
      g.add(trunk);
      for (let k = 0; k < 3; k++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 - k * 0.3, 0), M.leaves);
        leaf.position.set((rnd() - 0.5) * 0.6, h + k * 0.8, (rnd() - 0.5) * 0.6);
        g.add(leaf);
      }
    } else {
      const { mesh: rock, surface } = lumpy(0.75 + rnd() * 0.45, rnd);
      const base = 0.35; // center height: the bottom sinks into the ground a little
      rock.position.y = base;
      g.add(rock);
      if (kind !== 'stone') {
        // Ore set into the rock's surface, half buried, on the upper part
        const n = kind === 'crystal' ? 6 : kind === 'gold' ? 5 : 7;
        for (let k = 0; k < n; k++) {
          const dir = new THREE.Vector3(rnd() - 0.5, 0.15 + rnd() * 0.85, rnd() - 0.5).normalize();
          const at = surface(dir);
          let c;
          if (kind === 'crystal') {
            c = new THREE.Mesh(new THREE.OctahedronGeometry(0.13 + rnd() * 0.08, 0), M.crystal);
            c.scale.set(0.8, 2.4, 0.8); // tall shard
            c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().lerp(new THREE.Vector3(0, 1, 0), 0.4).normalize());
            at.multiplyScalar(0.96);
          } else {
            const size = kind === 'gold' ? 0.12 + rnd() * 0.06 : 0.13 + rnd() * 0.08;
            c = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), M[kind]);
            c.scale.set(1.2, 0.6, 1.0); // flattish nugget lying on the surface
            c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            c.rotateY(rnd() * Math.PI);
            at.multiplyScalar(0.99);
          }
          c.position.set(at.x, base + at.y, at.z);
          g.add(c);
        }
      }
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    return g;
  }
  // ---------- Endless resources ----------
  // Trees and rocks are generated in 25m chunks around you, forever, from the room seed (so
  // everyone gets the same ones). Chunks far behind you are dropped and come back the same
  // (fully grown) when you return. Rarer ores need distance from spawn, and the region matters:
  // mountains have more ore and crystal, mesas more gold, plains more trees.
  const NODE_CHUNK = 25;
  const NODE_VIEW = 6; // chunks loaded around you in each direction (~150m)
  const nodeChunks = new Map(); // "cx,cz" -> [node]
  let nodeSeed = 1;
  let lastChunkKey = '';

  function pickKind(r, d, b) {
    const w = {
      tree: 0.36 * (1 + 0.8 * b.plains - 0.8 * b.mountain - 0.8 * b.mesa),
      stone: 0.24 * (1 + 0.3 * b.mountain),
      coal: 0.15 * (1 + 0.3 * b.mountain),
      iron: 0.13 * (1 + 0.6 * b.mountain),
      gold: d > 120 ? 0.06 * (1 + 2 * b.mesa + 0.5 * b.mountain) : 0,
      crystal: d > 250 ? 0.035 * (1 + 2.5 * b.mountain) : 0,
    };
    let total = 0;
    for (const k in w) total += Math.max(0, w[k]);
    let t = r * total;
    for (const k in w) {
      t -= Math.max(0, w[k]);
      if (t <= 0) return k;
    }
    return 'stone';
  }

  // Ceiling finds: glowcaps in fungal roofs, ember vents in basalt, geodes in grottos,
  // stalactites in spire forests (and everywhere else). Better ones need some distance.
  function pickCeilingKind(r, d, rb) {
    const w = {
      stalactite: 0.45 + rb.spires,
      glowcap: 0.25 + rb.fungal * 1.5,
      'ember-vent': d > 60 ? 0.12 + rb.basalt * 1.5 : 0,
      geode: d > 60 ? 0.08 + rb.grotto * 1.5 : 0,
    };
    let total = 0;
    for (const k in w) total += w[k];
    let t = r * total;
    for (const k in w) {
      t -= w[k];
      if (t <= 0) return k;
    }
    return 'stalactite';
  }

  function addNode(kind, x, z, rnd) {
    const g = build(kind, rnd);
    if (NODES[kind].ceiling) {
      // Hang from the roof, upside down
      g.position.set(x, world.terrain.roofHeight(x, z) + 0.1, z);
      g.rotation.set(Math.PI, rnd() * Math.PI * 2, 0);
    } else {
      g.position.set(x, world.terrain.groundHeight(x, z) - 0.1, z);
      g.rotation.y = rnd() * Math.PI * 2;
    }
    root.add(g);
    const n = { g, kind, hp: NODES[kind].hp, respawn: 0, shake: 0 };
    g.traverse((o) => (o.userData.node = n));
    if (kind === 'tree') {
      n.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, g.position.y + 1.5, z), new THREE.Vector3(0.6, 3, 0.6));
      world.solidBoxes.push(n.box);
    }
    nodes.push(n);
    return n;
  }

  function loadNodeChunk(cx, cz) {
    const list = [];
    const rnd = rng((nodeSeed * 7919 + Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0);
    const tries = Math.floor(rnd() * 2.6); // 0-2 spots per chunk (keeps the scene light)
    for (let i = 0; i < tries; i++) {
      const x = (cx + rnd()) * NODE_CHUNK, z = (cz + rnd()) * NODE_CHUNK;
      const r = rnd();
      const d = Math.hypot(x, z);
      if (d < 14) continue; // keep spawn clear
      if (voidAmount(x, z) > 0.01) continue; // not over a chasm
      const b = world.terrain.biome?.(x, z) || { mountain: 0, plains: 0, mesa: 0, valley: 0 };
      if (b.valley > 0.6 && r < 0.5) continue; // riverbeds are mostly bare
      list.push(addNode(pickKind(r, d, b), x, z, rnd));
    }
    // Ceiling: about one find every other chunk, and the kind depends on the roof region
    if (rnd() < 0.5) {
      const x = (cx + rnd()) * NODE_CHUNK, z = (cz + rnd()) * NODE_CHUNK;
      const r = rnd();
      const d = Math.hypot(x, z);
      if (d > 20 && voidAmount(x, z) < 0.01) {
        const rb = world.terrain.roofBiome?.(x, z) || { spires: 0, fungal: 0, basalt: 0, grotto: 0 };
        list.push(addNode(pickCeilingKind(r, d, rb), x, z, rnd));
      }
    }
    nodeChunks.set(`${cx},${cz}`, list);
  }

  function unloadNodeChunk(k) {
    for (const n of nodeChunks.get(k) || []) {
      root.remove(n.g);
      n.g.traverse((o) => o.isMesh && o.geometry.dispose());
      if (n.box) {
        const bi = world.solidBoxes.indexOf(n.box);
        if (bi >= 0) world.solidBoxes.splice(bi, 1);
      }
      const ni = nodes.indexOf(n);
      if (ni >= 0) nodes.splice(ni, 1);
    }
    nodeChunks.delete(k);
  }

  // Load what's near you (nearest first, a few per frame so it doesn't stutter), drop what's far
  function updateNodeChunks(focus) {
    const fcx = Math.floor(focus.x / NODE_CHUNK), fcz = Math.floor(focus.z / NODE_CHUNK);
    const here = `${fcx},${fcz}`;
    if (here !== lastChunkKey) {
      lastChunkKey = here;
      for (const k of [...nodeChunks.keys()]) {
        const [cx, cz] = k.split(',').map(Number);
        if (Math.abs(cx - fcx) > NODE_VIEW + 1 || Math.abs(cz - fcz) > NODE_VIEW + 1) unloadNodeChunk(k);
      }
    }
    const missing = [];
    for (let dz = -NODE_VIEW; dz <= NODE_VIEW; dz++) {
      for (let dx = -NODE_VIEW; dx <= NODE_VIEW; dx++) {
        if (!nodeChunks.has(`${fcx + dx},${fcz + dz}`)) missing.push([dx * dx + dz * dz, fcx + dx, fcz + dz]);
      }
    }
    if (!missing.length) return;
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of missing.slice(0, 4)) loadNodeChunk(cx, cz);
  }

  function spawnNodes(seed) {
    for (const k of [...nodeChunks.keys()]) unloadNodeChunk(k);
    nodes.length = 0;
    nodeSeed = seed;
    lastChunkKey = '';
  }

  // ---------- Mining ----------
  let audio = null;
  function thunk(kind) {
    try {
      audio ||= new AudioContext();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      o.type = kind === 'tree' ? 'triangle' : 'square';
      o.frequency.setValueAtTime(kind === 'tree' ? 220 : 520, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'tree' ? 90 : 180, t + 0.08);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.12);
    } catch {}
  }
  // Blocks of the buildings and ruins around the map can be mined too
  const STRUCTURE_BLOCKS = {
    wood: { hp: 3, tier: 0, drops: { wood: [1, 2] } },
    plank: { hp: 3, tier: 0, drops: { wood: [1, 2] } },
    stone: { hp: 5, tier: 0, drops: { stone: [1, 2] } },
    brick: { hp: 5, tier: 0, drops: { stone: [1, 2] } },
    darkStone: { hp: 6, tier: 0, drops: { stone: [1, 3] } },
    crystal: { hp: 6, tier: 3, drops: { crystal: [1, 2] } },
  };
  const structureHp = new WeakMap(); // block mesh -> hits left
  game.net.on('event', (msg) => {
    if (msg.kind === 'sv:breakBlock' && typeof msg.id === 'string') world.structures.breakById(msg.id);
  });

  function giveDrops(drops) {
    const got = [];
    for (const [mat, [lo, hi]] of Object.entries(drops)) {
      const k = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (k <= 0) continue;
      const m = MATERIALS[mat];
      inventory.add({ id: mat, name: m.name, icon: m.icon, maxStack: 99, count: k });
      got.push(`${m.icon} ${k} ${m.name}`);
    }
    if (got.length) game.chat(`⛏️ +${got.join(', ')}`, true);
  }

  function mineStructureBlock(mesh, point, pick) {
    const def = STRUCTURE_BLOCKS[mesh.userData.matKind] || STRUCTURE_BLOCKS.stone;
    if (pick.tier < def.tier) {
      if (performance.now() - warnT > 1500) {
        warnT = performance.now();
        game.chat(`⛏️ That block needs a ${TIER_NAMES[def.tier].toLowerCase()} or better.`, true);
      }
      return;
    }
    const left = (structureHp.get(mesh) ?? def.hp) - 1;
    structureHp.set(mesh, left);
    const isWood = mesh.userData.matKind === 'wood' || mesh.userData.matKind === 'plank';
    thunk(isWood ? 'tree' : 'stone');
    game.opItems?.puffFx?.(point, isWood ? 0x8a6a3a : 0xaaa49a);
    if (left > 0) return;
    if (!world.structures.breakBlock(mesh)) return;
    if (mesh.userData.id) game.net.sendEvent({ kind: 'sv:breakBlock', id: mesh.userData.id }); // gone for everyone
    giveDrops(def.drops);
  }

  function mineAt(origin, dir, pick) {
    ray.set(origin, dir);
    ray.far = 5;
    const structureBlocks = world.structures?.meshes?.() || [];
    const hit = ray.intersectObjects([...nodes.filter((n) => n.g.visible).map((n) => n.g), ...(game.building?.meshes() || []), ...structureBlocks], true)[0];
    if (!hit) return;
    if (hit.object.userData.blockCell) {
      game.building.hit(hit.object.userData.blockCell, pick.tier);
      thunk('stone');
      return;
    }
    if (hit.object.userData.box && hit.object.userData.matKind) {
      mineStructureBlock(hit.object, hit.point, pick);
      return;
    }
    const n = hit.object.userData.node;
    const need = NODES[n.kind].tier;
    if (pick.tier < need) {
      if (performance.now() - warnT > 1500) {
        warnT = performance.now();
        game.chat(`⛏️ That ${n.kind} needs a ${TIER_NAMES[need].toLowerCase()} or better (press C to craft one).`, true);
      }
      return;
    }
    n.hp--;
    n.shake = 0.15;
    thunk(n.kind);
    game.opItems?.puffFx?.(hit.point, n.kind === 'tree' ? 0x8a6a3a : 0xaaa49a);
    if (n.hp > 0) return;
    // Broken: drop the goods into your inventory
    n.g.visible = false;
    n.respawn = 75 + Math.random() * 45;
    if (n.box) n.box.makeEmpty();
    const got = [];
    for (const [mat, [lo, hi]] of Object.entries(NODES[n.kind].drops)) {
      const k = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (k <= 0) continue;
      const m = MATERIALS[mat];
      inventory.add({ id: mat, name: m.name, icon: m.icon, maxStack: 99, count: k });
      got.push(`${m.icon} ${k} ${m.name}`);
    }
    game.chat(`⛏️ +${got.join(', ')}`, true);
  }

  // ---------- Crafting menu (C) ----------
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(760px, 94vw)', maxHeight: '82vh', overflowY: 'auto',
    background: 'rgba(20,22,27,0.96)', border: '1px solid #4a5060', borderRadius: '14px', padding: '14px 16px', color: '#e8ecf2',
    font: '14px system-ui, sans-serif', display: 'none', zIndex: 32, boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
    pointerEvents: 'auto', // #hud ignores the mouse; this menu needs it
  });
  document.getElementById('hud').appendChild(panel);
  // Fixed header (title, close, search) + a body that's redrawn; the search box keeps focus while you type
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
      <div style="font:800 18px system-ui">⚒️ Crafting</div>
      <input data-search type="search" placeholder="🔍 Search recipes…" autocomplete="off" spellcheck="false"
        style="flex:1;max-width:260px;padding:5px 9px;font-size:13px;border-radius:7px" />
      <button class="btn" data-close style="padding:4px 10px">✕</button></div>
    <div data-body></div>`;
  const searchEl = panel.querySelector('[data-search]');
  const bodyEl = panel.querySelector('[data-body]');
  searchEl.addEventListener('input', () => draw());
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return; // let it close the menu
    e.stopPropagation(); // typing (even C) mustn't trigger game keys or close the menu
  });
  let open = false;
  const have = (id) => inventory.count(id);
  const canPay = (cost) => Object.entries(cost).every(([m, k]) => have(m) >= k);
  const costText = (cost) => Object.entries(cost).map(([m, k]) => `<span style="color:${have(m) >= k ? '#9fe8a8' : '#ff9a8a'}">${MATERIALS[m].icon}${k}</span>`).join(' ') || 'free';
  function recipes() {
    const list = PICKAXES.slice(1).map((p) => ({ id: p.id, name: p.name, icon: '⛏️', cost: p.cost, tier: 0, group: 'Pickaxes' }));
    for (const [id, b] of Object.entries(BLOCKS)) list.push({ id, name: `${b.name} ×${b.makes}`, icon: b.icon, cost: b.craft, tier: 0.5, group: 'Building', makes: b.makes });
    for (const def of ITEMS.values()) {
      if (NOT_CRAFTABLE.has(def.id)) continue;
      const custom = CUSTOM_RECIPES[def.id];
      if (custom) {
        list.push({ id: def.id, name: custom.makes > 1 ? `${def.name} ×${custom.makes}` : def.name, icon: def.icon, cost: custom.cost, tier: custom.tier, group: custom.group, makes: custom.makes, description: def.description });
        continue;
      }
      const tier = tierOf(def.id);
      list.push({ id: def.id, name: def.name, icon: def.icon, cost: TIER_COST[tier], tier, group: ['', 'Wood & stone', 'Iron', 'Gold', 'Crystal'][tier], description: def.description });
    }
    return list.sort((a, b) => a.tier - b.tier); // stable: keeps registration order inside a tier
  }
  function draw() {
    const mats = Object.entries(MATERIALS).map(([id, m]) => `${m.icon} ${m.name} <b>${have(id)}</b>`).join(' &nbsp; ');
    let html = `<div style="opacity:0.9;margin-bottom:6px">${mats}</div>
      <div style="opacity:0.6;font-size:12px;margin-bottom:10px">Mine trees and rocks with a pickaxe (hold click). Iron needs a stone pickaxe, gold an iron one, crystal a golden one. Gold starts ~120m from spawn, crystal ~250m. Mountains have more ore and crystal, sandy mesas more gold. Flip gravity (G) to mine the ceiling: stalactites, glowcaps (🍄 spores for medkits), ember vents (gold, stone pickaxe) and geodes (crystal, iron pickaxe).</div>`;
    let group = '';
    const words = searchEl.value.toLowerCase().split(/\s+/).filter(Boolean);
    const list = recipes().filter((r) => {
      const text = `${r.name} ${r.id} ${r.group} ${r.description || ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    if (!list.length) html += `<div style="opacity:0.6;padding:8px 2px">No recipes match.</div>`;
    for (const r of list) {
      if (r.group !== group) {
        group = r.group;
        html += `<div style="font:800 12px system-ui;letter-spacing:1px;color:#ffd23d;margin:10px 0 4px;text-transform:uppercase">${group}</div>`;
      }
      const ok = canPay(r.cost);
      const owned = have(r.id);
      html += `<button class="btn" data-craft="${r.id}" ${ok ? '' : 'disabled'} style="display:inline-flex;gap:6px;align-items:center;margin:3px;padding:5px 9px;font-size:13px">
        <span>${/^https?:|^\//.test(r.icon) ? '🔧' : r.icon}</span><span>${r.name}${owned ? ` (${owned})` : ''}</span><span style="opacity:0.9">${costText(r.cost)}</span></button>`;
    }
    bodyEl.innerHTML = html;
  }
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-craft]');
    if (!b || b.disabled) return;
    const r = recipes().find((x) => x.id === b.dataset.craft);
    if (!r || !canPay(r.cost)) return;
    for (const [m, k] of Object.entries(r.cost)) inventory.remove(m, k);
    const def = ITEMS.get(r.id);
    inventory.add({ id: r.id, name: def?.name || r.name, icon: def?.icon || r.icon, maxStack: def?.maxStack || 1, count: r.makes || 1 });
    game.chat(`⚒️ Crafted ${r.name}!`, true);
    draw();
  });
  function show() {
    open = true;
    panel.style.display = 'block';
    input.enabled = false;
    input.keys.clear();
    document.exitPointerLock?.();
    searchEl.value = '';
    draw();
    setTimeout(() => searchEl.focus(), 0); // just start typing to search
  }
  function close() {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
    searchEl.blur();
    input.enabled = true;
    if (game.player) input.requestLock();
  }
  window.addEventListener('keydown', (e) => {
    if (!survival() || !game.player) return;
    if (open && (e.code === 'Escape' || e.code === 'KeyC')) {
      e.stopImmediatePropagation();
      close();
    } else if (!open && e.code === 'KeyC' && input.enabled && !e.repeat && !game.spaceRpg?.ship?.piloting) {
      show();
    }
  });
  game.net.on('close', close);

  // ---------- No free items in survival ----------
  const inv = inventory;
  const spawnerParts = () => [inv.spawnerGrid, inv.spawnerGrid?.previousElementSibling, inv.spawnerGrid?.nextElementSibling];
  const spawnerClick = inv.spawnerClick.bind(inv);
  inv.spawnerClick = (...args) => (survival() ? undefined : spawnerClick(...args));

  // ---------- Per frame ----------
  game.addSystem((dt) => {
    root.visible = survival();
    if (!survival()) return;
    if (game.player) updateNodeChunks(game.player.position);
    for (const el of spawnerParts()) if (el && el.style.display !== 'none') el.style.display = 'none';
    for (const n of nodes) {
      if (n.respawn > 0) {
        n.respawn -= dt;
        if (n.respawn <= 0) {
          n.hp = NODES[n.kind].hp;
          n.g.visible = true;
          if (n.box) n.box.setFromCenterAndSize(new THREE.Vector3(n.g.position.x, n.g.position.y + 1.5, n.g.position.z), new THREE.Vector3(0.6, 3, 0.6));
        }
      }
      if (n.shake > 0) {
        n.shake -= dt;
        n.g.rotation.z = n.shake > 0 ? Math.sin(n.shake * 80) * 0.05 : 0;
      }
    }
  });

  return {
    start(code) {
      inventory.clear();
      inventory.add({ id: 'pickaxe-wood', name: 'Wooden Pickaxe', icon: '⛏️', maxStack: 1, count: 1 });
      inventory.select(0);
      spawnNodes(Number(code) || 1);
      game.chat('⛏️ SURVIVAL: no free items. Hold click on trees and rocks with your pickaxe to mine, then press C to craft weapons, blocks and torches. Monsters come out at night!', true);
    },
    open: show,
    close,
    get nodes() { return nodes; },
    // Load every resource chunk around a point right now (normally a few per frame as you move)
    loadResourcesAround(focus) {
      for (let i = 0; i < 60; i++) updateNodeChunks(focus);
    },
  };
}
