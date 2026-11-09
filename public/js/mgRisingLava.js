// Rising Lava: lava floods the arena and keeps rising. Climb the floating platforms
// (double jump helps). Touch the lava and you're out. Last one standing wins.

import { addBox, mulberry32 } from './mgShared.js';

const ARENA = { x: -140, y: 20, z: -150, w: 26, d: 26 };
const GRACE = 5;
const LAVA_START = ARENA.y - 3;
const SPREAD = 10.5; // platforms stay within this distance of the center
const TOP = ARENA.y + 62;

// Height of the lava s seconds after it starts rising (speeds up)
const lavaAt = (s) => LAVA_START + Math.max(0, s) * (0.36 + 0.0035 * Math.max(0, s));

export function createRisingLava(game) {
  const { THREE, scene } = game;

  addBox(game, { ...ARENA, top: ARENA.y, h: 1.5, color: 0x4a3a33 });

  // Climbing platforms: a few winding chains up to the top, the same for everyone
  const rng = mulberry32(7331);
  const colors = [0x9a8f86, 0x857a71, 0xa89c90];
  for (let chain = 0; chain < 3; chain++) {
    let angle = (chain / 3) * Math.PI * 2;
    let x = ARENA.x + Math.cos(angle) * 6;
    let z = ARENA.z + Math.sin(angle) * 6;
    let y = ARENA.y + 1.1;
    let heading = angle + Math.PI / 2;
    while (y < TOP) {
      const size = 2 + rng() * 0.8;
      addBox(game, { x, top: y, z, w: size, d: size, h: 0.5, color: colors[Math.floor(rng() * colors.length)] });
      heading += (rng() - 0.5) * 1.6;
      const dist = 3 + rng() * 1.3;
      let nx = x + Math.cos(heading) * dist;
      let nz = z + Math.sin(heading) * dist;
      // Turn back toward the middle if we'd wander out of the arena
      if (Math.hypot(nx - ARENA.x, nz - ARENA.z) > SPREAD) {
        heading = Math.atan2(ARENA.z - z, ARENA.x - x) + (rng() - 0.5) * 0.8;
        nx = x + Math.cos(heading) * dist;
        nz = z + Math.sin(heading) * dist;
      }
      x = nx;
      z = nz;
      y += 0.9 + rng() * 0.35;
    }
  }
  // Summit
  addBox(game, { x: ARENA.x, top: TOP + 1, z: ARENA.z, w: 3, d: 3, h: 0.5, color: 0xffc23a });

  const lava = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA.w + 6, 1, ARENA.d + 6),
    new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff3300, emissiveIntensity: 0.9, transparent: true, opacity: 0.88 })
  );
  lava.visible = false;
  scene.add(lava);

  let elapsed = 0;
  let running = false;
  let lavaY = LAVA_START;

  return {
    id: 'lava',
    name: 'Rising Lava',
    icon: '🌋',
    color: 0xff5a1a,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return [ARENA.x + Math.cos(a) * 9, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 9];
    },

    start() {
      elapsed = 0;
      running = true;
      lavaY = LAVA_START;
      lava.visible = true;
    },

    update(dt) {
      if (!running) return;
      elapsed += dt;
      lavaY = lavaAt(elapsed - GRACE);
      lava.position.set(ARENA.x, lavaY - 0.5 + Math.sin(elapsed * 2) * 0.05, ARENA.z);
      lava.material.emissiveIntensity = 0.8 + Math.sin(elapsed * 3) * 0.15;
    },

    isOut(p) {
      return running && p.y < lavaY + 0.05;
    },

    hud() {
      return elapsed < GRACE ? `lava rising in ${Math.ceil(GRACE - elapsed)}… climb!` : `lava at ${Math.max(0, lavaY - ARENA.y).toFixed(0)}m`;
    },

    stop() {
      running = false;
      lava.visible = false;
    },
  };
}
