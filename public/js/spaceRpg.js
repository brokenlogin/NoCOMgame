// The space RPG, on top of Station NoCOM (space.js).
//
// Walk up to the crew on the station deck and press E to talk:
//   Commander Reyes (missions) · Quartermaster Juno (upgrades, sells your ore)
//   Mechanic Bolt (repairs, tows your ship home) · Dockmaster Vega (out at Outpost Kepler)
// Your starship waits in the north hangar (spaceShip.js); the places and pirates are in spaceWorld.js.
//
// Story: Flight School → Rock Hound → Pirate Problem → Special Delivery → Ghost Ship → The Mothership,
// then endless bounties. Credits, XP/levels, upgrades and quest progress are saved in this
// browser (localStorage, per player name). Big moments are announced to the room with
// { kind: 'sp:announce', text }.

import * as THREE from 'three';
import { teleport } from './mgShared.js';
import { setupShip } from './spaceShip.js';
import { createSpaceWorld, LOC } from './spaceWorld.js';

const UPGRADES = {
  engine: { name: 'Engines', icon: '🔥', costs: [200, 500, 1000], values: [45, 58, 72, 90], unit: 'm/s top speed' },
  lasers: { name: 'Lasers', icon: '🔫', costs: [250, 600, 1200], values: [10, 15, 22, 32], unit: 'damage' },
  hull: { name: 'Hull plating', icon: '🛡️', costs: [200, 500, 1000], values: [100, 150, 220, 320], unit: 'hull' },
};
const ORE_PRICE = 12;
const ARRIVE = new THREE.Vector3(0, 30.5, -382);
const MARK_Y = 3.05; // height of the ! / ? over a crew member's head

// Floating text (a sprite, so it always faces you and never clips into anything).
// lines: [{ text, size (px), color, bold }]. ~0.0042m per canvas pixel.
function makeLabel(lines, { scale = 0.0042, bg = 'rgba(8,14,26,0.72)' } = {}) {
  const pad = 16;
  const font = (l) => `${l.bold ? 700 : 600} ${l.size}px system-ui, sans-serif`;
  const ctx0 = document.createElement('canvas').getContext('2d');
  let w = 0;
  for (const l of lines) {
    ctx0.font = font(l);
    w = Math.max(w, ctx0.measureText(l.text).width);
  }
  const W = Math.ceil(w + pad * 2);
  const H = Math.ceil(lines.reduce((h, l) => h + l.size * 1.25, 0) + pad);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 18);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = pad / 2;
  for (const l of lines) {
    ctx.font = font(l);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, W / 2, y + (l.size * 1.25) / 2);
    y += l.size * 1.25;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0); // anchored at the bottom middle
  sprite.scale.set(W * scale, H * scale, 1);
  return sprite;
}

// A glowing ! or ? bubble
function makeMarker(ch, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '800 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(ch, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.5, 0.5, 1);
  return sprite;
}

const levelFor = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;
const xpForLevel = (lvl) => 40 * (lvl - 1) ** 2;

export function setupSpaceRpg(game) {
  const { scene, net, input, camera } = game;

  // ---------- Saved progress ----------
  const fresh = () => ({ v: 1, credits: 0, xp: 0, quest: 0, stage: 'offer', progress: 0, ore: 0, upgrades: { engine: 0, lasers: 0, hull: 0 }, hasPackage: false, hasCore: false, title: '', bounty: null, bounties: 0 });
  let st = fresh();
  let saveKey = null;
  function load(name) {
    saveKey = `nocom.spaceRpg.${name}`;
    try {
      st = { ...fresh(), ...JSON.parse(localStorage.getItem(saveKey) || '{}') };
    } catch {
      st = fresh();
    }
    applyStats();
  }
  function save() {
    try {
      if (saveKey) localStorage.setItem(saveKey, JSON.stringify(st));
    } catch {}
  }
  const level = () => levelFor(st.xp);

  function announce(text) {
    game.chat(text, true);
    net.sendEvent({ kind: 'sp:announce', text: `${game.player?.name || 'Someone'}: ${text}`.slice(0, 120) });
  }
  net.on('event', (msg) => {
    if (msg.kind === 'sp:announce' && typeof msg.text === 'string') game.chat(`🚀 ${msg.text.slice(0, 120)}`, true);
  });

  function reward(credits, xp) {
    const before = level();
    st.credits += credits;
    st.xp += xp;
    if (credits || xp) game.chat(`+${credits} credits · +${xp} XP`, true);
    if (level() > before) {
      announce(`⭐ reached pilot level ${level()}!`);
      applyStats();
      ship.repair();
    }
    save();
  }

  // ---------- Ship + world ----------
  const ship = setupShip(game, {
    dock: LOC.dock,
    onDestroyed(cause) {
      game.chat(`💥 Your ship was destroyed by ${cause}! It's been towed back to the hangar.`, true);
      if (game.player) teleport(game.player, ARRIVE.x, ARRIVE.y, ARRIVE.z);
      if (st.ore > 0) {
        const lost = Math.ceil(st.ore / 2);
        st.ore -= lost;
        game.chat(`You lost ${lost} ore from your cargo hold.`, true);
        save();
      }
      world.clearEnemies();
    },
  });
  function applyStats() {
    const u = st.upgrades;
    const lvl = level();
    ship.stats.speed = UPGRADES.engine.values[u.engine];
    ship.stats.laser = Math.round(UPGRADES.lasers.values[u.lasers] * (1 + 0.06 * (lvl - 1)));
    ship.stats.maxHull = UPGRADES.hull.values[u.hull] + 10 * (lvl - 1);
  }

  const world = createSpaceWorld(game, {
    onOre(n) {
      st.ore += n;
      game.chat(`⛏️ +${n} ore (${st.ore} in the hold)`, true);
      reward(0, n * 2);
      questEvent('ore', n);
    },
    onKill() {
      reward(8, 12);
      questEvent('kill', 1);
    },
    onRing(next, total) {
      questEvent('ring', next, total);
    },
    onTurret(left) {
      game.chat(left ? `💥 Turret down! ${left} to go.` : '💥 All turrets down!', true);
    },
    onShieldDown() {
      game.chat('🛡️ The reactor shield is down! Shoot the glowing core under the nose!', true);
    },
    onBoss() {
      questEvent('boss', 1);
    },
  });
  ship.setTargets(() => world.laserTargets());

  // ---------- Crew ----------
  const S = LOC.station;
  const npcs = [
    { id: 'reyes', name: 'Commander Reyes', role: 'Missions', color: 0x3a6bd8, pos: new THREE.Vector3(S.x - 3.5, S.y, S.z + 5), face: 0 },
    { id: 'juno', name: 'Quartermaster Juno', role: 'Upgrades & trade', color: 0xd8a03a, pos: new THREE.Vector3(S.x + 3.5, S.y, S.z + 5), face: 0 },
    { id: 'bolt', name: 'Mechanic Bolt', role: 'Repairs', color: 0xd85a3a, pos: new THREE.Vector3(S.x + 4.5, S.y, S.z - 21), face: 0 },
    { id: 'vega', name: 'Dockmaster Vega', role: 'Outpost Kepler', color: 0x3ad88a, pos: new THREE.Vector3(LOC.outpost.x + 3, LOC.outpost.y, LOC.outpost.z + 9), face: -Math.PI / 2 },
  ];
  for (const n of npcs) {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: n.color, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 6, 14), suit);
    body.position.y = 0.85;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16), white);
    belt.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), white);
    head.position.y = 1.72;
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 10, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.35), // just outside the head
      new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2fb8ff, emissiveIntensity: 1.2 })
    );
    visor.position.set(0, 1.72, 0);
    visor.rotation.y = Math.PI / 2; // the visor faces +Z; `face` turns the whole crew member
    visor.scale.setScalar(1.2);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), white);
    antenna.position.set(0.15, 2.05, 0);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: n.color }));
    tip.position.set(0.15, 2.22, 0);
    g.add(body, belt, head, visor, antenna, tip);
    // Name and job above their head
    const tag = makeLabel([
      { text: n.name, size: 44, color: '#e9f4ff', bold: true },
      { text: n.role, size: 32, color: '#9fc8e8' },
    ]);
    tag.position.y = 2.38;
    g.add(tag);
    // Quest markers above that: ! = something new, ? = ready to hand in
    const mark = makeMarker('!', '#ffd23d');
    const markReady = makeMarker('?', '#7affc8');
    for (const m of [mark, markReady]) {
      m.position.y = MARK_Y;
      g.add(m);
    }
    g.position.copy(n.pos);
    g.rotation.y = n.face;
    scene.add(g);
    n.g = g;
    n.tag = tag;
    n.mark = mark;
    n.markReady = markReady;
  }
  const npc = (id) => npcs.find((n) => n.id === id);

  // ---------- Quests ----------
  const QUESTS = [
    {
      id: 'training', title: 'Flight School', giver: 'reyes', turnIn: 'reyes', reward: [100, 60],
      offer: "Welcome aboard Station NoCOM, cadet. Before I trust you with real work, show me you can fly. Your ship's in the north hangar. Fly through all six training rings.",
      done: 'Not bad at all. You fly like you mean it. Now let\'s put you to work.',
      onAccept: () => world.startRings(0),
      objective: () => (ship.piloting ? `Fly through the rings (${st.progress}/6)` : 'Board your ship in the north hangar (E)'),
      waypoint: () => (ship.piloting || st.progress > 0 ? world.ringPos(st.progress) : ship.position),
      event(type, n) {
        if (type === 'ring') {
          st.progress = n;
          if (n >= 6) return true;
          game.chat(`💫 Ring ${n}/6`, true);
        }
      },
    },
    {
      id: 'mining', title: 'Rock Hound', giver: 'reyes', turnIn: 'reyes', reward: [150, 80],
      offer: 'The station runs on crystal ore from the Belt to the west. Glowing blue rocks. Shoot them with your ship lasers and the ore comes to you. Bring back 8.',
      done: 'Lovely haul. Sell the ore to Juno whenever you like, she pays fair.',
      objective: () => `Mine glowing ore in the Belt (${Math.min(st.progress, 8)}/8)`,
      waypoint: () => LOC.belt,
      event(type, n) {
        if (type === 'ore') {
          st.progress += n;
          return st.progress >= 8;
        }
      },
    },
    {
      id: 'pirates', title: 'Pirate Problem', giver: 'reyes', turnIn: 'reyes', reward: [250, 120],
      offer: 'Pirate drones have been hassling our miners out in the Belt. Clear them out. Six should send a message.',
      done: 'That\'ll make them think twice. Here\'s your cut.',
      objective: () => `Destroy pirate drones near the Belt (${Math.min(st.progress, 6)}/6)`,
      waypoint: () => LOC.belt,
      event(type) {
        if (type === 'kill') {
          st.progress++;
          return st.progress >= 6;
        }
      },
    },
    {
      id: 'delivery', title: 'Special Delivery', giver: 'reyes', turnIn: 'vega', reward: [300, 150],
      offer: 'I need this sealed package at Outpost Kepler, far out to the southeast. Hand it to Dockmaster Vega and nobody else. Don\'t open it.',
      done: '...You actually brought it. Reyes said you were reliable. Listen, I have something bigger for you.',
      onAccept: () => {
        st.hasPackage = true;
        game.chat('📦 You received a sealed package.', true);
      },
      objective: () => 'Deliver the package to Dockmaster Vega at Outpost Kepler',
      waypoint: () => npc('vega').pos,
      ready: true, // hand it in as soon as you reach Vega
      onTurnIn: () => (st.hasPackage = false),
    },
    {
      id: 'derelict', title: 'Ghost Ship', giver: 'vega', turnIn: 'reyes', reward: [350, 200],
      offer: 'There\'s a wreck out past the Belt. The Erebus. She went dark a year ago with a full data core aboard. Land, walk in, and bring that core to Reyes. And if you hear anything in there... don\'t.',
      done: 'The Erebus core! This has the pirates\' patrol routes and the location of their Mothership. You know what comes next.',
      objective: () => (st.hasCore ? 'Bring the data core to Commander Reyes' : 'Find the data core inside the derelict Erebus (land, walk in, E)'),
      waypoint: () => (st.hasCore ? npc('reyes').pos : world.corePos()),
      event(type) {
        if (type === 'core') return true;
      },
      onTurnIn: () => (st.hasCore = false),
    },
    {
      id: 'mothership', title: 'The Mothership', giver: 'reyes', turnIn: 'reyes', reward: [1000, 500],
      offer: 'The Pirate Mothership. Four turrets guard a shielded reactor under her nose. Take out the turrets, the shield drops, then hit the core. Upgrade your ship with Juno first. Good luck, pilot.',
      done: 'You did it! The Mothership is scrap and the space lanes are free. Station NoCOM salutes you, Hero.',
      objective: () =>
        !world.bossAlive ? 'The Mothership is down!' :
        world.shieldUp ? `Destroy the Mothership's turrets (${world.turretsLeft} left)` :
        `Shoot the reactor core under the nose (${Math.round(world.bossHp * 100)}%)`,
      waypoint: () => (world.shieldUp ? LOC.mothership : world.reactorPos()),
      event(type) {
        if (type === 'boss') return true;
      },
      onTurnIn: () => {
        st.title = 'Hero of NoCOM';
        announce('🏆 destroyed the Pirate Mothership and became a Hero of NoCOM!');
      },
    },
  ];
  // After the story: bounties forever
  function bountyQuest() {
    const b = st.bounty;
    if (!b) return null;
    return {
      id: 'bounty', title: b.kind === 'kill' ? 'Bounty: Drones' : 'Contract: Ore', giver: 'reyes', turnIn: 'reyes', reward: [b.n * 30, b.n * 14],
      objective: () => (b.kind === 'kill' ? `Destroy pirate drones (${Math.min(st.progress, b.n)}/${b.n})` : `Mine ore (${Math.min(st.progress, b.n)}/${b.n})`),
      waypoint: () => LOC.belt,
      done: 'Good work. There\'s always more where that came from.',
      event(type, n) {
        if (type === b.kind) {
          st.progress += n;
          return st.progress >= b.n;
        }
      },
    };
  }
  const current = () => (st.quest < QUESTS.length ? QUESTS[st.quest] : bountyQuest());

  function questEvent(type, n, extra) {
    const q = current();
    if (!q || st.stage !== 'active' || !q.event) return;
    if (q.event(type, n, extra)) {
      st.stage = 'turnin';
      game.chat(`✅ ${q.title}: done! Go back to ${npc(q.turnIn).name}.`, true);
    }
    save();
  }

  function accept(q) {
    st.stage = q.ready ? 'turnin' : 'active';
    st.progress = 0;
    q.onAccept?.();
    game.chat(`📜 New mission: ${q.title}`, true);
    save();
  }
  function turnIn(q) {
    q.onTurnIn?.();
    reward(...q.reward);
    if (st.quest < QUESTS.length) {
      if (q.id !== 'mothership') announce(`completed "${q.title}"`);
      st.quest++;
    } else {
      st.bounties++;
      st.bounty = null;
    }
    st.stage = 'offer';
    st.progress = 0;
    save();
  }

  // ---------- Dialogue window ----------
  const dlg = document.createElement('div');
  Object.assign(dlg.style, {
    position: 'fixed', left: '50%', bottom: '110px', transform: 'translateX(-50%)', width: 'min(560px, 92vw)',
    background: 'rgba(8,14,26,0.94)', border: '1px solid rgba(95,212,255,0.45)', borderRadius: '14px',
    padding: '16px 18px', color: '#e9f4ff', font: '15px system-ui, sans-serif', display: 'none', zIndex: 30,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  });
  document.getElementById('hud').appendChild(dlg);
  let dlgOpen = false;
  let dlgButtons = [];

  function openDialog(person, text, options) {
    dlg.replaceChildren();
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:16px;color:#7fd8ff;margin-bottom:6px';
    title.textContent = person;
    const body = document.createElement('div');
    body.style.cssText = 'line-height:1.45;margin-bottom:12px;white-space:pre-line';
    body.textContent = text;
    const opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    dlgButtons = [];
    options.forEach(([label, fn, disabled], i) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${i + 1}. ${label}`;
      b.style.textAlign = 'left';
      b.disabled = !!disabled;
      b.addEventListener('click', () => !disabled && fn());
      opts.appendChild(b);
      dlgButtons.push(disabled ? null : fn);
    });
    dlg.append(title, body, opts);
    dlg.style.display = 'block';
    if (!dlgOpen) {
      dlgOpen = true;
      input.enabled = false;
      input.keys.clear();
      document.exitPointerLock?.();
    }
  }
  function closeDialog() {
    if (!dlgOpen) return;
    dlgOpen = false;
    dlg.style.display = 'none';
    input.enabled = true;
    if (game.player) input.requestLock();
  }
  window.addEventListener('keydown', (e) => {
    if (!dlgOpen) return;
    if (e.code === 'Escape') {
      closeDialog();
      e.stopImmediatePropagation();
    }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      e.stopImmediatePropagation();
      dlgButtons[Number(m[1]) - 1]?.();
    }
  }, true);
  const bye = ['Bye', closeDialog];

  // ---------- Talking ----------
  function talk(n) {
    if (n.id === 'reyes' || n.id === 'vega') return talkMissions(n);
    if (n.id === 'juno') return talkShop();
    if (n.id === 'bolt') return talkMechanic();
  }

  function talkMissions(n) {
    const q = current();
    if (q && st.stage === 'turnin' && q.turnIn === n.id) {
      return openDialog(n.name, q.done, [[`Collect reward (${q.reward[0]} credits, ${q.reward[1]} XP)`, () => {
        turnIn(q);
        talkMissions(n);
      }]]);
    }
    if (q && st.stage === 'offer' && q.giver === n.id) {
      return openDialog(n.name, q.offer, [[`Accept: ${q.title}`, () => {
        accept(q);
        closeDialog();
      }], ['Not yet', closeDialog]]);
    }
    if (q && st.stage !== 'offer') {
      return openDialog(n.name, `How's it going with "${q.title}"?\n${q.objective()}.`, [bye]);
    }
    // Story's over: hand out bounties
    if (st.quest >= QUESTS.length && n.id === 'reyes') {
      const kind = st.bounties % 2 ? 'ore' : 'kill';
      const amount = kind === 'kill' ? 5 + Math.min(st.bounties, 5) : 8 + Math.min(st.bounties, 6);
      return openDialog(n.name, `${st.title ? `Hero! ` : ''}There's always work. ${kind === 'kill' ? `Pirates are back in the Belt: take out ${amount} drones.` : `The refinery needs ${amount} ore.`}`, [
        ['Take the job', () => {
          st.bounty = { kind, n: amount };
          accept(bountyQuest());
          closeDialog();
        }],
        ['Not now', closeDialog],
      ]);
    }
    const lines = {
      reyes: 'Keep your shields up out there, pilot.',
      vega: 'Outpost Kepler. Not much out here but rocks and pirates. Safe flying.',
    };
    openDialog(n.name, lines[n.id], [bye]);
  }

  function talkShop() {
    const u = st.upgrades;
    const opts = [];
    opts.push([st.ore ? `Sell ${st.ore} ore (+${st.ore * ORE_PRICE} credits)` : 'Sell ore (you have none)', () => {
      const earned = st.ore * ORE_PRICE;
      st.ore = 0;
      reward(earned, 0);
      talkShop();
    }, !st.ore]);
    for (const [key, up] of Object.entries(UPGRADES)) {
      const lvl = u[key];
      if (lvl >= up.costs.length) {
        opts.push([`${up.icon} ${up.name}: maxed out (${up.values[lvl]} ${up.unit})`, () => {}, true]);
      } else {
        const cost = up.costs[lvl];
        opts.push([`${up.icon} ${up.name} Mk ${lvl + 2}: ${up.values[lvl]} → ${up.values[lvl + 1]} ${up.unit} (${cost} credits)`, () => {
          st.credits -= cost;
          u[key]++;
          applyStats();
          ship.repair();
          save();
          game.chat(`🔧 ${up.name} upgraded to Mk ${u[key] + 1}!`, true);
          talkShop();
        }, st.credits < cost]);
      }
    }
    opts.push(bye);
    openDialog('Quartermaster Juno', `You've got ${st.credits} credits. What'll it be?`, opts);
  }

  function talkMechanic() {
    const opts = [
      [ship.hull < ship.stats.maxHull ? 'Repair my hull (free for NoCOM pilots)' : 'Hull is in perfect shape', () => {
        ship.repair();
        game.chat('🔧 Hull repaired.', true);
        talkMechanic();
      }, ship.hull >= ship.stats.maxHull],
      [ship.docked ? 'Your ship is in the hangar' : 'Tow my ship back to the hangar', () => {
        ship.towHome();
        game.chat('🛻 Your ship has been towed back to the hangar.', true);
        talkMechanic();
      }, ship.docked || ship.piloting],
      bye,
    ];
    openDialog('Mechanic Bolt', `She's a good ship. Hull at ${Math.ceil(ship.hull)}/${ship.stats.maxHull}.`, opts);
  }

  // ---------- HUD: progress panel, waypoint, prompt ----------
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', right: '12px', top: '84px', width: '250px', display: 'none', pointerEvents: 'none',
    background: 'rgba(8,14,26,0.72)', border: '1px solid rgba(95,212,255,0.3)', borderRadius: '10px',
    padding: '10px 12px', color: '#d8eeff', font: '13px system-ui, sans-serif', zIndex: 4,
  });
  panel.innerHTML = `<div class="rp-top" style="font-weight:700;font-size:14px"></div>
    <div style="height:6px;background:rgba(255,255,255,0.12);border-radius:3px;margin:6px 0 8px;overflow:hidden">
      <div class="rp-xp" style="height:100%;background:#ffd23d"></div></div>
    <div class="rp-quest" style="font-weight:700;color:#7fd8ff"></div>
    <div class="rp-obj" style="opacity:0.9;margin-top:2px"></div>`;
  document.getElementById('hud').appendChild(panel);
  const pTop = panel.querySelector('.rp-top'), pXp = panel.querySelector('.rp-xp');
  const pQuest = panel.querySelector('.rp-quest'), pObj = panel.querySelector('.rp-obj');

  const marker = document.createElement('div');
  Object.assign(marker.style, {
    position: 'fixed', display: 'none', pointerEvents: 'none', transform: 'translate(-50%, -50%)', zIndex: 4,
    color: '#ffd23d', font: '700 12px system-ui, sans-serif', textAlign: 'center', textShadow: '0 1px 4px #000',
  });
  marker.innerHTML = '<div class="mk-icon" style="font-size:22px;line-height:1">◆</div><div class="mk-dist"></div>';
  document.getElementById('hud').appendChild(marker);
  const mkIcon = marker.querySelector('.mk-icon'), mkDist = marker.querySelector('.mk-dist');

  const prompt = document.createElement('div');
  Object.assign(prompt.style, {
    position: 'fixed', left: '50%', top: '58%', transform: 'translateX(-50%)', display: 'none', pointerEvents: 'none',
    padding: '6px 12px', borderRadius: '8px', background: 'rgba(8,14,26,0.8)', color: '#ffffff',
    font: '600 14px system-ui, sans-serif', zIndex: 4,
  });
  document.getElementById('hud').appendChild(prompt);

  // ---------- E: board / get out / talk / pick up ----------
  let action = null; // what E does right now
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || dlgOpen || !input.enabled || !game.player) return;
    action?.();
  });

  // ---------- Per frame ----------
  let owner = null;
  let wasInSpace = false;
  let backdropDone = false;
  const _p = new THREE.Vector3();
  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      load(player.name || 'Player');
      closeDialog();
    }
    const inSpace = game.space.inSpace();

    // Space is big: see further while you're up there, and keep the stars behind everything
    const far = inSpace ? 2600 : 500;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    if (!backdropDone && game.space.sky) {
      backdropDone = true;
      game.space.sky.traverse((o) => {
        if (!o.material) return;
        o.material.depthWrite = false;
        o.renderOrder = o.isPoints ? -3 : -2;
      });
    }

    if (inSpace && !wasInSpace) {
      const q = current();
      // Resume flight school rings after a reload
      if (q?.id === 'training' && st.stage === 'active') world.startRings(st.progress);
    }
    wasInSpace = inSpace;

    // Hide the data core once you've got it (or are past that mission)
    world.setCoreVisible(!(st.hasCore || st.quest > 4));

    world.update(dt, {
      piloting: ship.piloting,
      shipPos: ship.position,
      shipVel: ship.velocity,
      playerPos: player.position,
      damageShip: (n) => ship.damage(n, 'pirates'),
      damagePlayer: (n) => player.takeDamage(n, 'pirates'),
    });

    // NPC markers and tags
    const q = current();
    for (const n of npcs) {
      const ready = q && st.stage === 'turnin' && q.turnIn === n.id;
      const offer = (q && st.stage === 'offer' && q.giver === n.id) || (!q && n.id === 'reyes' && st.quest >= QUESTS.length);
      // Fade the name out when you're right next to them (it would fill your screen)
      n.tag.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(n.pos) - 2.2) / 1.5));
      n.mark.visible = offer && !ready;
      n.markReady.visible = ready;
      n.mark.position.y = n.markReady.position.y = MARK_Y + Math.sin(performance.now() / 300) * 0.06;
      n.g.children[3].material.emissiveIntensity = 1 + Math.sin(performance.now() / 400 + n.pos.x) * 0.3; // visor glow
    }

    // What does E do here?
    action = null;
    let promptText = '';
    if (inSpace && !dlgOpen) {
      const p = player.position;
      if (ship.piloting) {
        action = () => ship.tryExit();
      } else {
        const near = npcs.find((n) => n.pos.distanceTo(p) < 2.8);
        if (near) {
          action = () => talk(near);
          promptText = `E: Talk to ${near.name}`;
        } else if (q?.id === 'derelict' && st.stage === 'active' && !st.hasCore && world.corePos().distanceTo(p) < 2.5) {
          action = () => {
            st.hasCore = true;
            questEvent('core', 1);
            game.chat('💾 You took the Erebus data core. Something creaks in the dark...', true);
          };
          promptText = 'E: Take the data core';
        } else if (ship.canBoard()) {
          action = () => ship.board();
          promptText = 'E: Board your ship';
        }
      }
    }
    prompt.style.display = promptText ? 'block' : 'none';
    prompt.textContent = promptText;

    // Progress panel
    panel.style.display = inSpace ? 'block' : 'none';
    if (inSpace) {
      const lvl = level();
      pTop.textContent = `🚀 Lv ${lvl}${st.title ? ` · ${st.title}` : ''} · ${st.credits} cr · ⛏️ ${st.ore}`;
      const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
      pXp.style.width = `${((st.xp - a) / (b - a)) * 100}%`;
      if (q && st.stage !== 'offer') {
        pQuest.textContent = `📜 ${q.title}`;
        pObj.textContent = st.stage === 'turnin' && !q.ready ? `Return to ${npc(q.turnIn).name}` : q.objective();
      } else if (q) {
        pQuest.textContent = '📜 New mission available';
        pObj.textContent = `Talk to ${npc(q.giver).name}`;
      } else {
        pQuest.textContent = '📜 Bounty board';
        pObj.textContent = 'Talk to Commander Reyes for work';
      }
    }

    // Waypoint marker
    let target = null;
    if (inSpace && q) {
      if (st.stage === 'active' || (st.stage === 'turnin' && q.ready)) target = q.waypoint();
      else target = npc(st.stage === 'turnin' ? q.turnIn : q.giver).pos.clone().setY(LOC.station.y + MARK_Y + 1.1);
    } else if (inSpace && !q) {
      target = npc('reyes').pos.clone().setY(LOC.station.y + MARK_Y + 1.1);
    }
    if (target) {
      const dist = camera.position.distanceTo(target);
      _p.copy(target).project(camera);
      const behind = _p.z > 1;
      let x = (_p.x * 0.5 + 0.5) * window.innerWidth;
      let y = (-_p.y * 0.5 + 0.5) * window.innerHeight;
      if (behind) {
        x = window.innerWidth - x;
        y = window.innerHeight - 40;
      }
      const m = 40;
      const clamped = behind || x < m || x > window.innerWidth - m || y < m || y > window.innerHeight - m;
      x = Math.min(window.innerWidth - m, Math.max(m, x));
      y = Math.min(window.innerHeight - m, Math.max(m, y));
      marker.style.left = `${x}px`;
      marker.style.top = `${y}px`;
      mkIcon.textContent = clamped ? '➤' : '◆';
      mkIcon.style.transform = clamped ? `rotate(${Math.atan2(y - window.innerHeight / 2, x - window.innerWidth / 2)}rad)` : '';
      mkDist.textContent = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
      marker.style.display = dist > 6 ? 'block' : 'none';
    } else {
      marker.style.display = 'none';
    }
  });

  net.on('close', closeDialog);

  return { ship, world, state: () => st, save, reward, talk, npcs, quests: QUESTS };
}
