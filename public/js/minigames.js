// Minigame lobby: a floating platform off the west edge of the map.
// Walk into the purple portal near spawn to get there. Stand on a pad to vote for a game.
// Once 2+ players are in the lobby a countdown starts, then everyone in the lobby is sent
// to the winning game. Last one standing wins and everyone comes back to the lobby.
//
// Going into a minigame takes all your items away. You only get the items that game hands out
// (mode.items). Item hotkeys (Y dynamite, I black hole, G gravity flip, 1-9 hotbar) do nothing
// and the item spawner is hidden from the Tab inventory until you're out.
// Your own items are saved and given back when you're out or the round ends.
//
// No server changes: the player with the lowest id in the lobby runs the countdown and
// sends { kind: 'mg:start', mode, players, seed }. Everyone tracks who's still in, and
// each player sends { kind: 'mg:out' } when they get knocked out.
//
// To add a minigame, make a module like mgBombRain.js and add it to MODES below.
// A mode is { id, name, icon, color, arena:{x,y,z,w,d}, items?, spawnPoint(i, n),
//   start({ seed, meIn, players }), update(dt, ctx), isOut?(feetPos), hud(ctx), stop() }
// ctx = { meAlive, me, alive (sorted ids), targets (feet positions of everyone still in),
//   positionOf(id), nameOf(id), knockMeOut() }
// Keep arenas inside the minigame void in CONFIG.terrain.voids so no terrain grows into them.

import { addBox, makeSign, inArea, teleport, addItemLock } from './mgShared.js';
import { ITEMS } from './items.js';
import { createBombRain } from './mgBombRain.js';
import { createSwordArena } from './mgSwordArena.js';
import { createFallingFloor } from './mgFallingFloor.js';
import { createColorPanic } from './mgColorPanic.js';
import { createSumo } from './mgSumo.js';
import { createLaserSweep } from './mgLaserSweep.js';
import { createRisingLava } from './mgRisingLava.js';
import { createHotPotato } from './mgHotPotato.js';

const LOBBY = { x: -140, y: 20, z: 0, w: 26, d: 52 };
const ARRIVE = [-134, LOBBY.y + 0.5, 0];
const PORTAL = { x: 0, z: -14 }; // on the main map, near spawn
const EXIT = { x: -129.5, z: 0, w: 3, d: 3 };
const MIN_PLAYERS = 2;
const COUNTDOWN = 15; // seconds once enough players are in the lobby
const ALL_VOTED_COUNTDOWN = 5; // shortened when everyone has voted
const MAX_ROUND = 240; // safety net: round ends in a draw after this long
const END_DELAY = 3; // seconds to show the winner before going back

export function setupMinigames(game) {
  const { THREE, scene, net, remotes } = game;
  const MODES = [
    createBombRain(game),
    createSwordArena(game),
    createFallingFloor(game),
    createColorPanic(game),
    createSumo(game),
    createLaserSweep(game),
    createRisingLava(game),
    createHotPotato(game),
  ];

  // ---------- Lobby platform ----------
  addBox(game, { ...LOBBY, top: LOBBY.y, h: 1.5, color: 0x5b4b8a });
  const title = makeSign(game, 'MINIGAMES', { color: '#ffd966', width: 12, height: 2.4 });
  title.position.set(LOBBY.x - LOBBY.w / 2 + 0.3, LOBBY.y + 5.5, LOBBY.z);
  title.rotation.y = Math.PI / 2;

  // One vote pad per minigame in a row along the far side
  const PAD_GAP = 6;
  const pads = MODES.map((mode, i) => {
    const z = LOBBY.z + (i - (MODES.length - 1) / 2) * PAD_GAP;
    const pad = { x: LOBBY.x - 7, z, w: 4.5, d: 4.5, y: LOBBY.y, mode };
    addBox(game, { x: pad.x, top: LOBBY.y + 0.12, z, w: pad.w, d: pad.d, h: 0.3, color: mode.color });
    const sign = makeSign(game, `${mode.icon} ${mode.name}`, { width: 4.5, height: 1 });
    sign.position.set(pad.x - 2.4, LOBBY.y + 2.2, z);
    sign.rotation.y = Math.PI / 2;
    return pad;
  });

  addBox(game, { x: EXIT.x, top: LOBBY.y + 0.12, z: EXIT.z, w: EXIT.w, d: EXIT.d, h: 0.3, color: 0x3a86ff });
  const exitSign = makeSign(game, 'Back to map', { width: 3, height: 0.7 });
  exitSign.position.set(EXIT.x + 1.6, LOBBY.y + 1.8, EXIT.z);
  exitSign.rotation.y = -Math.PI / 2;

  // ---------- Portal on the main map ----------
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.18, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0xb06cff, emissive: 0x8a3cff, emissiveIntensity: 0.8 })
  );
  ring.position.y = 1.6;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 32),
    new THREE.MeshBasicMaterial({ color: 0xc89bff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.position.y = 1.6;
  const portalSign = makeSign(game, '🎮 Minigames', { width: 3, height: 0.7 });
  portalSign.position.y = 3.6;
  scene.remove(portalSign);
  portal.add(ring, disc, portalSign);
  portal.position.set(PORTAL.x, 0, PORTAL.z);
  scene.add(portal);

  // ---------- HUD ----------
  const hudEl = document.createElement('div');
  Object.assign(hudEl.style, {
    position: 'fixed', top: '52px', left: '50%', transform: 'translateX(-50%)',
    padding: '6px 14px', borderRadius: '8px', background: 'rgba(20,22,27,0.75)',
    font: '600 16px system-ui, sans-serif', color: '#e9ddff', display: 'none',
    pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center',
  });
  document.getElementById('hud').appendChild(hudEl);

  // ---------- State ----------
  let owner = null;
  let round = null; // { mode, players:Set, alive:Set, started, endAt, meIn }
  let countdown = null; // only on the player running the lobby
  let lobbyMsg = null; // { t, at } last countdown heard from whoever runs the lobby
  let sendTimer = 0;
  let portalCooldown = 0;
  const now = () => performance.now() / 1000;

  const nameOf = (id) => (id === net.id ? game.player?.name : remotes.players.get(id)?.name) || 'Someone';
  const meAlive = () => !!(round && round.meIn && round.alive.has(net.id) && !round.endAt);
  const positionOf = (id) => {
    if (id === net.id) return game.player?.position || null;
    const rp = remotes.players.get(id);
    return rp?.mesh.visible ? rp.mesh.position : null;
  };

  // ---------- Items ----------
  function giveModeItems(mode) {
    const inv = game.inventory;
    inv.clear();
    for (const id of mode.items || []) {
      const def = ITEMS.get(id);
      if (def) inv.add({ id, name: def.name, icon: def.icon, maxStack: 1, count: 1 });
    }
    inv.select(0);
  }

  // Anything not handed out by the current game (e.g. grabbed from the spawner) disappears
  function stripItems(mode) {
    const inv = game.inventory;
    const allowed = mode.items || [];
    let changed = false;
    inv.slots.forEach((s, i) => {
      if (s && !allowed.includes(s.id)) {
        inv.slots[i] = null;
        changed = true;
      }
    });
    if (inv.held && !allowed.includes(inv.held.id)) {
      inv.held = null;
      changed = true;
    }
    if (changed) inv.changed();
  }

  // Item hotkeys and the item spawner are off while you're playing
  addItemLock(game, meAlive);

  // Who is standing in the lobby, and what they're voting for
  function lobbyState() {
    const ids = [];
    const votes = new Map(MODES.map((m) => [m.id, 0]));
    const check = (id, p) => {
      if (!inArea(p, LOBBY)) return;
      ids.push(id);
      const pad = pads.find((pd) => inArea(p, pd, 0));
      if (pad) votes.set(pad.mode.id, votes.get(pad.mode.id) + 1);
    };
    if (game.player) check(net.id, game.player.position);
    for (const rp of remotes.players.values()) if (rp.mesh.visible) check(rp.id, rp.target);
    ids.sort((a, b) => a - b);
    const voted = [...votes.values()].reduce((a, b) => a + b, 0);
    return { ids, votes, voted };
  }

  function pickMode(votes) {
    const max = Math.max(...votes.values());
    const top = MODES.filter((m) => votes.get(m.id) === max);
    return top[Math.floor(Math.random() * top.length)];
  }

  function startRound({ mode: modeId, players, seed }) {
    const mode = MODES.find((m) => m.id === modeId);
    if (!mode || !Array.isArray(players) || players.length < MIN_PLAYERS) return;
    if (round) endRound(null, true);
    const meIn = players.includes(net.id);
    round = { mode, players: new Set(players), alive: new Set(players), started: now(), endAt: 0, meIn };
    countdown = null;
    lobbyMsg = null;
    if (meIn) saveInventory(); // you get everything back when you're out or the round ends
    mode.start({ seed: Number(seed) >>> 0, meIn, players: [...players].sort((a, b) => a - b) });
    if (meIn && game.player) {
      const sp = mode.spawnPoint(players.indexOf(net.id), players.length);
      teleport(game.player, ...sp);
      game.player.health = game.CONFIG.maxHealth;
      giveModeItems(mode);
    }
    game.chat(`${mode.icon} ${mode.name} is starting with ${players.length} players! Last one standing wins.`, true);
  }

  function knockOut(id) {
    if (!round || !round.alive.has(id)) return;
    round.alive.delete(id);
    if (id === net.id) restoreInventory();
    if (round.endAt) return;
    game.chat(id === net.id ? "You're out!" : `${nameOf(id)} is out!`, true);
    if (round.alive.size <= 1) {
      const [winner] = round.alive;
      game.chat(
        winner === undefined ? `${round.mode.name}: nobody survived!` :
        winner === net.id ? `🏆 You won ${round.mode.name}!` : `🏆 ${nameOf(winner)} won ${round.mode.name}!`,
        true
      );
      round.endAt = now() + END_DELAY;
    }
  }

  function knockMeOut() {
    if (!meAlive()) return;
    net.sendEvent({ kind: 'mg:out' });
    knockOut(net.id);
    backToLobby();
  }

  function endRound(reason, silent = false) {
    if (!round) return;
    if (reason && !silent) game.chat(reason, true);
    round.mode.stop();
    restoreInventory();
    // Survivors come back to the lobby
    if (game.player && round.meIn && round.alive.has(net.id)) backToLobby();
    round = null;
  }

  // ---------- Keep your items ----------
  // Your whole inventory (hotbar + backpack) is saved when a round starts (then emptied by
  // giveModeItems) and put back exactly as it was when you're out or the round ends.
  // Minigame-only items (like the sword) go away, and nothing you had is lost.
  let savedInventory = null;
  function saveInventory() {
    const inv = game.inventory;
    savedInventory = { slots: inv.slots.map((s) => s && { ...s }), selected: inv.selected };
  }
  function restoreInventory() {
    if (!savedInventory) return;
    const inv = game.inventory;
    inv.held = null; // anything picked up with the mouse
    savedInventory.slots.forEach((s, i) => (inv.slots[i] = s && { ...s }));
    inv.select(savedInventory.selected);
    savedInventory = null;
    inv.changed();
  }

  function backToLobby() {
    if (!game.player) return;
    teleport(game.player, ARRIVE[0] + (Math.random() - 0.5) * 4, ARRIVE[1], ARRIVE[2] + (Math.random() - 0.5) * 6);
    game.player.health = game.CONFIG.maxHealth;
  }

  // ---------- Network ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'mg:lobby':
        if (typeof msg.t === 'number') lobbyMsg = { t: msg.t, at: now() };
        break;
      case 'mg:start':
        startRound(msg);
        break;
      case 'mg:out':
        knockOut(msg.from);
        break;
    }
  });
  net.on('playerLeft', ({ id }) => knockOut(id));
  net.on('close', () => {
    if (round) round.mode.stop();
    restoreInventory();
    round = null;
    countdown = null;
    lobbyMsg = null;
    hudEl.style.display = 'none';
  });

  // ---------- Per frame ----------
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      countdown = null;
    }
    const p = player.position;
    const t = now();

    // Portal + exit pad
    portal.position.y = game.world.terrain.groundHeight(PORTAL.x, PORTAL.z);
    ring.rotation.y += dt * 0.8;
    disc.rotation.y = ring.rotation.y;
    portalSign.rotation.y = Math.atan2(game.camera.position.x - PORTAL.x, game.camera.position.z - PORTAL.z);
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (portalCooldown === 0) {
      const dx = p.x - PORTAL.x, dz = p.z - PORTAL.z;
      if (dx * dx + dz * dz < 1.3 ** 2 && Math.abs(p.y - portal.position.y) < 3) {
        backToLobby();
        portalCooldown = 2;
        game.chat('Welcome to the minigame lobby! Stand on a pad to vote.', true);
      } else if (inArea(p, { ...EXIT, y: LOBBY.y }, 0) && !meAlive()) {
        player.respawn();
        portalCooldown = 2;
      }
    }

    // ---------- Round in progress ----------
    let ctx = null;
    if (round) {
      const alive = [...round.alive].sort((a, b) => a - b);
      const targets = alive.map(positionOf).filter(Boolean);
      ctx = { meAlive: meAlive(), me: net.id, alive, targets, positionOf, nameOf, knockMeOut };
      round.mode.update(dt, ctx);

      // Am I out? (fell off, died and respawned back on the map, or the game says so)
      if (meAlive()) {
        stripItems(round.mode);
        const a = round.mode.arena;
        const far = Math.abs(p.x - a.x) > a.w / 2 + 6 || Math.abs(p.z - a.z) > a.d / 2 + 6;
        if (far || p.y < a.y - 6 || round.mode.isOut?.(p)) knockMeOut();
      }

      if (round.endAt && t >= round.endAt) endRound(null);
      else if (!round.endAt && t - round.started > MAX_ROUND) endRound(`${round.mode.name} ran out of time. It's a draw!`);
    }

    // ---------- Lobby & voting ----------
    const inLobby = inArea(p, LOBBY);
    const lobby = lobbyState();
    const runner = lobby.ids[0];

    if (!round && runner === net.id && lobby.ids.length >= MIN_PLAYERS) {
      const allVoted = lobby.voted === lobby.ids.length;
      if (countdown === null) countdown = COUNTDOWN;
      if (allVoted) countdown = Math.min(countdown, ALL_VOTED_COUNTDOWN);
      countdown -= dt;
      sendTimer += dt;
      if (sendTimer >= 0.5) {
        sendTimer = 0;
        net.sendEvent({ kind: 'mg:lobby', t: Math.round(countdown * 10) / 10 });
      }
      if (countdown <= 0) {
        const msg = { mode: pickMode(lobby.votes).id, players: lobby.ids, seed: Math.floor(Math.random() * 2 ** 31) };
        net.sendEvent({ kind: 'mg:start', ...msg });
        startRound(msg);
      }
    } else {
      countdown = null;
    }

    // ---------- HUD ----------
    let text = '';
    if (round && meAlive()) {
      const extra = round.mode.hud(ctx);
      text = `${round.mode.icon} ${round.mode.name} · ${round.alive.size} left${extra ? ` · ${extra}` : ''}`;
    } else if (inLobby && round) {
      text = `${round.mode.icon} ${round.mode.name} in progress · ${round.alive.size} left · wait for the next round`;
    } else if (inLobby) {
      const votes = MODES.map((m) => `${m.icon}${lobby.votes.get(m.id)}`).join(' ');
      let left = null;
      if (countdown !== null) left = countdown;
      else if (lobbyMsg && t - lobbyMsg.at < 1.5) left = lobbyMsg.t - (t - lobbyMsg.at);
      text = lobby.ids.length < MIN_PLAYERS
        ? `Waiting for players (${lobby.ids.length}/${MIN_PLAYERS}) · ${votes}`
        : `Votes: ${votes}${left !== null ? ` · starting in ${Math.max(0, Math.ceil(left))}s` : ''}`;
    }
    hudEl.style.display = text ? 'block' : 'none';
    hudEl.textContent = text;
  });
}
