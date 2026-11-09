// A TON of super overpowered items. They're all in the Tab item spawner, and new
// players get them in their hotbar/backpack.
//
// Shared helpers at the top (explosions, projectiles, damaging other players),
// then one registerItem({...}) per item. Copy one to make your own!
//
// Multiplayer rules used here:
// - Damage to another player: send { kind: 'op:damage', target, amount } and only the
//   target applies it to themselves (same idea as knockback in combat.js).
// - Explosions: send { kind: 'op:boom', p, r, dmg, kb } and every client (including you)
//   blows up blocks there and works out its own damage.

import * as THREE from 'three';
import { registerItem, ITEMS } from './items.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export function setupOpItems(game) {
  const { scene, net, combat, CONFIG } = game;
  const nowS = () => performance.now() / 1000;
  const nameOf = (id) => (id === net.id ? game.player?.name : game.remotes.players.get(id)?.name) || 'someone';
  const effects = []; // { update(dt) -> false when done }

  // Shared shapes for effects: built once, reused by every explosion/beam/puff (never disposed).
  // Don't add PointLights here: use game.flash(), see flashLights.js (adding lights freezes the game).
  const GEO = {
    fire: new THREE.SphereGeometry(1, 20, 14),
    smoke: new THREE.SphereGeometry(1, 16, 12),
    puff: new THREE.SphereGeometry(1, 14, 10),
    beam: new THREE.CylinderGeometry(0.08, 0.08, 1, 8, 1, true),
  };
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const addEffect = (e) => effects.push(e);

  // ---------- Damage other players ----------
  function hurt(targetId, amount, kb) {
    net.sendEvent({ kind: 'op:damage', target: targetId, amount: Math.round(amount) });
    if (kb) combat.knockback(targetId, kb);
  }

  // Where your crosshair points in the world (terrain, buildings), up to `range` meters
  function aimPoint(origin, dir, range = 150) {
    _ray.set(origin, dir);
    _ray.far = range;
    const hit = _ray.intersectObjects(game.world.colliders, false)[0];
    return hit ? hit.point.clone() : origin.clone().addScaledVector(dir, range);
  }

  // ---------- Explosions ----------
  function boom(p, r, dmg, kb, fromId, opts = {}) {
    const point = new THREE.Vector3().fromArray(p);
    game.world.structures.destroyNear(point, r * 0.7);
    explosionFx(point, r, opts.color, opts.quiet);
    if (!opts.quiet) playBoom(point, game.camera.position, Math.min(1.5, r / 6));
    const player = game.player;
    if (!player) return;
    const center = player.position.clone();
    center.y -= player.gravityDir * CONFIG.playerHeight * 0.5;
    const d = center.distanceTo(point);
    if (d >= r) return;
    const f = 1 - d / r;
    _v.copy(center).sub(point).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    _v.normalize();
    player.applyKnockback([_v.x * kb * f, kb * f * 0.7, _v.z * kb * f]);
    const self = fromId === net.id;
    player.takeDamage(dmg * f * (self ? 0.35 : 1), self ? 'yourself' : nameOf(fromId));
  }
  // Tell everyone (and do it here too)
  function boomAll(p, r, dmg, kb, opts = {}) {
    const arr = p.toArray ? p.toArray().map(round) : p;
    net.sendEvent({ kind: 'op:boom', p: arr, r, dmg, kb, color: opts.color, q: opts.quiet ? 1 : 0 });
    boom(arr, r, dmg, kb, net.id, opts);
  }

  function explosionFx(point, r, color = 0xffa531, quiet = false) {
    const fire = new THREE.Mesh(GEO.fire, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    const smoke = new THREE.Mesh(GEO.smoke, new THREE.MeshBasicMaterial({ color: 0x3e3a36, transparent: true, opacity: 0.6, depthWrite: false }));
    fire.position.copy(point);
    smoke.position.copy(point);
    if (!quiet) game.flash(point, { color, intensity: 40 + r * 8, distance: r * 5, duration: 0.33 });
    scene.add(fire, smoke);
    let t = 0;
    const life = 0.9 + r * 0.04;
    addEffect({
      update(dt) {
        t += dt;
        fire.scale.setScalar(r * (0.3 + t * 2.2));
        fire.material.opacity = Math.max(0, 0.95 - t * 2.5);
        smoke.scale.setScalar(r * (0.4 + t * 0.9));
        smoke.material.opacity = Math.max(0, 0.6 - (t / life) * 0.6);
        smoke.position.y += dt * 2;
        if (t < life) return true;
        scene.remove(fire, smoke);
        fire.material.dispose(); smoke.material.dispose();
        return false;
      },
    });
  }

  // Full-screen flash (nuke, god potion...)
  const flashEl = document.createElement('div');
  Object.assign(flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.8s', zIndex: 5 });
  document.getElementById('hud').appendChild(flashEl);
  function screenFlash(color, strength = 1, fade = 0.8) {
    flashEl.style.transition = 'none';
    flashEl.style.background = color;
    flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      flashEl.style.transition = `opacity ${fade}s`;
      flashEl.style.opacity = '0';
    });
  }

  // ---------- Simple projectiles (rockets, nukes) ----------
  // The shooter simulates hits; everyone else just draws them.
  const projectiles = new Map();
  let pidCounter = 0;
  const PROJ_LOOKS = {
    rocket: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.4 }));
      body.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xd8342c }));
      tip.rotation.x = -Math.PI / 2;
      tip.position.z = -0.55;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffa531 }));
      flame.rotation.x = Math.PI / 2;
      flame.position.z = 0.6;
      g.add(body, tip, flame);
      return g;
    },
    nuke: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 6, 14), new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.6 }));
      body.rotation.x = Math.PI / 2;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
      g.add(body, band);
      return g;
    },
    meteor: () =>
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x5a3b2a, emissive: 0xff5a10, emissiveIntensity: 0.9, roughness: 1 })),
  };

  const projTemplates = {};
  const projMesh = (type) => {
    const key = PROJ_LOOKS[type] ? type : 'rocket';
    projTemplates[key] ||= PROJ_LOOKS[key]();
    return projTemplates[key].clone(); // shares geometry/materials, so nothing to dispose later
  };
  function addProjectile({ pid, type, p, v, g = 0, mine, onImpact, sticky = false }) {
    const mesh = projMesh(type);
    mesh.position.fromArray(p);
    scene.add(mesh);
    projectiles.set(pid, { pid, type, mesh, v: new THREE.Vector3().fromArray(v), g, mine, onImpact, sticky, life: 10, stuck: false });
  }
  function fire(type, p, v, g, onImpact, sticky = false) {
    const pid = `${net.id}-op${++pidCounter}`;
    const pa = p.toArray().map(round), va = v.toArray().map(round);
    addProjectile({ pid, type, p: pa, v: va, g, mine: true, onImpact, sticky });
    net.sendEvent({ kind: 'op:proj', pid, type, p: pa, v: va, g, sticky });
    return pid;
  }
  function endProjectile(pid, broadcast) {
    const pr = projectiles.get(pid);
    if (!pr) return;
    scene.remove(pr.mesh);
    projectiles.delete(pid);
    if (broadcast) net.sendEvent({ kind: 'op:projEnd', pid });
  }
  function updateProjectiles(dt) {
    const targets = [...game.world.colliders, ...game.remotes.hitboxes()];
    for (const pr of [...projectiles.values()]) {
      pr.life -= dt;
      if (pr.life <= 0) { endProjectile(pr.pid, pr.mine); continue; }
      if (pr.stuck) continue;
      pr.v.y -= pr.g * dt;
      const step = pr.v.length() * dt;
      if (step > 0) {
        _ray.set(pr.mesh.position, _v.copy(pr.v).normalize());
        _ray.far = step + 0.3;
        const hit = _ray.intersectObjects(targets, false)[0];
        if (hit) {
          pr.mesh.position.copy(hit.point);
          if (pr.sticky) {
            pr.stuck = true;
          } else {
            if (pr.mine) pr.onImpact?.(hit.point.clone(), hit.object.userData.playerId);
            endProjectile(pr.pid, pr.mine);
          }
          if (pr.sticky && pr.mine) pr.onImpact?.(hit.point.clone(), hit.object.userData.playerId);
          continue;
        }
        pr.mesh.position.addScaledVector(pr.v, dt);
        pr.mesh.lookAt(_v.copy(pr.mesh.position).sub(pr.v));
      }
    }
  }

  // ---------- Network ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'op:damage':
        if (msg.target === net.id && game.player && Number.isFinite(msg.amount)) game.player.takeDamage(msg.amount, nameOf(msg.from));
        break;
      case 'op:boom':
        if (Array.isArray(msg.p)) boom(msg.p, +msg.r || 5, +msg.dmg || 0, +msg.kb || 0, msg.from, { color: msg.color, quiet: !!msg.q });
        break;
      case 'op:proj':
        if (Array.isArray(msg.p) && Array.isArray(msg.v) && !projectiles.has(msg.pid)) addProjectile({ ...msg, mine: false });
        break;
      case 'op:projEnd':
        endProjectile(msg.pid, false);
        break;
      case 'op:nuke':
        if (Array.isArray(msg.p)) nukeFx(new THREE.Vector3().fromArray(msg.p), msg.from);
        break;
      case 'op:bolt':
        if (Array.isArray(msg.pts)) boltFx(msg.pts.map((a) => new THREE.Vector3().fromArray(a)));
        break;
      case 'op:beam':
        if (Array.isArray(msg.a) && Array.isArray(msg.b)) beamFx(new THREE.Vector3().fromArray(msg.a), new THREE.Vector3().fromArray(msg.b), 0.12);
        break;
      case 'op:freeze':
        freezeFx(msg.target, msg.t);
        break;
      case 'op:meteors':
        if (Array.isArray(msg.pts)) meteorShower(msg.pts, msg.from);
        break;
      case 'op:tornado':
        if (Array.isArray(msg.p) && Array.isArray(msg.d)) tornado(new THREE.Vector3().fromArray(msg.p), new THREE.Vector3().fromArray(msg.d), msg.from);
        break;
      case 'op:blink':
        if (Array.isArray(msg.a)) puffFx(new THREE.Vector3().fromArray(msg.a), 0xb06cff);
        if (Array.isArray(msg.b)) puffFx(new THREE.Vector3().fromArray(msg.b), 0xb06cff);
        break;
      case 'op:snap':
        if (Array.isArray(msg.victims) && msg.victims.includes(net.id) && game.player) {
          screenFlash('rgba(255,215,120,0.8)', 1, 2);
          game.player.takeDamage(9999, nameOf(msg.from));
        }
        break;
    }
  });
  net.on('close', () => {
    for (const pid of [...projectiles.keys()]) endProjectile(pid, false);
  });

  // ---------- Per frame ----------
  let frozenUntil = 0;
  let frozenAt = null;
  game.addSystem((dt) => {
    updateProjectiles(dt);
    for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].update(dt)) effects.splice(i, 1);
    const player = game.player;
    // Frozen by a Freeze Ray: can't move at all
    if (nowS() < frozenUntil && player) {
      player.position.copy(frozenAt);
      player.velocity.set(0, 0, 0);
    } else frozenAt = null;
    // God Potion glow
    godEl.style.opacity = player && performance.now() < (player.invincibleUntil || 0) ? '1' : '0';
  });

  const godEl = document.createElement('div');
  Object.assign(godEl.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.3s',
    boxShadow: 'inset 0 0 120px 30px rgba(255, 210, 80, 0.55)',
  });
  document.getElementById('hud').appendChild(godEl);

  // ---------- Effects ----------
  function puffFx(p, color) {
    const m = new THREE.Mesh(GEO.puff, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.copy(p);
    scene.add(m);
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        m.scale.setScalar(0.5 + t * 6);
        m.material.opacity = Math.max(0, 0.7 - t * 2);
        if (t < 0.4) return true;
        scene.remove(m); m.material.dispose();
        return false;
      },
    });
  }

  function boltFx(pts) {
    // Jagged line through the points, flickering briefly
    const jag = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const n = Math.max(2, Math.round(a.distanceTo(b) / 2));
      for (let k = 0; k < n; k++) {
        const q = a.clone().lerp(b, k / n);
        if (k > 0) q.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2));
        jag.push(q);
      }
    }
    jag.push(pts[pts.length - 1]);
    const geo = new THREE.BufferGeometry().setFromPoints(jag);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true }));
    game.flash(pts[pts.length - 1], { color: 0x9fd8ff, intensity: 60, distance: 40, duration: 0.25 });
    scene.add(line);
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        line.material.opacity = Math.random() > 0.3 ? 1 - t * 3 : 0.2;
        if (t < 0.3) return true;
        scene.remove(line); geo.dispose(); line.material.dispose();
        return false;
      },
    });
    playZap(pts[0], game.camera.position);
  }

  function beamFx(a, b, life) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(GEO.beam, beamMat);
    m.scale.y = len;
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.rotateX(Math.PI / 2);
    scene.add(m);
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        if (t < life) return true;
        scene.remove(m); // shared geometry/material: nothing to dispose
        return false;
      },
    });
  }

  // Ice block on a frozen player (and freeze yourself if it's you)
  function freezeFx(targetId, t = 3) {
    t = Math.min(5, Math.max(0, +t || 3));
    if (targetId === net.id && game.player) {
      if (game.player.safeZone) return; // can't be frozen in the minigame lobby
      frozenUntil = nowS() + t;
      frozenAt = game.player.position.clone();
      screenFlash('rgba(140,210,255,0.55)', 1, t);
      game.chat("You've been frozen solid!", true);
      return;
    }
    const rp = game.remotes.players.get(targetId);
    if (!rp) return;
    const ice = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, CONFIG.playerHeight + 0.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xaee6ff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1 })
    );
    ice.position.y = CONFIG.playerHeight / 2;
    rp.mesh.add(ice);
    let time = 0;
    addEffect({
      update(dt) {
        time += dt;
        if (time < t) return true;
        rp.mesh.remove(ice); ice.geometry.dispose(); ice.material.dispose();
        return false;
      },
    });
  }

  // Nuke: huge boom, mushroom cloud, white flash
  function nukeFx(p, fromId) {
    boom(p.toArray(), 32, 160, 60, fromId, { color: 0xffe08a });
    const d = p.distanceTo(game.camera.position);
    screenFlash('#ffffff', Math.max(0.15, 1 - d / 250), 2.5);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a7a6a, transparent: true, opacity: 0.85, depthWrite: false }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xc28850, transparent: true, opacity: 0.85, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    stem.position.copy(p);
    cap.position.copy(p);
    ring.position.copy(p);
    scene.add(stem, cap, ring);
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        const h = Math.min(30, t * 18);
        stem.scale.set(1, h, 1);
        stem.position.y = p.y + h / 2;
        cap.position.y = p.y + h;
        cap.scale.set(6 + t * 4, 3 + t * 2, 6 + t * 4);
        ring.scale.setScalar(4 + t * 45);
        ring.material.opacity = Math.max(0, 0.8 - t * 0.6);
        const fade = Math.max(0, 0.85 - Math.max(0, t - 3) * 0.3);
        stem.material.opacity = fade;
        cap.material.opacity = fade;
        cap.material.color.setHex(t < 1 ? 0xffb050 : 0x9a8070);
        if (t < 6) return true;
        scene.remove(stem, cap, ring);
        for (const m of [stem, cap, ring]) { m.geometry.dispose(); m.material.dispose(); }
        return false;
      },
    });
  }

  // Meteors falling onto a list of [x, y, z, delay] points; each explodes on landing
  function meteorShower(pts, fromId) {
    for (const [x, y, z, delay] of pts) {
      const target = new THREE.Vector3(x, y, z);
      const start = target.clone().add(new THREE.Vector3(25, 70, 10));
      const mesh = projMesh('meteor');
      mesh.visible = false;
      scene.add(mesh);
      let t = -delay;
      addEffect({
        update(dt) {
          t += dt;
          if (t < 0) return true;
          mesh.visible = true;
          const k = Math.min(1, t / 0.9);
          mesh.position.copy(start).lerp(target, k * k);
          mesh.rotation.x += dt * 5;
          if (k < 1) return true;
          scene.remove(mesh);
          boom([x, y, z], 6, 45, 22, fromId, { color: 0xff6a20 });
          return false;
        },
      });
    }
  }

  // Tornado that drifts along `dir`, sucking up players and tearing up buildings
  function tornado(start, dir, fromId) {
    const group = new THREE.Group();
    const layers = [];
    for (let i = 0; i < 9; i++) {
      const r = 1 + i * 0.7;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.6, r, 2.4, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x9a9890, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      m.position.y = 1.2 + i * 2.2;
      group.add(m);
      layers.push(m);
    }
    scene.add(group);
    const pos = start.clone();
    dir = dir.clone().setY(0).normalize();
    let t = 0;
    const LIFE = 10, R = 7, TOP = 20;
    addEffect({
      update(dt) {
        t += dt;
        // Wander forward with a wobble (same path on every screen)
        _v.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(t * 1.3) * 4 * dt);
        pos.addScaledVector(dir, 6 * dt).add(_v);
        pos.y = game.world.terrain.groundHeight(pos.x, pos.z);
        group.position.copy(pos);
        layers.forEach((m, i) => {
          m.rotation.y += dt * (6 - i * 0.3);
          m.position.x = Math.sin(t * 3 + i) * 0.3 * i;
        });
        game.world.structures.destroyNear(_v.copy(pos).setY(pos.y + 2), 3.2);
        const player = game.player;
        if (player) {
          const dx = player.position.x - pos.x, dz = player.position.z - pos.z;
          const d = Math.hypot(dx, dz);
          const h = player.position.y - pos.y;
          if (d < R && h > -2 && h < TOP) {
            const f = 1 - d / R;
            const up = -player.gravityDir;
            // Spin around, get pulled in and lifted, flung out the top
            player.velocity.x += ((-dz / (d || 1)) * 30 - (dx / (d || 1)) * 10) * f * dt;
            player.velocity.z += ((dx / (d || 1)) * 30 - (dz / (d || 1)) * 10) * f * dt;
            player.velocity.y += up * (CONFIG.gravity + 30 * f) * dt;
            player.launched = true;
            player.knockbackTime = Math.max(player.knockbackTime || 0, 0.2);
            player.onGround = false;
            player.takeDamage(12 * dt, fromId === net.id ? 'yourself' : nameOf(fromId));
          }
        }
        if (t < LIFE) return true;
        scene.remove(group);
        group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        return false;
      },
    });
  }

  // ============================================================
  //                        THE ITEMS
  // ============================================================

  registerItem({
    id: 'orbital-strike',
    name: 'Orbital Strike',
    icon: '🛰️',
    description: 'Calls down a laser from space where you aim. Huge boom after 1.5s.',
    cooldown: 4,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = aimPoint(origin, dir, 250);
      const arr = p.toArray().map(round);
      net.sendEvent({ kind: 'op:beam', a: [arr[0], arr[1] + 200, arr[2]], b: arr });
      beamFx(new THREE.Vector3(arr[0], arr[1] + 200, arr[2]), p, 1.5);
      game.chat('🛰️ Orbital strike incoming!', true);
      setTimeout(() => {
        net.sendEvent({ kind: 'op:beam', a: [arr[0], arr[1] + 200, arr[2]], b: arr });
        beamFx(new THREE.Vector3(arr[0], arr[1] + 200, arr[2]), p, 0.4);
        boomAll(arr, 14, 120, 45, { color: 0x9fd8ff });
      }, 1500);
    },
  });

  registerItem({
    id: 'nuke',
    name: 'Pocket Nuke',
    icon: '☢️',
    description: 'Throw it. Sticks where it lands, then a MASSIVE explosion 3 seconds later. Run.',
    cooldown: 8,
    anim: 'swing',
    use({ player, origin, dir }) {
      const v = dir.clone().multiplyScalar(22).add(new THREE.Vector3(0, -player.gravityDir * 4, 0));
      let fired = false;
      fire('nuke', origin.clone().addScaledVector(dir, 1), v, CONFIG.gravity * -player.gravityDir, (p) => {
        if (fired) return;
        fired = true;
        game.chat('☢️ NUKE ARMED. 3...', true);
        setTimeout(() => {
          const arr = p.toArray().map(round);
          net.sendEvent({ kind: 'op:nuke', p: arr });
          nukeFx(p, net.id);
        }, 3000);
      }, true);
    },
  });

  registerItem({
    id: 'lightning-staff',
    name: 'Lightning Staff',
    icon: '⚡',
    description: 'Zaps whoever you aim at, then chains to everyone near them.',
    cooldown: 0.9,
    anim: 'recoil',
    use({ origin, dir }) {
      const first = combat.playersInCone(origin, dir, 90, 8)[0];
      const pts = [origin.clone().addScaledVector(dir, 0.8)];
      if (!first) {
        pts.push(aimPoint(origin, dir, 90));
      } else {
        const hit = new Set();
        let cur = first.player;
        for (let i = 0; i < 4 && cur; i++) {
          hit.add(cur.id);
          const c = combat.bodyCenter(cur);
          pts.push(c);
          const away = c.clone().sub(pts[pts.length - 2]).setY(0).normalize();
          hurt(cur.id, i === 0 ? 40 : 25, [away.x * 10, 8, away.z * 10]);
          cur = combat.playersInRadius(c, 12).map((x) => x.player).find((rp) => !hit.has(rp.id));
        }
      }
      boltFx(pts);
      net.sendEvent({ kind: 'op:bolt', pts: pts.map((v) => v.toArray().map(round)) });
    },
  });

  registerItem({
    id: 'minigun',
    name: 'Minigun',
    icon: '🔫',
    description: 'Hold to shred. 20 bullets a second.',
    anim: 'blow',
    hold({ origin, dir }, dt, state) {
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 0.05;
      const spread = new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06);
      const d = dir.clone().add(spread).normalize();
      combat.spawnProjectile({
        type: 'bullet',
        p: origin.clone().addScaledVector(d, 0.9).toArray(),
        v: d.multiplyScalar(90).toArray(),
        gravity: 2,
        radius: 0.12,
        life: 1.5,
        onHit(target, vel) {
          vel.y = 0;
          vel.normalize();
          hurt(target.id, 6, [vel.x * 4, 1.5, vel.z * 4]);
        },
      });
    },
  });

  registerItem({
    id: 'rocket-launcher',
    name: 'Rocket Launcher',
    icon: '🚀',
    description: 'Rockets explode on impact. Shoot the ground to rocket jump!',
    cooldown: 0.7,
    anim: 'recoil',
    use({ origin, dir }) {
      fire('rocket', origin.clone().addScaledVector(dir, 1), dir.clone().multiplyScalar(45), 0, (p) => boomAll(p, 6, 55, 28));
    },
  });

  registerItem({
    id: 'freeze-ray',
    name: 'Freeze Ray',
    icon: '❄️',
    description: 'Freezes whoever you aim at solid for 3 seconds.',
    cooldown: 1.5,
    anim: 'recoil',
    use({ origin, dir }) {
      const hit = combat.playersInCone(origin, dir, 60, 6)[0];
      const end = hit ? combat.bodyCenter(hit.player) : aimPoint(origin, dir, 60);
      beamFx(origin.clone().addScaledVector(dir, 0.8), end, 0.25);
      if (hit) {
        net.sendEvent({ kind: 'op:freeze', target: hit.player.id, t: 3 });
        freezeFx(hit.player.id, 3);
      }
    },
  });

  registerItem({
    id: 'blink-dagger',
    name: 'Blink Dagger',
    icon: '🔮',
    description: 'Teleport up to 45m where you look. Instantly.',
    cooldown: 0.8,
    anim: 'swing',
    use({ player, origin, dir }) {
      const before = player.position.clone();
      const p = aimPoint(origin, dir, 45).addScaledVector(dir, -1.2);
      // Land standing up (feet below the point when gravity is normal)
      player.position.copy(p);
      player.position.y -= -player.gravityDir * CONFIG.playerHeight * 0.4;
      player.velocity.set(0, 0, 0);
      puffFx(before, 0xb06cff);
      puffFx(player.position, 0xb06cff);
      net.sendEvent({ kind: 'op:blink', a: before.toArray().map(round), b: player.position.toArray().map(round) });
    },
  });

  registerItem({
    id: 'sky-launcher',
    name: 'Sky Launcher',
    icon: '🎈',
    description: 'Yeets everyone within 18m straight into the sky.',
    cooldown: 3,
    anim: 'recoil',
    use({ player }) {
      const center = player.position.clone();
      for (const { player: rp } of combat.playersInRadius(center, 18)) combat.knockback(rp.id, [0, 50, 0]);
      puffFx(center, 0x7ad0ff);
      net.sendEvent({ kind: 'op:blink', a: center.toArray().map(round) });
      game.chat('🎈 YEET', true);
    },
  });

  registerItem({
    id: 'singularity-cannon',
    name: 'Singularity Cannon',
    icon: '🌀',
    description: 'Opens a black hole instantly wherever you aim.',
    cooldown: 3,
    anim: 'recoil',
    use({ origin, dir }) {
      const p = aimPoint(origin, dir, 80).addScaledVector(dir, -2);
      p.y += 1;
      const id = `${net.id}-sc${++pidCounter}`;
      net.sendEvent({ kind: 'bhOpen', id, p: p.toArray().map(round) });
      game.blackHoles.open(p);
    },
  });

  registerItem({
    id: 'meteor-shower',
    name: 'Meteor Shower',
    icon: '☄️',
    description: 'Rains 18 meteors down around where you aim.',
    cooldown: 6,
    anim: 'recoil',
    use({ origin, dir }) {
      const c = aimPoint(origin, dir, 150);
      const pts = [];
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 16;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        pts.push([round(x), round(game.world.terrain.groundHeight(x, z)), round(z), round(Math.random() * 4)]);
      }
      net.sendEvent({ kind: 'op:meteors', pts });
      meteorShower(pts, net.id);
      game.chat('☄️ Look up!', true);
    },
  });

  registerItem({
    id: 'dynamite-shotgun',
    name: 'Dynamite Shotgun',
    icon: '🧨',
    description: 'Fires 8 sticks of dynamite at once.',
    cooldown: 2,
    anim: 'recoil',
    use({ player, origin, dir }) {
      const dyn = game.dynamite;
      for (let i = 0; i < 8; i++) {
        const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.35)).normalize();
        const p = origin.clone().addScaledVector(d, 0.8).toArray().map(round);
        const v = d.multiplyScalar(20 + Math.random() * 6).toArray().map(round);
        const id = `${net.id}-ds${++pidCounter}`;
        dyn.spawn(id, p, v, player.gravityDir, true, net.id);
        net.sendEvent({ kind: 'dynamite', id, p, v, g: player.gravityDir });
      }
    },
  });

  registerItem({
    id: 'banhammer',
    name: 'Banhammer',
    icon: '🔨',
    description: 'Bonk. Sends people to orbit.',
    cooldown: 0.8,
    anim: 'swing',
    use({ origin, dir, flatDir }) {
      for (const { player: rp } of combat.playersInCone(origin, dir, 4.5, 60)) {
        hurt(rp.id, 50, [flatDir.x * 30, 60, flatDir.z * 30]);
      }
    },
  });

  registerItem({
    id: 'tornado-jar',
    name: 'Tornado in a Jar',
    icon: '🌪️',
    description: 'Releases a tornado that wanders forward for 10s, sucking up players and buildings.',
    cooldown: 8,
    anim: 'recoil',
    use({ player, flatDir }) {
      const p = player.position.clone().addScaledVector(flatDir, 6);
      p.y = game.world.terrain.groundHeight(p.x, p.z);
      net.sendEvent({ kind: 'op:tornado', p: p.toArray().map(round), d: flatDir.toArray().map(round) });
      tornado(p, flatDir, net.id);
    },
  });

  registerItem({
    id: 'laser-beam',
    name: 'Death Laser',
    icon: '🔴',
    description: 'Hold for a continuous laser. Melts players and carves through buildings.',
    anim: 'blow',
    hold({ origin, dir }, dt, state) {
      const a = origin.clone().addScaledVector(dir, 0.8);
      const b = aimPoint(origin, dir, 120);
      beamFx(a, b, dt * 1.5);
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 0.1;
      net.sendEvent({ kind: 'op:beam', a: a.toArray().map(round), b: b.toArray().map(round) });
      for (const { player: rp, dist } of combat.playersInCone(origin, dir, 120, 3)) {
        if (dist <= origin.distanceTo(b) + 1) hurt(rp.id, 8);
      }
      // Carve buildings at the hit point (small boom with no damage)
      boomAll(b, 1.8, 0, 0, { color: 0xff3030, quiet: true });
    },
  });

  registerItem({
    id: 'god-potion',
    name: 'God Potion',
    icon: '🧪',
    description: 'Full health, full jetpack fuel, and 8 seconds of invincibility.',
    cooldown: 20,
    anim: 'recoil',
    use({ player }) {
      player.health = CONFIG.maxHealth;
      player.fuel = 1;
      player.invincibleUntil = performance.now() + 8000;
      screenFlash('rgba(255,215,90,0.6)', 1, 1);
      game.chat('🧪 You feel unstoppable.', true);
    },
  });

  registerItem({
    id: 'cosmic-snap',
    name: 'Cosmic Snap',
    icon: '✨',
    description: 'Snap your fingers. Half of everyone else is instantly eliminated. 60s cooldown.',
    cooldown: 60,
    anim: 'recoil',
    use() {
      const others = [...game.remotes.players.keys()];
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      const victims = others.slice(0, Math.ceil(others.length / 2));
      net.sendEvent({ kind: 'op:snap', victims });
      screenFlash('rgba(255,215,120,0.6)', 1, 1.5);
      game.chat(victims.length ? `✨ *snap* ${victims.length} player${victims.length > 1 ? 's' : ''} turned to dust.` : '✨ *snap* ...but nobody else is here.', true);
    },
  });

  // Give everyone the full arsenal (fills empty hotbar slots, then the backpack)
  return {
    giveAll() {
      for (const id of OP_IDS) {
        if (game.inventory.has(id)) continue;
        const def = ITEMS.get(id);
        if (def) game.inventory.add({ id, name: def.name, icon: def.icon, maxStack: 1, count: 1 });
      }
    },
    boomAll,
    hurt,
  };
}

const OP_IDS = [
  'rocket-launcher', 'lightning-staff', 'blink-dagger', 'minigun', 'laser-beam', 'orbital-strike',
  'nuke', 'freeze-ray', 'sky-launcher', 'singularity-cannon', 'meteor-shower', 'dynamite-shotgun',
  'banhammer', 'tornado-jar', 'god-potion', 'cosmic-snap',
];

// ---------- Sounds ----------
let audio = null;
function ctx() {
  audio ||= new AudioContext();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
let boomBuffer = null;
let lastBooms = [];
function playBoom(point, listener, vol = 1) {
  try {
    const a = ctx();
    const v = Math.max(0, 1 - point.distanceTo(listener) / 150) * 0.8 * vol;
    if (v <= 0.01) return;
    // At most 6 boom sounds per 0.25s (meteor showers would otherwise stack dozens)
    const nowMs = performance.now();
    lastBooms = lastBooms.filter((t) => nowMs - t < 250);
    if (lastBooms.length >= 6) return;
    lastBooms.push(nowMs);
    // The noise is the same every time, so generate it once
    if (!boomBuffer) {
      const len = a.sampleRate * 1.5;
      boomBuffer = a.createBuffer(1, len, a.sampleRate);
      const data = boomBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const src = a.createBufferSource();
    src.buffer = boomBuffer;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = a.createGain();
    g.gain.value = Math.min(1, v);
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  } catch {}
}
function playZap(point, listener) {
  try {
    const a = ctx();
    const v = Math.max(0, 1 - point.distanceTo(listener) / 80) * 0.25;
    if (v <= 0.01) return;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1800, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, a.currentTime + 0.25);
    const g = a.createGain();
    g.gain.setValueAtTime(v, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.3);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.3);
  } catch {}
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
