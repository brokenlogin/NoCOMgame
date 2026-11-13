// Day and night (Survival mode only), and the monsters that come out at night.
//
// The clock is shared by the whole room (it runs off the real time), so night falls for
// everyone together: 6 minutes of day, then 3 minutes of night. At night the light fades,
// and monsters spawn around you (not near torches, and not in space or the minigame areas):
//   Zombie    slow, tough, hits hard up close        Spider   fast and low, jumps at you
//   Skeleton  keeps its distance and shoots arrows   Boomer   walks up to you and explodes
//                                                              (it blows up blocks too)
// At sunrise they burn away. Kill them for materials.
//
// Monsters are your own (everyone fights their own), but every weapon works on them: they're
// added to game.remotes as pretend players, and hits aimed at them are handled here instead
// of being sent over the network.

import * as THREE from 'three';
import { voidAmount } from './terrain.js';

const DAY = 6 * 60000, NIGHT = 3 * 60000, CYCLE = DAY + NIGHT;
const MAX_MONSTERS = 8;

const TYPES = {
  zombie: { name: 'Zombie', hp: 60, speed: 2.6, dmg: 9, reach: 1.6, color: 0x5a8a3a, drops: { iron: [0, 2], coal: [0, 1] } },
  spider: { name: 'Spider', hp: 35, speed: 5.2, dmg: 6, reach: 1.7, color: 0x222222, drops: { gold: [0, 1], wood: [1, 2] } },
  skeleton: { name: 'Skeleton', hp: 40, speed: 2.8, dmg: 7, reach: 22, ranged: true, color: 0xe8e4d8, drops: { coal: [1, 3], stone: [1, 2] } },
  boomer: { name: 'Boomer', hp: 30, speed: 3.2, dmg: 35, reach: 2.4, boom: true, color: 0xd83a2a, drops: { coal: [2, 4], crystal: [0, 1] } },
};
const MATS = { wood: ['Wood', '🪵'], stone: ['Stone', '🪨'], coal: ['Coal', '⚫'], iron: ['Iron', '🔩'], gold: ['Gold', '🥇'], crystal: ['Crystal', '💎'] };

// The cycle starts when the room was created, so every new game begins at sunrise with a full
// day. The server tells joiners how old the room is ('welcome' age), so everyone lines up even
// if their computer clocks disagree.
let cycleStart = Date.now();
export function setCycleStart(ms) {
  cycleStart = ms;
}
const cycleTime = (now = Date.now()) => (((now - cycleStart) % CYCLE) + CYCLE) % CYCLE;

// Where in the day/night cycle are we? 0..1 darkness
export function nightAmount(now = Date.now()) {
  const t = cycleTime(now);
  if (t < DAY - 30000) return 0;
  if (t < DAY) return (t - (DAY - 30000)) / 30000; // dusk
  if (t > CYCLE - 30000) return (CYCLE - t) / 30000; // dawn
  return 1;
}

export function setupNight(game) {
  const { scene, world, net, remotes, CONFIG } = game;
  const survival = () => game.mode === 'survival';
  // Start the clock from when the room was made (older servers don't send age: start now)
  net.on('welcome', (msg) => setCycleStart(Date.now() - (Number(msg.age) || 0)));

  // ---------- Lighting ----------
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const base = { sun: world.sun.intensity, hemi: hemi?.intensity ?? 1, bg: scene.background.clone(), fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  const nightBg = new THREE.Color(0x070b18);
  const clock = document.createElement('div');
  Object.assign(clock.style, {
    position: 'fixed', top: '52px', left: '12px', padding: '4px 10px', borderRadius: '8px', background: 'rgba(20,22,27,0.75)',
    color: '#e8ecf2', font: '600 13px system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: 4,
  });
  document.getElementById('hud').appendChild(clock);
  let applied = -1;
  function light(n) {
    if (Math.abs(n - applied) < 0.004) return;
    applied = n;
    world.sun.intensity = base.sun * (1 - n * 0.92);
    if (hemi) hemi.intensity = base.hemi * (1 - n * 0.78);
    if (!game.space?.inSpace()) {
      scene.background.copy(base.bg).lerp(nightBg, n);
      scene.fog.color.copy(base.fog).lerp(nightBg, n);
    }
    scene.fog.near = base.near * (1 - n * 0.6);
    scene.fog.far = base.far * (1 - n * 0.45);
  }

  // ---------- Monster looks ----------
  const box = (g, w, h, d, color, x, y, z, emissive) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 1.5 : 0 }));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  function model(type) {
    const g = new THREE.Group();
    const c = TYPES[type].color;
    const parts = { legs: [], arms: [] };
    if (type === 'spider') {
      box(g, 1.1, 0.5, 1.4, c, 0, 0.55, 0);
      box(g, 0.7, 0.45, 0.6, c, 0, 0.6, -0.9);
      for (const s of [-1, 1]) box(g, 0.12, 0.12, 0.05, 0xff2020, s * 0.18, 0.7, -1.21, 0xff0000);
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const leg = new THREE.Group();
          leg.position.set(s * 0.5, 0.6, -0.5 + i * 0.35);
          box(leg, 1, 0.08, 0.08, 0x111111, s * 0.5, 0, 0);
          leg.rotation.z = s * -0.5;
          g.add(leg);
          parts.legs.push(leg);
        }
      }
    } else if (type === 'boomer') {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: 0x5a0a00, emissiveIntensity: 0.6, flatShading: true }));
      body.position.y = 1;
      body.castShadow = true;
      g.add(body);
      parts.body = body;
      for (const s of [-1, 1]) box(g, 0.15, 0.2, 0.05, 0xffe14d, s * 0.25, 1.25, -0.72, 0xffd000);
      for (const s of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(s * 0.3, 0.45, 0);
        box(leg, 0.22, 0.45, 0.22, 0x7a1a10, 0, -0.22, 0);
        g.add(leg);
        parts.legs.push(leg);
      }
    } else {
      // zombie / skeleton: blocky humanoids
      const thin = type === 'skeleton' ? 0.55 : 1;
      box(g, 0.55 * thin, 0.75, 0.32 * thin, type === 'zombie' ? 0x3a5aa0 : c, 0, 1.25, 0);
      box(g, 0.5, 0.5, 0.5, c, 0, 1.9, 0);
      for (const s of [-1, 1]) box(g, 0.1, 0.08, 0.04, type === 'zombie' ? 0x111111 : 0x220000, s * 0.12, 1.95, -0.26, type === 'skeleton' ? 0x000000 : 0);
      for (const s of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(s * 0.14, 0.85, 0);
        box(leg, 0.2 * thin, 0.85, 0.22 * thin, type === 'zombie' ? 0x2a3a5a : c, 0, -0.42, 0);
        g.add(leg);
        parts.legs.push(leg);
        const arm = new THREE.Group();
        arm.position.set(s * (0.36 * thin + 0.06), 1.55, 0);
        box(arm, 0.18 * thin, 0.75, 0.18 * thin, c, 0, -0.35, 0);
        arm.rotation.x = type === 'zombie' ? -1.4 : -0.3; // zombies reach for you
        g.add(arm);
        parts.arms.push(arm);
      }
      if (type === 'skeleton') {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a4020 }));
        bow.position.set(0, -0.7, -0.05);
        bow.rotation.y = Math.PI / 2;
        parts.arms[1].add(bow);
      }
    }
    return { g, parts };
  }

  // ---------- Monsters as pretend players ----------
  const monsters = new Map(); // id -> monster
  let nextId = -1000;
  // opts.keep: stays in daylight and outside Survival (the Solo Arcade's Monster Waves)
  // opts.floor: { x0, x1, z0, z1, y } a platform to walk on (for arenas over the void)
  function spawn(type, pos, opts = {}) {
    const id = nextId--;
    const def = TYPES[type];
    const rp = remotes.add({ id, name: def.name, color: def.color, state: { p: pos.toArray(), r: 0, hp: CONFIG.maxHealth } });
    // Hide the astronaut, show the monster
    rp.mesh.userData.rig.model.visible = false;
    const look = model(type);
    rp.mesh.add(look.g);
    const m = { id, type, def, rp, look, keep: !!opts.keep, floor: opts.floor || null, pos: pos.clone(), vel: new THREE.Vector3(), hp: def.hp, cool: 1, frozen: 0, yaw: 0, walk: Math.random() * 10, onGround: true };
    monsters.set(id, m);
    return m;
  }
  function despawn(m, poof = true) {
    if (poof) game.opItems?.puffFx?.(m.pos.clone().setY(m.pos.y + 1), m.type === 'boomer' ? 0xff6a3a : 0x888888);
    remotes.remove(m.id);
    monsters.delete(m.id);
  }
  function hurt(m, dmg, kb) {
    if (!monsters.has(m.id)) return;
    m.hp -= dmg;
    if (kb) {
      m.vel.add(kb);
      m.onGround = false;
    }
    if (m.hp <= 0) {
      const got = [];
      for (const [mat, [lo, hi]] of Object.entries(m.def.drops)) {
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        if (n <= 0) continue;
        game.inventory.add({ id: mat, name: MATS[mat][0], icon: MATS[mat][1], maxStack: 99, count: n });
        got.push(`${MATS[mat][1]} ${n}`);
      }
      game.chat(`💀 ${m.def.name} defeated!${got.length ? ` +${got.join(' ')}` : ''}`, true);
      despawn(m);
    }
  }
  function explode(m) {
    const p = m.pos.clone().setY(m.pos.y + 1);
    game.opItems?.boomAll ? game.opItems.boomAll(p, 5, 0, 0, { color: 0xff7a1a }) : null;
    const d = p.distanceTo(game.player.position.clone().setY(game.player.position.y + 1));
    if (d < 5) game.player.takeDamage(m.def.dmg * (1 - d / 6), 'a Boomer');
    game.building?.blast(p, 2.6);
    despawn(m, false);
  }

  // Hits aimed at monsters stay here instead of going over the network
  const send = net.sendEvent.bind(net);
  net.sendEvent = (data) => {
    const m = monsters.get(data?.target);
    if (m) {
      switch (data.kind) {
        case 'knockback': {
          const v = Array.isArray(data.v) ? new THREE.Vector3(...data.v) : new THREE.Vector3();
          hurt(m, Math.min(40, 4 + v.length() * 0.7), v.multiplyScalar(0.6));
          break;
        }
        case 'op:damage':
          hurt(m, +data.amount || 0);
          break;
        case 'swordHit':
        case 'sp:hit':
          hurt(m, +data.dmg || 10);
          break;
        case 'op:freeze':
          m.frozen = Math.min(6, +data.t || 3);
          break;
        default:
          hurt(m, 8); // pies, bees, sneezes... everything stings a little
      }
      return;
    }
    // Explosions near monsters hurt them too (and still go out to everyone)
    if ((data?.kind === 'op:boom' || data?.kind === 'boom') && Array.isArray(data.p)) {
      const p = new THREE.Vector3(...data.p);
      const r = data.kind === 'boom' ? CONFIG.dynamite?.radius || 6 : +data.r || 5;
      const dmg = data.kind === 'boom' ? CONFIG.dynamite?.damage || 40 : Math.max(+data.dmg || 0, 25);
      for (const mm of [...monsters.values()]) {
        const d = mm.pos.distanceTo(p);
        if (d < r) hurt(mm, dmg * (1 - d / r) + 10, mm.pos.clone().sub(p).setY(0).setLength(12).setY(8));
      }
    }
    return send(data);
  };

  // ---------- Where monsters may spawn ----------
  function spawnSpot(center) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 20;
      const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
      const y = world.terrain.groundHeight(x, z);
      if (Math.abs(y - center.y) > 12) continue; // over a chasm or up a cliff
      const p = new THREE.Vector3(x, y, z);
      if ((game.building?.torches() || []).some((t) => t.distanceTo(p) < 10)) continue;
      return p;
    }
    return null;
  }
  // No monsters in space, or over the chasms (minigames, parkour...)
  const safe = () => game.space?.inSpace() || voidAmount(game.player.position.x, game.player.position.z) > 0;

  // ---------- Arrows ----------
  const arrows = [];
  function shoot(m) {
    const from = m.pos.clone().setY(m.pos.y + 1.5);
    const to = game.player.position.clone().setY(game.player.position.y + 1.2);
    const v = to.sub(from).normalize().multiplyScalar(26);
    v.y += 2;
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0xd8c8a0 }));
    a.position.copy(from);
    scene.add(a);
    arrows.push({ a, v, life: 3, dmg: m.def.dmg });
  }

  // ---------- Per frame ----------
  let spawnT = 3;
  let wasNight = false;
  game.addSystem((dt, game) => {
    const on = survival();
    const n = on ? nightAmount() : 0;
    light(n);
    clock.style.display = on && !game.space?.inSpace() ? 'block' : 'none';
    if (on) {
      const t = cycleTime();
      const left = t < DAY ? DAY - t : CYCLE - t;
      const mm = Math.floor(left / 60000), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      clock.textContent = t < DAY ? `☀️ Day · night in ${mm}:${ss}` : `🌙 Night · ${monsters.size} monsters · dawn in ${mm}:${ss}`;
    }
    const night = n > 0.6;
    if (night && !wasNight && on) game.chat('🌙 Night falls... monsters are coming. Build a shelter or light torches!', true);
    if (!night && wasNight && on) game.chat('☀️ The sun rises. The monsters burn away.', true);
    wasNight = night;

    // Spawn
    const player = game.player;
    if (on && night && !safe()) {
      spawnT -= dt;
      if (spawnT <= 0 && monsters.size < MAX_MONSTERS) {
        spawnT = 5 + Math.random() * 6;
        const p = spawnSpot(player.position);
        if (p) {
          const r = Math.random();
          spawn(r < 0.4 ? 'zombie' : r < 0.65 ? 'spider' : r < 0.85 ? 'skeleton' : 'boomer', p);
        }
      }
    }
    // Daylight (or leaving survival) burns them away
    if ((!night || !on) && monsters.size) {
      for (const m of [...monsters.values()]) if (!m.keep && Math.random() < dt * 2) despawn(m);
    }

    // Move, attack, animate
    const pp = player.position;
    for (const m of [...monsters.values()]) {
      const d = m.def;
      const to = pp.clone().sub(m.pos).setY(0);
      const dist = to.length();
      if (dist > 90) {
        despawn(m, false);
        continue;
      }
      m.frozen = Math.max(0, m.frozen - dt);
      m.cool -= dt;
      let speed = 0;
      if (m.frozen <= 0) {
        // Skeletons keep their distance; everyone else closes in
        const want = d.ranged ? (dist > 14 ? 1 : dist < 8 ? -1 : 0) : dist > d.reach * 0.8 ? 1 : 0;
        if (want && m.onGround) {
          const step = to.clone().normalize().multiplyScalar(want * d.speed * dt);
          const next = m.pos.clone().add(step);
          // Walls (placed blocks, buildings) stop them
          const feet = next.clone().setY(next.y + 0.5), head = next.clone().setY(next.y + 1.5);
          if (!world.solidBoxes.some((b) => b.containsPoint(feet) || b.containsPoint(head))) {
            m.pos.copy(next);
            speed = d.speed;
          } else if (m.type === 'spider' && m.onGround) {
            m.vel.y = 7; // spiders climb over
            m.onGround = false;
          }
        }
        m.yaw = Math.atan2(-to.x, -to.z);
        // Attacks
        if (m.cool <= 0 && dist < d.reach && Math.abs(pp.y - m.pos.y) < 3) {
          if (d.boom) {
            explode(m);
            continue;
          }
          if (d.ranged) {
            shoot(m);
            m.cool = 2.2;
          } else {
            player.takeDamage(d.dmg, `a ${d.name}`);
            m.cool = 1.1;
            if (m.type === 'spider') {
              m.vel.set(to.x, 0, to.z).setLength(4).setY(5);
              m.onGround = false;
            }
          }
        }
        if (m.type === 'spider' && m.onGround && dist < 8 && dist > 3 && Math.random() < dt * 0.6) {
          m.vel.set(to.x, 0, to.z).setLength(7).setY(6);
          m.onGround = false;
        }
      }
      // Knockback / jumps, then land on the ground or on blocks
      if (!m.onGround || m.vel.lengthSq() > 0.01) {
        m.vel.y -= CONFIG.gravity * dt;
        m.pos.addScaledVector(m.vel, dt);
        m.vel.x *= 1 - dt * 1.5;
        m.vel.z *= 1 - dt * 1.5;
      }
      const fl = m.floor;
      const onFloor = fl && m.pos.x > fl.x0 && m.pos.x < fl.x1 && m.pos.z > fl.z0 && m.pos.z < fl.z1 && m.pos.y > fl.y - 1 ? fl.y : -Infinity;
      const ground = Math.max(world.terrain.groundHeight(m.pos.x, m.pos.z), onFloor, ...(world.solidBoxes.filter((b) => m.pos.x > b.min.x && m.pos.x < b.max.x && m.pos.z > b.min.z && m.pos.z < b.max.z && b.max.y <= m.pos.y + 0.6).map((b) => b.max.y)));
      if (m.pos.y <= ground) {
        m.pos.y = ground;
        m.vel.set(0, 0, 0);
        m.onGround = true;
      } else if (m.pos.y > ground + 0.05) m.onGround = false;
      if (m.pos.y < CONFIG.killY) {
        despawn(m, false); // knocked into a chasm
        continue;
      }
      // Feed the pretend player
      remotes.applyState(m.id, { p: [m.pos.x, m.pos.y, m.pos.z], r: m.yaw, hp: Math.max(0, (m.hp / d.hp) * CONFIG.maxHealth), g: m.onGround ? 1 : 0 });
      // Animate
      m.walk += dt * (speed ? 9 : 2);
      const sw = speed ? Math.sin(m.walk) * 0.7 : 0;
      m.look.parts.legs.forEach((l, i) => (m.type === 'spider' ? (l.rotation.x = Math.sin(m.walk + i) * 0.4) : (l.rotation.x = i % 2 ? sw : -sw)));
      if (m.type === 'skeleton') m.look.parts.arms[1].rotation.x = dist < d.reach ? -1.5 : -0.3;
      if (m.look.parts.body) m.look.parts.body.scale.setScalar(1 + (dist < 5 ? Math.sin(performance.now() / 60) * 0.12 : 0));
    }

    // Arrows
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.life -= dt;
      a.v.y -= 6 * dt;
      a.a.position.addScaledVector(a.v, dt);
      a.a.lookAt(a.a.position.clone().add(a.v));
      a.a.rotateX(Math.PI / 2);
      if (a.a.position.distanceTo(pp.clone().setY(pp.y + 1)) < 0.8) {
        player.takeDamage(a.dmg, 'a Skeleton');
        a.life = 0;
      }
      if (a.life <= 0 || world.solidBoxes.some((b) => b.containsPoint(a.a.position))) {
        scene.remove(a.a);
        arrows.splice(i, 1);
      }
    }
  });
  net.on('close', () => {
    for (const m of [...monsters.values()]) despawn(m, false);
  });

  return { monsters, nightAmount, spawn };
}
