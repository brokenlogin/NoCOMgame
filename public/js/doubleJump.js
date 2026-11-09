// Double jump: press Space again in the air for one extra jump. Resets when you land.
// Works with gravity flipped too (jumps "up" away from whatever you're falling toward).

export function setupDoubleJump(game) {
  const { THREE, scene, CONFIG } = game;
  let owner = null;
  let wasDown = false;
  let wasGround = true;
  let airJumps = 0;
  const AIR_JUMPS = 1;

  // Little ring puff under your feet when you double jump
  const puffs = [];
  const puffGeo = new THREE.RingGeometry(0.3, 0.5, 24);

  function puff(pos) {
    const mesh = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    scene.add(mesh);
    puffs.push({ mesh, t: 0 });
  }

  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      airJumps = 0;
      wasDown = false;
    }

    const down = game.input.isDown('Space');
    if (player.onGround) airJumps = 0;
    // Fresh press while airborne (and not the same frame we jumped off the ground)
    if (down && !wasDown && !player.onGround && !wasGround && airJumps < AIR_JUMPS) {
      airJumps++;
      player.velocity.y = -player.gravityDir * CONFIG.jumpVelocity;
      puff(player.position);
    }
    wasDown = down;
    wasGround = player.onGround;

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.t += dt;
      const s = 1 + p.t * 6;
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = Math.max(0, 0.8 - p.t * 2.5);
      if (p.t > 0.35) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        puffs.splice(i, 1);
      }
    }
  });
}
