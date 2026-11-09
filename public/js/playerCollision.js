import { CONFIG } from './config.js';

// Keeps the local player from walking through other players.
// Each client only moves itself, so we push *our* capsule out of everyone else's.
// You can also land and stand on someone's head.
//
// Capsules are treated as vertical cylinders (radius r, height h) for overlap,
// which is close enough for upright capsules and much cheaper.
export function resolvePlayerCollisions(player, remotes) {
  const r = CONFIG.playerRadius;
  const h = CONFIG.playerHeight;
  const minDist = r * 2;
  const pos = player.position;

  for (const rp of remotes.players.values()) {
    if (!rp.mesh.visible) continue;
    const other = rp.mesh.position;

    const dx = pos.x - other.x;
    const dz = pos.z - other.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) continue;

    // Either player may have gravity flipped (G key): then their body hangs *below* their feet
    const g = player.gravityDir ?? -1;
    const otherFlipped = Math.abs(rp.mesh.rotation.z) > Math.PI / 2;
    const otherBottom = otherFlipped ? other.y - h : other.y;
    const otherTop = otherBottom + h;
    const myBottom = g < 0 ? pos.y : pos.y - h;

    // No vertical overlap -> no collision
    if (myBottom >= otherTop || myBottom + h <= otherBottom) continue;

    // Landing on them: we're falling (toward our gravity) and our feet are near the end of their capsule
    const falling = player.velocity.y * g >= 0;
    const tol = CONFIG.headLandTolerance;
    if (falling && (g < 0 ? pos.y > otherTop - tol : pos.y < otherBottom + tol)) {
      pos.y = g < 0 ? otherTop : otherBottom;
      player.velocity.y = 0;
      player.onGround = true;
      continue;
    }

    // Otherwise push out sideways
    const dist = Math.sqrt(distSq);
    let nx, nz;
    if (dist > 1e-4) {
      nx = dx / dist;
      nz = dz / dist;
    } else {
      // Exactly on top of each other: pick a direction
      const a = Math.random() * Math.PI * 2;
      nx = Math.cos(a);
      nz = Math.sin(a);
    }
    const push = minDist - dist;
    pos.x += nx * push;
    pos.z += nz * push;

    // Remove the part of our velocity heading into them
    const into = player.velocity.x * nx + player.velocity.z * nz;
    if (into < 0) {
      player.velocity.x -= into * nx;
      player.velocity.z -= into * nz;
    }
  }
}
