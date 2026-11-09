import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCapsuleMesh } from './capsule.js';

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
    scene.add(this.mesh);

    this.position = this.mesh.position; // feet position
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // facing, driven by the camera
    this.onGround = false;
    this.name = name;
    this.raycaster = new THREE.Raycaster();

    this.respawn();
  }

  respawn() {
    const a = Math.random() * Math.PI * 2;
    this.position.set(Math.cos(a) * 5, 5, Math.sin(a) * 5);
    this.velocity.set(0, 0, 0);
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
    const accel = this.onGround ? CONFIG.groundAccel : CONFIG.airAccel;

    const targetX = _wish.x * maxSpeed;
    const targetZ = _wish.z * maxSpeed;
    this.velocity.x = approach(this.velocity.x, targetX, accel * dt);
    this.velocity.z = approach(this.velocity.z, targetZ, accel * dt);

    if (this.onGround && _wish.lengthSq() === 0) {
      const f = Math.max(0, 1 - CONFIG.groundFriction * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
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
      g: this.onGround ? 1 : 0,
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
