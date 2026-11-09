// Hot Potato: one player holds a ticking potato bomb. Run into someone to pass it on.
// Whoever holds it when it blows is out, and a new holder is picked. Last one standing wins.
//
// The holder's client decides passes ({ kind: 'hp:pass', to, c }) and the explosion
// ({ kind: 'hp:boom', c }). New holders are picked from the shared seed so everyone agrees.

import { addBox, mulberry32 } from './mgShared.js';

const ARENA = { x: -200, y: 20, z: 150, w: 22, d: 22 };
const WALL_H = 3;
const PASS_DIST = 1.7;
const NO_PASS_BACK = 0.8; // seconds before you can pass it straight back
const FIRST_GRACE = 3;

export function createHotPotato(game) {
  const { THREE, scene, net } = game;

  addBox(game, { ...ARENA, top: ARENA.y, h: 1.5, color: 0x6b8e4e });
  const t = 0.6;
  for (const [dx, dz, w, d] of [
    [0, -ARENA.d / 2 - t / 2, ARENA.w + t * 2, t],
    [0, ARENA.d / 2 + t / 2, ARENA.w + t * 2, t],
    [-ARENA.w / 2 - t / 2, 0, t, ARENA.d],
    [ARENA.w / 2 + t / 2, 0, t, ARENA.d],
  ]) {
    addBox(game, { x: ARENA.x + dx, top: ARENA.y + WALL_H, z: ARENA.z + dz, w, d, h: WALL_H + 1.5, color: 0x8a6d4b, collider: false, solid: true });
  }

  // The potato that floats over the holder's head
  const potato = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.9, emissive: 0xff2200, emissiveIntensity: 0 })
  );
  potato.scale.set(1.3, 0.9, 0.9);
  potato.visible = false;
  scene.add(potato);
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false })
  );
  scene.add(blast);
  let blastT = 1;

  let rng = null;
  let elapsed = 0;
  let cycle = 0;
  let holder = null;
  let fuseEnd = 0;
  let fuse = 1;
  let needHolder = false;
  let passCooldown = 0;
  let running = false;

  function newCycle(alive) {
    needHolder = false;
    if (alive.length < 2) {
      holder = null;
      return;
    }
    holder = alive[Math.floor(rng() * alive.length)];
    fuse = Math.max(7, 14 - cycle * 1.5);
    fuseEnd = elapsed + fuse + (cycle === 0 ? FIRST_GRACE : 0);
    cycle++;
    passCooldown = cycle === 1 ? FIRST_GRACE : 0;
  }

  function boom(at) {
    if (at) blast.position.copy(at).y += 1;
    blastT = 0;
    holder = null;
    needHolder = true;
  }

  net.on('event', (msg) => {
    if (!running) return;
    if (msg.kind === 'hp:pass' && msg.c === cycle && msg.from === holder) {
      holder = msg.to;
      if (holder === net.id) passCooldown = NO_PASS_BACK;
    } else if (msg.kind === 'hp:boom' && msg.c === cycle) {
      const rp = game.remotes.players.get(msg.from);
      boom(rp?.mesh.position);
    }
  });

  return {
    id: 'potato',
    name: 'Hot Potato',
    icon: '🥔',
    color: 0xb08850,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return [ARENA.x + Math.cos(a) * 7, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 7];
    },

    start({ seed }) {
      rng = mulberry32(seed);
      elapsed = 0;
      cycle = 0;
      holder = null;
      needHolder = true;
      running = true;
    },

    update(dt, ctx) {
      if (blastT < 1) {
        blastT += dt / 0.45;
        const s = 4 * Math.min(1, blastT * 3);
        blast.scale.set(s, s, s);
        blast.material.opacity = Math.max(0, 0.85 * (1 - blastT));
      }
      if (!running) return;
      elapsed += dt;
      passCooldown = Math.max(0, passCooldown - dt);

      // Holder left or was knocked out some other way: pick someone new
      if (holder !== null && !ctx.alive.includes(holder)) needHolder = true;
      if (needHolder) newCycle(ctx.alive);
      if (holder === null) {
        potato.visible = false;
        return;
      }

      const left = fuseEnd - elapsed;
      const hp = ctx.positionOf(holder);
      potato.visible = !!hp;
      if (hp) {
        potato.position.set(hp.x, hp.y + 2.7 + Math.sin(elapsed * 6) * 0.1, hp.z);
        potato.rotation.y += dt * 3;
        const urgency = 1 - Math.max(0, Math.min(1, left / fuse));
        potato.material.emissiveIntensity = Math.sin(elapsed * (6 + urgency * 30)) > 0 ? 0.2 + urgency : 0;
      }

      if (holder !== ctx.me || !ctx.meAlive) {
        // The holder's client handles the boom; if it never comes, move on
        if (left < -3) needHolder = true;
        return;
      }

      if (left <= 0) {
        const at = game.player.position.clone();
        ctx.knockMeOut(); // sends mg:out first so everyone drops me before picking a new holder
        net.sendEvent({ kind: 'hp:boom', c: cycle });
        boom(at);
        return;
      }

      // Tag someone by running into them
      if (passCooldown > 0) return;
      const me = game.player.position;
      for (const id of ctx.alive) {
        if (id === ctx.me) continue;
        const p = ctx.positionOf(id);
        if (!p) continue;
        if ((p.x - me.x) ** 2 + (p.z - me.z) ** 2 < PASS_DIST ** 2 && Math.abs(p.y - me.y) < 2) {
          holder = id;
          net.sendEvent({ kind: 'hp:pass', to: id, c: cycle });
          break;
        }
      }
    },

    hud(ctx) {
      if (holder === null) return '';
      const left = Math.max(0, Math.ceil(fuseEnd - elapsed));
      if (elapsed < FIRST_GRACE && cycle === 1) return `potato goes live in ${Math.ceil(FIRST_GRACE - elapsed)}…`;
      return holder === ctx?.me ? `🔥 YOU have the potato! Tag someone! ${left}s` : `${ctx?.nameOf(holder)} has the potato · ${left}s`;
    },

    stop() {
      running = false;
      holder = null;
      potato.visible = false;
    },
  };
}
