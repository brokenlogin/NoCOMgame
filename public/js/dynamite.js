import * as THREE from 'three';
import { CONFIG } from './config.js';

// Throwable dynamite (Y key or the hotbar). Bounces around, then explodes:
// blows apart structure blocks, hurts and knocks back nearby players.
//
// Multiplayer: the thrower sends a 'dynamite' event so everyone sees the stick fly,
// then a 'boom' event with the exact spot, so every screen explodes in the same place.
// Each player works out their own damage from the boom.

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const stickGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10);
const stickMat = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.6 });
const bandMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd36b });

function makeStick() {
  const g = new THREE.Group();
  for (const dx of [-0.1, 0.1]) {
    const s = new THREE.Mesh(stickGeo, stickMat);
    s.position.x = dx;
    s.castShadow = true;
    g.add(s);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.2), bandMat);
  g.add(band);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), sparkMat);
  spark.position.set(0.1, 0.32, 0);
  g.add(spark);
  g.userData.spark = spark;
  return g;
}

export class Dynamite {
  constructor(game) {
    this.game = game;
    this.sticks = new Map(); // id -> stick
    this.effects = [];
    this.cooldown = 0;
    this.counter = 0;

    game.net.on('event', (msg) => {
      if (msg.kind === 'dynamite') this.spawn(msg.id, msg.p, msg.v, msg.g, false, msg.from);
      else if (msg.kind === 'boom') {
        this.removeStick(msg.id);
        this.explode(new THREE.Vector3().fromArray(msg.p), msg.from);
      }
    });
    game.net.on('close', () => {
      for (const id of [...this.sticks.keys()]) this.removeStick(id);
    });
  }

  // Throw a stick from the local player's eyes in the direction they're looking
  throw() {
    const { player, camera, net } = this.game;
    if (!player || this.cooldown > 0) return false;
    this.cooldown = CONFIG.dynamite.cooldown;
    camera.getWorldDirection(_fwd);
    const p = camera.position.clone().addScaledVector(_fwd, 0.7);
    const up = -player.gravityDir; // a little lob "upward" relative to your gravity
    const v = _fwd.clone().multiplyScalar(CONFIG.dynamite.throwSpeed).add(new THREE.Vector3(0, up * 4, 0)).addScaledVector(player.velocity, 0.5);
    const id = `${net.id}-${++this.counter}`;
    const pa = p.toArray().map(round), va = v.toArray().map(round);
    this.spawn(id, pa, va, player.gravityDir, true, net.id);
    net.sendEvent({ kind: 'dynamite', id, p: pa, v: va, g: player.gravityDir });
    return true;
  }

  spawn(id, p, v, gravityDir, mine, from) {
    if (this.sticks.has(id)) return;
    const mesh = makeStick();
    mesh.position.fromArray(p);
    this.game.scene.add(mesh);
    this.sticks.set(id, {
      id, mesh, mine, from,
      v: new THREE.Vector3().fromArray(v),
      g: gravityDir === 1 ? 1 : -1,
      // Other players' sticks wait for the thrower's 'boom', with a fallback in case it never comes
      fuse: CONFIG.dynamite.fuse + (mine ? 0 : 3),
      spin: (Math.random() - 0.5) * 20,
    });
  }

  removeStick(id) {
    const s = this.sticks.get(id);
    if (!s) return;
    this.game.scene.remove(s.mesh);
    this.sticks.delete(id);
  }

  explode(point, fromId) {
    const { game } = this;
    const R = CONFIG.dynamite.radius;
    game.world.structures.destroyNear(point, R * 0.6);
    this.spawnEffect(point);
    playBoom(point, game.camera.position);

    // Hurt + shove the local player
    const player = game.player;
    if (player) {
      const center = player.position.clone();
      center.y -= player.gravityDir * CONFIG.playerHeight * 0.5;
      const d = center.distanceTo(point);
      if (d < R) {
        const f = 1 - d / R;
        _dir.copy(center).sub(point);
        if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0);
        _dir.normalize();
        _dir.y += -player.gravityDir * 0.5; // pop up a bit
        player.applyImpulse(_dir.normalize().multiplyScalar(CONFIG.dynamite.knockback * f));
        const by = fromId === game.net.id ? 'yourself' : game.remotes.players.get(fromId)?.name || 'someone';
        player.takeDamage(CONFIG.dynamite.damage * f, by);
      }
    }
  }

  spawnEffect(point) {
    const scene = this.game.scene;
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffa531, transparent: true, opacity: 0.95, depthWrite: false })
    );
    fire.position.copy(point);
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x44403c, transparent: true, opacity: 0.6, depthWrite: false })
    );
    smoke.position.copy(point);
    const light = new THREE.PointLight(0xffa040, 60, 30, 1.5);
    light.position.copy(point);
    scene.add(fire, smoke, light);
    this.effects.push({ fire, smoke, light, t: 0 });
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Sticks bounce off the world and off other players' hitboxes
    const colliders = [...this.game.world.colliders, ...this.game.remotes.hitboxes()];

    for (const s of [...this.sticks.values()]) {
      s.v.y += s.g * CONFIG.gravity * dt;
      const step = s.v.length() * dt;
      if (step > 0) {
        _dir.copy(s.v).normalize();
        _ray.set(s.mesh.position, _dir);
        _ray.far = step + 0.12;
        const hit = _ray.intersectObjects(colliders, false)[0];
        if (hit) {
          _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          s.mesh.position.copy(hit.point).addScaledVector(_n, 0.12);
          // Bounce: reflect, lose energy
          s.v.reflect(_n).multiplyScalar(0.4);
          if (s.v.length() < 1.5) s.v.set(0, 0, 0);
        } else {
          s.mesh.position.addScaledVector(s.v, dt);
        }
      }
      s.mesh.rotation.z += s.spin * dt * Math.min(1, s.v.length() / 5);
      s.mesh.rotation.x += s.spin * 0.5 * dt * Math.min(1, s.v.length() / 5);
      const spark = s.mesh.userData.spark;
      spark.scale.setScalar(0.7 + Math.random() * 0.8);

      s.fuse -= dt;
      if (s.fuse <= 0) {
        const p = s.mesh.position.clone();
        this.removeStick(s.id);
        if (s.mine) {
          this.game.net.sendEvent({ kind: 'boom', id: s.id, p: p.toArray().map(round) });
          this.explode(p, this.game.net.id);
        }
        // Not mine and the boom never arrived: just let it fizzle
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const R = CONFIG.dynamite.radius;
      e.fire.scale.setScalar(R * 0.25 + e.t * R * 2.2);
      e.fire.material.opacity = Math.max(0, 0.95 - e.t * 3);
      e.smoke.scale.setScalar(R * 0.3 + e.t * R * 0.9);
      e.smoke.material.opacity = Math.max(0, 0.6 - e.t * 0.5);
      e.smoke.position.y += (this.game.player ? -this.game.player.gravityDir : 1) * dt * 2;
      e.light.intensity = Math.max(0, 60 * (1 - e.t * 3));
      if (e.t > 1.2) {
        this.game.scene.remove(e.fire, e.smoke, e.light);
        e.fire.geometry.dispose();
        e.fire.material.dispose();
        e.smoke.geometry.dispose();
        e.smoke.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }
}

// ---------- Sound: a quick synthesized boom, quieter when far away ----------
let audio = null;
function playBoom(point, listener) {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const dist = point.distanceTo(listener);
    const vol = Math.max(0, 1 - dist / 80) * 0.8;
    if (vol <= 0.01) return;
    const len = audio.sampleRate * 1.2;
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 - Math.min(700, dist * 10);
    const gain = audio.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch {}
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
