// EXTREME parkour: a red portal near spawn takes you to a floating lobby, and from there a
// really hard course: tiny pillars, double-jump-only gaps, needle-thin beams, platforms that
// blink out, platforms that slide, a double-jump tower and tiny posts to the finish.
//
// No cheating on this one: while you're on the course your items are taken away (and given
// back when you leave), item hotkeys and the spawner are off, and the jetpack and air dash
// don't work. Double jump is allowed (you need it). Fall off and you go back to the last
// green checkpoint. Finishing posts your time to everyone.
//
// Blinking/sliding platforms run off the wall clock, so they don't need syncing: each
// player only cares about their own platforms anyway.
//
// The course lives in its own void (CONFIG.terrain.voids) so no terrain grows into it.

import { addBox, makeSign, teleport, addItemLock } from './mgShared.js';

const BASE = 30;
const LOBBY = { x: 0, y: BASE, z: 222, w: 12, d: 10 };
const PORTAL = { x: -14, z: 0 }; // on the main map, near spawn
const EXIT = { x: -4.5, z: 219, w: 2, d: 2 };
// Anywhere in here counts as "on the course"
export const AREA = { x0: -60, x1: 25, z0: 212, z1: 420, y0: BASE - 25 }; // y0 well below the fall line

// [x, top, z, w, d, kind?, extra?]
// kind: 'checkpoint' | 'finish' | 'blink' (extra = phase 0..1) | 'move' (extra = phase 0..1)
export const PADS = [
  // Pillars
  [1.5, BASE + 0.5, 233.65, 0.9, 0.9],
  [-1, BASE + 1, 241.05, 0.9, 0.9],
  [1.5, BASE + 1.5, 248.75, 0.9, 0.9],
  [-0.5, BASE + 2, 256.65, 0.9, 0.9],
  [0.5, BASE + 2.5, 264.75, 0.9, 0.9],
  [0.5, BASE + 3, 272.45, 2.5, 2.5, 'checkpoint'],
  // Long jumps (double jump, land on a 1m pad)
  [2, BASE + 3, 283.7, 1, 1],
  [-1, BASE + 3.8, 294.2, 1, 1],
  [1, BASE + 3.8, 305.2, 1, 1],
  // Needle beams
  [1, BASE + 4.3, 314.2, 0.3, 6],
  [-1, BASE + 4.8, 325.7, 0.3, 6],
  [1, BASE + 4.8, 337.2, 0.3, 6],
  [1, BASE + 5.3, 346.45, 2.5, 2.5, 'checkpoint'],
  // Blinkers (they vanish for a second)
  [1, BASE + 5.3, 354.8, 1.2, 1.2, 'blink', 0],
  [1, BASE + 5.8, 362.5, 1.2, 1.2, 'blink', 0.5],
  [1, BASE + 6.3, 370.2, 1.2, 1.2, 'blink', 0],
  [1, BASE + 6.8, 377.9, 1.2, 1.2, 'blink', 0.5],
  // Sliders (they carry you)
  [1, BASE + 6.8, 385.8, 1.6, 1.6, 'move', 0],
  [1, BASE + 7.3, 393.9, 1.6, 1.6, 'move', 0.5],
  [1, BASE + 7.8, 402, 1.6, 1.6, 'move', 0],
  [1, BASE + 8.3, 409.05, 2.5, 2.5, 'checkpoint'],
  // Tower (every step needs a double jump)
  [-4.85, BASE + 10.6, 409.05, 1.2, 1.2],
  [-4.85, BASE + 12.9, 414.25, 1.2, 1.2],
  [-10.05, BASE + 15.2, 414.25, 1.2, 1.2],
  [-10.05, BASE + 17.5, 409.05, 1.2, 1.2],
  [-15.25, BASE + 19.8, 409.05, 1.2, 1.2],
  // Posts
  [-24.15, BASE + 19.3, 409.05, 0.6, 0.6],
  [-33.25, BASE + 18.8, 409.05, 0.6, 0.6],
  [-42.85, BASE + 18.3, 410.55, 0.6, 0.6],
  [-52.15, BASE + 18.3, 410.55, 4, 4, 'finish'],
];

const BLINK_PERIOD = 2.6; // seconds: solid for 1.6 (flashing for the last 0.5), gone for 1.0
const BLINK_ON = 1.6;
const MOVE_PERIOD = 3.5;
const MOVE_AMP = 4; // meters each way along X

export function setupExtremeParkour(game) {
  const { THREE, scene, world, net, CONFIG } = game;

  // ---------- Lobby ----------
  addBox(game, { ...LOBBY, top: BASE, h: 1.5, color: 0x2a1416 });
  const title = makeSign(game, '🔥 EXTREME PARKOUR 🔥', { color: '#ff5a3a', width: 10, height: 1.6 });
  title.position.set(LOBBY.x, BASE + 3.2, LOBBY.z - LOBBY.d / 2 + 0.2);
  const rules = makeSign(game, 'No jetpack · no air dash · no items · double jump only', { color: '#ffd0c4', width: 10, height: 0.7 });
  rules.position.set(LOBBY.x, BASE + 1.9, LOBBY.z - LOBBY.d / 2 + 0.2);
  addBox(game, { x: EXIT.x, top: BASE + 0.12, z: EXIT.z, w: EXIT.w, d: EXIT.d, h: 0.3, color: 0x3a86ff });
  const exitSign = makeSign(game, 'Back to map', { width: 2.2, height: 0.5 });
  exitSign.position.set(EXIT.x, BASE + 1.4, EXIT.z - 1.05);

  // ---------- Course ----------
  const pads = PADS.map(([x, top, z, w, d, kind, extra], i) => {
    const color =
      kind === 'checkpoint' ? 0x2ec46b :
      kind === 'finish' ? 0xffc23a :
      kind === 'blink' ? 0xff4fd8 :
      kind === 'move' ? 0x3ad6ff :
      new THREE.Color().setHSL(0.02 + (i / PADS.length) * 0.08, 0.85, 0.45);
    const mesh = addBox(game, { x, top, z, w, d, h: 0.4, color });
    if (kind === 'blink') mesh.material.transparent = true;
    return { mesh, x, top, z, w, d, kind, extra, index: i, cx: x, solid: true };
  });
  const finish = pads[pads.length - 1];

  // Beacon over the finish
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 80, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.22, depthWrite: false })
  );
  beacon.position.set(finish.x, finish.top + 40, finish.z);
  scene.add(beacon);

  // ---------- Portal on the main map ----------
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.18, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2200, emissiveIntensity: 0.9 })
  );
  ring.position.y = 1.6;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 32),
    new THREE.MeshBasicMaterial({ color: 0xff7a5a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.position.y = 1.6;
  const portalSign = makeSign(game, '🔥 Extreme Parkour', { width: 3.2, height: 0.7 });
  portalSign.position.y = 3.6;
  scene.remove(portalSign);
  portal.add(ring, disc, portalSign);
  portal.position.set(PORTAL.x, 0, PORTAL.z);
  scene.add(portal);

  // ---------- HUD ----------
  const timerEl = document.createElement('div');
  Object.assign(timerEl.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
    padding: '6px 14px', borderRadius: '8px', background: 'rgba(40,12,10,0.8)',
    font: '600 18px system-ui, sans-serif', color: '#ff8a6a', display: 'none', pointerEvents: 'none',
  });
  document.getElementById('hud').appendChild(timerEl);

  // ---------- State ----------
  let owner = null;
  let onCourse = false;
  let checkpoint = null; // null = the lobby
  let running = false;
  let startTime = 0;
  let best = Infinity;
  let portalCooldown = 0;
  let saved = null; // your inventory while you're on the course
  let savedDashCharges = null;

  const inArea = (p) => p.x > AREA.x0 && p.x < AREA.x1 && p.z > AREA.z0 && p.z < AREA.z1 && p.y > AREA.y0;
  const onPad = (p, pad, margin = 0.05) =>
    Math.abs(p.x - pad.cx) <= pad.w / 2 + margin && Math.abs(p.z - pad.z) <= pad.d / 2 + margin && Math.abs(p.y - pad.top) < 0.15;

  addItemLock(game, () => onCourse);

  function enterCourse() {
    onCourse = true;
    const inv = game.inventory;
    saved = { slots: inv.slots.map((s) => s && { ...s }), selected: inv.selected };
    inv.clear();
    // No air dash on this course
    savedDashCharges = CONFIG.airDash.charges;
    CONFIG.airDash.charges = 0;
  }

  function leaveCourse() {
    onCourse = false;
    running = false;
    checkpoint = null;
    timerEl.style.display = 'none';
    if (savedDashCharges !== null) CONFIG.airDash.charges = savedDashCharges;
    savedDashCharges = null;
    if (saved) {
      const inv = game.inventory;
      inv.held = null;
      saved.slots.forEach((s, i) => (inv.slots[i] = s && { ...s }));
      inv.select(saved.selected);
      inv.changed();
      saved = null;
    }
  }

  function toLobby() {
    teleport(game.player, LOBBY.x + (Math.random() - 0.5) * 3, BASE + 0.5, LOBBY.z + 1 + Math.random() * 2);
  }

  function toCheckpoint() {
    if (!checkpoint) return toLobby();
    teleport(game.player, checkpoint.cx, checkpoint.top + 0.3, checkpoint.z);
  }

  net.on('event', (msg) => {
    if (msg.kind === 'extremeFinish' && typeof msg.time === 'number') {
      game.chat(`🔥 ${String(msg.name).slice(0, 16)} beat EXTREME parkour in ${msg.time.toFixed(2)}s!`, true);
    }
  });
  net.on('close', () => {
    if (onCourse) leaveCourse();
  });

  // ---------- Per frame ----------
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      if (onCourse) leaveCourse();
      owner = player;
      best = Infinity;
    }
    const p = player.position;
    const t = Date.now() / 1000;

    // Portal on the main map
    portal.position.y = game.world.terrain.groundHeight(PORTAL.x, PORTAL.z);
    ring.rotation.y -= dt * 1.2;
    disc.rotation.y = ring.rotation.y;
    portalSign.rotation.y = Math.atan2(game.camera.position.x - PORTAL.x, game.camera.position.z - PORTAL.z);
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (portalCooldown === 0) {
      const dx = p.x - PORTAL.x, dz = p.z - PORTAL.z;
      if (dx * dx + dz * dz < 1.3 ** 2 && Math.abs(p.y - portal.position.y) < 3) {
        toLobby();
        portalCooldown = 2;
        game.chat('Welcome to EXTREME parkour. Good luck.', true);
      }
    }

    // Blinking and sliding platforms
    for (const pad of pads) {
      if (pad.kind === 'blink') {
        const c = (((t / BLINK_PERIOD + pad.extra) % 1) + 1) % 1 * BLINK_PERIOD;
        const solid = c < BLINK_ON;
        const warn = solid && c > BLINK_ON - 0.5;
        pad.mesh.material.opacity = solid ? (warn && Math.sin(t * 40) > 0 ? 0.35 : 1) : 0.12;
        if (solid !== pad.solid) {
          pad.solid = solid;
          const k = world.colliders.indexOf(pad.mesh);
          if (solid && k < 0) world.colliders.push(pad.mesh);
          if (!solid && k >= 0) world.colliders.splice(k, 1);
        }
      } else if (pad.kind === 'move') {
        const nx = pad.x + Math.sin((t / MOVE_PERIOD + pad.extra) * Math.PI * 2) * MOVE_AMP;
        // Carry the player along if they're standing on it
        if (player.onGround && onPad(p, pad)) p.x += nx - pad.cx;
        pad.cx = nx;
        pad.mesh.position.x = nx;
      }
    }

    // Entering / leaving the course area
    const here = inArea(p);
    if (here && !onCourse) enterCourse();
    else if (!here && onCourse) leaveCourse();
    if (!onCourse) return;

    // No jetpack: keep the tank empty
    player.fuel = 0;

    // Exit pad
    if (Math.abs(p.x - EXIT.x) <= EXIT.w / 2 && Math.abs(p.z - EXIT.z) <= EXIT.d / 2 && Math.abs(p.y - BASE) < 0.5) {
      player.respawn();
      leaveCourse();
      return;
    }

    // Checkpoints / finish
    if (player.onGround) {
      for (const pad of pads) {
        if (!onPad(p, pad)) continue;
        if (pad.kind === 'checkpoint' && (!checkpoint || pad.index > checkpoint.index)) {
          checkpoint = pad;
          if (running) game.chat('Checkpoint!', true);
        } else if (pad.kind === 'finish' && running) {
          running = false;
          checkpoint = pad;
          const time = (performance.now() - startTime) / 1000;
          const pb = time < best;
          best = Math.min(best, time);
          timerEl.textContent = `FINISHED! ${time.toFixed(2)}s${pb ? ' (new best)' : ''}`;
          game.chat(`🔥 You beat EXTREME parkour in ${time.toFixed(2)}s!`, true);
          net.sendEvent({ kind: 'extremeFinish', name: player.name, time });
        }
      }
    }

    // In the lobby: ready to go. Stepping off the front edge starts the clock.
    const inLobby = Math.abs(p.x - LOBBY.x) <= LOBBY.w / 2 && Math.abs(p.z - LOBBY.z) <= LOBBY.d / 2 && p.y > BASE - 1;
    if (inLobby && player.onGround) {
      running = false;
      checkpoint = null;
      timerEl.style.display = 'block';
      timerEl.textContent = best < Infinity ? `🔥 Extreme · best ${best.toFixed(2)}s` : '🔥 Extreme · go!';
    } else if (!running && !checkpoint && p.z > LOBBY.z + LOBBY.d / 2) {
      running = true;
      startTime = performance.now();
    }
    if (running) timerEl.textContent = `🔥 ${((performance.now() - startTime) / 1000).toFixed(2)}s`;

    // Fell: back to the last checkpoint
    if (p.y < BASE - 8) toCheckpoint();
  });
}
