// Minigame pack C (see minigames.js for how modes work, mgKit.js for the helpers):
//   Lightning Storm · Avalanche · Merry-Go-Round · Trampoline Brawl · Popcorn Floor
//   Coin Rush (first to 12) · Frozen Lake · Grapple Islands · Mjolnir Mayhem

import { SLOT, makeKit, mulberry32 } from './mgKit.js';

export function createPackC(game) {
  const k = makeKit(game);
  const { THREE, scene } = k;
  const { net, CONFIG } = game;
  return [lightning(), avalanche(), merry(), trampoline(), popcorn(), coinRush(), frozenLake(), grapple(), mjolnir()];

  // ---------- Lightning Storm ----------
  function lightning() {
    const A = { ...SLOT(16), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x2a2e3a });
    k.mesh(new THREE.CylinderGeometry(16, 16, 2, 32), 0x3a3e4a, A.x, A.y + 26, A.z, { transparent: true, opacity: 0.7 });
    let t = 0, plan = [], i = 0;
    const live = [];
    const boltMat = new THREE.LineBasicMaterial({ color: 0xdff0ff });
    return {
      id: 'lightning', name: 'Lightning Storm', icon: '⚡', color: 0xbfd8ff, arena: A,
      rules: 'Lightning strikes where the blue rings glow. Getting hit hurts a lot. Last one standing wins.',
      spawnPoint: k.ring(A, 9),
      start({ seed }) {
        t = 0;
        i = 0;
        plan = k.schedule(seed, { gap0: 0.9, gap1: 0.15, ramp: 80 });
      },
      update(dt, ctx) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) {
          const [, a, b] = plan[i++];
          const x = A.x + (a - 0.5) * (A.w - 2), z = A.z + (b - 0.5) * (A.d - 2);
          live.push({ x, z, life: 1, warn: k.warn(x, A.y, z, 2.6, 0x7ab8ff) });
        }
        for (let j = live.length - 1; j >= 0; j--) {
          const s = live[j];
          s.life -= dt;
          if (s.life > 0) continue;
          const pts = [];
          for (let n = 0; n <= 8; n++) pts.push(new THREE.Vector3(s.x + (n && n < 8 ? (Math.random() - 0.5) * 2 : 0), A.y + 26 - n * 3.25, s.z + (n && n < 8 ? (Math.random() - 0.5) * 2 : 0)));
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat);
          scene.add(line);
          setTimeout(() => scene.remove(line), 150);
          k.flash(new THREE.Vector3(s.x, A.y + 2, s.z), 0xbfd8ff);
          k.beep(90, 0.3, 'sawtooth', 0.05);
          const f = k.feet();
          if (ctx.meAlive && Math.hypot(f.x - s.x, f.z - s.z) < 2.6) {
            k.hurt(34, 'lightning');
            k.knock([(f.x - s.x) * 3, 7, (f.z - s.z) * 3]);
          }
          k.remove(s.warn);
          live.splice(j, 1);
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const s of live) k.remove(s.warn);
        live.length = 0;
      },
    };
  }

  // ---------- Avalanche: snowballs roll down a slope ----------
  function avalanche() {
    const A = { ...SLOT(17), w: 26, d: 60 };
    const L = 54, TILT = 0.24;
    const slope = k.box({ x: A.x, top: A.y, z: A.z, w: A.w, d: L, h: 1, color: 0xeef4ff });
    slope.rotation.x = TILT; // high end at -Z
    slope.updateMatrixWorld();
    const heightAt = (z) => A.y - Math.tan(TILT) * (z - A.z);
    let t = 0, plan = [], i = 0;
    const balls = [];
    return {
      id: 'avalanche', name: 'Avalanche', icon: '🏔️', color: 0xeef4ff, arena: { ...A, y: A.y - 8 }, // the slope goes down ~7m
      rules: 'Giant snowballs roll down the mountain. Stay on the slope. Last one standing wins.',
      spawnPoint: (j, n) => [A.x + (j - (n - 1) / 2) * 1.6, heightAt(A.z) + 0.6, A.z],
      start({ seed }) {
        t = 0;
        i = 0;
        plan = k.schedule(seed, { gap0: 1.2, gap1: 0.35, ramp: 70 });
      },
      update(dt, ctx) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) {
          const [, a, b] = plan[i++];
          const r = 1.2 + b * 1.4;
          const x = A.x + (a - 0.5) * (A.w - 3);
          const z = A.z - L / 2 + 1;
          balls.push({ m: k.mesh(new THREE.IcosahedronGeometry(r, 1), 0xffffff, x, heightAt(z) + r, z, { flatShading: true, roughness: 0.9 }), r, x, z, speed: 10 + Math.min(12, t * 0.12) });
        }
        const f = k.feet();
        for (let j = balls.length - 1; j >= 0; j--) {
          const b = balls[j];
          b.z += b.speed * dt;
          b.m.position.set(b.x, heightAt(b.z) + b.r, b.z);
          b.m.rotation.x += (b.speed / b.r) * dt;
          if (ctx.meAlive && Math.hypot(f.x - b.x, f.z - b.z) < b.r + 0.6 && Math.abs(f.y - heightAt(b.z)) < b.r * 2) {
            k.knock([(f.x - b.x) * 2, 7, 16]);
            b.z += 999; // remove
          }
          if (b.z > A.z + L / 2 + 6) {
            k.remove(b.m);
            balls.splice(j, 1);
          }
        }
      },
      isOut: (p) => p.y < heightAt(Math.min(A.z + L / 2, p.z)) - 5,
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const b of balls) k.remove(b.m);
        balls.length = 0;
      },
    };
  }

  // ---------- Merry-Go-Round: it spins faster and faster ----------
  function merry() {
    const A = { ...SLOT(18), w: 30, d: 30 };
    const R = 13;
    k.disc(A.x, A.y, A.z, R, 0xffffff);
    const stripes = new THREE.Group();
    stripes.position.set(A.x, A.y + 0.02, A.z);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(R, 16, (i / 8) * Math.PI * 2, Math.PI / 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff3a6a : 0x3ab8ff }));
      s.rotation.x = -Math.PI / 2;
      stripes.add(s);
    }
    scene.add(stripes);
    k.mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 12), 0xffd23d, A.x, A.y + 2.5, A.z, { metalness: 0.7 });
    let t = 0, ang = 0;
    const omega = () => Math.min(2.4, 0.3 + t * 0.03);
    return {
      id: 'merry', name: 'Merry-Go-Round', icon: '🎠', color: 0xff3a6a, arena: A, items: ['boxing-glove'],
      rules: 'The ride spins faster and faster and flings you outward. Punch people off. Last one standing wins.',
      spawnPoint: k.ring(A, 6),
      start() {
        t = ang = 0;
      },
      update(dt) {
        t += dt;
        const w = omega();
        ang += w * dt;
        stripes.rotation.y = ang;
        const f = k.feet();
        const dx = f.x - A.x, dz = f.z - A.z, r = Math.hypot(dx, dz);
        if (game.player.onGround && r < R && Math.abs(f.y - A.y) < 0.4) {
          // Carry around, plus a push outward
          const a = Math.atan2(dz, dx) - w * dt;
          const nr = r + w * w * r * 0.035 * dt;
          f.x = A.x + Math.cos(a) * nr;
          f.z = A.z + Math.sin(a) * nr;
        }
      },
      hud: () => `${(omega() * 9.55).toFixed(0)} rpm`,
      stop() {},
    };
  }

  // ---------- Trampoline Brawl ----------
  function trampoline() {
    const A = { ...SLOT(19), w: 26, d: 26 };
    const pad = k.box({ ...A, top: A.y, h: 1.5, color: 0x2a8aff });
    pad.material.emissive = new THREE.Color(0x0a2a6a);
    let t = 0;
    return {
      id: 'trampoline', name: 'Trampoline Brawl', icon: '🤸', color: 0x2a8aff, arena: A, items: ['boxing-glove', 'rubber-chicken'],
      rules: 'The whole floor is a trampoline. Bounce and punch people off. Last one standing wins.',
      spawnPoint: k.ring(A, 8),
      start() {
        t = 0;
      },
      update(dt, ctx) {
        t += dt;
        const p = game.player;
        if (ctx.meAlive && p.onGround && k.on(p.position, A, A.x, A.z, A.w, A.d, 0.5)) {
          p.velocity.y = 13;
          p.onGround = false;
          k.beep(300 + Math.random() * 200, 0.08, 'sine', 0.03);
        }
      },
      hud: () => 'boing!',
      stop() {},
    };
  }

  // ---------- Popcorn Floor: tiles pop you into the air ----------
  function popcorn() {
    const A = { ...SLOT(20), w: 24, d: 24 };
    const tiles = [];
    for (let i = 0; i < 36; i++) {
      const x = A.x + ((i % 6) - 2.5) * 4, z = A.z + (Math.floor(i / 6) - 2.5) * 4;
      tiles.push({ m: k.box({ x, top: A.y, z, w: 4, d: 4, h: 1.5, color: 0xffe8a0 }), x, z, warn: 0, pop: 0 });
    }
    let t = 0, plan = [], i = 0;
    return {
      id: 'popcorn', name: 'Popcorn Floor', icon: '🍿', color: 0xffe8a0, arena: A,
      rules: 'Shaking tiles pop and launch whoever is on them. Land back on the floor. Last one standing wins.',
      spawnPoint: k.ring(A, 6),
      start({ seed }) {
        t = 0;
        i = 0;
        plan = k.schedule(seed, { gap0: 0.7, gap1: 0.18, ramp: 60 });
      },
      update(dt, ctx) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) tiles[Math.floor(plan[i++][1] * 36)].warn = 0.9;
        const f = k.feet();
        for (const tl of tiles) {
          if (tl.warn > 0) {
            tl.warn -= dt;
            tl.m.position.x = tl.x + Math.sin(t * 60) * 0.08;
            tl.m.material.color.setHex(0xffa040);
            if (tl.warn <= 0) {
              tl.pop = 0.3;
              tl.m.position.x = tl.x;
              k.beep(1200, 0.06, 'square', 0.04);
              if (ctx.meAlive && Math.abs(f.x - tl.x) < 2 && Math.abs(f.z - tl.z) < 2 && f.y < A.y + 1) k.knock([(Math.random() - 0.5) * 12, 20, (Math.random() - 0.5) * 12]);
            }
          }
          if (tl.pop > 0) {
            tl.pop -= dt;
            tl.m.position.y = A.y - 0.75 + Math.max(0, tl.pop) * 3;
            if (tl.pop <= 0) tl.m.material.color.setHex(0xffe8a0);
          }
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const tl of tiles) {
          tl.warn = tl.pop = 0;
          tl.m.position.set(tl.x, A.y - 0.75, tl.z);
          tl.m.material.color.setHex(0xffe8a0);
        }
      },
    };
  }

  // ---------- Coin Rush: first to 12 coins ----------
  function coinRush() {
    const A = { ...SLOT(21), w: 34, d: 34 };
    const GOAL = 12;
    k.box({ ...A, top: A.y, h: 1.5, color: 0x4a7a5a });
    for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) k.box({ x: A.x + dx, top: A.y + 1.5, z: A.z + dz, w: 6, d: 6, h: 1.5, color: 0x6a9a6a });
    let coins = [], scores = new Map();
    const meshes = new Map();
    const take = (i, who) => {
      const c = coins[i];
      if (!c || c.taken) return;
      c.taken = true;
      const m = meshes.get(i);
      if (m) {
        k.remove(m);
        meshes.delete(i);
      }
      scores.set(who, (scores.get(who) || 0) + 1);
    };
    net.on('event', (msg) => {
      if (msg.kind === 'coin:take') take(msg.i, msg.from);
    });
    return {
      id: 'coinrush', name: 'Coin Rush', icon: '🪙', color: 0xffd23d, arena: A, items: ['bat'], respawnOnFall: true,
      rules: `Grab the gold coins. First to ${GOAL} wins! Bats to knock rivals away.`,
      spawnPoint: k.ring(A, 13),
      start({ seed }) {
        for (const m of meshes.values()) k.remove(m);
        meshes.clear();
        scores = new Map();
        const r = mulberry32(seed);
        coins = Array.from({ length: 200 }, () => {
          const hi = r() < 0.35;
          const dx = hi ? [-9, 9][Math.floor(r() * 2)] + (r() - 0.5) * 4 : (r() - 0.5) * 30;
          const dz = hi ? [-9, 9][Math.floor(r() * 2)] + (r() - 0.5) * 4 : (r() - 0.5) * 30;
          return { x: A.x + dx, y: A.y + (hi ? 2.5 : 1), z: A.z + dz, taken: false };
        });
      },
      update(dt, ctx) {
        // Keep the next 6 untaken coins on the field
        let shown = 0;
        for (let i = 0; i < coins.length && shown < 6; i++) {
          const c = coins[i];
          if (c.taken) continue;
          shown++;
          if (!meshes.has(i)) {
            const m = k.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), 0xffd23d, c.x, c.y, c.z, { metalness: 0.9, roughness: 0.2, emissive: 0x6a4a00 });
            m.rotation.x = Math.PI / 2;
            meshes.set(i, m);
          }
          meshes.get(i).rotation.z += dt * 3;
          if (ctx.meAlive && k.feet().distanceTo(new THREE.Vector3(c.x, c.y - 0.8, c.z)) < 1.6) {
            net.sendEvent({ kind: 'coin:take', i });
            take(i, net.id);
            k.beep(1320, 0.1, 'square', 0.04);
            if ((scores.get(net.id) || 0) >= GOAL) ctx.win();
          }
        }
      },
      hud: (ctx) => {
        const best = [...scores].sort((a, b) => b[1] - a[1])[0];
        return `🪙 you ${scores.get(net.id) || 0}/${GOAL}${best && best[0] !== net.id ? ` · leader ${ctx.nameOf(best[0])} ${best[1]}` : ''}`;
      },
      stop() {
        for (const m of meshes.values()) k.remove(m);
        meshes.clear();
      },
    };
  }

  // ---------- Frozen Lake: slippery ice, freeze rays and bats ----------
  function frozenLake() {
    const A = { ...SLOT(22), w: 32, d: 32 };
    const R = 15;
    const ice = k.disc(A.x, A.y, A.z, R, 0xcff6ff);
    ice.material.roughness = 0.05;
    ice.material.metalness = 0.2;
    let base = null, slick = false;
    const setSlick = (on) => {
      if (on === slick) return;
      slick = on;
      if (on) {
        base = { f: CONFIG.groundFriction, a: CONFIG.groundAccel };
        CONFIG.groundFriction = base.f * 0.12;
        CONFIG.groundAccel = base.a * 0.45;
      } else if (base) {
        CONFIG.groundFriction = base.f;
        CONFIG.groundAccel = base.a;
      }
    };
    return {
      id: 'frozenlake', name: 'Frozen Lake', icon: '🧊', color: 0xcff6ff, arena: A, items: ['freeze-ray', 'bat'],
      rules: 'The ice is slippery. Freeze people, then bat them off. Last one standing wins.',
      spawnPoint: k.ring(A, 9),
      start() {},
      update(dt, ctx) {
        const f = k.feet();
        setSlick(ctx.meAlive && Math.hypot(f.x - A.x, f.z - A.z) < R + 1 && Math.abs(f.y - A.y) < 2);
      },
      hud: () => 'slippery!',
      stop() {
        setSlick(false);
      },
    };
  }

  // ---------- Grapple Islands ----------
  function grapple() {
    const A = { ...SLOT(23), w: 50, d: 50 };
    const rnd = mulberry32(23);
    const isles = [];
    for (let i = 0; i < 9; i++) {
      const x = A.x + ((i % 3) - 1) * 16 + (rnd() - 0.5) * 4, z = A.z + (Math.floor(i / 3) - 1) * 16 + (rnd() - 0.5) * 4;
      const top = A.y + (rnd() - 0.5) * 6;
      k.disc(x, top, z, 3.5 + rnd() * 1.5, 0x6a8a4a, 2);
      k.mesh(new THREE.ConeGeometry(3.5, 5, 7), 0x5a4a3a, x, top - 3.5, z).rotation.x = Math.PI;
      isles.push([x, top, z]);
    }
    return {
      id: 'grapple', name: 'Grapple Islands', icon: '🪝', color: 0x6a8a4a, arena: { ...A, y: A.y - 3 },
      items: ['grappling-hook', 'giant-axe'],
      rules: 'Floating islands, grappling hooks and giant axes. Swing between islands and chop people off.',
      spawnPoint: (i) => {
        const [x, y, z] = isles[i % 9];
        return [x, y + 0.5, z];
      },
      start() {},
      update() {},
      hud: () => 'hook and chop!',
      stop() {},
    };
  }

  // ---------- Mjolnir Mayhem ----------
  function mjolnir() {
    const A = { ...SLOT(24), w: 32, d: 32 };
    const R = 14;
    k.disc(A.x, A.y, A.z, R, 0x5a5a6a);
    const rim = k.mesh(new THREE.TorusGeometry(R, 0.6, 8, 64), 0x8a8a9a, A.x, A.y + 0.2, A.z, { metalness: 0.6 });
    rim.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.mesh(new THREE.CylinderGeometry(0.5, 0.6, 6, 10), 0x7a7a8a, A.x + Math.cos(a) * (R + 1), A.y + 3, A.z + Math.sin(a) * (R + 1));
    }
    return {
      id: 'mjolnir', name: 'Mjolnir Mayhem', icon: '🔨', color: 0x7a7a8a, arena: A, items: ['mjolnir', 'banhammer'],
      rules: 'Everyone gets Mjolnir and the Banhammer. Smash! Last one standing wins.',
      spawnPoint: k.ring(A, 9),
      start() {},
      update() {},
      hud: () => 'smash!',
      stop() {},
    };
  }
}
