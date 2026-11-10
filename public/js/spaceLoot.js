// Loot for the space RPG: enemies and bosses drop glowing crates with credits, materials and
// gear. Gear is weapons (they change how your main laser fires) and modules (stat boosts),
// rolled with a rarity (common / rare / epic / legendary) and random stat lines; legendaries
// also get a perk. Equip it in the journal (J → Gear). Your ship has 1-3 module slots.
// Also here: the refinery (crafting at stations) and the tractor beam's pull.
//
// api.loot.drop(pos, { rarity, count, material }) · api.loot.rollDrop(pos, enemyInfo)
// api.loot.give(rarity | { rarity, slot }) · api.loot.totals() (used by applyStats)

import * as THREE from 'three';
import { GEAR, GEAR_IDS, RARITY, STAT_LINES, PERKS, PERK_IDS, RECIPES, MATERIALS, SHIPS } from './spaceData.js';

const WEAPON_LINES = ['dmg', 'rate', 'crit'];
const MODULE_LINES = { shield: 'shield', hull: 'hull', speed: 'speed', boost: 'boost', crit: 'crit', luck: 'luck', rate: 'rate' };
const MAX_GEAR = 40;

export function setupLoot(api) {
  const { game, fx, hud, ship } = api;
  const { scene } = game;
  const st = () => api.st;

  // ---------- Rolling gear ----------
  function rollRarity(luck = 0, min = 0) {
    const r = Math.random() * (1 - Math.min(0.6, luck * 0.5));
    let idx = r < 0.02 ? 3 : r < 0.12 ? 2 : r < 0.4 ? 1 : 0;
    return Math.max(idx, min);
  }
  function rollGear(level, rarity, slot) {
    const ids = GEAR_IDS.filter((id) => !slot || GEAR[id].slot === slot);
    const base = ids[Math.floor(Math.random() * ids.length)];
    const g = GEAR[base];
    const R = RARITY[rarity];
    const pool = g.slot === 'weapon' ? [...WEAPON_LINES] : [MODULE_LINES[g.stat] || 'hull', ...Object.keys(STAT_LINES).filter((k) => k !== g.stat)];
    const lines = {};
    for (let i = 0; i < R.stats && pool.length; i++) {
      const k = g.slot === 'module' && i === 0 ? pool.shift() : pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const L = STAT_LINES[k];
      const v = (L.min + Math.random() * (L.max - L.min)) * R.mult * (1 + 0.04 * (level - 1)) * (g.slot === 'module' && i === 0 ? 1.6 : 1);
      lines[k] = Math.round(v * 10) / 10;
    }
    const s = st();
    const item = { uid: s.nextUid++, base, slot: g.slot, rarity, level, lines };
    if (rarity === 3) item.perk = PERK_IDS[Math.floor(Math.random() * PERK_IDS.length)];
    item.name = `${rarity === 3 ? PERKS[item.perk].name : R.name} ${g.name}`;
    return item;
  }
  function describe(item) {
    const g = GEAR[item.base];
    const lines = Object.entries(item.lines).map(([k, v]) => `+${v}% ${STAT_LINES[k].name}`);
    if (g.slot === 'weapon') lines.unshift(`${g.mode} fire · ×${g.dmg} damage · ×${g.rate} fire rate`);
    if (item.perk) lines.push(`★ ${PERKS[item.perk].name}: ${PERKS[item.perk].desc}`);
    return lines.join(' · ');
  }
  function addGear(item, quiet = false) {
    const s = st();
    if (s.gear.length >= MAX_GEAR) {
      // Full: turn the worst unequipped item into credits
      const eq = equippedUids();
      const worst = s.gear.filter((g) => !eq.has(g.uid)).sort((a, b) => a.rarity - b.rarity || a.level - b.level)[0];
      if (worst) salvage(worst.uid, true);
    }
    s.gear.push(item);
    const R = RARITY[item.rarity];
    if (!quiet) {
      hud.toast(`${GEAR[item.base].icon} ${item.name} (Lv ${item.level})`, R.color);
      game.chat(`🎁 Found: ${item.name} (Lv ${item.level}): ${describe(item)}. Equip it in your journal (J → Gear).`, true);
      fx.sfx(item.rarity >= 2 ? 'achievement' : 'pickup');
    }
    if (item.rarity === 3) {
      api.achieve('legend');
      api.announce(`🌟 found a LEGENDARY ${item.name}!`);
    }
    api.save();
    return item;
  }
  function give(spec) {
    const o = typeof spec === 'string' ? { rarity: spec } : spec || {};
    const rarity = typeof o.rarity === 'number' ? o.rarity : Math.max(0, RARITY.findIndex((r) => r.id === o.rarity));
    return addGear(rollGear(api.level(), rarity, o.slot));
  }

  // ---------- Equipment ----------
  const slots = () => SHIPS[st().ship]?.slots || 1;
  function equippedUids() {
    const e = st().equipped;
    return new Set([e.weapon, ...(e.modules || [])].filter(Boolean));
  }
  const byUid = (uid) => st().gear.find((g) => g.uid === uid);
  function equip(uid) {
    const item = byUid(uid);
    if (!item) return;
    const e = st().equipped;
    if (item.slot === 'weapon') e.weapon = uid;
    else {
      e.modules = (e.modules || []).filter((u) => byUid(u));
      if (e.modules.includes(uid)) return;
      if (e.modules.length >= slots()) e.modules.shift();
      e.modules.push(uid);
    }
    api.applyStats();
    api.save();
  }
  function unequip(uid) {
    const e = st().equipped;
    if (e.weapon === uid) e.weapon = null;
    e.modules = (e.modules || []).filter((u) => u !== uid);
    api.applyStats();
    api.save();
  }
  function salvage(uid, quiet = false) {
    const item = byUid(uid);
    if (!item) return;
    unequip(uid);
    const s = st();
    s.gear = s.gear.filter((g) => g !== item);
    const credits = Math.round(40 * (item.rarity + 1) ** 2 * (1 + 0.1 * item.level));
    const scrap = (item.rarity + 1) * 2;
    s.credits += credits;
    s.cargo.scrap = (s.cargo.scrap || 0) + scrap;
    if (!quiet) hud.toast(`♻ Salvaged ${item.name}: +${credits} cr, +${scrap} scrap`, '#bfe8ff');
    api.save();
  }
  // Everything the equipped gear adds up to (percent stat lines, weapon, perks)
  function totals() {
    const out = { weapon: { mode: 'twin', dmg: 1, rate: 1 }, perks: {} };
    const e = st()?.equipped;
    if (!e) return out;
    const mods = (e.modules || []).slice(0, slots());
    for (const uid of [e.weapon, ...mods]) {
      const item = byUid(uid);
      if (!item) continue;
      for (const [k, v] of Object.entries(item.lines)) out[k] = (out[k] || 0) + v;
      if (item.perk) out.perks[item.perk] = true;
      if (item.slot === 'weapon') {
        const g = GEAR[item.base];
        out.weapon = { mode: g.mode, dmg: g.dmg, rate: g.rate };
      }
    }
    return out;
  }

  // ---------- Crates in space ----------
  const crates = [];
  const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  function spawnCrate(p, contents) {
    if (crates.length > 50) removeCrate(crates[0]);
    const color = contents.gear != null ? RARITY[contents.gear].color : contents.material ? '#5fe8ff' : '#ffd23d';
    const g = new THREE.Group();
    g.add(new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({ color: 0x3a3e46, emissive: color, emissiveIntensity: 0.6, metalness: 0.5 })));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(contents.gear >= 2 ? 7 : 4.5);
    g.add(halo);
    g.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
    scene.add(g);
    crates.push({ g, contents, life: 150, vel: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), color });
  }
  function removeCrate(c) {
    scene.remove(c.g);
    crates.splice(crates.indexOf(c), 1);
  }
  function collect(c) {
    const k = c.contents;
    if (k.credits) {
      api.reward(k.credits, 0, true);
      hud.toast(`💰 +${k.credits} credits`, '#ffd23d');
    }
    if (k.material) api.gain(k.material, k.n || 1);
    if (k.gear != null) addGear(rollGear(api.level(), k.gear, k.slot));
    else fx.sfx('pickup');
    fx.sparks(c.g.position, new THREE.Color(c.color).getHex(), 10);
    removeCrate(c);
  }
  function drop(p, { rarity, count = 1, material } = {}) {
    const r = typeof rarity === 'number' ? rarity : Math.max(0, RARITY.findIndex((x) => x.id === rarity));
    for (let i = 0; i < count; i++) spawnCrate(p, { gear: i === 0 ? r : rollRarity(api.luck, Math.max(0, r - 1)) });
    if (material) spawnCrate(p, { material, n: 4 + Math.floor(Math.random() * 6) });
    spawnCrate(p, { credits: 100 * count + Math.round(Math.random() * 200) });
  }
  // A normal enemy died: maybe drop something
  function rollDrop(p, e = {}) {
    const luck = (api.luck || 0) + (e.luck || 0);
    if (e.rarity) {
      drop(p, { rarity: e.rarity, count: 1 });
      return;
    }
    if (Math.random() < 0.07 + luck * 0.15) spawnCrate(p, { gear: rollRarity(luck) });
    else if (Math.random() < 0.2) {
      const mat = { nebula: 'plasma', cryo: 'ice', scrap: 'scrap', rift: 'void', home: 'iron' }[e.sector] || 'iron';
      spawnCrate(p, { material: mat, n: 1 + Math.floor(Math.random() * 3) });
    } else if (Math.random() < 0.25) spawnCrate(p, { credits: 15 + Math.round(Math.random() * 40) });
  }
  // Tractor beam (held R): pull crates in front of the ship toward it
  function tractor(p, dir, dt) {
    for (const c of crates) {
      const rel = c.g.position.clone().sub(p);
      const d = rel.length();
      if (d > 150 || rel.angleTo(dir) > 0.5) continue;
      c.vel.lerp(rel.multiplyScalar(-1).setLength(60), Math.min(1, dt * 3));
    }
  }

  api.frame.push((dt, ctx) => {
    const reach = 14 * (ship.stats.magnet || 1);
    for (const c of [...crates]) {
      c.life -= dt;
      c.g.position.addScaledVector(c.vel, dt);
      c.vel.multiplyScalar(1 - dt * 0.8);
      c.g.rotation.x += dt;
      c.g.rotation.y += dt * 1.3;
      if (c.life <= 0) {
        removeCrate(c);
        continue;
      }
      const at = ship.piloting ? ship.position : ctx.player.position;
      const d = c.g.position.distanceTo(at);
      if (d < (ship.piloting ? reach : 2.5)) collect(c);
      else if (ship.piloting && d < reach * 3) c.vel.lerp(at.clone().sub(c.g.position).setLength(40), Math.min(1, dt * 2)); // magnet
    }
  });
  api.blipSources.push((out) => {
    for (const c of crates) out.push({ p: c.g.position, kind: 'loot', size: 0.7 });
  });

  // ---------- Refinery (crafting at stations) ----------
  api.services.refinery = {
    label: '⚗️ Refinery (crafting)',
    open(n, note = '') {
      const s = st();
      const opts = RECIPES.map((r) => {
        const cost = Object.entries(r.cost).map(([m, k]) => `${k} ${MATERIALS[m].icon}`).join(' ');
        const can = Object.entries(r.cost).every(([m, k]) => (s.cargo[m] || 0) >= k) && s.credits >= r.credits;
        return [`${r.name}: ${cost} + ${r.credits} cr`, () => {
          for (const [m, k] of Object.entries(r.cost)) s.cargo[m] -= k;
          s.credits -= r.credits;
          const gv = r.gives;
          if (gv.kits) {
            s.kits += gv.kits;
            ship.kits = s.kits;
          }
          if (gv.ammo) ship.refillAmmo();
          if (gv.gear) give({ rarity: gv.gear, slot: gv.slot });
          fx.sfx('repair');
          api.save();
          api.services.refinery.open(n, `Crafted: ${r.name}.`);
        }, !can, r.desc];
      });
      const have = Object.entries(MATERIALS).map(([id, m]) => `${m.icon}${s.cargo[id] || 0}`).join(' ');
      api.openDialog(`${n.name} · Refinery`, `${note ? `${note}\n` : ''}Your materials: ${have} · ${s.credits} cr`, [...opts, ['Back', () => api.talk(n)]]);
    },
  };
  for (const id of ['juno', 'quill', 'rin', 'mags', 'tov']) api.npc(id)?.services.push('refinery');

  // ---------- Journal: gear ----------
  const ui = api.journal.ui;
  api.journal.addTab('gear', '🎒 Gear', (el) => {
    const s = st();
    const eq = equippedUids();
    const row = (item, equipped) => {
      const R = RARITY[item.rarity];
      return ui.card(`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div><b style="color:${R.color}">${GEAR[item.base].icon} ${ui.esc(item.name)}</b> <span style="opacity:0.6;font-size:12px">Lv ${item.level} · ${item.slot}</span>
        <div style="opacity:0.85;font-size:12px">${ui.esc(describe(item))}</div></div>
        <div style="white-space:nowrap">${equipped ? ui.btn('unequip', item.uid, 'Unequip') : ui.btn('equip', item.uid, 'Equip')}${ui.btn('salvage', item.uid, 'Salvage')}</div></div>`, `${R.color}66`);
    };
    let html = ui.section(`Equipped · ${SHIPS[s.ship].name} has 1 weapon + ${slots()} module slot${slots() > 1 ? 's' : ''}`);
    const w = byUid(s.equipped.weapon);
    html += w ? row(w, true) : ui.h('div', 'opacity:0.6;margin-bottom:6px', 'Weapon: standard twin lasers');
    const mods = (s.equipped.modules || []).map(byUid).filter(Boolean);
    html += mods.length ? mods.map((m) => row(m, true)).join('') : ui.h('div', 'opacity:0.6', 'No modules fitted');
    html += ui.section(`Hold · ${s.gear.length}/${MAX_GEAR}`);
    const rest = s.gear.filter((g) => !eq.has(g.uid)).sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    html += rest.length ? rest.map((g) => row(g, false)).join('') : ui.h('div', 'opacity:0.6', 'Nothing yet. Enemies drop glowing crates; bosses drop the best stuff. You can also forge gear at a refinery.');
    el.innerHTML = html;
  }, (act, v) => {
    const uid = Number(v);
    if (act === 'equip') equip(uid);
    if (act === 'unequip') unequip(uid);
    if (act === 'salvage') salvage(uid);
  });

  return { totals, drop, rollDrop, give, tractor, describe, equip, unequip, salvage, cargoBonus: () => 0, get crates() { return crates; } };
}
