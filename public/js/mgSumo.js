// Sumo Shrink: everyone gets a boxing glove on a round platform that keeps shrinking.
// Punch people off. Fall and you're out. Last one standing wins.

const ARENA = { x: -200, y: 20, z: 0, w: 30, d: 30 };
const R_START = 14;
const R_END = 3.5;
const GRACE = 4;
const SHRINK_TIME = 60; // seconds to go from R_START to R_END

export function createSumo(game) {
  const { THREE, scene, world } = game;

  // Unit cylinder scaled to the current radius (raycasts respect the scale)
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1.5, 64),
    new THREE.MeshStandardMaterial({ color: 0xe8d3a0, roughness: 0.9 })
  );
  ring.position.set(ARENA.x, ARENA.y - 0.75, ARENA.z);
  ring.receiveShadow = true;
  ring.castShadow = true;
  scene.add(ring);
  world.colliders.push(ring);

  // Red edge line so you can see where the edge is
  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.012, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0xd8392b })
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.set(ARENA.x, ARENA.y + 0.02, ARENA.z);
  scene.add(edge);

  let elapsed = 0;
  let running = false;

  function setRadius(r) {
    ring.scale.set(r, 1, r);
    edge.scale.set(r - 0.3, r - 0.3, 1);
    edge.material.color.setHex(r < 6 ? 0xff2200 : 0xd8392b);
  }
  setRadius(R_START);

  const radiusAt = (t) => {
    const k = Math.min(1, Math.max(0, (t - GRACE) / SHRINK_TIME));
    return R_START + (R_END - R_START) * k;
  };

  return {
    id: 'sumo',
    name: 'Sumo Shrink',
    icon: '🥊',
    color: 0xe8d3a0,
    arena: ARENA,
    items: ['boxing-glove'],

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return [ARENA.x + Math.cos(a) * 9, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 9];
    },

    start() {
      elapsed = 0;
      running = true;
      setRadius(R_START);
    },

    update(dt) {
      if (!running) return;
      elapsed += dt;
      setRadius(radiusAt(elapsed));
    },

    hud() {
      return elapsed < GRACE ? `shrinking in ${Math.ceil(GRACE - elapsed)}…` : 'punch them off!';
    },

    stop() {
      running = false;
      setRadius(R_START);
    },
  };
}
