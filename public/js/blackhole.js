import * as THREE from 'three';
import { CONFIG } from './config.js';

// Black hole grenades (I key or the hotbar item).
// Throw one; after a short fuse it opens into a black hole that pulls in players,
// buildings and dynamite. Every block it eats makes it bigger. Get too close and it hurts.
// After a while it collapses with a final shove outward.
//
// Multiplayer: the thrower sends 'bhThrow' (so everyone sees the grenade fly) and then
// 'bhOpen' with the exact spot. Each player simulates the hole and their own pull/damage.

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

const grenadeGeo = new THREE.SphereGeometry(0.2, 16, 12);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x1a1024, roughness: 0.3, metalness: 0.7 });
const grenadeRingMat = new THREE.MeshBasicMaterial({ color: 0xb45cff });

function makeGrenade() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(grenadeGeo, grenadeMat);
  ball.castShadow = true;
  g.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 8, 24), grenadeRingMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

const PARTICLES = 260;

export class BlackHoles {
  constructor(game) {
    this.game = game;
    this.grenades = new Map(); // id -> flying grenade
    this.holes = [];
    this.cooldown = 0;
    this.counter = 0;

    game.net.on('event', (msg) => {
      if (msg.kind === 'bhThrow') this.spawnGrenade(msg.id, msg.p, msg.v, msg.g, false);
      else if (msg.kind === 'bhOpen') {
        this.removeGrenade(msg.id);
        this.open(new THREE.Vector3().fromArray(msg.p));
      }
    });
    game.net.on('close', () => {
      for (const id of [...this.grenades.keys()]) this.removeGrenade(id);
      for (const h of this.holes) this.disposeHole(h);
      this.holes = [];
    });
  }

  throw() {
    const { player, camera, net } = this.game;
    if (!player || this.cooldown > 0) return false;
    const B = CONFIG.blackHole;
    this.cooldown = B.cooldown;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position.clone().addScaledVector(fwd, 0.7);
    const v = fwd.multiplyScalar(B.throwSpeed).add(new THREE.Vector3(0, -player.gravityDir * 3, 0)).addScaledVector(player.velocity, 0.5);
    const id = `${net.id}-bh${++this.counter}`;
    const pa = p.toArray().map(round), va = v.toArray().map(round);
    this.spawnGrenade(id, pa, va, player.gravityDir, true);
    net.sendEvent({ kind: 'bhThrow', id, p: pa, v: va, g: player.gravityDir });
    return true;
  }

  spawnGrenade(id, p, v, gravityDir, mine) {
    if (this.grenades.has(id)) return;
    const mesh = makeGrenade();
    mesh.position.fromArray(p);
    this.game.scene.add(mesh);
    this.grenades.set(id, {
      id, mesh, mine,
      v: new THREE.Vector3().fromArray(v),
      g: gravityDir === 1 ? 1 : -1,
      fuse: CONFIG.blackHole.fuse + (mine ? 0 : 3), // others wait for the thrower's 'bhOpen'
    });
  }

  removeGrenade(id) {
    const g = this.grenades.get(id);
    if (!g) return;
    this.game.scene.remove(g.mesh);
    this.grenades.delete(id);
  }

  // ---------- The black hole itself ----------
  open(pos) {
    const B = CONFIG.blackHole;
    const group = new THREE.Group();
    group.position.copy(pos);

    // Pitch black core
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    group.add(core);
    // Purple glow around it
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x7a2cff, transparent: true, opacity: 0.35, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    group.add(glow);
    // Glowing accretion disk
    const disk = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 2.6, 64),
      new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    disk.rotation.x = -Math.PI / 2 + 0.25;
    group.add(disk);

    // Swirling particles spiraling inward
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const parts = [];
    const ca = new THREE.Color(0xffb36b), cb = new THREE.Color(0xa45cff);
    for (let i = 0; i < PARTICLES; i++) {
      parts.push({ a: Math.random() * Math.PI * 2, d: 1 + Math.random() * 4, h: (Math.random() - 0.5) * 0.6 });
      const c = ca.clone().lerp(cb, Math.random());
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      pgeo,
      new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    points.rotation.x = 0.25;
    group.add(points);

    const light = new THREE.PointLight(0x9a4cff, 25, 30, 1.5);
    group.add(light);

    this.game.scene.add(group);
    const hole = {
      pos: pos.clone(), group, core, glow, disk, points, parts, light,
      radius: B.startRadius, shown: 0, life: B.life, sucking: [], collapsing: 0,
    };
    this.holes.push(hole);
    playWhoomp(pos, this.game.camera.position, 0.5);
    return hole;
  }

  disposeHole(h) {
    this.game.scene.remove(h.group);
    for (const s of h.sucking) this.game.scene.remove(s.mesh);
    h.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateGrenades(dt);

    const B = CONFIG.blackHole;
    const { game } = this;
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.life -= dt;

      // Collapse at end of life: shrink fast, then pop
      if (h.life <= 0) {
        h.collapsing += dt;
        h.radius = Math.max(0.01, h.radius * (1 - dt * 4));
        if (h.collapsing > 0.6) {
          this.collapse(h);
          this.disposeHole(h);
          this.holes.splice(i, 1);
          continue;
        }
      }

      const pullR = B.pullRange + 3 * h.radius;
      const strength = B.pull * (0.6 + h.radius * 0.4);

      // Rip loose any building blocks in range
      if (h.life > 0) {
        for (const mesh of game.world.structures.takeNear(h.pos, pullR)) {
          const p = mesh.geometry.parameters;
          h.sucking.push({ mesh, v: new THREE.Vector3(), vol: p.width * p.height * p.depth, spin: Math.random() * 6 });
        }
      }

      // Pull them in; eat them when they reach the horizon
      for (let j = h.sucking.length - 1; j >= 0; j--) {
        const s = h.sucking[j];
        _dir.copy(h.pos).sub(s.mesh.position);
        const d = _dir.length();
        if (d < h.radius + 0.3 || h.collapsing) {
          game.scene.remove(s.mesh);
          h.sucking.splice(j, 1);
          if (!h.collapsing) {
            const r3 = h.radius ** 3 + B.growth * s.vol;
            h.radius = Math.min(B.maxRadius, Math.cbrt(r3));
          }
          continue;
        }
        _dir.normalize();
        // Faster as it gets closer, plus a sideways swirl
        _v.set(-_dir.z, 0, _dir.x).multiplyScalar(0.6);
        s.v.addScaledVector(_dir.add(_v), (strength / Math.max(d, 1)) * dt * 3);
        s.v.multiplyScalar(1 - dt * 0.8);
        s.mesh.position.addScaledVector(s.v, dt);
        s.mesh.rotation.x += s.spin * dt;
        s.mesh.rotation.y += s.spin * 0.7 * dt;
        // Stretch toward the hole (spaghettification!)
        const near = THREE.MathUtils.clamp(1 - (d - h.radius) / 4, 0, 1);
        s.mesh.scale.set(1 - near * 0.7, 1 - near * 0.7, 1 + near * 1.5);
        s.mesh.lookAt(h.pos);
      }

      // Pull dynamite sticks too
      for (const stick of game.dynamite?.sticks.values() || []) {
        _dir.copy(h.pos).sub(stick.mesh.position);
        const d = _dir.length();
        if (d < pullR) stick.v.addScaledVector(_dir.normalize(), (strength / Math.max(d, 1)) * dt * 2);
      }

      // Pull (and hurt) the local player
      const player = game.player;
      if (player && h.life > 0) {
        _c.copy(player.position);
        _c.y -= player.gravityDir * CONFIG.playerHeight * 0.5;
        _dir.copy(h.pos).sub(_c);
        const d = _dir.length();
        if (d < pullR) {
          _dir.normalize();
          const f = (strength * (1 - d / pullR)) / Math.max(d * 0.35, 1);
          player.velocity.addScaledVector(_dir, f * dt);
          // Don't let normal walking cancel the pull
          player.launched = true;
          player.knockbackTime = Math.max(player.knockbackTime || 0, 0.15);
          player.onGround = false;
          if (d < h.radius * 1.15 + 0.5) player.takeDamage(B.damage * dt, 'a black hole');
        }
      }

      this.animateHole(h, dt);
    }
  }

  // Final burst when a hole collapses: shove nearby players out and blow apart what's left nearby
  collapse(h) {
    const { game } = this;
    const R = 4 + h.radius * 2;
    game.world.structures.destroyNear(h.pos, h.radius * 1.5);
    playWhoomp(h.pos, game.camera.position, 1);
    const player = game.player;
    if (!player) return;
    _c.copy(player.position);
    _c.y -= player.gravityDir * CONFIG.playerHeight * 0.5;
    const d = _c.distanceTo(h.pos);
    if (d < R) {
      _dir.copy(_c).sub(h.pos).normalize();
      const k = 25 * (1 - d / R);
      player.applyKnockback([_dir.x * k, k * 0.5, _dir.z * k]);
    }
  }

  animateHole(h, dt) {
    // Smoothly grow the visuals toward the real radius
    h.shown += (h.radius - h.shown) * Math.min(1, dt * 4);
    const r = Math.max(0.01, h.shown);
    h.core.scale.setScalar(r);
    h.glow.scale.setScalar(r * (1.35 + Math.sin(performance.now() * 0.006) * 0.05));
    h.disk.scale.setScalar(r);
    h.disk.rotation.z += dt * 2;
    h.light.intensity = 25 + r * 6;

    const pos = h.points.geometry.attributes.position;
    for (let i = 0; i < PARTICLES; i++) {
      const p = h.parts[i];
      p.a += dt * (4 / Math.max(p.d, 0.5));
      p.d -= dt * (0.8 + 2 / p.d);
      if (p.d < 1.05) {
        p.d = 2.5 + Math.random() * 3;
        p.a = Math.random() * Math.PI * 2;
      }
      pos.setXYZ(i, Math.cos(p.a) * p.d * r, p.h * r * 0.5, Math.sin(p.a) * p.d * r);
    }
    pos.needsUpdate = true;
  }

  updateGrenades(dt) {
    const colliders = [...this.game.world.colliders, ...this.game.remotes.hitboxes()];
    for (const g of [...this.grenades.values()]) {
      g.v.y += g.g * CONFIG.gravity * dt;
      const step = g.v.length() * dt;
      if (step > 0) {
        _dir.copy(g.v).normalize();
        _ray.set(g.mesh.position, _dir);
        _ray.far = step + 0.2;
        const hit = _ray.intersectObjects(colliders, false)[0];
        if (hit) {
          _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          g.mesh.position.copy(hit.point).addScaledVector(_n, 0.2);
          g.v.reflect(_n).multiplyScalar(0.35);
          if (g.v.length() < 1.5) g.v.set(0, 0, 0);
        } else {
          g.mesh.position.addScaledVector(g.v, dt);
        }
      }
      g.mesh.rotation.y += dt * 6;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        const p = g.mesh.position.clone();
        // Open a little above where it landed so it floats
        p.y += -g.g * 1.2;
        this.removeGrenade(g.id);
        if (g.mine) {
          this.game.net.sendEvent({ kind: 'bhOpen', id: g.id, p: p.toArray().map(round) });
          this.open(p);
        }
      }
    }
  }
}

// Deep "whoomp" sound
let audio = null;
function playWhoomp(point, listener, vol) {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const v = Math.max(0, 1 - point.distanceTo(listener) / 90) * vol * 0.7;
    if (v <= 0.01) return;
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, audio.currentTime + 1.2);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(v, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.4);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 1.5);
  } catch {}
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
