// 15 EVEN MORE overpowered items (all in the Tab item spawner). Built on the helpers from
// opItems.js (game.opItems: boomAll, hurt, fire, aimPoint, beamFx, boltFx, puffFx, ...).
//
//   🐋 Whale Drop        a whale falls out of the sky where you aim
//   🪃 Boomerang         flies out and comes back, hitting everyone on the way
//   🛸 UFO Abduction     a UFO beams up whoever you aim at, then drops them
//   🎆 Firework Launcher fireworks that explode in the sky
//   ⛈️ Storm Cloud       a thundercloud that zaps anyone under it for 8 seconds
//   🪞 Decoy Clones      4 fake copies of you run off and explode when someone gets close
//   ⛸️ Ice Field         turns the ground where you aim into slippery ice for 12 seconds
//   🔊 Sonic Boom        a shockwave ring blasts everyone away from you
//   🪓 Giant Axe         360° spin attack
//   🍄 Shrink Ray        shrinks whoever you aim at (tiny and slow) for 10 seconds
//   🎈 Balloon Gun       ties balloons to someone; they float away
//   👊 Falcon Punch      dash forward and punch through everyone in your way
//   ⚓ Anchor            someone gets too heavy to jump or run for 6 seconds
//   🧷 Sticky C4         left click throws a charge (up to 3), right click blows them all up
//   🌑 Darkness Bomb     everyone near where you aim goes blind for 4 seconds
//
// New events use the op3: prefix. Like the other OP items, each player applies hits to themselves.

import * as THREE from 'three';
import { registerItem } from './items.js';
import { createCapsuleMesh, animateCharacter } from './capsule.js';

const round = (n) => Math.round(n * 1000) / 1000;
const arr = (v) => v.toArray().map(round);
const vec = (a) => new THREE.Vector3().fromArray(a);

export function setupEvenMoreOpItems(game) {
  const { scene, net, combat, CONFIG, world, remotes } = game;
  const op = game.opItems;
  const nowS = () => performance.now() / 1000;
  const nameOf = (id) => (id === net.id ? game.player?.name : remotes.players.get(id)?.name) || 'someone';
  const posOf = (id) => (id === net.id ? game.player?.position : remotes.players.get(id)?.mesh.position);
  let uid = 0;
  const newId = (tag) => `${net.id}-${tag}${++uid}`;
  const _v = new THREE.Vector3();

  // Every running effect is a function (dt) -> keep going?
  const effects = [];
  const run = (fn) => effects.push(fn);
  // Remove a mesh/group and free what it made
  function drop(obj) {
    scene.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }

  // ---------- Status effects on players (shrunk, anchored, floating) ----------
  // Everyone tracks them for drawing; only the affected player changes their own movement.
  const status = new Map(); // `${kind}:${id}` -> until
  const hasStatus = (kind, id) => (status.get(`${kind}:${id}`) || 0) > nowS();
  function giveStatus(kind, id, secs) {
    status.set(`${kind}:${id}`, nowS() + secs);
  }

  op.addProjectileLook('c4', () =>
    new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.8 }))
  );

  // ---------- Look helpers ----------
  function makeWhale() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x3d5f86, roughness: 0.6 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xd8e2ea, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 14), skin);
    body.scale.set(1, 0.8, 2);
    const under = new THREE.Mesh(new THREE.SphereGeometry(2.7, 18, 12), belly);
    under.scale.set(0.9, 0.6, 1.8);
    under.position.y = -0.6;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1.4), skin);
    tail.position.z = -6.4;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(2.2, 0.6, 3.5);
    const eye2 = eye.clone();
    eye2.position.x = -2.2;
    g.add(body, under, tail, eye, eye2);
    return g;
  }

  function makeUfo() {
    const g = new THREE.Group();
    const saucer = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 10), new THREE.MeshStandardMaterial({ color: 0xa8b0bc, metalness: 0.8, roughness: 0.3 }));
    saucer.scale.y = 0.25;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8affc8, transparent: true, opacity: 0.6 }));
    dome.position.y = 0.3;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 2.2, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9affd0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.name = 'beam';
    g.add(saucer, dome, beam);
    return g;
  }

  function makeCloud() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d48, roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 1.5, 12, 10), mat);
      puff.position.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 9);
      g.add(puff);
    }
    return g;
  }

  // ---------- Whale ----------
  function whaleDrop(p) {
    const whale = makeWhale();
    whale.rotation.set(-0.4, Math.random() * Math.PI * 2, 0);
    scene.add(whale);
    let t = 0;
    run((dt) => {
      t += dt;
      whale.position.set(p.x, p.y + 70 * Math.max(0, 1 - t / 1.3) + 3, p.z);
      if (t < 1.6) return true;
      drop(whale);
      return false;
    });
  }

  // ---------- Boomerang ----------
  // Path: out 26m and back to where it was thrown, curving to the side. Same on every client.
  const BOOMERANG_T = 2.2;
  function boomerangPath(p, d, t, out) {
    const k = Math.PI * Math.min(1, t / BOOMERANG_T);
    const fwd = Math.sin(k) * 26;
    const side = Math.sin(k * 2) * 2.5;
    return out.set(p.x + d.x * fwd - d.z * side, p.y, p.z + d.z * fwd + d.x * side);
  }
  function boomerang(p, d, mine) {
    const mesh = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: 0xc4813a, roughness: 0.7 });
    for (const r of [0, Math.PI / 2.2]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.22), armMat);
      arm.position.x = 0.35;
      const holder = new THREE.Group();
      holder.rotation.y = r;
      holder.add(arm);
      mesh.add(holder);
    }
    scene.add(mesh);
    const hit = new Set();
    let t = 0;
    run((dt) => {
      t += dt;
      boomerangPath(p, d, t, mesh.position);
      mesh.rotation.y += dt * 25;
      if (mine) {
        for (const { player: rp } of combat.playersInRadius(mesh.position, 1.8)) {
          if (hit.has(rp.id)) continue;
          hit.add(rp.id);
          _v.copy(rp.mesh.position).sub(mesh.position).setY(0).normalize();
          op.hurt(rp.id, 30, [_v.x * 16, 7, _v.z * 16]);
        }
      }
      if (t < BOOMERANG_T) return true;
      drop(mesh);
      return false;
    });
  }

  // ---------- UFO ----------
  function abduct(target, secs) {
    const ufo = makeUfo();
    scene.add(ufo);
    giveStatus('abduct', target, secs);
    let t = 0;
    run((dt) => {
      t += dt;
      const tp = posOf(target);
      if (tp) {
        ufo.position.set(tp.x, Math.max(tp.y + 4, ufo.position.y || tp.y + 14) + Math.sin(t * 3) * 0.2, tp.z);
        ufo.position.y = Math.max(ufo.position.y, tp.y + 6);
        const beam = ufo.getObjectByName('beam');
        const h = ufo.position.y - tp.y;
        beam.scale.y = h;
        beam.position.y = -h / 2;
        beam.visible = t < secs;
      }
      ufo.rotation.y += dt * 2;
      if (t < secs + 1.5 && tp) {
        if (t > secs) ufo.position.y += dt * 30; // zoom off
        return true;
      }
      drop(ufo);
      return false;
    });
  }

  // ---------- Fireworks ----------
  const FW_TIME = 1.1;
  const FW_COLORS = [0xff4d6d, 0xffd23d, 0x4dd9ff, 0x9a6bff, 0x5dff8a, 0xff8a3d];
  function firework(p, v, mine) {
    const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff4d6d }));
    scene.add(rocket);
    const pos = p.clone(), vel = v.clone();
    let t = 0, burst = false;
    const sparks = [];
    run((dt) => {
      t += dt;
      if (!burst) {
        vel.y -= 6 * dt;
        pos.addScaledVector(vel, dt);
        rocket.position.copy(pos);
        rocket.lookAt(_v.copy(pos).add(vel));
        rocket.rotateX(Math.PI / 2);
        if (t >= FW_TIME) {
          burst = true;
          scene.remove(rocket);
          rocket.geometry.dispose();
          rocket.material.dispose();
          const color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
          for (let i = 0; i < 60; i++) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
            s.position.copy(pos);
            const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            s.userData.v = dir.multiplyScalar(10 + Math.random() * 6);
            scene.add(s);
            sparks.push(s);
          }
          game.flash?.(pos, { color, intensity: 3, distance: 40, duration: 0.5 });
          if (mine) op.boomAll(pos, 7, 40, 22, { color, quiet: false });
        }
        return true;
      }
      for (const s of sparks) {
        s.userData.v.y -= 5 * dt;
        s.userData.v.multiplyScalar(1 - 1.2 * dt);
        s.position.addScaledVector(s.userData.v, dt);
        s.material.opacity = Math.max(0, 1 - (t - FW_TIME) / 1.4);
      }
      if (t < FW_TIME + 1.4) return true;
      for (const s of sparks) {
        scene.remove(s);
        s.geometry.dispose();
        s.material.dispose();
      }
      return false;
    });
  }

  // ---------- Storm cloud ----------
  function stormCloud(p, secs, mine) {
    const cloud = makeCloud();
    cloud.position.copy(p).y += 16;
    scene.add(cloud);
    let t = 0, zap = 0.5;
    run((dt) => {
      t += dt;
      cloud.rotation.y += dt * 0.3;
      if (mine && t < secs) {
        zap -= dt;
        if (zap <= 0) {
          zap = 0.7;
          // Zap someone standing under the cloud, or the ground if nobody is
          const victims = combat.playersInRadius(p, 11).filter(({ player: rp }) => Math.abs(rp.mesh.position.y - p.y) < 12);
          const top = cloud.position.clone();
          let target;
          if (victims.length) {
            const rp = victims[Math.floor(Math.random() * victims.length)].player;
            target = combat.bodyCenter(rp);
            op.hurt(rp.id, 18, [0, 6, 0]);
          } else {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
            target = op.aimPoint(new THREE.Vector3(p.x + Math.cos(a) * r, top.y, p.z + Math.sin(a) * r), new THREE.Vector3(0, -1, 0), 40);
          }
          const pts = [top, top.clone().lerp(target, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)), target];
          op.boltFx(pts);
          net.sendEvent({ kind: 'op:bolt', pts: pts.map(arr) });
        }
      }
      if (t < secs) return true;
      drop(cloud);
      return false;
    });
  }

  // ---------- Decoy clones ----------
  // Each clone runs off in a seeded direction; anyone (but the owner) who gets close blows it up.
  const clones = new Map(); // id -> { mesh, owner, start, dir, t }
  function spawnClones(owner, p, seed, color, name) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4; i++) {
      const id = `${owner}-c${seed}-${i}`;
      const mesh = createCapsuleMesh(color, name);
      const a = rnd() * Math.PI * 2;
      mesh.position.copy(p);
      scene.add(mesh);
      clones.set(id, { mesh, owner, start: p.clone(), dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), t: 0, speed: 4 + rnd() * 3 });
    }
  }
  function removeClone(id) {
    const c = clones.get(id);
    if (!c) return;
    scene.remove(c.mesh);
    clones.delete(id);
  }

  // ---------- Ice fields ----------
  const iceFields = []; // { p, r, until, mesh }
  const baseGrip = { groundFriction: CONFIG.groundFriction, groundAccel: CONFIG.groundAccel };
  function iceField(p, secs) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(10, 40),
      new THREE.MeshStandardMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.2, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(p).y += 0.06;
    scene.add(mesh);
    iceFields.push({ p: p.clone(), r: 10, until: nowS() + secs, mesh });
  }

  // ---------- Sonic boom ----------
  function sonicBoom(p, fromId) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.25, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(p).y += 1;
    scene.add(ring);
    let t = 0, hit = fromId === net.id; // can't hit yourself
    run((dt) => {
      t += dt;
      const r = t * 40;
      ring.scale.set(r, r, 1 + t * 4);
      ring.material.opacity = Math.max(0, 0.7 * (1 - r / 32));
      const player = game.player;
      if (!hit && player) {
        _v.copy(player.position).sub(p);
        const d = Math.hypot(_v.x, _v.z);
        if (d < r && d < 32 && Math.abs(_v.y) < 8) {
          hit = true;
          if (d > 0.01) _v.multiplyScalar(1 / d);
          const f = 1 - d / 32;
          player.applyKnockback([_v.x * 35 * f + _v.x * 8, 10, _v.z * 35 * f + _v.z * 8]);
          player.takeDamage(15, nameOf(fromId));
        }
      }
      if (r < 32) return true;
      drop(ring);
      return false;
    });
  }

  // ---------- Balloons ----------
  function balloons(target, secs) {
    giveStatus('float', target, secs);
    const g = new THREE.Group();
    const colors = [0xff4d6d, 0x4dd9ff, 0xffd23d];
    colors.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
      b.scale.y = 1.2;
      b.position.set((i - 1) * 0.7, 3.4 + (i % 2) * 0.4, 0);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      string.position.set((i - 1) * 0.35, 2.4, 0);
      string.rotation.z = (1 - i) * 0.4;
      g.add(b, string);
    });
    scene.add(g);
    run(() => {
      const tp = posOf(target);
      if (tp) g.position.copy(tp);
      if (tp && hasStatus('float', target)) return true;
      drop(g);
      return false;
    });
  }

  // ---------- Shrink (drawn on everyone, including yourself) ----------
  function shrink(target, secs) {
    giveStatus('shrink', target, secs);
  }

  // ---------- Sticky C4 ----------
  const charges = new Map(); // id -> { mesh, p, owner }
  const myCharges = [];
  function addCharge(id, p, owner) {
    if (charges.has(id)) return;
    const g = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.8 }));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    led.position.set(0.15, 0.15, 0);
    g.add(block, led);
    g.position.copy(p);
    scene.add(g);
    charges.set(id, { mesh: g, led, p: p.clone(), owner });
  }
  function removeCharge(id) {
    const c = charges.get(id);
    if (!c) return;
    drop(c.mesh);
    charges.delete(id);
  }

  // ---------- Darkness ----------
  const darkEl = document.createElement('div');
  Object.assign(darkEl.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.25s',
    background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.98) 45%, #000 100%)', zIndex: 6,
  });
  document.getElementById('hud').appendChild(darkEl);
  let darkUntil = 0;

  // ---------- Network ----------
  net.on('event', (msg) => {
    const me = net.id;
    switch (msg.kind) {
      case 'op3:whale':
        if (Array.isArray(msg.p)) whaleDrop(vec(msg.p));
        break;
      case 'op3:boomerang':
        if (Array.isArray(msg.p) && Array.isArray(msg.d)) boomerang(vec(msg.p), vec(msg.d), false);
        break;
      case 'op3:abduct':
        abduct(msg.target, Math.min(+msg.t || 3, 5));
        if (msg.target === me) game.chat(`🛸 ${nameOf(msg.from)} had you abducted!`, true);
        break;
      case 'op3:firework':
        if (Array.isArray(msg.p) && Array.isArray(msg.v)) firework(vec(msg.p), vec(msg.v), false);
        break;
      case 'op3:cloud':
        if (Array.isArray(msg.p)) stormCloud(vec(msg.p), Math.min(+msg.t || 8, 10), false);
        break;
      case 'op3:clones':
        if (Array.isArray(msg.p)) {
          const rp = remotes.players.get(msg.from);
          spawnClones(msg.from, vec(msg.p), +msg.seed || 1, rp?.color ?? 0xffffff, rp?.name || '');
        }
        break;
      case 'op3:cloneGone':
        removeClone(msg.id);
        break;
      case 'op3:ice':
        if (Array.isArray(msg.p)) iceField(vec(msg.p), Math.min(+msg.t || 12, 20));
        break;
      case 'op3:sonic':
        if (Array.isArray(msg.p)) sonicBoom(vec(msg.p), msg.from);
        break;
      case 'op3:float':
        balloons(msg.target, Math.min(+msg.t || 5, 8));
        break;
      case 'op3:shrink':
        shrink(msg.target, Math.min(+msg.t || 10, 15));
        if (msg.target === me) game.chat(`🍄 ${nameOf(msg.from)} shrank you!`, true);
        break;
      case 'op3:anchor':
        giveStatus('anchor', msg.target, Math.min(+msg.t || 6, 10));
        if (msg.target === me) game.chat(`⚓ ${nameOf(msg.from)} anchored you!`, true);
        break;
      case 'op3:c4':
        if (typeof msg.id === 'string' && Array.isArray(msg.p)) addCharge(msg.id, vec(msg.p), msg.from);
        break;
      case 'op3:c4Gone':
        removeCharge(msg.id);
        break;
      case 'op3:dark':
        if (Array.isArray(msg.p) && game.player && game.player.position.distanceTo(vec(msg.p)) < 25) {
          darkUntil = nowS() + 4;
          game.chat(`🌑 ${nameOf(msg.from)} blinded you!`, true);
        }
        break;
      case 'op3:punch':
        if (Array.isArray(msg.a)) op.puffFx(vec(msg.a), 0xff7a1a);
        break;
    }
  });
  net.on('close', () => {
    for (const id of [...clones.keys()]) removeClone(id);
    for (const id of [...charges.keys()]) removeCharge(id);
    status.clear();
    darkUntil = 0;
  });

  // ---------- Per frame ----------
  let prevPos = null;
  let punchUntil = 0;
  const punched = new Set();
  game.addSystem((dt, game) => {
    const player = game.player;
    const p = player.position;
    const me = net.id;
    const t = nowS();

    for (let i = effects.length - 1; i >= 0; i--) if (!effects[i](dt)) effects.splice(i, 1);

    // ----- Status effects on me -----
    // Shrunk / anchored: you only cover part of the distance you'd normally move
    const slow = hasStatus('anchor', me) ? 0.35 : hasStatus('shrink', me) ? 0.55 : 1;
    // (skip teleports: portals, respawns)
    if (prevPos && slow < 1 && prevPos.distanceToSquared(p) < 25) {
      p.x = prevPos.x + (p.x - prevPos.x) * slow;
      p.z = prevPos.z + (p.z - prevPos.z) * slow;
    }
    // Anchored: no jumping, extra heavy
    if (hasStatus('anchor', me) && !player.launched && player.velocity.y * -player.gravityDir > 0) player.velocity.y = 0;
    // Abducted: float up the beam. Balloons: drift up slowly.
    if (hasStatus('abduct', me)) {
      player.velocity.y = 7;
      player.onGround = false;
    } else if (hasStatus('float', me)) {
      player.velocity.y = Math.max(player.velocity.y, 2.5);
      player.onGround = false;
    }
    prevPos = (prevPos || new THREE.Vector3()).copy(p);

    // Shrink: scale bodies (yours too, for your shadow) and lower your eyes
    const myScale = hasStatus('shrink', me) ? 0.4 : 1;
    player.mesh.scale.setScalar(myScale);
    CONFIG.eyeHeight = myScale < 1 ? 0.7 : baseEye;
    for (const rp of remotes.players.values()) rp.mesh.scale.setScalar(hasStatus('shrink', rp.id) ? 0.4 : 1);

    // Ice: no grip while standing on a field
    let onIce = false;
    for (let i = iceFields.length - 1; i >= 0; i--) {
      const f = iceFields[i];
      if (t > f.until) {
        drop(f.mesh);
        iceFields.splice(i, 1);
        continue;
      }
      const dx = p.x - f.p.x, dz = p.z - f.p.z;
      if (dx * dx + dz * dz < f.r * f.r && Math.abs(p.y - f.p.y) < 2) onIce = true;
    }
    CONFIG.groundFriction = onIce ? 0.4 : baseGrip.groundFriction;
    CONFIG.groundAccel = onIce ? 6 : baseGrip.groundAccel;

    // Darkness
    darkEl.style.opacity = t < darkUntil ? '1' : '0';

    // Falcon punch: hit everyone you plow through
    if (t < punchUntil) {
      for (const { player: rp } of combat.playersInRadius(p.clone().setY(p.y + 1), 2.2)) {
        if (punched.has(rp.id)) continue;
        punched.add(rp.id);
        _v.set(player.velocity.x, 0, player.velocity.z).normalize();
        op.hurt(rp.id, 45, [_v.x * 40, 14, _v.z * 40]);
        game.chat(`👊 FALCON PUNCH on ${rp.name}!`, true);
      }
    }

    // Decoy clones run off; get too close to someone else's and it explodes
    for (const [id, c] of clones) {
      c.t += dt;
      const moving = c.t < 10;
      if (moving) {
        c.mesh.position.copy(c.start).addScaledVector(c.dir, c.speed * Math.min(c.t, 10));
        c.mesh.position.y = Math.max(c.start.y, game.world.terrain.groundHeight(c.mesh.position.x, c.mesh.position.z));
        c.mesh.rotation.y = Math.atan2(-c.dir.x, -c.dir.z);
      }
      animateCharacter(c.mesh, moving ? c.speed : 0, true, dt);
      if (c.t > 25) {
        removeClone(id);
        continue;
      }
      // Armed after a second, once they've spread out from their owner
      if (c.owner !== me && c.t > 1 && c.mesh.position.distanceTo(p) < 1.8) {
        const at = c.mesh.position.clone();
        removeClone(id);
        net.sendEvent({ kind: 'op3:cloneGone', id });
        op.boomAll(at, 6, 0, 0);
        _v.copy(p).sub(at).setY(0).normalize();
        player.applyKnockback([_v.x * 22, 14, _v.z * 22]);
        player.takeDamage(45, nameOf(c.owner));
        game.chat(`🪞 That was a decoy of ${nameOf(c.owner)}!`, true);
      }
    }

    // C4 lights blink
    for (const c of charges.values()) c.led.visible = Math.sin(t * 8) > 0;
  });
  const baseEye = CONFIG.eyeHeight;

  // ============================================================
  //                        THE ITEMS
  // ============================================================

  registerItem({
    id: 'whale-drop',
    name: 'Whale Drop',
    icon: '🐋',
    description: 'A whale falls out of the sky where you aim. Massive splash damage.',
    cooldown: 6,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = op.aimPoint(origin, dir, 150);
      whaleDrop(p);
      net.sendEvent({ kind: 'op3:whale', p: arr(p) });
      setTimeout(() => op.boomAll(p, 12, 85, 40, { color: 0x6fb6ff }), 1300);
      game.chat('🐋 Incoming whale!', true);
    },
  });

  registerItem({
    id: 'boomerang',
    name: 'Boomerang',
    icon: '🪃',
    description: 'Flies out 26m and comes back, hitting everyone on the way both times.',
    cooldown: 2.4,
    anim: 'swing',
    use({ origin, flatDir }) {
      const p = origin.clone();
      p.y -= 0.4;
      boomerang(p, flatDir.clone(), true);
      net.sendEvent({ kind: 'op3:boomerang', p: arr(p), d: arr(flatDir) });
    },
  });

  registerItem({
    id: 'ufo-abduction',
    name: 'UFO Abduction',
    icon: '🛸',
    description: 'A UFO beams up whoever you aim at for 3 seconds, then drops them.',
    cooldown: 6,
    anim: 'recoil',
    use({ origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 120, 7)[0];
      if (!hit) return game.chat('🛸 Aim at someone to abduct them', true);
      abduct(hit.player.id, 3);
      net.sendEvent({ kind: 'op3:abduct', target: hit.player.id, t: 3 });
    },
  });

  registerItem({
    id: 'firework-launcher',
    name: 'Firework Launcher',
    icon: '🎆',
    description: 'Fires fireworks that burst in the sky. Pretty, and they hurt.',
    cooldown: 0.8,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = origin.clone().addScaledVector(dir, 1);
      const v = dir.clone().multiplyScalar(30);
      firework(p, v, true);
      net.sendEvent({ kind: 'op3:firework', p: arr(p), v: arr(v) });
    },
  });

  registerItem({
    id: 'storm-cloud',
    name: 'Storm Cloud',
    icon: '⛈️',
    description: 'A thundercloud where you aim. Zaps anyone under it for 8 seconds.',
    cooldown: 10,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = op.aimPoint(origin, dir, 120);
      stormCloud(p, 8, true);
      net.sendEvent({ kind: 'op3:cloud', p: arr(p), t: 8 });
    },
  });

  registerItem({
    id: 'decoy-clones',
    name: 'Decoy Clones',
    icon: '🪞',
    description: '4 fake copies of you run off. Anyone who gets close to one gets blown up.',
    cooldown: 8,
    anim: 'recoil',
    use({ player }) {
      const seed = Math.floor(Math.random() * 1e9);
      const color = player.mesh.userData.body?.material.color.getHex() ?? 0xffffff;
      spawnClones(net.id, player.position, seed, color, player.name);
      net.sendEvent({ kind: 'op3:clones', p: arr(player.position), seed });
      game.chat('🪞 Decoys deployed', true);
    },
  });

  registerItem({
    id: 'ice-field',
    name: 'Ice Field',
    icon: '⛸️',
    description: 'Turns the ground where you aim into slippery ice for 12 seconds.',
    cooldown: 5,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = op.aimPoint(origin, dir, 80);
      iceField(p, 12);
      net.sendEvent({ kind: 'op3:ice', p: arr(p), t: 12 });
    },
  });

  registerItem({
    id: 'sonic-boom',
    name: 'Sonic Boom',
    icon: '🔊',
    description: 'A shockwave ring blasts everyone within 32m away from you.',
    cooldown: 5,
    anim: 'blow',
    use({ player }) {
      sonicBoom(player.position.clone(), net.id);
      net.sendEvent({ kind: 'op3:sonic', p: arr(player.position) });
    },
  });

  registerItem({
    id: 'giant-axe',
    name: 'Giant Axe',
    icon: '🪓',
    description: '360° spin attack. Hits everyone within 7m.',
    cooldown: 1.5,
    anim: 'swing',
    use({ player }) {
      const c = player.position.clone().setY(player.position.y + 1);
      for (const { player: rp } of combat.playersInRadius(c, 7)) {
        _v.copy(rp.mesh.position).sub(c).setY(0).normalize();
        op.hurt(rp.id, 40, [_v.x * 26, 10, _v.z * 26]);
      }
      op.puffFx(c, 0xd0d6dc);
      net.sendEvent({ kind: 'op:blink', a: arr(c) });
    },
  });

  registerItem({
    id: 'shrink-ray',
    name: 'Shrink Ray',
    icon: '🍄',
    description: 'Shrinks whoever you aim at (tiny and slow) for 10 seconds.',
    cooldown: 3,
    anim: 'recoil',
    use({ origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 80, 7)[0];
      const end = hit ? combat.bodyCenter(hit.player) : op.aimPoint(origin, dir, 80);
      op.beamFx(origin.clone().addScaledVector(dir, 0.8), end, 0.25);
      if (!hit) return;
      shrink(hit.player.id, 10);
      net.sendEvent({ kind: 'op3:shrink', target: hit.player.id, t: 10 });
    },
  });

  registerItem({
    id: 'balloon-gun',
    name: 'Balloon Gun',
    icon: '🎈',
    description: 'Ties balloons to whoever you aim at. They float away for 5 seconds.',
    cooldown: 3,
    anim: 'recoil',
    use({ origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 80, 7)[0];
      if (!hit) return;
      balloons(hit.player.id, 5);
      net.sendEvent({ kind: 'op3:float', target: hit.player.id, t: 5 });
    },
  });

  registerItem({
    id: 'falcon-punch',
    name: 'Falcon Punch',
    icon: '👊',
    description: 'Dash forward and punch through everyone in your way.',
    cooldown: 2,
    anim: 'swing',
    use({ player, flatDir }) {
      player.applyKnockback([flatDir.x * 42, 3, flatDir.z * 42]);
      punchUntil = nowS() + 0.55;
      punched.clear();
      const a = player.position.clone().setY(player.position.y + 1);
      op.puffFx(a, 0xff7a1a);
      net.sendEvent({ kind: 'op3:punch', a: arr(a) });
      game.chat('👊 FALCON... PUNCH!', true);
    },
  });

  registerItem({
    id: 'anchor',
    name: 'Anchor',
    icon: '⚓',
    description: 'Whoever you aim at gets too heavy to jump or run for 6 seconds.',
    cooldown: 3,
    anim: 'swing',
    use({ origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 60, 7)[0];
      if (!hit) return;
      giveStatus('anchor', hit.player.id, 6);
      net.sendEvent({ kind: 'op3:anchor', target: hit.player.id, t: 6 });
      op.beamFx(origin.clone().addScaledVector(dir, 0.8), combat.bodyCenter(hit.player), 0.2);
    },
  });

  registerItem({
    id: 'sticky-c4',
    name: 'Sticky C4',
    icon: '🧷',
    description: 'Left click: throw a charge that sticks (as many as you like). Right click: blow them all up.',
    cooldown: 0, // no cooldown, no limit on charges
    anim: 'swing',
    use({ player, origin, dir }) {
      const v = dir.clone().multiplyScalar(20).add(new THREE.Vector3(0, -player.gravityDir * 3, 0));
      op.fire('c4', origin.clone().addScaledVector(dir, 1), v, CONFIG.gravity * -player.gravityDir, (hit) => {
        const id = newId('c4');
        addCharge(id, hit, net.id);
        myCharges.push(id);
        net.sendEvent({ kind: 'op3:c4', id, p: arr(hit) });
      });
    },
    altUse() {
      for (const id of myCharges.splice(0)) {
        const c = charges.get(id);
        if (!c) continue;
        removeCharge(id);
        net.sendEvent({ kind: 'op3:c4Gone', id });
        op.boomAll(c.p, 8, 70, 34);
      }
    },
  });

  registerItem({
    id: 'darkness-bomb',
    name: 'Darkness Bomb',
    icon: '🌑',
    description: 'Everyone within 25m of where you aim goes blind for 4 seconds.',
    cooldown: 8,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = op.aimPoint(origin, dir, 100);
      net.sendEvent({ kind: 'op3:dark', p: arr(p) });
      op.puffFx(p, 0x111111);
      net.sendEvent({ kind: 'op:blink', a: arr(p) });
      game.chat('🌑 Lights out.', true);
    },
  });
}
