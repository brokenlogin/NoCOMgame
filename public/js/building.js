// Building: place 1m blocks on a grid. Works in both modes (in Creative the blocks are free in
// the Tab spawner and never run out; in Survival you craft them with C and they get used up).
//   Hold a block item and left-click to place it against whatever you're looking at.
//   Break blocks with a pickaxe (you get the block back).
// Blocks are shared with everyone in the room: { kind: 'bd:place', c: [x,y,z], t } and
// { kind: 'bd:break', c }. People who join late ask for the current builds ('bd:ask').
// Torches keep night monsters from spawning near them (survivalNight.js).

import * as THREE from 'three';
import { registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { itemTexture } from './itemTextures.js';

export const BLOCKS = {
  'block-wood': { name: 'Wood Planks', icon: '🟫', hp: 3, color: 0xb07a45, tex: 'wood', craft: { wood: 1 }, makes: 4 },
  'block-stone': { name: 'Stone Bricks', icon: '🧱', hp: 5, color: 0x9a9a9a, tex: 'grit', craft: { stone: 1 }, makes: 4 },
  'block-iron': { name: 'Iron Block', icon: '⬜', hp: 9, color: 0xd0d4dc, tex: 'brushed', craft: { iron: 1 }, makes: 2, tier: 1 },
  'block-glass': { name: 'Glass', icon: '🔲', hp: 2, color: 0xbfe8ff, glass: true, craft: { crystal: 1 }, makes: 6 },
  'block-torch': { name: 'Torch', icon: '🔥', hp: 1, color: 0xffb03a, torch: true, craft: { wood: 1, coal: 1 }, makes: 4 },
};

export function setupBuilding(game) {
  const { scene, world, net, inventory, camera } = game;
  const blocks = new Map(); // "x,y,z" -> { t, mesh, box, hp }
  const key = (c) => c.join(',');
  const root = new THREE.Group();
  scene.add(root);

  // ---------- Looks ----------
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const torchGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8);
  const flameGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const mats = {};
  for (const [id, b] of Object.entries(BLOCKS)) {
    mats[id] = b.glass
      ? new THREE.MeshStandardMaterial({ color: b.color, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 })
      : b.torch
        ? new THREE.MeshStandardMaterial({ color: 0x6a4020, roughness: 0.8 })
        : new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.75, metalness: b.tex === 'brushed' ? 0.6 : 0.05, map: b.tex === 'wood' ? itemTexture('wood') : null, bumpMap: itemTexture(b.tex), bumpScale: 0.8 });
  }
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xff8a20, emissiveIntensity: 3 });

  function makeMesh(t) {
    const b = BLOCKS[t];
    if (b.torch) {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(torchGeo, mats[t]);
      stick.position.y = -0.15;
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 0.28;
      g.add(stick, flame);
      return g;
    }
    const m = new THREE.Mesh(geo, mats[t]);
    m.castShadow = !b.glass;
    m.receiveShadow = true;
    return m;
  }

  // ---------- Place / break ----------
  function place(c, t, send = true) {
    const k = key(c);
    if (blocks.has(k) || !BLOCKS[t]) return false;
    const mesh = makeMesh(t);
    mesh.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5);
    mesh.updateMatrixWorld(true);
    mesh.traverse((o) => (o.userData.blockCell = c));
    root.add(mesh);
    const solid = !BLOCKS[t].torch;
    let box = null;
    if (solid) {
      world.colliders.push(mesh);
      box = new THREE.Box3(new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(c[0] + 1, c[1] + 1, c[2] + 1));
      world.solidBoxes.push(box);
    }
    blocks.set(k, { c, t, mesh, box, hp: BLOCKS[t].hp });
    if (send) net.sendEvent({ kind: 'bd:place', c, t });
    return true;
  }
  function remove(c, send = true) {
    const k = key(c);
    const b = blocks.get(k);
    if (!b) return null;
    root.remove(b.mesh);
    const i = world.colliders.indexOf(b.mesh);
    if (i >= 0) world.colliders.splice(i, 1);
    if (b.box) {
      const j = world.solidBoxes.indexOf(b.box);
      if (j >= 0) world.solidBoxes.splice(j, 1);
    }
    blocks.delete(k);
    if (send) net.sendEvent({ kind: 'bd:break', c });
    return b;
  }
  // A pickaxe swing landed on a block. Returns true when it broke.
  function hit(c, pickTier = 0) {
    const b = blocks.get(key(c));
    if (!b) return false;
    if ((BLOCKS[b.t].tier || 0) > pickTier) {
      game.chat('⛏️ Iron blocks need a stone pickaxe or better.', true);
      return false;
    }
    b.hp--;
    b.mesh.scale.setScalar(0.92);
    setTimeout(() => b.mesh.scale.setScalar(1), 80);
    if (b.hp > 0) return false;
    remove(c);
    const d = BLOCKS[b.t];
    inventory.add({ id: b.t, name: d.name, icon: d.icon, maxStack: 99, count: 1 });
    return true;
  }
  // Explosions (night monsters) knock blocks out
  function blast(p, r) {
    for (const b of [...blocks.values()]) {
      const center = new THREE.Vector3(b.c[0] + 0.5, b.c[1] + 0.5, b.c[2] + 0.5);
      if (center.distanceTo(p) < r && b.t !== 'block-iron') remove(b.c);
    }
  }

  // ---------- Network ----------
  net.on('event', (msg) => {
    if (msg.kind === 'bd:place' && Array.isArray(msg.c)) place(msg.c.map((n) => Math.round(n)), msg.t, false);
    else if (msg.kind === 'bd:break' && Array.isArray(msg.c)) remove(msg.c.map((n) => Math.round(n)), false);
    else if (msg.kind === 'bd:ask' && blocks.size) {
      // Someone new: send them what's built (in chunks so messages stay small)
      const all = [...blocks.values()].map((b) => [...b.c, Object.keys(BLOCKS).indexOf(b.t)]);
      for (let i = 0; i < all.length; i += 300) net.sendEvent({ kind: 'bd:list', to: msg.from, list: all.slice(i, i + 300) });
    } else if (msg.kind === 'bd:list' && msg.to === net.id && Array.isArray(msg.list)) {
      const ids = Object.keys(BLOCKS);
      for (const [x, y, z, ti] of msg.list) if (ids[ti]) place([x, y, z], ids[ti], false);
    }
  });
  net.on('welcome', () => {
    for (const b of [...blocks.values()]) remove(b.c, false);
    setTimeout(() => net.sendEvent({ kind: 'bd:ask' }), 800);
  });

  // ---------- Block items ----------
  const ray = new THREE.Raycaster();
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  // Where would a block go? (against the face you're looking at, within reach)
  function targetCell() {
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    ray.set(_o, _d);
    ray.far = 6;
    const hitObj = ray.intersectObjects(world.colliders, false)[0];
    if (!hitObj) return null;
    const n = hitObj.face ? hitObj.face.normal.clone().transformDirection(hitObj.object.matrixWorld) : _d.clone().negate();
    const p = hitObj.point.clone().addScaledVector(n, 0.5);
    return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
  }
  function blockedByPlayer(c) {
    const p = game.player.position;
    const r = game.CONFIG.playerRadius;
    return p.x + r > c[0] && p.x - r < c[0] + 1 && p.z + r > c[2] && p.z - r < c[2] + 1 && p.y + game.CONFIG.playerHeight > c[1] && p.y < c[1] + 1;
  }
  for (const [id, b] of Object.entries(BLOCKS)) {
    registerItemModel(id, (T) => {
      const m = makeMesh(id);
      m.scale.setScalar(0.25);
      const g = new T.Group();
      g.add(m);
      return g;
    });
    registerItem({
      id,
      name: b.name,
      icon: b.icon,
      maxStack: 99,
      cooldown: 0.18,
      description: `${b.torch ? 'Lights the night and keeps monsters away. ' : ''}Left-click to place. Break with a pickaxe.`,
      use() {
        const c = targetCell();
        if (!c || blocks.has(key(c)) || (!b.torch && blockedByPlayer(c))) return false;
        if (!place(c, id)) return false;
        if (game.mode === 'survival') inventory.remove(id, 1);
        return true;
      },
    });
  }

  // Ghost outline where the block will go
  const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  ghost.visible = false;
  scene.add(ghost);
  game.addSystem(() => {
    const sel = inventory.getSelected();
    const c = sel && BLOCKS[sel.id] && !game.space?.inSpace() ? targetCell() : null;
    ghost.visible = !!c && !blocks.has(key(c));
    if (ghost.visible) ghost.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5);
    const t = performance.now() / 1000;
    flameMat.emissiveIntensity = 2.6 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7) * 0.3;
  });

  return {
    BLOCKS,
    place,
    remove,
    hit,
    blast,
    meshes: () => root.children,
    torches: () => [...blocks.values()].filter((b) => BLOCKS[b.t].torch).map((b) => b.mesh.position),
    get count() { return blocks.size; },
    has: (c) => blocks.has(key(c)),
  };
}
