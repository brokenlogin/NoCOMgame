import * as THREE from 'three';
import { CONFIG } from './config.js';

const _target = new THREE.Vector3();
const _offset = new THREE.Vector3();

// Third-person orbit camera that follows a player. Mouse controls yaw/pitch.
export class FollowCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = 0;
    this.pitch = -0.25;
  }

  update(player) {
    const m = this.input.consumeMouse();
    this.yaw -= m.x * CONFIG.mouseSensitivity;
    this.pitch -= m.y * CONFIG.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.3, 0.9);

    player.yaw = this.yaw;

    _target.copy(player.position).y += CONFIG.cameraHeight;
    _offset.set(0, 0, CONFIG.cameraDistance).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.position.copy(_target).add(_offset);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.camera.lookAt(_target);
  }
}
