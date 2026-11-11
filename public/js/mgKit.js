// Shared building blocks for the minigame packs (mgPackA/B/C.js) and the Solo Arcade (mgSolo.js).
//
// All of these arenas live in their own big void west of the map (CONFIG.terrain.voids):
// SLOT(i) gives the center of arena number i on a 5-wide grid. Hazards are worked out from
// the round's seed and the time since it started, so everyone sees the same thing without
// sending anything over the network.

import { addBox, mulberry32 } from './mgShared.js';

export const SLOT = (i) => ({ x: -1080 + (i % 5) * 70, y: 20, z: -380 + Math.floor(i / 5) * 85 });
export const HUB = { x: -940, y: 20, z: 390, w: 64, d: 30 }; // the Solo Arcade
export { mulberry32 };

export function makeKit(game) {
  const { THREE, scene, world } = game;
  const k = {
    THREE,
    scene,
    // A box with its top at `top` you can stand on (and walk into if solid)
    box: (o) => addBox(game, o),
    // A round platform (top at `top`)
    disc(x, top, z, r, color, h = 1.5) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      m.position.set(x, top - h / 2, z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      world.colliders.push(m);
      return m;
    },
    mesh(geo, color, x, y, z, opts = {}) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
      m.position.set(x, y, z);
      m.castShadow = true;
      scene.add(m);
      return m;
    },
    glow: (color, i = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i }),
    remove(o) {
      if (!o) return;
      scene.remove(o);
      const i = world.colliders.indexOf(o);
      if (i >= 0) world.colliders.splice(i, 1);
    },
    collide(m) {
      if (!world.colliders.includes(m)) world.colliders.push(m);
    },
    uncollide(m) {
      const i = world.colliders.indexOf(m);
      if (i >= 0) world.colliders.splice(i, 1);
    },
    // A flat warning ring on the floor
    warn(x, y, z, r, color = 0xff3a2a) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.05, z);
      scene.add(m);
      return m;
    },
    me: () => game.player,
    feet: () => game.player.position,
    knock: (v) => game.player.applyKnockback(v),
    hurt: (n, cause) => game.player.takeDamage(n, cause),
    puff: (p, color) => game.opItems?.puffFx?.(p.clone ? p.clone() : new THREE.Vector3(...p), color),
    flash: (p, color = 0xffa040) => game.flash?.(p, { color, intensity: 30, distance: 25, duration: 0.3 }),
    // Spawn points around a circle
    ring: (A, r) => (i, n) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.37; // off the axes, where floor tiles meet
      return [A.x + Math.cos(a) * r, A.y + 0.5, A.z + Math.sin(a) * r];
    },
    // Where you stand relative to an area
    on: (p, A, x, z, w, d, dy = 1.2) => Math.abs(p.x - x) <= w / 2 && Math.abs(p.z - z) <= d / 2 && p.y > A.y - 0.5 && p.y < A.y + dy,
    // A list of [time, ...random numbers] events for the whole round, from the seed
    schedule(seed, { first = 2, gap0 = 1.2, gap1 = 0.35, ramp = 60, until = 240, extra = 3 }) {
      const rnd = mulberry32(seed);
      const out = [];
      for (let t = first; t < until; ) {
        out.push([t, ...Array.from({ length: extra }, () => rnd())]);
        t += gap0 + (gap1 - gap0) * Math.min(1, t / ramp);
      }
      return out;
    },
    // Quick beeps for countdowns and music
    beep(f = 660, d = 0.12, type = 'square', vol = 0.05) {
      try {
        k.ac ||= new AudioContext();
        const t = k.ac.currentTime;
        const o = k.ac.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = k.ac.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(k.ac.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      } catch {}
    },
    // A floating label (canvas sprite)
    label(text, color = '#ffffff', scale = 1) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(20,22,27,0.8)';
      x.beginPath();
      x.roundRect(4, 8, 504, 80, 18);
      x.fill();
      x.font = 'bold 44px system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = color;
      x.fillText(text, 256, 50);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
      s.scale.set(4 * scale, 0.75 * scale, 1);
      return s;
    },
  };
  return k;
}
