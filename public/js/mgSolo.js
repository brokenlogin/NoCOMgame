// The Solo Arcade: 15 singleplayer minigames. Get there from the 🎯 pad in the minigame lobby.
// Stand on a game's pad for a moment and it starts, just for you (nothing is sent to anyone).
// Your best score for each game is saved in this browser and shown on its pad.
//
// A solo game is { id, name, icon, color, arena, better: 'high'|'low', unit, items?,
//   respawnOnFall?, spawn: [x,y,z], start(ctx), update(dt, ctx), hud(ctx), stop() }
// ctx = { t, seed, score, lives, finish(score), loseLife(), targets: [{ mesh, hit(point) }] }
// (targets are what the Arcade Blaster can hit)

import { SLOT, HUB, makeKit, mulberry32 } from './mgKit.js';
import { makeSign, inArea, teleport, addItemLock } from './mgShared.js';
import { ITEMS, registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';

export function setupSolo(game, { lobbyArrive }) {
  const k = makeKit(game);
  const { THREE, scene } = k;
  const S = (i) => SLOT(25 + i);
  const GAMES = [targets(), clays(), balloons(), parkour(), jetRings(), skydive(), bombDodge(), laserDodge(), memory(), coins(), longJump(), skyTower(), moles(), maze(), waves()];

  // ---------- Best scores ----------
  let best = {};
  try {
    best = JSON.parse(localStorage.getItem('nocom.soloBest') || '{}');
  } catch {}
  const fmt = (g, s) => (s == null ? '—' : g.unit === 's' ? `${s.toFixed(2)}s` : g.unit === 'm' ? `${s.toFixed(1)}m` : `${Math.round(s)}`);

  // ---------- Hub ----------
  k.box({ x: HUB.x, top: HUB.y, z: HUB.z, w: HUB.w, d: HUB.d, h: 1.5, color: 0x3a2a4a });
  const title = makeSign(game, '🎯 SOLO ARCADE', { color: '#ffb070', width: 14, height: 2.4 });
  title.position.set(HUB.x, HUB.y + 6, HUB.z - HUB.d / 2 + 0.3);
  const BACK = { x: HUB.x + HUB.w / 2 - 4, z: HUB.z + 9, w: 4, d: 4, y: HUB.y };
  k.box({ x: BACK.x, top: HUB.y + 0.12, z: BACK.z, w: BACK.w, d: BACK.d, h: 0.3, color: 0x3a86ff });
  const backSign = makeSign(game, '⬅ Minigame lobby', { width: 3.6, height: 0.7 });
  backSign.position.set(BACK.x, HUB.y + 1.8, BACK.z - 2.1);
  const ARRIVE = [HUB.x + HUB.w / 2 - 4, HUB.y + 0.5, HUB.z];
  const pads = GAMES.map((g, i) => {
    const pad = { x: HUB.x - HUB.w / 2 + 6 + (i % 5) * 10.5, z: HUB.z - 8 + Math.floor(i / 5) * 8, w: 5, d: 5, y: HUB.y, g };
    k.box({ x: pad.x, top: HUB.y + 0.12, z: pad.z, w: pad.w, d: pad.d, h: 0.3, color: g.color });
    return pad;
  });
  const signs = [];
  function drawSign(i) {
    if (signs[i]) scene.remove(signs[i]);
    const g = GAMES[i];
    const s = makeSign(game, `${g.icon} ${g.name} · best ${fmt(g, best[g.id])}`, { width: 6, height: 0.8 });
    s.position.set(pads[i].x, HUB.y + 2 + (i % 2) * 0.9, pads[i].z - 2.6);
    signs[i] = s;
  }
  GAMES.forEach((_, i) => drawSign(i));

  // ---------- Arcade Blaster (for the shooting games) ----------
  registerItemModel('mg-blaster', (T) => {
    const g = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.08, 0.12, 0.34), new T.MeshStandardMaterial({ color: 0xff8a3a, roughness: 0.4 }));
    const tip = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.18, 10), new T.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2fb8ff, emissiveIntensity: 1.5 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.24;
    g.add(body, tip);
    return g;
  });
  const beamMat = new THREE.LineBasicMaterial({ color: 0x5fd4ff });
  registerItem({
    id: 'mg-blaster',
    name: 'Arcade Blaster',
    icon: '🔫',
    description: 'For the Solo Arcade shooting games. Hold to fire.',
    hold(ctx, dt, state) {
      state.t = (state.t ?? 0) - dt;
      if (state.t > 0 || !active) return;
      state.t = 0.16;
      const o = ctx.origin.clone(), d = ctx.dir.clone();
      const ray = new THREE.Raycaster(o, d, 0, 120);
      const list = active.ctx.targets.filter((tg) => tg.mesh.visible);
      const hit = ray.intersectObjects(list.map((tg) => tg.mesh), true)[0];
      const end = hit ? hit.point : o.clone().addScaledVector(d, 120);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([o.clone().addScaledVector(d, 0.8).add(new THREE.Vector3(0, -0.2, 0)), end]), beamMat);
      scene.add(line);
      setTimeout(() => scene.remove(line), 60);
      k.beep(1400, 0.05, 'square', 0.02);
      if (hit) {
        let obj = hit.object;
        const tg = list.find((x) => {
          for (let p = obj; p; p = p.parent) if (p === x.mesh) return true;
          return false;
        });
        tg?.hit(hit.point);
      }
    },
  });

  // ---------- Running a game ----------
  let active = null; // { g, ctx, ending }
  let padTimer = 0, onPad = null;
  addItemLock(game, () => !!active);
  let saved = null;
  const hudEl = document.createElement('div');
  Object.assign(hudEl.style, {
    position: 'fixed', top: '52px', left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '8px',
    background: 'rgba(30,20,10,0.8)', font: '700 16px system-ui, sans-serif', color: '#ffd0a0', display: 'none', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
  });
  document.getElementById('hud').appendChild(hudEl);

  function start(g) {
    const inv = game.inventory;
    saved = { slots: inv.slots.map((s) => s && { ...s }), selected: inv.selected };
    inv.clear();
    for (const id of g.items || []) {
      const def = ITEMS.get(id);
      if (def) inv.add({ id, name: def.name, icon: def.icon, maxStack: 1, count: 1 });
    }
    inv.select(0);
    const ctx = {
      t: 0, seed: Math.floor(Math.random() * 2 ** 31), score: 0, lives: 3, targets: [],
      finish: (score) => finish(score),
      loseLife() {
        ctx.lives--;
        k.beep(160, 0.25, 'sawtooth', 0.06);
        game.chat(ctx.lives > 0 ? `💔 Ouch! ${ctx.lives} lives left` : '💔 Out of lives!', true);
        if (ctx.lives <= 0) finish(ctx.score);
      },
    };
    active = { g, ctx, ending: 0 };
    teleport(game.player, ...g.spawn);
    game.player.health = game.CONFIG.maxHealth;
    g.start(ctx);
    game.chat(`${g.icon} ${g.name}: ${g.rules}`, true);
  }
  function finish(score) {
    if (!active || active.ending) return;
    const g = active.g;
    active.ending = 2.5;
    const prev = best[g.id];
    const better = score != null && (prev == null || (g.better === 'low' ? score < prev : score > prev));
    if (better) {
      best[g.id] = score;
      try {
        localStorage.setItem('nocom.soloBest', JSON.stringify(best));
      } catch {}
      drawSign(GAMES.indexOf(g));
    }
    game.chat(score == null ? `${g.icon} ${g.name}: no score.` : `${g.icon} ${g.name}: ${fmt(g, score)}${better ? ' 🏆 NEW BEST!' : ` (best ${fmt(g, prev)})`}`, true);
    k.beep(better ? 1320 : 660, 0.3, 'triangle', 0.06);
  }
  function end() {
    if (!active) return;
    active.g.stop(active.ctx);
    active = null;
    const inv = game.inventory;
    if (saved) {
      inv.held = null;
      saved.slots.forEach((s, i) => (inv.slots[i] = s && { ...s }));
      inv.select(saved.selected);
      inv.changed();
      saved = null;
    }
    if (game.player) teleport(game.player, ...ARRIVE);
  }

  game.addSystem((dt) => {
    const p = game.player.position;
    // Hub pads
    if (!active) {
      const pad = pads.find((pd) => inArea(p, pd, 0));
      if (pad !== onPad) {
        onPad = pad;
        padTimer = 1.2;
      }
      if (pad) {
        padTimer -= dt;
        hudEl.style.display = 'block';
        hudEl.textContent = `${pad.g.icon} ${pad.g.name} starting in ${Math.max(0, padTimer).toFixed(1)}… (best ${fmt(pad.g, best[pad.g.id])})`;
        if (padTimer <= 0) {
          onPad = null;
          start(pad.g);
        }
      } else hudEl.style.display = 'none';
      if (inArea(p, BACK, 0)) lobbyArrive();
      return;
    }
    // Playing
    const { g, ctx } = active;
    if (active.ending) {
      active.ending -= dt;
      hudEl.textContent = `${g.icon} ${g.name} · done!`;
      if (active.ending <= 0) end();
      return;
    }
    ctx.t += dt;
    g.update(dt, ctx);
    const A = g.arena;
    if (p.y < A.y - 14) {
      if (g.respawnOnFall) {
        teleport(game.player, ...g.spawn);
        k.beep(200, 0.2);
      } else finish(g.better === 'high' ? ctx.score : null);
    }
    if (Math.abs(p.x - A.x) > A.w / 2 + 30 || Math.abs(p.z - A.z) > A.d / 2 + 30) {
      // Died and respawned on the map, or wandered off
      finish(g.better === 'high' ? ctx.score : null);
      active.ending = 0.01;
    }
    if (!active) return;
    hudEl.style.display = 'block';
    hudEl.textContent = `${g.icon} ${g.name} · ${g.hud(ctx)}`;
  });
  game.net.on('close', () => {
    if (active) end();
  });

  return {
    goToHub() {
      teleport(game.player, ...ARRIVE);
      game.chat('🎯 Welcome to the Solo Arcade! Stand on a pad to play. Your best scores are saved.', true);
    },
    get active() { return active; },
  };

  // =================== The games ===================

  // A shooting stand with a backstop; targets come and go
  function range(i, name, icon, color, rules, spawnTarget) {
    const A = { ...S(i), w: 40, d: 50 };
    const standZ = A.z + 18;
    k.box({ x: A.x, top: A.y, z: standZ, w: 12, d: 8, h: 1.5, color: 0x5a4a3a });
    k.box({ x: A.x, top: A.y + 14, z: A.z - 20, w: 40, d: 1, h: 18, color: 0x3a4a3a, collider: false });
    let live = [];
    return {
      id: name.toLowerCase().replace(/\W+/g, ''), name, icon, color, arena: A, better: 'high', unit: 'pts', items: ['mg-blaster'], respawnOnFall: true, rules,
      spawn: [A.x, A.y + 0.5, standZ],
      start(ctx) {
        live = [];
        ctx.rnd = mulberry32(ctx.seed);
        ctx.next = 0.5;
      },
      update(dt, ctx) {
        if (ctx.t > 60) return ctx.finish(ctx.score);
        ctx.next -= dt;
        if (ctx.next <= 0) {
          ctx.next = Math.max(0.35, 1 - ctx.t * 0.01);
          const tg = spawnTarget(A, ctx, live);
          ctx.targets.push(tg);
          live.push(tg);
        }
        for (const tg of [...live]) {
          tg.tick(dt);
          if (tg.dead) {
            k.remove(tg.mesh);
            live.splice(live.indexOf(tg), 1);
            ctx.targets.splice(ctx.targets.indexOf(tg), 1);
          }
        }
      },
      hud: (ctx) => `🎯 ${ctx.score} · ${Math.max(0, 60 - ctx.t).toFixed(0)}s`,
      stop() {
        for (const tg of live) k.remove(tg.mesh);
        live = [];
      },
    };
  }
  function targets() {
    return range(0, 'Target Practice', '🎯', 0xd83a3a, 'Shoot the targets before they drop. Gold ones are worth 3. 60 seconds!', (A, ctx) => {
      const gold = ctx.rnd() < 0.2;
      const r = gold ? 0.7 : 1.1;
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 24), new THREE.MeshStandardMaterial({ color: gold ? 0xffd23d : 0xffffff }));
      face.rotation.x = Math.PI / 2;
      const bull = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.22, 20), new THREE.MeshStandardMaterial({ color: 0xd83a3a }));
      bull.rotation.x = Math.PI / 2;
      g.add(face, bull);
      g.position.set(A.x + (ctx.rnd() - 0.5) * 30, A.y + 2 + ctx.rnd() * 9, A.z - 18 + ctx.rnd() * 8);
      scene.add(g);
      const tg = { mesh: g, life: 2.4, dead: false };
      tg.hit = () => {
        ctx.score += gold ? 3 : 1;
        k.puff(g.position, gold ? 0xffd23d : 0xffffff);
        tg.dead = true;
      };
      tg.tick = (dt) => {
        tg.life -= dt;
        g.scale.setScalar(Math.min(1, tg.life * 3, (2.4 - tg.life) * 6 + 0.1));
        if (tg.life <= 0) tg.dead = true;
      };
      return tg;
    });
  }
  function clays() {
    return range(1, 'Clay Pigeons', '🥏', 0xe8a03a, 'Clay discs fly across the sky. Shoot them out of the air! 60 seconds.', (A, ctx) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0xe8743a }));
      const side = ctx.rnd() < 0.5 ? -1 : 1;
      m.position.set(A.x + side * 22, A.y + 2, A.z - 6 + ctx.rnd() * 10);
      scene.add(m);
      const v = new THREE.Vector3(-side * (12 + ctx.rnd() * 8), 12 + ctx.rnd() * 6, (ctx.rnd() - 0.5) * 4);
      const tg = { mesh: m, dead: false };
      tg.hit = () => {
        ctx.score++;
        k.puff(m.position, 0xe8743a);
        tg.dead = true;
      };
      tg.tick = (dt) => {
        v.y -= 9.8 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.y += dt * 10;
        if (m.position.y < A.y - 2) tg.dead = true;
      };
      return tg;
    });
  }
  function balloons() {
    const A = { ...S(2), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x6aaa6a });
    let live = [], missed = 0, next = 0, rnd = null;
    return {
      id: 'balloons', name: 'Balloon Pop', icon: '🎈', color: 0xff5a8a, arena: A, better: 'high', unit: 'pts', items: ['mg-blaster'], respawnOnFall: true,
      rules: 'Pop the balloons before they float away. Miss 10 and it\'s over.',
      spawn: [A.x, A.y + 0.5, A.z],
      start(ctx) {
        live = [];
        missed = 0;
        next = 0;
        rnd = mulberry32(ctx.seed);
      },
      update(dt, ctx) {
        next -= dt;
        if (next <= 0) {
          next = Math.max(0.3, 1.3 - ctx.t * 0.012);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rnd(), 0.8, 0.55), roughness: 0.3 }));
          m.scale.y = 1.2;
          m.position.set(A.x + (rnd() - 0.5) * 26, A.y + 1, A.z + (rnd() - 0.5) * 26);
          scene.add(m);
          const tg = { mesh: m, speed: 2 + rnd() * 2 + ctx.t * 0.03, dead: false };
          tg.hit = () => {
            ctx.score++;
            k.puff(m.position, 0xff5a8a);
            k.beep(1800, 0.05, 'square', 0.03);
            tg.dead = true;
          };
          live.push(tg);
          ctx.targets.push(tg);
        }
        for (const tg of [...live]) {
          tg.mesh.position.y += tg.speed * dt;
          if (tg.mesh.position.y > A.y + 26 && !tg.dead) {
            tg.dead = true;
            missed++;
            if (missed >= 10) ctx.finish(ctx.score);
          }
          if (tg.dead) {
            k.remove(tg.mesh);
            live.splice(live.indexOf(tg), 1);
            ctx.targets.splice(ctx.targets.indexOf(tg), 1);
          }
        }
      },
      hud: (ctx) => `🎈 ${ctx.score} · missed ${missed}/10`,
      stop() {
        for (const tg of live) k.remove(tg.mesh);
        live = [];
      },
    };
  }
  function parkour() {
    const A = { ...S(3), w: 30, d: 76 };
    const z0 = A.z + A.d / 2 - 4;
    k.box({ x: A.x, top: A.y, z: z0, w: 8, d: 6, h: 1, color: 0x3a86ff });
    const rnd = mulberry32(303);
    let z = z0 - 3, x = A.x, top = A.y;
    for (let n = 0; n < 18; n++) {
      z -= 3.4 + rnd() * 1.4;
      x = Math.max(A.x - 11, Math.min(A.x + 11, x + (rnd() - 0.5) * 7));
      top += (rnd() - 0.4) * 1.2;
      k.box({ x, top, z, w: 1.8 + rnd(), d: 1.8 + rnd(), h: 0.6, color: new THREE.Color().setHSL(n / 18, 0.6, 0.55).getHex() });
    }
    const endZ = z - 4.5;
    const fin = k.box({ x, top, z: endZ, w: 5, d: 4, h: 0.6, color: 0xffc23a });
    fin.material.emissive = new THREE.Color(0x6a4a00);
    return {
      id: 'parkoursprint', name: 'Parkour Sprint', icon: '🏃', color: 0x3a86ff, arena: A, better: 'low', unit: 's', respawnOnFall: true,
      rules: 'Run the course to the gold pad as fast as you can. Falling sends you back (the clock keeps going).',
      spawn: [A.x, A.y + 0.5, z0],
      start() {},
      update(dt, ctx) {
        const f = k.feet();
        if (game.player.onGround && Math.abs(f.z - endZ) < 2.2 && Math.abs(f.x - x) < 2.6) ctx.finish(ctx.t);
      },
      hud: (ctx) => `⏱ ${ctx.t.toFixed(2)}s`,
      stop() {},
    };
  }
  function jetRings() {
    const A = { ...S(4), w: 60, d: 60 };
    k.box({ x: A.x, top: A.y, z: A.z + 22, w: 10, d: 10, h: 1, color: 0x4a4a56 });
    const rnd = mulberry32(404);
    const rings = [];
    for (let n = 0; n < 10; n++) {
      const p = new THREE.Vector3(A.x + (rnd() - 0.5) * 44, A.y + 6 + rnd() * 18, A.z + 14 - n * 4 + (rnd() - 0.5) * 10);
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.25, 8, 32), k.glow(0x7affc8, 0.6));
      m.position.copy(p);
      m.rotation.y = rnd() * Math.PI;
      scene.add(m);
      rings.push(m);
    }
    let next = 0;
    return {
      id: 'jetrings', name: 'Jetpack Rings', icon: '🚀', color: 0x7affc8, arena: A, better: 'low', unit: 's', respawnOnFall: true,
      rules: 'Fly through the 10 glowing rings in order. Hold Shift in the air for the jetpack!',
      spawn: [A.x, A.y + 0.5, A.z + 22],
      start() {
        next = 0;
        rings.forEach((r, i) => (r.material.emissiveIntensity = i === 0 ? 2.5 : 0.3));
      },
      update(dt, ctx) {
        const r = rings[next];
        r.rotation.z += dt;
        const eye = k.feet().clone().setY(k.feet().y + 1);
        if (eye.distanceTo(r.position) < 2.8) {
          r.material.emissiveIntensity = 0.05;
          k.beep(900 + next * 80, 0.1, 'triangle', 0.05);
          next++;
          if (next >= rings.length) return ctx.finish(ctx.t);
          rings[next].material.emissiveIntensity = 2.5;
        }
      },
      hud: (ctx) => `ring ${next + 1}/10 · ⏱ ${ctx.t.toFixed(2)}s`,
      stop() {
        rings.forEach((r) => (r.material.emissiveIntensity = 0.3));
      },
    };
  }
  function skydive() {
    const A = { ...S(5), w: 40, d: 40 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x4a8a4a });
    const bull = k.mesh(new THREE.CylinderGeometry(3, 3, 0.1, 32), 0xd83a3a, A.x, A.y + 0.05, A.z);
    void bull;
    for (const [r, c] of [[6, 0xffffff], [10, 0xd83a3a]]) {
      const ring = k.mesh(new THREE.RingGeometry(r - 1, r, 48), c, A.x, A.y + 0.04, A.z, { side: THREE.DoubleSide });
      ring.rotation.x = -Math.PI / 2;
    }
    const rings = [];
    let landed = false;
    return {
      id: 'skydive', name: 'Sky Dive', icon: '🪂', color: 0x5ab8ff, arena: A, better: 'high', unit: 'pts',
      rules: 'Fall from the sky through as many rings as you can (+10 each), then land on the bullseye for a bonus.',
      spawn: [A.x, A.y + 68, A.z], // above ~92m counts as out of the world (player.js)
      start(ctx) {
        landed = false;
        const rnd = mulberry32(ctx.seed);
        for (let n = 0; n < 11; n++) {
          const m = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 8, 32), k.glow(0xffd23d, 1));
          m.rotation.x = Math.PI / 2;
          m.position.set(A.x + (rnd() - 0.5) * 22, A.y + 60 - n * 5.3, A.z + (rnd() - 0.5) * 22);
          scene.add(m);
          rings.push({ m, done: false });
        }
      },
      update(dt, ctx) {
        const f = k.feet();
        for (const r of rings) {
          if (r.done || Math.abs(f.y + 1 - r.m.position.y) > 1.5) continue;
          r.done = true;
          if (Math.hypot(f.x - r.m.position.x, f.z - r.m.position.z) < 3.2) {
            ctx.score += 10;
            r.m.material.color.setHex(0x7affc8);
            r.m.material.emissive.setHex(0x2aff8a);
            k.beep(1200, 0.1, 'triangle', 0.05);
          } else r.m.visible = false;
        }
        if (!landed && game.player.onGround && f.y < A.y + 1) {
          landed = true;
          const d = Math.hypot(f.x - A.x, f.z - A.z);
          ctx.score += d <= 3 ? 50 : d <= 6 ? 25 : d <= 10 ? 10 : 0;
          ctx.finish(ctx.score);
        }
      },
      hud: (ctx) => `🪂 ${ctx.score} pts · ${Math.max(0, Math.round(k.feet().y - A.y))}m`,
      stop() {
        for (const r of rings) k.remove(r.m);
        rings.length = 0;
      },
    };
  }
  // Survive as long as you can on a platform (3 lives)
  function survive(i, id, name, icon, color, rules, hazard) {
    const A = { ...S(i), w: 22, d: 22 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x3a3a46 });
    const h = hazard(A);
    return {
      id, name, icon, color, arena: A, better: 'high', unit: 's', respawnOnFall: true, rules,
      spawn: [A.x, A.y + 0.5, A.z],
      start(ctx) {
        h.start(ctx);
      },
      update(dt, ctx) {
        ctx.score = ctx.t;
        h.update(dt, ctx);
      },
      hud: (ctx) => `${'❤️'.repeat(Math.max(0, ctx.lives))} · ⏱ ${ctx.t.toFixed(1)}s`,
      stop() {
        h.stop();
      },
    };
  }
  function bombDodge() {
    return survive(6, 'bombdodge', 'Bomb Dodge', '💣', 0xff7a3a, 'Bombs land where the red rings are. Survive as long as you can (3 lives).', (A) => {
      let live = [], next = 0, rnd = null;
      return {
        start(ctx) {
          live = [];
          next = 1;
          rnd = mulberry32(ctx.seed);
        },
        update(dt, ctx) {
          next -= dt;
          if (next <= 0) {
            next = Math.max(0.2, 1 - ctx.t * 0.012);
            const x = A.x + (rnd() - 0.5) * 20, z = A.z + (rnd() - 0.5) * 20;
            live.push({ x, z, life: 1.1, w: k.warn(x, A.y, z, 3), b: k.mesh(new THREE.SphereGeometry(0.6, 12, 8), 0x1a1a1a, x, A.y + 20, z) });
          }
          for (const b of [...live]) {
            b.life -= dt;
            b.b.position.y = A.y + 20 * Math.max(0, b.life / 1.1);
            if (b.life > 0) continue;
            k.puff(new THREE.Vector3(b.x, A.y + 1, b.z), 0xff7a1a);
            const f = k.feet();
            if (Math.hypot(f.x - b.x, f.z - b.z) < 3 && f.y < A.y + 2.5) {
              k.knock([(f.x - b.x) * 3, 8, (f.z - b.z) * 3]);
              ctx.loseLife();
            }
            k.remove(b.w);
            k.remove(b.b);
            live.splice(live.indexOf(b), 1);
          }
        },
        stop() {
          for (const b of live) {
            k.remove(b.w);
            k.remove(b.b);
          }
          live = [];
        },
      };
    });
  }
  function laserDodge() {
    return survive(7, 'laserdodge', 'Laser Dodge', '🔴', 0xff2a4a, 'Laser walls sweep across. Jump the low ones! Survive as long as you can (3 lives).', (A) => {
      let live = [], next = 0, rnd = null, cool = 0;
      return {
        start(ctx) {
          live = [];
          next = 1;
          rnd = mulberry32(ctx.seed);
        },
        update(dt, ctx) {
          next -= dt;
          cool -= dt;
          if (next <= 0) {
            next = Math.max(0.8, 2.4 - ctx.t * 0.02);
            const axis = rnd() < 0.5 ? 'x' : 'z', dir = rnd() < 0.5 ? 1 : -1;
            const m = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.15 : 22, 0.15, axis === 'x' ? 22 : 0.15), k.glow(0xff2a2a, 2.5));
            m.position.set(A.x - (axis === 'x' ? dir * 11 : 0), A.y + 0.45, A.z - (axis === 'z' ? dir * 11 : 0));
            scene.add(m);
            live.push({ m, axis, dir, speed: 7 + ctx.t * 0.08 });
          }
          const f = k.feet();
          for (const l of [...live]) {
            l.m.position[l.axis] += l.dir * l.speed * dt;
            if (cool <= 0 && Math.abs(f[l.axis] - l.m.position[l.axis]) < 0.4 && f.y < A.y + 0.8) {
              cool = 0.8;
              ctx.loseLife();
            }
            if (Math.abs(l.m.position[l.axis] - A[l.axis]) > 12) {
              k.remove(l.m);
              live.splice(live.indexOf(l), 1);
            }
          }
        },
        stop() {
          for (const l of live) k.remove(l.m);
          live = [];
        },
      };
    });
  }
  function memory() {
    const A = { ...S(8), w: 16, d: 16 };
    k.box({ ...A, top: A.y - 0.2, h: 1.5, color: 0x222228 });
    const tiles = [];
    for (let i = 0; i < 9; i++) {
      const x = A.x + ((i % 3) - 1) * 4, z = A.z + (Math.floor(i / 3) - 1) * 4;
      const m = k.box({ x, top: A.y, z, w: 3.6, d: 3.6, h: 0.3, color: 0x5a5a6a });
      tiles.push({ m, x, z, color: new THREE.Color().setHSL(i / 9, 0.8, 0.55) });
    }
    let seq = [], phase = 'show', step = 0, timer = 0, rnd = null, on = -1;
    const light = (i, lit) => tiles[i].m.material.color.copy(lit ? tiles[i].color : new THREE.Color(0x5a5a6a));
    const tileAt = (f) => tiles.findIndex((t) => Math.abs(f.x - t.x) < 1.8 && Math.abs(f.z - t.z) < 1.8);
    function newRound(ctx) {
      seq.push(Math.floor(rnd() * 9));
      phase = 'show';
      step = 0;
      timer = 1;
      void ctx;
    }
    return {
      id: 'memory', name: 'Memory Tiles', icon: '🧠', color: 0x9a6aff, arena: A, better: 'high', unit: 'pts', respawnOnFall: true,
      rules: 'Watch the tiles light up, then step on them in the same order. Each round adds one more.',
      spawn: [A.x, A.y + 0.5, A.z + 7],
      start(ctx) {
        rnd = mulberry32(ctx.seed);
        seq = [Math.floor(rnd() * 9), Math.floor(rnd() * 9)];
        newRound(ctx);
      },
      update(dt, ctx) {
        timer -= dt;
        if (phase === 'show') {
          if (timer <= 0) {
            tiles.forEach((_, i) => light(i, false));
            if (step >= seq.length) {
              phase = 'input';
              step = 0;
              on = tileAt(k.feet());
              return;
            }
            light(seq[step], true);
            k.beep(400 + seq[step] * 60, 0.3, 'sine', 0.05);
            step++;
            timer = 0.75;
          }
        } else if (phase === 'input') {
          const now = game.player.onGround ? tileAt(k.feet()) : -1;
          if (now !== on && now >= 0) {
            tiles.forEach((_, i) => light(i, i === now));
            if (now === seq[step]) {
              k.beep(400 + now * 60, 0.15, 'sine', 0.05);
              step++;
              if (step >= seq.length) {
                ctx.score++;
                phase = 'pause';
                timer = 1.2;
              }
            } else {
              k.beep(120, 0.4, 'sawtooth', 0.06);
              return ctx.finish(ctx.score);
            }
          }
          if (now !== -1 || !game.player.onGround) on = now;
        } else if (phase === 'pause' && timer <= 0) newRound(ctx);
      },
      hud: (ctx) => `🧠 round ${ctx.score + 1} · ${phase === 'input' ? `your turn ${step}/${seq.length}` : 'watch…'}`,
      stop() {
        tiles.forEach((_, i) => light(i, false));
      },
    };
  }
  function coins() {
    const A = { ...S(9), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x4a6a8a });
    for (const [dx, dz, h] of [[-8, -8, 2], [8, 8, 3], [-8, 8, 1.5], [8, -8, 4], [0, 0, 5]]) k.box({ x: A.x + dx, top: A.y + h, z: A.z + dz, w: 4, d: 4, h, color: 0x6a8aaa });
    let live = [], rnd = null;
    const spot = () => {
      const isl = rnd() < 0.4 ? [[-8, -8, 2], [8, 8, 3], [-8, 8, 1.5], [8, -8, 4], [0, 0, 5]][Math.floor(rnd() * 5)] : null;
      return isl ? new THREE.Vector3(A.x + isl[0], A.y + isl[2] + 1, A.z + isl[1]) : new THREE.Vector3(A.x + (rnd() - 0.5) * 26, A.y + 1, A.z + (rnd() - 0.5) * 26);
    };
    return {
      id: 'coincollector', name: 'Coin Collector', icon: '🪙', color: 0xffd23d, arena: A, better: 'high', unit: 'pts', respawnOnFall: true,
      rules: 'Grab as many coins as you can in 45 seconds.',
      spawn: [A.x, A.y + 0.5, A.z + 12],
      start(ctx) {
        rnd = mulberry32(ctx.seed);
        live = [];
      },
      update(dt, ctx) {
        if (ctx.t > 45) return ctx.finish(ctx.score);
        while (live.length < 4) {
          const p = spot();
          const m = k.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), 0xffd23d, p.x, p.y, p.z, { metalness: 0.9, roughness: 0.2, emissive: 0x6a4a00 });
          m.rotation.x = Math.PI / 2;
          live.push(m);
        }
        for (const m of [...live]) {
          m.rotation.z += dt * 3;
          if (k.feet().distanceTo(m.position.clone().setY(m.position.y - 0.8)) < 1.5) {
            ctx.score++;
            k.beep(1320, 0.08, 'square', 0.04);
            k.remove(m);
            live.splice(live.indexOf(m), 1);
          }
        }
      },
      hud: (ctx) => `🪙 ${ctx.score} · ${Math.max(0, 45 - ctx.t).toFixed(0)}s`,
      stop() {
        for (const m of live) k.remove(m);
        live = [];
      },
    };
  }
  function longJump() {
    const A = { ...S(10), w: 14, d: 80 };
    const z0 = A.z + A.d / 2 - 2;
    k.box({ x: A.x, top: A.y, z: z0 - 15, w: 6, d: 30, h: 1, color: 0xc85a3a });
    const ramp = k.box({ x: A.x, top: A.y + 0.9, z: z0 - 32, w: 6, d: 5, h: 1, color: 0xffc23a });
    ramp.rotation.x = 0.35; // lip up toward -Z
    ramp.updateMatrixWorld();
    const lip = z0 - 34.5;
    const stripZ = lip - 4 - 22;
    k.box({ x: A.x, top: A.y - 3, z: stripZ, w: 12, d: 44, h: 1, color: 0xe8d8a0 });
    for (let m = 10; m <= 40; m += 10) {
      k.box({ x: A.x, top: A.y - 2.95, z: lip - m, w: 12, d: 0.3, h: 0.1, color: 0x333333, collider: false });
      const s = makeSign(game, `${m}m`, { width: 1.6, height: 0.6 });
      s.position.set(A.x + 6.5, A.y - 1.8, lip - m);
      s.rotation.y = -Math.PI / 2;
    }
    let left = false;
    return {
      id: 'longjump', name: 'Long Jump', icon: '🦘', color: 0xc85a3a, arena: { ...A, y: A.y - 3 }, better: 'high', unit: 'm',
      rules: 'Sprint down the runway, launch off the ramp, and fly as far as you can. Double jump and air dash allowed!',
      spawn: [A.x, A.y + 0.5, z0 - 2],
      start() {
        left = false;
      },
      update(dt, ctx) {
        const f = k.feet();
        if (f.z < lip) left = true;
        if (left && game.player.onGround && f.y < A.y - 1) ctx.finish(Math.max(0, lip - f.z));
      },
      hud: () => (left ? `🦘 ${Math.max(0, lip - k.feet().z).toFixed(1)}m` : 'sprint (Shift) and jump off the ramp!'),
      stop() {},
    };
  }
  function skyTower() {
    const A = { ...S(11), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x4a4a6a });
    const rnd = mulberry32(1111);
    let x = A.x, z = A.z, top = A.y;
    for (let n = 0; n < 90; n++) {
      x = Math.max(A.x - 11, Math.min(A.x + 11, x + (rnd() - 0.5) * 6));
      z = Math.max(A.z - 11, Math.min(A.z + 11, z + (rnd() - 0.5) * 6));
      top += 1 + rnd() * 0.4;
      k.box({ x, top, z, w: 2.2, d: 2.2, h: 0.4, color: new THREE.Color().setHSL((n / 90) * 0.8, 0.6, 0.55).getHex() });
    }
    let peak = 0;
    return {
      id: 'skytower', name: 'Sky Tower', icon: '🧗', color: 0x9a7aff, arena: A, better: 'high', unit: 'm', respawnOnFall: true,
      rules: 'Climb as high as you can in 90 seconds. Fall and you start at the bottom (your best height counts).',
      spawn: [A.x, A.y + 0.5, A.z],
      start(ctx) {
        peak = 0;
        ctx.score = 0;
      },
      update(dt, ctx) {
        if (game.player.onGround) peak = Math.max(peak, k.feet().y - A.y);
        ctx.score = peak;
        if (ctx.t > 90) ctx.finish(peak);
      },
      hud: (ctx) => `🧗 ${peak.toFixed(1)}m · ${Math.max(0, 90 - ctx.t).toFixed(0)}s`,
      stop() {},
    };
  }
  function moles() {
    const A = { ...S(12), w: 18, d: 18 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x6a9a4a });
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const x = A.x + ((i % 3) - 1) * 5, z = A.z + (Math.floor(i / 3) - 1) * 5;
      const ring = k.mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 20), 0x3a2a1a, x, A.y + 0.05, z);
      void ring;
      const mole = k.mesh(new THREE.CapsuleGeometry(0.6, 0.6, 6, 12), 0x8a5a3a, x, A.y - 1, z);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        e.position.set(s * 0.22, 0.45, 0.5);
        mole.add(e);
      }
      holes.push({ x, z, mole, up: 0 });
    }
    let next = 0, rnd = null;
    return {
      id: 'moles', name: 'Mole Stomp', icon: '🐹', color: 0x8a5a3a, arena: A, better: 'high', unit: 'pts', respawnOnFall: true,
      rules: 'Moles pop out of the holes. Run onto a hole while its mole is up to stomp it! 45 seconds.',
      spawn: [A.x, A.y + 0.5, A.z + 8],
      start(ctx) {
        rnd = mulberry32(ctx.seed);
        next = 0.5;
      },
      update(dt, ctx) {
        if (ctx.t > 45) return ctx.finish(ctx.score);
        next -= dt;
        if (next <= 0) {
          next = Math.max(0.35, 1 - ctx.t * 0.015);
          const h = holes[Math.floor(rnd() * 9)];
          if (h.up <= 0) h.up = Math.max(0.7, 1.6 - ctx.t * 0.02);
        }
        const f = k.feet();
        for (const h of holes) {
          if (h.up > 0) {
            h.up -= dt;
            if (Math.hypot(f.x - h.x, f.z - h.z) < 1.4 && f.y < A.y + 1.5) {
              ctx.score++;
              h.up = 0;
              k.beep(500, 0.08, 'square', 0.05);
              k.puff(new THREE.Vector3(h.x, A.y + 0.5, h.z), 0x8a5a3a);
            }
          }
          const want = h.up > 0 ? A.y + 0.5 : A.y - 1;
          h.mole.position.y += (want - h.mole.position.y) * Math.min(1, dt * 14);
        }
      },
      hud: (ctx) => `🐹 ${ctx.score} · ${Math.max(0, 45 - ctx.t).toFixed(0)}s`,
      stop() {
        for (const h of holes) {
          h.up = 0;
          h.mole.position.y = A.y - 1;
        }
      },
    };
  }
  function maze() {
    const N = 10, C = 3.2;
    const A = { ...S(13), w: N * C + 4, d: N * C + 4 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x3a3a46 });
    const x0 = A.x - (N * C) / 2, z0 = A.z - (N * C) / 2;
    // Carve a perfect maze with a fixed seed (the same maze every time, so you can learn it)
    const rnd = mulberry32(1313);
    const walls = { h: Array.from({ length: N + 1 }, () => Array(N).fill(true)), v: Array.from({ length: N }, () => Array(N + 1).fill(true)) };
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const stack = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [cx, cz] = stack[stack.length - 1];
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => seen[cz + dz]?.[cx + dx] === false);
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const [dx, dz] = opts[Math.floor(rnd() * opts.length)];
      if (dx) walls.v[cz][Math.max(cx, cx + dx)] = false;
      else walls.h[Math.max(cz, cz + dz)][cx] = false;
      seen[cz + dz][cx + dx] = true;
      stack.push([cx + dx, cz + dz]);
    }
    walls.h[0][0] = false; // entrance
    walls.h[N][N - 1] = false; // exit
    const color = 0x6a7a9a;
    for (let z = 0; z <= N; z++) for (let x = 0; x < N; x++) if (walls.h[z][x]) k.box({ x: x0 + x * C + C / 2, top: A.y + 3, z: z0 + z * C, w: C + 0.3, d: 0.3, h: 3, color, solid: true });
    for (let z = 0; z < N; z++) for (let x = 0; x <= N; x++) if (walls.v[z][x]) k.box({ x: x0 + x * C, top: A.y + 3, z: z0 + z * C + C / 2, w: 0.3, d: C + 0.3, h: 3, color, solid: true });
    const exit = k.box({ x: x0 + (N - 0.5) * C, top: A.y + 0.05, z: z0 + N * C + 1, w: C, d: 2, h: 0.2, color: 0xffc23a, collider: false });
    exit.material.emissive = new THREE.Color(0x6a4a00);
    return {
      id: 'maze', name: 'Speed Maze', icon: '🌀', color: 0x6a7a9a, arena: A, better: 'low', unit: 's', respawnOnFall: true,
      rules: 'Find your way to the gold exit in the far corner. Same maze every time, so learn it!',
      spawn: [x0 + C / 2, A.y + 0.5, z0 - 1],
      start() {},
      update(dt, ctx) {
        const f = k.feet();
        if (f.z > z0 + N * C + 0.3 && f.x > x0 + (N - 1) * C) ctx.finish(ctx.t);
      },
      hud: (ctx) => `⏱ ${ctx.t.toFixed(2)}s`,
      stop() {},
    };
  }
  function waves() {
    const A = { ...S(14), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x3a2a2a });
    let wave = 0, ids = [], pause = 0;
    const types = ['zombie', 'spider', 'skeleton', 'boomer'];
    return {
      id: 'waves', name: 'Monster Waves', icon: '👹', color: 0x8a2a2a, arena: A, better: 'high', unit: 'pts', items: ['sword', 'bat'],
      rules: 'Waves of monsters attack. Each wave is bigger. How many can you clear?',
      spawn: [A.x, A.y + 0.5, A.z],
      start(ctx) {
        wave = 0;
        ids = [];
        pause = 2;
        ctx.score = 0;
      },
      update(dt, ctx) {
        const night = game.night;
        if (!night) return;
        ids = ids.filter((id) => night.monsters.has(id));
        if (ids.length === 0) {
          if (wave > 0 && pause <= 0) {
            ctx.score = wave;
            pause = 3;
            game.chat(`👹 Wave ${wave} cleared!`, true);
          }
          pause -= dt;
          if (pause <= 0) {
            wave++;
            for (let i = 0; i < 1 + wave; i++) {
              const a = Math.random() * Math.PI * 2;
              const p = new THREE.Vector3(A.x + Math.cos(a) * 12, A.y, A.z + Math.sin(a) * 12);
              const type = types[Math.min(types.length - 1, Math.floor(Math.random() * Math.min(4, 1 + wave / 2)))];
              ids.push(night.spawn(type, p, { keep: true, floor: { x0: A.x - A.w / 2, x1: A.x + A.w / 2, z0: A.z - A.d / 2, z1: A.z + A.d / 2, y: A.y } }).id);
            }
            game.chat(`👹 Wave ${wave}!`, true);
          }
        }
        if (game.player.health <= 0) ctx.finish(ctx.score);
      },
      hud: (ctx) => `👹 wave ${wave} · ${ids.length} left · cleared ${ctx.score}`,
      stop() {
        const night = game.night;
        for (const id of ids) {
          const m = night?.monsters.get(id);
          if (m) game.remotes.remove(id), night.monsters.delete(id);
        }
        ids = [];
      },
    };
  }
}
