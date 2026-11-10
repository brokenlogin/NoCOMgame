import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCapsuleMesh, animateCharacter, setJetFlames } from './capsule.js';

// Other players in the room, smoothly interpolated toward their latest network state.
export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<number, {id, name, color, mesh, target:THREE.Vector3, targetYaw:number, targetRoll:number, state:any}>} */
    this.players = new Map();
  }

  add({ id, name, color, state }) {
    if (this.players.has(id)) return this.players.get(id);
    const mesh = createCapsuleMesh(color, name);
    mesh.userData.playerId = id;
    const healthBar = createHealthBar();
    mesh.add(healthBar.sprite);
    // Invisible capsule hitbox: things like dynamite bounce off it
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.y = CONFIG.playerHeight / 2;
    hitbox.userData.playerId = id;
    mesh.add(hitbox);
    this.scene.add(mesh);
    const rp = {
      id, name, color, mesh, healthBar, hitbox,
      target: new THREE.Vector3(), targetYaw: 0, targetRoll: 0, state: null,
      lastPos: new THREE.Vector3(), speed: 0,
    };
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
      if (o === rp.hitbox) return; // shared geometry
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
    this.players.delete(id);
  }

  clear() {
    for (const id of [...this.players.keys()]) this.remove(id);
  }

  // Every remote player's hitbox mesh, for raycasts
  hitboxes() {
    const list = [];
    for (const rp of this.players.values()) if (rp.mesh.visible) list.push(rp.hitbox);
    return list;
  }

  applyState(id, state) {
    const rp = this.players.get(id);
    if (!rp || !Array.isArray(state.p)) return;
    rp.state = state;
    rp.target.fromArray(state.p);
    rp.targetYaw = state.r ?? 0;
    rp.targetRoll = state.gf ? Math.PI : 0;
    if (typeof state.hp === 'number') rp.healthBar.set(state.hp / CONFIG.maxHealth);
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
      rp.lastPos.copy(m.position);
      // Teleport if very far (respawn), otherwise smooth
      if (m.position.distanceToSquared(rp.target) > 100) m.position.copy(rp.target);
      else m.position.lerp(rp.target, t);
      m.rotation.y = lerpAngle(m.rotation.y, rp.targetYaw, t);
      m.rotation.z += (rp.targetRoll - m.rotation.z) * Math.min(1, dt * 7);

      // Walk animation from how fast they're actually moving
      if (dt > 0) {
        const dx = m.position.x - rp.lastPos.x, dz = m.position.z - rp.lastPos.z;
        const v = Math.hypot(dx, dz) / dt;
        rp.speed += (v - rp.speed) * Math.min(1, dt * 10);
      }
      animateCharacter(m, rp.speed, rp.state?.g !== 0, dt, rp.state?.pt ?? 0);
      setJetFlames(m, rp.state?.jp === 1);
    }
  }
}

const hitboxGeo = new THREE.CapsuleGeometry(CONFIG.playerRadius, CONFIG.playerHeight - 2 * CONFIG.playerRadius, 4, 8);
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

function createHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(1.2, 0.15, 1);
  sprite.position.y = CONFIG.playerHeight + 0.85;
  let last = -1;
  const bar = {
    sprite,
    set(frac) {
      frac = THREE.MathUtils.clamp(frac, 0, 1);
      if (Math.abs(frac - last) < 0.005) return;
      last = frac;
      ctx.clearRect(0, 0, 128, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 128, 16);
      ctx.fillStyle = frac > 0.5 ? '#4cd964' : frac > 0.25 ? '#ffcc00' : '#ff3b30';
      ctx.fillRect(2, 2, 124 * frac, 12);
      texture.needsUpdate = true;
    },
  };
  bar.set(1);
  return bar;
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
