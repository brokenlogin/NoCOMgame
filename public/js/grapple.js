// Grappling hook.
//   Left click:  fire the hook. It sticks to the ground / platforms / anything in world.colliders.
//   Scroll:      reel in (scroll up) or let out (scroll down) while hooked. Very sensitive on purpose.
//   Right click: let go; the hook flies back to you.
//
// The rope is a max-length constraint: slack when you're closer than its length, and pulls you
// toward the anchor when you're farther, so you can swing. Other players see your hook and rope
// through the `gh` field in your network state.

import { registerItem } from './items.js';

export function setupGrapple(game) {
  const { THREE, scene, CONFIG, camera } = game;

  // ---------- Visuals ----------
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const hookMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 });
  const ropeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true);
  ropeGeo.translate(0, 0.5, 0); // origin at one end so we can scale along +Y
  const hookGeo = new THREE.ConeGeometry(0.12, 0.35, 8);
  hookGeo.rotateX(Math.PI / 2); // point along +Z

  function makeRig() {
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    const hook = new THREE.Mesh(hookGeo, hookMat);
    rope.castShadow = hook.castShadow = true;
    rope.visible = hook.visible = false;
    scene.add(rope, hook);
    return { rope, hook };
  }

  const _up = new THREE.Vector3(0, 1, 0);
  const _d = new THREE.Vector3();
  function drawRig(rig, from, to, hookDir) {
    _d.subVectors(to, from);
    const len = _d.length();
    rig.rope.visible = rig.hook.visible = true;
    rig.rope.position.copy(from);
    rig.rope.scale.set(1, Math.max(len, 0.001), 1);
    if (len > 1e-4) rig.rope.quaternion.setFromUnitVectors(_up, _d.divideScalar(len));
    rig.hook.position.copy(to);
    if (hookDir && hookDir.lengthSq() > 1e-6) rig.hook.lookAt(_d.copy(to).add(hookDir));
  }
  function hideRig(rig) {
    rig.rope.visible = rig.hook.visible = false;
  }
  function disposeRig(rig) {
    scene.remove(rig.rope, rig.hook);
  }

  // ---------- Local hook ----------
  const local = {
    mode: 'idle', // idle | flying | attached | returning
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    traveled: 0,
    length: 0,
    rig: makeRig(),
  };
  const remoteRigs = new Map(); // player id -> { rig, target }
  const lastPlayerPos = new THREE.Vector3();
  let lastPlayer = null;

  // Where the rope leaves your hand (a bit right of and below your eyes)
  const handOffset = new THREE.Vector3(0.25, -0.3, -0.4);
  function handPos(out = new THREE.Vector3()) {
    return out.copy(handOffset).applyMatrix4(camera.matrixWorld);
  }
  function bodyCenter(player, out = new THREE.Vector3()) {
    return out.copy(player.position).setY(player.position.y + CONFIG.playerHeight / 2);
  }

  function fire() {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    handPos(local.pos);
    local.vel.copy(dir).multiplyScalar(CONFIG.grappleSpeed);
    local.traveled = 0;
    local.mode = 'flying';
  }

  function release() {
    if (local.mode === 'flying' || local.mode === 'attached') local.mode = 'returning';
  }

  const ray = new THREE.Raycaster();
  const _step = new THREE.Vector3();
  const _hand = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _toAnchor = new THREE.Vector3();

  game.addSystem((dt, game) => {
    const player = game.player;

    // New player (rejoined) or a big teleport (respawn, parkour checkpoint): drop the hook
    if (player !== lastPlayer || player.position.distanceToSquared(lastPlayerPos) > 15 * 15) {
      local.mode = 'idle';
    }
    lastPlayer = player;
    lastPlayerPos.copy(player.position);

    handPos(_hand);

    if (local.mode === 'flying') {
      const stepLen = local.vel.length() * dt;
      _step.copy(local.vel).normalize();
      ray.set(local.pos, _step);
      ray.far = stepLen;
      const hit = ray.intersectObjects(game.world.colliders, false)[0];
      if (hit) {
        local.pos.copy(hit.point);
        local.mode = 'attached';
        local.length = THREE.MathUtils.clamp(
          bodyCenter(player, _center).distanceTo(local.pos),
          CONFIG.grappleMinLength,
          CONFIG.grappleMaxLength
        );
      } else {
        local.pos.addScaledVector(local.vel, dt);
        local.traveled += stepLen;
        if (local.traveled > CONFIG.grappleRange) local.mode = 'returning';
      }
    }

    if (local.mode === 'attached') {
      // Rope constraint at the body center
      _toAnchor.subVectors(local.pos, bodyCenter(player, _center));
      const dist = _toAnchor.length();
      if (dist > local.length && dist > 1e-4) {
        _toAnchor.divideScalar(dist);
        const v = player.velocity;
        // Kill velocity moving away from the anchor
        const radial = v.dot(_toAnchor);
        if (radial < 0) v.addScaledVector(_toAnchor, -radial);
        // Pull in proportional to how over-stretched the rope is
        const pull = Math.min((dist - local.length) * CONFIG.grapplePullStiffness, CONFIG.grappleMaxPullSpeed);
        const now = v.dot(_toAnchor);
        if (now < pull) v.addScaledVector(_toAnchor, pull - now);
        // Keep swing momentum instead of ground/air friction eating it
        player.launched = true;
        player.knockbackTime = Math.max(player.knockbackTime, 0.05);
        if (_toAnchor.y > 0.2) player.onGround = false;
      }
    }

    if (local.mode === 'returning') {
      _step.subVectors(_hand, local.pos);
      const d = _step.length();
      const move = CONFIG.grappleReelSpeed * dt;
      if (d <= move + 0.5) local.mode = 'idle';
      else {
        local.pos.addScaledVector(_step.divideScalar(d), move);
        local.vel.copy(_step).multiplyScalar(-1);
      }
    }

    if (local.mode === 'idle') {
      hideRig(local.rig);
      delete player.extraState.gh;
    } else {
      drawRig(local.rig, _hand, local.pos, local.mode === 'attached' ? null : local.vel);
      player.extraState.gh = local.pos.toArray().map((n) => Math.round(n * 100) / 100);
    }

    // ---------- Other players' hooks ----------
    for (const [id, r] of remoteRigs) {
      if (!game.remotes.players.has(id)) {
        disposeRig(r.rig);
        remoteRigs.delete(id);
      }
    }
    for (const rp of game.remotes.players.values()) {
      const gh = rp.state?.gh;
      let r = remoteRigs.get(rp.id);
      if (!r) {
        if (!gh) continue;
        r = { rig: makeRig(), target: new THREE.Vector3() };
        remoteRigs.set(rp.id, r);
      }
      if (!Array.isArray(gh) || !rp.mesh.visible) {
        hideRig(r.rig);
        continue;
      }
      // Smooth the 20Hz updates a little
      r.target.fromArray(gh);
      const hookPos = r.rig.hook.position;
      if (!r.rig.hook.visible || hookPos.distanceTo(r.target) > 20) hookPos.copy(r.target);
      else hookPos.lerp(r.target, 1 - Math.exp(-20 * dt));
      _center.copy(rp.mesh.position).y += CONFIG.playerHeight * 0.65;
      drawRig(r.rig, _center, hookPos.clone(), hookPos.clone().sub(_center));
    }
  });

  // Remote rigs disappear when everyone leaves (e.g. we disconnect)
  game.net.on('close', () => {
    for (const r of remoteRigs.values()) disposeRig(r.rig);
    remoteRigs.clear();
    local.mode = 'idle';
    hideRig(local.rig);
  });

  // ---------- The item ----------
  registerItem({
    id: 'grappling-hook',
    name: 'Grappling Hook',
    icon: '🪝',
    description: 'Left click to fire, scroll to reel in/out, right click to let go.',
    cooldown: 0.15,
    anim: 'recoil',
    use() {
      fire();
    },
    altUse() {
      release();
    },
    wheel(ctx, deltaY) {
      if (local.mode !== 'attached') return false;
      local.length = THREE.MathUtils.clamp(
        local.length + deltaY * CONFIG.grappleScrollSensitivity,
        CONFIG.grappleMinLength,
        CONFIG.grappleMaxLength
      );
      return true;
    },
    onDeselect() {
      release();
    },
  });

  return {
    get state() {
      return { mode: local.mode, length: local.length, pos: local.pos.clone() };
    },
    fire,
    release,
  };
}
