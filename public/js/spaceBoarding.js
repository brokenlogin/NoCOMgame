// On-foot boarding: the Talon Fortress in Nebula Drift. Land on the pad outside, walk in,
// and fight through Red Talon pirates (they use the same character models as players) to
// Captain Rook on the bridge. Inside you get a Boarding Blaster (hold click to shoot).
// Turrets on the roof shoot at ships. Clearing the bridge tells quests
// { type: 'interior', of: 'fortress' }. Everything respawns a few minutes after you leave.

import * as THREE from 'three';
import { createCapsuleMesh, animateCharacter } from './capsule.js';
import { registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { itemTexture } from './itemTextures.js';
import { makeLabel } from './spaceRpg.js';

export const FORTRESS = { x: 250, y: 50, z: -5900, w: 70, d: 50 };

export function setupBoarding(api) {
  const { game, fx, hud, ship } = api;
  const { scene, world, camera } = game;
  const F = FORTRESS;
  const root = new THREE.Group();
  scene.add(root);
  const walls = []; // Box3s inside the fortress, for line of sight and bolts
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.6, metalness: 0.4, bumpMap: itemTexture('brushed'), bumpScale: 0.6 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8, bumpMap: itemTexture('grit'), bumpScale: 0.8 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xffffff, map: itemTexture('hazard'), roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2010, emissiveIntensity: 1.6 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.9, map: itemTexture('wood') });

  function box(x, top, z, w, h, d, mat, { walk = true, wall = false, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, top - h / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld();
    if (walk) world.colliders.push(m);
    if (wall) {
      const b = new THREE.Box3().setFromObject(m);
      world.solidBoxes.push(b);
      walls.push(b);
    }
    return m;
  }
  const H = 12;
  const x0 = F.x - F.w / 2, x1 = F.x + F.w / 2, z0 = F.z - F.d / 2, z1 = F.z + F.d / 2;
  box(F.x, F.y, F.z, F.w, 1.5, F.d, floorMat);
  // Outer walls, with the entrance in the middle of the south (+Z) wall
  box(F.x, F.y + H, z0, F.w, H, 1.2, hull, { walk: false, wall: true });
  box(x0, F.y + H, F.z, 1.2, H, F.d, hull, { walk: false, wall: true });
  box(x1, F.y + H, F.z, 1.2, H, F.d, hull, { walk: false, wall: true });
  box((x0 + F.x - 5) / 2, F.y + H, z1, F.x - 5 - x0, H, 1.2, hull, { walk: false, wall: true });
  box((x1 + F.x + 5) / 2, F.y + H, z1, x1 - F.x - 5, H, 1.2, hull, { walk: false, wall: true });
  box(F.x, F.y + H, z1, 10, 3, 1.2, hull, { walk: false, wall: false }); // over the door
  // Roof (doesn't cast a shadow, so the inside stays lit)
  box(F.x, F.y + H + 1, F.z, F.w + 2, 1, F.d + 2, hull, { shadow: false });
  // Inside: a central corridor north from the door, barracks west, armory east, the bridge at the back
  const zMid = F.z + 2;
  for (const s of [-1, 1]) {
    // corridor walls with a doorway into each side room
    const wx = F.x + s * 5;
    box(wx, F.y + H, (z1 + zMid + 6) / 2, 1, H, z1 - zMid - 6, hull, { walk: false, wall: true });
    box(wx, F.y + H, (zMid - 2 + z0 + 14) / 2, 1, H, zMid - 2 - (z0 + 14), hull, { walk: false, wall: true });
  }
  // Bridge wall with a wide doorway
  box((x0 + F.x - 6) / 2, F.y + H, z0 + 14, F.x - 6 - x0, H, 1, hull, { walk: false, wall: true });
  box((x1 + F.x + 6) / 2, F.y + H, z0 + 14, x1 - F.x - 6, H, 1, hull, { walk: false, wall: true });
  // Red light strips, crates to hide behind, a big window on the bridge
  for (const z of [z1 - 6, F.z, z0 + 8]) box(F.x, F.y + H - 0.3, z, 3, 0.2, 1, red, { walk: false });
  for (const [dx, dz] of [[-15, 12], [-22, 4], [16, 10], [24, 2], [-12, -4], [14, -6], [-20, -16], [20, -16]]) {
    box(F.x + dx, F.y + 1.6, F.z + dz, 2.4, 1.6, 2.4, crateMat, { wall: true });
  }
  box(F.x, F.y + 4, z0 + 4, 14, 2.4, 3, hull, { wall: true }); // command console
  box(F.x, F.y + 4.05, z0 + 4, 12, 0.1, 2.4, red, { walk: false });
  // Landing pad outside the door
  box(F.x, F.y, z1 + 14, 22, 1.5, 24, floorMat);
  box(F.x, F.y + 0.05, z1 + 14, 18, 0.06, 18, hazard, { walk: false });
  const sign = makeLabel([{ text: '☠ TALON FORTRESS', size: 64, color: '#ff6a5a', bold: true }, { text: 'Land on the pad and walk in. Bring friends.', size: 34, color: '#ffd0c8' }], { scale: 0.035 });
  sign.position.set(F.x, F.y + H + 6, z1 + 2);
  root.add(sign);
  root.visible = false;

  const inside = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 + 1 && p.y > F.y - 2 && p.y < F.y + H;

  // ---------- Pirates on foot ----------
  const hitGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const SPOTS = [
    // [x, z, patrol dx, patrol dz]
    [F.x - 1, z1 - 8, 2, 0], [F.x + 1, F.z + 6, -2, 0],
    [F.x - 18, F.z + 14, 0, -8], [F.x - 25, F.z + 2, 6, 0], [F.x - 14, F.z - 6, 0, 6],
    [F.x + 18, F.z + 14, 0, -8], [F.x + 26, F.z + 4, -6, 0], [F.x + 14, F.z - 4, 0, 6],
    [F.x - 14, z0 + 8, 6, 0], [F.x + 14, z0 + 8, -6, 0],
  ];
  const pirates = [];
  const bolts = [];
  let cleared = false, resetT = 0, rookDown = false;
  function makePirate(x, z, pdx, pdz, boss = false, i = 0) {
    const g = createCapsuleMesh(boss ? 0xa01020 : 0x6a1a1a, boss ? 'Captain Rook' : `Talon Grunt ${i}`, { tag: false });
    if (boss) g.scale.setScalar(1.25);
    g.position.set(x, F.y, z);
    root.add(g);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = 1;
    g.add(hit);
    const tag = makeLabel([{ text: boss ? '☠ Captain Rook' : 'Talon Grunt', size: 40, color: boss ? '#ffd23d' : '#ff8a7a', bold: true }]);
    tag.position.y = 2.4;
    g.add(tag);
    const lvl = Math.max(6, api.level() - 2);
    const p = {
      g, hit, tag, boss, a: new THREE.Vector3(x, F.y, z), b: new THREE.Vector3(x + pdx, F.y, z + pdz), toB: true,
      hp: (boss ? 450 : 60) * (1 + 0.1 * (lvl - 6)), maxHp: 0, cool: 1 + Math.random(), burst: 0, alive: true, dying: 0, speed: 0, alert: 0,
    };
    p.maxHp = p.hp;
    hit.userData.pirate = p;
    pirates.push(p);
    return p;
  }
  function spawnAll() {
    for (const p of pirates) root.remove(p.g);
    pirates.length = 0;
    SPOTS.forEach(([x, z, dx, dz], i) => makePirate(x, z, dx, dz, false, i));
    makePirate(F.x, z0 + 9, 0, 0, true);
    cleared = false;
    rookDown = false;
  }
  spawnAll();

  const _r = new THREE.Ray();
  const _hitPt = new THREE.Vector3();
  function blocked(a, b) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    _r.set(a, dir.normalize());
    for (const w of walls) {
      if (w.containsPoint(a) || w.containsPoint(b)) continue;
      if (_r.intersectBox(w, _hitPt) && _hitPt.distanceTo(a) < len) return true;
    }
    return false;
  }
  function hurtPirate(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg;
    p.alert = 6;
    fx.sparks(p.g.position.clone().setY(p.g.position.y + 1.2), 0xff6a4a, 6);
    if (p.hp <= 0) {
      p.alive = false;
      p.dying = 1.2;
      api.killed({ type: p.boss ? 'rook' : 'grunt', faction: 'talon', p: p.g.position.clone().setY(F.y + 1), sector: 'nebula', xp: p.boss ? 400 : 30, cr: p.boss ? 500 : 20, rarity: p.boss ? 'epic' : null });
      if (p.boss) {
        rookDown = true;
        api.emit({ type: 'interior', of: 'fortress' });
        api.achieve('boarder');
        api.announce('☠ took down Captain Rook inside the Talon Fortress!');
        hud.banner('FORTRESS CLEARED', 'Captain Rook is down', '#ffd23d');
        api.loot?.drop(p.g.position.clone().setY(F.y + 1), { rarity: 'epic', count: 2 });
      }
    }
  }

  // ---------- Boarding Blaster ----------
  registerItemModel('sp-blaster', (THREEref) => {
    const T = THREEref || THREE;
    const g = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.08, 0.1, 0.32), new T.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.6, roughness: 0.4 }));
    const barrel = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, 0.22, 10), new T.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.3 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.25);
    const glowM = new T.Mesh(new T.BoxGeometry(0.09, 0.02, 0.2), new T.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x5fd4ff, emissiveIntensity: 2 }));
    glowM.position.set(0, 0.06, -0.02);
    const grip = new T.Mesh(new T.BoxGeometry(0.06, 0.14, 0.07), new T.MeshStandardMaterial({ color: 0x1e1e22 }));
    grip.position.set(0, -0.09, 0.08);
    grip.rotation.x = 0.3;
    g.add(body, barrel, glowM, grip);
    return g;
  });
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  registerItem({
    id: 'sp-blaster',
    name: 'Boarding Blaster',
    icon: '🔫',
    description: 'Standard-issue boarding sidearm. Hold to fire. Only works inside enemy stations.',
    hold(ctx, dt, state) {
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0) return;
      state.t = 0.24;
      camera.getWorldPosition(_o);
      camera.getWorldDirection(_d);
      const ray = new THREE.Raycaster(_o.clone(), _d.clone(), 0, 70);
      const hits = ray.intersectObjects(pirates.filter((p) => p.alive).map((p) => p.hit), false);
      let end = _o.clone().addScaledVector(_d, 70);
      const hit = hits[0];
      if (hit && !blocked(_o, hit.point)) {
        end = hit.point;
        let dmg = 22 * (1 + 0.05 * (api.level() - 1));
        const crit = Math.random() < ship.stats.crit;
        if (crit) dmg *= 2;
        hurtPirate(hit.object.userData.pirate, dmg);
        hud.hit(crit);
      }
      const from = _o.clone().addScaledVector(_d, 0.6).add(new THREE.Vector3(0, -0.15, 0));
      ship.beam(from, end, 0x5fd4ff, 0.5, 0.07);
      fx.sfx('repeater');
    },
  });
  let armed = false;
  function arm(on) {
    if (on === armed) return;
    armed = on;
    const inv = game.inventory;
    if (on) {
      if (!inv.has('sp-blaster')) inv.add({ id: 'sp-blaster', name: 'Boarding Blaster', icon: '🔫', maxStack: 1, count: 1 });
      const i = inv.slots.findIndex((s) => s?.id === 'sp-blaster');
      if (i >= 0 && i < 9) inv.select(i);
      hud.toast('🔫 Boarding Blaster ready. Hold click to shoot!', '#5fd4ff');
    } else if (inv.has('sp-blaster')) {
      inv.remove('sp-blaster', 99);
    }
  }

  // ---------- Roof turrets ----------
  let turrets = [];
  function spawnTurrets() {
    turrets = [[-28, -20], [28, -20], [-28, 20], [28, 20]].map(([dx, dz]) =>
      api.enemies.spawn('turret', new THREE.Vector3(F.x + dx, F.y + H + 1.6, F.z + dz), { sector: 'nebula', level: 7, tag: 'fortress', leash: 400 }));
  }
  let turretT = 0;

  // ---------- Per frame ----------
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace && ctx.sector === 'nebula';
    root.visible = here;
    if (!here) {
      arm(false);
      return;
    }
    if (!api.enemies.count('fortress')) {
      turretT -= dt;
      if (turretT <= 0) {
        turretT = 180;
        spawnTurrets();
      }
    }
    const player = ctx.player;
    const pp = player.position;
    const inFort = !ship.piloting && inside(pp);
    arm(inFort);
    const eye = pp.clone().setY(pp.y + 1.4);
    for (const p of pirates) {
      if (!p.alive) {
        if (p.dying > 0) {
          p.dying -= dt;
          p.g.rotation.x = Math.min(Math.PI / 2, p.g.rotation.x + dt * 3);
          if (p.dying <= 0) p.g.visible = false;
        }
        continue;
      }
      const d = p.g.position.distanceTo(pp);
      p.alert = Math.max(0, p.alert - dt);
      const sees = inFort && d < (p.boss ? 40 : 28) && !blocked(p.g.position.clone().setY(F.y + 1.5), eye);
      if (sees) p.alert = 3;
      let speed = 0;
      if (p.alert > 0 && inFort) {
        // Face you and shoot (Rook fires bursts)
        p.g.rotation.y = Math.atan2(-(pp.x - p.g.position.x), -(pp.z - p.g.position.z));
        p.cool -= dt;
        if (sees && p.cool <= 0) {
          const from = p.g.position.clone().setY(F.y + 1.5 * p.g.scale.y);
          const v = eye.clone().sub(from).normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, 0)).setLength(38);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4a2a }));
          m.position.copy(from);
          root.add(m);
          bolts.push({ m, v, life: 3, dmg: p.boss ? 8 : 6 });
          if (p.boss && ++p.burst < 3) p.cool = 0.15;
          else {
            p.burst = 0;
            p.cool = (p.boss ? 1.4 : 1.1) + Math.random() * 0.6;
          }
        }
        // Grunts sidestep a bit while fighting
        if (!p.boss) {
          const side = new THREE.Vector3(Math.cos(p.g.rotation.y), 0, -Math.sin(p.g.rotation.y)).multiplyScalar(Math.sin(performance.now() / 700 + p.a.x) * 1.4 * dt);
          const next = p.g.position.clone().add(side);
          if (!walls.some((w) => w.containsPoint(next.clone().setY(F.y + 1)))) p.g.position.copy(next);
          speed = 1.4;
        }
      } else if (!p.boss) {
        // Patrol back and forth
        const goal = p.toB ? p.b : p.a;
        const to = goal.clone().sub(p.g.position).setY(0);
        if (to.length() < 0.3) p.toB = !p.toB;
        else {
          to.setLength(Math.min(to.length(), 2.2 * dt));
          p.g.position.add(to);
          p.g.rotation.y = Math.atan2(-to.x, -to.z);
          speed = 2.2;
        }
      }
      animateCharacter(p.g, speed, true, dt, 0);
      p.tag.material.opacity = Math.min(1, Math.max(0, (d - 2) / 2));
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      if (walls.some((w) => w.containsPoint(b.m.position))) b.life = 0;
      else if (!ship.piloting && b.m.position.distanceTo(eye.clone().setY(pp.y + 1)) < 0.9) {
        player.takeDamage(b.dmg, 'Talon pirates');
        hud.damageFrom(b.m.position.clone().sub(b.v));
        b.life = 0;
      }
      if (b.life <= 0) {
        root.remove(b.m);
        b.m.geometry.dispose();
        b.m.material.dispose();
        bolts.splice(i, 1);
      }
    }
    // Cleared: respawn everyone a while after you've left
    if (rookDown && !cleared && pirates.every((p) => !p.alive)) cleared = true;
    if (rookDown && !inFort) {
      resetT += dt;
      if (resetT > 180) {
        resetT = 0;
        spawnAll();
      }
    } else resetT = 0;
  });
  api.blipSources.push((out, here) => {
    if (here !== 'nebula') return;
    out.push({ p: new THREE.Vector3(F.x, F.y, F.z), kind: 'boss', size: 1.8, sticky: true });
    for (const p of pirates) if (p.alive && p.alert > 0) out.push({ p: p.g.position, kind: 'enemy', size: 0.5 });
  });

  return { inside, FORTRESS: F, get rookDown() { return rookDown; }, reset: spawnAll };
}
