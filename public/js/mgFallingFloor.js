// Falling Floor: two layers of tiles. Every tile someone steps on shakes and drops away.
// Fall through both layers and you're out. Last one standing wins.
//
// Every client drops tiles under everyone it can see, so the floors stay roughly in sync.

const TOP = 20;
const BOTTOM = 12;
const N = 14; // tiles per side
const T = 2; // tile size
const ARENA = { x: -200, y: BOTTOM, z: 80, w: N * T, d: N * T };
const SHAKE = 0.45; // seconds a tile wobbles before it falls
const GRACE = 2;

export function createFallingFloor(game) {
  const { THREE, scene, world } = game;
  const geo = new THREE.BoxGeometry(T, 0.4, T); // tiles touch, so there are no gaps to slip through
  const layers = [
    { y: TOP, colors: [0x8fd8ff, 0x6cc4f5] },
    { y: BOTTOM, colors: [0xff9ccf, 0xf57bb8] },
  ];
  const x0 = ARENA.x - ARENA.w / 2;
  const z0 = ARENA.z - ARENA.d / 2;

  const grid = layers.map(({ y, colors }) => {
    const tiles = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[(i + j) % 2], roughness: 0.5 }));
        const home = new THREE.Vector3(x0 + (i + 0.5) * T, y - 0.2, z0 + (j + 0.5) * T);
        mesh.position.copy(home);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        world.colliders.push(mesh);
        tiles.push({ mesh, home, state: 'solid', t: 0, vy: 0 });
      }
    }
    return { y, tiles };
  });

  const active = new Set();
  let elapsed = 0;

  function reset() {
    active.clear();
    for (const { tiles } of grid) {
      for (const tile of tiles) {
        tile.state = 'solid';
        tile.t = 0;
        tile.vy = 0;
        tile.mesh.position.copy(tile.home);
        tile.mesh.visible = true;
        if (!world.colliders.includes(tile.mesh)) world.colliders.push(tile.mesh);
      }
    }
  }

  function trigger(layer, x, z) {
    const i = Math.floor((x - x0) / T);
    const j = Math.floor((z - z0) / T);
    if (i < 0 || j < 0 || i >= N || j >= N) return;
    const tile = layer.tiles[i * N + j];
    if (tile.state !== 'solid') return;
    tile.state = 'shaking';
    tile.t = 0;
    active.add(tile);
  }

  return {
    id: 'floor',
    name: 'Falling Floor',
    icon: '🧊',
    color: 0x8fd8ff,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      // Snap to the middle of a tile
      const snap = (v, o) => o + (Math.floor((v - o) / T) + 0.5) * T;
      return [snap(ARENA.x + Math.cos(a) * 8, x0), TOP + 0.5, snap(ARENA.z + Math.sin(a) * 8, z0)];
    },

    start() {
      reset();
      elapsed = 0;
    },

    update(dt, ctx) {
      elapsed += dt;
      if (elapsed > GRACE) {
        for (const p of ctx.targets) {
          for (const layer of grid) {
            if (Math.abs(p.y - layer.y) < 0.35) trigger(layer, p.x, p.z);
          }
        }
      }
      for (const tile of active) {
        tile.t += dt;
        if (tile.state === 'shaking') {
          tile.mesh.position.set(
            tile.home.x + (Math.random() - 0.5) * 0.12,
            tile.home.y,
            tile.home.z + (Math.random() - 0.5) * 0.12
          );
          if (tile.t >= SHAKE) {
            tile.state = 'falling';
            tile.t = 0;
            const k = world.colliders.indexOf(tile.mesh);
            if (k >= 0) world.colliders.splice(k, 1);
          }
        } else {
          tile.vy -= 20 * dt;
          tile.mesh.position.y += tile.vy * dt;
          if (tile.t > 1.5) {
            tile.mesh.visible = false;
            active.delete(tile);
          }
        }
      }
    },

    hud() {
      return "don't stop moving";
    },

    stop() {
      reset();
    },
  };
}
