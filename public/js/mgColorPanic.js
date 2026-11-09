// Color Panic: the floor is a grid of colored tiles. A color is called out, then every
// tile that ISN'T that color vanishes for a moment. Be standing on the right color.
// Rounds get faster. Fall and you're out. Last one standing wins.
//
// Every client runs the same timeline from the shared seed.

import { mulberry32 } from './mgShared.js';

const N = 8;
const T = 3.5;
const ARENA = { x: -200, y: 20, z: -80, w: N * T, d: N * T };
const COLORS = [
  { hex: 0xff4d4d, css: '#ff6b6b', name: 'RED' },
  { hex: 0x3d8bff, css: '#6aa8ff', name: 'BLUE' },
  { hex: 0x3ddc6e, css: '#5be38a', name: 'GREEN' },
  { hex: 0xffd23d, css: '#ffdd55', name: 'YELLOW' },
  { hex: 0xb44dff, css: '#c77dff', name: 'PURPLE' },
];
const GRACE = 3;
const DROP = 2.2; // seconds the wrong tiles stay gone
const BACK = 0.8; // pause after they come back

export function createColorPanic(game) {
  const { THREE, scene, world } = game;
  const geo = new THREE.BoxGeometry(T, 0.5, T); // tiles touch, so there are no gaps to slip through
  const x0 = ARENA.x - ARENA.w / 2;
  const z0 = ARENA.z - ARENA.d / 2;

  const tiles = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 }));
      mesh.position.set(x0 + (i + 0.5) * T, ARENA.y - 0.25, z0 + (j + 0.5) * T);
      mesh.receiveShadow = true;
      scene.add(mesh);
      world.colliders.push(mesh);
      tiles.push({ mesh, color: 0 });
    }
  }

  // Big floating cube that shows the color to find
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 })
  );
  beacon.position.set(ARENA.x, ARENA.y + 9, ARENA.z);
  scene.add(beacon);

  let rng = null;
  let elapsed = 0;
  let phase = 'idle'; // grace | show | drop | back
  let phaseEnd = 0;
  let cycle = 0;
  let target = -1;

  function setTileVisible(tile, on) {
    tile.mesh.visible = on;
    const k = world.colliders.indexOf(tile.mesh);
    if (on && k < 0) world.colliders.push(tile.mesh);
    if (!on && k >= 0) world.colliders.splice(k, 1);
  }

  function paint() {
    for (const tile of tiles) {
      tile.color = Math.floor(rng() * COLORS.length);
      tile.mesh.material.color.setHex(COLORS[tile.color].hex);
    }
    target = Math.floor(rng() * COLORS.length);
    // Make sure there are always a few safe tiles
    for (let k = 0; k < 4; k++) {
      const tile = tiles[Math.floor(rng() * tiles.length)];
      tile.color = target;
      tile.mesh.material.color.setHex(COLORS[target].hex);
    }
    beacon.material.color.setHex(COLORS[target].hex);
    beacon.material.emissive.setHex(COLORS[target].hex);
  }

  function resetFloor() {
    for (const tile of tiles) setTileVisible(tile, true);
  }

  return {
    id: 'colors',
    name: 'Color Panic',
    icon: '🎨',
    color: 0xffd23d,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      // Snap to the middle of a tile
      const snap = (v, o) => o + (Math.floor((v - o) / T) + 0.5) * T;
      return [snap(ARENA.x + Math.cos(a) * 8, x0), ARENA.y + 0.5, snap(ARENA.z + Math.sin(a) * 8, z0)];
    },

    start({ seed }) {
      rng = mulberry32(seed);
      elapsed = 0;
      cycle = 0;
      target = -1;
      resetFloor();
      for (const tile of tiles) {
        tile.color = Math.floor(rng() * COLORS.length);
        tile.mesh.material.color.setHex(COLORS[tile.color].hex);
      }
      beacon.material.color.setHex(0xffffff);
      beacon.material.emissive.setHex(0xffffff);
      phase = 'grace';
      phaseEnd = GRACE;
    },

    update(dt) {
      beacon.rotation.y += dt;
      beacon.rotation.x += dt * 0.6;
      if (phase === 'idle') return;
      elapsed += dt;
      while (elapsed >= phaseEnd) {
        if (phase === 'grace' || phase === 'back') {
          paint();
          phase = 'show';
          phaseEnd += Math.max(1.4, 4.5 - cycle * 0.3);
          cycle++;
        } else if (phase === 'show') {
          for (const tile of tiles) if (tile.color !== target) setTileVisible(tile, false);
          phase = 'drop';
          phaseEnd += DROP;
        } else {
          resetFloor();
          phase = 'back';
          phaseEnd += BACK;
        }
      }
      // Blink the beacon as time runs out
      if (phase === 'show') beacon.visible = phaseEnd - elapsed > 1 || Math.sin(elapsed * 25) > 0;
      else beacon.visible = true;
    },

    hud() {
      if (phase === 'grace') return `get ready… ${Math.ceil(phaseEnd - elapsed)}`;
      if (phase === 'show' || phase === 'drop') {
        const left = phase === 'show' ? ` ${Math.ceil(phaseEnd - elapsed)}` : '';
        return `stand on ${COLORS[target].name}!${left}`;
      }
      return '';
    },

    stop() {
      phase = 'idle';
      resetFloor();
      beacon.visible = true;
    },
  };
}
