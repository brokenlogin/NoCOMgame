// Your starship for the space RPG (spaceRpg.js sets it up).
//
// Flying: E near your ship to board, E again to get out (only when you're slow and over
// something to stand on). Mouse aims, W/S thrust, A/D strafe, Space up, C down, Shift boost.
// Left click fires the twin lasers (they mine glowing asteroids too).
//
// The ship is yours alone (everyone has their own), but other players see it fly:
// your position is the normal player position, and player.extraState.sh carries
// [yaw, pitch, roll, thrust] while you pilot. Laser shots are shared as { kind: 'sp:laser', a, b }
// and hits on other ships as { kind: 'sp:hit', target, dmg } (the target applies it).

import * as THREE from 'three';
import { registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { itemTexture } from './itemTextures.js';
import { addItemLock } from './mgShared.js';

const COCKPIT = new THREE.Vector3(0, 1.05, 0.35); // camera spot relative to the ship's origin

// ---------- Ship model (yours and everyone else's) ----------
export function buildShip(accent = 0x3ad6ff) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.45, metalness: 0.35, bumpMap: itemTexture('brushed'), bumpScale: 0.4 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.5, map: itemTexture('carbon') });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, emissive: accent, emissiveIntensity: 0.25 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: accent });

  // Fuselage along Z (nose at -Z)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 3.4, 8, 20), paint);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.62);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 20), paint);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -2.75;
  nose.scale.set(1, 0.62, 1);
  g.add(nose);
  // Accent stripes
  for (const z of [-1.2, 0.9]) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.18, 24, 1, true), accentMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = z;
    stripe.scale.set(1, 1, 0.63);
    g.add(stripe);
  }
  // Canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
  canopy.scale.set(0.9, 0.75, 1.9);
  canopy.position.set(0, 0.35, -0.6);
  g.add(canopy);
  // Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.9);
  wingShape.lineTo(3.4, 1.6);
  wingShape.lineTo(3.6, 2.2);
  wingShape.lineTo(0, 2.6);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 1 });
  for (const s of [1, -1]) {
    const wing = new THREE.Mesh(wingGeo, carbon);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.x = s;
    wing.position.set(0, -0.05, -0.6);
    g.add(wing);
    // Wing tip light + gun
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x40ff70 : 0xff4040 }));
    light.position.set(s * 3.55, 0, 1.6);
    g.add(light);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), carbon);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(s * 1.5, -0.1, -0.2);
    g.add(gun);
    // Tail fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.1), paint);
    fin.position.set(s * 0.45, 0.55, 1.95);
    fin.rotation.z = s * 0.35;
    g.add(fin);
  }
  // Engines with glow and flames
  const flames = [];
  for (const s of [1, -1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.2, 16), carbon);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(s * 0.75, -0.05, 2.0);
    g.add(engine);
    const ringGlow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), glowMat);
    ringGlow.position.set(s * 0.75, -0.05, 2.61);
    g.add(ringGlow);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 1.6, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(s * 0.75, -0.05, 3.4);
    g.add(flame);
    flames.push(flame);
  }
  g.userData.flames = flames;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// How hot the engines look (0 idle .. 1 full burn)
export function setThrust(ship, t) {
  for (const f of ship.userData.flames) {
    const s = 0.3 + t * 0.9 + Math.random() * 0.12;
    f.scale.set(1, s, 1);
    f.position.z = 2.6 + 0.8 * s;
  }
}

export function setupShip(game, { dock, onDestroyed }) {
  const { scene, net, input, camera, CONFIG, world, remotes } = game;
  const op = game.opItems;

  // Upgradable stats (spaceRpg.js sets these from your upgrades and level)
  const stats = { speed: 45, boost: 1.8, accel: 38, laser: 10, fireRate: 7, maxHull: 100, mining: 1 };

  const ship = buildShip();
  scene.add(ship);
  const pos = ship.position;
  const vel = new THREE.Vector3();
  let piloting = false;
  let hull = stats.maxHull;
  let roll = 0;
  let thrust = 0;
  let docked = true;
  const keys = new Set();

  function parkAtDock() {
    pos.set(dock.x, dock.y + 1.2, dock.z);
    ship.rotation.set(0, 0, 0);
    vel.set(0, 0, 0);
    docked = true;
  }
  parkAtDock();

  // ---------- Keys while flying ----------
  // Grab Space/Shift/C before the game sees them (no jumping, jetpack or air dash while flying)
  const FLIGHT_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft']);
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (piloting && FLIGHT_KEYS.has(e.code) && input.enabled) e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', (e) => keys.delete(e.code), true);
  window.addEventListener('blur', () => keys.clear());
  const down = (...codes) => input.enabled && codes.some((c) => keys.has(c));

  // ---------- Inventory while flying ----------
  addItemLock(game, () => piloting);
  let savedInv = null;
  function giveShipControls() {
    const inv = game.inventory;
    savedInv = { slots: inv.slots.map((s) => s && { ...s }), selected: inv.selected };
    inv.clear();
    inv.add({ id: 'ship-blasters', name: 'Ship Lasers', icon: '🔫', maxStack: 1, count: 1 });
    inv.select(0);
  }
  function restoreInventory() {
    if (!savedInv) return;
    const inv = game.inventory;
    inv.held = null;
    savedInv.slots.forEach((s, i) => (inv.slots[i] = s && { ...s }));
    inv.select(savedInv.selected);
    inv.changed();
    savedInv = null;
  }

  // ---------- Boarding ----------
  function canBoard() {
    const p = game.player?.position;
    if (!p || piloting) return false;
    return p.distanceTo(pos) < 5;
  }
  function board() {
    const player = game.player;
    if (!player || piloting) return;
    piloting = true;
    docked = false;
    ship.visible = true;
    giveShipControls();
    player.extraState.sh = [0, 0, 0, 0];
    game.chat('🚀 W/S thrust · A/D strafe · Space/C up/down · Shift boost · click to shoot · E to get out', true);
  }
  // Get out onto whatever is under the ship
  const _ray = new THREE.Raycaster();
  const _down = new THREE.Vector3(0, -1, 0);
  function tryExit() {
    const player = game.player;
    if (!piloting || !player) return false;
    if (vel.length() > 10) {
      game.chat('Slow down to get out (S to brake)', true);
      return false;
    }
    _ray.set(pos, _down);
    _ray.far = 25;
    const hit = _ray.intersectObjects(world.colliders, false)[0];
    if (!hit) {
      game.chat('Nothing to stand on down there. Fly over a pad or platform to get out.', true);
      return false;
    }
    leave(hit.point.clone().add(new THREE.Vector3(2.5, 0.3, 0)));
    return true;
  }
  function leave(at) {
    const player = game.player;
    piloting = false;
    delete player.extraState.sh;
    restoreInventory();
    player.position.copy(at);
    player.velocity.set(0, 0, 0);
    vel.set(0, 0, 0);
    setThrust(ship, 0);
  }

  function damage(n, cause = 'pirates') {
    if (!piloting || n <= 0) return;
    hull = Math.max(0, hull - n);
    flashHud();
    if (hull <= 0) destroy(cause);
  }
  function destroy(cause) {
    const at = pos.clone();
    op.boomAll(at, 6, 0, 0, { color: 0xffa531 });
    net.sendEvent({ kind: 'op:blink', a: at.toArray() });
    leave(at);
    hull = stats.maxHull;
    parkAtDock();
    onDestroyed?.(cause);
  }
  function repair() {
    hull = stats.maxHull;
  }
  function towHome() {
    if (piloting) return;
    hull = stats.maxHull;
    parkAtDock();
  }

  // ---------- Lasers ----------
  let gunSide = 1;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true);
  const beams = [];
  function beam(a, b, color) {
    const m = new THREE.Mesh(beamGeo, color ? beamMat.clone() : beamMat);
    if (color) m.material.color.setHex(color);
    m.scale.y = a.distanceTo(b);
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.rotateX(Math.PI / 2);
    scene.add(m);
    beams.push({ m, t: 0, own: !!color });
  }

  let audio = null;
  function pew() {
    try {
      audio ||= new AudioContext();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.13);
    } catch {}
  }

  // Shoot along the crosshair. targets: meshes with userData.onLaser(dmg, point)
  let getTargets = () => [];
  const _fwd = new THREE.Vector3();
  function fire() {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(_fwd).clone();
    _ray.set(origin, dir);
    _ray.far = 450;
    const hits = _ray.intersectObjects([...getTargets(), ...world.colliders], true);
    const hit = hits.find((h) => !isPartOf(h.object, ship));
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 450);
    const gun = new THREE.Vector3(gunSide * 1.5, -0.1, -0.9).applyEuler(ship.rotation).add(pos);
    gunSide = -gunSide;
    beam(gun, end);
    net.sendEvent({ kind: 'sp:laser', a: gun.toArray().map(r2), b: end.toArray().map(r2) });
    pew();
    if (hit) {
      let o = hit.object;
      while (o && !o.userData.onLaser) o = o.parent;
      o?.userData.onLaser(stats.laser, hit.point);
    }
    // Other players' ships (or bodies) along the shot
    const range = hit ? hit.distance : 450;
    for (const rp of remotes.players.values()) {
      const c = rp.mesh.position.clone();
      c.y += rp.state?.sh ? CONFIG.eyeHeight - COCKPIT.y : 1;
      const rel = c.clone().sub(origin);
      const along = rel.dot(dir);
      if (along < 0 || along > range) continue;
      const off = rel.addScaledVector(dir, -along).length();
      if (off < (rp.state?.sh ? 2.6 : 0.8)) net.sendEvent({ kind: 'sp:hit', target: rp.id, dmg: stats.laser });
    }
  }
  const isPartOf = (o, root) => {
    for (; o; o = o.parent) if (o === root) return true;
    return false;
  };

  registerItemModel('ship-blasters', () => new THREE.Group()); // nothing in your hands while flying
  registerItem({
    id: 'ship-blasters',
    name: 'Ship Lasers',
    icon: '🔫',
    description: 'Your starship\'s twin lasers. Hold to fire. They mine glowing asteroids too.',
    anim: 'blow',
    hold(ctx, dt, state) {
      if (!piloting) return;
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 1 / stats.fireRate;
      fire();
    },
  });

  // ---------- Other players' ships ----------
  const remoteShips = new Map(); // id -> ship
  net.on('event', (msg) => {
    if (msg.kind === 'sp:laser' && Array.isArray(msg.a) && Array.isArray(msg.b)) {
      beam(new THREE.Vector3().fromArray(msg.a), new THREE.Vector3().fromArray(msg.b), 0xff6a5d);
    } else if (msg.kind === 'sp:hit' && msg.target === net.id && game.player) {
      const dmg = Math.min(+msg.dmg || 0, 60);
      const name = remotes.players.get(msg.from)?.name || 'someone';
      if (piloting) damage(dmg, name);
      else game.player.takeDamage(dmg, name);
    }
  });
  net.on('playerLeft', ({ id }) => {
    const s = remoteShips.get(id);
    if (s) scene.remove(s);
    remoteShips.delete(id);
  });

  // ---------- HUD ----------
  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position: 'fixed', left: '50%', bottom: '120px', transform: 'translateX(-50%)', display: 'none',
    padding: '8px 14px', borderRadius: '10px', background: 'rgba(8,14,26,0.72)', border: '1px solid rgba(95,212,255,0.35)',
    font: '600 14px system-ui, sans-serif', color: '#bfe8ff', pointerEvents: 'none', minWidth: '220px', textAlign: 'center',
  });
  hud.innerHTML = `<div class="sp-speed"></div>
    <div style="height:8px;background:rgba(255,255,255,0.12);border-radius:4px;margin-top:6px;overflow:hidden">
      <div class="sp-hull" style="height:100%;width:100%;background:#5fd4ff;transition:width .15s"></div></div>`;
  document.getElementById('hud').appendChild(hud);
  const speedEl = hud.querySelector('.sp-speed');
  const hullEl = hud.querySelector('.sp-hull');
  let hudFlash = 0;
  function flashHud() {
    hudFlash = 0.25;
  }

  // ---------- Per frame ----------
  const _q = new THREE.Euler(0, 0, 0, 'YXZ');
  const _v = new THREE.Vector3();
  let owner = null;
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      if (piloting) {
        piloting = false;
        savedInv = null;
      }
      hull = stats.maxHull;
      parkAtDock();
    }

    if (piloting) {
      // Aim with the mouse (the camera already turned the player)
      const yaw = player.yaw, pitch = player.pitch;
      _q.set(pitch, yaw, 0);
      const fwd = _v.set(0, 0, -1).applyEuler(_q).clone();
      const right = new THREE.Vector3(1, 0, 0).applyEuler(_q);
      const up = new THREE.Vector3(0, 1, 0);

      let f = 0, s = 0, u = 0;
      if (down('KeyW', 'ArrowUp')) f += 1;
      if (down('KeyS', 'ArrowDown')) f -= 1;
      if (down('KeyD', 'ArrowRight')) s += 1;
      if (down('KeyA', 'ArrowLeft')) s -= 1;
      if (down('Space')) u += 1;
      if (down('KeyC', 'ControlLeft')) u -= 1;
      const boosting = down('ShiftLeft', 'ShiftRight') && f > 0;
      const max = stats.speed * (boosting ? stats.boost : 1);
      const accel = stats.accel * (boosting ? 1.6 : 1);
      vel.addScaledVector(fwd, f * accel * dt);
      vel.addScaledVector(right, s * accel * 0.7 * dt);
      vel.addScaledVector(up, u * accel * 0.7 * dt);
      // Space drag (brakes when you let go), and a speed limit
      vel.multiplyScalar(Math.max(0, 1 - (f === 0 && s === 0 && u === 0 ? 1.4 : 0.35) * dt));
      if (vel.length() > max) vel.setLength(Math.max(max, vel.length() - accel * 2 * dt));

      // Bumping into things
      const step = vel.length() * dt;
      if (step > 0.001) {
        _ray.set(pos, vel.clone().normalize());
        _ray.far = step + 2.2;
        const hit = _ray.intersectObjects(world.colliders, false).find((h) => !isPartOf(h.object, ship));
        if (hit) {
          const impact = vel.length();
          const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : vel.clone().normalize().negate();
          vel.reflect(n).multiplyScalar(0.3);
          if (impact > 14) damage((impact - 14) * 1.5, 'a crash');
        }
      }
      pos.addScaledVector(vel, dt);

      // Bank into turns and strafes
      roll += ((-s * 0.45) - roll) * Math.min(1, dt * 4);
      thrust += ((f > 0 ? (boosting ? 1 : 0.6) : 0.1) - thrust) * Math.min(1, dt * 5);
      ship.rotation.set(pitch, yaw, roll, 'YXZ');
      setThrust(ship, thrust);

      // Put the player (and the camera) in the cockpit
      const cam = COCKPIT.clone().applyEuler(ship.rotation).add(pos);
      player.position.set(cam.x, cam.y - CONFIG.eyeHeight, cam.z);
      player.velocity.set(0, 0, 0);
      player.fuel = 0;
      camera.position.copy(cam);
      player.extraState.sh = [r2(yaw), r2(pitch), r2(roll), r2(thrust)];

      // Leaving the space zone or falling off the world: tow back
      if (!game.space.inSpace() && !insideZone(pos)) destroy('flying off into the void');

      hud.style.display = 'block';
      speedEl.textContent = `${Math.round(vel.length())} m/s${boosting ? ' · BOOST' : ''} · hull ${Math.ceil(hull)}/${stats.maxHull}`;
      hullEl.style.width = `${(hull / stats.maxHull) * 100}%`;
      hudFlash = Math.max(0, hudFlash - dt);
      hullEl.style.background = hudFlash > 0 ? '#ff5a3a' : hull / stats.maxHull < 0.3 ? '#ff8a3a' : '#5fd4ff';
    } else {
      hud.style.display = 'none';
      setThrust(ship, 0.05);
    }

    // Laser beams fade
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t += dt;
      b.m.material.opacity = 0.9 * (1 - b.t / 0.09);
      if (b.t > 0.09) {
        scene.remove(b.m);
        if (b.own) b.m.material.dispose();
        beams.splice(i, 1);
      }
    }

    // Draw other players' ships; hide their bodies while they fly
    for (const rp of remotes.players.values()) {
      const sh = rp.state?.sh;
      let s = remoteShips.get(rp.id);
      if (!Array.isArray(sh)) {
        if (s) s.visible = false;
        continue;
      }
      if (!s) {
        s = buildShip(rp.color ?? 0xff9a3d);
        scene.add(s);
        remoteShips.set(rp.id, s);
      }
      s.visible = true;
      s.rotation.set(sh[1] || 0, sh[0] || 0, sh[2] || 0, 'YXZ');
      const cam = rp.mesh.position.clone();
      cam.y += CONFIG.eyeHeight;
      s.position.copy(cam).sub(COCKPIT.clone().applyEuler(s.rotation));
      setThrust(s, sh[3] || 0);
      rp.mesh.visible = false;
    }
  });

  const insideZone = (p) => {
    const z = game.space.ZONE;
    return p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1;
  };

  return {
    ship,
    stats,
    get piloting() { return piloting; },
    get hull() { return hull; },
    get docked() { return docked; },
    get position() { return pos; },
    get velocity() { return vel; },
    canBoard,
    board,
    tryExit,
    damage,
    repair,
    towHome,
    setTargets(fn) { getTargets = fn; },
  };
}

const r2 = (n) => Math.round(n * 100) / 100;
