// Minigame pack A (see minigames.js for how modes work, mgKit.js for the helpers):
//   Meteor Madness · Sweeper · Pillar Panic · Cannon Barrage · Lava Run (race)
//   Infection (tag) · Battle Royale · Minefield Dash (race)

import { SLOT, makeKit, mulberry32 } from './mgKit.js';

export function createPackA(game) {
  const k = makeKit(game);
  const { THREE, scene } = k;
  const { net, remotes } = game;
  return [meteor(), sweeper(), pillars(), cannons(), lavaRun(), infection(), royale(), minefield()];

  // ---------- Meteor Madness: dodge the red circles ----------
  function meteor() {
    const A = { ...SLOT(0), w: 36, d: 36 };
    k.box({ ...A, top: A.y, h: 2, color: 0x4a3a30 });
    let t = 0, plan = [], i = 0;
    const live = [];
    return {
      id: 'meteor', name: 'Meteor Madness', icon: '☄️', color: 0xff7a3a, arena: A,
      rules: 'Meteors fall where the red circles are. Last one standing wins.',
      spawnPoint: k.ring(A, 10),
      start({ seed }) {
        t = 0;
        i = 0;
        plan = k.schedule(seed, { gap0: 0.8, gap1: 0.18, ramp: 70 });
      },
      update(dt, ctx) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) {
          const [, a, b] = plan[i++];
          const p = new THREE.Vector3(A.x + (a - 0.5) * (A.w - 4), A.y, A.z + (b - 0.5) * (A.d - 4));
          const rock = k.mesh(new THREE.IcosahedronGeometry(1.3, 0), 0x5a3a2a, p.x, A.y + 40, p.z, { emissive: 0xff4a10, emissiveIntensity: 0.8, flatShading: true });
          live.push({ p, rock, warn: k.warn(p.x, A.y, p.z, 3.5), life: 1.3 });
        }
        for (let j = live.length - 1; j >= 0; j--) {
          const m = live[j];
          m.life -= dt;
          m.rock.position.y = A.y + 40 * Math.max(0, m.life / 1.3);
          if (m.life > 0) continue;
          k.puff(m.p.clone().setY(A.y + 1), 0xff7a1a);
          k.flash(m.p.clone().setY(A.y + 1));
          const f = k.feet();
          const d = Math.hypot(f.x - m.p.x, f.z - m.p.z);
          if (ctx.meAlive && d < 3.8 && f.y < A.y + 3) {
            const out = new THREE.Vector3(f.x - m.p.x, 0, f.z - m.p.z).setLength(13);
            k.knock([out.x, 9, out.z]);
            k.hurt(20, 'a meteor');
          }
          k.remove(m.rock);
          k.remove(m.warn);
          live.splice(j, 1);
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const m of live) {
          k.remove(m.rock);
          k.remove(m.warn);
        }
        live.length = 0;
      },
    };
  }

  // ---------- Sweeper: jump the spinning arms ----------
  function sweeper() {
    const A = { ...SLOT(1), w: 30, d: 30 };
    const R = 14;
    k.disc(A.x, A.y, A.z, R, 0x3a6aa0);
    k.mesh(new THREE.CylinderGeometry(1.2, 1.4, 3, 16), 0x2a2e36, A.x, A.y + 1.5, A.z);
    const arms = [0, 1, 2].map(() => {
      const g = new THREE.Group();
      g.position.set(A.x, A.y + 0.55, A.z);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(R, 0.45, 0.45), k.glow(0xff3a4a, 0.8));
      bar.position.x = R / 2;
      g.add(bar);
      g.visible = false;
      scene.add(g);
      return g;
    });
    let t = 0, ang = 0, cool = 0;
    return {
      id: 'sweeper', name: 'Sweeper', icon: '🌀', color: 0x3a6aa0, arena: A,
      rules: 'Jump over the spinning arms. Last one standing wins.',
      spawnPoint: k.ring(A, 9),
      start() {
        t = ang = 0;
      },
      update(dt, ctx) {
        t += dt;
        const n = t < 15 ? 1 : t < 35 ? 2 : 3;
        const speed = 1.1 + Math.min(2.2, t * 0.03);
        ang += speed * dt;
        arms.forEach((g, i) => {
          g.visible = i < n;
          g.rotation.y = ang + (i * Math.PI * 2) / n;
        });
        cool -= dt;
        if (!ctx.meAlive || cool > 0) return;
        const f = k.feet();
        const dx = f.x - A.x, dz = f.z - A.z;
        const r = Math.hypot(dx, dz);
        if (r < 1.5 || r > R || f.y > A.y + 1.0) return;
        const pa = Math.atan2(-dz, dx); // same convention as rotation.y
        for (let i = 0; i < n; i++) {
          let diff = (((pa - (ang + (i * Math.PI * 2) / n)) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          if (Math.abs(diff) * r < 0.7) {
            const tang = new THREE.Vector3(-dz, 0, dx).normalize().multiplyScalar(-15);
            k.knock([tang.x, 7, tang.z]);
            cool = 0.6;
          }
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const g of arms) g.visible = false;
      },
    };
  }

  // ---------- Pillar Panic: pillars sink one by one ----------
  function pillars() {
    const A = { ...SLOT(2), w: 30, d: 30 };
    const cols = [];
    for (let i = 0; i < 25; i++) {
      const x = A.x + ((i % 5) - 2) * 5.5, z = A.z + (Math.floor(i / 5) - 2) * 5.5;
      const m = k.box({ x, top: A.y, z, w: 3.4, d: 3.4, h: 6, color: 0x8a7a6a });
      cols.push({ m, x, z, base: m.position.y, sink: 0, warn: 0 });
    }
    let t = 0, plan = [], i = 0;
    return {
      id: 'pillars', name: 'Pillar Panic', icon: '🏛️', color: 0x8a7a6a, arena: A, items: ['boxing-glove'],
      rules: 'Pillars turn red, then sink. Punch people off. Last one standing wins.',
      spawnPoint: (j) => {
        const c = cols[(j * 7) % 25];
        return [c.x, A.y + 0.5, c.z];
      },
      start({ seed }) {
        t = 0;
        i = 0;
        const rnd = mulberry32(seed);
        const order = cols.map((_, j) => j).sort(() => rnd() - 0.5);
        plan = order.slice(0, 22).map((j, n) => [4 + n * Math.max(1.6, 3.5 - n * 0.1), j]);
        for (const c of cols) {
          c.sink = c.warn = 0;
          c.m.position.y = c.base;
          c.m.material.color.setHex(0x8a7a6a);
        }
      },
      update(dt) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) cols[plan[i++][1]].warn = 1.5;
        for (const c of cols) {
          if (c.warn > 0) {
            c.warn -= dt;
            c.m.material.color.setHex(Math.sin(t * 20) > 0 ? 0xff3a2a : 0x8a7a6a);
            if (c.warn <= 0) c.sink = 0.001;
          }
          if (c.sink > 0 && c.sink < 30) {
            c.sink += dt * 15;
            c.m.position.y = c.base - c.sink;
            c.m.updateMatrixWorld();
          }
        }
      },
      hud: () => `${cols.filter((c) => !c.sink).length} pillars left`,
      stop() {
        for (const c of cols) {
          c.m.position.y = c.base;
          c.m.material.color.setHex(0x8a7a6a);
          c.m.updateMatrixWorld();
        }
      },
    };
  }

  // ---------- Cannon Barrage: cannonballs fly across ----------
  function cannons() {
    const A = { ...SLOT(3), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x6a5a40 });
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [sx, sz] of sides) {
      const c = k.mesh(new THREE.CylinderGeometry(1, 1.3, 3, 16), 0x2a2a2a, A.x + sx * (A.w / 2 + 2), A.y + 1.2, A.z + sz * (A.d / 2 + 2), { metalness: 0.7 });
      c.rotation.set(sz ? Math.PI / 2 : 0, 0, sx ? Math.PI / 2 : 0);
    }
    let t = 0, plan = [], i = 0;
    const balls = [];
    return {
      id: 'cannons', name: 'Cannon Barrage', icon: '💣', color: 0x6a5a40, arena: A,
      rules: 'Cannonballs fly across the deck. Jump or dodge. Last one standing wins.',
      spawnPoint: k.ring(A, 6),
      start({ seed }) {
        t = 0;
        i = 0;
        plan = k.schedule(seed, { gap0: 1.3, gap1: 0.35, ramp: 70 });
      },
      update(dt, ctx) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) {
          const [, a, b, c] = plan[i++];
          const [sx, sz] = sides[Math.floor(a * 4)];
          const off = (b - 0.5) * (A.w - 4);
          const from = new THREE.Vector3(A.x + sx * (A.w / 2 + 2) + (sz ? off : 0), A.y + 1 + (c < 0.25 ? 1.2 : 0), A.z + sz * (A.d / 2 + 2) + (sx ? off : 0));
          const v = new THREE.Vector3(-sx, 0, -sz).multiplyScalar(13 + Math.min(10, t * 0.12));
          balls.push({ m: k.mesh(new THREE.SphereGeometry(1.1, 16, 12), 0x1a1a1a, from.x, from.y, from.z, { metalness: 0.8 }), v, life: 4 });
          k.puff(from, 0xcccccc);
        }
        const f = k.feet();
        for (let j = balls.length - 1; j >= 0; j--) {
          const b = balls[j];
          b.life -= dt;
          b.m.position.addScaledVector(b.v, dt);
          if (ctx.meAlive && b.m.position.distanceTo(f.clone().setY(f.y + 0.9)) < 1.7) {
            const d = b.v.clone().setLength(20);
            k.knock([d.x, 8, d.z]);
            b.life = 0;
          }
          if (b.life <= 0) {
            k.remove(b.m);
            balls.splice(j, 1);
          }
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const b of balls) k.remove(b.m);
        balls.length = 0;
      },
    };
  }

  // ---------- Lava Run: race across the lava ----------
  function lavaRun() {
    const A = { ...SLOT(4), w: 30, d: 74 };
    const lava = k.mesh(new THREE.PlaneGeometry(A.w, A.d), 0xff4a10, A.x, A.y - 4, A.z, { emissive: 0xff3a00, emissiveIntensity: 1.2 });
    lava.rotation.x = -Math.PI / 2;
    const z0 = A.z - A.d / 2 + 4;
    k.box({ x: A.x, top: A.y, z: z0, w: 12, d: 6, h: 1, color: 0x4a8a4a });
    const rnd = mulberry32(4242);
    const movers = [];
    let z = z0 + 5;
    for (let n = 0; n < 14; n++) {
      z += 4 + rnd() * 1.5;
      const x = A.x + (rnd() - 0.5) * 14;
      const top = A.y + Math.sin(n) * 1.2;
      const m = k.box({ x, top, z, w: 2.6 + rnd() * 1.5, d: 2.6, h: 0.8, color: 0x5a4a40 });
      if (n % 3 === 2) movers.push({ m, x, phase: rnd() * 6 });
    }
    const finishZ = z + 6;
    const finish = k.box({ x: A.x, top: A.y + 1, z: finishZ, w: 12, d: 5, h: 1, color: 0xffc23a });
    finish.material.emissive = new THREE.Color(0x6a4a00);
    let t = 0;
    return {
      id: 'lavarun', name: 'Lava Run', icon: '🌋', color: 0xff4a10, arena: A, respawnOnFall: true,
      rules: 'Race across the lava to the gold pad. Fall in and you start over. First across wins!',
      spawnPoint: (i, n) => [A.x + (i - (n - 1) / 2) * 1.2, A.y + 0.5, z0],
      start() {
        t = 0;
      },
      update(dt, ctx) {
        t += dt;
        for (const mv of movers) {
          const nx = mv.x + Math.sin(t * 1.3 + mv.phase) * 3;
          const dx = nx - mv.m.position.x;
          mv.m.position.x = nx;
          const f = k.feet();
          if (game.player.onGround && Math.abs(f.x - nx) < 1.6 && Math.abs(f.z - mv.m.position.z) < 1.4 && Math.abs(f.y - (mv.m.position.y + 0.4)) < 0.3) f.x += dx;
        }
        if (ctx.meAlive && game.player.onGround && Math.abs(k.feet().z - finishZ) < 2.5 && Math.abs(k.feet().x - A.x) < 6) ctx.win();
      },
      hud: () => `${t.toFixed(1)}s · reach the gold pad`,
      stop() {},
    };
  }

  // ---------- Infection: tag, you're it ----------
  function infection() {
    const A = { ...SLOT(5), w: 34, d: 34 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x3a4a3a });
    const rnd = mulberry32(55);
    for (let n = 0; n < 9; n++) k.box({ x: A.x + (rnd() - 0.5) * 26, top: A.y + 2.5, z: A.z + (rnd() - 0.5) * 26, w: 2 + rnd() * 3, d: 2 + rnd() * 3, h: 2.5, color: 0x5a6a5a, solid: true });
    const SURVIVE = 90; // healthy at the end = you win; everyone infected = the last one tagged wins
    let infected = new Set(), tagCool = 0, t = 0, players = [], lastTagged = null;
    const tags = new Map();
    function mark(id) {
      if (!infected.has(id)) lastTagged = id;
      infected.add(id);
      const rp = remotes.players.get(id);
      if (rp && !tags.has(id)) {
        const s = k.label('🧟 INFECTED', '#7aff6a', 0.6);
        s.position.y = 3.4;
        rp.mesh.add(s);
        tags.set(id, s);
      }
      if (id === net.id) game.chat('🧟 You are INFECTED! Tag everyone else!', true);
    }
    net.on('event', (msg) => {
      if (msg.kind === 'inf:tag' && typeof msg.target === 'number') mark(msg.target);
    });
    return {
      id: 'infection', name: 'Infection', icon: '🧟', color: 0x7aff6a, arena: A,
      rules: `One player is infected. Touch others to infect them. Stay healthy for ${SURVIVE}s to win (if everyone gets infected, the last one tagged wins).`,
      spawnPoint: k.ring(A, 12),
      start({ seed, players: ps }) {
        players = ps;
        t = 0;
        infected = new Set();
        mark(ps[seed % ps.length]);
        lastTagged = null;
      },
      update(dt, ctx) {
        t += dt;
        tagCool -= dt;
        if (!ctx.meAlive) return;
        const me = infected.has(net.id);
        if (me && tagCool <= 0) {
          for (const id of ctx.alive) {
            if (id === net.id || infected.has(id)) continue;
            const p = ctx.positionOf(id);
            if (p && p.distanceTo(k.feet()) < 1.8) {
              net.sendEvent({ kind: 'inf:tag', target: id });
              mark(id);
              tagCool = 0.5;
            }
          }
        }
        const healthy = ctx.alive.filter((id) => !infected.has(id));
        if (!healthy.length && lastTagged === net.id) ctx.win();
        else if (t >= SURVIVE && !me && healthy[0] === net.id) ctx.win();
      },
      hud: (ctx) => `${infected.has(net.id) ? '🧟 you are infected' : '🙂 run!'} · ${ctx.alive.filter((id) => !infected.has(id)).length} healthy · ${Math.max(0, SURVIVE - t).toFixed(0)}s`,
      stop() {
        for (const [id, s] of tags) remotes.players.get(id)?.mesh.remove(s);
        tags.clear();
        infected.clear();
      },
    };
  }

  // ---------- Battle Royale: the zone closes in ----------
  function royale() {
    const A = { ...SLOT(6), w: 50, d: 50 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x4a6a3a });
    const rnd = mulberry32(66);
    for (let n = 0; n < 14; n++) k.box({ x: A.x + (rnd() - 0.5) * 44, top: A.y + 2 + rnd() * 2, z: A.z + (rnd() - 0.5) * 44, w: 2 + rnd() * 4, d: 2 + rnd() * 4, h: 4, color: 0x6a6a72, solid: true });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x9a3aff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    wall.position.set(A.x, A.y + 7, A.z);
    wall.visible = false;
    scene.add(wall);
    let t = 0, hurtT = 0;
    const radius = () => Math.max(4, 34 - Math.max(0, t - 10) * 0.35);
    return {
      id: 'royale', name: 'Battle Royale', icon: '🪂', color: 0x9a3aff, arena: A, items: ['rocket-launcher', 'sword'],
      rules: 'The purple storm closes in. Stay inside and fight. Last one standing wins.',
      spawnPoint: k.ring(A, 20),
      start() {
        t = 0;
        wall.visible = true;
      },
      update(dt, ctx) {
        t += dt;
        const r = radius();
        wall.scale.set(r, 1, r);
        hurtT -= dt;
        const f = k.feet();
        if (ctx.meAlive && Math.hypot(f.x - A.x, f.z - A.z) > r && hurtT <= 0) {
          hurtT = 0.5;
          k.hurt(5, 'the storm');
        }
      },
      hud: () => `zone ${Math.round(radius())}m`,
      stop() {
        wall.visible = false;
      },
    };
  }

  // ---------- Minefield Dash: race across hidden mines ----------
  function minefield() {
    const A = { ...SLOT(7), w: 14, d: 70 };
    const z0 = A.z - A.d / 2 + 3, z1 = A.z + A.d / 2 - 3;
    k.box({ ...A, top: A.y, h: 1.5, color: 0x6a6a4a });
    const finish = k.box({ x: A.x, top: A.y + 0.1, z: z1, w: A.w, d: 4, h: 0.3, color: 0xffc23a });
    finish.material.emissive = new THREE.Color(0x6a4a00);
    let mines = [];
    const shown = [];
    net.on('event', (msg) => {
      if (msg.kind === 'mf:pop' && mines[msg.i]) reveal(msg.i);
    });
    function reveal(i) {
      const m = mines[i];
      if (m.popped) return;
      m.popped = true;
      shown.push(k.mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 12), 0xff2a1a, m.x, A.y + 0.1, m.z, { emissive: 0xff0000, emissiveIntensity: 1 }));
      k.puff(new THREE.Vector3(m.x, A.y + 0.8, m.z), 0xffa040);
    }
    return {
      id: 'minefield', name: 'Minefield Dash', icon: '💥', color: 0x6a6a4a, arena: A, respawnOnFall: true,
      rules: 'Hidden mines between you and the gold line. Step on one and you get blasted back. First across wins!',
      spawnPoint: (i, n) => [A.x + (i - (n - 1) / 2) * 1.1, A.y + 0.5, z0],
      start({ seed }) {
        for (const s of shown) k.remove(s);
        shown.length = 0;
        const rnd = mulberry32(seed);
        mines = Array.from({ length: 46 }, () => ({ x: A.x + (rnd() - 0.5) * (A.w - 1), z: z0 + 5 + rnd() * (z1 - z0 - 9), popped: false }));
      },
      update(dt, ctx) {
        if (!ctx.meAlive) return;
        const f = k.feet();
        mines.forEach((m, i) => {
          if (m.popped || Math.hypot(f.x - m.x, f.z - m.z) > 1.1 || f.y > A.y + 1) return;
          net.sendEvent({ kind: 'mf:pop', i });
          reveal(i);
          k.knock([(Math.random() - 0.5) * 6, 12, -16]);
          k.hurt(8, 'a mine');
        });
        if (game.player.onGround && f.z > z1 - 2) ctx.win();
      },
      hud: () => `${Math.max(0, Math.round(z1 - k.feet().z))}m to go`,
      stop() {},
    };
  }
}
