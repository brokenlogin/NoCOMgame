// Space RPG effects: explosions with flying debris, screen shake, warp streaks when you boost,
// engine trails, and all the sounds (WebAudio, no files). spaceRpg.js creates one of these
// and hands it to the other space*.js modules.
//
//   fx.explode(pos, size, color)   fireball + shockwave + debris + sparks + boom
//   fx.shake(amount)               0..1, adds screen shake (fades out)
//   fx.emit(pos, vel, color, life) one glowing particle (sparks, trails, smoke)
//   fx.sfx('lock' | 'pickup' | ...) short sound effects
//   fx.engine(on, thrust)          engine hum while flying
//   fx.warp(amount)                0..1 streaks + wider FOV while boosting

import * as THREE from 'three';

const PARTICLES = 1500;

export function createSpaceFx(game) {
  const { scene, camera, CONFIG } = game;
  const effects = [];
  let trauma = 0;

  // ---------- Particles (one Points object for everything small and glowy) ----------
  const pPos = new Float32Array(PARTICLES * 3);
  const pCol = new Float32Array(PARTICLES * 3);
  const pBase = new Float32Array(PARTICLES * 3);
  const pVel = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES);
  const pMax = new Float32Array(PARTICLES);
  let pNext = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  // Soft round glow for every particle
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const dctx = dot.getContext('2d');
  const grad = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, 64, 64);
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 1.4, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const _c = new THREE.Color();
  function emit(p, v, color, life = 0.8) {
    const i = pNext;
    pNext = (pNext + 1) % PARTICLES;
    pPos.set([p.x, p.y, p.z], i * 3);
    pVel.set(v ? [v.x, v.y, v.z] : [0, 0, 0], i * 3);
    _c.set(color);
    pBase.set([_c.r, _c.g, _c.b], i * 3);
    pLife[i] = pMax[i] = life;
  }
  function updateParticles(dt) {
    for (let i = 0; i < PARTICLES; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      const k = Math.max(0, pLife[i] / pMax[i]);
      const j = i * 3;
      pPos[j] += pVel[j] * dt;
      pPos[j + 1] += pVel[j + 1] * dt;
      pPos[j + 2] += pVel[j + 2] * dt;
      const drag = 1 - dt * 1.5;
      pVel[j] *= drag;
      pVel[j + 1] *= drag;
      pVel[j + 2] *= drag;
      pCol[j] = pBase[j] * k;
      pCol[j + 1] = pBase[j + 1] * k;
      pCol[j + 2] = pBase[j + 2] * k;
      if (pLife[i] <= 0) pCol[j] = pCol[j + 1] = pCol[j + 2] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- Explosions ----------
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const ringGeo = new THREE.RingGeometry(0.93, 1, 48);
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7, metalness: 0.4, emissive: 0xff6a1a, emissiveIntensity: 0.6 });
  const _v = new THREE.Vector3();
  function explode(pos, size = 1, color = 0xffa531, { debris = true, sound = true } = {}) {
    const p = pos.clone();
    const fire = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    const core = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.position.copy(p);
    core.position.copy(p);
    ring.position.copy(p);
    ring.lookAt(camera.position);
    scene.add(fire, core, ring);
    const chunks = [];
    if (debris) {
      const n = Math.round(5 + size * 5);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(debrisGeo, debrisMat);
        const s = (0.15 + Math.random() * 0.35) * size;
        m.scale.set(s, s * (0.3 + Math.random()), s * (0.5 + Math.random()));
        m.position.copy(p);
        scene.add(m);
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((8 + Math.random() * 16) * Math.sqrt(size));
        chunks.push({ m, v, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
      }
    }
    for (let i = 0; i < 20 + size * 12; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((10 + Math.random() * 30) * Math.sqrt(size));
      emit(p, _v, i % 3 ? color : 0xffffff, 0.5 + Math.random() * 0.7);
    }
    game.flash?.(p, { color, intensity: 30 + size * 20, distance: 20 + size * 20, duration: 0.35 });
    const dist = camera.position.distanceTo(p);
    shake(Math.min(0.8, (size * 14) / Math.max(10, dist)));
    if (sound) boom(size, dist);
    let t = 0;
    effects.push((dt) => {
      t += dt;
      const r = size * (1.5 + t * 9);
      fire.scale.setScalar(r);
      fire.material.opacity = Math.max(0, 1 - t * 2.2);
      core.scale.setScalar(size * Math.max(0.01, 1.2 - t * 5));
      core.material.opacity = Math.max(0, 1 - t * 5);
      ring.scale.setScalar(size * (1 + t * 30));
      ring.material.opacity = Math.max(0, 0.6 - t * 1.5);
      for (const c of chunks) {
        c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.spin.x * dt;
        c.m.rotation.y += c.spin.y * dt;
        if (Math.random() < 0.3) emit(c.m.position, null, 0xff8a3a, 0.4);
      }
      if (t < 1.6) return true;
      scene.remove(fire, core, ring);
      fire.material.dispose();
      core.material.dispose();
      ring.material.dispose();
      for (const c of chunks) scene.remove(c.m);
      return false;
    });
  }

  // A quick spark burst where a shot lands
  function sparks(p, color = 0xfff0a0, n = 6) {
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 10);
      emit(p, _v, color, 0.25 + Math.random() * 0.25);
    }
  }

  // ---------- Screen shake ----------
  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }
  const shakeOffset = new THREE.Vector3();
  function applyShake(dt) {
    trauma = Math.max(0, trauma - dt * 1.4);
    const s = trauma * trauma * 0.6;
    if (s < 0.001) return;
    const t = performance.now() / 1000;
    shakeOffset.set(Math.sin(t * 47) * s, Math.sin(t * 59 + 1) * s, Math.sin(t * 41 + 2) * s);
    camera.position.add(shakeOffset);
  }

  // ---------- Warp streaks + FOV kick ----------
  const STREAKS = 70;
  const sPos = new Float32Array(STREAKS * 6);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const streaks = new THREE.LineSegments(sGeo, streakMat);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const seeds = [];
  for (let i = 0; i < STREAKS; i++) seeds.push({ a: Math.random() * Math.PI * 2, r: 3 + Math.random() * 9, z: Math.random() * 60 });
  let warpAmount = 0;
  let fovTouched = false;
  function warp(target) {
    warpAmount += (target - warpAmount) * 0.12;
  }
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function updateWarp(dt) {
    streakMat.opacity = warpAmount * 0.55;
    // Only touch the FOV while warping (so other things that zoom the camera still work)
    if (warpAmount > 0.01 || fovTouched) {
      fovTouched = warpAmount > 0.01;
      camera.fov = (CONFIG.fov || 75) + (fovTouched ? warpAmount * 14 : 0);
      camera.updateProjectionMatrix();
    }
    if (warpAmount < 0.02) return;
    camera.getWorldDirection(_f);
    _r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (let i = 0; i < STREAKS; i++) {
      const s = seeds[i];
      s.z -= dt * 140;
      if (s.z < 2) s.z = 60;
      const base = camera.position.clone().addScaledVector(_f, s.z).addScaledVector(_r, Math.cos(s.a) * s.r).addScaledVector(_u, Math.sin(s.a) * s.r);
      const tail = base.clone().addScaledVector(_f, 6 + warpAmount * 8);
      sPos.set([base.x, base.y, base.z, tail.x, tail.y, tail.z], i * 6);
    }
    sGeo.attributes.position.needsUpdate = true;
  }

  // ---------- Sound ----------
  let ac = null, master = null, noiseBuf = null;
  function audio() {
    try {
      if (!ac) {
        ac = new AudioContext();
        master = ac.createGain();
        master.gain.value = 0.6;
        master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch {
      return null;
    }
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay = 0) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }
  function boom(size, dist) {
    const v = Math.min(0.5, (0.25 * size * 40) / Math.max(40, dist));
    if (v < 0.01) return;
    noise(0.6 + size * 0.3, v, 900 + size * 300);
    tone('sine', 90, 35, 0.6, v * 0.8);
  }
  const SFX = {
    laser: () => tone('square', 1400, 260, 0.12, 0.05),
    rail: () => { tone('sawtooth', 300, 2400, 0.18, 0.06); noise(0.3, 0.08, 4000); },
    scatter: () => { tone('square', 900, 200, 0.1, 0.05); tone('square', 1300, 300, 0.1, 0.03); },
    repeater: () => tone('triangle', 900, 500, 0.06, 0.05),
    missile: () => { noise(0.8, 0.12, 2500); tone('sawtooth', 200, 600, 0.4, 0.03); },
    mine: () => tone('sine', 300, 300, 0.15, 0.08),
    ion: () => { tone('sine', 200, 1800, 0.35, 0.08); tone('square', 60, 40, 0.3, 0.04); },
    lock: () => { tone('sine', 1800, 1800, 0.06, 0.05); tone('sine', 2400, 2400, 0.06, 0.05, 0.08); },
    lockOn: () => tone('sine', 2600, 2600, 0.12, 0.05),
    pickup: () => { tone('sine', 900, 900, 0.08, 0.06); tone('sine', 1350, 1350, 0.12, 0.06, 0.07); },
    coin: () => { tone('square', 1200, 1200, 0.06, 0.04); tone('square', 1800, 1800, 0.12, 0.04, 0.06); },
    shieldHit: () => { tone('sine', 700, 300, 0.18, 0.08); noise(0.12, 0.04, 3000); },
    hullHit: () => { noise(0.25, 0.14, 1200); tone('square', 120, 60, 0.2, 0.05); },
    shieldDown: () => tone('sawtooth', 600, 80, 0.6, 0.07),
    alarm: () => { tone('square', 880, 880, 0.12, 0.04); tone('square', 660, 660, 0.12, 0.04, 0.15); },
    hit: () => tone('triangle', 2200, 1600, 0.04, 0.04),
    crit: () => { tone('triangle', 2600, 2600, 0.05, 0.06); tone('triangle', 3400, 3400, 0.07, 0.05, 0.04); },
    warp: () => { noise(1.4, 0.12, 6000); tone('sine', 80, 1200, 1.2, 0.08); },
    levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.07, i * 0.1)),
    quest: () => [659, 784, 988].forEach((f, i) => tone('sine', f, f, 0.2, 0.06, i * 0.09)),
    achievement: () => [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.3, 0.07, i * 0.12)),
    error: () => tone('square', 200, 140, 0.18, 0.05),
    repair: () => { tone('sine', 400, 900, 0.4, 0.05); noise(0.3, 0.03, 2000); },
    dice: () => { for (let i = 0; i < 5; i++) tone('square', 300 + Math.random() * 400, 200, 0.04, 0.03, i * 0.06); },
  };
  function sfx(name) {
    SFX[name]?.();
  }

  // Engine hum: two detuned saws through a lowpass that opens with thrust
  let hum = null;
  function engine(on, thrust = 0) {
    const a = on ? audio() : ac;
    if (!a) return;
    if (!hum && on) {
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const g = a.createGain();
      g.gain.value = 0;
      const o1 = a.createOscillator();
      const o2 = a.createOscillator();
      o1.type = o2.type = 'sawtooth';
      o1.frequency.value = 55;
      o2.frequency.value = 55.7;
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(master);
      o1.start();
      o2.start();
      hum = { f, g, o1, o2 };
    }
    if (!hum) return;
    const t = a.currentTime;
    hum.g.gain.setTargetAtTime(on ? 0.02 + thrust * 0.035 : 0, t, 0.1);
    hum.f.frequency.setTargetAtTime(220 + thrust * 900, t, 0.1);
    hum.o1.frequency.setTargetAtTime(50 + thrust * 30, t, 0.15);
    hum.o2.frequency.setTargetAtTime(50.7 + thrust * 31, t, 0.15);
  }

  // ---------- Per frame (started last, so shake lands after the camera is placed) ----------
  function update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) if (!effects[i](dt)) effects.splice(i, 1);
    updateParticles(dt);
    updateWarp(dt);
    applyShake(dt);
  }
  let started = false;
  function start() {
    if (started) return;
    started = true;
    game.addSystem((dt) => update(dt));
  }

  return { explode, sparks, emit, shake, warp, sfx, tone, noise, engine, start, audio, get master() { audio(); return master; }, addEffect: (fn) => effects.push(fn) };
}
