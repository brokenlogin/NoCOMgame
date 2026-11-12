import * as THREE from 'three';
import { createItemModel, hasItemModel } from './itemModels.js';

// The item you're holding, drawn in the bottom-right of your first-person view.
// Items with a 3D model (see itemModels.js) are rendered in 3D on top of the world
// (so they never clip into walls); items without one fall back to their emoji.
//
//   show(item)        switch to an item (or null)
//   play('swing' | 'recoil')
//   setBlowing(bool)  continuous shake (leaf blower)
export class Viewmodel {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x50586a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2, 1);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.9);
    rim.position.set(-2, 0.5, -1);
    this.scene.add(rim);

    // holder: base pose + bob; animator: swing/recoil; model inside
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.62);
    this.animator = new THREE.Group();
    this.holder.add(this.animator);
    this.scene.add(this.holder);

    this.model = null;
    this.itemId = null;
    this.anim = null; // { name, t }
    this.blowing = false;
    this.equip = 1; // 1 = lowered out of view, 0 = in place
    this.bobPhase = 0;
    this.bobAmp = 0;

    // Emoji fallback
    this.dom = document.createElement('div');
    this.dom.id = 'viewmodel';
    document.getElementById('hud').appendChild(this.dom);
  }

  show(item) {
    const id = item?.id ?? null;
    if (id === this.itemId) return;
    this.itemId = id;

    if (this.model) {
      this.animator.remove(this.model);
      this.model.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this.model = null;
    }
    this.dom.textContent = '';
    this.dom.className = '';
    this.anim = null;
    if (!id) return;

    if (hasItemModel(id)) {
      this.model = createItemModel(id);
      this.animator.add(this.model);
      this.equip = 1; // raise it into view
    } else {
      this.dom.textContent = item.icon ?? '';
    }
  }

  // name: 'swing' | 'recoil' | 'mine'; duration (seconds) is optional
  play(name, duration) {
    if (!name || name === 'blow') return;
    if (this.model) {
      this.anim = { name, t: 0, d: duration };
    } else {
      this.dom.classList.remove('swing', 'recoil');
      void this.dom.offsetWidth; // restart the CSS animation
      this.dom.classList.add(name);
    }
  }

  setBlowing(on) {
    this.blowing = on;
    this.dom.classList.toggle('blow', on && !this.model);
  }

  update(dt) {
    if (!this.model) return;
    const player = this.game.player;

    // Equip: slide up from below
    this.equip = Math.max(0, this.equip - dt * 5);
    const e = this.equip * this.equip;

    // Walk bob
    const speed = player ? Math.hypot(player.velocity.x, player.velocity.z) : 0;
    const walking = player?.onGround ? Math.min(1, speed / 8) : 0;
    this.bobAmp += (walking - this.bobAmp) * Math.min(1, dt * 8);
    this.bobPhase += dt * (5 + speed * 0.9);
    const bobX = Math.cos(this.bobPhase) * 0.015 * this.bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.02 * this.bobAmp;

    this.holder.position.set(0.34 + bobX, -0.33 + bobY - e * 0.5, -0.7);
    this.holder.rotation.set(0.05 + e * 0.6, -0.18, 0);

    // Use animations
    const a = this.animator;
    a.position.set(0, 0, 0);
    a.rotation.set(0, 0, 0);
    if (this.anim) {
      this.anim.t += dt;
      const { name, t } = this.anim;
      if (name === 'swing') {
        const d = 0.32;
        const k = Math.min(1, t / d);
        // Quick wind-up then a big sweep across, then settle back
        const sweep = k < 0.35 ? -(k / 0.35) * 0.4 : -0.4 + ((k - 0.35) / 0.65) * 0.4;
        const arc = Math.sin(k * Math.PI);
        a.rotation.set(-arc * 1.1, arc * 0.9, -arc * 0.6 + sweep);
        a.position.set(-arc * 0.25, arc * 0.05, -arc * 0.1);
        if (t >= d) this.anim = null;
      } else if (name === 'mine') {
        // Overhead chop: lift up and back, then drive the head down and forward, then recover
        const d = this.anim.d || 0.4;
        const k = Math.min(1, t / d);
        const easeIn = (x) => x * x;
        const easeOut = (x) => 1 - (1 - x) * (1 - x);
        let rx, py, pz;
        if (k < 0.4) {
          const w = easeOut(k / 0.4); // wind up
          rx = 0.75 * w;
          py = 0.07 * w;
          pz = 0.05 * w;
        } else if (k < 0.62) {
          const s = easeIn((k - 0.4) / 0.22); // strike
          rx = 0.75 - 1.9 * s;
          py = 0.07 - 0.13 * s;
          pz = 0.05 - 0.13 * s;
        } else {
          const s = easeOut((k - 0.62) / 0.38); // recover
          rx = -1.15 * (1 - s);
          py = -0.06 * (1 - s);
          pz = -0.08 * (1 - s);
        }
        a.rotation.set(rx, 0, -0.15 * Math.sin(k * Math.PI));
        a.position.set(0, py, pz);
        if (t >= d) this.anim = null;
      } else if (name === 'recoil') {
        const d = 0.22;
        const k = Math.min(1, t / d);
        const kick = Math.exp(-k * 6) * (1 - Math.exp(-k * 40));
        a.position.set(0, kick * 0.04, kick * 0.14);
        a.rotation.set(kick * 0.45, 0, 0);
        if (t >= d) this.anim = null;
      }
    }
    if (this.blowing) {
      a.position.x += (Math.random() - 0.5) * 0.008;
      a.position.y += (Math.random() - 0.5) * 0.008;
    }
  }

  render(renderer) {
    if (!this.model) return;
    const size = renderer.getSize(new THREE.Vector2());
    this.camera.aspect = size.x / Math.max(1, size.y);
    this.camera.updateProjectionMatrix();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }
}
