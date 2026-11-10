// Enemy ships for the space RPG sectors (Kepler Reach's Belt drones are in spaceWorld.js).
// Like the drones, enemies are local to each player: everyone fights their own.
//
//   drone        circles you and shoots              interceptor  fast, jinks, strafing runs
//   bomber       slow, tough, fires homing missiles   minelayer    drops mines in your path
//   cloaker      invisible until it's close           turret       stationary gun platform
//   raider       scavenger ship (only hostile if the scavs hate you, or you shoot first)
//   swarmer      Hive kamikaze, comes in packs        spitter      Hive ship that spits acid
//   ace          a named elite pirate with a shield (wanted posters!)
//
// api.enemies.addZone({ sector, center, r, types: [[type, weight]...], max, level, active() })
// keeps enemies around while you're near; api.enemies.spawn(type, pos, opts) adds one.

import * as THREE from 'three';
import { itemTexture } from './itemTextures.js';

const ACES = ['Red Baron Kael', 'Vex "Knife" Morrow', 'Sable Quint', 'Iron Juno Rask', 'The Widow', 'Captain Ashgrin', 'Dex Halloran', 'Mad Ollie Vance'];

export function setupEnemies(api) {
  const { game, fx, hud, ship } = api;
  const { scene } = game;
  const root = new THREE.Group();
  scene.add(root);

  // ---------- Looks ----------
  const MAT = {
    talon: new THREE.MeshStandardMaterial({ color: 0x4a1d1d, roughness: 0.55, metalness: 0.4, bumpMap: itemTexture('brushed'), bumpScale: 0.5 }),
    talonTrim: new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.6, metalness: 0.5 }),
    scav: new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9, metalness: 0.3, bumpMap: itemTexture('grit'), bumpScale: 1.2 }),
    scavTrim: new THREE.MeshStandardMaterial({ color: 0x5a5a50, roughness: 0.8, metalness: 0.4 }),
    hive: new THREE.MeshStandardMaterial({ color: 0x3a0f3a, roughness: 0.45, emissive: 0x2a0030, emissiveIntensity: 0.5, bumpMap: itemTexture('scales'), bumpScale: 1.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.3, metalness: 0.9 }),
  };
  const eyeColor = { talon: 0xff2a1a, scav: 0xffb03a, hive: 0xff5ad0 };
  const add = (g, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const glowMat = (c, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  function model(type, faction) {
    const g = new THREE.Group();
    const body = MAT[faction].clone();
    const trim = (MAT[`${faction}Trim`] || MAT.talonTrim).clone();
    const eye = glowMat(eyeColor[faction] || 0xff2a1a);
    if (type === 'interceptor' || type === 'ace') {
      const s = type === 'ace' ? 1.5 : 1;
      add(g, new THREE.ConeGeometry(0.6 * s, 4 * s, 10), body).rotation.x = -Math.PI / 2;
      for (const side of [-1, 1]) {
        const w = add(g, new THREE.BoxGeometry(3 * s, 0.1, 1.4 * s), trim, side * 1.4 * s, 0, 0.8 * s);
        w.rotation.y = side * 0.5;
        add(g, new THREE.BoxGeometry(0.1, 0.8 * s, 1 * s), type === 'ace' ? MAT.gold : body, side * 2.6 * s, 0.3, 1.2 * s);
      }
      add(g, new THREE.SphereGeometry(0.35 * s, 10, 8), eye, 0, 0, 1.9 * s);
      add(g, new THREE.SphereGeometry(0.25 * s, 10, 8), eye, 0, 0.2, -1.2 * s);
    } else if (type === 'bomber') {
      add(g, new THREE.BoxGeometry(3, 1.6, 5), body);
      for (const side of [-1, 1]) {
        add(g, new THREE.CylinderGeometry(0.7, 0.7, 4, 12), trim, side * 2.2, -0.3, 0.3).rotation.x = Math.PI / 2;
        add(g, new THREE.SphereGeometry(0.5, 10, 8), eye, side * 2.2, -0.3, 2.4);
      }
      add(g, new THREE.BoxGeometry(1.4, 0.5, 0.2), eye, 0, 0.3, -2.55);
    } else if (type === 'minelayer') {
      add(g, new THREE.CylinderGeometry(2.4, 2.8, 1, 20), body);
      const ring = add(g, new THREE.TorusGeometry(3, 0.25, 6, 24), trim);
      ring.rotation.x = Math.PI / 2;
      g.userData.spin = ring;
      add(g, new THREE.SphereGeometry(0.6, 10, 8), eye, 0, 0.7, 0);
    } else if (type === 'cloaker') {
      const shape = new THREE.Shape();
      shape.moveTo(0, -2.5);
      shape.lineTo(2.2, 1.8);
      shape.lineTo(0, 1);
      shape.lineTo(-2.2, 1.8);
      shape.closePath();
      const m = add(g, new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }), body);
      m.rotation.x = Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.3, 8, 6), eye, 0, 0.3, -1.6);
      g.traverse((o) => {
        if (o.isMesh) {
          o.material.transparent = true;
        }
      });
    } else if (type === 'turret') {
      add(g, new THREE.CylinderGeometry(2.2, 2.6, 1.4, 16), trim);
      add(g, new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.7, 0);
      for (const side of [-1, 1]) add(g, new THREE.CylinderGeometry(0.22, 0.28, 3.2, 10), trim, side * 0.6, 1.6, -1.6).rotation.x = Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.4, 8, 6), eye, 0, 1.8, -0.6);
    } else if (type === 'swarmer' || type === 'spitter') {
      const s = type === 'spitter' ? 2.2 : 1;
      const b = add(g, new THREE.IcosahedronGeometry(0.9 * s, 1), body);
      b.scale.set(1, 0.8, 1.3);
      for (let k = 0; k < 5; k++) {
        const sp = add(g, new THREE.ConeGeometry(0.2 * s, 1.4 * s, 5), body);
        const a = (k / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.8 * s, Math.sin(a) * 0.6 * s, 0.6 * s);
        sp.rotation.x = Math.PI / 2 + 0.4;
      }
      add(g, new THREE.SphereGeometry(0.35 * s, 10, 8), eye, 0, 0, -1.1 * s);
    } else if (type === 'raider') {
      add(g, new THREE.BoxGeometry(2.2, 1.3, 4), body);
      add(g, new THREE.BoxGeometry(4.6, 0.3, 1.6), trim, 0, 0, 0.8).rotation.z = 0.08;
      add(g, new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8), trim, 0.8, 0.8, 0.5).rotation.z = 1.2;
      add(g, new THREE.SphereGeometry(0.3, 8, 6), eye, 0, 0.3, -2.1);
      add(g, new THREE.BoxGeometry(1.2, 0.6, 0.3), eye, 0, 0, 2.1);
    } else {
      // drone
      add(g, new THREE.SphereGeometry(0.9, 16, 12), body);
      add(g, new THREE.SphereGeometry(0.32, 10, 8), eye, 0, 0, -0.75);
      for (let k = 0; k < 4; k++) {
        const fin = add(g, new THREE.BoxGeometry(0.1, 1.3, 0.7), trim);
        fin.rotation.z = (k / 4) * Math.PI * 2;
        fin.position.set(Math.sin((k / 4) * Math.PI * 2) * 0.9, Math.cos((k / 4) * Math.PI * 2) * 0.9, 0.3);
      }
    }
    return g;
  }

  // ---------- Types ----------
  // move: orbit | jink | standoff | static | kamikaze · fire: [cooldown, random extra] · shot: bolt | missile | mine | acid
  const TYPES = {
    drone: { name: 'Pirate drone', hp: 40, speed: 34, move: 'orbit', fire: [1.9, 1.1], shot: 'bolt', dmg: 5, range: 170, xp: 12, cr: 8, r: 1.3, size: 1.2 },
    interceptor: { name: 'Talon interceptor', hp: 35, speed: 62, move: 'jink', fire: [0.8, 0.5], shot: 'bolt', dmg: 4, range: 160, xp: 18, cr: 14, r: 1.8, size: 1.3 },
    bomber: { name: 'Talon bomber', hp: 150, speed: 20, move: 'standoff', fire: [3.6, 1.2], shot: 'missile', dmg: 14, range: 300, xp: 34, cr: 28, r: 3, size: 2.4 },
    minelayer: { name: 'Minelayer', hp: 90, speed: 26, move: 'standoff', fire: [2.4, 1], shot: 'mine', dmg: 20, range: 220, xp: 26, cr: 20, r: 3, size: 2 },
    cloaker: { name: 'Cloaker', hp: 60, speed: 42, move: 'orbit', fire: [1.3, 0.6], shot: 'bolt', dmg: 8, range: 150, xp: 30, cr: 24, r: 2.2, size: 1.5, cloak: true },
    turret: { name: 'Gun platform', hp: 240, speed: 0, move: 'static', fire: [1.7, 0.6], shot: 'bolt', dmg: 6, range: 280, xp: 32, cr: 26, r: 2.6, size: 2.4 },
    raider: { name: 'Scav raider', hp: 55, speed: 44, move: 'orbit', fire: [1.3, 0.6], shot: 'bolt', dmg: 5, range: 170, xp: 16, cr: 14, r: 2, size: 1.5 },
    swarmer: { name: 'Hive swarmer', hp: 16, speed: 58, move: 'kamikaze', dmg: 12, xp: 7, cr: 4, r: 1.2, size: 0.8 },
    spitter: { name: 'Hive spitter', hp: 80, speed: 30, move: 'orbit', fire: [1.7, 0.6], shot: 'acid', dmg: 9, range: 200, xp: 24, cr: 16, r: 2.5, size: 1.8 },
    ace: { name: 'Ace', hp: 420, shield: 160, speed: 54, move: 'jink', fire: [1.5, 0.3], burst: 3, shot: 'bolt', dmg: 6, range: 220, xp: 220, cr: 400, r: 3, size: 2.2 },
  };
  const FACTION_OF = { raider: 'scav', swarmer: 'hive', spitter: 'hive' };

  const enemies = [];
  const shots = [];
  const zones = [];
  const _v = new THREE.Vector3();
  const _t = new THREE.Vector3();

  const scavHostile = () => api.st.rep.scav <= -10;
  function spawn(type, pos, opts = {}) {
    const def = TYPES[type];
    const faction = opts.faction || FACTION_OF[type] || 'talon';
    const level = Math.max(1, opts.level || 1);
    const hpMul = 1 + 0.1 * (level - 1);
    const g = model(type, faction);
    g.position.copy(pos);
    root.add(g);
    const e = {
      type, def, g, faction, level, name: opts.name || (type === 'ace' ? ACES[Math.floor(Math.random() * ACES.length)] : def.name),
      hp: def.hp * hpMul * (opts.hpMul || 1), maxHp: def.hp * hpMul * (opts.hpMul || 1), shield: (def.shield || 0) * hpMul, maxShield: (def.shield || 0) * hpMul,
      dmg: def.dmg * (1 + 0.05 * (level - 1)), vel: new THREE.Vector3(), cool: 1 + Math.random() * 2, orbit: Math.random() * 6.28, stun: 0,
      home: (opts.home || pos).clone(), leash: opts.leash || 600, sector: opts.sector, tag: opts.tag, zone: opts.zone,
      aggro: faction !== 'scav', burst: 0, jink: new THREE.Vector3(), jinkT: 0, cloakT: 0, onDeath: opts.onDeath, alive: true,
    };
    g.userData.hostile = true;
    g.userData.radius = def.r;
    g.userData.enemy = e;
    g.userData.info = () => ({ name: `${e.name}${e.level > 1 ? ` · Lv ${e.level}` : ''}`, hp: e.hp / e.maxHp, shield: e.maxShield ? e.shield / e.maxShield : undefined, color: faction === 'scav' && !isHostile(e) ? '#d8b45a' : undefined });
    g.userData.onLaser = (dmg, point, kind) => hit(e, dmg, kind);
    enemies.push(e);
    return e;
  }
  const isHostile = (e) => e.aggro || (e.faction === 'scav' && scavHostile());

  function hit(e, dmg, kind) {
    if (!e.alive) return;
    if (e.faction === 'scav' && !e.aggro) {
      e.aggro = true;
      if (!scavHostile()) {
        api.rep('scav', -3);
        hud.toast('You fired on the scavengers! They don\'t like that.', '#d8b45a');
      }
    }
    if (kind === 'ion') {
      e.stun = 3;
      if (e.shield > 0) {
        e.shield = Math.max(0, e.shield - dmg * 3);
        return;
      }
    }
    if (e.shield > 0) {
      const a = Math.min(e.shield, dmg);
      e.shield -= a;
      dmg -= a;
      fx.sparks(e.g.position, 0x5fd4ff, 5);
    }
    e.hp -= dmg;
    flash(e);
    if (e.cloakT !== undefined) e.cloakT = 2; // being shot reveals a cloaker
    if (e.hp <= 0) kill(e);
  }
  function flash(e) {
    e.flash = 0.08;
  }
  function kill(e, quiet = false) {
    if (!e.alive) return;
    e.alive = false;
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
    root.remove(e.g);
    if (quiet) return;
    const p = e.g.position.clone();
    fx.explode(p, e.def.size, e.faction === 'hive' ? 0xff5ad0 : 0xff7a1a);
    const lvl = e.level;
    api.killed({ type: e.type, faction: e.faction, p, sector: e.sector, xp: e.def.xp * (1 + 0.1 * (lvl - 1)), cr: e.def.cr * (1 + 0.1 * (lvl - 1)), rarity: e.type === 'ace' ? 'epic' : null, name: e.name });
    if (e.type === 'ace') api.announce(`☠ shot down the ace pilot ${e.name}!`);
    e.onDeath?.(e);
  }

  // ---------- Enemy shots ----------
  const boltGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const acidGeo = new THREE.SphereGeometry(0.9, 10, 8);
  const mineGeo = new THREE.IcosahedronGeometry(0.8, 0);
  const missileGeo = new THREE.ConeGeometry(0.25, 1.2, 8);
  const shotMat = {
    bolt: { talon: new THREE.MeshBasicMaterial({ color: 0xff5040 }), scav: new THREE.MeshBasicMaterial({ color: 0xffb03a }), hive: new THREE.MeshBasicMaterial({ color: 0xff5ad0 }) },
    acid: new THREE.MeshBasicMaterial({ color: 0x9aff3a, transparent: true, opacity: 0.85 }),
    mine: new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff2a1a, emissiveIntensity: 1.2 }),
    missile: new THREE.MeshStandardMaterial({ color: 0x6a6a6a, emissive: 0xff3a1a, emissiveIntensity: 0.8 }),
  };
  function fire(e, target, targetVel) {
    const from = e.g.position.clone();
    const kind = e.def.shot;
    let m, v, life = 4, hp = 0;
    if (kind === 'mine') {
      m = new THREE.Mesh(mineGeo, shotMat.mine);
      v = new THREE.Vector3();
      life = 30;
      hp = 5;
    } else {
      const speed = kind === 'missile' ? 55 : kind === 'acid' ? 50 : 90;
      const t = from.distanceTo(target) / speed;
      const aim = target.clone().addScaledVector(targetVel, t * 0.6);
      v = aim.sub(from).normalize().multiplyScalar(speed);
      m = new THREE.Mesh(kind === 'missile' ? missileGeo : kind === 'acid' ? acidGeo : boltGeo, kind === 'bolt' ? shotMat.bolt[e.faction] || shotMat.bolt.talon : shotMat[kind]);
      if (kind === 'missile') {
        life = 7;
        hp = 8;
      }
    }
    m.position.copy(from);
    root.add(m);
    const s = { m, v, life, kind, dmg: e.dmg, from, hp };
    if (hp) {
      // Missiles and mines can be shot down
      m.userData.hostile = true;
      m.userData.radius = 1.4;
      m.userData.info = () => ({ name: kind === 'mine' ? 'Mine' : 'Missile', hp: s.hp / 8 });
      m.userData.onLaser = (dmg) => {
        s.hp -= dmg;
        if (s.hp <= 0) {
          s.life = 0;
          fx.explode(m.position, 0.6, 0xffa040, { debris: false });
        }
      };
    }
    shots.push(s);
  }

  // ---------- Spawn zones ----------
  function addZone(z) {
    zones.push({ ...z, timer: 0, list: [] });
  }

  // ---------- Per frame ----------
  const pick = (weights) => {
    let total = 0;
    for (const [, w] of weights) total += w;
    let r = Math.random() * total;
    for (const [t, w] of weights) if ((r -= w) <= 0) return t;
    return weights[0][0];
  };
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace ? ctx.sector : null;
    const piloting = ship.piloting;
    const target = piloting ? ship.position : ctx.player.position.clone().setY(ctx.player.position.y + 1);
    const targetVel = piloting ? ship.velocity : _v.set(0, 0, 0);
    const lvl = api.level();

    // Zones keep enemies around while you're close
    for (const z of zones) {
      z.list = z.list.filter((e) => e.alive);
      if (z.sector !== here || (z.active && !z.active(api)) || target.distanceTo(z.center) > z.r + 250) continue;
      z.timer -= dt;
      if (z.list.length < z.max && z.timer <= 0) {
        z.timer = z.every ?? 4;
        const type = Math.random() < (z.aceChance ?? 0) ? 'ace' : pick(z.types);
        const pack = type === 'swarmer' ? 4 : 1;
        for (let k = 0; k < pack && z.list.length < z.max + 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const p = z.center.clone().add(new THREE.Vector3(Math.cos(a) * z.r * 0.8, (Math.random() - 0.3) * 40, Math.sin(a) * z.r * 0.8));
          const e = spawn(type, p, { sector: z.sector, level: Math.max(z.level, lvl - 3), home: z.center, leash: z.r + 300, zone: z });
          z.list.push(e);
        }
      }
    }

    for (const e of [...enemies]) {
      const d = e.def;
      const pos = e.g.position;
      const dist = pos.distanceTo(target);
      const hostile = isHostile(e);
      const engaged = hostile && dist < (piloting ? 320 : 90) && target.distanceTo(e.home) < e.leash;
      e.stun = Math.max(0, e.stun - dt);
      e.orbit += dt * 0.7;
      let goal, speed = d.speed;
      if (e.stun > 0) {
        e.vel.multiplyScalar(0.92);
        if (Math.random() < 0.3) fx.emit(pos, null, 0x7ad8ff, 0.3);
      } else if (d.move === 'static') {
        e.vel.set(0, 0, 0);
      } else {
        if (!engaged) {
          goal = e.home.clone().add(_v.set(Math.cos(e.orbit) * 60, 15 + Math.sin(e.orbit * 0.7) * 10, Math.sin(e.orbit) * 50));
          speed *= 0.45;
        } else if (d.move === 'kamikaze') {
          goal = target.clone();
          speed *= 1.1;
        } else if (d.move === 'standoff') {
          const away = pos.clone().sub(target).setLength(120);
          goal = target.clone().add(away).add(_v.set(Math.cos(e.orbit) * 30, 20, Math.sin(e.orbit) * 30));
        } else if (d.move === 'jink') {
          e.jinkT -= dt;
          if (e.jinkT <= 0) {
            e.jinkT = 0.6 + Math.random() * 0.8;
            e.jink.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(60);
          }
          // Strafing runs: fly past you, swing round, come back
          goal = target.clone().add(_t.set(Math.cos(e.orbit * 1.6) * 70, 10 + Math.sin(e.orbit * 2) * 25, Math.sin(e.orbit * 1.6) * 70)).add(e.jink);
        } else {
          goal = target.clone().add(_v.set(Math.cos(e.orbit) * 32, 8 + Math.sin(e.orbit * 1.7) * 6, Math.sin(e.orbit) * 32));
        }
        const want = goal.sub(pos);
        if (want.length() > 1) want.setLength(speed);
        e.vel.lerp(want, Math.min(1, dt * (d.move === 'jink' ? 2.5 : 1.5)));
        pos.addScaledVector(e.vel, dt);
      }
      // Face where it's going (or the target while fighting)
      if (d.move !== 'static' || engaged) {
        e.g.lookAt(engaged ? target : pos.clone().add(e.vel.lengthSq() > 0.1 ? e.vel : _v.set(0, 0, 1)));
        e.g.rotateY(Math.PI); // models face -Z
      }
      if (e.g.userData.spin) e.g.userData.spin.rotation.z += dt * 2;

      // Cloakers fade in only when close or just after being hit / firing
      if (d.cloak) {
        e.cloakT = Math.max(0, (e.cloakT || 0) - dt);
        const seen = dist < 70 || e.cloakT > 0;
        const op = seen ? 0.9 : 0.06;
        e.g.traverse((o) => o.isMesh && (o.material.opacity += (op - o.material.opacity) * Math.min(1, dt * 4)));
        e.g.userData.cloaked = !seen;
      }

      // Attack
      if (engaged && e.stun <= 0) {
        if (d.move === 'kamikaze') {
          if (dist < d.r + 2.6) {
            hurtTarget(e.dmg, e.name, pos.clone());
            fx.explode(pos, 0.8, 0xff5ad0);
            kill(e, true);
            continue;
          }
        } else if (dist < d.range) {
          e.cool -= dt;
          if (e.cool <= 0) {
            fire(e, target, targetVel);
            if (d.burst && ++e.burst < d.burst) e.cool = 0.15;
            else {
              e.burst = 0;
              e.cool = d.fire[0] + Math.random() * d.fire[1];
            }
            if (d.cloak) e.cloakT = 1.2;
          }
        }
      }
      // Wandered too far from home: give up quietly
      if (pos.distanceTo(e.home) > e.leash + 400) kill(e, true);
      // Hit flash
      if (e.flash > 0) {
        e.flash -= dt;
        const on = e.flash > 0;
        e.g.traverse((o) => {
          if (!o.isMesh || !o.material.emissive) return;
          if (o.userData.be === undefined) o.userData.be = [o.material.emissive.getHex(), o.material.emissiveIntensity];
          o.material.emissive.setHex(on ? 0xffffff : o.userData.be[0]);
          o.material.emissiveIntensity = on ? 1 : o.userData.be[1];
        });
      }
    }

    // Shots
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (!s) continue; // your ship blew up mid-loop and the list was cleared
      s.life -= dt;
      if (s.kind === 'missile') {
        const want = target.clone().sub(s.m.position).setLength(60);
        s.v.lerp(want, Math.min(1, dt * 1.2));
        s.m.lookAt(s.m.position.clone().add(s.v));
        s.m.rotateX(Math.PI / 2);
        if (Math.random() < 0.6) fx.emit(s.m.position, null, 0xff7a1a, 0.5);
      } else if (s.kind === 'mine') {
        s.m.rotation.y += dt * 2;
        s.m.material.emissiveIntensity = Math.sin(performance.now() / 120) > 0 ? 1.6 : 0.2;
      }
      s.m.position.addScaledVector(s.v, dt);
      const reach = s.kind === 'mine' ? 9 : s.kind === 'acid' ? 3.2 : piloting ? 2.6 : 1.1;
      if (s.life > 0 && s.m.position.distanceTo(target) < reach) {
        hurtTarget(s.dmg, s.kind === 'acid' ? 'Hive acid' : 'pirates', s.from, s.kind === 'acid' ? 'ion' : '');
        if (s.kind !== 'bolt') fx.explode(s.m.position, s.kind === 'mine' ? 1.2 : 0.7, s.kind === 'acid' ? 0x9aff3a : 0xffa040);
        s.life = 0;
      }
      if (s.life <= 0) {
        root.remove(s.m);
        shots.splice(i, 1);
      }
    }
  });
  function hurtTarget(n, cause, from, kind = '') {
    if (ship.piloting) ship.damage(n, cause, from, kind);
    else game.player.takeDamage(n, cause);
  }

  api.targetSources.push((list) => {
    for (const e of enemies) list.push(e.g);
    for (const s of shots) if (s.hp) list.push(s.m);
  });
  api.blipSources.push((out, here) => {
    for (const e of enemies) {
      if (e.sector && e.sector !== here) continue;
      if (e.g.userData.cloaked) continue;
      out.push({ p: e.g.position, kind: isHostile(e) ? (e.type === 'ace' ? 'boss' : 'enemy') : 'neutral', size: e.type === 'ace' ? 1.4 : 0.9 });
    }
  });
  (api.onShipLost ||= []).push(() => {
    for (const s of shots) root.remove(s.m);
    shots.length = 0;
  });

  return {
    TYPES,
    spawn,
    addZone,
    kill,
    get list() { return enemies; },
    count: (tag) => enemies.filter((e) => e.tag === tag).length,
    clearTag(tag) {
      for (const e of [...enemies]) if (e.tag === tag) kill(e, true);
    },
  };
}
