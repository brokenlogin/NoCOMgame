// Knockback combat. There is no health: hits just launch people.
//
// Each client owns its own position, so the attacker decides who got hit and sends
//   { kind: 'knockback', target: <playerId>, v: [x, y, z] }
// and only the target applies it to themselves.
//
// API on game.combat:
//   knockback(targetId, v)                   launch another player (v = velocity change)
//   playersInCone(origin, dir, range, deg)   remote players in front of you
//   playersInRadius(origin, radius)          remote players near a point
//   spawnProjectile(opts)                    fire a projectile everyone can see
//   aim()                                    { origin, dir } from your eyes along your view

export function setupCombat(game) {
  const { THREE, scene, net, remotes, CONFIG } = game;
  const projectiles = new Map(); // pid -> projectile
  let nextPid = 1;

  const r = CONFIG.playerRadius;
  const h = CONFIG.playerHeight;

  // Center of a remote player's body
  function bodyCenter(rp, out = new THREE.Vector3()) {
    return out.copy(rp.mesh.position).setY(rp.mesh.position.y + h / 2);
  }

  function knockback(targetId, v) {
    const arr = Array.isArray(v) ? v : [v.x, v.y, v.z];
    net.sendEvent({ kind: 'knockback', target: targetId, v: arr.map((n) => Math.round(n * 100) / 100) });
    flash(targetId);
  }

  // Brief white flash on a player we hit, so the attacker sees it land
  function flash(id) {
    const rp = remotes.players.get(id);
    const mat = rp?.mesh.userData.body?.material;
    if (!mat) return;
    mat.emissive.setHex(0xffffff);
    mat.emissiveIntensity = 0.8;
    setTimeout(() => (mat.emissiveIntensity = 0), 120);
  }

  function aim() {
    const origin = game.camera.getWorldPosition(new THREE.Vector3());
    const dir = game.camera.getWorldDirection(new THREE.Vector3());
    return { origin, dir };
  }

  function playersInCone(origin, dir, range, degrees) {
    const cosLimit = Math.cos(THREE.MathUtils.degToRad(degrees));
    const out = [];
    const c = new THREE.Vector3();
    for (const rp of remotes.players.values()) {
      if (!rp.mesh.visible) continue;
      bodyCenter(rp, c).sub(origin);
      const dist = c.length();
      // Count the target's body width so point-blank hits always land
      if (dist > range + r) continue;
      if (dist > r * 1.5 && c.normalize().dot(dir) < cosLimit) continue;
      out.push({ player: rp, dist });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  function playersInRadius(origin, radius) {
    const out = [];
    const c = new THREE.Vector3();
    for (const rp of remotes.players.values()) {
      if (!rp.mesh.visible) continue;
      const dist = bodyCenter(rp, c).distanceTo(origin);
      if (dist <= radius + r) out.push({ player: rp, dist });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  // ---------- Projectiles ----------
  // opts: { type, p:[x,y,z], v:[x,y,z], gravity, radius, life, color, knockback(dirVec3) -> [x,y,z] }
  // The shooter's copy is "authoritative" (does hit detection); everyone else just draws it.
  const PROJECTILE_LOOKS = {
    potato: (THREE) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.9 })
      );
      m.scale.set(1.3, 0.9, 0.9);
      return m;
    },
  };

  function makeProjectileMesh(type) {
    const make = PROJECTILE_LOOKS[type];
    const mesh = make
      ? make(THREE)
      : new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    mesh.castShadow = true;
    return mesh;
  }

  function addProjectile({ pid, type, p, v, gravity = CONFIG.gravity, radius = 0.25, life = 4, owned, onHit }) {
    const mesh = makeProjectileMesh(type);
    mesh.position.fromArray(p);
    scene.add(mesh);
    const proj = { pid, mesh, vel: new THREE.Vector3().fromArray(v), gravity, radius, life, owned, onHit };
    projectiles.set(pid, proj);
    return proj;
  }

  function removeProjectile(pid, broadcast) {
    const proj = projectiles.get(pid);
    if (!proj) return;
    scene.remove(proj.mesh);
    proj.mesh.geometry.dispose();
    proj.mesh.material.dispose();
    projectiles.delete(pid);
    if (broadcast) net.sendEvent({ kind: 'projectileGone', pid });
  }

  function spawnProjectile({ type, p, v, gravity, radius, life, onHit }) {
    const pid = `${net.id}-${nextPid++}`;
    addProjectile({ pid, type, p, v, gravity, radius, life, owned: true, onHit });
    net.sendEvent({ kind: 'projectile', pid, type, p, v, gravity, radius, life });
    return pid;
  }

  const c = new THREE.Vector3();
  game.addSystem((dt) => {
    for (const proj of [...projectiles.values()]) {
      proj.vel.y -= proj.gravity * dt;
      proj.mesh.position.addScaledVector(proj.vel, dt);
      proj.mesh.rotation.x += dt * 8;
      proj.life -= dt;

      const pos = proj.mesh.position;
      if (proj.owned) {
        // Hit a player? (point vs. upright cylinder)
        for (const rp of remotes.players.values()) {
          if (!rp.mesh.visible) continue;
          const o = rp.mesh.position;
          const dx = pos.x - o.x;
          const dz = pos.z - o.z;
          if (dx * dx + dz * dz > (r + proj.radius) ** 2) continue;
          if (pos.y < o.y - proj.radius || pos.y > o.y + h + proj.radius) continue;
          proj.onHit?.(rp, proj.vel.clone());
          removeProjectile(proj.pid, true);
          break;
        }
        if (!projectiles.has(proj.pid)) continue;
      }

      if (pos.y < -20 || proj.life <= 0 || hitsWorld(pos, proj.radius)) {
        removeProjectile(proj.pid, proj.owned);
      }
    }
  });

  // Does a point touch anything solid (terrain, platforms)?
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  function hitsWorld(pos, radius) {
    if (pos.y > 50) return false;
    c.copy(pos).y += radius;
    ray.set(c, down);
    ray.far = radius * 2;
    return ray.intersectObjects(game.world.colliders, false).length > 0;
  }

  // ---------- Incoming events ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'knockback':
        if (msg.target === net.id && game.player && Array.isArray(msg.v)) game.player.applyKnockback(msg.v);
        break;
      case 'projectile':
        if (typeof msg.pid !== 'string' || projectiles.has(msg.pid)) return;
        if (!Array.isArray(msg.p) || !Array.isArray(msg.v)) return;
        addProjectile({ ...msg, owned: false });
        break;
      case 'projectileGone':
        removeProjectile(msg.pid, false);
        break;
    }
  });

  // Clean up when leaving a room
  net.on('close', () => {
    for (const pid of [...projectiles.keys()]) removeProjectile(pid, false);
  });

  return { knockback, playersInCone, playersInRadius, spawnProjectile, aim, bodyCenter };
}
