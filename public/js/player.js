import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCapsuleMesh, animateCharacter, setJetFlames } from './capsule.js';
import { LOCAL_BODY_LAYER } from './camera.js';

const _wish = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const STEP_HEIGHT = 0.45; // walls shorter than this don't block you sideways
const STEP_DOWN = 0.6; // how far down a slope/ledge you stay glued to the ground while walking

// The local, keyboard-controlled player.
export class LocalPlayer {
  constructor({ scene, colliders, world, input, color, name }) {
    this.input = input;
    this.colliders = colliders;
    this.world = world;
    this.mesh = createCapsuleMesh(color); // no name tag over your own head
    this.mesh.userData.isLocalPlayer = true;
    // Hide your own body from your first-person view (it still casts a shadow)
    this.mesh.traverse((o) => o.layers.set(LOCAL_BODY_LAYER));
    scene.add(this.mesh);

    this.position = this.mesh.position; // feet position
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // facing, driven by the camera
    this.pitch = 0; // looking up/down, driven by the camera
    this.extraState = {}; // merged into getState() and sent to other players
    this.onGround = false;
    this.name = name;
    this.raycaster = new THREE.Raycaster();

    // Gravity: -1 pulls toward the ground, +1 pulls toward the roof
    this.gravityDir = -1;
    this.flipRoll = 0; // 0 = upright, PI = upside down (animated)
    this.flipsLeft = 2; // gravity flips allowed before you have to land again

    this.health = CONFIG.maxHealth;
    this.fuel = 1; // jetpack fuel, 0..1
    this.jetpackOn = false;
    this.onDamage = null; // (amount, cause) => {}
    this.onDeath = null; // (cause) => {}

    this.respawn();
  }

  get gravityFlipped() {
    return this.gravityDir === 1;
  }

  // G key: fall toward the roof (or back down).
  // You get 2 flips per landing (so you can undo a mistake), which stops "spam G to fly forever".
  flipGravity() {
    if (this.flipsLeft <= 0) return false;
    this.flipsLeft--;
    this.gravityDir *= -1;
    this.onGround = false;
    return true;
  }

  respawn() {
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * 5, z = Math.sin(a) * 5;
    const groundY = this.world ? this.world.terrain.groundHeight(x, z) : 0;
    this.position.set(x, groundY + 1, z);
    this.velocity.set(0, 0, 0);
    this.launched = false;
    this.knockbackTime = 0;
    this.gravityDir = -1;
    this.flipRoll = 0;
    this.flipsLeft = 2;
    this.health = CONFIG.maxHealth;
    this.fuel = 1;
  }

  // Get launched. `v` is a velocity change [x, y, z] (or Vector3) in m/s.
  // The y part means "up away from your gravity", so it still works with gravity flipped.
  applyKnockback(v) {
    const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];
    if (![x, y, z].every(Number.isFinite)) return;
    const max = CONFIG.maxKnockback;
    const up = -this.gravityDir; // +1 normally, -1 when walking on the roof
    this.velocity.x = THREE.MathUtils.clamp(this.velocity.x + x, -max, max);
    this.velocity.z = THREE.MathUtils.clamp(this.velocity.z + z, -max, max);
    // Always pop up a little so we leave the ground and actually fly
    const vUp = THREE.MathUtils.clamp(Math.max(this.velocity.y * up, 0) + y, CONFIG.knockbackMinLift, max);
    this.velocity.y = vUp * up;
    this.onGround = false;
    this.launched = true;
    this.knockbackTime = CONFIG.knockbackStun;
  }

  takeDamage(amount, cause = '') {
    if (this.health <= 0 || amount <= 0) return;
    if (performance.now() < (this.invincibleUntil || 0)) return; // God Potion
    this.health = Math.max(0, this.health - amount);
    this.onDamage?.(amount, cause);
    if (this.health <= 0) {
      this.onDeath?.(cause);
      this.respawn();
    }
  }

  update(dt) {
    const input = this.input;
    const g = this.gravityDir;

    // --- Horizontal movement relative to facing ---
    let fx = 0, fz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;
    // Upside down, your screen's left/right are swapped
    if (this.gravityFlipped) fx = -fx;

    _wish.set(fx, 0, fz);
    if (_wish.lengthSq() > 0) _wish.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);

    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const maxSpeed = sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;

    // Knocked back: keep momentum until we've landed and the stun has worn off
    this.knockbackTime = Math.max(0, this.knockbackTime - dt);
    if (this.launched && this.onGround && this.knockbackTime <= 0) this.launched = false;

    if (this.launched) {
      // Momentum-preserving air control: you can steer, but can't cancel the hit
      const along = this.velocity.x * _wish.x + this.velocity.z * _wish.z;
      const add = Math.min(CONFIG.airAccel * dt, Math.max(0, maxSpeed - along));
      this.velocity.x += _wish.x * add;
      this.velocity.z += _wish.z * add;
      const drag = Math.max(0, 1 - (this.onGround ? CONFIG.knockbackGroundDrag : CONFIG.knockbackAirDrag) * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    } else {
      const accel = this.onGround ? CONFIG.groundAccel : CONFIG.airAccel;
      this.velocity.x = approach(this.velocity.x, _wish.x * maxSpeed, accel * dt);
      this.velocity.z = approach(this.velocity.z, _wish.z * maxSpeed, accel * dt);

      if (this.onGround && _wish.lengthSq() === 0) {
        const f = Math.max(0, 1 - CONFIG.groundFriction * dt);
        this.velocity.x *= f;
        this.velocity.z *= f;
      }
    }

    // --- Jumping & gravity ---
    if (this.onGround && input.isDown('Space')) {
      this.velocity.y = -g * CONFIG.jumpVelocity;
      this.onGround = false;
    }
    this.velocity.y += g * CONFIG.gravity * (this.gravityScale ?? 1) * dt; // gravityScale: low gravity in space

    // --- Jetpack: PRESS and HOLD Shift while in the air (on the ground Shift still sprints).
    // A quick TAP of Shift in the air is the air dash (airDash.js), so the jetpack
    // only kicks in once Shift has been held in the air for a moment.
    // Shift that you were already holding when you left the ground (sprint-jumping)
    // doesn't count: let go and press it again in the air to fly.
    const J = CONFIG.jetpack;
    const shiftPressedNow = sprint && !this.shiftWasDown;
    this.shiftWasDown = sprint;
    if (!sprint || this.onGround) this.jetArmed = false;
    else if (shiftPressedNow) this.jetArmed = true;
    this.shiftAirTime = this.jetArmed ? (this.shiftAirTime || 0) + dt : 0;
    this.jetpackOn = this.shiftAirTime > J.holdDelay && this.fuel > 0;
    if (this.jetpackOn) {
      const up = -g; // "up" away from your gravity
      const vUp = this.velocity.y * up;
      if (vUp < J.maxRiseSpeed) this.velocity.y += up * Math.min(J.thrust * dt, J.maxRiseSpeed - vUp + CONFIG.gravity * dt);
      this.fuel = Math.max(0, this.fuel - J.burnRate * dt);
    } else if (this.onGround) {
      this.fuel = Math.min(1, this.fuel + J.refillRate * dt);
    }

    // --- Integrate ---
    this.position.addScaledVector(this.velocity, dt);

    // --- Ground check: ray "down" (toward gravity) from inside the capsule ---
    // If we were standing (and didn't just jump or get launched), also reach a bit further
    // so walking downhill keeps your feet on the ground instead of hopping.
    const stickDown = this.onGround && !this.launched ? STEP_DOWN : 0;
    this.onGround = false;
    if (this.velocity.y * g >= 0) {
      const probe = 1.0;
      _origin.copy(this.position).y -= g * probe;
      _rayDir.set(0, g, 0);
      this.raycaster.set(_origin, _rayDir);
      // Reach far enough to catch however far we sank this frame
      this.raycaster.far = probe + Math.abs(this.velocity.y) * dt + 0.05 + stickDown;
      const hit = this.raycaster.intersectObjects(this.colliders, false)[0];
      if (hit) {
        this.position.y = hit.point.y;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    this.pushOutOfWalls();
    this.keepInsideTerrain();
    if (this.onGround) this.flipsLeft = 2;

    const roofTop = CONFIG.terrain.roofHeight;
    if (this.position.y < CONFIG.killY || this.position.y > roofTop - CONFIG.killY) this.respawn();

    // Smoothly roll the body/camera when gravity flips
    const targetRoll = this.gravityFlipped ? Math.PI : 0;
    this.flipRoll = approach(this.flipRoll, targetRoll, 7 * dt);

    this.mesh.rotation.set(0, this.yaw, this.flipRoll);
    animateCharacter(this.mesh, Math.hypot(this.velocity.x, this.velocity.z), this.onGround, dt);
    setJetFlames(this.mesh, this.jetpackOn);
  }

  // The ground and roof are heightmaps, so we can check them exactly. This catches the cases
  // the ground ray misses: walking into steep hills or roof spikes, and flying (jetpack,
  // knockback, gravity flips) head-first through the roof or ground.
  keepInsideTerrain() {
    const T = this.world?.terrain;
    if (!T) return;
    const p = this.position;
    const H = CONFIG.playerHeight;
    const g = this.gravityDir;
    const groundY = T.groundHeight(p.x, p.z);
    const roofY = T.roofHeight(p.x, p.z);
    // Feet and head, whichever way up we are
    const bottom = g < 0 ? p.y : p.y - H;
    const top = bottom + H;
    // Only count it as landing if we were actually falling onto that surface,
    // not when jumping/flying up a slope and clipping it on the way.
    if (bottom < groundY) {
      p.y += groundY - bottom;
      const falling = this.velocity.y <= 0;
      if (falling) this.velocity.y = 0;
      if (g < 0 && falling) this.onGround = true;
    } else if (top > roofY) {
      p.y -= top - roofY;
      const falling = this.velocity.y >= 0;
      if (falling) this.velocity.y = 0;
      if (g > 0 && falling) this.onGround = true;
    }
  }

  // Keep the player's body out of solid blocks (walls, towers...)
  pushOutOfWalls() {
    const r = CONFIG.playerRadius;
    const p = this.position;
    const g = this.gravityDir;
    // Vertical span of the body, ignoring the bottom bit so small ledges don't block you
    const yMin = g < 0 ? p.y + STEP_HEIGHT : p.y - CONFIG.playerHeight;
    const yMax = g < 0 ? p.y + CONFIG.playerHeight : p.y - STEP_HEIGHT;
    for (const box of this.world?.solidBoxes || []) {
      if (box.max.y < yMin || box.min.y > yMax) continue;
      const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        // Center is inside the box: push out the shortest way
        const opts = [
          [box.min.x - r - p.x, 0],
          [box.max.x + r - p.x, 0],
          [0, box.min.z - r - p.z],
          [0, box.max.z + r - p.z],
        ];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += opts[0][0];
        p.z += opts[0][1];
      }
      // Hitting your head on a block: stop moving into it
      if ((g < 0 && this.velocity.y > 0 && box.min.y > p.y + 1) || (g > 0 && this.velocity.y < 0 && box.max.y < p.y - 1)) {
        this.velocity.y = 0;
      }
    }
  }

  // Snapshot sent over the network
  getState() {
    const p = this.position;
    return {
      p: [round(p.x), round(p.y), round(p.z)],
      r: round(this.yaw),
      pt: round(this.pitch),
      g: this.onGround ? 1 : 0,
      gf: this.gravityFlipped ? 1 : 0,
      hp: Math.round(this.health),
      jp: this.jetpackOn ? 1 : 0,
      ...this.extraState, // other modules can add fields here (e.g. grappling hook position)
    };
  }
}

function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
