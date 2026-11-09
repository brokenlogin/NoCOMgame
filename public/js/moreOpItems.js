// 20 MORE overpowered items (all in the Tab item spawner). Built on the helpers from
// opItems.js (game.opItems: boomAll, hurt, fire, aimPoint, beamFx, boltFx, puffFx, freezeFx...).
//
//   🔨 Mjolnir          throw it; lightning from the sky where it lands
//   🐉 Dragon Breath    hold to breathe fire
//   🧲 Mega Magnet      yank everyone within 40m to you
//   🌀 Portal Gun       left click: blue portal, right click: orange portal. Anyone can walk through
//   🌋 Volcano Staff    the ground where you aim erupts for 3 seconds
//   🧊 Ice Age          freezes everyone within 25m
//   ⏱️ Time Stop        freezes EVERYONE else for 5 seconds
//   🦈 Shark Launcher   fires an explosive shark
//   💥 Cluster Bomb     one big boom, then 8 more around it
//   🌊 Tsunami          a giant wave washes everyone away
//   🎯 Railgun          instant shot that goes through everyone in a line
//   🪐 Gravity Bomb     sucks everyone in, then blows them out
//   👻 Ghost Cloak      invisible (and untargetable) for 8 seconds
//   🥾 Moon Boots       giant jumps for 12 seconds
//   ⚡ Flash Potion     super speed for 10 seconds
//   🧱 Insta-Wall       a solid wall in front of you
//   🌈 Rainbow Bridge   a 45m bridge wherever you look
//   💣 Land Mine        drop it; it blows up when someone else walks near
//   🐝 Bee Swarm        a swarm chases the nearest player and stings them
//   🔁 Swap Ray         swap places with whoever you aim at
//
// New events: op2:flame, op2:portal, op2:wave, op2:gbomb, op2:build, op2:mine, op2:mineGone,
// op2:bees, op2:swap. Like the other OP items, each player applies hits to themselves.

import * as THREE from 'three';
import { registerItem } from './items.js';

const round = (n) => Math.round(n * 1000) / 1000;
const arr = (v) => v.toArray().map(round);
const vec = (a) => new THREE.Vector3().fromArray(a);

export function setupMoreOpItems(game) {
  const { scene, net, combat, CONFIG, world, remotes } = game;
  const op = game.opItems;
  const nowS = () => performance.now() / 1000;
  const nameOf = (id) => (id === net.id ? game.player?.name : remotes.players.get(id)?.name) || 'someone';
  let uid = 0;
  const newId = (tag) => `${net.id}-${tag}${++uid}`;

  // ---------- Projectile looks ----------
  op.addProjectileLook('hammer', () => {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 }));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x6b4423 }));
    handle.position.y = -0.4;
    g.add(head, handle);
    return g;
  });
  op.addProjectileLook('shark', () => {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x6e8ca8, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 6, 14), skin);
    body.rotation.x = Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), skin);
    fin.position.set(0, 0.45, 0.1);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), skin);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = 1.0;
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mouth.position.set(0, -0.12, -0.75);
    g.add(body, fin, tail, mouth);
    return g;
  });
  op.addProjectileLook('cluster', () =>
    new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, emissive: 0xff3300, emissiveIntensity: 0.4 }))
  );

  // Top of whatever is under a point (terrain, platforms, buildings), or null
  const _down = new THREE.Vector3(0, -1, 0);
  const _ray = new THREE.Raycaster();
  function surfaceBelow(p, maxDrop = 40) {
    _ray.set(p.clone().setY(p.y + 2), _down);
    _ray.far = maxDrop + 2;
    return _ray.intersectObjects(world.colliders, false)[0]?.point || null;
  }

  // ---------- Small effect helpers ----------
  const effects = [];
  const sharedGeo = { ball: new THREE.SphereGeometry(1, 10, 8), bee: new THREE.SphereGeometry(0.09, 6, 4) };

  // Particles flying out along a direction (fire breath)
  function flameFx(a, d) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(sharedGeo.ball, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7a1a : 0xffd23d, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.copy(a);
      scene.add(m);
      const v = d.clone().multiplyScalar(14 + Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      let t = 0;
      effects.push(() => {
        t += 1 / 60;
        m.position.addScaledVector(v, 1 / 60);
        m.scale.setScalar(0.15 + t * 2.2);
        m.material.opacity = Math.max(0, 0.85 - t * 1.6);
        if (t < 0.55) return true;
        scene.remove(m);
        m.material.dispose();
        return false;
      });
    }
  }

  // Throbbing sphere (gravity bomb, volcano glow)
  function orbFx(p, color, life, grow) {
    const m = new THREE.Mesh(sharedGeo.ball, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.copy(p);
    scene.add(m);
    let t = 0;
    effects.push(() => {
      t += 1 / 60;
      m.scale.setScalar(grow(t) * (1 + Math.sin(t * 20) * 0.08));
      if (t < life) return true;
      scene.remove(m);
      m.material.dispose();
      return false;
    });
  }

  // ---------- Timed boosts on yourself (moon boots, flash potion) ----------
  const base = { jumpVelocity: CONFIG.jumpVelocity, walkSpeed: CONFIG.walkSpeed, sprintSpeed: CONFIG.sprintSpeed };
  const boosts = { moon: 0, flash: 0 }; // end times
  function applyBoosts() {
    const t = nowS();
    CONFIG.jumpVelocity = t < boosts.moon ? base.jumpVelocity * 2.3 : base.jumpVelocity;
    CONFIG.walkSpeed = t < boosts.flash ? base.walkSpeed * 2.6 : base.walkSpeed;
    CONFIG.sprintSpeed = t < boosts.flash ? base.sprintSpeed * 2.8 : base.sprintSpeed;
  }

  // ---------- Temporary blocks (walls, bridges) ----------
  const builds = new Map(); // id -> { meshes, boxes, until }
  function build(id, boxes, life, solid) {
    if (builds.has(id)) return;
    const meshes = [], solids = [];
    for (const [x, y, z, w, h, d, color, ry = 0] of boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      world.colliders.push(m);
      meshes.push(m);
      if (solid) {
        m.updateMatrixWorld();
        const b = new THREE.Box3().setFromObject(m);
        world.solidBoxes.push(b);
        solids.push(b);
      }
    }
    builds.set(id, { meshes, solids, until: nowS() + life });
  }
  function unbuild(id) {
    const b = builds.get(id);
    if (!b) return;
    for (const m of b.meshes) {
      scene.remove(m);
      const k = world.colliders.indexOf(m);
      if (k >= 0) world.colliders.splice(k, 1);
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const s of b.solids) {
      const k = world.solidBoxes.indexOf(s);
      if (k >= 0) world.solidBoxes.splice(k, 1);
    }
    builds.delete(id);
  }
  function buildAll(boxes, life, solid) {
    const id = newId('b');
    build(id, boxes, life, solid);
    net.sendEvent({ kind: 'op2:build', id, boxes, life, solid: solid ? 1 : 0 });
  }

  // ---------- Portals ----------
  const portals = new Map(); // owner -> { a, b }  (each { p, mesh })
  let portalCooldown = 0;
  function placePortal(owner, slot, p, yaw) {
    let pair = portals.get(owner);
    if (!pair) portals.set(owner, (pair = {}));
    if (pair[slot]) scene.remove(pair[slot].mesh);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.12, 10, 32),
      new THREE.MeshBasicMaterial({ color: slot === 'a' ? 0x3aa0ff : 0xff9a2a })
    );
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 28),
      new THREE.MeshBasicMaterial({ color: slot === 'a' ? 0x9ad0ff : 0xffd09a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    const mesh = new THREE.Group();
    mesh.add(ring, fill);
    mesh.position.copy(p).y += 1.2;
    mesh.rotation.y = yaw;
    scene.add(mesh);
    pair[slot] = { p: p.clone(), mesh };
  }
  function clearPortals(owner) {
    const pair = portals.get(owner);
    if (!pair) return;
    for (const s of ['a', 'b']) if (pair[s]) scene.remove(pair[s].mesh);
    portals.delete(owner);
  }
  function portalUse({ player, origin, dir }, slot) {
    // Stand the portal on whatever is under where you aimed
    const aim = op.aimPoint(origin, dir, 80).addScaledVector(dir, -0.8);
    const p = surfaceBelow(aim) || aim;
    const yaw = Math.atan2(dir.x, dir.z);
    placePortal(net.id, slot, p, yaw);
    net.sendEvent({ kind: 'op2:portal', slot, p: arr(p), yaw: round(yaw) });
  }

  // ---------- Waves ----------
  const waves = []; // { mesh, p, d, t, hit }
  const WAVE = { speed: 20, life: 4, width: 34, height: 9, depth: 4 };
  function startWave(p, d) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(WAVE.width, WAVE.height, WAVE.depth),
      new THREE.MeshStandardMaterial({ color: 0x2f8dd8, transparent: true, opacity: 0.7, emissive: 0x0d4a80, emissiveIntensity: 0.4 })
    );
    mesh.rotation.y = Math.atan2(d.x, d.z);
    scene.add(mesh);
    waves.push({ mesh, p: p.clone(), d: d.clone().setY(0).normalize(), t: 0, hit: false });
  }

  // ---------- Gravity bombs ----------
  const wells = []; // { p, until }

  // ---------- Mines ----------
  const mines = new Map(); // id -> { mesh, p, owner, at }
  function addMine(id, p, owner) {
    if (mines.has(id)) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.15, 16), new THREE.MeshStandardMaterial({ color: 0x3b4436, roughness: 0.7 }));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    light.position.y = 0.1;
    g.add(body, light);
    g.position.copy(p).y += 0.07;
    scene.add(g);
    mines.set(id, { mesh: g, light, p: p.clone(), owner, at: nowS() });
  }
  function removeMine(id) {
    const m = mines.get(id);
    if (!m) return;
    scene.remove(m.mesh);
    m.mesh.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    mines.delete(id);
  }

  // ---------- Bees ----------
  const swarms = []; // { target, until, bees: [mesh], from, tick }
  function startSwarm(target, from, secs) {
    const bees = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(sharedGeo.bee, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd23d : 0x222222 }));
      scene.add(m);
      bees.push({ m, a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 0.8, h: 0.5 + Math.random() * 1.6, s: 4 + Math.random() * 6 });
    }
    swarms.push({ target, from, until: nowS() + secs, bees, tick: 0 });
  }

  // ---------- Network ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'op2:flame':
        if (Array.isArray(msg.a) && Array.isArray(msg.d)) flameFx(vec(msg.a), vec(msg.d));
        break;
      case 'op2:portal':
        if (Array.isArray(msg.p) && (msg.slot === 'a' || msg.slot === 'b')) placePortal(msg.from, msg.slot, vec(msg.p), +msg.yaw || 0);
        break;
      case 'op2:wave':
        if (Array.isArray(msg.p) && Array.isArray(msg.d)) startWave(vec(msg.p), vec(msg.d));
        break;
      case 'op2:gbomb':
        if (Array.isArray(msg.p)) {
          wells.push({ p: vec(msg.p), until: nowS() + 2.5 });
          orbFx(vec(msg.p), 0x5a2a9a, 2.5, (t) => 1 + t * 2);
        }
        break;
      case 'op2:build':
        if (typeof msg.id === 'string' && Array.isArray(msg.boxes)) build(msg.id, msg.boxes.slice(0, 60), Math.min(+msg.life || 10, 60), !!msg.solid);
        break;
      case 'op2:mine':
        if (typeof msg.id === 'string' && Array.isArray(msg.p)) addMine(msg.id, vec(msg.p), msg.from);
        break;
      case 'op2:mineGone':
        removeMine(msg.id);
        break;
      case 'op2:bees':
        startSwarm(msg.target, msg.from, Math.min(+msg.t || 6, 10));
        if (msg.target === net.id) game.chat(`🐝 ${nameOf(msg.from)} set bees on you! RUN!`, true);
        break;
      case 'op2:swap':
        if (msg.target === net.id && game.player && Array.isArray(msg.p)) {
          game.player.position.fromArray(msg.p);
          game.player.velocity.set(0, 0, 0);
          op.puffFx(game.player.position, 0x7affc8);
          game.chat(`🔁 ${nameOf(msg.from)} swapped places with you!`, true);
        }
        break;
    }
  });
  net.on('playerLeft', ({ id }) => clearPortals(id));
  net.on('close', () => {
    for (const id of [...builds.keys()]) unbuild(id);
    for (const id of [...mines.keys()]) removeMine(id);
    for (const owner of [...portals.keys()]) clearPortals(owner);
    boosts.moon = boosts.flash = 0;
    applyBoosts();
  });

  // ---------- Per frame ----------
  const _d = new THREE.Vector3();
  game.addSystem((dt, game) => {
    const player = game.player;
    const p = player.position;
    const t = nowS();

    for (let i = effects.length - 1; i >= 0; i--) if (!effects[i]()) effects.splice(i, 1);
    applyBoosts();

    // Builds expire
    for (const [id, b] of builds) if (t > b.until) unbuild(id);

    // Portals: step into one and come out of its partner
    portalCooldown = Math.max(0, portalCooldown - dt);
    for (const pair of portals.values()) {
      pair.a?.mesh.children[1].rotateZ(dt);
      pair.b?.mesh.children[1].rotateZ(dt);
      if (!pair.a || !pair.b || portalCooldown > 0) continue;
      for (const [from, to] of [[pair.a, pair.b], [pair.b, pair.a]]) {
        const dx = p.x - from.p.x, dz = p.z - from.p.z, dy = p.y - from.p.y;
        if (dx * dx + dz * dz < 1.2 ** 2 && dy > -0.5 && dy < 2.5) {
          const out = to.p.clone();
          const yaw = to.mesh.rotation.y;
          out.x -= Math.sin(yaw) * 1.6;
          out.z -= Math.cos(yaw) * 1.6;
          p.copy(out).y += 0.3;
          op.puffFx(out, 0x9ad0ff);
          portalCooldown = 1;
          break;
        }
      }
    }

    // Waves sweep forward; get hit once per wave
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.t += dt;
      const c = w.p.clone().addScaledVector(w.d, w.t * WAVE.speed);
      const gy = game.world.terrain.groundHeight(c.x, c.z);
      c.y = Math.max(w.p.y, gy) + WAVE.height / 2 - 1;
      w.mesh.position.copy(c);
      w.mesh.scale.y = Math.min(1, w.t * 3) * (1 - Math.max(0, w.t - WAVE.life + 0.6) / 0.6);
      if (!w.hit) {
        _d.copy(p).sub(c);
        const along = _d.x * w.d.x + _d.z * w.d.z;
        const side = Math.abs(_d.x * w.d.z - _d.z * w.d.x);
        if (Math.abs(along) < WAVE.depth / 2 + 0.6 && side < WAVE.width / 2 && Math.abs(_d.y) < WAVE.height / 2 + 1) {
          w.hit = true;
          player.applyKnockback([w.d.x * 30, 10, w.d.z * 30]);
          player.takeDamage(20, 'a tsunami');
        }
      }
      if (w.t > WAVE.life) {
        scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mesh.material.dispose();
        waves.splice(i, 1);
      }
    }

    // Gravity wells pull you in
    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      if (t > w.until) {
        wells.splice(i, 1);
        continue;
      }
      _d.copy(w.p).sub(p);
      const d = _d.length();
      if (d < 20 && d > 0.5) {
        _d.normalize();
        player.velocity.addScaledVector(_d, 45 * dt);
        player.onGround = false;
      }
    }

    // Mines: blow up when someone else (that's you, on your screen) walks close
    for (const [id, m] of mines) {
      const armed = t - m.at > 1.5;
      m.light.visible = armed ? Math.sin(t * 10) > 0 : true;
      if (!armed || m.owner === net.id) continue;
      if (p.distanceTo(m.p) < 2.2) {
        removeMine(id);
        net.sendEvent({ kind: 'op2:mineGone', id });
        // Everyone sees the boom; the damage is mine, credited to whoever laid it
        op.boomAll(m.p, 7, 0, 0);
        _d.copy(p).sub(m.p).setY(0);
        if (_d.lengthSq() < 1e-4) _d.set(1, 0, 0);
        _d.normalize();
        player.applyKnockback([_d.x * 24, 22, _d.z * 24]);
        player.takeDamage(75, nameOf(m.owner));
        break;
      }
    }

    // Bees buzz around their target; the target takes the stings
    for (let i = swarms.length - 1; i >= 0; i--) {
      const s = swarms[i];
      const tp = s.target === net.id ? p : remotes.players.get(s.target)?.mesh.position;
      const done = t > s.until || !tp;
      for (const b of s.bees) {
        if (done) {
          scene.remove(b.m);
          b.m.material.dispose();
          continue;
        }
        b.a += b.s * dt;
        b.m.position.set(tp.x + Math.cos(b.a) * b.r, tp.y + b.h + Math.sin(b.a * 2) * 0.2, tp.z + Math.sin(b.a) * b.r);
      }
      if (done) {
        swarms.splice(i, 1);
        continue;
      }
      if (s.target === net.id) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick = 0.5;
          player.takeDamage(6, nameOf(s.from));
        }
      }
    }

    // Ghost cloak: hide cloaked players
    for (const rp of remotes.players.values()) if (rp.state?.cloak) rp.mesh.visible = false;
    if (player.extraState.cloak && t > cloakUntil) {
      delete player.extraState.cloak;
      cloakEl.style.opacity = '0';
      game.chat('👻 You are visible again.', true);
    }
  });

  let cloakUntil = 0;
  const cloakEl = document.createElement('div');
  Object.assign(cloakEl.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.4s',
    boxShadow: 'inset 0 0 140px 40px rgba(150, 190, 255, 0.45)',
  });
  document.getElementById('hud').appendChild(cloakEl);

  // ============================================================
  //                        THE ITEMS
  // ============================================================

  registerItem({
    id: 'mjolnir',
    name: 'Mjolnir',
    icon: '🔨',
    description: 'Throw it. Lightning strikes from the sky where it lands.',
    cooldown: 1.5,
    anim: 'swing',
    use({ player, origin, dir }) {
      const v = dir.clone().multiplyScalar(40);
      op.fire('hammer', origin.clone().addScaledVector(dir, 1), v, 10 * -player.gravityDir, (hit) => {
        const pts = [hit.clone().setY(hit.y + 120), hit.clone().setY(hit.y + 60).add(new THREE.Vector3(3, 0, -2)), hit];
        op.boltFx(pts);
        net.sendEvent({ kind: 'op:bolt', pts: pts.map(arr) });
        op.boomAll(hit, 8, 65, 35, { color: 0x9fd8ff });
      });
    },
  });

  registerItem({
    id: 'dragon-breath',
    name: 'Dragon Breath',
    icon: '🐉',
    description: 'Hold to breathe fire. Burns everyone in front of you.',
    anim: 'blow',
    hold({ origin, dir, flatDir }, dt, state) {
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 0.1;
      const a = origin.clone().addScaledVector(dir, 0.9);
      a.y -= 0.2;
      flameFx(a, dir);
      net.sendEvent({ kind: 'op2:flame', a: arr(a), d: arr(dir) });
      for (const { player: rp } of combat.playersInCone(origin, dir, 11, 22)) op.hurt(rp.id, 5, [flatDir.x * 3, 1.5, flatDir.z * 3]);
    },
  });

  registerItem({
    id: 'mega-magnet',
    name: 'Mega Magnet',
    icon: '🧲',
    description: 'Yanks everyone within 40m right to you.',
    cooldown: 4,
    anim: 'recoil',
    use({ player }) {
      const me = player.position;
      let n = 0;
      for (const { player: rp, dist } of combat.playersInRadius(me, 40)) {
        _d.copy(me).sub(rp.mesh.position).setY(0).normalize();
        const s = Math.min(40, 8 + dist * 1.1);
        combat.knockback(rp.id, [_d.x * s, 7, _d.z * s]);
        n++;
      }
      op.puffFx(me.clone().setY(me.y + 1), 0xff3a3a);
      game.chat(n ? `🧲 Pulled in ${n} player${n > 1 ? 's' : ''}` : '🧲 Nobody to pull', true);
    },
  });

  registerItem({
    id: 'portal-gun',
    name: 'Portal Gun',
    icon: '🌀',
    description: 'Left click: blue portal. Right click: orange portal. Anyone can walk through them.',
    cooldown: 0.4,
    anim: 'recoil',
    use: (ctx) => portalUse(ctx, 'a'),
    altUse: (ctx) => portalUse(ctx, 'b'),
  });

  registerItem({
    id: 'volcano-staff',
    name: 'Volcano Staff',
    icon: '🌋',
    description: 'The ground where you aim erupts for 3 seconds.',
    cooldown: 6,
    anim: 'recoil',
    use({ origin, dir }) {
      const c = op.aimPoint(origin, dir, 120);
      orbFx(c, 0xff4a10, 3, (t) => 2 + t);
      for (let i = 0; i < 9; i++) {
        setTimeout(() => {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
          const p = new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
          op.boomAll(p, 5, 30, 26, { color: 0xff5a1a });
        }, i * 330);
      }
      game.chat('🌋 ERUPTION!', true);
    },
  });

  registerItem({
    id: 'ice-age',
    name: 'Ice Age',
    icon: '🧊',
    description: 'Freezes everyone within 25m solid for 4 seconds.',
    cooldown: 10,
    anim: 'recoil',
    use({ player }) {
      const hits = combat.playersInRadius(player.position, 25);
      for (const { player: rp } of hits) {
        net.sendEvent({ kind: 'op:freeze', target: rp.id, t: 4 });
        op.freezeFx(rp.id, 4);
      }
      op.puffFx(player.position.clone().setY(player.position.y + 1), 0xaee6ff);
      op.screenFlash('rgba(190,230,255,0.4)', 1, 0.8);
      game.chat(`🧊 Froze ${hits.length} player${hits.length === 1 ? '' : 's'}`, true);
    },
  });

  registerItem({
    id: 'time-stop',
    name: 'Time Stop',
    icon: '⏱️',
    description: 'ZA WARUDO. Everyone else is frozen for 5 seconds. 30s cooldown.',
    cooldown: 30,
    anim: 'recoil',
    use() {
      for (const id of remotes.players.keys()) {
        net.sendEvent({ kind: 'op:freeze', target: id, t: 5 });
        op.freezeFx(id, 5);
      }
      op.screenFlash('rgba(120,120,140,0.6)', 1, 5);
      game.chat('⏱️ Time has stopped.', true);
    },
  });

  registerItem({
    id: 'shark-launcher',
    name: 'Shark Launcher',
    icon: '🦈',
    description: 'Fires an explosive shark. Direct hits get chomped too.',
    cooldown: 1.2,
    anim: 'recoil',
    use({ origin, dir }) {
      op.fire('shark', origin.clone().addScaledVector(dir, 1.2), dir.clone().multiplyScalar(34), 6, (hit, playerId) => {
        if (playerId !== undefined) {
          op.hurt(playerId, 35);
          game.chat(`🦈 CHOMP! You got ${nameOf(playerId)}`, true);
        }
        op.boomAll(hit, 6, 50, 30, { color: 0x7ad0ff });
      });
    },
  });

  registerItem({
    id: 'cluster-bomb',
    name: 'Cluster Bomb',
    icon: '💥',
    description: 'Throw it. One big boom, then 8 more all around it.',
    cooldown: 3,
    anim: 'swing',
    use({ player, origin, dir }) {
      const v = dir.clone().multiplyScalar(24).add(new THREE.Vector3(0, -player.gravityDir * 5, 0));
      op.fire('cluster', origin.clone().addScaledVector(dir, 1), v, CONFIG.gravity * -player.gravityDir, (hit) => {
        op.boomAll(hit, 6, 45, 26);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const p = new THREE.Vector3(hit.x + Math.cos(a) * 6, hit.y, hit.z + Math.sin(a) * 6);
          p.y = Math.max(p.y, game.world.terrain.groundHeight(p.x, p.z));
          setTimeout(() => op.boomAll(p, 4.5, 30, 20), 300 + Math.random() * 500);
        }
      });
    },
  });

  registerItem({
    id: 'tsunami',
    name: 'Tsunami',
    icon: '🌊',
    description: 'A giant wave rolls forward and washes everyone away.',
    cooldown: 8,
    anim: 'recoil',
    use({ player, flatDir }) {
      const p = player.position.clone().addScaledVector(flatDir, 4);
      startWave(p, flatDir);
      net.sendEvent({ kind: 'op2:wave', p: arr(p), d: arr(flatDir) });
    },
  });

  registerItem({
    id: 'railgun',
    name: 'Railgun',
    icon: '🎯',
    description: 'Instant shot that goes through everyone in a line. 70 damage.',
    cooldown: 1.6,
    anim: 'recoil',
    use({ origin, dir }) {
      const end = op.aimPoint(origin, dir, 250);
      const range = origin.distanceTo(end);
      const a = origin.clone().addScaledVector(dir, 0.8);
      op.beamFx(a, end, 0.35);
      net.sendEvent({ kind: 'op:beam', a: arr(a), b: arr(end) });
      for (const { player: rp, dist } of combat.playersInCone(origin, dir, range, 2)) {
        if (dist <= range + 1) op.hurt(rp.id, 70, [dir.x * 18, 6, dir.z * 18]);
      }
      op.boomAll(end, 2, 0, 0, { color: 0xff3030, quiet: true });
    },
  });

  registerItem({
    id: 'gravity-bomb',
    name: 'Gravity Bomb',
    icon: '🪐',
    description: 'Where you aim: sucks everyone within 20m in for 2.5s, then blows them away.',
    cooldown: 7,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = op.aimPoint(origin, dir, 100).addScaledVector(dir, -1);
      p.y += 1.5;
      wells.push({ p: p.clone(), until: nowS() + 2.5 });
      orbFx(p, 0x5a2a9a, 2.5, (t) => 1 + t * 2);
      net.sendEvent({ kind: 'op2:gbomb', p: arr(p) });
      setTimeout(() => op.boomAll(p, 10, 60, 45, { color: 0xb07aff }), 2500);
    },
  });

  registerItem({
    id: 'ghost-cloak',
    name: 'Ghost Cloak',
    icon: '👻',
    description: 'Turn invisible for 8 seconds. Invisible players can\'t be targeted.',
    cooldown: 20,
    anim: 'recoil',
    use({ player }) {
      cloakUntil = nowS() + 8;
      player.extraState.cloak = 1;
      cloakEl.style.opacity = '1';
      op.puffFx(player.position.clone().setY(player.position.y + 1), 0xdde6ff);
      net.sendEvent({ kind: 'op:blink', a: arr(player.position) });
      game.chat('👻 You vanish...', true);
    },
  });

  registerItem({
    id: 'moon-boots',
    name: 'Moon Boots',
    icon: '🥾',
    description: 'Giant jumps for 12 seconds.',
    cooldown: 15,
    anim: 'recoil',
    use() {
      boosts.moon = nowS() + 12;
      game.chat('🥾 Moon boots on! (12s)', true);
    },
  });

  registerItem({
    id: 'flash-potion',
    name: 'Flash Potion',
    icon: '⚡',
    description: 'Super speed for 10 seconds.',
    cooldown: 15,
    anim: 'recoil',
    use() {
      boosts.flash = nowS() + 10;
      op.screenFlash('rgba(255,230,90,0.35)', 1, 0.6);
      game.chat('⚡ Gotta go fast! (10s)', true);
    },
  });

  registerItem({
    id: 'insta-wall',
    name: 'Insta-Wall',
    icon: '🧱',
    description: 'A solid 10m wall pops up in front of you for 20 seconds.',
    cooldown: 2,
    anim: 'swing',
    use({ player, flatDir }) {
      const c = player.position.clone().addScaledVector(flatDir, 3);
      const bottom = Math.min(player.position.y, surfaceBelow(c, 4)?.y ?? player.position.y);
      // Solid boxes are axis-aligned, so build the wall out of small blocks along its length
      const boxes = [];
      const sideX = flatDir.z, sideZ = -flatDir.x;
      for (let i = -5; i < 5; i++) {
        boxes.push([round(c.x + sideX * (i + 0.5)), round(bottom + 2), round(c.z + sideZ * (i + 0.5)), 1.05, 4.5, 1.05, 0xb0573a, 0]);
      }
      buildAll(boxes, 20, true);
    },
  });

  registerItem({
    id: 'rainbow-bridge',
    name: 'Rainbow Bridge',
    icon: '🌈',
    description: 'Builds a 45m rainbow bridge where you look (up or down too). Lasts 25 seconds.',
    cooldown: 3,
    anim: 'recoil',
    use({ player, dir, flatDir }) {
      const slope = THREE.MathUtils.clamp(dir.y / Math.max(0.2, Math.hypot(dir.x, dir.z)), -0.5, 0.5);
      const yaw = Math.atan2(flatDir.x, flatDir.z);
      const colors = [0xff4d4d, 0xff9a3d, 0xffe14d, 0x4dd97a, 0x4da6ff, 0x9a6bff];
      const boxes = [];
      const STEP = 1.5;
      for (let i = 0; i < 30; i++) {
        const d = 1 + i * STEP;
        boxes.push([
          round(player.position.x + flatDir.x * d),
          round(player.position.y - 0.15 + slope * d),
          round(player.position.z + flatDir.z * d),
          3, 0.3, STEP + 0.1, colors[i % colors.length], round(yaw),
        ]);
      }
      buildAll(boxes, 25, false);
    },
  });

  registerItem({
    id: 'land-mine',
    name: 'Land Mine',
    icon: '💣',
    description: 'Drop it at your feet. Arms after 1.5s and blows up when anyone else gets close.',
    maxStack: 5,
    cooldown: 0.5,
    anim: 'swing',
    use({ player }) {
      const id = newId('m');
      const p = player.position.clone();
      addMine(id, p, net.id);
      net.sendEvent({ kind: 'op2:mine', id, p: arr(p) });
      game.inventory.remove('land-mine', 1);
    },
  });

  registerItem({
    id: 'bee-swarm',
    name: 'Bee Swarm',
    icon: '🐝',
    description: 'Releases bees on the nearest player within 50m. They sting for 6 seconds.',
    cooldown: 8,
    anim: 'blow',
    use({ player }) {
      const target = combat.playersInRadius(player.position, 50)[0]?.player;
      if (!target) return game.chat('🐝 No one close enough to sting', true);
      startSwarm(target.id, net.id, 6);
      net.sendEvent({ kind: 'op2:bees', target: target.id, t: 6 });
      game.chat(`🐝 Bees are chasing ${target.name}!`, true);
    },
  });

  registerItem({
    id: 'swap-ray',
    name: 'Swap Ray',
    icon: '🔁',
    description: 'Swap places with whoever you aim at.',
    cooldown: 3,
    anim: 'recoil',
    use({ player, origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 120, 5)[0];
      if (!hit) return;
      const theirs = hit.player.mesh.position.clone();
      const mine = player.position.clone();
      op.beamFx(origin.clone().addScaledVector(dir, 0.8), combat.bodyCenter(hit.player), 0.2);
      net.sendEvent({ kind: 'op2:swap', target: hit.player.id, p: arr(mine) });
      net.sendEvent({ kind: 'op:blink', a: arr(mine), b: arr(theirs) });
      player.position.copy(theirs);
      player.velocity.set(0, 0, 0);
      op.puffFx(mine, 0x7affc8);
      op.puffFx(theirs, 0x7affc8);
    },
  });
}
