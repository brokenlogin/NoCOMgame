// Quests for the space RPG: the story, side quests and the job boards' contracts.
// spaceRpg.js runs them; this file is just the content.
//
// A quest: { id, title, giver, turnIn (null = finishes on its own), reward: [credits, xp],
//   rep: { faction: +-n }, req: { level, story, rep: { faction: min } }, offer, done,
//   steps: [step...], choices: [{ label, text, effect(api) }], onAccept(api), onTurnIn(api) }
// A step: { t: type, label, n, of, sector, at, r, npc, text, secs, check(api), onStart(api) }
//   kill    of: enemy type, 'any', or faction: 'talon'   collect  of: material
//   boss    of: boss id         ring     n rings (flight school)     board  get in your ship
//   pickup  E near `at` on foot (ship: true = fly within 12m)       reach  get within r of `at`
//   talk    talk to npc (text is what they say)                      hold   stay within r for secs
//   scan    of: anomaly id or 'any'                                   flag   check(api) turns true
//   course  of: time trial id (finish it)                            interior of: boarding goal id

import * as THREE from 'three';
import { LOC } from './spaceWorld.js';
import { SECTORS } from './spaceData.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildQuests(api) {
  const { world, ship } = api;

  // ---------- Act 1: Kepler Reach ----------
  const STORY = [
    {
      id: 'training', act: 1, title: 'Flight School', giver: 'reyes', turnIn: 'reyes', reward: [100, 60],
      offer: "Welcome aboard Station NoCOM, cadet. Before I trust you with real work, show me you can fly. Your ship's in the north hangar. Fly through all six training rings.",
      done: "Not bad at all. You fly like you mean it. Now let's put you to work.",
      steps: [
        { t: 'board', label: 'Board your ship in the north hangar (E)', at: () => ship.position },
        { t: 'ring', n: 6, label: (p) => `Fly through the rings (${p}/6)`, at: (p) => world.ringPos(p), onStart: () => world.startRings(0) },
      ],
    },
    {
      id: 'mining', act: 1, title: 'Rock Hound', giver: 'reyes', turnIn: 'reyes', reward: [150, 80],
      offer: 'The station runs on crystal ore from the Belt to the west. Glowing blue rocks. Shoot them with your ship lasers and the ore comes to you. Bring back 8.',
      done: 'Lovely haul. Sell the ore to Juno whenever you like, she pays fair.',
      steps: [{ t: 'collect', of: 'ore', n: 8, label: (p) => `Mine glowing blue ore in the Belt (${p}/8)`, at: () => LOC.belt }],
    },
    {
      id: 'pirates', act: 1, title: 'Pirate Problem', giver: 'reyes', turnIn: 'reyes', reward: [250, 120], rep: { command: 5, talon: -5 },
      offer: 'Pirate drones have been hassling our miners out in the Belt. Clear them out. Six should send a message.',
      done: "That'll make them think twice. Here's your cut.",
      steps: [{ t: 'kill', of: 'drone', n: 6, label: (p) => `Destroy pirate drones near the Belt (${p}/6)`, at: () => LOC.belt }],
    },
    {
      id: 'delivery', act: 1, title: 'Special Delivery', giver: 'reyes', turnIn: 'vega', reward: [300, 150],
      offer: "I need this sealed package at Outpost Kepler, far out to the southeast. Hand it to Dockmaster Vega and nobody else. Don't open it.",
      done: '...You actually brought it. Reyes said you were reliable. Listen, I have something bigger for you.',
      onAccept: () => game().chat('📦 You received a sealed package.', true),
      steps: [],
    },
    {
      id: 'derelict', act: 1, title: 'Ghost Ship', giver: 'vega', turnIn: 'reyes', reward: [350, 200],
      offer: "There's a wreck out past the Belt. The Erebus. She went dark a year ago with a full data core aboard. Land, walk in, and bring that core to Reyes. And if you hear anything in there... don't.",
      done: 'The Erebus core! This has the pirates\' patrol routes and the location of their Mothership. You know what comes next.',
      steps: [{ t: 'pickup', of: 'core', label: 'Find the data core inside the derelict Erebus (land, walk in, E)', at: () => world.corePos(), text: '💾 You took the Erebus data core. Something creaks in the dark...' }],
    },
    {
      id: 'mothership', act: 1, title: 'The Mothership', giver: 'reyes', turnIn: 'reyes', reward: [1000, 500], rep: { command: 10, talon: -15 },
      offer: 'The Pirate Mothership. Four turrets guard a shielded reactor under her nose. Take out the turrets, the shield drops, then hit the core. Upgrade your ship with Juno first. Good luck, pilot.',
      done: 'You did it! The Mothership is scrap and the space lanes are free. Station NoCOM salutes you, Hero.',
      steps: [{
        t: 'boss', of: 'mothership',
        label: () => (!world.bossAlive ? 'The Mothership is down!' : world.shieldUp ? `Destroy the Mothership's turrets (${world.turretsLeft} left)` : `Shoot the reactor core under the nose (${Math.round(world.bossHp * 100)}%)`),
        at: () => (world.shieldUp ? LOC.mothership : world.reactorPos()),
      }],
      onTurnIn: (a) => a.achieve('mother'),
    },
  ];
  function game() {
    return api.game;
  }

  // ---------- Side quests (more in later acts) ----------
  const SIDE = [];

  // ---------- Job boards ----------
  // Contracts are rebuilt from small param objects (that's what gets saved).
  // kinds: kill (of, n, sector), collect (of, n, sector), deliver (to npc)
  const JOB_KINDS = {
    home: [
      { kind: 'kill', of: 'drone', min: 5, max: 10, where: LOC.belt, what: 'pirate drones in the Belt' },
      { kind: 'collect', of: 'ore', min: 8, max: 16, where: LOC.belt, what: 'crystal ore' },
      { kind: 'collect', of: 'iron', min: 6, max: 12, where: LOC.belt, what: 'iron from the Belt' },
      { kind: 'deliver', to: 'vega', what: 'a crate of supplies to Dockmaster Vega' },
    ],
  };
  const at = (id, dx = 0, dy = 0, dz = 0) => { const c = SECTORS[id].center; return [c[0] + dx, c[1] + dy, c[2] + dz]; };
  JOB_KINDS.nebula = [
    { kind: 'kill', of: 'any', faction: 'talon', sector: 'nebula', min: 6, max: 10, where: at('nebula', 250, 20, -300), what: 'Red Talon ships in the Drift' },
    { kind: 'collect', of: 'plasma', min: 5, max: 10, where: at('nebula'), what: 'plasma from the gas pockets' },
    { kind: 'deliver', to: 'reyes', what: 'Haven\'s reports to Commander Reyes' },
    { kind: 'deliver', to: 'quill', what: 'a sealed crate to Trader Quill' },
  ];
  JOB_KINDS.cryo = [
    { kind: 'kill', of: 'any', faction: 'talon', sector: 'cryo', min: 5, max: 9, where: at('cryo', -200, -10, -150), what: 'Talon raiders on Cryo-9' },
    { kind: 'collect', of: 'ice', min: 6, max: 12, where: at('cryo', 0, -38, 0), what: 'ice crystals' },
    { kind: 'deliver', to: 'mira', what: 'fuel cells to Captain Mira Sol' },
  ];
  JOB_KINDS.scrap = [
    { kind: 'kill', of: 'minelayer', sector: 'scrap', min: 3, max: 5, where: at('scrap'), what: 'Talon minelayers in the Scrapyard' },
    { kind: 'collect', of: 'scrap', min: 8, max: 14, where: at('scrap'), what: 'salvage from the wrecks' },
    { kind: 'collect', of: 'iron', min: 6, max: 10, where: at('scrap'), what: 'iron plating' },
    { kind: 'deliver', to: 'rin', what: 'spare parts to Engineer Rin' },
  ];
  JOB_KINDS.rift = [
    { kind: 'kill', of: 'any', faction: 'hive', sector: 'rift', min: 10, max: 18, where: at('rift'), what: 'Hive creatures' },
    { kind: 'collect', of: 'void', min: 3, max: 6, where: at('rift'), what: 'void shards' },
    { kind: 'deliver', to: 'okoro', what: 'Rift samples to Chief Okoro' },
  ];
  const JOB_STATIONS = { reyes: 'home', mira: 'nebula', okoro: 'cryo', gizmo: 'scrap', varga: 'rift' };

  function makeJob(p) {
    const lvl = p.level || 1;
    const scale = 1 + (lvl - 1) * 0.12;
    const at = p.where ? V(...p.where) : null;
    if (p.kind === 'kill') {
      return {
        id: 'job', job: true, title: `Bounty: ${p.what}`, giver: p.giver, turnIn: p.giver, reward: [Math.round(p.n * 32 * scale), Math.round(p.n * 15 * scale)],
        rep: { command: 2, talon: -2 }, offer: `Wanted: destroy ${p.n} ${p.what}.`, done: 'Bounty confirmed. Credits are in your account.',
        steps: [{ t: 'kill', of: p.of, faction: p.faction, sector: p.sector, n: p.n, label: (q) => `Destroy ${p.what} (${q}/${p.n})`, at: () => at }],
      };
    }
    if (p.kind === 'collect') {
      return {
        id: 'job', job: true, title: `Contract: ${p.what}`, giver: p.giver, turnIn: p.giver, reward: [Math.round(p.n * 22 * scale), Math.round(p.n * 9 * scale)],
        offer: `The refinery needs ${p.n} ${p.what}. Bring it in.`, done: 'Weighed and paid. Pleasure doing business.',
        steps: [{ t: 'collect', of: p.of, n: p.n, label: (q) => `Collect ${p.what} (${q}/${p.n})`, at: () => at }],
      };
    }
    // deliver
    return {
      id: 'job', job: true, title: 'Delivery run', giver: p.giver, turnIn: null, reward: [Math.round(260 * scale), Math.round(110 * scale)],
      offer: `Take ${p.what}. They're expecting you.`, done: 'Delivered!',
      steps: [{ t: 'talk', npc: p.to, ask: 'Here\'s your delivery', text: 'Right on time. Thanks, pilot.', label: () => `Deliver ${p.what}` }],
    };
  }

  // Three offers per board, new ones every 10 minutes (the same for everyone at the same time)
  function jobOffers(giver, period, level) {
    const sector = JOB_STATIONS[giver];
    const kinds = JOB_KINDS[sector];
    if (!kinds) return [];
    const rnd = rng(hash(`${giver}:${period}`));
    const out = [];
    for (let i = 0; i < 3; i++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      const n = k.min ? k.min + Math.floor(rnd() * (k.max - k.min + 1)) : 1;
      out.push({ ...k, n, giver, sector, level, where: k.where?.toArray?.() ?? k.where, slot: i, period });
    }
    return out;
  }

  return { STORY, SIDE, makeJob, jobOffers, JOB_STATIONS };
}

export const SECTOR_CENTER = (id) => V(...SECTORS[id].center);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { hash };
