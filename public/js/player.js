import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCapsuleMesh } from './capsule.js';
import { LOCAL_BODY_LAYER } from './camera.js';

const _down = new THREE.Vector3(0, -1, 0);
const _wish = new THREE.Vector3();
const _origin = new THREE.Vector3();

// The local, keyboard-controlled player.
export class LocalPlayer {
  constructor({ scene, colliders, input, color, name }) {
    this.input = input;
    this.colliders = colliders;
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

    this.respawn();
  }

  respawn() {
    const a = Math.random() * Math.PI * 2;
    this.position.set(Math.cos(a) * 5, 5, Math.sin(a) * 5);
    this.velocity.set(0, 0, 0);
    this.launched = false;
    this.knockbackTime = 0;
  }

  // Get launched. `v` is a velocity change [x, y, z] (or Vector3) in m/s.
  applyKnockback(v) {
    const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];
    if (![x, y, z].every(Number.isFinite)) return;
    const max = CONFIG.maxKnockback;
    this.velocity.x = THREE.MathUtils.clamp(this.velocity.x + x, -max, max);
    this.velocity.z = THREE.MathUtils.clamp(this.velocity.z + z, -max, max);
    // Always pop up a little so we leave the ground and actually fly
    this.velocity.y = THREE.MathUtils.clamp(Math.max(this.velocity.y, 0) + y, CONFIG.knockbackMinLift, max);
    this.onGround = false;
    this.launched = true;
    this.knockbackTime = CONFIG.knockbackStun;
  }

  update(dt) {
    const input = this.input;

    // --- Horizontal movement relative to facing ---
    let fx = 0, fz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;

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
      this.velocity.y = CONFIG.jumpVelocity;
      this.onGround = false;
    }
    this.velocity.y -= CONFIG.gravity * dt;

    // --- Integrate ---
    this.position.addScaledVector(this.velocity, dt);

    // --- Ground check: ray down from inside the capsule ---
    this.onGround = false;
    if (this.velocity.y <= 0) {
      const probe = 1.0;
      _origin.copy(this.position).y += probe;
      this.raycaster.set(_origin, _down);
      // Reach far enough to catch however far we sank this frame
      this.raycaster.far = probe + Math.abs(this.velocity.y) * dt + 0.05;
      const hit = this.raycaster.intersectObjects(this.colliders, false)[0];
      if (hit) {
        this.position.y = hit.point.y;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    if (this.position.y < CONFIG.killY) this.respawn();

    this.mesh.rotation.y = this.yaw;
  }

  // Snapshot sent over the network
  getState() {
    const p = this.position;
    return {
      p: [round(p.x), round(p.y), round(p.z)],
      r: round(this.yaw),
      pt: round(this.pitch),
      g: this.onGround ? 1 : 0,
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
