// Multiplayer for the space RPG. Everyone still fights their own enemies, but:
//   Co-op       kills and boss kills near other players (same sector, 500m) count for their quests too
//   Leviathan   a world boss: a giant space whale that visits Kepler Reach for 6 minutes every 20.
//               Its health is shared by the whole room ({ kind: 'sp:wb' } events), so team up.
//   Crucible    the PvP arena east of Station NoCOM. Die in there and you respawn at its platform
//               (no cargo lost); kills are announced and scored.
//   Races       starting a time trial tells the sector; finishing posts your time to the room board
//   Room tab    J → Room: who's flying where, arena scores, race times
//   Music       picks the track for wherever you are (spaceMusic.js); M mutes it

import * as THREE from 'three';
import { SECTORS, sectorAt } from './spaceData.js';
import { setupMusic } from './spaceMusic.js';
import { itemTexture } from './itemTextures.js';
import { makeLabel } from './spaceRpg.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function setupSocial(api) {
  const { game, fx, hud, ship } = api;
  const { scene, net, remotes } = game;
  const me = () => game.player?.name || 'Someone';
  const near = (arr, sector, r) => Array.isArray(arr) && sector === api.sector() && api.currentPos().distanceTo(V(...arr)) < r;

  // ---------- Co-op kills and bosses ----------
  let killSend = 0;
  (api.onKill ||= []).push((e) => {
    if (!e.p || performance.now() - killSend < 150) return;
    killSend = performance.now();
    net.sendEvent({ kind: 'sp:kill', et: e.type, faction: e.faction, sector: e.sector || api.sector(), p: e.p.toArray().map(Math.round) });
  });
  let assistToast = 0;
  const BOSS_ACH = { mothership: 'mother', scrapking: 'scrapking', wyrm: 'wyrm', queen: 'queen' };
  api.bossDown = (id, p) => net.sendEvent({ kind: 'sp:boss', id, sector: api.sector(), p: p.toArray().map(Math.round) });
  net.on('event', (msg) => {
    if (!game.player || !api.st) return;
    if (msg.kind === 'sp:kill' && near(msg.p, msg.sector, 500)) {
      api.emit({ type: 'kill', of: msg.et, faction: msg.faction, sector: msg.sector, n: 1 });
      api.reward(4, 6, true);
      if (performance.now() - assistToast > 8000) {
        assistToast = performance.now();
        hud.toast(`🤝 Co-op: ${remotes.players.get(msg.from)?.name || 'a wingmate'}'s kills count for your quests`, '#6bff8a');
      }
    } else if (msg.kind === 'sp:boss' && near(msg.p, msg.sector, 700)) {
      api.emit({ type: 'boss', of: msg.id });
      api.reward(500, 300);
      if (BOSS_ACH[msg.id]) api.achieve(BOSS_ACH[msg.id]);
      hud.toast('🤝 You helped take down a boss!', '#6bff8a');
    }
  });

  // ---------- The Leviathan (world boss) ----------
  const CYCLE = 20 * 60000, ACTIVE = 6 * 60000, MAX_HP = 15000;
  const CENTER = V(0, 140, -1050);
  const whale = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, roughness: 0.5, metalness: 0.1, bumpMap: itemTexture('scales'), bumpScale: 1.4, emissive: 0x08142a, emissiveIntensity: 0.5 });
  const belly = new THREE.MeshStandardMaterial({ color: 0x9ab8d8, roughness: 0.6 });
  const spotMat = new THREE.MeshStandardMaterial({ color: 0x7affff, emissive: 0x3affff, emissiveIntensity: 2 });
  const parts = [];
  const part = (geo, mat, x, y, z, parent = whale) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const body = part(new THREE.CapsuleGeometry(16, 70, 12, 24), skin, 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.75);
  const under = part(new THREE.CapsuleGeometry(14, 60, 8, 16), belly, 0, -5, -3);
  under.rotation.x = Math.PI / 2;
  under.scale.set(0.9, 1, 0.5);
  const tail = new THREE.Group();
  tail.position.z = 52;
  whale.add(tail);
  part(new THREE.CylinderGeometry(6, 12, 30, 16), skin, 0, 0, 10, tail).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const fluke = part(new THREE.BoxGeometry(26, 2, 12), skin, s * 13, 0, 26, tail);
    fluke.rotation.y = s * 0.35;
    const fin = part(new THREE.BoxGeometry(20, 1.6, 9), skin, s * 18, -6, -12);
    fin.rotation.z = s * -0.4;
    fin.rotation.y = s * 0.3;
    part(new THREE.SphereGeometry(2.2, 12, 8), spotMat, s * 11, 5, -42);
  }
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * Math.PI - Math.PI / 2;
    part(new THREE.SphereGeometry(0.9 + Math.random() * 1.2, 8, 6), spotMat, Math.sin(a) * 15.5, Math.cos(a) * 11, -40 + Math.random() * 80);
  }
  parts.push(body, under, tail);
  scene.add(whale);
  whale.visible = false;
  const lv = { cycle: -1, hp: MAX_HP, dead: false, myDmg: 0, pending: 0, sendT: 0, pulseT: 6, spawnT: 10, flash: 0, asked: false };
  for (const p of [body, under]) {
    p.userData.hostile = true;
    p.userData.radius = 18;
    p.userData.info = () => ({ name: '🐋 The Leviathan', hp: lv.hp / MAX_HP, color: '#7affff' });
    p.userData.onLaser = (dmg) => {
      if (!active() || lv.dead) return;
      lv.hp -= dmg;
      lv.pending += dmg;
      lv.myDmg += dmg;
      lv.flash = 0.06;
      if (lv.hp <= 0) whaleDown();
    };
  }
  const cycleNow = () => Math.floor(Date.now() / CYCLE);
  const active = () => Date.now() % CYCLE < ACTIVE;
  function whaleDown() {
    if (lv.dead) return;
    lv.dead = true;
    for (let i = 0; i < 8; i++) setTimeout(() => fx.explode(whale.position.clone().add(V((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 80)), 4, i % 2 ? 0x7affff : 0xffa531), i * 200);
    setTimeout(() => (whale.visible = false), 1700);
    if (lv.myDmg > 0) {
      api.reward(2500, 1500);
      api.achieve('leviathan');
      api.loot?.drop(whale.position.clone(), { rarity: 'epic', count: 3, material: 'void' });
      hud.banner('LEVIATHAN DOWN', 'The whole room did it! Check the loot crates', '#7affff');
    }
    api.enemies.clearTag('leviathan');
  }
  net.on('event', (msg) => {
    if (msg.kind === 'sp:wb' && msg.c === lv.cycle && !lv.dead) {
      lv.hp -= Math.min(5000, +msg.d || 0);
      if (lv.hp <= 0) whaleDown();
    } else if (msg.kind === 'sp:wbq' && msg.c === lv.cycle && lv.hp < MAX_HP) {
      net.sendEvent({ kind: 'sp:wbs', c: lv.cycle, hp: Math.round(lv.hp) });
    } else if (msg.kind === 'sp:wbs' && msg.c === lv.cycle && !lv.dead) {
      lv.hp = Math.min(lv.hp, +msg.hp);
      if (lv.hp <= 0) whaleDown();
    }
  });

  // ---------- The Crucible (PvP arena) ----------
  const ARENA = { c: V(480, 90, -500), r: 110 };
  const arena = new THREE.Group();
  scene.add(arena);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(ARENA.r, 2)), new THREE.LineBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.45 }));
  cage.position.copy(ARENA.c);
  arena.add(cage);
  const PLATFORM = V(480, 84, -375);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 16), new THREE.MeshStandardMaterial({ color: 0x3a1a20, metalness: 0.5, roughness: 0.5 }));
  plat.position.copy(PLATFORM).y -= 0.5;
  arena.add(plat);
  plat.updateMatrixWorld();
  game.world.colliders.push(plat);
  const ptag = makeLabel([{ text: '⚔ THE CRUCIBLE', size: 64, color: '#ff5a6a', bold: true }, { text: 'PvP arena · die in here and you respawn on this platform', size: 32, color: '#ffd0d4' }], { scale: 0.03 });
  ptag.position.copy(PLATFORM).y += 9;
  arena.add(ptag);
  // Cover: floating blocks inside the cage
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x4a4e56, metalness: 0.6, roughness: 0.4, bumpMap: itemTexture('brushed') });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 10, 4 + Math.random() * 8, 8 + Math.random() * 10), coverMat);
    m.position.copy(ARENA.c).add(V((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150));
    m.rotation.set(Math.random(), Math.random(), Math.random());
    arena.add(m);
    m.updateMatrixWorld();
    game.world.colliders.push(m);
  }
  const inArena = (p) => p.distanceTo(ARENA.c) < ARENA.r;
  const arenaScores = new Map();
  // Called by spaceRpg when your ship is destroyed. Returns true if the arena handled it.
  api.arenaDeath = (cause, at) => {
    if (!inArena(at)) return false;
    net.sendEvent({ kind: 'sp:arena', by: String(cause).slice(0, 24), victim: me() });
    arenaKill(String(cause), me());
    ship.parkAt(PLATFORM.clone().add(V(0, 2.5, -4)));
    if (game.player) {
      game.player.position.copy(PLATFORM).add(V(0, 0.6, 4));
      game.player.velocity.set(0, 0, 0);
    }
    hud.toast('⚔ Back on the Crucible platform. Board and fight again!', '#ff5a6a');
    return true;
  };
  function arenaKill(by, victim) {
    arenaScores.set(by, (arenaScores.get(by) || 0) + 1);
    game.chat(`⚔ ${by} destroyed ${victim} in the Crucible!`, true);
    if (by === me()) {
      api.st.stats.arenaKills++;
      api.reward(150, 60, true);
      if (api.st.stats.arenaKills >= 10) api.achieve('arena');
      api.save();
    }
  }
  net.on('event', (msg) => {
    if (msg.kind === 'sp:arena' && typeof msg.by === 'string') arenaKill(msg.by.slice(0, 24), String(msg.victim).slice(0, 24));
  });
  const board = document.createElement('div');
  Object.assign(board.style, {
    position: 'fixed', left: '12px', top: '84px', width: '200px', display: 'none', pointerEvents: 'none', zIndex: 4,
    background: 'rgba(30,8,12,0.78)', border: '1px solid rgba(255,90,106,0.5)', borderRadius: '10px', padding: '8px 10px', color: '#ffd0d4', font: '13px system-ui, sans-serif',
  });
  document.getElementById('hud').appendChild(board);

  // ---------- Races ----------
  const raceBoard = {}; // course id -> [{ name, t }]
  api.raceStart = (id) => net.sendEvent({ kind: 'sp:raceStart', id });
  api.raceResult = (id, t) => {
    addTime(id, me(), t);
    net.sendEvent({ kind: 'sp:raceTime', id, t: Math.round(t * 100) / 100 });
  };
  function addTime(id, name, t) {
    const list = (raceBoard[id] ||= []);
    const mine = list.find((x) => x.name === name);
    if (mine) mine.t = Math.min(mine.t, t);
    else list.push({ name, t });
    list.sort((a, b) => a.t - b.t);
  }
  net.on('event', (msg) => {
    const course = api.activities?.COURSES[msg.id];
    if (!course) return;
    const who = remotes.players.get(msg.from)?.name || 'Someone';
    if (msg.kind === 'sp:raceStart' && api.sector() === course.sector) hud.toast(`🏁 ${who} started ${course.name}! Try to beat them.`, '#7affc8');
    if (msg.kind === 'sp:raceTime' && +msg.t > 0) addTime(msg.id, who, +msg.t);
  });

  // ---------- Journal: the room ----------
  const ui = api.journal.ui;
  api.journal.addTab('room', '👥 Room', (el) => {
    let html = ui.section('Pilots in this room');
    const rows = [[me(), api.sector(), ship.piloting]];
    for (const rp of remotes.players.values()) rows.push([rp.name, rp.state?.p ? sectorAt(V(...rp.state.p)) : null, !!rp.state?.sh]);
    html += rows.map(([n, s, f]) => `${f ? '🚀' : '🧑‍🚀'} <b>${ui.esc(n)}</b> · ${s ? SECTORS[s].name : 'on the ground'}`).join('<br>');
    html += ui.section('World boss');
    const left = ACTIVE - (Date.now() % CYCLE);
    html += active() && !lv.dead ? `🐋 The Leviathan is in Kepler Reach right now! ${Math.round((lv.hp / MAX_HP) * 100)}% health, ${Math.ceil(left / 60000)} min left.`
      : `🐋 The Leviathan returns in ${Math.ceil((CYCLE - (Date.now() % CYCLE)) / 60000)} min (every 20 minutes, for 6 minutes).`;
    html += ui.section('Crucible scores (this session)');
    html += arenaScores.size ? [...arenaScores].sort((a, b) => b[1] - a[1]).map(([n, k]) => `⚔ ${ui.esc(n)}: ${k}`).join('<br>') : ui.h('div', 'opacity:0.6', 'No arena kills yet. The Crucible is east of Station NoCOM.');
    html += ui.section('Race times (this session)');
    const courses = api.activities?.COURSES || {};
    html += Object.entries(courses).map(([id, c]) => `<b>${c.name}</b>: ${(raceBoard[id] || []).slice(0, 5).map((x, i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${ui.esc(x.name)} ${x.t.toFixed(2)}s`).join(' · ') || '<span style="opacity:0.6">no times yet</span>'}`).join('<br>');
    el.innerHTML = html;
  });

  // ---------- Music ----------
  const music = setupMusic(fx);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || !game.player || !game.input.enabled || api.dlgOpen) return;
    if (!game.space.inSpace()) return;
    hud.toast(music.toggle() ? '🎵 Music on (M)' : '🔇 Music off (M)', '#bfe8ff');
  });

  // ---------- Per frame ----------
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace ? ctx.sector : null;
    const pos = api.currentPos();

    // Leviathan
    const c = cycleNow();
    if (c !== lv.cycle) Object.assign(lv, { cycle: c, hp: MAX_HP, dead: false, myDmg: 0, pending: 0, asked: false, announced: false });
    const on = active() && !lv.dead;
    whale.visible = on && here === 'home';
    if (on) {
      const t = (Date.now() % CYCLE) / 1000;
      const a = t * 0.025;
      const p = CENTER.clone().add(V(Math.cos(a) * 380, Math.sin(t * 0.07) * 30, Math.sin(a) * 300));
      const ahead = CENTER.clone().add(V(Math.cos(a + 0.05) * 380, Math.sin((t + 2) * 0.07) * 30, Math.sin(a + 0.05) * 300));
      whale.position.copy(p);
      whale.lookAt(ahead);
      whale.rotateY(Math.PI);
      tail.rotation.x = Math.sin(t * 1.2) * 0.25;
      if (here === 'home') {
        if (!lv.announced) {
          lv.announced = true;
          hud.banner('🐋 THE LEVIATHAN', 'A world boss is in Kepler Reach! Team up, everyone shares its health', '#7affff');
          fx.sfx('alarm');
        }
        if (!lv.asked) {
          lv.asked = true;
          net.sendEvent({ kind: 'sp:wbq', c: lv.cycle });
        }
        const d = ship.position.distanceTo(p);
        const close = ship.piloting && d < 600;
        if (close) {
          const pilots = 1 + [...remotes.players.values()].filter((rp) => rp.mesh.position.distanceTo(p) < 800).length;
          hud.boss('🐋 The Leviathan · world boss', lv.hp / MAX_HP, `${pilots} pilot${pilots > 1 ? 's' : ''} fighting · shared health`);
          lv.pulseT -= dt;
          lv.spawnT -= dt;
          if (lv.pulseT <= 0) {
            lv.pulseT = 9;
            fx.explode(p, 5, 0x7affff, { debris: false });
            if (d < 150) ship.damage(25, 'the Leviathan', p.clone(), 'ion');
          }
          if (lv.spawnT <= 0 && api.enemies.count('leviathan') < 4) {
            lv.spawnT = 30;
            for (let i = 0; i < 2; i++) api.enemies.spawn('drone', p.clone().add(V((Math.random() - 0.5) * 60, 20, (Math.random() - 0.5) * 60)), { sector: 'home', level: Math.max(3, api.level() - 2), tag: 'leviathan', home: p.clone(), leash: 700 }).aggro = true;
          }
        }
      }
    }
    lv.sendT -= dt;
    if (lv.pending > 0 && lv.sendT <= 0) {
      lv.sendT = 0.5;
      net.sendEvent({ kind: 'sp:wb', c: lv.cycle, d: Math.round(lv.pending) });
      lv.pending = 0;
    }

    // Arena
    arena.visible = here === 'home';
    if (arena.visible) cage.rotation.y += dt * 0.03;
    const showBoard = here === 'home' && pos.distanceTo(ARENA.c) < ARENA.r + 150;
    board.style.display = showBoard ? 'block' : 'none';
    if (showBoard) {
      const top = [...arenaScores].sort((a, b) => b[1] - a[1]).slice(0, 5);
      board.innerHTML = `<b style="color:#ff5a6a">⚔ The Crucible</b>${inArena(pos) ? ' · <b>PvP ON</b>' : ''}<br>${top.length ? top.map(([n, k]) => `${n}: ${k}`).join('<br>') : '<span style="opacity:0.6">No kills yet</span>'}<br><span style="opacity:0.6;font-size:11px">Your arena kills: ${api.st.stats.arenaKills}</span>`;
    }

    // Music for wherever you are
    let track = here;
    if (here === 'home' && api.cantina?.inside(ctx.player.position) && !ship.piloting) {
      const pick = api.cantina.jukebox;
      track = pick === 'off' ? null : pick || 'cantina';
    } else if (here) {
      const bossNear = (api.bosses?.list || []).some((b) => b.alive && b.sector === here && ship.piloting && ship.position.distanceTo(b.center()) < 450)
        || (whale.visible && ship.position.distanceTo(whale.position) < 600)
        || (here === 'home' && api.world.bossAlive && ship.position.distanceTo(api.LOC.mothership) < 400);
      if (bossNear) track = 'boss';
    }
    music.play(track);
  });

  api.blipSources.push((out, here) => {
    if (here === 'home' && whale.visible) out.push({ p: whale.position, kind: 'boss', size: 3, sticky: true });
    if (here === 'home') out.push({ p: ARENA.c, kind: 'neutral', size: 2.5 });
  });
  api.targetSources.push((list) => {
    if (whale.visible && !lv.dead) list.push(body, under);
  });

  return { music, inArena, get leviathan() { return lv; } };
}
