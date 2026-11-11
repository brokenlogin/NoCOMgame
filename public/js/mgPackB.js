// Minigame pack B (see minigames.js for how modes work, mgKit.js for the helpers):
//   Tornado Alley · Laser Spinner · Simon Says · Tower Climb (race) · Island Hop
//   Musical Pads · Red Light Green Light (race) · Glass Bridge (race)

import { SLOT, makeKit, mulberry32 } from './mgKit.js';

export function createPackB(game) {
  const k = makeKit(game);
  const { THREE, scene } = k;
  const { net } = game;
  return [tornado(), laserSpinner(), simon(), tower(), islandHop(), musicalPads(), redLight(), glassBridge()];

  // ---------- Tornado Alley ----------
  function tornado() {
    const A = { ...SLOT(8), w: 34, d: 34 };
    const R = 16;
    k.disc(A.x, A.y, A.z, R, 0x8a9a6a);
    const twisters = [0, 1, 2, 3, 4].map(() => {
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.45, 0.25, 6, 20), new THREE.MeshStandardMaterial({ color: 0xbfc8d0, transparent: true, opacity: 0.55 }));
        c.rotation.x = Math.PI / 2;
        c.position.y = i * 1.2;
        g.add(c);
      }
      g.visible = false;
      scene.add(g);
      return g;
    });
    let t = 0, seeds = [], cool = 0;
    return {
      id: 'tornado', name: 'Tornado Alley', icon: '🌪️', color: 0xbfc8d0, arena: A,
      rules: 'Tornadoes roam the field and fling you sky-high. Last one standing wins.',
      spawnPoint: k.ring(A, 11),
      start({ seed }) {
        t = 0;
        const r = mulberry32(seed);
        seeds = twisters.map(() => [r() * 6, 0.2 + r() * 0.3, 0.2 + r() * 0.3]);
      },
      update(dt, ctx) {
        t += dt;
        cool -= dt;
        const n = Math.min(5, 2 + Math.floor(t / 15));
        twisters.forEach((g, i) => {
          g.visible = i < n;
          if (!g.visible) return;
          const [ph, fx, fz] = seeds[i];
          g.position.set(A.x + Math.sin(t * fx + ph) * (R - 3), A.y, A.z + Math.cos(t * fz + ph * 1.7) * (R - 3));
          g.rotation.y += dt * 6;
          g.children.forEach((c, j) => (c.position.x = Math.sin(t * 3 + j) * 0.3));
          const f = k.feet();
          if (ctx.meAlive && cool <= 0 && Math.hypot(f.x - g.position.x, f.z - g.position.z) < 2.2 && f.y < A.y + 6) {
            const out = new THREE.Vector3(f.x - g.position.x, 0, f.z - g.position.z).setLength(11);
            k.knock([out.x, 18, out.z]);
            cool = 1;
          }
        });
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        for (const g of twisters) g.visible = false;
      },
    };
  }

  // ---------- Laser Spinner: two rings of ankle-high lasers spinning opposite ways ----------
  function laserSpinner() {
    const A = { ...SLOT(9), w: 30, d: 30 };
    const R = 14;
    k.disc(A.x, A.y, A.z, R, 0x1a1a24);
    k.mesh(new THREE.CylinderGeometry(1, 1, 2, 16), 0x3a3a46, A.x, A.y + 1, A.z, { emissive: 0xff2a2a, emissiveIntensity: 0.4 });
    const make = (r0, r1) => {
      const g = new THREE.Group();
      g.position.set(A.x, A.y + 0.45, A.z);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(r1 - r0, 0.12, 0.12), k.glow(0xff2a2a, 2.5));
        const holder = new THREE.Group();
        holder.rotation.y = (i * Math.PI) / 2;
        b.position.x = (r0 + r1) / 2;
        holder.add(b);
        g.add(holder);
      }
      g.visible = false;
      scene.add(g);
      return g;
    };
    const inner = make(1, 7), outer = make(7.4, R);
    let t = 0, a1 = 0, a2 = 0;
    const hit = (f, ang, r0, r1, arms) => {
      const dx = f.x - A.x, dz = f.z - A.z, r = Math.hypot(dx, dz);
      if (r < r0 || r > r1) return false;
      const pa = Math.atan2(-dz, dx);
      for (let i = 0; i < arms; i++) {
        const diff = ((((pa - ang - (i * Math.PI) / 2) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (Math.abs(diff) * r < 0.35) return true;
      }
      return false;
    };
    return {
      id: 'laserspin', name: 'Laser Spinner', icon: '🔴', color: 0xff2a2a, arena: A,
      rules: 'Two rings of lasers spin opposite ways at ankle height. Jump them. Touch one and you\'re out!',
      spawnPoint: k.ring(A, 7.2),
      start() {
        t = a1 = a2 = 0;
        inner.visible = outer.visible = true;
      },
      update(dt, ctx) {
        t += dt;
        const s = 0.6 + Math.min(1.6, t * 0.02);
        a1 += s * dt;
        a2 -= s * 0.8 * dt;
        inner.rotation.y = a1;
        outer.rotation.y = a2;
        const f = k.feet();
        if (t > 3 && ctx.meAlive && f.y < A.y + 0.75 && (hit(f, a1, 1, 7, 4) || hit(f, a2, 7.4, R, 4))) {
          game.chat('🔴 Zapped!', true);
          ctx.knockMeOut();
        }
      },
      hud: () => `${Math.floor(t)}s`,
      stop() {
        inner.visible = outer.visible = false;
      },
    };
  }

  // ---------- Simon Says ----------
  function simon() {
    const A = { ...SLOT(10), w: 24, d: 24 };
    const Q = [['RED', 0xd83a3a, -1, -1], ['BLUE', 0x3a6ad8, 1, -1], ['GREEN', 0x3ab84a, -1, 1], ['YELLOW', 0xe8c83a, 1, 1]];
    for (const [, color, sx, sz] of Q) k.box({ x: A.x + sx * 6, top: A.y, z: A.z + sz * 6, w: 12, d: 12, h: 1.5, color });
    const sign = k.label('Simon says...', '#ffffff', 2);
    sign.position.set(A.x, A.y + 8, A.z);
    sign.visible = false;
    scene.add(sign);
    let t = 0, plan = [], cur = null, i = 0, failed = false, moved = 0, jumped = false;
    const quad = (f) => Q.find(([, , sx, sz]) => Math.sign(f.x - A.x) === sx && Math.sign(f.z - A.z) === sz)?.[0];
    function setText(text) {
      const s = k.label(text, text.startsWith('Simon') ? '#7affc8' : '#ffd23d', 2);
      sign.material.map = s.material.map;
      sign.material.needsUpdate = true;
    }
    return {
      id: 'simon', name: 'Simon Says', icon: '🗣️', color: 0x3ab84a, arena: A,
      rules: 'Only do it if Simon says! Wrong move and you\'re out.',
      spawnPoint: k.ring(A, 3),
      start({ seed }) {
        t = 0;
        i = 0;
        cur = null;
        const r = mulberry32(seed);
        plan = [];
        for (let n = 0; n < 60; n++) {
          const simonSays = r() < 0.72;
          const kind = ['jump', 'freeze', 'color', 'color'][Math.floor(r() * 4)];
          plan.push({ at: 3 + n * Math.max(3.2, 5 - n * 0.08), simonSays, kind, color: Q[Math.floor(r() * 4)][0] });
        }
        sign.visible = true;
        setText('Get ready...');
      },
      update(dt, ctx) {
        t += dt;
        if (i < plan.length && plan[i].at <= t) {
          cur = { ...plan[i++], end: t + 2.6 };
          failed = false;
          moved = 0;
          jumped = false;
          const what = cur.kind === 'jump' ? 'JUMP!' : cur.kind === 'freeze' ? 'FREEZE!' : `go to ${cur.color}!`;
          setText(`${cur.simonSays ? 'Simon says ' : ''}${what}`);
          k.beep(cur.simonSays ? 880 : 520, 0.2);
        }
        if (!cur || !ctx.meAlive) return;
        const p = game.player;
        if (!p.onGround) jumped = true;
        moved += Math.hypot(p.velocity.x, p.velocity.z) * dt;
        if (t >= cur.end) {
          if (cur.simonSays) {
            if (cur.kind === 'jump' && !jumped) failed = true;
            if (cur.kind === 'freeze' && moved > 0.8) failed = true;
            if (cur.kind === 'color' && quad(p.position) !== cur.color) failed = true;
          } else if (cur.kind === 'jump' && jumped) failed = true;
          else if (cur.kind === 'freeze' && moved < 0.05) failed = false;
          if (failed) {
            game.chat(cur.simonSays ? '🗣️ Simon said so! You\'re out.' : '🗣️ Simon didn\'t say! You\'re out.', true);
            ctx.knockMeOut();
          }
          cur = null;
          setText('...');
        }
      },
      hud: () => (cur ? `${Math.max(0, cur.end - t).toFixed(1)}s` : 'listen...'),
      stop() {
        sign.visible = false;
      },
    };
  }

  // ---------- Tower Climb: race to the crown ----------
  function tower() {
    const A = { ...SLOT(11), w: 30, d: 30 };
    k.box({ ...A, top: A.y, h: 1.5, color: 0x5a5a6a });
    k.mesh(new THREE.CylinderGeometry(3, 3.5, 36, 16), 0x4a4a56, A.x, A.y + 18, A.z);
    const rnd = mulberry32(11);
    let top = A.y;
    for (let n = 0; n < 30; n++) {
      const a = n * 0.55;
      top += 1.05 + rnd() * 0.15;
      k.box({ x: A.x + Math.cos(a) * 6, top, z: A.z + Math.sin(a) * 6, w: 2.6, d: 2.6, h: 0.5, color: new THREE.Color().setHSL(n / 30, 0.6, 0.55).getHex() });
    }
    const crown = k.box({ x: A.x, top: top + 1.2, z: A.z, w: 5, d: 5, h: 0.6, color: 0xffc23a });
    crown.material.emissive = new THREE.Color(0x6a4a00);
    const crownTop = top + 1.2;
    let t = 0;
    return {
      id: 'tower', name: 'Tower Climb', icon: '🗼', color: 0xffc23a, arena: A, items: ['bat', 'plunger'], respawnOnFall: true,
      rules: 'Race up the spiral to the golden crown. Bats and plungers to slow the others. First to the top wins!',
      spawnPoint: k.ring(A, 11),
      start() {
        t = 0;
      },
      update(dt, ctx) {
        t += dt;
        const f = k.feet();
        if (ctx.meAlive && game.player.onGround && Math.abs(f.y - crownTop) < 0.4 && Math.hypot(f.x - A.x, f.z - A.z) < 3) ctx.win();
      },
      hud: () => `${Math.max(0, Math.round(crownTop - k.feet().y))}m to the top`,
      stop() {},
    };
  }

  // ---------- Island Hop: moving islands that vanish one by one ----------
  function islandHop() {
    const A = { ...SLOT(12), w: 40, d: 40 };
    const isles = [];
    for (let n = 0; n < 14; n++) {
      const r = 4 + (n % 3) * 5.5;
      const m = k.disc(A.x, A.y, A.z, 2.6, new THREE.Color().setHSL(0.3 + n * 0.03, 0.5, 0.45).getHex(), 1.2);
      isles.push({ m, r, a0: (n / 14) * Math.PI * 6, speed: (n % 2 ? 1 : -1) * (0.12 + (n % 3) * 0.05), gone: 0, warn: 0 });
    }
    let t = 0, plan = [], i = 0;
    const posOf = (s) => [A.x + Math.cos(s.a0 + t * s.speed) * s.r, A.z + Math.sin(s.a0 + t * s.speed) * s.r];
    return {
      id: 'islandhop', name: 'Island Hop', icon: '🏝️', color: 0x4ab86a, arena: A, items: ['boxing-glove'],
      rules: 'The islands drift and blink out one by one. Hop to stay alive. Last one standing wins.',
      spawnPoint: (j) => {
        const s = isles[(j * 5) % 14];
        const [x, z] = posOf(s);
        return [x, A.y + 0.5, z];
      },
      start({ seed }) {
        t = 0;
        i = 0;
        const r = mulberry32(seed);
        const order = isles.map((_, j) => j).sort(() => r() - 0.5);
        plan = order.slice(0, 12).map((j, n) => [6 + n * Math.max(3, 6 - n * 0.3), j]);
        for (const s of isles) {
          s.gone = s.warn = 0;
          s.m.visible = true;
          k.collide(s.m);
        }
      },
      update(dt) {
        t += dt;
        while (i < plan.length && plan[i][0] <= t) isles[plan[i++][1]].warn = 2;
        const f = k.feet();
        for (const s of isles) {
          const [x, z] = posOf(s);
          const dx = x - s.m.position.x, dz = z - s.m.position.z;
          // Carry anyone standing on it
          if (!s.gone && game.player.onGround && Math.hypot(f.x - s.m.position.x, f.z - s.m.position.z) < 2.6 && Math.abs(f.y - A.y) < 0.4) {
            f.x += dx;
            f.z += dz;
          }
          s.m.position.x = x;
          s.m.position.z = z;
          if (s.warn > 0) {
            s.warn -= dt;
            s.m.visible = Math.sin(t * 25) > 0;
            if (s.warn <= 0) {
              s.gone = 1;
              s.m.visible = false;
              k.uncollide(s.m);
            }
          }
        }
      },
      hud: () => `${isles.filter((s) => !s.gone).length} islands left`,
      stop() {
        for (const s of isles) {
          s.m.visible = true;
          k.collide(s.m);
        }
      },
    };
  }

  // ---------- Musical Pads ----------
  function musicalPads() {
    const A = { ...SLOT(13), w: 28, d: 28 };
    const tiles = [];
    for (let i = 0; i < 49; i++) tiles.push(k.box({ x: A.x + ((i % 7) - 3) * 4, top: A.y, z: A.z + (Math.floor(i / 7) - 3) * 4, w: 4, d: 4, h: 1.5, color: 0x333333 }));
    const pads = [];
    let t = 0, phase = 'music', phaseEnd = 0, rnd = null, beatT = 0;
    const PAD_Y = A.y + 0.35;
    function clearPads() {
      for (const p of pads) k.remove(p.m);
      pads.length = 0;
    }
    return {
      id: 'musical', name: 'Musical Pads', icon: '🎶', color: 0xff5ad0, arena: A, items: ['rubber-chicken'],
      rules: 'Dance while the music plays. When it stops, get on a gold pad. There\'s one too few!',
      spawnPoint: k.ring(A, 8),
      start({ seed }) {
        t = 0;
        rnd = mulberry32(seed);
        phase = 'music';
        phaseEnd = 6 + rnd() * 5;
        clearPads();
      },
      update(dt, ctx) {
        t += dt;
        tiles.forEach((m, i) => m.material.color.setHSL(((i * 0.13 + t * (phase === 'music' ? 0.5 : 0)) % 1), 0.7, phase === 'music' ? 0.5 : 0.2));
        if (phase === 'music') {
          beatT -= dt;
          if (beatT <= 0) {
            beatT = 0.25;
            k.beep([523, 659, 784, 659][Math.floor(t * 4) % 4], 0.12, 'triangle', 0.03);
          }
          if (t >= phaseEnd) {
            phase = 'grab';
            phaseEnd = t + 4;
            const n = Math.max(1, ctx.alive.length - 1);
            for (let j = 0; j < n; j++) {
              const x = A.x + (rnd() - 0.5) * 22, z = A.z + (rnd() - 0.5) * 22;
              const m = k.box({ x, top: PAD_Y, z, w: 2.4, d: 2.4, h: 0.3, color: 0xffc23a, collider: false });
              m.material.emissive = new THREE.Color(0x8a6a00);
              pads.push({ m, x, z });
            }
            k.beep(220, 0.4, 'sawtooth', 0.06);
          }
        } else if (t >= phaseEnd) {
          // Am I on a pad that nobody with a lower id is also on?
          if (ctx.meAlive) {
            const f = k.feet();
            const mine = pads.find((p) => Math.abs(f.x - p.x) < 1.4 && Math.abs(f.z - p.z) < 1.4);
            const taken = mine && ctx.alive.some((id) => id < net.id && (() => {
              const q = ctx.positionOf(id);
              return q && Math.abs(q.x - mine.x) < 1.4 && Math.abs(q.z - mine.z) < 1.4;
            })());
            if (!mine || taken) {
              game.chat(mine ? '🎶 Someone got there first!' : '🎶 No pad! You\'re out.', true);
              ctx.knockMeOut();
            }
          }
          clearPads();
          phase = 'music';
          phaseEnd = t + 1.5 + 5 + rnd() * 6;
        }
      },
      hud: () => (phase === 'music' ? '🎵 dance!' : `🛑 GET ON A PAD! ${Math.max(0, phaseEnd - t).toFixed(1)}s`),
      stop() {
        clearPads();
      },
    };
  }

  // ---------- Red Light, Green Light ----------
  function redLight() {
    const A = { ...SLOT(14), w: 24, d: 70 };
    const z0 = A.z + A.d / 2 - 3, z1 = A.z - A.d / 2 + 4;
    k.box({ ...A, top: A.y, h: 1.5, color: 0xc8b88a });
    k.box({ x: A.x, top: A.y + 0.05, z: z1, w: A.w, d: 0.6, h: 0.2, color: 0xd83a3a, collider: false });
    // The doll at the finish
    const doll = new THREE.Group();
    doll.position.set(A.x, A.y, z1 - 4);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 5, 16), new THREE.MeshStandardMaterial({ color: 0xff8a3a }));
    body.position.y = 2.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffd8b0 }));
    head.position.y = 6.2;
    const eyes = new THREE.Group();
    eyes.position.y = 6.4;
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), k.glow(0x111111, 0));
      e.position.set(s * 0.45, 0, 1.15);
      eyes.add(e);
    }
    doll.add(body, head, eyes);
    scene.add(doll);
    let t = 0, plan = [], light = 'green', grace = 0;
    return {
      id: 'redlight', name: 'Red Light, Green Light', icon: '🚦', color: 0xd83a3a, arena: A, respawnOnFall: true,
      rules: 'Run on green. Freeze on red or you go back to the start. First to the red line wins!',
      spawnPoint: (i, n) => [A.x + (i - (n - 1) / 2) * 1.3, A.y + 0.5, z0],
      start({ seed }) {
        t = 0;
        const r = mulberry32(seed);
        plan = [];
        let at = 0;
        for (let n = 0; n < 80; n++) {
          at += 2 + r() * 3.5;
          plan.push([at, 'yellow']);
          at += 0.7;
          plan.push([at, 'red']);
          at += 2 + r() * 2.5;
          plan.push([at, 'green']);
        }
        light = 'green';
      },
      update(dt, ctx) {
        t += dt;
        let next = light;
        for (const [at, l] of plan) {
          if (at > t) break;
          next = l;
        }
        if (next !== light) {
          light = next;
          if (light === 'red') grace = 0.35;
          k.beep(light === 'green' ? 880 : light === 'yellow' ? 600 : 300, 0.25);
        }
        doll.rotation.y += ((light === 'green' ? Math.PI : 0) - doll.rotation.y) * Math.min(1, dt * 6);
        body.material.color.setHex(light === 'green' ? 0x3ab84a : light === 'yellow' ? 0xe8c83a : 0xd83a3a);
        grace -= dt;
        if (!ctx.meAlive) return;
        const p = game.player;
        if (light === 'red' && grace <= 0 && Math.hypot(p.velocity.x, p.velocity.z) > 1.2) {
          game.chat('🚦 Caught moving! Back to the start.', true);
          p.position.set(A.x + (Math.random() - 0.5) * 8, A.y + 0.5, z0);
          p.velocity.set(0, 0, 0);
        }
        if (p.position.z < z1) ctx.win();
      },
      hud: () => `${light === 'green' ? '🟢 GO' : light === 'yellow' ? '🟡 ...' : '🔴 FREEZE'} · ${Math.max(0, Math.round(k.feet().z - z1))}m`,
      stop() {},
    };
  }

  // ---------- Glass Bridge ----------
  function glassBridge() {
    const A = { ...SLOT(15), w: 14, d: 70 };
    const z0 = A.z + A.d / 2 - 4;
    k.box({ x: A.x, top: A.y, z: z0, w: 10, d: 6, h: 1, color: 0x4a4a56 });
    const rows = [];
    for (let r = 0; r < 12; r++) {
      const z = z0 - 6 - r * 4.4;
      rows.push([-1, 1].map((s) => {
        const m = k.box({ x: A.x + s * 2.2, top: A.y, z, w: 2.6, d: 2.6, h: 0.2, color: 0xbfe8ff });
        m.material.transparent = true;
        m.material.opacity = 0.55;
        return { m, x: A.x + s * 2.2, z, broken: false };
      }));
    }
    const endZ = z0 - 6 - 12 * 4.4;
    const end = k.box({ x: A.x, top: A.y, z: endZ, w: 10, d: 5, h: 1, color: 0xffc23a });
    end.material.emissive = new THREE.Color(0x6a4a00);
    let safe = [];
    function shatter(r, side) {
      const p = rows[r]?.[side];
      if (!p || p.broken) return;
      p.broken = true;
      p.m.visible = false;
      k.uncollide(p.m);
      k.puff(new THREE.Vector3(p.x, A.y, p.z), 0xbfe8ff);
      k.beep(1800, 0.2, 'triangle', 0.05);
    }
    net.on('event', (msg) => {
      if (msg.kind === 'gb:break') shatter(msg.r, msg.s);
    });
    return {
      id: 'glassbridge', name: 'Glass Bridge', icon: '🪟', color: 0xbfe8ff, arena: A, respawnOnFall: true,
      rules: 'Each row has one safe glass panel and one that shatters. Guess (or watch others) and cross first!',
      spawnPoint: (i, n) => [A.x + (i - (n - 1) / 2) * 1.2, A.y + 0.5, z0],
      start({ seed }) {
        const r = mulberry32(seed);
        safe = rows.map(() => (r() < 0.5 ? 0 : 1));
        for (const row of rows) {
          for (const p of row) {
            p.broken = false;
            p.m.visible = true;
            k.collide(p.m);
          }
        }
      },
      update(dt, ctx) {
        if (!ctx.meAlive) return;
        const f = k.feet();
        rows.forEach((row, r) => row.forEach((p, s) => {
          if (p.broken || s === safe[r]) return;
          if (Math.abs(f.x - p.x) < 1.3 && Math.abs(f.z - p.z) < 1.3 && Math.abs(f.y - A.y) < 0.3) {
            net.sendEvent({ kind: 'gb:break', r, s });
            shatter(r, s);
          }
        }));
        if (game.player.onGround && Math.abs(f.z - endZ) < 2.5) ctx.win();
      },
      hud: () => `row ${Math.max(0, Math.min(12, Math.floor((z0 - 4 - k.feet().z) / 4.4) + 1))}/12`,
      stop() {},
    };
  }
}
