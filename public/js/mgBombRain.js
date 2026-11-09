// Bomb Rain: bombs fall on a floating platform, then roll toward the nearest player and blow up.
// Getting blown up or knocked off the platform puts you out. Last one standing wins.
//
// Every client simulates the same bombs from a shared seed. Each client only decides
// whether ITS OWN player got hurt, like dynamite does.

import { addBox, mulberry32 } from './mgShared.js';

const ARENA = { x: -140, y: 20, z: 80, w: 28, d: 28 };
const GRACE = 3; // seconds before the first bomb
const DROP_HEIGHT = 24;
const BOMB_R = 0.45;
const GRAVITY = 18;
const BLAST_R = 4;
const BLAST_DAMAGE = 60;
const BLAST_PUSH = 16;

export function createBombRain(game) {
  const { THREE, scene } = game;

  // Arena: dark platform with a hazard-striped rim
  addBox(game, { ...ARENA, top: ARENA.y, h: 1.5, color: 0x3b3f47 });
  for (const [dx, dz, w, d] of [
    [0, -ARENA.d / 2, ARENA.w, 0.5],
    [0, ARENA.d / 2, ARENA.w, 0.5],
    [-ARENA.w / 2, 0, 0.5, ARENA.d],
    [ARENA.w / 2, 0, 0.5, ARENA.d],
  ]) {
    addBox(game, { x: ARENA.x + dx, top: ARENA.y + 0.02, z: ARENA.z + dz, w, d, h: 0.3, color: 0xffb020, collider: false });
  }

  const bombGeo = new THREE.SphereGeometry(BOMB_R, 16, 12);
  const sparkGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const blastGeo = new THREE.SphereGeometry(1, 20, 14);

  let rng = null;
  let elapsed = 0;
  let nextSpawn = 0;
  const bombs = [];
  const blasts = [];

  function spawnBomb() {
    // Use the RNG the same way on every client so everyone gets the same bombs
    const x = ARENA.x + (rng() - 0.5) * (ARENA.w - 2);
    const z = ARENA.z + (rng() - 0.5) * (ARENA.d - 2);
    const fuse = 2 + rng() * 1.2;

    const mat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.3, emissive: 0xff2200, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(bombGeo, mat);
    mesh.castShadow = true;
    const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
    spark.position.y = BOMB_R + 0.08;
    mesh.add(spark);
    mesh.position.set(x, ARENA.y + DROP_HEIGHT, z);
    scene.add(mesh);
    bombs.push({ mesh, vel: new THREE.Vector3(), rolling: false, fuse, fuseLeft: fuse });
  }

  function removeBomb(i) {
    const b = bombs[i];
    scene.remove(b.mesh);
    b.mesh.material.dispose();
    b.mesh.children[0].material.dispose();
    bombs.splice(i, 1);
  }

  const _c = new THREE.Vector3();
  function explode(i, ctx) {
    const pos = bombs[i].mesh.position.clone();
    removeBomb(i);

    const mesh = new THREE.Mesh(
      blastGeo,
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false })
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    blasts.push({ mesh, t: 0 });

    // Did it get me?
    const player = game.player;
    if (!player || !ctx.meAlive) return;
    _c.copy(player.position).y += 1;
    const d = _c.distanceTo(pos);
    if (d > BLAST_R) return;
    const f = 1 - d / BLAST_R;
    const away = _c.sub(pos).setY(0);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    away.normalize().multiplyScalar(BLAST_PUSH * f);
    player.applyKnockback([away.x, 6 + 6 * f, away.z]);
    player.takeDamage(BLAST_DAMAGE * f + 10, 'a bomb');
  }

  function clear() {
    for (let i = bombs.length - 1; i >= 0; i--) removeBomb(i);
    for (const b of blasts) {
      scene.remove(b.mesh);
      b.mesh.material.dispose();
    }
    blasts.length = 0;
  }

  return {
    id: 'bomb',
    name: 'Bomb Rain',
    icon: '💣',
    color: 0xff5a3a,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return [ARENA.x + Math.cos(a) * 7, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 7];
    },

    start({ seed }) {
      clear();
      rng = mulberry32(seed);
      elapsed = 0;
      nextSpawn = GRACE;
    },

    // ctx: { meAlive, targets: Vector3[] (feet positions of everyone still in) }
    update(dt, ctx) {
      elapsed += dt;
      // Spawns speed up and come in bigger waves over time
      while (elapsed >= nextSpawn) {
        const wave = 1 + Math.floor((nextSpawn - GRACE) / 25);
        for (let k = 0; k < wave; k++) spawnBomb();
        nextSpawn += Math.max(0.45, 1.6 - (nextSpawn - GRACE) * 0.03);
      }

      const rollSpeed = Math.min(8, 3.5 + elapsed * 0.05);
      const floor = ARENA.y + BOMB_R;
      for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        const p = b.mesh.position;
        const onPlatform = Math.abs(p.x - ARENA.x) <= ARENA.w / 2 && Math.abs(p.z - ARENA.z) <= ARENA.d / 2;

        if (b.rolling) {
          // Roll toward whoever is closest
          let best = null, bestD = Infinity;
          for (const t of ctx.targets) {
            const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
            if (d < bestD) (bestD = d), (best = t);
          }
          if (best) {
            _c.set(best.x - p.x, 0, best.z - p.z);
            if (_c.lengthSq() > 1e-4) _c.normalize().multiplyScalar(rollSpeed);
            b.vel.x += (_c.x - b.vel.x) * Math.min(1, dt * 2.5);
            b.vel.z += (_c.z - b.vel.z) * Math.min(1, dt * 2.5);
          }
          b.mesh.rotation.x += (b.vel.z / BOMB_R) * dt;
          b.mesh.rotation.z -= (b.vel.x / BOMB_R) * dt;
          b.fuseLeft -= dt;
          // Bumping into someone sets it off early
          if (bestD < 1.1 ** 2 && best && Math.abs(best.y + 1 - p.y) < 1.6) b.fuseLeft = Math.min(b.fuseLeft, 0);
        }

        b.vel.y -= GRAVITY * dt;
        p.addScaledVector(b.vel, dt);
        if (onPlatform && p.y <= floor && p.y > floor - 1) {
          p.y = floor;
          b.vel.y = 0;
          b.rolling = true;
        }

        // Blink faster as the fuse runs out
        if (b.rolling) {
          const urgency = 1 - b.fuseLeft / b.fuse;
          b.mesh.material.emissiveIntensity = Math.sin(elapsed * (8 + urgency * 30)) > 0 ? 0.3 + urgency : 0;
        }

        if (b.rolling && b.fuseLeft <= 0) explode(i, ctx);
        else if (p.y < ARENA.y - 15) removeBomb(i);
      }

      for (let i = blasts.length - 1; i >= 0; i--) {
        const bl = blasts[i];
        bl.t += dt;
        const s = BLAST_R * Math.min(1, bl.t / 0.15);
        bl.mesh.scale.set(s, s, s);
        bl.mesh.material.opacity = Math.max(0, 0.85 * (1 - bl.t / 0.45));
        if (bl.t > 0.45) {
          scene.remove(bl.mesh);
          bl.mesh.material.dispose();
          blasts.splice(i, 1);
        }
      }
    },

    hud() {
      return `bombs: ${bombs.length}`;
    },

    stop() {
      clear();
      rng = null;
    },
  };
}
