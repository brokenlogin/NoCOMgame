import * as THREE from 'three';
import { registerItem } from './items.js';
import { registerItemModel, getItemIcon } from './itemModels.js';

// Cars, built from parts. Each car is one chassis + one set of tires + one engine.
//   Hold a chassis and left-click the ground to put it down (a bare car with no wheels).
//   Left-click a car to open its parts menu: put tires and an engine in from your inventory,
//   swap them for different ones, or take them out. Only the owner can change parts.
//   E near a car with tires and an engine: drive it. E again: get out.
//   Driving: W/S gas/brake/reverse, A/D steer, Space handbrake (drift!), V camera.
//   X near your own (empty) car: pack it up and get the three parts back.
// Anyone can drive anyone's car. Only the owner can pack it up. No fuel.
//
// Parts have stats so more kinds can be added later: add an entry to CHASSIS / TIRES / ENGINES
// (same shape as 'standard'), register its item, and give it a recipe in survival.js.
//
// Network (all relayed by the server as plain events):
//   car:place  { id, owner, parts, color, p, yaw, driver }     a car exists (also re-sent to late joiners)
//   car:state  { id, p, yaw, pitch, roll, v, st }               the driver's car, ~15 times a second
//   car:driver { id, driver }                                    someone got in (driver id) or out (null)
//   car:parts  { id, parts }                                     parts were swapped in the menu
//   car:remove { id }                                            packed up

export const CHASSIS = {
  standard: { name: 'Standard Chassis', length: 4.4, width: 1.8, wheelbase: 2.7, grip: 4.2 },
};
export const TIRES = {
  standard: { name: 'Standard Tires', grip: 1.0, handbrakeGrip: 0.2 },
};
export const ENGINES = {
  standard: { name: 'Standard Engine', accel: 11, top: 29, reverseTop: 9 }, // 29 m/s ~ 105 km/h
};

const PART_ITEMS = [
  { id: 'car-chassis-standard', kind: 'chassis', part: 'standard', icon: '🚗', desc: 'Hold it and left-click the ground to put down a car. Then left-click the car to fit tires and an engine.' },
  { id: 'car-tires-standard', kind: 'tires', part: 'standard', icon: '🛞', desc: 'A set of tires. Left-click your car to fit them.' },
  { id: 'car-engine-standard', kind: 'engine', part: 'standard', icon: '⚙️', desc: 'A car engine (no fuel needed). Left-click your car to fit it.' },
];
const itemFor = (kind, part) => PART_ITEMS.find((p) => p.kind === kind && p.part === part);

const COLORS = [0xc8202c, 0x2a5fd8, 0xf2f2f2, 0x2a2c31, 0x1f8a4a, 0xf2b81a, 0x8a8f99, 0xff6a1a];
const GRAVITY = 24;
const _v = new THREE.Vector3();

// ---------- Models ----------
function wheelMesh(radius = 0.36, width = 0.26) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 }));
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 12), new THREE.MeshStandardMaterial({ color: 0xb9bfc8, roughness: 0.35, metalness: 0.5 }));
  rim.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, radius * 0.9, 0.06), rim.material);
  g.add(tire, rim, hub); // hub shows the wheel spinning
  return g;
}

// A sedan. Origin at the ground under the middle of the car; forward is -Z.
function buildCarMesh(color) {
  const car = new THREE.Group();
  const body = new THREE.Group(); // bobs and leans on top of the wheels
  car.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.25, metalness: 0.5 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    body.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.8, 0.55, 4.4), paint, 0, 0.62, 0); // lower body
  add(new THREE.BoxGeometry(1.82, 0.12, 4.42), dark, 0, 0.38, 0); // skirt
  add(new THREE.BoxGeometry(1.6, 0.55, 2.2), paint, 0, 1.17, 0.25); // cabin
  add(new THREE.BoxGeometry(1.56, 0.5, 0.06), glass, 0, 1.12, -0.92).rotation.x = 0.55; // windshield, leaning back
  add(new THREE.BoxGeometry(1.56, 0.46, 0.06), glass, 0, 1.12, 1.42).rotation.x = -0.55; // rear window
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.36, 1.9), glass, s * 0.81, 1.2, 0.25); // side windows
  add(new THREE.BoxGeometry(1.84, 0.18, 0.2), chrome, 0, 0.5, -2.22); // front bumper
  add(new THREE.BoxGeometry(1.84, 0.18, 0.2), chrome, 0, 0.5, 2.22); // rear bumper
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 0.9 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xd81c1c, emissive: 0xa01010, emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.42, 0.16, 0.06), head, s * 0.62, 0.72, -2.21);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), tail, s * 0.62, 0.74, 2.21);
  }
  add(new THREE.BoxGeometry(0.6, 0.2, 0.05), dark, 0, 0.62, -2.21); // grille
  // Wheels: front ones steer (pivot), all spin
  const wheels = [];
  const fronts = [];
  for (const [x, z, front] of [[-0.85, -1.35, true], [0.85, -1.35, true], [-0.85, 1.35, false], [0.85, 1.35, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const w = wheelMesh();
    w.traverse((o) => (o.castShadow = true));
    pivot.add(w);
    car.add(pivot);
    wheels.push(w);
    if (front) fronts.push(pivot);
  }
  car.userData.body = body;
  car.userData.wheels = wheels;
  car.userData.fronts = fronts;
  return car;
}

function chassisIcon() {
  const g = buildCarMesh(0xc8202c);
  // Icon: no wheels (they're a separate part)
  for (const w of g.userData.wheels) w.visible = false;
  g.scale.setScalar(0.12);
  return g;
}
function tireIcon() {
  const g = new THREE.Group();
  const w = wheelMesh(0.22, 0.14);
  w.position.y = 0.22;
  g.add(w);
  return g;
}
function engineIcon() {
  const g = new THREE.Group();
  const block = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.45, metalness: 0.45 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202c, roughness: 0.4 });
  const blk = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.2), block);
  blk.position.y = 0.1;
  g.add(blk);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.16), red);
  head.position.y = 0.22;
  g.add(head);
  for (let i = 0; i < 4; i++) {
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), block);
    plug.position.set(-0.08 + i * 0.055, 0.27, 0);
    g.add(plug);
  }
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), block);
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0.15, 0.1, 0.04);
  g.add(pulley);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x2a2c31 }));
  filter.position.set(0, 0.27, 0.03);
  g.add(filter);
  return g;
}

for (const p of PART_ITEMS) {
  const stats = p.kind === 'chassis' ? CHASSIS[p.part] : p.kind === 'tires' ? TIRES[p.part] : ENGINES[p.part];
  registerItem({ id: p.id, name: stats.name, icon: p.icon, description: p.desc, maxStack: 4, cooldown: 0.5, anim: 'recoil', use: p.kind === 'chassis' ? (ctx) => ctx.game.cars?.placeFromHand() : () => false });
  registerItemModel(p.id, p.kind === 'chassis' ? chassisIcon : p.kind === 'tires' ? tireIcon : engineIcon);
}

// ---------- Cars in the world ----------
export function setupCars(game) {
  const { scene, net, inventory, input, camera, world, remotes, combat } = game;
  const cars = new Map(); // id -> car
  let myCar = null; // the car I'm driving
  let counter = 0;
  let sendTimer = 0;
  let camMode = 'chase'; // 'chase' | 'seat'
  let yawAtEnter = 0;
  const camPos = new THREE.Vector3();
  const hitCooldown = new Map(); // player id -> time

  // HUD
  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position: 'fixed', left: '50%', bottom: '140px', transform: 'translateX(-50%)', padding: '5px 12px',
    background: 'rgba(20,22,27,0.8)', borderRadius: '8px', color: '#e8ecf2', font: '600 14px system-ui, sans-serif',
    pointerEvents: 'none', display: 'none', whiteSpace: 'nowrap',
  });
  document.getElementById('hud').appendChild(hud);

  const groundY = (x, z) => world.terrain.groundHeight(x, z);
  const statsOf = (car) => ({ ch: CHASSIS[car.parts.chassis] || CHASSIS.standard, ti: TIRES[car.parts.tires] || TIRES.standard, en: ENGINES[car.parts.engine] || ENGINES.standard });
  const ready = (car) => !!(car.parts.tires && car.parts.engine);
  const partStats = (kind, part) => (kind === 'chassis' ? CHASSIS : kind === 'tires' ? TIRES : ENGINES)[part];
  const ownerName = (car) => (car.owner === net.id ? 'Your' : `${remotes.players.get(car.owner)?.name || 'Someone'}'s`);

  // No tires: no wheels, and the body sits on the ground
  function updateLooks(car) {
    const hasTires = !!car.parts.tires;
    for (const w of car.mesh.userData.wheels) w.parent.visible = hasTires;
    car.bodyBase = hasTires ? 0 : -0.34;
  }

  // Only known parts (or null for an empty slot) are accepted from the network
  function cleanParts(parts) {
    return {
      chassis: CHASSIS[parts?.chassis] ? parts.chassis : 'standard',
      tires: TIRES[parts?.tires] ? parts.tires : null,
      engine: ENGINES[parts?.engine] ? parts.engine : null,
    };
  }

  function addCar({ id, owner, parts, color, p, yaw, driver = null }) {
    if (cars.has(id)) return cars.get(id);
    parts = cleanParts(parts);
    const mesh = buildCarMesh(color);
    mesh.userData.carId = id;
    scene.add(mesh);
    const car = {
      id, owner, parts, color, mesh, driver,
      pos: new THREE.Vector3().fromArray(p), yaw: yaw || 0, pitch: 0, roll: 0,
      vel: new THREE.Vector3(), yawRate: 0, steer: 0, airborne: false, lastGround: 0,
      home: new THREE.Vector3().fromArray(p), homeYaw: yaw || 0,
      target: null, // remote driving: { p, yaw, pitch, roll, v }
      wheelSpin: 0, bob: 0,
    };
    car.lastGround = groundY(car.pos.x, car.pos.z);
    cars.set(id, car);
    updateLooks(car);
    draw(car, 0);
    return car;
  }

  function removeCar(id) {
    const car = cars.get(id);
    if (!car) return;
    if (myCar === car) exitCar(false);
    if (menuCar === car) closeMenu();
    scene.remove(car.mesh);
    car.mesh.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    cars.delete(id);
  }

  // ---------- Placing ----------
  function placeFromHand() {
    const player = game.player;
    if (!player || myCar) return false;
    const held = inventory.getSelected();
    const chassis = PART_ITEMS.find((p) => p.id === held?.id && p.kind === 'chassis');
    if (!chassis) return false;
    // A few meters in front of you, facing where you look
    const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const at = player.position.clone().addScaledVector(fwd, 4.5);
    at.y = groundY(at.x, at.z);
    if (at.y < -60) {
      game.chat("🚗 There's no ground there.", true);
      return false;
    }
    inventory.remove(chassis.id, 1);
    const msg = {
      id: `${net.id}-car${++counter}-${Math.floor(Math.random() * 1e6)}`,
      owner: net.id,
      parts: { chassis: chassis.part, tires: null, engine: null },
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      p: at.toArray().map(round),
      yaw: round(player.yaw),
    };
    addCar(msg);
    net.sendEvent({ kind: 'car:place', ...msg });
    game.chat('🚗 Chassis down! Left-click it to fit tires and an engine, then press E to drive.', true);
  }

  function packUp(car) {
    if (car.owner !== net.id || car.driver) return;
    removeCar(car.id);
    net.sendEvent({ kind: 'car:remove', id: car.id });
    for (const [kind, part] of Object.entries(car.parts)) if (part) giveBack(kind, part);
    game.chat('🚗 Packed up your car: its parts are back in your inventory.', true);
  }

  function giveBack(kind, part) {
    const it = itemFor(kind, part);
    if (it) inventory.add({ id: it.id, name: partStats(kind, part).name, icon: it.icon, maxStack: 4, count: 1 });
  }

  // ---------- Parts menu (left-click a car) ----------
  let menuCar = null;
  const menu = document.createElement('div');
  Object.assign(menu.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(520px, 94vw)',
    background: 'rgba(20,22,27,0.96)', border: '1px solid #4a5060', borderRadius: '14px', padding: '14px 16px',
    color: '#e8ecf2', font: '14px system-ui, sans-serif', display: 'none', zIndex: 32,
    boxShadow: '0 30px 80px rgba(0,0,0,0.6)', pointerEvents: 'auto', // #hud ignores the mouse; this menu needs it
  });
  document.getElementById('hud').appendChild(menu);

  const slotHtml = (kind, part, mine) => {
    const it = part && itemFor(kind, part);
    const label = { chassis: 'Chassis', tires: 'Tires', engine: 'Engine' }[kind];
    const icon = it ? getItemIcon(it.id) : null;
    const removable = mine && part && kind !== 'chassis';
    return `<div ${removable ? `data-remove="${kind}"` : ''} title="${removable ? 'Click to take it out' : ''}"
      style="flex:1;min-width:120px;padding:8px;border-radius:10px;text-align:center;cursor:${removable ? 'pointer' : 'default'};
      background:${part ? 'rgba(76,217,100,0.12)' : 'rgba(255,255,255,0.04)'};border:1px ${part ? 'solid #4cd964' : 'dashed #5a6070'}">
      <div style="font:700 11px system-ui;letter-spacing:1px;text-transform:uppercase;color:#9aa3b0">${label}</div>
      ${icon ? `<img src="${icon}" style="width:64px;height:64px">` : `<div style="width:64px;height:64px;margin:auto;display:flex;align-items:center;justify-content:center;font-size:28px;opacity:0.35">${{ tires: '🛞', engine: '⚙️', chassis: '🚗' }[kind]}</div>`}
      <div style="font-size:13px">${part ? partStats(kind, part).name : '<span style="opacity:0.6">empty</span>'}</div>
      ${removable ? '<div style="font-size:11px;opacity:0.6">click to take out</div>' : ''}</div>`;
  };

  function renderMenu() {
    const car = menuCar;
    if (!car) return;
    const mine = car.owner === net.id;
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font:800 18px system-ui">🚗 ${ownerName(car)} car</div><button class="btn" data-close style="padding:4px 10px">✕</button></div>
      <div style="display:flex;gap:8px;margin-bottom:12px">${['chassis', 'tires', 'engine'].map((k) => slotHtml(k, car.parts[k], mine)).join('')}</div>`;
    if (!mine) {
      html += `<div style="opacity:0.7">Only the owner can change this car's parts.</div>`;
    } else if (car.driver) {
      html += `<div style="opacity:0.7">Someone is driving it. Parts can be changed when it's parked.</div>`;
    } else {
      const have = PART_ITEMS.filter((p) => p.kind !== 'chassis' && inventory.has(p.id));
      html += `<div style="font:800 12px system-ui;letter-spacing:1px;color:#ffd23d;margin-bottom:6px;text-transform:uppercase">Your parts</div>`;
      if (!have.length) html += `<div style="opacity:0.6">You have no tires or engines. Get some from the item spawner (Creative) or craft them with C (Survival).</div>`;
      for (const p of have) {
        const fitted = car.parts[p.kind] === p.part;
        html += `<button class="btn" data-fit="${p.id}" ${fitted ? 'disabled' : ''} style="display:inline-flex;align-items:center;gap:6px;margin:3px;padding:5px 9px;font-size:13px">
          <img src="${getItemIcon(p.id)}" style="width:28px;height:28px"> ${partStats(p.kind, p.part).name} ×${inventory.count(p.id)}
          <span style="opacity:0.7">${fitted ? '(fitted)' : car.parts[p.kind] ? '→ swap in' : '→ fit'}</span></button>`;
      }
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <span style="opacity:0.6;font-size:12px">${ready(car) ? 'Ready to drive: press E next to it.' : 'Needs tires and an engine to drive.'}</span>
        <button class="btn" data-pack style="padding:5px 10px">📦 Pack up car</button></div>`;
    }
    menu.innerHTML = html;
  }

  function openMenu(car) {
    menuCar = car;
    menu.style.display = 'block';
    input.enabled = false;
    input.keys.clear();
    input.releaseLock?.();
    renderMenu();
  }
  function closeMenu() {
    if (!menuCar) return;
    menuCar = null;
    menu.style.display = 'none';
    input.enabled = true;
    if (game.player) input.requestLock();
  }

  function setParts(car, parts) {
    car.parts = cleanParts(parts);
    updateLooks(car);
    net.sendEvent({ kind: 'car:parts', id: car.id, parts: car.parts });
    if (menuCar === car) renderMenu();
  }

  // Your parts list follows your inventory while the menu is open
  inventory.on('change', () => menuCar && renderMenu());

  menu.addEventListener('click', (e) => {
    const car = menuCar;
    if (!car) return;
    if (e.target.closest('[data-close]')) return closeMenu();
    if (car.owner !== net.id || car.driver) return;
    const fit = e.target.closest('[data-fit]');
    const remove = e.target.closest('[data-remove]');
    if (fit && !fit.disabled) {
      const p = PART_ITEMS.find((x) => x.id === fit.dataset.fit);
      if (!p || !inventory.has(p.id)) return;
      inventory.remove(p.id, 1);
      const old = car.parts[p.kind];
      if (old) giveBack(p.kind, old); // swap: the old part goes back in your inventory
      setParts(car, { ...car.parts, [p.kind]: p.part });
    } else if (remove) {
      const kind = remove.dataset.remove;
      if (!car.parts[kind]) return;
      giveBack(kind, car.parts[kind]);
      setParts(car, { ...car.parts, [kind]: null });
    } else if (e.target.closest('[data-pack]')) {
      closeMenu();
      packUp(car);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (menuCar && e.code === 'Escape') {
      e.stopImmediatePropagation();
      closeMenu();
    }
  }, true);

  // Left-click a car you're looking at (within reach) opens its menu instead of using your item
  const clickRay = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !game.player || myCar || menuCar || !input.locked || !input.enabled) return;
    camera.updateMatrixWorld();
    clickRay.setFromCamera(center, camera);
    clickRay.far = 6;
    const close = [...cars.values()].filter((c) => c.pos.distanceToSquared(camera.position) < 100).map((c) => c.mesh);
    for (const m of close) m.updateMatrixWorld(); // make sure we test where the car is right now
    const hit = clickRay.intersectObjects(close, true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.carId) o = o.parent;
    const car = o && cars.get(o.userData.carId);
    if (!car) return;
    e.stopPropagation(); // the game (and your held item) never sees this click
    e.preventDefault();
    openMenu(car);
  }, true);

  // ---------- Getting in and out ----------
  function nearestCar(maxDist = 4) {
    const p = game.player?.position;
    if (!p) return null;
    let best = null, bd = maxDist;
    for (const car of cars.values()) {
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bd && Math.abs(car.pos.y - p.y) < 3) (bd = d), (best = car);
    }
    return best;
  }

  function enterCar(car) {
    if (car.driver && car.driver !== net.id) {
      game.chat('🚗 Someone is already driving that car.', true);
      return;
    }
    if (!ready(car)) {
      const missing = [!car.parts.tires && 'tires', !car.parts.engine && 'an engine'].filter(Boolean).join(' and ');
      game.chat(`🚗 This car needs ${missing} first: left-click it to fit them.`, true);
      return;
    }
    myCar = car;
    car.driver = net.id;
    car.target = null;
    yawAtEnter = game.player.yaw;
    game.player.gravityDir = -1;
    game.player.extraState.car = car.id;
    camPos.copy(car.pos).add(new THREE.Vector3(0, 3, 0));
    net.sendEvent({ kind: 'car:driver', id: car.id, driver: net.id });
  }

  function exitCar(send = true) {
    const car = myCar;
    if (!car) return;
    myCar = null;
    car.driver = null;
    const player = game.player;
    if (player) {
      // Step out on the driver's side
      const right = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
      const out = car.pos.clone().addScaledVector(right, -2.2);
      player.position.set(out.x, Math.max(groundY(out.x, out.z), car.pos.y) + 0.5, out.z);
      player.velocity.set(car.vel.x * 0.5, 2, car.vel.z * 0.5);
      player.mesh.visible = true;
      delete player.extraState.car;
    }
    if (send) {
      net.sendEvent({ kind: 'car:state', ...stateOf(car) });
      net.sendEvent({ kind: 'car:driver', id: car.id, driver: null });
    }
  }

  window.addEventListener('keydown', (e) => {
    if (!game.player || !input.enabled || e.repeat) return;
    if (e.code === 'KeyE') {
      if (myCar) {
        exitCar();
        e.stopImmediatePropagation();
        return;
      }
      const car = nearestCar();
      if (car) {
        enterCar(car);
        e.stopImmediatePropagation();
      }
    } else if (e.code === 'KeyV' && myCar) {
      camMode = camMode === 'chase' ? 'seat' : 'chase';
    } else if (e.code === 'KeyX' && !myCar) {
      const car = nearestCar();
      if (car && car.owner === net.id) packUp(car);
      else if (car) game.chat("🚗 That's not your car, so you can't pack it up.", true);
    }
  });

  // ---------- Driving physics (only the driver runs this) ----------
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let time = 0;
  function drive(car, dt) {
    const { ch, ti, en } = statsOf(car);
    time += dt;
    fwd.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
    right.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
    let vf = car.vel.dot(fwd);
    let vl = car.vel.dot(right);
    const gas = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const handbrake = input.isDown('Space');
    const steerIn = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);

    if (!car.airborne) {
      // Gas, brakes, reverse
      if (gas) {
        if (vf < -0.5) vf += 22 * dt;
        else vf += en.accel * Math.max(0, 1 - (vf / en.top) ** 2) * dt;
      } else if (back) {
        if (vf > 0.5) vf -= 22 * dt;
        else vf = Math.max(-en.reverseTop, vf - en.accel * 0.6 * dt);
      } else {
        vf *= 1 - 0.45 * dt; // coasting
      }
      if (handbrake) vf *= 1 - 1.4 * dt;

      // Sideways grip: less with the handbrake, and less when flinging it around fast (drifty)
      const speed = Math.abs(vf);
      let grip = ch.grip * ti.grip;
      if (handbrake) grip *= ti.handbrakeGrip;
      if (speed > 16 && Math.abs(car.steer) > 0.5) grip *= 0.55;
      vl *= Math.exp(-grip * dt);

      // Steering: a bicycle model, a bit slow to react (and less steering lock at speed)
      car.steer += (steerIn - car.steer) * Math.min(1, dt * 4);
      const maxSteer = THREE.MathUtils.lerp(0.6, 0.24, Math.min(1, speed / en.top));
      let targetRate = (vf * Math.tan(car.steer * maxSteer)) / ch.wheelbase;
      if (handbrake) targetRate *= 1.45; // swing the back out
      car.yawRate += (targetRate - car.yawRate) * Math.min(1, dt * 5);
      // A little wobble so it never feels perfectly planted (goofy)
      car.yawRate += Math.sin(time * 9 + car.pos.x) * 0.3 * (speed / en.top) * dt;
    } else {
      car.yawRate *= 1 - 0.5 * dt;
    }

    // Recompose velocity on the OLD axes, then turn: the car turns but its momentum lags = drift
    const vy = car.vel.y;
    car.vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
    car.vel.y = vy;
    car.yaw += car.yawRate * dt;

    // Move
    car.pos.x += car.vel.x * dt;
    car.pos.z += car.vel.z * dt;

    // Ground: follow it, or fly off crests and land
    const g = groundY(car.pos.x, car.pos.z);
    if (car.airborne) {
      car.vel.y -= GRAVITY * dt;
      car.pos.y += car.vel.y * dt;
      if (car.pos.y <= g) {
        car.pos.y = g;
        car.vel.y = car.vel.y < -7 ? -car.vel.y * 0.22 : 0; // a little bounce on hard landings
        car.airborne = car.vel.y > 0.5;
      }
    } else {
      const groundVy = (g - car.lastGround) / Math.max(dt, 1e-3);
      if (g < car.pos.y - 0.35) {
        car.airborne = true; // drove off a crest
        car.vel.y = Math.min(car.vel.y, 0);
      } else {
        car.pos.y = g;
        car.vel.y = THREE.MathUtils.clamp(groundVy, -15, 15); // remembered for launching off crests
      }
    }
    car.lastGround = g;

    // Lean to match the ground under the wheels
    if (!car.airborne) {
      const L = ch.wheelbase / 2 + 0.1, W = ch.width / 2;
      const front = groundY(car.pos.x + fwd.x * L, car.pos.z + fwd.z * L);
      const backY = groundY(car.pos.x - fwd.x * L, car.pos.z - fwd.z * L);
      const leftY = groundY(car.pos.x - right.x * W, car.pos.z - right.z * W);
      const rightY = groundY(car.pos.x + right.x * W, car.pos.z + right.z * W);
      const tp = Math.atan2(front - backY, L * 2), tr = Math.atan2(rightY - leftY, W * 2);
      car.pitch += (tp - car.pitch) * Math.min(1, dt * 10);
      car.roll += (tr - car.roll) * Math.min(1, dt * 10);
    }

    collide(car, dt);
    hitPlayers(car);

    // Fell into a chasm: back to where it was placed
    if (car.pos.y < -40) {
      car.pos.copy(car.home);
      car.yaw = car.homeYaw;
      car.vel.set(0, 0, 0);
      car.yawRate = 0;
      car.airborne = false;
      game.chat('🚗 Your car fell off the world. It was towed back to where it was built.', true);
    }
  }

  // Bump off solid things (buildings, trees, blocks): two circles along the car
  function collide(car) {
    const { ch } = statsOf(car);
    const r = ch.width / 2 + 0.05;
    const yMin = car.pos.y + 0.3, yMax = car.pos.y + 1.4;
    for (const off of [ch.length / 2 - r, -(ch.length / 2 - r)]) {
      const cx = car.pos.x + fwd.x * off, cz = car.pos.z + fwd.z * off;
      for (const box of world.solidBoxes) {
        if (box.max.y < yMin || box.min.y > yMax) continue;
        const px = THREE.MathUtils.clamp(cx, box.min.x, box.max.x), pz = THREE.MathUtils.clamp(cz, box.min.z, box.max.z);
        const dx = cx - px, dz = cz - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const nx = d2 > 1e-8 ? dx / d : -fwd.x, nz = d2 > 1e-8 ? dz / d : -fwd.z;
        car.pos.x += nx * (r - d);
        car.pos.z += nz * (r - d);
        const into = car.vel.x * nx + car.vel.z * nz;
        if (into < 0) {
          car.vel.x -= 1.45 * into * nx; // bounce off a bit
          car.vel.z -= 1.45 * into * nz;
          car.yawRate += (Math.random() - 0.5) * Math.min(3, -into * 0.25); // spin a bit, goofy
        }
      }
    }
  }

  // Ram other players: they go flying
  function hitPlayers(car) {
    const speed = Math.hypot(car.vel.x, car.vel.z);
    if (speed < 4) return;
    const now = performance.now();
    for (const rp of remotes.players.values()) {
      if (!rp.mesh.visible) continue;
      const o = rp.mesh.position;
      const dx = o.x - car.pos.x, dz = o.z - car.pos.z;
      if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(o.y - car.pos.y) > 2) continue;
      if (now - (hitCooldown.get(rp.id) || 0) < 600) continue;
      hitCooldown.set(rp.id, now);
      const d = Math.hypot(dx, dz) || 1;
      combat.knockback(rp.id, [car.vel.x * 0.9 + (dx / d) * 4, 5 + speed * 0.25, car.vel.z * 0.9 + (dz / d) * 4]);
      car.vel.multiplyScalar(0.85);
    }
  }

  // ---------- Drawing ----------
  function draw(car, dt) {
    const m = car.mesh;
    m.position.copy(car.pos);
    m.rotation.set(car.pitch, car.yaw, car.roll, 'YXZ');
    const speedF = car.vel.x * -Math.sin(car.yaw) + car.vel.z * -Math.cos(car.yaw);
    car.wheelSpin -= (speedF * dt) / 0.36;
    for (const w of m.userData.wheels) w.rotation.x = car.wheelSpin;
    const maxSteer = 0.5;
    for (const f of m.userData.fronts) f.rotation.y = car.steer * maxSteer;
    // Body bobs on bumpy ground and leans out of turns
    car.bob += dt * (3 + Math.abs(speedF) * 0.6);
    const body = m.userData.body;
    body.position.y = (car.bodyBase || 0) + (car.airborne ? 0.04 : Math.sin(car.bob) * 0.015 * Math.min(1, Math.abs(speedF) / 10));
    body.rotation.z = THREE.MathUtils.clamp(-car.yawRate * speedF * 0.012, -0.12, 0.12);
    body.rotation.x = THREE.MathUtils.clamp(car.accelLean || 0, -0.06, 0.06);
  }

  function stateOf(car) {
    return {
      id: car.id,
      p: car.pos.toArray().map(round),
      yaw: round(car.yaw),
      pitch: round(car.pitch),
      roll: round(car.roll),
      v: car.vel.toArray().map(round),
      st: round(car.steer),
      air: car.airborne ? 1 : 0,
    };
  }

  // ---------- Per frame ----------
  game.addSystem((dt, game) => {
    const player = game.player;
    for (const car of cars.values()) {
      if (car === myCar) continue;
      if (car.target) {
        // Someone else is driving: glide toward their latest state
        const t = 1 - Math.exp(-12 * dt);
        car.pos.lerp(car.target.p, t);
        car.yaw += angleDiff(car.yaw, car.target.yaw) * t;
        car.pitch += (car.target.pitch - car.pitch) * t;
        car.roll += (car.target.roll - car.roll) * t;
        car.vel.lerp(car.target.v, t);
        car.steer += (car.target.st - car.steer) * t;
        car.yawRate = 0;
        car.airborne = !!car.target.air;
        // keep extrapolating a bit between updates
        car.target.p.addScaledVector(car.target.v, dt);
      }
      draw(car, dt);
    }

    if (myCar) {
      drive(myCar, dt);
      draw(myCar, dt);
      // Sit in the driver's seat
      const c = myCar;
      const seat = new THREE.Vector3(-0.4, 0.75, 0.25).applyEuler(new THREE.Euler(c.pitch, c.yaw, c.roll, 'YXZ')).add(c.pos);
      player.position.copy(seat);
      player.velocity.set(0, 0, 0);
      player.onGround = true;
      player.launched = false;
      player.mesh.visible = false;
      // Camera
      const rel = player.yaw - yawAtEnter;
      if (camMode === 'seat') {
        const eye = new THREE.Vector3(-0.4, 1.35, 0.3).applyEuler(new THREE.Euler(c.pitch, c.yaw, c.roll, 'YXZ')).add(c.pos);
        camera.position.copy(eye);
        camera.rotation.set(player.pitch + c.pitch * 0.5, c.yaw + rel, c.roll * 0.5, 'YXZ');
      } else {
        const camYaw = c.yaw + rel;
        const want = new THREE.Vector3(Math.sin(camYaw) * 7.5, 3 + Math.max(0, -player.pitch) * 4, Math.cos(camYaw) * 7.5).add(c.pos);
        const gy = groundY(want.x, want.z) + 0.8;
        if (want.y < gy) want.y = gy;
        camPos.lerp(want, 1 - Math.exp(-8 * dt));
        camera.position.copy(camPos);
        camera.lookAt(_v.copy(c.pos).add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(fwd, 2));
      }
      // Tell everyone where the car is
      sendTimer += dt;
      if (sendTimer >= 1 / 15) {
        sendTimer = 0;
        net.sendEvent({ kind: 'car:state', ...stateOf(c) });
      }
      const kmh = Math.round(Math.hypot(c.vel.x, c.vel.z) * 3.6);
      hud.textContent = `🚗 ${kmh} km/h · WASD drive · Space handbrake · V camera · E get out`;
      hud.style.display = 'block';
    } else {
      const near = nearestCar();
      if (near && input.enabled) {
        hud.textContent = near.driver
          ? '🚗 Someone is driving this'
          : ready(near)
            ? `🚗 E drive · click: parts${near.owner === net.id ? ' · X pack up' : ''}`
            : `🚗 Click the car to fit ${[!near.parts.tires && 'tires', !near.parts.engine && 'an engine'].filter(Boolean).join(' and ')}`;
        hud.style.display = 'block';
      } else hud.style.display = 'none';
    }

    // Hide other players who are sitting in cars
    for (const rp of remotes.players.values()) {
      const inCar = !!rp.state?.car;
      if (inCar) rp.mesh.visible = false;
      else if (rp.hiddenByCar) rp.mesh.visible = true;
      rp.hiddenByCar = inCar;
    }
  });

  // ---------- Network ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'car:place':
        if (typeof msg.id === 'string' && Array.isArray(msg.p) && msg.parts && msg.owner === msg.from) {
          const car = addCar(msg);
          if (msg.driver !== undefined && car !== myCar) car.driver = msg.driver;
        }
        break;
      case 'car:state': {
        const car = cars.get(msg.id);
        if (!car || car === myCar || !Array.isArray(msg.p)) return;
        car.target = {
          p: new THREE.Vector3().fromArray(msg.p),
          yaw: +msg.yaw || 0, pitch: +msg.pitch || 0, roll: +msg.roll || 0,
          v: new THREE.Vector3().fromArray(Array.isArray(msg.v) ? msg.v : [0, 0, 0]),
          st: +msg.st || 0, air: msg.air,
        };
        break;
      }
      case 'car:driver': {
        const car = cars.get(msg.id);
        if (!car) return;
        if (car === myCar && msg.driver !== net.id) {
          // Two people got in at once: whoever the others heard second gets kicked out
          if (msg.from < net.id) exitCar(false);
          else return;
        }
        car.driver = msg.driver ?? null;
        if (!car.driver && car.target) {
          car.pos.copy(car.target.p);
          car.vel.set(0, 0, 0);
          car.target = null;
        }
        break;
      }
      case 'car:parts': {
        const car = cars.get(msg.id);
        if (!car || car.owner !== msg.from) return; // only the owner can change parts
        car.parts = cleanParts(msg.parts);
        updateLooks(car);
        if (menuCar === car) renderMenu();
        break;
      }
      case 'car:remove':
        removeCar(msg.id);
        break;
    }
  });
  // Someone new: tell them about my cars
  net.on('playerJoined', () => {
    for (const car of cars.values()) {
      if (car.owner !== net.id) continue;
      net.sendEvent({ kind: 'car:place', id: car.id, owner: car.owner, parts: car.parts, color: car.color, p: car.pos.toArray().map(round), yaw: round(car.yaw), driver: car.driver });
    }
  });
  // Someone left: their cars go, and any car they were driving is free again
  net.on('playerLeft', ({ id }) => {
    for (const car of [...cars.values()]) {
      if (car.owner === id) removeCar(car.id);
      else if (car.driver === id) {
        car.driver = null;
        car.target = null;
      }
    }
  });
  net.on('close', () => {
    for (const id of [...cars.keys()]) removeCar(id);
    closeMenu();
    hud.style.display = 'none';
  });

  return {
    placeFromHand,
    openMenu,
    closeMenu,
    // Advance the car you're driving by dt seconds (the game loop does this every frame;
    // handy for testing or slow-motion experiments)
    step(dt = 1 / 60) {
      if (myCar) {
        drive(myCar, dt);
        draw(myCar, dt);
      }
    },
    get driving() {
      return myCar;
    },
    cars,
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
