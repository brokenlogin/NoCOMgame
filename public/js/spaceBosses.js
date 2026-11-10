// Sector bosses for the space RPG (the Pirate Mothership is in spaceWorld.js).
//
//   The Scrap King  (Scrapyard)  a junk dreadnought. Three magnet coils drag your ship in and
//                   shield its core; break the coils, then the core. Throws scrap, calls raiders.
//   The Frost Wyrm  (Cryo-9)     a huge ice serpent that dives in and out of its crater.
//                   Only the head takes full damage. Frost breath slows your ship.
//   The Hive Queen  (Void Rift)  six eyes open two at a time; pop them all and the core opens.
//                   Spawns swarmers and spits acid, faster and angrier below 40%.
//
// Each boss respawns 5 minutes after it dies and tells the quest engine { type: 'boss', of: id }.

import * as THREE from 'three';
import { itemTexture } from './itemTextures.js';

export function setupBosses(api) {
  const { game, fx, hud, ship } = api;
  const { scene } = game;
  const bosses = [];
  const shots = [];
  const RESPAWN = 300;

  const glow = (c, i = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  const part = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // A shootable piece: hp, damage multiplier, and what happens when it breaks
  function target(obj, b, { name, hp, mult = 1, radius = 3, onBreak, gate }) {
    const t = { obj, hp, maxHp: hp, alive: true };
    obj.userData.hostile = true;
    obj.userData.radius = radius;
    obj.userData.info = () => ({ name, hp: t.hp / t.maxHp, color: '#ff5a6a' });
    obj.userData.onLaser = (dmg, point, kind) => {
      if (!b.alive || !t.alive) return;
      if (gate && !gate()) {
        fx.sparks(point || obj.getWorldPosition(new THREE.Vector3()), 0x5fd4ff, 4);
        return;
      }
      t.hp -= dmg * mult * (kind === 'ion' ? 1.3 : 1);
      b.flash = 0.06;
      if (t.hp <= 0) {
        t.alive = false;
        onBreak?.(t);
      }
    };
    return t;
  }
  function shoot(from, to, speed, dmg, color, size = 0.8, kind = '') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(from);
    scene.add(m);
    shots.push({ m, v: to.clone().sub(from).setLength(speed), dmg, life: 6, kind, from: from.clone() });
  }
  function defeated(b) {
    b.alive = false;
    b.respawn = RESPAWN;
    let n = 0;
    const blasts = setInterval(() => {
      const p = b.center().add(new THREE.Vector3((Math.random() - 0.5) * b.size, (Math.random() - 0.5) * b.size * 0.4, (Math.random() - 0.5) * b.size));
      fx.explode(p, 3 + Math.random() * 2, n % 2 ? 0xffa531 : b.color);
      if (++n >= 12) {
        clearInterval(blasts);
        b.group.visible = false;
      }
    }, 220);
    api.emit({ type: 'boss', of: b.id });
    api.reward(b.reward[0], b.reward[1]);
    api.achieve(b.achievement);
    api.announce(`👑 defeated ${b.name}!`);
    hud.banner(`${b.name.toUpperCase()} DEFEATED`, `+${b.reward[0]} credits · +${b.reward[1]} XP`, '#ffd23d');
    api.loot?.drop(b.center(), { rarity: b.id === 'queen' ? 'legendary' : 'epic', count: 4, material: b.material });
  }

  // ---------- The Scrap King ----------
  {
    const lair = api.scrap.lair;
    const group = new THREE.Group();
    group.position.copy(lair);
    scene.add(group);
    const rust = new THREE.MeshStandardMaterial({ color: 0x7a4422, roughness: 0.9, metalness: 0.4, bumpMap: itemTexture('grit'), bumpScale: 1.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e56, roughness: 0.6, metalness: 0.6, bumpMap: itemTexture('brushed'), bumpScale: 0.8 });
    part(group, new THREE.BoxGeometry(26, 14, 70), rust);
    part(group, new THREE.BoxGeometry(18, 10, 22), steel, 0, 10, 12);
    for (const s of [-1, 1]) {
      part(group, new THREE.BoxGeometry(10, 8, 44), steel, s * 17, -3, 6).rotation.z = s * 0.1;
      part(group, new THREE.CylinderGeometry(5, 6, 10, 12), rust, s * 9, 0, 40).rotation.x = Math.PI / 2;
    }
    // Crane claws on the front
    for (const s of [-1, 1]) {
      const arm = part(group, new THREE.BoxGeometry(2.5, 2.5, 22), steel, s * 8, -4, -44);
      arm.rotation.y = s * 0.25;
    }
    const core = part(group, new THREE.SphereGeometry(5, 24, 16), glow(0xffa030, 2.2), 0, 0, -36);
    const armor = part(group, new THREE.BoxGeometry(14, 12, 3), steel, 0, 0, -40);
    const b = { id: 'scrapking', name: 'The Scrap King', sector: 'scrap', group, color: 0xffa030, size: 70, reward: [1800, 900], achievement: 'scrapking', material: 'scrap', alive: true, respawn: 0, flash: 0, t: 0 };
    const coils = [];
    for (const [x, y, z] of [[-12, 9, 0], [12, 9, 0], [0, 16, 24]]) {
      const c = new THREE.Group();
      c.position.set(x, y, z);
      part(c, new THREE.CylinderGeometry(1.8, 1.8, 6, 12), steel);
      for (let k = 0; k < 3; k++) part(c, new THREE.TorusGeometry(2.6, 0.5, 8, 24), glow(0xffd23d, 1.6), 0, -2 + k * 2, 0).rotation.x = Math.PI / 2;
      group.add(c);
      coils.push(target(c, b, {
        name: 'Magnet coil', hp: 380, radius: 4,
        onBreak: () => {
          c.visible = false;
          fx.explode(c.getWorldPosition(new THREE.Vector3()), 3, 0xffd23d);
          const left = coils.filter((k) => k.alive).length;
          hud.toast(left ? `🧲 Coil down! ${left} left` : '🧲 All coils down! The core is exposed!', '#ffd23d');
          if (!left) armor.visible = false;
        },
      }));
    }
    const coreT = target(core, b, { name: 'Scrap King core', hp: 1600, radius: 5, gate: () => coils.every((k) => !k.alive), onBreak: () => defeated(b) });
    b.parts = [...coils, coreT];
    b.center = () => group.position.clone();
    b.hpFrac = () => (coils.reduce((a, k) => a + Math.max(0, k.hp), 0) + Math.max(0, coreT.hp)) / (380 * 3 + 1600);
    b.sub = () => (coils.some((k) => k.alive) ? `Break the magnet coils (${coils.filter((k) => k.alive).length} left)` : 'Destroy the core!');
    b.reset = () => {
      for (const k of coils) {
        k.alive = true;
        k.hp = k.maxHp;
        k.obj.visible = true;
      }
      coreT.alive = true;
      coreT.hp = coreT.maxHp;
      armor.visible = true;
      group.visible = true;
    };
    let throwT = 0, callT = 0;
    b.update = (dt, near) => {
      b.t += dt;
      group.position.copy(lair).add(new THREE.Vector3(Math.sin(b.t * 0.05) * 60, Math.sin(b.t * 0.1) * 8, Math.cos(b.t * 0.05) * 40));
      group.rotation.y = Math.sin(b.t * 0.05) * 0.6;
      core.scale.setScalar(1 + Math.sin(b.t * 5) * 0.06);
      for (const k of coils) k.obj.rotation.y += dt * 2;
      if (!near) return;
      throwT -= dt;
      callT -= dt;
      if (throwT <= 0) {
        throwT = 2.2;
        const from = group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 12, (Math.random() - 0.5) * 40));
        shoot(from, ship.position, 70, 18, 0x8a5a2a, 2.2);
      }
      if (callT <= 0 && api.enemies.count('kingGuard') < 3) {
        callT = 20;
        for (let i = 0; i < 2; i++) api.enemies.spawn('raider', group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, 20, 40)), { sector: 'scrap', level: 14, tag: 'kingGuard', home: lair, leash: 500 }).aggro = true;
      }
    };
    // Magnets drag your ship in while any coil works
    api.forces.push((p) => {
      if (!b.alive || api.sector() !== 'scrap') return null;
      const d = p.distanceTo(group.position);
      const live = coils.filter((k) => k.alive).length;
      if (!live || d > 380 || d < 40) return null;
      return group.position.clone().sub(p).setLength(7 * live);
    });
    bosses.push(b);
  }

  // ---------- The Frost Wyrm ----------
  {
    const crater = api.cryo.crater;
    const group = new THREE.Group();
    scene.add(group);
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.3, metalness: 0.2, emissive: 0x1a4a6a, emissiveIntensity: 0.3, bumpMap: itemTexture('scales'), bumpScale: 1.2 });
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.2 });
    const SEGS = 20;
    const segs = [];
    for (let i = 0; i < SEGS; i++) {
      const r = i === 0 ? 4.5 : 3.6 - (i / SEGS) * 2.4;
      const g = new THREE.Group();
      part(g, new THREE.SphereGeometry(r, 18, 12), iceMat);
      for (let k = 0; k < 3; k++) {
        const sp = part(g, new THREE.ConeGeometry(r * 0.25, r * 0.9, 5), spikeMat, 0, r * 0.8, 0);
        sp.rotation.z = (k - 1) * 0.5;
      }
      group.add(g);
      segs.push({ g, r });
    }
    const head = segs[0].g;
    for (const s of [-1, 1]) part(head, new THREE.SphereGeometry(0.9, 10, 8), glow(0x5fe8ff, 2.5), s * 2.2, 1.2, -3.4);
    const jaw = part(head, new THREE.ConeGeometry(2.6, 5, 8), iceMat, 0, -1, -4.5);
    jaw.rotation.x = -Math.PI / 2;
    const b = { id: 'wyrm', name: 'The Frost Wyrm', sector: 'cryo', group, color: 0x9ff0ff, size: 40, reward: [2200, 1100], achievement: 'wyrm', material: 'ice', alive: true, respawn: 0, flash: 0, t: 0 };
    const headT = target(head, b, { name: 'Frost Wyrm (head)', hp: 2600, radius: 5, onBreak: () => defeated(b) });
    for (let i = 1; i < SEGS; i++) {
      // Body segments pass a quarter of the damage to the head
      const g = segs[i].g;
      g.userData.hostile = true;
      g.userData.radius = segs[i].r;
      g.userData.info = headT.obj.userData.info;
      g.userData.onLaser = (dmg, p, kind) => headT.obj.userData.onLaser(dmg * 0.25, p, kind);
    }
    b.parts = [headT];
    b.center = () => head.getWorldPosition(new THREE.Vector3());
    b.hpFrac = () => Math.max(0, headT.hp) / headT.maxHp;
    b.sub = () => (b.diving ? 'It dove under the ice… watch the crater!' : 'Aim for the head!');
    b.reset = () => {
      headT.alive = true;
      headT.hp = headT.maxHp;
      group.visible = true;
    };
    const trail = [];
    let breathT = 0, slam = 0;
    b.update = (dt, near) => {
      b.t += dt * (near ? 1 : 0.4);
      const t = b.t * 0.45;
      // Loops around the crater, diving under the ice now and then
      const r = 90 + Math.sin(t * 0.7) * 40;
      const y = 22 + Math.sin(t * 1.3) * 28;
      const p = crater.clone().add(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
      b.diving = y < 2;
      head.position.copy(p);
      trail.unshift(p.clone());
      if (trail.length > SEGS * 6) trail.pop();
      head.lookAt(trail[3] || p);
      head.rotateY(Math.PI);
      for (let i = 1; i < SEGS; i++) {
        const q = trail[Math.min(trail.length - 1, i * 5)];
        if (q) segs[i].g.position.copy(q);
      }
      if (!near) return;
      breathT -= dt;
      slam = Math.max(0, slam - dt);
      if (breathT <= 0 && !b.diving && head.position.distanceTo(ship.position) < 260) {
        breathT = 2.6;
        for (let k = 0; k < 5; k++) {
          const aim = ship.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12));
          shoot(head.position.clone(), aim, 80, 7, 0x9ff0ff, 0.9, 'frost');
        }
      }
      if (slam <= 0) {
        for (const s of segs) {
          if (s.g.position.distanceTo(ship.position) < s.r + 3) {
            slam = 1;
            ship.damage(14, 'the Frost Wyrm', s.g.position.clone(), 'crash');
            ship.velocity.add(ship.position.clone().sub(s.g.position).setLength(30));
            break;
          }
        }
      }
    };
    b.targets = (list) => {
      for (const s of segs) list.push(s.g);
    };
    bosses.push(b);
  }

  // ---------- The Hive Queen ----------
  {
    const home = new THREE.Vector3(-50, 60, -19500);
    const group = new THREE.Group();
    group.position.copy(home);
    scene.add(group);
    const flesh = new THREE.MeshStandardMaterial({ color: 0x4a1048, roughness: 0.4, emissive: 0x2a0030, emissiveIntensity: 0.6, bumpMap: itemTexture('scales'), bumpScale: 2 });
    const body = part(group, new THREE.IcosahedronGeometry(26, 3), flesh);
    for (let k = 0; k < 10; k++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.7, Math.random() - 0.5).normalize();
      const pts = [];
      for (let j = 0; j <= 6; j++) pts.push(dir.clone().multiplyScalar(24 + j * 9).add(new THREE.Vector3(Math.sin(j + k) * 5, Math.cos(j * 1.2) * 4, 0)));
      part(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 2.2, 8), flesh);
    }
    const coreMat = glow(0xff5ad0, 2.4);
    const core = part(group, new THREE.SphereGeometry(9, 24, 16), coreMat, 0, 0, 0);
    core.visible = false;
    const b = { id: 'queen', name: 'The Hive Queen', sector: 'rift', group, color: 0xff5ad0, size: 60, reward: [3500, 1800], achievement: 'queen', material: 'void', alive: true, respawn: 0, flash: 0, t: 0 };
    const eyes = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const e = new THREE.Group();
      e.position.set(Math.cos(a) * 25, Math.sin(k * 1.3) * 8, Math.sin(a) * 25);
      e.lookAt(e.position.clone().multiplyScalar(2));
      const ball = part(e, new THREE.SphereGeometry(3.2, 16, 12), glow(0xffe14d, 2));
      const lid = part(e, new THREE.SphereGeometry(3.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), flesh);
      lid.rotation.x = Math.PI / 2;
      group.add(e);
      const t = target(e, b, {
        name: 'Hive Queen eye', hp: 320, radius: 4, gate: () => e.userData.open,
        onBreak: () => {
          ball.visible = false;
          fx.explode(e.getWorldPosition(new THREE.Vector3()), 2.5, 0xffe14d);
          const left = eyes.filter((x) => x.alive).length;
          hud.toast(left ? `👁 Eye destroyed! ${left} left` : '👁 She\'s blind! Her core is open!', '#ff5ad0');
          if (!left) {
            body.material = flesh;
            core.visible = true;
          }
        },
      });
      t.lid = lid;
      t.ball = ball;
      eyes.push(t);
    }
    const coreT = target(core, b, { name: 'Hive Queen core', hp: 2200, radius: 9, gate: () => eyes.every((x) => !x.alive), onBreak: () => defeated(b) });
    b.parts = [...eyes, coreT];
    b.center = () => group.position.clone();
    b.hpFrac = () => (eyes.reduce((a, x) => a + Math.max(0, x.hp), 0) + Math.max(0, coreT.hp)) / (320 * 6 + 2200);
    b.sub = () => (eyes.some((x) => x.alive) ? `Shoot her open eyes (${eyes.filter((x) => x.alive).length} left)` : coreT.hp < coreT.maxHp * 0.4 ? 'She\'s enraged! Finish her!' : 'Destroy the core!');
    b.reset = () => {
      for (const x of eyes) {
        x.alive = true;
        x.hp = x.maxHp;
        x.ball.visible = true;
      }
      coreT.alive = true;
      coreT.hp = coreT.maxHp;
      core.visible = false;
      group.visible = true;
    };
    let eyeT = 0, openPair = 0, spawnT = 0, acidT = 0;
    b.update = (dt, near) => {
      b.t += dt;
      group.rotation.y += dt * 0.08;
      body.scale.setScalar(1 + Math.sin(b.t * 1.4) * 0.03);
      core.scale.setScalar(1 + Math.sin(b.t * 6) * 0.08);
      eyeT -= dt;
      if (eyeT <= 0) {
        eyeT = 8;
        openPair = (openPair + 1) % 3;
      }
      eyes.forEach((x, k) => {
        const open = x.alive && Math.floor(k / 2) === openPair;
        x.obj.userData.open = open;
        x.lid.rotation.x += ((open ? 0 : Math.PI / 2) - x.lid.rotation.x) * Math.min(1, dt * 4);
      });
      if (!near) return;
      const rage = coreT.hp < coreT.maxHp * 0.4 && core.visible;
      spawnT -= dt;
      acidT -= dt;
      if (spawnT <= 0 && api.enemies.count('brood') < (rage ? 12 : 8)) {
        spawnT = rage ? 7 : 11;
        for (let i = 0; i < 4; i++) api.enemies.spawn('swarmer', group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, -20, (Math.random() - 0.5) * 30)), { sector: 'rift', level: 18, tag: 'brood', home, leash: 500 });
      }
      if (acidT <= 0) {
        acidT = rage ? 1.2 : 2.2;
        const from = group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30));
        shoot(from, ship.position, rage ? 75 : 60, rage ? 14 : 10, 0x9aff3a, 1.4, 'acid');
      }
    };
    // Close in and she pulls you toward her
    api.forces.push((p) => {
      if (!b.alive || api.sector() !== 'rift' || !core.visible) return null;
      const d = p.distanceTo(group.position);
      if (d > 250 || d < 40) return null;
      return group.position.clone().sub(p).setLength(8);
    });
    bosses.push(b);
  }

  // ---------- Shared: targets, radar, boss bar, shots ----------
  api.targetSources.push((list) => {
    for (const b of bosses) {
      if (!b.alive) continue;
      if (b.targets) b.targets(list);
      else for (const t of b.parts) if (t.alive && t.obj.visible) list.push(t.obj);
    }
  });
  api.blipSources.push((out, here) => {
    for (const b of bosses) if (b.alive && b.sector === here) out.push({ p: b.center(), kind: 'boss', size: 2.4, sticky: true });
  });
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace ? ctx.sector : null;
    let shown = null;
    for (const b of bosses) {
      if (!b.alive) {
        if (b.respawn > 0 && (b.respawn -= dt) <= 0) {
          b.alive = true;
          b.reset();
        }
        continue;
      }
      const inSector = here === b.sector;
      b.group.visible = inSector;
      if (!inSector) continue;
      const near = ship.piloting && ship.position.distanceTo(b.center()) < 450;
      b.update(dt, near);
      if (near) shown = b;
      // Hit flash
      if (b.flash > 0) b.flash -= dt;
    }
    if (shown) hud.boss(shown.name, shown.hpFrac(), shown.sub());
    else hud.boss(null);
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      s.m.position.addScaledVector(s.v, dt);
      if (Math.random() < 0.4) fx.emit(s.m.position, null, s.m.material.color.getHex(), 0.5);
      if (ship.piloting && s.m.position.distanceTo(ship.position) < 3.2) {
        ship.damage(s.dmg, s.kind === 'frost' ? 'the Frost Wyrm' : s.kind === 'acid' ? 'the Hive Queen' : 'the Scrap King', s.from, s.kind === 'acid' ? 'ion' : '');
        if (s.kind === 'frost') {
          ship.velocity.multiplyScalar(0.4);
          hud.toast('❄ Frozen! Your engines are sluggish', '#9ff0ff');
        }
        s.life = 0;
      }
      if (s.life <= 0) {
        scene.remove(s.m);
        s.m.geometry.dispose();
        s.m.material.dispose();
        shots.splice(i, 1);
      }
    }
  });

  return { list: bosses, byId: (id) => bosses.find((b) => b.id === id) };
}
