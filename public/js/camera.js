import * as THREE from 'three';
import { CONFIG } from './config.js';

// Layer the local player's own body lives on. The view camera doesn't render it
// (so you don't see the inside of your capsule), but it still casts a shadow.
export const LOCAL_BODY_LAYER = 1;

// First-person camera at the player's eyes. Mouse controls yaw/pitch.
export class FirstPersonCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = 0;
    this.pitch = 0;
    camera.rotation.order = 'YXZ';
  }

  // Read mouse input and turn the player. Call before the player moves.
  look(player) {
    const m = this.input.consumeMouse();
    // Upside down (gravity flipped), the mouse would feel backwards, so invert it
    const s = player.gravityFlipped ? -1 : 1;
    this.yaw -= m.x * CONFIG.mouseSensitivity * s;
    this.pitch -= m.y * CONFIG.mouseSensitivity * s;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
    player.yaw = this.yaw;
    player.pitch = this.pitch;
  }

  // Put the camera at the player's eyes. Call after the player moves.
  follow(player) {
    const roll = player.flipRoll || 0;
    this.camera.position.copy(player.position).y += CONFIG.eyeHeight * Math.cos(roll);
    this.camera.rotation.set(this.pitch, this.yaw, roll);
  }
}
