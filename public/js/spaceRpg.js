// The space RPG, on top of Station NoCOM (space.js).
//
// Walk up to the crew and press E to talk. They give missions, run shops (shipyard, upgrades,
// weapons, market, repairs, job boards...) and tell you things. J opens your journal.
//
// How the pieces fit (each file says more):
//   spaceRpg.js      this file: saved progress, crew, the quest engine, HUD panel, E actions
//   spaceData.js     numbers and names (ships, upgrades, loot, skills, sectors...)
//   spaceQuests.js   the story, side quests and job board contracts
//   spaceShops.js    what the crew's services do (shipyard, market, ...)
//   spaceJournal.js  the J menu
//   spaceShip.js     your starship · spaceWorld.js  Kepler Reach (Belt, Erebus, Mothership)
//   spaceFx.js / spaceHud.js  explosions, sounds, radar and other HUD bits
//
// Progress is saved in this browser (localStorage, per player name). Big moments are announced
// to the room with { kind: 'sp:announce', text }.
//
// Other modules hook in through `api` (game.spaceRpg.api): api.addNpc, api.emit(event),
// api.actions.push(fn), api.blipSources.push(fn), api.targetSources.push(fn), api.frame.push(fn).

import * as THREE from 'three';
import { teleport } from './mgShared.js';
import { createCapsuleMesh, animateCharacter } from './capsule.js';
import { setupShip } from './spaceShip.js';
import { createSpaceWorld, LOC } from './spaceWorld.js';
import { createSpaceFx } from './spaceFx.js';
import { createSpaceHud } from './spaceHud.js';
import { buildQuests } from './spaceQuests.js';
import { setupShops } from './spaceShops.js';
import { setupJournal } from './spaceJournal.js';
import { setupSectors } from './spaceSectors.js';
import * as D from './spaceData.js';

const ARRIVE = new THREE.Vector3(0, 30.5, -382);
const MARK_Y = 3.15; // height of the ! / ? over a crew member's head

// Floating text (a sprite, so it always faces you and never clips into anything).
// lines: [{ text, size (px), color, bold }]. ~0.0042m per canvas pixel.
export function makeLabel(lines, { scale = 0.0042, bg = 'rgba(8,14,26,0.72)' } = {}) {
  const pad = 16;
  const font = (l) => `${l.bold ? 700 : 600} ${l.size}px system-ui, sans-serif`;
  const ctx0 = document.createElement('canvas').getContext('2d');
  let w = 0;
  for (const l of lines) {
    ctx0.font = font(l);
    w = Math.max(w, ctx0.measureText(l.text).width);
  }
  const W = Math.ceil(w + pad * 2);
  const H = Math.ceil(lines.reduce((h, l) => h + l.size * 1.25, 0) + pad);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 18);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = pad / 2;
  for (const l of lines) {
    ctx.font = font(l);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, W / 2, y + (l.size * 1.25) / 2);
    y += l.size * 1.25;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0); // anchored at the bottom middle
  sprite.scale.set(W * scale, H * scale, 1);
  return sprite;
}

// A glowing ! or ? bubble
function makeMarker(ch, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '800 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(ch, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.5, 0.5, 1);
  return sprite;
}

export function setupSpaceRpg(game) {
  const { scene, net, input, camera } = game;
  const api = { game, D, LOC, actions: [], blipSources: [], targetSources: [], frame: [], services: {}, npcs: [] };

  // ---------- Saved progress ----------
  const fresh = () => ({
    v: 2, credits: 0, xp: 0,
    story: 0, quests: {}, done: {}, focus: null, job: null, jobsDone: 0, jobsTaken: {},
    cargo: {}, goods: {}, ships: ['sparrow'], ship: 'sparrow',
    upgrades: { engine: 0, lasers: 0, hull: 0, shields: 0 },
    secondaries: ['missiles'], secondary: 'missiles', kits: 2,
    gear: [], equipped: { weapon: null, modules: [] }, nextUid: 1,
    skills: {}, rep: { command: 10, talon: -30, scav: 0, hive: -60 },
    codex: [], achievements: [], title: '',
    cosmetics: { paint: 'default', trail: 'none', hat: 'none' },
    owned: { paints: ['default'], trails: ['none'], hats: ['none'] },
    visited: ['home'], gates: ['home'], flags: {}, times: {}, buffs: {},
    stats: { kills: 0, mined: 0, deaths: 0, arenaKills: 0, diceWon: 0, golds: {} },
  });
  let st = fresh();
  let saveKey = null;
  // Old (v1) saves: one linear quest list, ore in the hold, three upgrade lines
  function migrate(raw) {
    if (raw.v >= 2) return raw;
    const s = fresh();
    s.credits = raw.credits || 0;
    s.xp = raw.xp || 0;
    s.upgrades = { ...s.upgrades, ...(raw.upgrades || {}) };
    s.cargo.ore = raw.ore || 0;
    s.title = raw.title || '';
    s.jobsDone = raw.bounties || 0;
    const ids = ['training', 'mining', 'pirates', 'delivery', 'derelict', 'mothership'];
    s.story = Math.min(raw.quest || 0, ids.length);
    if (s.story < ids.length && raw.stage && raw.stage !== 'offer') {
      s.quests[ids[s.story]] = { step: raw.stage === 'turnin' ? 99 : ids[s.story] === 'training' ? 1 : 0, progress: raw.progress || 0, stage: raw.stage };
    }
    if (s.story >= ids.length) s.achievements.push('mother');
    return s;
  }
  function load(name) {
    saveKey = `nocom.spaceRpg.${name}`;
    try {
      const raw = JSON.parse(localStorage.getItem(saveKey) || '{}');
      const base = fresh();
      const m = raw && Object.keys(raw).length ? migrate(raw) : base;
      st = { ...base, ...m, stats: { ...base.stats, ...m.stats }, owned: { ...base.owned, ...m.owned }, cosmetics: { ...base.cosmetics, ...m.cosmetics }, rep: { ...base.rep, ...m.rep }, upgrades: { ...base.upgrades, ...m.upgrades } };
    } catch {
      st = fresh();
    }
    api.st = st;
    jobCache = null;
    applyStats();
  }
  function save() {
    try {
      if (saveKey) localStorage.setItem(saveKey, JSON.stringify(st));
    } catch {}
  }
  const level = () => D.levelFor(st.xp);
  const skill = (id) => st.skills[id] || 0;

  function announce(text) {
    game.chat(text, true);
    net.sendEvent({ kind: 'sp:announce', text: `${game.player?.name || 'Someone'}: ${text}`.slice(0, 140) });
  }
  net.on('event', (msg) => {
    if (msg.kind === 'sp:announce' && typeof msg.text === 'string') game.chat(`🚀 ${msg.text.slice(0, 140)}`, true);
  });

  function reward(credits, xp, quiet = false) {
    const before = level();
    st.credits += Math.round(credits);
    st.xp += Math.round(xp);
    if ((credits || xp) && !quiet) game.chat(`+${Math.round(credits)} credits · +${Math.round(xp)} XP`, true);
    if (credits > 0) fx.sfx('coin');
    if (level() > before) {
      fx.sfx('levelUp');
      hud.banner(`LEVEL ${level()}`, level() < D.MAX_LEVEL ? 'New skill point! Spend it in your journal (J → Pilot)' : 'Max level!', '#ffd23d');
      announce(`⭐ reached pilot level ${level()}!`);
      applyStats();
      ship.repair();
      if (level() >= D.MAX_LEVEL) achieve('lvl30');
    }
    if (st.credits >= 10000) achieve('rich');
    save();
  }
  function rep(faction, delta) {
    if (!delta || st.rep[faction] == null) return;
    const before = D.standing(st.rep[faction]);
    st.rep[faction] = Math.max(-100, Math.min(100, st.rep[faction] + delta));
    const after = D.standing(st.rep[faction]);
    if (after !== before) hud.toast(`${D.FACTIONS[faction].name}: now ${after}`, D.FACTIONS[faction].color);
  }
  function achieve(id) {
    if (st.achievements.includes(id)) return;
    const a = D.ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    st.achievements.push(id);
    fx.sfx('achievement');
    hud.toast(`🏆 ${a.name}: title "${a.title}" unlocked`, '#ffd23d');
    announce(`🏆 earned "${a.name}"`);
    save();
  }

  // ---------- Cargo ----------
  const cargoUsed = () => Object.values(st.cargo).reduce((a, b) => a + b, 0) + Object.values(st.goods).reduce((a, b) => a + b, 0);
  const cargoCap = () => D.SHIPS[st.ship].cargo + (api.loot?.cargoBonus?.() || 0);
  function gain(material, n, quiet = false) {
    const room = Math.max(0, cargoCap() - cargoUsed());
    const got = Math.min(n, room);
    if (got > 0) {
      st.cargo[material] = (st.cargo[material] || 0) + got;
      st.stats.mined += got;
      if (!quiet) game.chat(`${D.MATERIALS[material]?.icon || '📦'} +${got} ${D.MATERIALS[material]?.name || material} (${st.cargo[material]} in the hold)`, true);
      emit({ type: 'collect', of: material, n: got });
      if (st.stats.mined >= 200) achieve('miner');
    }
    if (got < n) hud.toast(`Cargo hold full (${cargoCap()})! Sell some at a market.`, '#ff8a7a');
    save();
    return got;
  }

  // ---------- Effects, HUD, ship, Kepler Reach ----------
  const fx = createSpaceFx(game);
  const hud = createSpaceHud(game);
  const ship = setupShip(game, {
    dock: LOC.dock,
    fx,
    hud,
    onDestroyed(cause) {
      game.chat(`💥 Your ship was destroyed by ${cause}! It's been towed back to the hangar.`, true);
      if (game.player) teleport(game.player, ARRIVE.x, ARRIVE.y, ARRIVE.z);
      st.stats.deaths++;
      let lost = 0;
      for (const bag of [st.cargo, st.goods]) {
        for (const k of Object.keys(bag)) {
          const n = Math.ceil(bag[k] * 0.3);
          bag[k] -= n;
          lost += n;
        }
      }
      if (lost) game.chat(`You lost ${lost} items from your cargo hold.`, true);
      save();
      world.clearEnemies();
      for (const fn of api.onShipLost || []) fn();
    },
    onKits(n) {
      st.kits = n;
      save();
    },
    tractor: (p, dir, dt) => api.loot?.tractor(p, dir, dt),
    force: (p, dt) => api.force?.(p, dt),
  });

  const world = createSpaceWorld(game, {
    fx,
    onOre(n, p, material = 'ore') {
      let bonus = 0;
      for (let i = 0; i < skill('prospector'); i++) if (Math.random() < 0.25) bonus++;
      gain(material, n + bonus);
      reward(0, n * 2, true);
    },
    onKill(type, p) {
      killed({ type, faction: 'talon', p, sector: 'home', xp: 12, cr: 8 });
    },
    onRing() {
      emit({ type: 'ring' });
    },
    onTurret(left) {
      game.chat(left ? `💥 Turret down! ${left} to go.` : '💥 All turrets down!', true);
    },
    onShieldDown() {
      game.chat('🛡️ The reactor shield is down! Shoot the glowing core under the nose!', true);
    },
    onBoss() {
      emit({ type: 'boss', of: 'mothership' });
      reward(300, 200);
      api.loot?.drop(world.reactorPos(), { rarity: 'epic', count: 3 });
    },
  });
  // Something hostile died (from any module)
  function killed(e) {
    st.stats.kills++;
    reward(e.cr ?? 8, e.xp ?? 12, true);
    emit({ type: 'kill', of: e.type, faction: e.faction, sector: e.sector ?? sector(), n: 1 });
    if (e.p) api.loot?.rollDrop(e.p, e);
    achieve('firstKill');
    if (st.stats.kills >= 100) achieve('kills100');
    if (st.stats.kills >= 500) achieve('kills500');
    for (const fn of api.onKill || []) fn(e);
  }
  ship.setTargets(() => {
    const list = world.laserTargets();
    for (const src of api.targetSources) src(list);
    return list;
  });

  Object.assign(api, { fx, hud, ship, world, save, reward, rep, achieve, announce, gain, killed, level, skill, cargoUsed, cargoCap, applyStats });

  // ---------- Stats from ship, upgrades, level, skills, gear and drinks ----------
  function applyStats() {
    const S = ship.stats, def = D.SHIPS[st.ship] || D.SHIPS.sparrow, u = st.upgrades, lvl = level();
    const g = api.loot?.totals() || { weapon: { mode: 'twin', dmg: 1, rate: 1 }, perks: {} };
    const b = {};
    for (const [id, until] of Object.entries(st.buffs || {})) {
      if (until < Date.now()) continue;
      const d = D.DRINKS.find((x) => x.id === id);
      for (const [k, v] of Object.entries(d?.buff || {})) b[k] = (b[k] || 0) + v;
    }
    const pct = (k) => (g[k] || 0) / 100 + (b[k] || 0);
    const w = g.weapon || { mode: 'twin', dmg: 1, rate: 1 };
    S.speed = D.UPGRADES.engine.values[u.engine] * def.speed * (1 + 0.05 * skill('thrusters') + pct('speed'));
    S.accel = 38 * def.accel * (1 + 0.1 * skill('handling'));
    S.laser = D.UPGRADES.lasers.values[u.lasers] * def.laser * (1 + 0.06 * (lvl - 1)) * (1 + 0.08 * skill('hotLasers') + pct('dmg')) * w.dmg;
    S.fireRate = 7 * w.rate * (1 + 0.07 * skill('rapid') + pct('rate'));
    S.maxHull = Math.round((D.UPGRADES.hull.values[u.hull] + 10 * (lvl - 1)) * def.hull * (1 + 0.08 * skill('plating') + pct('hull')));
    S.maxShield = Math.round(D.UPGRADES.shields.values[u.shields] * def.shield * (1 + 0.1 * skill('shieldTech') + pct('shield')));
    S.shieldRegen = S.maxShield * 0.22 * (1 + 0.15 * skill('recharge') + pct('regen'));
    S.shieldDelay = 3.5 * (1 - 0.15 * skill('recharge'));
    S.boostCap = 4 * (1 + 0.25 * skill('afterburner') + pct('boost'));
    S.dodge = 0.05 * skill('evasive');
    S.hullRegen = 0.6 * skill('repair');
    S.crit = 0.05 + 0.05 * skill('deadeye') + pct('crit');
    S.ammoBonus = skill('ordnance');
    S.secondaryDmg = 1 + 0.1 * skill('ordnance');
    S.laserMode = w.mode;
    S.lifesteal = g.perks.vampire ? 0.03 : 0;
    S.chain = !!g.perks.chain;
    S.overcharge = !!g.perks.overcharge;
    S.phoenix = !!g.perks.phoenix;
    S.magnet = g.perks.magnet ? 3 : 1;
    api.luck = pct('luck') + 0.1 * skill('lucky');
    const paint = Math.max(0, D.PAINTS.findIndex((p) => p.id === st.cosmetics.paint));
    const trail = Math.max(0, D.TRAILS.findIndex((t) => t.id === st.cosmetics.trail));
    ship.setLook(def.look, paint, trail);
    ship.setOwned(st.secondaries, st.secondary);
    ship.kits = st.kits;
    game.player && (game.player.extraState.hat = st.cosmetics.hat !== 'none' ? st.cosmetics.hat : undefined);
    if (game.player) game.player.extraState.ttl = st.title || undefined;
  }

  // ---------- Crew ----------
  // n: { id, name, role, sector, pos, face, color, services: [...], lines: [...], faction }
  const npcById = new Map();
  function addNpc(n) {
    const g = createCapsuleMesh(n.color, n.name, { tag: false });
    const tag = makeLabel([
      { text: n.name, size: 44, color: '#e9f4ff', bold: true },
      { text: n.role, size: 32, color: '#9fc8e8' },
    ]);
    tag.position.y = 2.42;
    g.add(tag);
    // Quest markers above that: ! = something new, ? = ready to hand in
    const mark = makeMarker('!', '#ffd23d');
    const markReady = makeMarker('?', '#7affc8');
    for (const m of [mark, markReady]) {
      m.position.y = MARK_Y;
      m.visible = false;
      g.add(m);
    }
    g.position.copy(n.pos);
    g.rotation.y = n.face || 0;
    scene.add(g);
    Object.assign(n, { g, tag, mark, markReady, baseFace: n.face || 0, services: n.services || [], lines: n.lines || [] });
    api.npcs.push(n);
    npcById.set(n.id, n);
    return n;
  }
  const npc = (id) => npcById.get(id);
  const S = LOC.station;
  addNpc({ id: 'reyes', name: 'Commander Reyes', role: 'Missions · Job board', sector: 'home', faction: 'command', color: 0x3a6bd8, pos: new THREE.Vector3(S.x - 3.5, S.y, S.z + 5), services: ['jobs'],
    lines: ['Keep your shields up out there, pilot.', 'The Reach is quiet today. I don\'t trust quiet.', 'Report in whenever you need work.'] });
  addNpc({ id: 'juno', name: 'Quartermaster Juno', role: 'Ships · Upgrades · Market', sector: 'home', faction: 'command', color: 0xd8a03a, pos: new THREE.Vector3(S.x + 3.5, S.y, S.z + 5), services: ['shipyard', 'upgrades', 'weapons', 'market'],
    lines: ["You've got credits? I've got toys.", 'Every ship in the Reach passes through my books.', "Don't scratch the paint. Actually, I'll sell you new paint."] });
  addNpc({ id: 'bolt', name: 'Mechanic Bolt', role: 'Repairs', sector: 'home', faction: 'command', color: 0xd85a3a, pos: new THREE.Vector3(S.x + 4.5, S.y, S.z - 21), services: ['repair'],
    lines: ['She\'s a good ship.', 'If it rattles, bring it to me.', 'Repairs are free for NoCOM pilots. Don\'t tell Juno.'] });
  addNpc({ id: 'vega', name: 'Dockmaster Vega', role: 'Outpost Kepler · Market', sector: 'home', faction: 'command', color: 0x3ad88a, pos: new THREE.Vector3(LOC.outpost.x + 3, LOC.outpost.y, LOC.outpost.z + 9), face: -Math.PI / 2, services: ['market', 'repair'],
    lines: ['Outpost Kepler. Not much out here but rocks and pirates.', 'Safe flying.'] });

  // ---------- Quests ----------
  Object.assign(api, { addNpc, npc });
  const Q = buildQuests(api);
  api.Q = Q;
  const byId = new Map([...Q.STORY, ...Q.SIDE].map((q) => [q.id, q]));
  let jobCache = null;
  function getQuest(id) {
    if (id === 'job') {
      if (!st.job) return null;
      if (!jobCache || jobCache.params !== st.job) jobCache = { params: st.job, q: Q.makeJob(st.job) };
      return jobCache.q;
    }
    return byId.get(id) || null;
  }
  const storyQuest = () => Q.STORY[st.story] || null;
  const isStory = (q) => Q.STORY.includes(q);
  function activeQuests() {
    return Object.keys(st.quests).map((id) => [getQuest(id), st.quests[id]]).filter(([q]) => q);
  }
  function stepOf(q, qs) {
    return q.steps[qs.step] || null;
  }
  function reqMet(q) {
    const r = q.req;
    if (!r) return true;
    if (r.level && level() < r.level) return false;
    if (r.story != null && st.story < r.story) return false;
    if (r.flag && !st.flags[r.flag]) return false;
    for (const [f, min] of Object.entries(r.rep || {})) if (st.rep[f] < min) return false;
    return true;
  }
  function reqText(q) {
    const r = q.req || {};
    if (r.level && level() < r.level) return `needs level ${r.level}`;
    for (const [f, min] of Object.entries(r.rep || {})) if (st.rep[f] < min) return `needs ${D.FACTIONS[f].name} rep ${min}`;
    return 'not yet';
  }
  // What this crew member can offer right now
  function offersFrom(n) {
    const out = [];
    const sq = storyQuest();
    if (sq && sq.giver === n.id && !st.quests[sq.id]) out.push(sq);
    for (const q of Q.SIDE) {
      if (q.giver !== n.id || st.done[q.id] || st.quests[q.id]) continue;
      if (q.req?.story != null && st.story < q.req.story) continue; // hidden until the story gets there
      out.push(q);
    }
    return out;
  }
  function label(q, qs) {
    if (qs.stage === 'turnin') return `Return to ${npc(q.turnIn)?.name || 'the quest giver'}`;
    const step = stepOf(q, qs);
    if (!step) return '';
    const p = step.t === 'hold' ? `${Math.floor((qs.progress / step.secs) * 100)}%` : Math.min(Math.floor(qs.progress), step.n ?? 1);
    return typeof step.label === 'function' ? step.label(p, api) : step.label || q.title;
  }
  const _w = new THREE.Vector3();
  function resolveAt(at, qs) {
    if (!at) return null;
    if (typeof at === 'function') at = at(qs?.progress ?? 0, api);
    if (!at) return null;
    if (Array.isArray(at)) return _w.set(...at).clone();
    return at.clone ? at.clone() : null;
  }
  function waypointOf(q, qs) {
    if (qs.stage === 'turnin') return npcMarkPos(q.turnIn);
    const step = stepOf(q, qs);
    if (!step) return null;
    if (step.t === 'talk') return npcMarkPos(step.npc);
    return resolveAt(step.at, qs) || (step.sector ? new THREE.Vector3(...D.SECTORS[step.sector].center) : null);
  }
  function npcMarkPos(id) {
    const n = npc(id);
    return n ? n.pos.clone().setY(n.pos.y + MARK_Y + 1.1) : null;
  }

  function startStep(q, qs) {
    const step = stepOf(q, qs);
    step?.onStart?.(api, qs);
  }
  function advance(q, qs) {
    qs.step++;
    qs.progress = 0;
    if (qs.step >= q.steps.length) {
      if (q.turnIn) {
        qs.stage = 'turnin';
        fx.sfx('quest');
        game.chat(`✅ ${q.title}: done! Go back to ${npc(q.turnIn)?.name}.`, true);
        hud.toast(`✅ ${q.title}: return to ${npc(q.turnIn)?.name}`, '#7affc8');
      } else {
        complete(q);
        return;
      }
    } else {
      startStep(q, qs);
      hud.toast(`📜 ${label(q, qs)}`, '#bfe8ff');
    }
    save();
  }
  // Something happened: { type, of, n, faction, sector }
  function emit(ev) {
    for (const [q, qs] of activeQuests()) {
      if (qs.stage !== 'active') continue;
      const step = stepOf(q, qs);
      if (!step || step.t !== ev.type) continue;
      if (step.of && step.of !== 'any' && step.of !== ev.of) continue;
      if (step.faction && step.faction !== ev.faction) continue;
      if (step.sector && ev.sector && step.sector !== ev.sector) continue;
      qs.progress += ev.n ?? 1;
      if (qs.progress >= (step.n ?? 1)) advance(q, qs);
      else save();
    }
  }
  function accept(q) {
    const qs = { step: 0, progress: 0, stage: q.steps.length ? 'active' : 'turnin' };
    st.quests[q.id] = qs;
    st.focus = q.id;
    q.onAccept?.(api);
    startStep(q, qs);
    fx.sfx('quest');
    game.chat(`📜 New mission: ${q.title}`, true);
    hud.toast(`📜 ${q.title}: ${label(q, qs)}`, '#ffd23d');
    save();
  }
  function complete(q, choice) {
    delete st.quests[q.id];
    choice?.effect?.(api);
    q.onTurnIn?.(api);
    const [cr, xp] = q.reward || [0, 0];
    reward(cr, xp);
    for (const [f, d] of Object.entries(q.rep || {})) rep(f, d);
    if (q.gear) api.loot?.give(q.gear);
    if (isStory(q)) {
      st.story++;
      announce(`completed "${q.title}"`);
      if (!Q.STORY[st.story]) achieve('story');
    } else if (q.job) {
      st.job = null;
      st.jobsDone++;
      if (st.jobsDone >= 25) achieve('jobs25');
    } else {
      st.done[q.id] = true;
    }
    if (st.focus === q.id) st.focus = null;
    hud.toast(`🏅 ${q.title} complete!`, '#ffd23d');
    save();
  }
  function abandon(id) {
    const q = getQuest(id);
    if (!q || isStory(q)) return;
    delete st.quests[id];
    if (id === 'job') st.job = null;
    q.onAbandon?.(api);
    save();
  }
  function takeJob(params) {
    st.job = params;
    jobCache = null;
    accept(getQuest('job'));
  }

  // ---------- Dialogue window ----------
  const dlg = document.createElement('div');
  Object.assign(dlg.style, {
    position: 'fixed', left: '50%', bottom: '110px', transform: 'translateX(-50%)', width: 'min(600px, 92vw)',
    maxHeight: '70vh', overflowY: 'auto',
    background: 'rgba(8,14,26,0.95)', border: '1px solid rgba(95,212,255,0.45)', borderRadius: '14px',
    padding: '16px 18px', color: '#e9f4ff', font: '15px system-ui, sans-serif', display: 'none', zIndex: 30,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  });
  document.getElementById('hud').appendChild(dlg);
  let dlgOpen = false;
  let dlgButtons = [];
  // options: [label, fn, disabled, hint]
  function openDialog(person, text, options) {
    dlg.replaceChildren();
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:16px;color:#7fd8ff;margin-bottom:6px';
    title.textContent = person;
    const body = document.createElement('div');
    body.style.cssText = 'line-height:1.45;margin-bottom:12px;white-space:pre-line';
    body.textContent = text;
    const opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    dlgButtons = [];
    options.forEach(([lbl, fn, disabled, hint], i) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${i < 9 ? `${i + 1}. ` : ''}${lbl}`;
      b.style.textAlign = 'left';
      if (hint) b.title = hint;
      b.disabled = !!disabled;
      b.addEventListener('click', () => !disabled && fn());
      opts.appendChild(b);
      dlgButtons.push(disabled ? null : fn);
    });
    dlg.append(title, body, opts);
    dlg.style.display = 'block';
    if (!dlgOpen) {
      dlgOpen = true;
      input.enabled = false;
      input.keys.clear();
      document.exitPointerLock?.();
    }
  }
  function closeDialog() {
    if (!dlgOpen) return;
    dlgOpen = false;
    dlg.style.display = 'none';
    input.enabled = true;
    if (game.player) input.requestLock();
  }
  window.addEventListener('keydown', (e) => {
    if (!dlgOpen) return;
    if (e.code === 'Escape') {
      closeDialog();
      e.stopImmediatePropagation();
    }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      e.stopImmediatePropagation();
      dlgButtons[Number(m[1]) - 1]?.();
    }
  }, true);
  const bye = ['Bye', closeDialog];
  Object.assign(api, { openDialog, closeDialog, bye, get dlgOpen() { return dlgOpen; } });

  // ---------- Talking ----------
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  function talk(n, text) {
    const opts = [];
    for (const [q, qs] of activeQuests()) {
      if (qs.stage === 'turnin' && q.turnIn === n.id) opts.push([`✅ ${q.title}: hand in`, () => turnInDialog(n, q)]);
      const step = stepOf(q, qs);
      if (qs.stage === 'active' && step?.t === 'talk' && step.npc === n.id) {
        opts.push([`💬 ${step.ask || q.title}`, () => openDialog(n.name, step.text || '...', [['OK', () => {
          advance(q, qs);
          talk(n);
        }]])]);
      }
    }
    for (const q of offersFrom(n)) {
      const ok = reqMet(q);
      opts.push([`${isStory(q) ? '⭐' : '❗'} ${q.title}${ok ? '' : ` (${reqText(q)})`}`, () => offerDialog(n, q), !ok]);
    }
    for (const s of n.services) {
      const svc = api.services[s];
      if (svc) opts.push([svc.label, () => svc.open(n)]);
    }
    opts.push(bye);
    openDialog(`${n.name} · ${n.role}`, text || n.greet?.(api) || pick(n.lines) || '...', opts);
  }
  function offerDialog(n, q) {
    const [cr, xp] = q.reward || [0, 0];
    openDialog(n.name, `${q.offer}\n\nReward: ${cr} credits · ${xp} XP`, [
      [`Accept: ${q.title}`, () => {
        accept(q);
        closeDialog();
      }],
      ['Not yet', () => talk(n)],
    ]);
  }
  function turnInDialog(n, q) {
    const [cr, xp] = q.reward || [0, 0];
    if (q.choices) {
      return openDialog(n.name, q.done, q.choices.map((c) => [c.label, () => {
        complete(q, c);
        openDialog(n.name, c.text || 'So be it.', [['OK', () => talk(n)]]);
      }]));
    }
    openDialog(n.name, q.done, [[`Collect reward (${cr} credits, ${xp} XP)`, () => {
      complete(q);
      talk(n);
    }]]);
  }
  Object.assign(api, { talk, accept, complete, abandon, takeJob, emit, getQuest, activeQuests, label, waypointOf, isStory, storyQuest, offersFrom });

  // ---------- Services and journal ----------
  setupShops(api);
  api.journal = setupJournal(api);
  api.sectors = setupSectors(api);

  // ---------- HUD: progress panel, waypoint, prompt ----------
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', right: '12px', top: '84px', width: '260px', display: 'none', pointerEvents: 'none',
    background: 'rgba(8,14,26,0.72)', border: '1px solid rgba(95,212,255,0.3)', borderRadius: '10px',
    padding: '10px 12px', color: '#d8eeff', font: '13px system-ui, sans-serif', zIndex: 4,
  });
  panel.innerHTML = `<div class="rp-sector" style="font-weight:800;font-size:11px;letter-spacing:1px;opacity:0.85"></div>
    <div class="rp-top" style="font-weight:700;font-size:14px;margin-top:2px"></div>
    <div style="height:6px;background:rgba(255,255,255,0.12);border-radius:3px;margin:6px 0 8px;overflow:hidden">
      <div class="rp-xp" style="height:100%;background:#ffd23d"></div></div>
    <div class="rp-quest" style="font-weight:700;color:#7fd8ff"></div>
    <div class="rp-obj" style="opacity:0.9;margin-top:2px"></div>
    <div class="rp-more" style="opacity:0.6;margin-top:6px;font-size:11px"></div>`;
  document.getElementById('hud').appendChild(panel);
  const pSector = panel.querySelector('.rp-sector'), pTop = panel.querySelector('.rp-top'), pXp = panel.querySelector('.rp-xp');
  const pQuest = panel.querySelector('.rp-quest'), pObj = panel.querySelector('.rp-obj'), pMore = panel.querySelector('.rp-more');

  const marker = document.createElement('div');
  Object.assign(marker.style, {
    position: 'fixed', display: 'none', pointerEvents: 'none', transform: 'translate(-50%, -50%)', zIndex: 4,
    color: '#ffd23d', font: '700 12px system-ui, sans-serif', textAlign: 'center', textShadow: '0 1px 4px #000',
  });
  marker.innerHTML = '<div class="mk-icon" style="font-size:22px;line-height:1">◆</div><div class="mk-dist"></div>';
  document.getElementById('hud').appendChild(marker);
  const mkIcon = marker.querySelector('.mk-icon'), mkDist = marker.querySelector('.mk-dist');

  const prompt = document.createElement('div');
  Object.assign(prompt.style, {
    position: 'fixed', left: '50%', top: '58%', transform: 'translateX(-50%)', display: 'none', pointerEvents: 'none',
    padding: '6px 12px', borderRadius: '8px', background: 'rgba(8,14,26,0.8)', color: '#ffffff',
    font: '600 14px system-ui, sans-serif', zIndex: 4,
  });
  document.getElementById('hud').appendChild(prompt);

  // ---------- E: board / get out / talk / pick up (other modules add more via api.actions) ----------
  let action = null; // what E does right now
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || dlgOpen || api.journal.open || !input.enabled || !game.player) return;
    action?.();
  });
  // Quest pickups (on foot, or by ship when the step says ship: true)
  api.actions.push((p) => {
    for (const [q, qs] of activeQuests()) {
      const step = stepOf(q, qs);
      if (qs.stage !== 'active' || step?.t !== 'pickup') continue;
      const at = resolveAt(step.at, qs);
      if (!at) continue;
      if (!!step.ship !== ship.piloting) continue;
      if (at.distanceTo(p) < (step.ship ? 12 : 2.6)) {
        return {
          text: `E: ${step.verb || 'Take'} ${step.what || 'it'}`,
          fn: () => {
            if (step.text) game.chat(step.text, true);
            fx.sfx('pickup');
            advance(q, qs);
          },
        };
      }
    }
    return null;
  });

  // Which sector are we in?
  const currentPos = () => (ship.piloting ? ship.position : game.player.position);
  function sector() {
    return game.player ? D.sectorAt(currentPos()) : null;
  }
  api.sector = sector;
  api.currentPos = currentPos;

  // ---------- Per frame ----------
  let owner = null;
  let backdropDone = false;
  let lastSector = null;
  const _p = new THREE.Vector3();
  const _np = new THREE.Vector3();
  let buffCheck = 0;
  fx.start();
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      load(player.name || 'Player');
      closeDialog();
    }
    const inSpace = game.space.inSpace();
    const here = sector();

    // Space is big: see further while you're up there, and keep the stars behind everything
    const far = inSpace ? 2600 : 500;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    if (!backdropDone && game.space.sky) {
      backdropDone = true;
      game.space.sky.traverse((o) => {
        if (!o.material) return;
        o.material.depthWrite = false;
        o.renderOrder = o.isPoints ? -3 : -2;
      });
    }

    // Entering a sector
    if (here !== lastSector) {
      if (here) {
        const s = D.SECTORS[here];
        hud.banner(s.name.toUpperCase(), lastSector ? 'Jump complete' : 'Talk to the crew (E) · J for your journal', s.color);
        if (!st.visited.includes(here)) {
          st.visited.push(here);
          if (st.visited.length >= D.SECTOR_IDS.length) achieve('explorer');
          save();
        }
        // Resume flight school rings after a reload
        const tq = st.quests.training;
        if (tq?.stage === 'active' && tq.step === 1) world.startRings(tq.progress);
      }
      lastSector = here;
    }

    // Hide the Erebus data core once you've got it (or are past that mission)
    world.setCoreVisible(st.story <= 4 && !(st.story === 4 && st.quests.derelict?.stage === 'turnin'));

    world.update(dt, {
      piloting: ship.piloting,
      shipPos: ship.position,
      shipVel: ship.velocity,
      playerPos: player.position,
      damageShip: (n, from) => ship.damage(n, 'pirates', from),
      damagePlayer: (n) => player.takeDamage(n, 'pirates'),
    });
    for (const fn of api.frame) fn(dt, { inSpace, sector: here, player });

    // Drinks wear off
    buffCheck -= dt;
    if (buffCheck <= 0) {
      buffCheck = 5;
      let changed = false;
      for (const [id, until] of Object.entries(st.buffs)) {
        if (until < Date.now()) {
          delete st.buffs[id];
          changed = true;
          hud.toast(`${D.DRINKS.find((d) => d.id === id)?.name || 'A drink'} wore off`, '#bfe8ff');
        }
      }
      if (changed) {
        applyStats();
        save();
      }
    }

    // Quest steps that tick every frame
    const pos = currentPos();
    for (const [q, qs] of activeQuests()) {
      if (qs.stage !== 'active') continue;
      const step = stepOf(q, qs);
      if (!step) continue;
      if (step.t === 'reach') {
        const at = resolveAt(step.at, qs);
        if (at && at.distanceTo(pos) < (step.r || 30)) advance(q, qs);
      } else if (step.t === 'hold') {
        const at = resolveAt(step.at, qs);
        if (at && at.distanceTo(pos) < (step.r || 25) && (!step.ship || ship.piloting)) {
          qs.progress += dt;
          hud.scan(qs.progress / step.secs, step.holdText || 'Holding position…');
          if (qs.progress >= step.secs) {
            hud.scan(null);
            advance(q, qs);
          }
        }
      } else if (step.t === 'flag') {
        if (step.check?.(api, qs)) advance(q, qs);
      } else if (step.t === 'board' && ship.piloting) {
        advance(q, qs);
      }
    }

    // Crew: idle animation, turn to face you, quest markers
    const offeringNpcs = new Set();
    const readyNpcs = new Set();
    for (const [q, qs] of activeQuests()) {
      if (qs.stage === 'turnin') readyNpcs.add(q.turnIn);
      const step = stepOf(q, qs);
      if (qs.stage === 'active' && step?.t === 'talk') readyNpcs.add(step.npc);
    }
    const t = performance.now();
    for (const n of api.npcs) {
      const d = n.g.position.distanceTo(player.position);
      if (d > 120) continue;
      if (!readyNpcs.has(n.id) && offersFrom(n).some(reqMet)) offeringNpcs.add(n.id);
      n.mark.visible = offeringNpcs.has(n.id) && !readyNpcs.has(n.id);
      n.markReady.visible = readyNpcs.has(n.id);
      n.mark.position.y = n.markReady.position.y = MARK_Y + Math.sin(t / 300) * 0.06;
      // Fade the name out when you're right next to them (it would fill your screen)
      n.tag.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(n.g.position) - 2.2) / 1.5));
      if (!n.walking) {
        const want = d < 6 ? Math.atan2(-(player.position.x - n.g.position.x), -(player.position.z - n.g.position.z)) : n.baseFace;
        let diff = ((want - n.g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        n.g.rotation.y += diff * Math.min(1, dt * 4);
        animateCharacter(n.g, 0, true, dt, d < 6 ? 0.1 : 0);
      }
    }

    // What does E do here?
    action = null;
    let promptText = '';
    if (inSpace && !dlgOpen && !api.journal.open) {
      const p = player.position;
      for (const src of api.actions) {
        const a = src(ship.piloting ? ship.position : p);
        if (a) {
          action = a.fn;
          promptText = a.text;
          break;
        }
      }
      if (!action) {
        if (ship.piloting) {
          action = () => ship.tryExit();
        } else {
          const near = api.npcs.find((n) => n.g.position.distanceTo(p) < 2.8);
          if (near) {
            action = () => talk(near);
            promptText = `E: Talk to ${near.name}`;
          } else if (ship.canBoard()) {
            action = () => ship.board();
            promptText = 'E: Board your ship';
          }
        }
      }
    }
    prompt.style.display = promptText ? 'block' : 'none';
    prompt.textContent = promptText;

    // Progress panel
    const active = activeQuests();
    let focus = st.focus && st.quests[st.focus] ? [getQuest(st.focus), st.quests[st.focus]] : null;
    if (!focus) focus = active.find(([q]) => isStory(q)) || active[0] || null;
    panel.style.display = inSpace ? 'block' : 'none';
    if (inSpace) {
      const lvl = level();
      const s = here ? D.SECTORS[here] : null;
      pSector.textContent = s ? `📍 ${s.name.toUpperCase()}` : '';
      pSector.style.color = s?.color || '#9fd8ff';
      pTop.textContent = `🚀 Lv ${lvl}${st.title ? ` · ${st.title}` : ''} · ${st.credits} cr`;
      const a = D.xpForLevel(lvl), b = D.xpForLevel(lvl + 1);
      pXp.style.width = lvl >= D.MAX_LEVEL ? '100%' : `${((st.xp - a) / (b - a)) * 100}%`;
      if (focus) {
        pQuest.textContent = `${isStory(focus[0]) ? '⭐' : '📜'} ${focus[0].title}`;
        pObj.textContent = label(...focus);
      } else {
        const sq = storyQuest();
        pQuest.textContent = sq ? '⭐ New mission available' : '📜 Free flight';
        pObj.textContent = sq ? `Talk to ${npc(sq.giver)?.name}` : 'Check a job board for contracts';
      }
      pMore.textContent = `${active.length > 1 ? `+${active.length - 1} more quests · ` : ''}J journal · cargo ${cargoUsed()}/${cargoCap()}`;
    }

    // Waypoint marker
    let target = null;
    if (inSpace) {
      if (focus) target = waypointOf(...focus);
      else if (storyQuest()) target = npcMarkPos(storyQuest().giver);
    }
    if (target) {
      const dist = camera.position.distanceTo(target);
      _p.copy(target).project(camera);
      const behind = _p.z > 1;
      let x = (_p.x * 0.5 + 0.5) * window.innerWidth;
      let y = (-_p.y * 0.5 + 0.5) * window.innerHeight;
      if (behind) {
        x = window.innerWidth - x;
        y = window.innerHeight - 40;
      }
      const m = 40;
      const clamped = behind || x < m || x > window.innerWidth - m || y < m || y > window.innerHeight - m;
      x = Math.min(window.innerWidth - m, Math.max(m, x));
      y = Math.min(window.innerHeight - m, Math.max(m, y));
      marker.style.left = `${x}px`;
      marker.style.top = `${y}px`;
      mkIcon.textContent = clamped ? '➤' : '◆';
      mkIcon.style.transform = clamped ? `rotate(${Math.atan2(y - window.innerHeight / 2, x - window.innerWidth / 2)}rad)` : '';
      mkDist.textContent = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
      marker.style.display = dist > 6 ? 'block' : 'none';
    } else {
      marker.style.display = 'none';
    }

    // Radar + target brackets
    hud.show(inSpace);
    if (inSpace) {
      const blips = [];
      world.blips(blips);
      for (const src of api.blipSources) src(blips, here);
      for (const rp of game.remotes.players.values()) {
        if (rp.mesh.visible || rp.state?.sh) blips.push({ p: rp.mesh.position, kind: 'player' });
      }
      for (const n of api.npcs) if (n.sector === here) blips.push({ p: n.g.position, kind: 'friendly', size: 0.6 });
      if (target) blips.push({ p: target, kind: 'objective', sticky: true });
      const yaw = ship.piloting ? ship.ship.rotation.y : player.yaw;
      hud.radar(blips, { pos, yaw, range: 600 + 150 * skill('scanner') });
      const lock = ship.piloting ? ship.lock : null;
      if (lock) {
        const info = lock.userData.info?.() || {};
        hud.target({ ...info, p: lock.getWorldPosition(_np), radius: lock.userData.radius, locked: ship.locked && ship.secondary === 'missiles' });
      } else {
        hud.target(null);
      }
    }
  });

  net.on('close', closeDialog);

  return { api, ship, world, state: () => st, save, reward, talk, npcs: api.npcs, quests: Q.STORY };
}
