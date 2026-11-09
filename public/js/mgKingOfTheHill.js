// King of the Hill: a stepped hill in the middle of a floating platform with a glowing
// crown pad on top. Stand on the crown ALONE to score; if two or more people are on it,
// it's contested and nobody scores. First to TARGET seconds wins.
// Everyone gets a Baseball Bat and a Plunger to knock/yank people off. Falling off the
// platform doesn't put you out: you respawn at the edge and climb back up.
//
// Each client times its own score and shares it with { kind: 'koth:score', s }.
// Whoever reaches TARGET first claims the win (minigames.js handles 'mg:win').

import { addBox } from './mgShared.js';

const ARENA = { x: -200, y: 20, z: -150, w: 30, d: 30 }; // inside the minigame void in CONFIG.terrain.voids
const TARGET = 30; // seconds on the hill to win
const CROWN = { w: 4, d: 4, top: 2 }; // the scoring pad, `top` meters above the arena floor
const STEPS = [
  [14, 0.5],
  [10, 1.0],
  [6.5, 1.5],
]; // [size, top above floor]; each step is low enough to walk up

export function createKingOfTheHill(game) {
  const { THREE, scene, net, remotes } = game;

  // ---------- Arena ----------
  addBox(game, { ...ARENA, top: ARENA.y, h: 1.5, color: 0x4f7a3a }); // grassy platform
  for (const [dx, dz, w, d] of [
    [0, -ARENA.d / 2, ARENA.w, 0.5],
    [0, ARENA.d / 2, ARENA.w, 0.5],
    [-ARENA.w / 2, 0, 0.5, ARENA.d],
    [ARENA.w / 2, 0, 0.5, ARENA.d],
  ]) {
    addBox(game, { x: ARENA.x + dx, top: ARENA.y + 0.02, z: ARENA.z + dz, w, d, h: 0.3, color: 0xe8e2c8, collider: false });
  }
  const stepColors = [0x6b8f4e, 0x7a6a52, 0x8c8478];
  STEPS.forEach(([size, top], i) => {
    addBox(game, { x: ARENA.x, top: ARENA.y + top, z: ARENA.z, w: size, d: size, h: top + 0.5, color: stepColors[i] });
  });
  const crownPad = addBox(game, {
    x: ARENA.x, top: ARENA.y + CROWN.top, z: ARENA.z, w: CROWN.w, d: CROWN.d, h: CROWN.top + 0.5, color: 0xd4a437,
  });
  crownPad.material.emissive = new THREE.Color(0xd4a437);
  crownPad.material.emissiveIntensity = 0.25;

  // Floating crown ring + flag so you can see the hill from the lobby
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd966, emissive: 0xffc23a, emissiveIntensity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 10, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(ARENA.x, ARENA.y + CROWN.top + 3.2, ARENA.z);
  scene.add(ring);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 })
  );
  pole.position.set(ARENA.x + CROWN.w / 2 - 0.3, ARENA.y + CROWN.top + 2, ARENA.z + CROWN.d / 2 - 0.3);
  scene.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd966, side: THREE.DoubleSide, emissive: 0x332200 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), flagMat);
  flag.position.set(pole.position.x - 0.6, ARENA.y + CROWN.top + 3.6, pole.position.z);
  scene.add(flag);

  // ---------- State ----------
  let running = false;
  let myScore = 0;
  let sendTimer = 0;
  let elapsed = 0;
  let won = false;
  const scores = new Map(); // player id -> seconds
  let status = { king: null, contested: false }; // for the HUD and colors

  const onCrown = (p) =>
    Math.abs(p.x - ARENA.x) <= CROWN.w / 2 + 0.2 &&
    Math.abs(p.z - ARENA.z) <= CROWN.d / 2 + 0.2 &&
    p.y > ARENA.y + CROWN.top - 0.4 &&
    p.y < ARENA.y + CROWN.top + 5;

  const nameOf = (id) => (id === net.id ? 'You' : remotes.players.get(id)?.name || 'Someone');

  net.on('event', (msg) => {
    if (msg.kind === 'koth:score' && running && typeof msg.s === 'number') {
      scores.set(msg.from, Math.min(TARGET, Math.max(0, msg.s)));
    }
  });

  return {
    id: 'koth',
    name: 'King of the Hill',
    icon: '👑',
    color: 0xd4a437,
    arena: ARENA,
    respawnOnFall: true, // knocked off = climb back up, not out
    items: ['bat', 'plunger'], // the lobby hands these out
    rules: `Hold the golden crown pad alone for ${TARGET}s to win. Knock people off with your bat and plunger!`,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 4;
      return [ARENA.x + Math.cos(a) * 12, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 12];
    },

    start() {
      running = true;
      myScore = 0;
      sendTimer = 0;
      elapsed = 0;
      won = false;
      scores.clear();
      status = { king: null, contested: false };
    },

    // ctx: { meAlive, alive (ids), positionOf(id), win(), ... } (see minigames.js)
    update(dt, ctx) {
      dt = Math.max(0, dt); // never let a weird frame time take points away
      elapsed += dt;
      ring.rotation.z += dt * 0.8;
      flag.rotation.y = Math.sin(elapsed * 3) * 0.25;

      // Who's on the crown? (only players still in the round count)
      const onIt = ctx.alive.filter((id) => {
        const p = ctx.positionOf(id);
        return p && onCrown(p);
      });
      const king = onIt.length === 1 ? onIt[0] : null;
      status = { king, contested: onIt.length > 1 };

      // Score while you're king
      if (ctx.meAlive && king === net.id && !won) {
        myScore = Math.min(TARGET, myScore + dt);
        if (myScore >= TARGET) {
          won = true;
          ctx.win();
        }
      }
      scores.set(net.id, myScore);
      sendTimer += dt;
      if (ctx.meAlive && sendTimer >= 0.5) {
        sendTimer = 0;
        net.sendEvent({ kind: 'koth:score', s: Math.round(myScore * 10) / 10 });
      }

      // Crown color: gold = free, green = you, red = someone else, white flicker = contested
      const c = status.contested ? (Math.sin(elapsed * 20) > 0 ? 0xffffff : 0xff5a3a) : king === net.id ? 0x4cd964 : king ? 0xff3b30 : 0xffc23a;
      ringMat.emissive.setHex(c);
      ringMat.color.setHex(c);
      flagMat.color.setHex(c);
    },

    hud() {
      let leader = null;
      let best = -1;
      for (const [id, s] of scores) if (s > best) (best = s), (leader = id);
      const hill = status.contested ? '⚔️ contested' : status.king === net.id ? '👑 you hold the hill!' : status.king ? `👑 ${nameOf(status.king)}` : 'hill is free';
      const lead = leader !== null && leader !== net.id && best > 0 ? ` · leader ${nameOf(leader)} ${Math.floor(best)}s` : '';
      return `you ${Math.floor(myScore)}/${TARGET}s${lead} · ${hill}`;
    },

    stop() {
      running = false;
      scores.clear();
      ringMat.emissive.setHex(0xffc23a);
      ringMat.color.setHex(0xffd966);
      flagMat.color.setHex(0xffd966);
    },
  };
}
