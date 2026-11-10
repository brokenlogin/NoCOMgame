// Your starship for the space RPG (spaceRpg.js sets it up).
//
// Flying: E near your ship to board, E again to get out (only when you're slow and over
// something to stand on). Mouse aims, W/S thrust, A/D strafe, Space up, C down, Shift boost.
//   Left click   main laser (mode depends on the equipped weapon: twin, scatter, rail, repeater)
//   R            secondary weapon (missiles lock onto the enemy nearest your crosshair)
//   Q            switch secondary · F use a repair kit · V cockpit / chase camera
// Shields soak damage first and recharge a few seconds after you stop getting hit.
// Boost drains energy, which refills when you let go of Shift.
//
// The ship is yours alone (everyone has their own), but other players see it fly:
// your position is the normal player position, and player.extraState.sh carries
// [yaw, pitch, roll, thrust, look, paint, trail] while you pilot. Laser shots are shared as
// { kind: 'sp:laser', a, b, c } and hits on other ships as { kind: 'sp:hit', target, dmg }.

import * as THREE from 'three';
import { registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { itemTexture } from './itemTextures.js';
import { addItemLock } from './mgShared.js';
import { SECONDARIES, PAINTS, TRAILS } from './spaceData.js';

export const LOOKS = ['scout', 'fighter', 'hauler', 'gunship'];
// Camera spot relative to each ship's origin
const COCKPITS = {
  scout: new THREE.Vector3(0, 1.05, 0.35),
  fighter: new THREE.Vector3(0, 0.95, 0.1),
  hauler: new THREE.Vector3(0, 1.75, -2.2),
  gunship: new THREE.Vector3(0, 1.45, -0.4),
};
const CHASE = { scout: [3.2, 11], fighter: [3, 11], hauler: [5, 17], gunship: [4.5, 15] }; // [up, back]

// ---------- Ship models (yours and everyone else's) ----------
export function buildShip(accent = 0x3ad6ff, look = 'scout') {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.45, metalness: 0.35, bumpMap: itemTexture('brushed'), bumpScale: 0.4 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.5, map: itemTexture('carbon') });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, emissive: accent, emissiveIntensity: 0.25 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xffffff, map: itemTexture('hazard'), roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: accent });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const flames = [];
  const engineAt = (x, y, z, r = 0.32, len = 1.2) => {
    const engine = add(new THREE.CylinderGeometry(r, r * 1.18, len, 16), carbon, x, y, z);
    engine.rotation.x = Math.PI / 2;
    add(new THREE.CircleGeometry(r * 0.88, 20), glowMat, x, y, z + len / 2 + 0.01);
    const flame = add(
      new THREE.ConeGeometry(r * 0.8, 1.6, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
      x, y, z + len / 2 + 0.8
    );
    flame.rotation.x = Math.PI / 2;
    flame.userData.base = z + len / 2;
    flames.push(flame);
  };
  const wingLights = (x, y, z) => {
    for (const s of [1, -1]) add(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x40ff70 : 0xff4040 }), s * x, y, z);
  };
  const guns = [];

  if (look === 'fighter') {
    // Long needle nose, swept delta wings, one big engine and two small ones
    const body = add(new THREE.CapsuleGeometry(0.6, 4.4, 8, 20), paint);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1, 1, 0.58);
    const nose = add(new THREE.ConeGeometry(0.34, 2, 20), paint, 0, 0, -3.6);
    nose.rotation.x = -Math.PI / 2;
    nose.scale.set(1, 0.58, 1);
    const canopy = add(new THREE.SphereGeometry(0.42, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, 0, 0.3, -0.9);
    canopy.scale.set(0.9, 0.7, 2.3);
    const wing = new THREE.Shape();
    wing.moveTo(0, -1.2);
    wing.lineTo(3.8, 2.4);
    wing.lineTo(3.8, 2.9);
    wing.lineTo(0, 2.7);
    wing.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    for (const s of [1, -1]) {
      const w = add(wingGeo, carbon, 0, -0.05, 0);
      w.rotation.x = -Math.PI / 2;
      w.scale.x = s;
      add(new THREE.BoxGeometry(0.1, 0.06, 2.4), accentMat, s * 2.2, 0.03, 1.3).rotation.y = s * -0.75;
      const fin = add(new THREE.BoxGeometry(0.07, 1.1, 1.3), paint, s * 0.35, 0.6, 2.2);
      fin.rotation.z = s * 0.25;
      const canard = add(new THREE.BoxGeometry(1.2, 0.05, 0.5), carbon, s * 0.7, 0, -2.2);
      canard.rotation.y = s * 0.3;
      const gun = add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), dark, s * 3.75, 0, 1.6);
      gun.rotation.x = Math.PI / 2;
      guns.push(new THREE.Vector3(s * 3.75, 0, 0.8));
    }
    for (const z of [-1.6]) add(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 24, 1, true), accentMat, 0, 0, z).rotation.x = Math.PI / 2;
    engineAt(0, 0, 2.7, 0.42, 1.2);
    engineAt(0.75, -0.05, 2.4, 0.2, 0.9);
    engineAt(-0.75, -0.05, 2.4, 0.2, 0.9);
    wingLights(3.8, 0, 2.7);
  } else if (look === 'hauler') {
    // Boxy freighter: cab up front, cargo pods on the sides, four engines
    add(new THREE.BoxGeometry(2.2, 1.7, 6.5), paint);
    add(new THREE.BoxGeometry(1.8, 1.2, 1.8), paint, 0, 0.9, -2.6); // cab
    const win = add(new THREE.BoxGeometry(1.6, 0.5, 0.05), glassMat, 0, 1.15, -3.52);
    win.rotation.x = -0.3;
    add(new THREE.BoxGeometry(2.3, 0.25, 6.6), hazard, 0, -0.75, 0);
    for (const s of [1, -1]) {
      for (const z of [-1.2, 1.2]) {
        add(new THREE.BoxGeometry(1.3, 1.3, 2.1), s > 0 ? accentMat : carbon, s * 1.85, 0, z);
        add(new THREE.BoxGeometry(1.32, 0.12, 2.12), dark, s * 1.85, 0.4, z);
      }
      const gun = add(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 10), dark, s * 1.1, 0.95, -2.6);
      gun.rotation.x = Math.PI / 2;
      guns.push(new THREE.Vector3(s * 1.1, 0.95, -3.3));
      add(new THREE.BoxGeometry(1.4, 0.08, 1), carbon, s * 2.8, -0.3, 2.2);
    }
    engineAt(0.65, 0.45, 3.6, 0.38, 1.1);
    engineAt(-0.65, 0.45, 3.6, 0.38, 1.1);
    engineAt(0.65, -0.45, 3.6, 0.38, 1.1);
    engineAt(-0.65, -0.45, 3.6, 0.38, 1.1);
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), dark, 0.5, 2.0, -2.6);
    add(new THREE.SphereGeometry(0.08, 8, 6), glowMat, 0.5, 2.6, -2.6);
    wingLights(3.5, -0.3, 2.2);
  } else if (look === 'gunship') {
    // Twin hulls joined by a wide wing, turrets on top
    for (const s of [1, -1]) {
      const pod = add(new THREE.CapsuleGeometry(0.62, 4.6, 8, 18), paint, s * 1.7, 0, 0.2);
      pod.rotation.x = Math.PI / 2;
      pod.scale.set(1, 1, 0.75);
      const n = add(new THREE.ConeGeometry(0.4, 1.3, 16), dark, s * 1.7, 0, -3.1);
      n.rotation.x = -Math.PI / 2;
      add(new THREE.CylinderGeometry(0.64, 0.64, 0.2, 24, 1, true), accentMat, s * 1.7, 0, -1.4).rotation.x = Math.PI / 2;
      engineAt(s * 1.7, 0, 3.2, 0.42, 1.2);
      engineAt(s * 0.6, -0.1, 2.6, 0.24, 0.9);
      // Turret
      add(new THREE.SphereGeometry(0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, s * 1.7, 0.42, -0.6);
      const barrel = add(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 10), carbon, s * 1.7, 0.7, -1.3);
      barrel.rotation.x = Math.PI / 2;
      guns.push(new THREE.Vector3(s * 1.7, 0.7, -2.1));
      add(new THREE.BoxGeometry(0.08, 1.2, 1.4), paint, s * 1.7, 0.8, 2.6); // tail fin
    }
    add(new THREE.BoxGeometry(3.4, 0.3, 3.2), carbon, 0, 0, 0.4);
    const bridge = add(new THREE.CapsuleGeometry(0.55, 2, 8, 16), paint, 0, 0.45, -0.2);
    bridge.rotation.x = Math.PI / 2;
    bridge.scale.set(1, 1, 0.7);
    const canopy = add(new THREE.SphereGeometry(0.45, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, 0, 0.75, -0.8);
    canopy.scale.set(0.9, 0.7, 1.7);
    for (const s of [1, -1]) {
      const wing = add(new THREE.BoxGeometry(2.6, 0.12, 2), carbon, s * 3.6, 0, 1);
      wing.rotation.z = s * -0.12;
      add(new THREE.BoxGeometry(0.4, 0.14, 2.02), accentMat, s * 4.5, -0.08, 1);
    }
    wingLights(4.9, -0.2, 1.8);
  } else {
    // Scout (the original Sparrow)
    const body = add(new THREE.CapsuleGeometry(0.75, 3.4, 8, 20), paint);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1, 1, 0.62);
    const nose = add(new THREE.ConeGeometry(0.42, 1.3, 20), paint, 0, 0, -2.75);
    nose.rotation.x = -Math.PI / 2;
    nose.scale.set(1, 0.62, 1);
    for (const z of [-1.2, 0.9]) {
      const stripe = add(new THREE.CylinderGeometry(0.77, 0.77, 0.18, 24, 1, true), accentMat, 0, 0, z);
      stripe.rotation.x = Math.PI / 2;
      stripe.scale.set(1, 1, 0.63);
    }
    const canopy = add(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, 0, 0.35, -0.6);
    canopy.scale.set(0.9, 0.75, 1.9);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.9);
    wingShape.lineTo(3.4, 1.6);
    wingShape.lineTo(3.6, 2.2);
    wingShape.lineTo(0, 2.6);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 1 });
    for (const s of [1, -1]) {
      const wing = add(wingGeo, carbon, 0, -0.05, -0.6);
      wing.rotation.x = -Math.PI / 2;
      wing.scale.x = s;
      const gun = add(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), carbon, s * 1.5, -0.1, -0.2);
      gun.rotation.x = Math.PI / 2;
      guns.push(new THREE.Vector3(s * 1.5, -0.1, -0.9));
      const fin = add(new THREE.BoxGeometry(0.08, 0.9, 1.1), paint, s * 0.45, 0.55, 1.95);
      fin.rotation.z = s * 0.35;
    }
    engineAt(0.75, -0.05, 2.0);
    engineAt(-0.75, -0.05, 2.0);
    wingLights(3.55, 0, 1.6);
  }

  // Shield bubble (flashes when the shield takes a hit)
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  const size = { scout: [4, 1.6, 4.2], fighter: [4.4, 1.6, 5], hauler: [4, 2.4, 5], gunship: [5.4, 2, 4.8] }[look] || [4, 1.6, 4.2];
  bubble.scale.set(...size);
  g.add(bubble);

  g.userData.flames = flames;
  g.userData.guns = guns;
  g.userData.bubble = bubble;
  g.userData.look = look;
  g.traverse((o) => {
    if (o.isMesh && o !== bubble) o.castShadow = true;
  });
  return g;
}

// How hot the engines look (0 idle .. 1 full burn)
export function setThrust(ship, t) {
  for (const f of ship.userData.flames) {
    const s = 0.3 + t * 0.9 + Math.random() * 0.12;
    f.scale.set(1, s, 1);
    f.position.z = f.userData.base + 0.8 * s;
  }
}

export function setupShip(game, hooks = {}) {
  const { scene, net, input, camera, CONFIG, world, remotes } = game;
  const { dock, fx, hud } = hooks;
  const op = game.opItems;

  // Stats (spaceRpg.js sets these from your ship, upgrades, level, skills and gear)
  const stats = {
    speed: 45, boost: 1.8, accel: 38, laser: 10, fireRate: 7, maxHull: 100, maxShield: 40,
    shieldRegen: 12, shieldDelay: 3.5, boostCap: 4, dodge: 0, hullRegen: 0, crit: 0.05, critMult: 2,
    laserMode: 'twin', secondaryDmg: 1, ammoBonus: 0, lifesteal: 0, overcharge: false, chain: false,
    phoenix: false, magnet: 1, color: 0x3ad6ff,
  };

  let look = 'scout', paintIdx = 0, trailIdx = 0;
  let ship = buildShip(stats.color, look);
  scene.add(ship);
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let piloting = false;
  let hull = stats.maxHull;
  let shield = stats.maxShield;
  let energy = 1; // boost energy 0..1
  let sinceHit = 99;
  let roll = 0;
  let thrust = 0;
  let docked = true;
  let chase = false;
  let phoenixUsed = false;
  const keys = new Set();

  // Secondary weapons
  let owned = ['missiles'];
  let secondary = 'missiles';
  const ammo = {};
  const ammoTimer = {};
  const maxAmmo = (id) => (SECONDARIES[id].ammo ? SECONDARIES[id].ammo + stats.ammoBonus : 0);
  for (const id of Object.keys(SECONDARIES)) {
    ammo[id] = maxAmmo(id);
    ammoTimer[id] = 0;
  }
  let kits = 0;

  function parkAtDock() {
    pos.set(dock.x, dock.y + 1.2, dock.z);
    ship.position.copy(pos);
    ship.rotation.set(0, 0, 0);
    vel.set(0, 0, 0);
    docked = true;
  }
  parkAtDock();

  // Swap the model (new ship bought, or a new paint job)
  function setLook(newLook, newPaint = paintIdx, newTrail = trailIdx) {
    const changed = newLook !== look || newPaint !== paintIdx;
    look = newLook;
    paintIdx = newPaint;
    trailIdx = newTrail;
    if (!changed) return;
    const rot = ship.rotation.clone();
    scene.remove(ship);
    ship = buildShip(PAINTS[paintIdx]?.color ?? stats.color, look);
    ship.position.copy(pos);
    ship.rotation.copy(rot);
    scene.add(ship);
  }

  // ---------- Keys while flying ----------
  // Grab flight keys before the game sees them (no jumping, jetpack or air dash while flying)
  const FLIGHT_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'KeyR', 'KeyQ', 'KeyF', 'KeyV']);
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (!piloting || !input.enabled) return;
    if (FLIGHT_KEYS.has(e.code)) e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'KeyR') fireSecondary();
    if (e.code === 'KeyQ') cycleSecondary();
    if (e.code === 'KeyF') useKit();
    if (e.code === 'KeyV') {
      chase = !chase;
      game.chat(chase ? '🎥 Chase camera (V for cockpit)' : '🎥 Cockpit camera (V for chase)', true);
    }
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
    return p.distanceTo(pos) < 5 + (look === 'hauler' || look === 'gunship' ? 2 : 0);
  }
  function board() {
    const player = game.player;
    if (!player || piloting) return;
    piloting = true;
    docked = false;
    phoenixUsed = false;
    ship.visible = true;
    giveShipControls();
    player.extraState.sh = [0, 0, 0, 0, LOOKS.indexOf(look), paintIdx, trailIdx];
    game.chat('🚀 W/S thrust · A/D strafe · Space/C up/down · Shift boost · click lasers · R secondary · Q switch · F repair kit · V camera · E get out', true);
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
    const hit = _ray.intersectObjects(world.colliders, false).find((h) => !isPartOf(h.object, ship));
    if (!hit) {
      game.chat('Nothing to stand on down there. Fly over a pad or platform to get out.', true);
      return false;
    }
    leave(hit.point.clone().add(new THREE.Vector3(3, 0.3, 0)));
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
    fx.engine(false);
  }

  // ---------- Taking damage ----------
  // kind: 'ion' hurts shields double, 'crash' skips the dodge roll
  function damage(n, cause = 'pirates', from = null, kind = '') {
    if (!piloting || n <= 0) return;
    if (kind !== 'crash' && Math.random() < stats.dodge) {
      hud.toast('Dodged!', '#7affc8');
      return;
    }
    sinceHit = 0;
    if (from) hud.damageFrom(from);
    const bubble = ship.userData.bubble;
    if (shield > 0) {
      const sdmg = kind === 'ion' ? n * 2 : n;
      const absorbed = Math.min(shield, sdmg);
      shield -= absorbed;
      n -= kind === 'ion' ? absorbed / 2 : absorbed;
      bubble.material.opacity = 0.35;
      fx.sfx(shield <= 0 ? 'shieldDown' : 'shieldHit');
      fx.shake(0.12);
    }
    if (n > 0) {
      hull = Math.max(0, hull - n);
      fx.sfx('hullHit');
      fx.shake(Math.min(0.5, 0.15 + n / 60));
      flashHud();
      if (hull > 0 && hull / stats.maxHull < 0.25) fx.sfx('alarm');
    }
    if (hull <= 0) {
      if (stats.phoenix && !phoenixUsed) {
        phoenixUsed = true;
        hull = stats.maxHull * 0.3;
        shield = stats.maxShield;
        fx.explode(pos, 1.5, 0xffa32a, { debris: false });
        hud.toast('🔥 Phoenix Core: back from the brink!', '#ffa32a');
        return;
      }
      destroy(cause);
    }
  }
  function destroy(cause) {
    const at = pos.clone();
    fx.explode(at, 3, 0xffa531);
    net.sendEvent({ kind: 'sp:boom', p: at.toArray().map(r2), s: 3 });
    leave(at);
    hull = stats.maxHull;
    shield = stats.maxShield;
    parkAtDock();
    hooks.onDestroyed?.(cause);
  }
  function repair(frac = 1) {
    hull = Math.min(stats.maxHull, hull + stats.maxHull * frac);
    if (frac >= 1) shield = stats.maxShield;
  }
  function towHome() {
    if (piloting) return;
    hull = stats.maxHull;
    shield = stats.maxShield;
    parkAtDock();
  }
  function useKit() {
    if (kits <= 0) {
      hud.toast('No repair kits (craft them at a refinery)', '#ff8a7a');
      fx.sfx('error');
      return;
    }
    if (hull >= stats.maxHull) {
      hud.toast('Hull is already full', '#bfe8ff');
      return;
    }
    kits--;
    repair(0.4);
    fx.sfx('repair');
    hud.toast(`🔧 Repaired! ${kits} kit${kits === 1 ? '' : 's'} left`, '#7affc8');
    hooks.onKits?.(kits);
  }

  // ---------- Main laser ----------
  let gunSide = 0;
  let shots = 0;
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true);
  const beams = [];
  const beamMats = new Map();
  function beamMat(color) {
    if (!beamMats.has(color)) beamMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    return beamMats.get(color);
  }
  function beam(a, b, color = 0x5dff8a, width = 1, life = 0.09) {
    const m = new THREE.Mesh(beamGeo, beamMat(color).clone());
    m.scale.set(width, a.distanceTo(b), width);
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.rotateX(Math.PI / 2);
    scene.add(m);
    beams.push({ m, t: 0, life });
  }
  const MODE = {
    twin: { color: 0x5dff8a, width: 1, sound: 'laser' },
    scatter: { color: 0xffb03a, width: 0.8, sound: 'scatter' },
    rail: { color: 0x9a7aff, width: 3, sound: 'rail', pierce: 4 },
    repeater: { color: 0xff5ad0, width: 0.7, sound: 'repeater' },
  };

  // Shoot along the crosshair. targets: meshes with userData.onLaser(dmg, point, kind)
  let getTargets = () => [];
  const _fwd = new THREE.Vector3();
  function gunPos() {
    const guns = ship.userData.guns;
    const g = guns[gunSide % guns.length];
    gunSide++;
    return g.clone().applyEuler(ship.rotation).add(pos);
  }
  function rayHits(origin, dir, range = 450) {
    _ray.set(origin, dir);
    _ray.far = range;
    return _ray.intersectObjects([...getTargets(), ...world.colliders], true).filter((h) => !isPartOf(h.object, ship));
  }
  const targetOf = (o) => {
    while (o && !o.userData.onLaser) o = o.parent;
    return o;
  };
  function strike(obj, dmg, point, kind = 'laser') {
    let crit = false;
    if (Math.random() < stats.crit) {
      dmg *= stats.critMult;
      crit = true;
    }
    obj.userData.onLaser(dmg, point, kind);
    if (obj.userData.hostile) {
      hud.hit(crit);
      fx.sfx(crit ? 'crit' : 'hit');
      if (stats.lifesteal && piloting) hull = Math.min(stats.maxHull, hull + dmg * stats.lifesteal);
    }
    fx.sparks(point, crit ? 0xffd23d : 0xfff0a0, crit ? 12 : 6);
    hooks.onHit?.(obj, dmg, crit);
    return crit;
  }
  function fire() {
    const mode = MODE[stats.laserMode] || MODE.twin;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const aim = camera.getWorldDirection(_fwd).clone();
    shots++;
    let dmg = stats.laser;
    if (stats.overcharge && shots % 6 === 0) dmg *= 3;
    const rays = stats.laserMode === 'scatter' ? [-1, 0, 1] : [0];
    for (const k of rays) {
      const dir = aim.clone();
      if (k) {
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        dir.addScaledVector(right, k * 0.035).addScaledVector(up, (Math.random() - 0.5) * 0.03).normalize();
      }
      const hits = rayHits(origin, dir);
      let end = origin.clone().addScaledVector(dir, 450);
      let struck = 0;
      for (const h of hits) {
        const t = targetOf(h.object);
        end = h.point;
        if (!t) break; // hit a wall or rock
        strike(t, dmg, h.point, stats.laserMode);
        struck++;
        if (stats.chain && t.userData.hostile) chainFrom(t, h.point, dmg * 0.5);
        if (!mode.pierce || struck >= mode.pierce) break;
      }
      const gun = gunPos();
      beam(gun, end, mode.color, mode.width, stats.laserMode === 'rail' ? 0.25 : 0.09);
      net.sendEvent({ kind: 'sp:laser', a: gun.toArray().map(r2), b: end.toArray().map(r2), c: mode.color, w: mode.width });
      hitPlayersAlong(origin, dir, hits[0] ? hits[0].distance : 450, dmg);
    }
    fx.sfx(mode.sound);
  }
  function chainFrom(from, point, dmg) {
    const p = from.getWorldPosition(new THREE.Vector3());
    let best = null, bestD = 30;
    for (const t of getTargets()) {
      if (t === from || !t.userData.hostile || !t.visible) continue;
      const d = t.getWorldPosition(new THREE.Vector3()).distanceTo(p);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (!best) return;
    const q = best.getWorldPosition(new THREE.Vector3());
    beam(point, q, 0x9fe8ff, 0.6, 0.15);
    best.userData.onLaser(dmg, q, 'chain');
  }
  // Other players' ships (or bodies) along the shot
  function hitPlayersAlong(origin, dir, range, dmg) {
    for (const rp of remotes.players.values()) {
      const c = rp.mesh.position.clone();
      c.y += rp.state?.sh ? CONFIG.eyeHeight - 1 : 1;
      const rel = c.clone().sub(origin);
      const along = rel.dot(dir);
      if (along < 0 || along > range) continue;
      const off = rel.addScaledVector(dir, -along).length();
      if (off < (rp.state?.sh ? 2.6 : 0.8)) {
        net.sendEvent({ kind: 'sp:hit', target: rp.id, dmg: Math.round(dmg) });
        hud.hit(false);
      }
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
    description: 'Your starship\'s main lasers. Hold to fire. They mine glowing asteroids too.',
    anim: 'blow',
    hold(ctx, dt, state) {
      if (!piloting) return;
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 1 / stats.fireRate;
      fire();
    },
  });

  // ---------- Lock-on (nearest hostile to your crosshair) ----------
  let lock = null, lockTime = 0;
  const _tp = new THREE.Vector3();
  function updateLock(dt) {
    const origin = camera.position;
    const dir = camera.getWorldDirection(_fwd);
    let best = null, bestA = 0.32;
    for (const t of getTargets()) {
      if (!t.userData.hostile || !t.visible || t.userData.cloaked) continue;
      t.getWorldPosition(_tp);
      const rel = _tp.sub(origin);
      const d = rel.length();
      if (d > 600 || d < 1) continue;
      const a = Math.acos(Math.min(1, rel.dot(dir) / d));
      if (a < bestA) {
        bestA = a;
        best = t;
      }
    }
    if (best !== lock) {
      lock = best;
      lockTime = 0;
      if (best) fx.sfx('lock');
    } else if (lock) {
      const before = lockTime;
      lockTime += dt;
      if (before < 0.6 && lockTime >= 0.6 && secondary === 'missiles') fx.sfx('lockOn');
    }
  }

  // ---------- Secondary weapons ----------
  const projectiles = []; // missiles, mines, ion bolts
  const missileGeo = new THREE.ConeGeometry(0.18, 0.9, 8);
  const missileMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xff6a1a, emissiveIntensity: 0.5 });
  const mineGeo = new THREE.IcosahedronGeometry(0.6, 0);
  const ionGeo = new THREE.SphereGeometry(0.7, 12, 8);
  function cycleSecondary() {
    const i = owned.indexOf(secondary);
    secondary = owned[(i + 1) % owned.length];
    hud.toast(`${SECONDARIES[secondary].icon} ${SECONDARIES[secondary].name}`, '#bfe8ff');
  }
  function fireSecondary() {
    const def = SECONDARIES[secondary];
    if (!def || secondary === 'tractor') return; // tractor is held (see per-frame)
    if (ammo[secondary] <= 0) {
      fx.sfx('error');
      hud.toast(`${def.name}: reloading…`, '#ff8a7a');
      return;
    }
    ammo[secondary]--;
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(ship.rotation);
    const dmg = def.dmg * stats.secondaryDmg;
    if (secondary === 'missiles') {
      const m = new THREE.Mesh(missileGeo, missileMat);
      const from = gunPos();
      m.position.copy(from);
      scene.add(m);
      const target = lockTime >= 0.6 ? lock : null;
      projectiles.push({ kind: 'missile', m, v: fwd.clone().multiplyScalar(vel.length() * 0.5 + 60).add(vel), target, dmg, life: 6 });
      fx.sfx('missile');
      net.sendEvent({ kind: 'sp:fx', t: 'missile', p: from.toArray().map(r2) });
    } else if (secondary === 'mines') {
      const m = new THREE.Mesh(mineGeo, new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff2a1a, emissiveIntensity: 1 }));
      m.position.copy(pos).addScaledVector(fwd, -5);
      scene.add(m);
      projectiles.push({ kind: 'mine', m, v: vel.clone().multiplyScalar(0.2), dmg, life: 60, arm: 0.8 });
      fx.sfx('mine');
    } else if (secondary === 'ion') {
      const m = new THREE.Mesh(ionGeo, new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      const dir = camera.getWorldDirection(new THREE.Vector3());
      m.position.copy(pos).addScaledVector(dir, 4);
      scene.add(m);
      projectiles.push({ kind: 'ion', m, v: dir.multiplyScalar(180).add(vel), dmg, life: 2.5 });
      fx.sfx('ion');
    }
  }
  function hostiles() {
    return getTargets().filter((t) => t.userData.hostile && t.visible);
  }
  function blastAt(p, radius, dmg, kind) {
    fx.explode(p, radius / 8, kind === 'ion' ? 0x7ad8ff : 0xffa531);
    for (const t of hostiles()) {
      const q = t.getWorldPosition(new THREE.Vector3());
      const d = q.distanceTo(p);
      if (d < radius + (t.userData.radius || 2)) strike(t, dmg * (1 - Math.min(0.7, d / radius) * 0.5), q, kind);
    }
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.life -= dt;
      let done = pr.life <= 0;
      if (pr.kind === 'missile') {
        if (pr.target && pr.target.visible && pr.target.parent) {
          const tp = pr.target.getWorldPosition(new THREE.Vector3());
          const want = tp.sub(pr.m.position).normalize().multiplyScalar(Math.max(140, pr.v.length()));
          pr.v.lerp(want, Math.min(1, dt * 3.5));
        }
        pr.v.setLength(Math.min(220, pr.v.length() + dt * 120));
        pr.m.position.addScaledVector(pr.v, dt);
        pr.m.lookAt(pr.m.position.clone().add(pr.v));
        pr.m.rotateX(-Math.PI / 2);
        fx.emit(pr.m.position, null, 0xffa040, 0.5);
        for (const t of hostiles()) {
          if (t.getWorldPosition(_tp).distanceTo(pr.m.position) < (t.userData.radius || 2) + 1.5) {
            blastAt(pr.m.position.clone(), 10, pr.dmg, 'missile');
            done = true;
            break;
          }
        }
      } else if (pr.kind === 'mine') {
        pr.arm -= dt;
        pr.m.position.addScaledVector(pr.v, dt);
        pr.m.rotation.y += dt * 2;
        pr.m.material.emissiveIntensity = Math.sin(performance.now() / 120) > 0 ? 1.5 : 0.2;
        if (pr.arm <= 0) {
          for (const t of hostiles()) {
            if (t.getWorldPosition(_tp).distanceTo(pr.m.position) < 14 + (t.userData.radius || 2)) {
              blastAt(pr.m.position.clone(), 18, pr.dmg, 'mine');
              done = true;
              break;
            }
          }
        }
      } else if (pr.kind === 'ion') {
        pr.m.position.addScaledVector(pr.v, dt);
        fx.emit(pr.m.position, null, 0x7ad8ff, 0.3);
        for (const t of hostiles()) {
          if (t.getWorldPosition(_tp).distanceTo(pr.m.position) < (t.userData.radius || 2) + 2) {
            strike(t, pr.dmg, _tp.clone(), 'ion');
            fx.explode(pr.m.position, 0.6, 0x7ad8ff, { debris: false });
            done = true;
            break;
          }
        }
      }
      if (done) {
        scene.remove(pr.m);
        if (pr.kind !== 'missile') pr.m.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }
  // Tractor beam: hooks.tractor pulls loot; drawn as a soft cone
  const tractorMat = new THREE.MeshBasicMaterial({ color: 0x7affc8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const tractorCone = new THREE.Mesh(new THREE.ConeGeometry(14, 120, 24, 1, true), tractorMat);
  tractorCone.visible = false;
  scene.add(tractorCone);

  // ---------- Other players' ships ----------
  const remoteShips = new Map(); // id -> ship
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  net.on('event', (msg) => {
    if (msg.kind === 'sp:laser' && Array.isArray(msg.a) && Array.isArray(msg.b)) {
      beam(_a.fromArray(msg.a).clone(), _b.fromArray(msg.b).clone(), typeof msg.c === 'number' ? msg.c : 0xff6a5d, Math.min(3, +msg.w || 1));
    } else if (msg.kind === 'sp:hit' && msg.target === net.id && game.player) {
      const dmg = Math.min(+msg.dmg || 0, 120);
      const rp = remotes.players.get(msg.from);
      const name = rp?.name || 'someone';
      if (piloting) damage(dmg, name, rp?.mesh.position);
      else game.player.takeDamage(dmg, name);
    } else if (msg.kind === 'sp:boom' && Array.isArray(msg.p)) {
      fx.explode(_a.fromArray(msg.p).clone(), Math.min(4, +msg.s || 1));
    } else if (msg.kind === 'sp:fx' && msg.t === 'missile' && Array.isArray(msg.p)) {
      fx.explode(_a.fromArray(msg.p).clone(), 0.3, 0xffa040, { debris: false, sound: false });
    }
  });
  net.on('playerLeft', ({ id }) => {
    const s = remoteShips.get(id);
    if (s) scene.remove(s.obj);
    remoteShips.delete(id);
  });

  // ---------- HUD ----------
  const hudEl = document.createElement('div');
  Object.assign(hudEl.style, {
    position: 'fixed', left: '50%', bottom: '112px', transform: 'translateX(-50%)', display: 'none',
    padding: '8px 14px', borderRadius: '10px', background: 'rgba(8,14,26,0.72)', border: '1px solid rgba(95,212,255,0.35)',
    font: '600 13px system-ui, sans-serif', color: '#bfe8ff', pointerEvents: 'none', width: '300px', textAlign: 'center',
  });
  const bar = (cls, color) => `<div style="height:7px;background:rgba(255,255,255,0.12);border-radius:4px;margin-top:4px;overflow:hidden">
      <div class="${cls}" style="height:100%;width:100%;background:${color};transition:width .12s"></div></div>`;
  hudEl.innerHTML = `<div class="sp-speed"></div>${bar('sp-shield', '#5fd4ff')}${bar('sp-hull', '#7affc8')}${bar('sp-boost', '#ffd23d')}
    <div class="sp-sec" style="margin-top:5px;font-size:12px;color:#e6f2ff"></div>`;
  document.getElementById('hud').appendChild(hudEl);
  const speedEl = hudEl.querySelector('.sp-speed');
  const shieldEl = hudEl.querySelector('.sp-shield');
  const hullEl = hudEl.querySelector('.sp-hull');
  const boostEl = hudEl.querySelector('.sp-boost');
  const secEl = hudEl.querySelector('.sp-sec');
  let hudFlash = 0;
  function flashHud() {
    hudFlash = 0.25;
  }

  // ---------- Per frame ----------
  const _q = new THREE.Euler(0, 0, 0, 'YXZ');
  const _v = new THREE.Vector3();
  let owner = null;
  let trailT = 0;
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      if (piloting) {
        piloting = false;
        savedInv = null;
      }
      hull = stats.maxHull;
      shield = stats.maxShield;
      parkAtDock();
    }
    hull = Math.min(hull, stats.maxHull);
    shield = Math.min(shield, stats.maxShield);

    // Ammo trickles back in
    for (const id of owned) {
      const def = SECONDARIES[id];
      if (!def.ammo || ammo[id] >= maxAmmo(id)) continue;
      ammoTimer[id] += dt;
      if (ammoTimer[id] >= def.regen) {
        ammoTimer[id] = 0;
        ammo[id]++;
      }
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
      const boosting = down('ShiftLeft', 'ShiftRight') && f > 0 && energy > 0.02;
      energy = boosting ? Math.max(0, energy - dt / stats.boostCap) : Math.min(1, energy + dt / (stats.boostCap * 1.4));
      const max = stats.speed * (boosting ? stats.boost : 1);
      const accel = stats.accel * (boosting ? 1.6 : 1);
      vel.addScaledVector(fwd, f * accel * dt);
      vel.addScaledVector(right, s * accel * 0.7 * dt);
      vel.addScaledVector(up, u * accel * 0.7 * dt);
      // External pushes (gravity wells, magnets...) from other modules
      if (hooks.force) {
        const push = hooks.force(pos, dt);
        if (push) vel.addScaledVector(push, dt);
      }
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
          if (impact > 14) damage((impact - 14) * 1.5, 'a crash', null, 'crash');
        }
      }
      pos.addScaledVector(vel, dt);

      // Bank into turns and strafes
      roll += ((-s * 0.45) - roll) * Math.min(1, dt * 4);
      thrust += ((f > 0 ? (boosting ? 1 : 0.6) : 0.1) - thrust) * Math.min(1, dt * 5);
      ship.position.copy(pos);
      ship.rotation.set(pitch, yaw, roll, 'YXZ');
      setThrust(ship, thrust);

      // Shields recharge after a while; field repair slowly fixes the hull
      sinceHit += dt;
      if (sinceHit > stats.shieldDelay) shield = Math.min(stats.maxShield, shield + stats.shieldRegen * dt);
      if (stats.hullRegen) hull = Math.min(stats.maxHull, hull + stats.hullRegen * dt);

      // Put the player (and the camera) in the cockpit, or behind the ship
      const cockpit = COCKPITS[look] || COCKPITS.scout;
      const cam = cockpit.clone().applyEuler(ship.rotation).add(pos);
      player.position.set(cam.x, cam.y - CONFIG.eyeHeight, cam.z);
      player.velocity.set(0, 0, 0);
      player.fuel = 0;
      if (chase) {
        const [cu, cb] = CHASE[look] || CHASE.scout;
        camera.position.copy(pos).addScaledVector(fwd, -cb).addScaledVector(up, cu);
      } else {
        camera.position.copy(cam);
      }
      player.extraState.sh = [r2(yaw), r2(pitch), r2(roll), r2(thrust), LOOKS.indexOf(look), paintIdx, trailIdx];

      // Leaving the space zone or falling off the world: tow back
      if (!game.space.inZone(pos)) destroy('flying off into the void');

      // Lock-on, tractor beam, secondary projectiles
      updateLock(dt);
      const pulling = secondary === 'tractor' && down('KeyR');
      tractorCone.visible = pulling;
      if (pulling) {
        tractorCone.position.copy(pos).addScaledVector(fwd, 62);
        tractorCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), fwd);
        tractorMat.opacity = 0.08 + Math.random() * 0.06;
        hooks.tractor?.(pos, fwd, dt);
      }

      fx.engine(true, thrust);
      fx.warp(boosting ? 1 : 0);

      hudEl.style.display = 'block';
      speedEl.textContent = `${Math.round(vel.length())} m/s${boosting ? ' · BOOST' : ''} · 🛡 ${Math.ceil(shield)}/${stats.maxShield} · hull ${Math.ceil(hull)}/${stats.maxHull}`;
      shieldEl.style.width = `${(shield / Math.max(1, stats.maxShield)) * 100}%`;
      hullEl.style.width = `${(hull / stats.maxHull) * 100}%`;
      boostEl.style.width = `${energy * 100}%`;
      hudFlash = Math.max(0, hudFlash - dt);
      hullEl.style.background = hudFlash > 0 ? '#ff5a3a' : hull / stats.maxHull < 0.3 ? '#ff8a3a' : '#7affc8';
      const def = SECONDARIES[secondary];
      secEl.textContent = `${def.icon} ${def.name}${def.ammo ? ` ${ammo[secondary]}/${maxAmmo(secondary)}` : ' (hold R)'} · 🔧 ${kits} kits${owned.length > 1 ? ' · Q switch' : ''}`;
    } else {
      hudEl.style.display = 'none';
      setThrust(ship, 0.05);
      lock = null;
      tractorCone.visible = false;
      fx.warp(0);
      shield = Math.min(stats.maxShield, shield + stats.shieldRegen * dt);
    }

    // Shield bubble fades
    const bubble = ship.userData.bubble;
    bubble.material.opacity = Math.max(0, bubble.material.opacity - dt * 1.2);
    updateProjectiles(dt);

    // Engine trail cosmetic
    trailT += dt;
    if (piloting && trailIdx > 0 && thrust > 0.3 && trailT > 0.02) {
      trailT = 0;
      emitTrail(ship, trailIdx);
    }

    // Laser beams fade
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t += dt;
      b.m.material.opacity = 0.9 * (1 - b.t / b.life);
      if (b.t > b.life) {
        scene.remove(b.m);
        b.m.material.dispose();
        beams.splice(i, 1);
      }
    }

    // Draw other players' ships; hide their bodies while they fly
    for (const rp of remotes.players.values()) {
      const sh = rp.state?.sh;
      let s = remoteShips.get(rp.id);
      if (!Array.isArray(sh)) {
        if (s) s.obj.visible = false;
        continue;
      }
      const rl = LOOKS[sh[4]] || 'scout', rpaint = sh[5] | 0;
      if (!s || s.look !== rl || s.paint !== rpaint) {
        if (s) scene.remove(s.obj);
        s = { obj: buildShip(rpaint ? PAINTS[rpaint]?.color : rp.color ?? 0xff9a3d, rl), look: rl, paint: rpaint };
        scene.add(s.obj);
        remoteShips.set(rp.id, s);
      }
      s.obj.visible = true;
      s.obj.rotation.set(sh[1] || 0, sh[0] || 0, sh[2] || 0, 'YXZ');
      const cam = rp.mesh.position.clone();
      cam.y += CONFIG.eyeHeight;
      s.obj.position.copy(cam).sub((COCKPITS[rl] || COCKPITS.scout).clone().applyEuler(s.obj.rotation));
      setThrust(s.obj, sh[3] || 0);
      if ((sh[6] | 0) > 0 && (sh[3] || 0) > 0.3 && Math.random() < 0.6) emitTrail(s.obj, sh[6] | 0);
      rp.mesh.visible = false;
    }
  });

  function emitTrail(obj, idx) {
    const t = TRAILS[idx];
    if (!t || t.id === 'none') return;
    const color = t.rainbow ? new THREE.Color().setHSL((performance.now() / 1500) % 1, 0.9, 0.6).getHex() : t.color;
    for (const f of obj.userData.flames) {
      const p = f.getWorldPosition(new THREE.Vector3());
      fx.emit(p, null, color, 1.1);
    }
  }

  return {
    get ship() { return ship; },
    stats,
    get piloting() { return piloting; },
    get hull() { return hull; },
    get shield() { return shield; },
    get docked() { return docked; },
    get position() { return pos; },
    get velocity() { return vel; },
    get look() { return look; },
    get lock() { return lock; },
    get locked() { return lock && lockTime >= 0.6; },
    get secondary() { return secondary; },
    get kits() { return kits; },
    set kits(n) { kits = n; },
    get chase() { return chase; },
    setOwned(list, pick) {
      owned = list.length ? list : ['missiles'];
      if (!owned.includes(secondary)) secondary = owned[0];
      if (pick && owned.includes(pick)) secondary = pick;
    },
    refillAmmo() {
      for (const id of Object.keys(SECONDARIES)) ammo[id] = maxAmmo(id);
    },
    ammo,
    setLook,
    canBoard,
    board,
    tryExit,
    damage,
    repair,
    towHome,
    parkAt(p, yaw = 0) {
      pos.copy(p);
      vel.set(0, 0, 0);
      ship.position.copy(p);
      ship.rotation.set(0, yaw, 0);
    },
    // Jump gates: move the ship (and you, if flying) somewhere else
    teleport(p) {
      pos.copy(p);
      vel.set(0, 0, 0);
      ship.position.copy(p);
      if (game.player && piloting) game.player.position.copy(p);
    },
    setTargets(fn) { getTargets = fn; },
    beam,
  };
}

const r2 = (n) => Math.round(n * 100) / 100;
