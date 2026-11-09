// Air dash: press Shift while in the air to burst in the direction you're moving
// (or where you're looking if you aren't pressing a direction). One dash per jump by
// default; landing refills it. Works with flipped gravity too.

export function setupAirDash(game) {
  const { THREE, CONFIG, input, camera } = game;
  const cfg = CONFIG.airDash;
  const dir = new THREE.Vector3();

  let charges = cfg.charges;
  let fovKick = 0;
  let owner = null;

  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      charges = cfg.charges;
    }

    if (player.onGround) charges = cfg.charges;

    // Read the key every frame so a Shift pressed on the ground doesn't fire later in the air
    const pressed = input.consumeKey('ShiftLeft', 'ShiftRight');
    if (pressed && !player.onGround && charges > 0) {
      charges--;
      dash(player);
    }

    // Ease the FOV kick back out
    if (fovKick > 0.01 || camera.fov !== CONFIG.fov) {
      fovKick *= Math.exp(-8 * dt);
      camera.fov = CONFIG.fov + fovKick;
      camera.updateProjectionMatrix();
    }
  });

  function dash(player) {
    // Direction: WASD relative to where you face, otherwise straight ahead
    let fx = 0, fz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;
    if (player.gravityFlipped) fx = -fx; // matches how movement works upside down
    if (fx === 0 && fz === 0) fz = -1;
    dir.set(fx, 0, fz).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, player.yaw);

    player.velocity.x = dir.x * cfg.speed;
    player.velocity.z = dir.z * cfg.speed;
    // Cancel the fall and hop a little, "up" being away from your gravity
    const up = player.gravityDir === 1 ? -1 : 1;
    player.velocity.y = up * Math.max(player.velocity.y * up, cfg.lift);

    // Keep the momentum instead of air control slowing it down right away
    player.launched = true;
    player.knockbackTime = Math.max(player.knockbackTime || 0, 0.15);

    fovKick = cfg.fovKick;
    game.net.sendEvent({ kind: 'airDash', p: player.getState().p });
  }

  // A little puff where other players dash
  const puffGeo = new THREE.SphereGeometry(0.5, 10, 8);
  game.net.on('event', (msg) => {
    if (msg.kind !== 'airDash' || !Array.isArray(msg.p)) return;
    const puff = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })
    );
    puff.position.fromArray(msg.p).y += CONFIG.playerHeight / 2;
    game.scene.add(puff);
    const start = performance.now();
    (function fade() {
      const t = (performance.now() - start) / 300;
      if (t >= 1) {
        game.scene.remove(puff);
        puff.material.dispose();
        return;
      }
      puff.scale.setScalar(1 + t * 1.5);
      puff.material.opacity = 0.6 * (1 - t);
      requestAnimationFrame(fade);
    })();
  });

  return {
    get charges() {
      return charges;
    },
  };
}
