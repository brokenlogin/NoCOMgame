// Funny items (all in the Tab spawner):
//   🍌 Banana Peel      drop it; whoever steps on it slips and goes flying
//   💨 Whoopee Cushion  drop it; whoever steps on it lets out a huge fart (everyone nearby hears)
//   🥧 Cream Pie        throw it; a hit splats cream all over their screen
//   🐔 Rubber Chicken   bonk people with a squeak
//   🤧 Sneezing Powder  blow it in someone's face; they ACHOO backwards
//   📯 Clown Horn       HONK: everyone close by jumps in fright
//   🎉 Confetti Popper  party time
//
// Dropped things (peels, cushions) are shared with { kind: 'fun:drop', pid, type, p } and
// removed with { kind: 'fun:gone', pid }. Like everything else, each player decides for
// themselves when they stepped on one. Sounds are made on the fly with WebAudio.

import { registerItem } from './items.js';

export function setupFunnyItems(game) {
  const { THREE, scene, net, remotes, inventory, world } = game;

  // ---------- Sounds ----------
  let audio = null;
  function ctxAudio() {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  // Volume from how far away the sound is
  function volumeAt(p) {
    if (!p || !game.player) return 1;
    const d = game.player.position.distanceTo(p);
    return Math.max(0, 1 - d / 45);
  }
  function noiseBuffer(ac, secs) {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * secs), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  const SOUNDS = {
    fart(ac, out) {
      const t = ac.currentTime, len = 0.9 + Math.random() * 0.5;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95 + Math.random() * 30, t);
      osc.frequency.linearRampToValueAtTime(55, t + len);
      // Wobble = the flappy part
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 18 + Math.random() * 10;
      lfoGain.gain.value = 25;
      lfo.connect(lfoGain).connect(osc.frequency);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.05);
      g.gain.setValueAtTime(0.8, t + len * 0.7);
      g.gain.linearRampToValueAtTime(0, t + len);
      osc.connect(filter).connect(g).connect(out);
      osc.start(t); lfo.start(t);
      osc.stop(t + len); lfo.stop(t + len);
    },
    squeak(ac, out) {
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.25);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(out);
      osc.start(t); osc.stop(t + 0.3);
    },
    honk(ac, out) {
      const t = ac.currentTime;
      for (const f of [330, 415]) {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.92, t + 0.45);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        g.gain.setValueAtTime(0.3, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(g).connect(out);
        osc.start(t); osc.stop(t + 0.5);
      }
    },
    splat(ac, out) {
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.35);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.3);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      src.connect(filter).connect(g).connect(out);
      src.start(t);
    },
    pop(ac, out) {
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(g).connect(out);
      src.start(t);
      // Party blower toot
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t + 0.05);
      osc.frequency.linearRampToValueAtTime(900, t + 0.4);
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.2, t + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(g2).connect(out);
      osc.start(t); osc.stop(t + 0.45);
    },
    slip(ac, out) {
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g).connect(out);
      osc.start(t); osc.stop(t + 0.4);
    },
    achoo(ac, out) {
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.6);
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2500, t);
      filter.frequency.exponentialRampToValueAtTime(800, t + 0.5);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.25); // "ah…"
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); // "…CHOO"
      src.connect(filter).connect(g).connect(out);
      src.start(t);
    },
  };
  function play(name, at) {
    const vol = volumeAt(at);
    if (vol <= 0 || !SOUNDS[name]) return;
    try {
      const ac = ctxAudio();
      const out = ac.createGain();
      out.gain.value = vol;
      out.connect(ac.destination);
      SOUNDS[name](ac, out);
    } catch {}
  }
  // Play a sound here and for everyone else
  function playShared(name, p) {
    play(name, p);
    net.sendEvent({ kind: 'fun:sound', s: name, p: p.toArray().map((n) => Math.round(n * 100) / 100) });
  }

  // ---------- Floating text over someone's head ----------
  const bubbles = [];
  function bubble(text, getPos, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const c2 = canvas.getContext('2d');
    c2.font = 'bold 64px system-ui, sans-serif';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.lineWidth = 8;
    c2.strokeStyle = 'rgba(0,0,0,0.7)';
    c2.strokeText(text, 128, 48);
    c2.fillStyle = color;
    c2.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sprite.scale.set(2.4, 0.9, 1);
    scene.add(sprite);
    bubbles.push({ sprite, getPos, t: 0 });
  }
  const posOf = (id) => () => (id === net.id ? game.player?.position : remotes.players.get(id)?.mesh.position);

  // ---------- Confetti ----------
  const confetti = [];
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.08);
  const confettiColors = [0xff4d4d, 0xffd23d, 0x3ddc6e, 0x3d8bff, 0xc77dff, 0xff8ad8];
  function burstConfetti(p, n = 70) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        confettiGeo,
        new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length], side: THREE.DoubleSide })
      );
      mesh.position.copy(p);
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      confetti.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 6, Math.sin(a) * s),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        t: 0,
      });
    }
  }

  // ---------- Pie splat on your screen ----------
  const splat = document.createElement('div');
  Object.assign(splat.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '14', display: 'none', transition: 'opacity 1.2s' });
  document.getElementById('hud').appendChild(splat);
  let splatTimer = 0;
  function pieInTheFace() {
    splat.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const blob = document.createElement('div');
      const size = 25 + Math.random() * 30;
      Object.assign(blob.style, {
        position: 'absolute',
        left: `${10 + Math.random() * 70}%`, top: `${5 + Math.random() * 70}%`,
        width: `${size}vmin`, height: `${size * (0.7 + Math.random() * 0.5)}vmin`,
        borderRadius: `${40 + Math.random() * 20}% ${50 + Math.random() * 20}% ${45 + Math.random() * 20}% ${55 + Math.random() * 20}%`,
        background: 'radial-gradient(circle at 40% 35%, #fffef8 0%, #fff6dc 55%, #f2deb0 100%)',
        boxShadow: '0 0 30px rgba(255,250,235,0.9)',
        transform: `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`,
      });
      splat.appendChild(blob);
    }
    splat.style.display = 'block';
    splat.style.opacity = '1';
    clearTimeout(splatTimer);
    splatTimer = setTimeout(() => {
      splat.style.opacity = '0';
      splatTimer = setTimeout(() => (splat.style.display = 'none'), 1200);
    }, 3500);
  }

  // ---------- Dropped things ----------
  const dropped = new Map(); // pid -> { type, mesh, p, owner, at }
  let nextPid = 1;
  const MAX_DROPPED = 40;
  const DROP_LIFE = 180; // seconds

  function makeDropMesh(type) {
    if (type === 'banana') {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xf7d635, roughness: 0.6 });
      for (let k = 0; k < 4; k++) {
        const flap = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), mat);
        flap.rotation.z = Math.PI / 2;
        flap.position.y = 0.06;
        const holder = new THREE.Group();
        holder.rotation.y = (k / 4) * Math.PI * 2 + 0.3;
        flap.position.x = 0.2;
        holder.add(flap);
        g.add(holder);
      }
      const stem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4e1e }));
      stem.position.y = 0.1;
      g.add(stem);
      return g;
    }
    // Whoopee cushion: squashed pink ball with a little nozzle
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), new THREE.MeshStandardMaterial({ color: 0xff6fa8, roughness: 0.5 }));
    body.scale.set(1, 0.28, 1);
    body.position.y = 0.1;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.25, 10), body.material);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(0.48, 0.08, 0);
    g.add(body, nozzle);
    return g;
  }

  function addDrop(pid, type, p, owner) {
    if (dropped.has(pid)) return;
    if (dropped.size >= MAX_DROPPED) removeDrop(dropped.keys().next().value, false);
    const mesh = makeDropMesh(type);
    mesh.position.copy(p);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.traverse((o) => (o.castShadow = true));
    scene.add(mesh);
    dropped.set(pid, { type, mesh, p: p.clone(), owner, at: performance.now() / 1000 });
  }

  function removeDrop(pid, broadcast) {
    const d = dropped.get(pid);
    if (!d) return;
    scene.remove(d.mesh);
    d.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    dropped.delete(pid);
    if (broadcast) net.sendEvent({ kind: 'fun:gone', pid });
  }

  // Put something on the ground just in front of you
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  function dropInFront(type, { player, flatDir }) {
    const start = player.position.clone().addScaledVector(flatDir, 1.3);
    start.y += 1.5;
    ray.set(start, down);
    ray.far = 6;
    const hit = ray.intersectObjects(world.colliders, false)[0];
    const p = hit ? hit.point : player.position.clone();
    const pid = `${net.id}-${nextPid++}`;
    addDrop(pid, type, p, net.id);
    net.sendEvent({ kind: 'fun:drop', pid, type, p: p.toArray().map((n) => Math.round(n * 100) / 100) });
    inventory.remove(type === 'banana' ? 'banana-peel' : 'whoopee-cushion', 1);
  }

  // I stepped on something
  function stepOn(pid, d) {
    const player = game.player;
    removeDrop(pid, true);
    if (d.type === 'banana') {
      // Slide off in the direction you were going (or forward), up into the air
      const v = player.velocity;
      let dx = v.x, dz = v.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) (dx = -Math.sin(player.yaw)), (dz = -Math.cos(player.yaw));
      else (dx /= len), (dz /= len);
      player.applyKnockback([dx * 22, 9, dz * 22]);
      playShared('slip', player.position);
      net.sendEvent({ kind: 'fun:bubble', text: 'WHOOPS!', id: net.id, color: '#f7d635' });
      bubble('WHOOPS!', posOf(net.id), '#f7d635');
      game.chat('You slipped on a banana peel!', true);
    } else {
      player.applyKnockback([0, 5, 0]);
      playShared('fart', player.position);
      net.sendEvent({ kind: 'fun:bubble', text: '💨 PFFFT', id: net.id, color: '#ff6fa8' });
      bubble('💨 PFFFT', posOf(net.id), '#ff6fa8');
      net.sendEvent({ kind: 'fun:chat', text: `${player.name} sat on a whoopee cushion 💨` });
      game.chat('You sat on a whoopee cushion 💨', true);
    }
  }

  // ---------- Network ----------
  net.on('event', (msg) => {
    switch (msg.kind) {
      case 'fun:drop':
        if (typeof msg.pid === 'string' && Array.isArray(msg.p) && (msg.type === 'banana' || msg.type === 'cushion')) {
          addDrop(msg.pid, msg.type, new THREE.Vector3().fromArray(msg.p), msg.from);
        }
        break;
      case 'fun:gone':
        removeDrop(msg.pid, false);
        break;
      case 'fun:sound':
        if (Array.isArray(msg.p)) play(msg.s, new THREE.Vector3().fromArray(msg.p));
        break;
      case 'fun:bubble':
        if (typeof msg.text === 'string') bubble(msg.text.slice(0, 12), posOf(msg.id), msg.color);
        break;
      case 'fun:chat':
        if (typeof msg.text === 'string') game.chat(msg.text.slice(0, 80), true);
        break;
      case 'fun:pie':
        if (msg.target === net.id && game.player) {
          pieInTheFace();
          play('splat');
          game.chat(`${remotes.players.get(msg.from)?.name || 'Someone'} pied you! 🥧`, true);
        }
        break;
      case 'fun:sneeze':
        if (msg.target === net.id && game.player && Array.isArray(msg.v)) game.player.applyKnockback(msg.v);
        bubble('ACHOO!', posOf(msg.target), '#9be37a');
        play('achoo', posOf(msg.target)());
        break;
      case 'fun:honk':
        if (Array.isArray(msg.p)) {
          const p = new THREE.Vector3().fromArray(msg.p);
          play('honk', p);
          // Scared jump if you're close
          const player = game.player;
          if (player && player.position.distanceTo(p) < 9) {
            player.velocity.y = -player.gravityDir * 9;
            player.onGround = false;
            bubble('!!', posOf(net.id), '#ff5a3a');
          }
        }
        break;
      case 'fun:confetti':
        if (Array.isArray(msg.p)) {
          const p = new THREE.Vector3().fromArray(msg.p);
          burstConfetti(p);
          play('pop', p);
        }
        break;
    }
  });
  net.on('close', () => {
    for (const pid of [...dropped.keys()]) removeDrop(pid, false);
  });

  // ---------- Per frame ----------
  game.addSystem((dt, game) => {
    const player = game.player;
    const now = performance.now() / 1000;
    const p = player.position;

    for (const [pid, d] of dropped) {
      if (now - d.at > DROP_LIFE) {
        removeDrop(pid, false);
        continue;
      }
      // Your own stuff is safe for a moment after you drop it
      if (d.owner === net.id && now - d.at < 1.2) continue;
      const dx = p.x - d.p.x, dz = p.z - d.p.z;
      if (dx * dx + dz * dz < 0.6 ** 2 && Math.abs(p.y - d.p.y) < 0.6) {
        stepOn(pid, d);
        break;
      }
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      const at = b.getPos();
      if (at) b.sprite.position.set(at.x, at.y + 3 + b.t * 0.6, at.z);
      b.sprite.material.opacity = Math.max(0, 1 - Math.max(0, b.t - 1) / 0.6);
      if (b.t > 1.6 || !at) {
        scene.remove(b.sprite);
        b.sprite.material.map.dispose();
        b.sprite.material.dispose();
        bubbles.splice(i, 1);
      }
    }

    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.t += dt;
      c.vel.y -= 9 * dt;
      c.vel.multiplyScalar(Math.max(0, 1 - 1.8 * dt)); // air drag: confetti floats
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.t > 3) {
        scene.remove(c.mesh);
        c.mesh.material.dispose();
        confetti.splice(i, 1);
      }
    }
  });

  // ---------- Items ----------
  registerItem({
    id: 'banana-peel',
    name: 'Banana Peel',
    icon: '🍌',
    description: 'Drop it in front of you. Whoever steps on it slips and goes flying.',
    maxStack: 8,
    cooldown: 0.4,
    use: (ctx) => dropInFront('banana', ctx),
  });

  registerItem({
    id: 'whoopee-cushion',
    name: 'Whoopee Cushion',
    icon: '💨',
    description: 'Drop it. Whoever steps on it lets rip, and everyone nearby hears it.',
    maxStack: 8,
    cooldown: 0.4,
    use: (ctx) => dropInFront('cushion', ctx),
  });

  registerItem({
    id: 'cream-pie',
    name: 'Cream Pie',
    icon: '🥧',
    description: 'Throw it. A hit covers their whole screen in cream.',
    maxStack: 16,
    cooldown: 0.5,
    use({ combat, origin, dir }) {
      const speed = 22;
      combat.spawnProjectile({
        type: 'pie',
        p: origin.clone().addScaledVector(dir, 0.8).toArray(),
        v: [dir.x * speed, dir.y * speed + 3, dir.z * speed],
        gravity: 14,
        radius: 0.3,
        onHit(target, vel) {
          net.sendEvent({ kind: 'fun:pie', target: target.id });
          vel.y = 0;
          vel.normalize();
          combat.knockback(target.id, [vel.x * 4, 2, vel.z * 4]);
          game.chat(`You pied ${target.name}! 🥧`, true);
        },
      });
      inventory.remove('cream-pie', 1);
    },
  });

  registerItem({
    id: 'rubber-chicken',
    name: 'Rubber Chicken',
    icon: '🐔',
    description: 'BONK. Squeaky knockback.',
    cooldown: 0.35,
    use({ combat, player, origin, dir, flatDir }) {
      playShared('squeak', player.position);
      for (const { player: rp } of combat.playersInCone(origin, dir, 3, 55)) {
        combat.knockback(rp.id, [flatDir.x * 14, 6, flatDir.z * 14]);
        net.sendEvent({ kind: 'fun:bubble', text: 'BONK', id: rp.id, color: '#ffffff' });
        bubble('BONK', posOf(rp.id));
      }
    },
  });

  registerItem({
    id: 'sneezing-powder',
    name: 'Sneezing Powder',
    icon: '🤧',
    description: 'Blow it in someone\'s face. They sneeze so hard they fly backwards.',
    cooldown: 1,
    anim: 'blow',
    use({ combat, origin, dir, flatDir }) {
      for (const { player: rp } of combat.playersInCone(origin, dir, 4, 40)) {
        const v = [flatDir.x * 26, 7, flatDir.z * 26].map((n) => Math.round(n * 100) / 100);
        net.sendEvent({ kind: 'fun:sneeze', target: rp.id, v });
        bubble('ACHOO!', posOf(rp.id), '#9be37a');
        play('achoo', rp.mesh.position);
      }
    },
  });

  registerItem({
    id: 'clown-horn',
    name: 'Clown Horn',
    icon: '📯',
    description: 'HONK. Everyone close by jumps out of their skin.',
    cooldown: 1.2,
    anim: 'blow',
    use({ player }) {
      const p = player.position.toArray().map((n) => Math.round(n * 100) / 100);
      play('honk', player.position);
      net.sendEvent({ kind: 'fun:honk', p });
    },
  });

  registerItem({
    id: 'confetti-popper',
    name: 'Confetti Popper',
    icon: '🎉',
    description: 'Pop! Confetti everywhere. Completely harmless.',
    cooldown: 0.6,
    anim: 'recoil',
    use({ player, origin, dir }) {
      const p = origin.clone().addScaledVector(dir, 1.2);
      burstConfetti(p);
      play('pop', p);
      net.sendEvent({ kind: 'fun:confetti', p: p.toArray().map((n) => Math.round(n * 100) / 100) });
    },
  });
}
