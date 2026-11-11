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
};

// What each kind of node looks like, how tough it is, what it drops, which pickaxe it needs
const NODES = {
  tree: { hp: 4, tier: 0, drops: { wood: [3, 5] } },
  stone: { hp: 4, tier: 0, drops: { stone: [2, 4] } },
  coal: { hp: 5, tier: 0, drops: { coal: [2, 3], stone: [0, 1] } },
  iron: { hp: 6, tier: 1, drops: { iron: [2, 3], stone: [0, 1] } },
  gold: { hp: 7, tier: 2, drops: { gold: [1, 2] } },
  crystal: { hp: 8, tier: 3, drops: { crystal: [1, 2] } },
};

const PICKAXES = [
  { id: 'pickaxe-wood', name: 'Wooden Pickaxe', tier: 0, speed: 0.45, color: 0x8a5a2a, cost: {} },
  { id: 'pickaxe-stone', name: 'Stone Pickaxe', tier: 1, speed: 0.36, color: 0x8a8a8a, cost: { wood: 3, stone: 6 } },
  { id: 'pickaxe-iron', name: 'Iron Pickaxe', tier: 2, speed: 0.28, color: 0xd0d4dc, cost: { wood: 3, iron: 6 } },
  { id: 'pickaxe-gold', name: 'Golden Pickaxe', tier: 3, speed: 0.2, color: 0xffc23a, cost: { iron: 3, gold: 6 } },
];
const TIER_NAMES = ['Any pickaxe', 'Stone pickaxe', 'Iron pickaxe', 'Golden pickaxe'];

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
    registerItemModel(p.id, (T) => {
      const g = new T.Group();
      const handle = new T.Mesh(new T.CylinderGeometry(0.02, 0.025, 0.5, 8), new T.MeshStandardMaterial({ color: 0x6a4020, roughness: 0.8 }));
      handle.position.y = 0.1;
      const head = new T.Mesh(new T.BoxGeometry(0.32, 0.05, 0.06), new T.MeshStandardMaterial({ color: p.color, metalness: p.tier ? 0.6 : 0.1, roughness: 0.4 }));
      head.position.y = 0.34;
      for (const s of [-1, 1]) {
        const tip = new T.Mesh(new T.ConeGeometry(0.03, 0.1, 6), head.material);
        tip.rotation.z = (s * Math.PI) / 2;
        tip.position.set(s * 0.2, 0.34, 0);
        g.add(tip);
      }
      g.add(handle, head);
      return g;
    });
    registerItem({
      id: p.id,
      name: p.name,
      icon: '⛏️',
      description: `Hold click on trees and rocks to mine. Mines: ${['wood, stone, coal', '+ iron', '+ gold', '+ crystal'][p.tier]}.`,
      anim: 'swing',
      hold(ctx, dt, state) {
        state.t = (state.t ?? 0) - dt;
        if (state.t > 0) return;
        state.t = p.speed;
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
    iron: new THREE.MeshStandardMaterial({ color: 0xd99a6a, roughness: 0.4, metalness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffd23d, roughness: 0.25, metalness: 0.9, emissive: 0x4a3000 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x7ae8ff, roughness: 0.1, emissive: 0x2a9aff, emissiveIntensity: 1.2 }),
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
  function lumpy(r, rnd) {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const s = 0.8 + rnd() * 0.35;
      pos.setXYZ(k, pos.getX(k) * s, pos.getY(k) * s * 0.75, pos.getZ(k) * s);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, M.rock);
  }
  function build(kind, rnd) {
    const g = new THREE.Group();
    if (kind === 'tree') {
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
      const rock = lumpy(0.9 + rnd() * 0.5, rnd);
      rock.position.y = 0.5;
      g.add(rock);
      if (kind !== 'stone') {
        for (let k = 0; k < (kind === 'crystal' ? 7 : 6); k++) {
          const geo = kind === 'crystal' || kind === 'gold' ? new THREE.OctahedronGeometry(0.2 + rnd() * 0.15, 0) : new THREE.IcosahedronGeometry(0.18, 0);
          const c = new THREE.Mesh(geo, M[kind]);
          const dir = new THREE.Vector3(rnd() - 0.5, rnd() * 0.7, rnd() - 0.5).normalize();
          c.position.copy(dir).multiplyScalar(0.95).setY(0.5 + dir.y * 0.8);
          if (kind === 'crystal') c.scale.y = 2;
          g.add(c);
        }
      }
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    return g;
  }
  function spawnNodes(seed) {
    for (const n of nodes) root.remove(n.g);
    nodes.length = 0;
    const rnd = rng(seed * 7919 + 13);
    for (let i = 0; i < 220; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 14 + Math.sqrt(rnd()) * 180;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (voidAmount(x, z) > 0.01) continue; // not over a chasm
      const r = rnd();
      // Rarer stuff further from spawn
      const kind = r < 0.36 ? 'tree' : r < 0.6 ? 'stone' : r < 0.75 ? 'coal' : r < 0.88 ? 'iron' : r < 0.96 ? (d > 50 ? 'gold' : 'iron') : d > 80 ? 'crystal' : 'coal';
      const g = build(kind, rnd);
      g.position.set(x, world.terrain.groundHeight(x, z) - 0.1, z);
      g.rotation.y = rnd() * Math.PI * 2;
      root.add(g);
      const n = { g, kind, hp: NODES[kind].hp, respawn: 0, shake: 0 };
      g.traverse((o) => (o.userData.node = n));
      if (kind === 'tree') {
        n.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, g.position.y + 1.5, z), new THREE.Vector3(0.6, 3, 0.6));
        world.solidBoxes.push(n.box);
      }
      nodes.push(n);
    }
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
  function mineAt(origin, dir, pick) {
    ray.set(origin, dir);
    ray.far = 5;
    const hit = ray.intersectObjects([...nodes.filter((n) => n.g.visible).map((n) => n.g), ...(game.building?.meshes() || [])], true)[0];
    if (!hit) return;
    if (hit.object.userData.blockCell) {
      game.building.hit(hit.object.userData.blockCell, pick.tier);
      thunk('stone');
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
  let open = false;
  const have = (id) => inventory.count(id);
  const canPay = (cost) => Object.entries(cost).every(([m, k]) => have(m) >= k);
  const costText = (cost) => Object.entries(cost).map(([m, k]) => `<span style="color:${have(m) >= k ? '#9fe8a8' : '#ff9a8a'}">${MATERIALS[m].icon}${k}</span>`).join(' ') || 'free';
  function recipes() {
    const list = PICKAXES.slice(1).map((p) => ({ id: p.id, name: p.name, icon: '⛏️', cost: p.cost, tier: 0, group: 'Pickaxes' }));
    for (const [id, b] of Object.entries(BLOCKS)) list.push({ id, name: `${b.name} ×${b.makes}`, icon: b.icon, cost: b.craft, tier: 0.5, group: 'Building', makes: b.makes });
    for (const def of ITEMS.values()) {
      if (NOT_CRAFTABLE.has(def.id)) continue;
      const tier = tierOf(def.id);
      list.push({ id: def.id, name: def.name, icon: def.icon, cost: TIER_COST[tier], tier, group: ['', 'Wood & stone', 'Iron', 'Gold', 'Crystal'][tier] });
    }
    return list.sort((a, b) => a.tier - b.tier); // stable: keeps registration order inside a tier
  }
  function draw() {
    const mats = Object.entries(MATERIALS).map(([id, m]) => `${m.icon} ${m.name} <b>${have(id)}</b>`).join(' &nbsp; ');
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font:800 18px system-ui">⚒️ Crafting</div><button class="btn" data-close style="padding:4px 10px">✕</button></div>
      <div style="opacity:0.9;margin-bottom:6px">${mats}</div>
      <div style="opacity:0.6;font-size:12px;margin-bottom:10px">Mine trees and rocks with a pickaxe (hold click). Iron needs a stone pickaxe, gold an iron one, crystal a golden one. Rarer rocks are further from spawn.</div>`;
    let group = '';
    for (const r of recipes()) {
      if (r.group !== group) {
        group = r.group;
        html += `<div style="font:800 12px system-ui;letter-spacing:1px;color:#ffd23d;margin:10px 0 4px;text-transform:uppercase">${group}</div>`;
      }
      const ok = canPay(r.cost);
      const owned = have(r.id);
      html += `<button class="btn" data-craft="${r.id}" ${ok ? '' : 'disabled'} style="display:inline-flex;gap:6px;align-items:center;margin:3px;padding:5px 9px;font-size:13px">
        <span>${/^https?:|^\//.test(r.icon) ? '🔧' : r.icon}</span><span>${r.name}${owned ? ` (${owned})` : ''}</span><span style="opacity:0.9">${costText(r.cost)}</span></button>`;
    }
    panel.innerHTML = html;
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
    draw();
  }
  function close() {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
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
  };
}
