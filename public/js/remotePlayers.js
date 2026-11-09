import * as THREE from 'three';
import { createCapsuleMesh } from './capsule.js';

// Other players in the room, smoothly interpolated toward their latest network state.
export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<number, {id, name, color, mesh, target:THREE.Vector3, targetYaw:number, state:any}>} */
    this.players = new Map();
  }

  add({ id, name, color, state }) {
    if (this.players.has(id)) return this.players.get(id);
    const mesh = createCapsuleMesh(color, name);
    mesh.userData.playerId = id;
    this.scene.add(mesh);
    const rp = { id, name, color, mesh, target: new THREE.Vector3(), targetYaw: 0, state: null };
    this.players.set(id, rp);
    if (state) {
      this.applyState(id, state);
      mesh.position.copy(rp.target);
      mesh.rotation.y = rp.targetYaw;
    } else {
      mesh.visible = false; // until we get a position
    }
    return rp;
  }

  remove(id) {
    const rp = this.players.get(id);
    if (!rp) return;
    this.scene.remove(rp.mesh);
    rp.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
    this.players.delete(id);
  }

  clear() {
    for (const id of [...this.players.keys()]) this.remove(id);
  }

  applyState(id, state) {
    const rp = this.players.get(id);
    if (!rp || !Array.isArray(state.p)) return;
    rp.state = state;
    rp.target.fromArray(state.p);
    rp.targetYaw = state.r ?? 0;
    if (!rp.mesh.visible) {
      rp.mesh.visible = true;
      rp.mesh.position.copy(rp.target);
      rp.mesh.rotation.y = rp.targetYaw;
    }
  }

  update(dt) {
    const t = 1 - Math.exp(-15 * dt);
    for (const rp of this.players.values()) {
      const m = rp.mesh;
      // Teleport if very far (respawn), otherwise smooth
      if (m.position.distanceToSquared(rp.target) > 100) m.position.copy(rp.target);
      else m.position.lerp(rp.target, t);
      m.rotation.y = lerpAngle(m.rotation.y, rp.targetYaw, t);
    }
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
