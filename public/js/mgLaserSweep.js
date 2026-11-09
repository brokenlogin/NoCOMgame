// Laser Sweep: red laser arms sweep around a round platform at ankle height. Jump over them!
// Get hit and you're launched (probably off the edge). More arms join and they speed up.
// Fall and you're out. Last one standing wins.
//
// Arm angles come from the time since the round started, so everyone sees the same thing.
// Each client only checks whether its own player got hit.

const ARENA = { x: -140, y: 20, z: 150, w: 28, d: 28 };
const RADIUS = 13;
const BEAM_H = 0.45; // beam center height above the floor
const BEAM_THICK = 0.25;
const GRACE = 3;
// [start time, direction, speed multiplier, starting angle]
const ARMS = [
  [0, 1, 1, 0],
  [20, -1, 0.85, Math.PI],
  [45, 1, 1.15, Math.PI / 2],
  [70, -1, 1.3, -Math.PI / 2],
];

export function createLaserSweep(game) {
  const { THREE, scene, world } = game;

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS, 1.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6, metalness: 0.2 })
  );
  floor.position.set(ARENA.x, ARENA.y - 0.75, ARENA.z);
  floor.receiveShadow = true;
  scene.add(floor);
  world.colliders.push(floor);

  // Center post the arms spin around (solid, so you can't hide inside it)
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 2.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x555b66, emissive: 0xff2020, emissiveIntensity: 0.15 })
  );
  post.position.set(ARENA.x, ARENA.y + 1.25, ARENA.z);
  scene.add(post);
  world.solidBoxes.push(new THREE.Box3(
    new THREE.Vector3(ARENA.x - 0.9, ARENA.y, ARENA.z - 0.9),
    new THREE.Vector3(ARENA.x + 0.9, ARENA.y + 2.5, ARENA.z + 0.9)
  ));

  const beamGeo = new THREE.BoxGeometry(RADIUS - 0.9, BEAM_THICK, BEAM_THICK);
  beamGeo.translate((RADIUS - 0.9) / 2 + 0.9, 0, 0); // pivot at the center
  const arms = ARMS.map(() => {
    const mesh = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9 })
    );
    mesh.position.set(ARENA.x, ARENA.y + BEAM_H, ARENA.z);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  let elapsed = 0;
  let running = false;
  let hitCooldown = 0;

  // Angle of an arm after it has been spinning for s seconds (speeds up over time)
  const angleAt = ([, dir, mult, a0], s) => a0 + dir * mult * (0.9 * s + 0.008 * s * s);

  return {
    id: 'laser',
    name: 'Laser Sweep',
    icon: '🔴',
    color: 0xff2a2a,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.3;
      return [ARENA.x + Math.cos(a) * 7, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 7];
    },

    start() {
      elapsed = 0;
      running = true;
      hitCooldown = 0;
    },

    update(dt, ctx) {
      if (!running) return;
      elapsed += dt;
      hitCooldown = Math.max(0, hitCooldown - dt);
      const t = elapsed - GRACE;
      const player = game.player;

      ARMS.forEach((arm, i) => {
        const mesh = arms[i];
        const s = t - arm[0];
        mesh.visible = s > -2; // show it a couple of seconds before it starts
        if (!mesh.visible) return;
        const active = s >= 0;
        const angle = angleAt(arm, Math.max(0, s));
        mesh.rotation.y = -angle;
        mesh.material.opacity = active ? 0.9 : 0.3 + 0.3 * Math.sin(elapsed * 12);
        if (!active || !ctx.meAlive || hitCooldown > 0 || !player) return;

        // Did it hit me? Feet below the top of the beam and close to the arm's line.
        const p = player.position;
        const h = p.y - ARENA.y;
        if (h > BEAM_H + BEAM_THICK / 2 + 0.05 || h < -1) return;
        const dx = p.x - ARENA.x, dz = p.z - ARENA.z;
        const r = Math.hypot(dx, dz);
        if (r < 1 || r > RADIUS + 0.5) return;
        const ax = Math.cos(angle), az = Math.sin(angle);
        const along = dx * ax + dz * az;
        const across = Math.abs(dx * az - dz * ax);
        if (along <= 0 || across > 0.55) return;

        // Launch along the sweep direction and a bit outward
        const dir = arm[1];
        const tx = -az * dir, tz = ax * dir;
        player.applyKnockback([tx * 20 + (dx / r) * 8, 8, tz * 20 + (dz / r) * 8]);
        hitCooldown = 0.6;
      });
    },

    hud() {
      return elapsed < GRACE ? `lasers in ${Math.ceil(GRACE - elapsed)}…` : 'jump the lasers!';
    },

    stop() {
      running = false;
      for (const m of arms) m.visible = false;
    },
  };
}
