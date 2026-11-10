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

  const SIDE = [];
  // ---------- Act 2: The Talon Rises ----------
  const HAVEN = V(-200, 30.5, -5300), FROSTFALL = V(0, 1.1, -9800), RUSTPORT = V(260, 30.5, -14300), LASTLIGHT = V(-300, 30.5, -18700);
  const FORT_PAD = V(250, 51, -5861);
  const boss = (id) => api.bosses?.byId(id);
  STORY.push(
    {
      id: 'act2_signal', act: 2, title: 'Echoes in the Drift', giver: 'reyes', turnIn: 'mira', reward: [400, 250],
      offer: "The Mothership's logs mention a Talon fortress in Nebula Drift. The jump gate east of the station is open to you now. Fly through it, find a free station called Haven, and talk to Captain Mira Sol. She knows the Drift better than anyone.",
      done: "So you're the one who scrapped the Mothership. Good. The Talon didn't die with her, pilot. They came here, and they're building something.",
      steps: [{ t: 'reach', at: HAVEN, r: 60, label: 'Take the jump gate to Nebula Drift and find Haven' }],
    },
    {
      id: 'act2_clouds', act: 2, title: 'Into the Clouds', giver: 'mira', turnIn: 'mira', reward: [450, 300],
      offer: "Haven's shields run on plasma from the gas pockets in the clouds. We're low. Bring me 6, and while you're out there, scan two of the ion storms. I need to know where they're drifting.",
      done: 'The storms are moving toward the fortress. Like something is pulling them. Thank you, this buys us time.',
      steps: [
        { t: 'collect', of: 'plasma', n: 6, label: (p) => `Shoot glowing plasma pockets in the clouds (${p}/6)`, at: () => V(-300, 60, -5600) },
        { t: 'scan', of: 'storm', n: 2, label: (p) => `Scan ion storms: hold your crosshair on one (${p}/2)`, at: () => api.storms?.[0]?.c },
      ],
    },
    {
      id: 'act2_ghosts', act: 2, title: 'Ghosts in the Fog', giver: 'mira', turnIn: 'mira', reward: [500, 320], rep: { talon: -5, command: 3 },
      offer: 'Our scouts keep vanishing in the fog. Talon cloakers: invisible until they\'re right on top of you. Hunt three of them. Look for the shimmer.',
      done: "Three fewer ghosts. My pilots can breathe again. Now, there's something I've been waiting to ask you.",
      steps: [{ t: 'kill', of: 'cloaker', n: 3, sector: 'nebula', label: (p) => `Destroy Talon cloakers in the fog (${p}/3)`, at: () => V(-150, 60, -5800) }],
    },
    {
      id: 'act2_defector', act: 2, title: 'The Turncoat', giver: 'mira', turnIn: 'mira', reward: [600, 380],
      offer: "A Talon pilot named Dace wants out. He's hiding in an escape pod in the western clouds. Dock with his pod. The Talon will want him back, so expect company.",
      done: 'Dace is safe aboard. He says the Talon are smuggling weapons through Cryo-9, and that the fortress holds Rook\'s codes. Now the hard part: what do we do with him?',
      steps: [{
        t: 'hold', at: V(-380, 70, -5750), r: 22, secs: 4, ship: true, crate: 'pod', holdText: 'Docking with the escape pod…', label: 'Dock with Dace\'s escape pod (stay close)',
        onStart: (a) => {
          for (let i = 0; i < 3; i++) a.enemies.spawn('interceptor', V(-380 + i * 30, 90, -5600), { sector: 'nebula', level: Math.max(6, a.level() - 2), tag: 'dace' });
        },
      }],
      choices: [
        { label: 'Give Dace sanctuary at Haven', text: '"Thank you. I won\'t forget this." Haven grows a little stronger.', effect: (a) => { a.rep('command', 6); a.rep('talon', -10); a.st.flags.dace = 'haven'; } },
        { label: 'Turn him in to Station Command (+800 cr bounty)', text: 'Command pays well. Mira says nothing, but she looks at you differently now.', effect: (a) => { a.reward(800, 0); a.rep('command', 10); a.rep('talon', -5); a.st.flags.dace = 'command'; } },
        { label: 'Send him back to the Talon (they\'ll owe you)', text: 'Dace goes home. The Talon remember favors. So does Mira.', effect: (a) => { a.rep('talon', 20); a.rep('command', -8); a.st.flags.dace = 'talon'; } },
      ],
    },
    {
      id: 'act2_frost', act: 2, title: 'Cold Trail', giver: 'mira', turnIn: 'okoro', reward: [550, 360],
      offer: 'If the weapons go through Cryo-9, Chief Okoro at Frostfall will know. The gate to Cryo-9 is open now. Go talk to her. And dress warmly.',
      done: "Talon ships? They've been landing near the Wyrm's crater for weeks. Nobody goes near the crater. Nobody sane, anyway.",
      steps: [{ t: 'reach', at: FROSTFALL, r: 60, label: 'Jump to Cryo-9 and land at Frostfall base' }],
    },
    {
      id: 'act2_wyrm', act: 2, title: 'What Lies Beneath', giver: 'okoro', turnIn: 'okoro', reward: [1200, 700], rep: { command: 5 },
      offer: 'The Talon woke the Frost Wyrm and it\'s been tearing up my mining rigs ever since. Kill it. Aim for the head; the body\'s too thick to hurt much.',
      done: "It's really dead? Under the ice we found Talon weapon crates, all marked for one place: the fortress in Nebula Drift. Go end this.",
      steps: [{ t: 'boss', of: 'wyrm', label: () => `Slay the Frost Wyrm at the crater (${Math.round((boss('wyrm')?.hpFrac() ?? 1) * 100)}%)`, at: () => api.cryo?.crater.clone().setY(30) }],
    },
    {
      id: 'act2_codes', act: 2, title: 'Storm the Fortress', giver: 'mira', turnIn: 'mira', reward: [1500, 900], rep: { talon: -15, command: 8 },
      offer: 'Time to hit the Talon where they live. Knock out the four gun platforms on the fortress roof, land on the pad, and go in on foot. Captain Rook is on the bridge. Bring back his codes.',
      done: "Rook's orders! \"Sell everything to the Scrapyard buyer.\" Someone in the Scrapyard has been buying from the Talon. The gate's open. Find out who.",
      steps: [
        { t: 'kill', of: 'turret', n: 4, sector: 'nebula', label: (p) => `Destroy the fortress roof turrets (${p}/4)`, at: () => V(250, 70, -5900) },
        { t: 'interior', of: 'fortress', label: 'Land on the pad, go inside, and defeat Captain Rook', at: () => FORT_PAD },
      ],
    },
    {
      id: 'act2_buyer', act: 2, title: 'The Buyer', giver: 'mira', turnIn: 'gizmo', reward: [900, 600],
      offer: 'Go to Rustport in the Scrapyard and find whoever bought from Rook. My money is on Boss Gizmo. Careful. Scavs shoot back.',
      done: '...Fine. Yes. I bought Talon guns. Everybody buys Talon guns! But I didn\'t know about the Rift until Rook\'s people started asking about the Scrap King. What do you want from me?',
      steps: [{ t: 'reach', at: RUSTPORT, r: 60, label: 'Jump to the Scrapyard and land at Rustport' }],
      choices: [
        { label: 'Threaten him into helping', text: 'Gizmo sweats. "Okay, okay! I\'ll tell you everything." The clans hear about it.', effect: (a) => { a.rep('scav', -15); a.rep('command', 5); } },
        { label: 'Cut a deal: he helps, you keep quiet', text: '"Now you\'re speaking scav." Gizmo shakes your hand. It\'s sticky.', effect: (a) => { a.rep('scav', 20); a.reward(500, 0); } },
        { label: 'Report him to Station Command', text: 'Command fines Gizmo a fortune. He helps you anyway, through gritted teeth.', effect: (a) => { a.rep('command', 10); a.rep('scav', -25); } },
      ],
    },
    // ---------- Act 3: Signal from the Rift ----------
    {
      id: 'act3_king', act: 3, title: 'The Scrap King', giver: 'gizmo', turnIn: 'gizmo', reward: [1800, 1000],
      offer: 'Rook wanted coordinates hidden in the core of the Scrap King. That\'s a junk dreadnought south-west of here. His magnets will drag you in, so break the coils first, then crack the core.',
      done: 'Coordinates. A sector past the Scrapyard. The Void Rift. The gate just woke up on its own. That can\'t be good.',
      steps: [{ t: 'boss', of: 'scrapking', label: () => `Defeat the Scrap King (${Math.round((boss('scrapking')?.hpFrac() ?? 1) * 100)}%)`, at: () => boss('scrapking')?.center() }],
    },
    {
      id: 'act3_varga', act: 3, title: 'Last Light', giver: 'gizmo', turnIn: 'varga', reward: [800, 600],
      offer: 'There\'s a research outpost at the edge of the Rift. Last Light. Some doctor lives there. Nobody visits. Go see her.',
      done: 'A visitor. And a pilot. The Rift has been singing louder since the Talon started poking at it. I need help, and you are all I have.',
      steps: [{ t: 'reach', at: LASTLIGHT, r: 60, label: 'Jump to the Void Rift and land at Last Light' }],
    },
    {
      id: 'act3_samples', act: 3, title: 'Void Samples', giver: 'varga', turnIn: 'varga', reward: [1000, 700],
      offer: 'I need six void shards from the Hive structures, and a full scan of the Rift\'s eye. Don\'t fly into it. I mean it.',
      done: 'The shards are hollow. They\'re seeds. The Hive is growing out of the Rift, and the gates are how it plans to spread.',
      steps: [
        { t: 'collect', of: 'void', n: 6, label: (p) => `Mine void shards on the Hive structures (${p}/6)`, at: () => V(0, 60, -19100) },
        { t: 'scan', of: 'rift', n: 1, label: 'Scan the eye of the Rift (from a safe distance!)', at: () => api.rift?.core },
      ],
    },
    {
      id: 'act3_wells', act: 3, title: 'Gravity Dance', giver: 'varga', turnIn: 'varga', reward: [1100, 750],
      offer: 'I need sensors planted inside two of the smaller gravity wells. Fly into each and hold steady while the sensor locks on. They pull hard.',
      done: 'The wells are feeding the Queen. She sits in the middle of it all, like a spider in a web of gravity.',
      steps: [
        { t: 'hold', at: () => api.rift?.wells[1]?.c, r: 40, secs: 5, ship: true, holdText: 'Planting sensor…', label: 'Plant a sensor in the first gravity well' },
        { t: 'hold', at: () => api.rift?.wells[2]?.c, r: 40, secs: 5, ship: true, holdText: 'Planting sensor…', label: 'Plant a sensor in the second gravity well' },
      ],
    },
    {
      id: 'act3_swarm', act: 3, title: 'The Swarm', giver: 'varga', turnIn: 'varga', reward: [1300, 850], rep: { command: 5 },
      offer: 'The Hive knows we\'re here. Thin the swarm before it overruns Last Light. Twenty-five of them should get its attention.',
      done: 'The swarm is pulling back to protect her. Good. Now I can send my probe.',
      steps: [{ t: 'kill', of: 'any', faction: 'hive', n: 25, sector: 'rift', label: (p) => `Destroy Hive creatures (${p}/25)`, at: () => V(0, 60, -19100) }],
    },
    {
      id: 'act3_probe', act: 3, title: 'The Probe', giver: 'varga', turnIn: 'varga', reward: [1500, 950],
      offer: 'My probe has to get close to the Queen to map her weak points. It is slow and it is fragile and the Hive will hate it. Keep it alive.',
      done: 'The map is perfect. Six eyes that open two at a time, and a core behind them. She can be killed.',
      steps: [{
        t: 'escort', of: 'probe', label: 'Escort Dr. Varga\'s probe to the Hive Queen',
        at: () => api.activities?.escort?.obj.position || LASTLIGHT,
        tick: (a) => {
          if (!a.activities.escort) a.activities.startEscort({ id: 'probe', questId: 'act3_probe', name: 'research probe', hp: 900, speed: 18,
            path: [V(-300, 45, -18730), V(-260, 60, -19000), V(-150, 70, -19300), V(-90, 70, -19380)],
            waves: [{ at: 0.1, types: ['swarmer', 'swarmer', 'swarmer', 'swarmer'] }, { at: 0.45, types: ['spitter', 'swarmer', 'swarmer', 'swarmer'] }, { at: 0.75, types: ['spitter', 'spitter', 'swarmer', 'swarmer', 'swarmer'] }] });
        },
      }],
    },
    {
      id: 'act3_queen', act: 3, title: 'The Hive Queen', giver: 'varga', turnIn: 'varga', reward: [3000, 2000], rep: { command: 10 },
      offer: 'This is it. Shoot her eyes when they open. When she\'s blind, her core opens. When she gets angry, and she will, don\'t stop shooting.',
      done: 'She\'s gone. The Hive is screaming, can you hear it? But the Rift is getting worse. We have one last thing to do.',
      steps: [{ t: 'boss', of: 'queen', label: () => `Destroy the Hive Queen (${Math.round((boss('queen')?.hpFrac() ?? 1) * 100)}%)`, at: () => boss('queen')?.center() }],
    },
    {
      id: 'act3_finale', act: 3, title: 'Seal the Rift', giver: 'varga', turnIn: 'varga', reward: [4000, 3000],
      offer: 'My device needs ten seconds close to the eye of the Rift. The pull will be enormous. Hold your ship steady. Then come back to me, and we decide what happens to the Rift. Together.',
      done: 'The device is in place. One command and the Rift closes forever. Or... we could keep it open. Use it. Study it. Pilot, this is your call.',
      steps: [{ t: 'hold', at: () => api.rift?.core, r: 95, secs: 10, ship: true, holdText: 'Calibrating the device…', label: 'Hold your ship near the eye of the Rift for 10 seconds' }],
      choices: [
        { label: 'Seal the Rift forever', text: 'The Rift folds shut with a sound like a door the size of the sky. The Hive goes quiet. The Reach is safe. They will tell stories about you.', effect: (a) => { a.st.flags.ending = 'sealed'; a.rep('command', 20); a.reward(3000, 0); a.announce('🌌 SEALED the Void Rift and saved the Reach!'); } },
        { label: 'Harness its power', text: 'The Rift bends to your will, a little. Varga hands you something that hums with void energy. Command will not be pleased.', effect: (a) => { a.st.flags.ending = 'harnessed'; a.rep('command', -10); a.loot?.give('legendary'); a.loot?.give('legendary'); a.announce('🌌 HARNESSED the power of the Void Rift!'); } },
        { label: 'Leave it open for science', text: 'Varga cries a little. Happy tears. "Nine years. Nine years and I finally get to read the rest of the book." Command funds her lab.', effect: (a) => { a.st.flags.ending = 'studied'; a.reward(5000, 2000); a.rep('command', 5); a.announce('🌌 left the Void Rift open for science!'); } },
      ],
    },
  );

  // ---------- Side quests ----------
  const course = (id) => ({ t: 'course', of: id, label: () => `Finish the ${api.activities?.COURSES[id].name} time trial (fly through the green start ring)`, at: () => api.activities?.COURSES[id].pts[0] });
  SIDE.push(
    { id: 'side_race_home', title: 'Station Sprint', giver: 'bolt', turnIn: 'bolt', reward: [300, 200], req: { story: 1 },
      offer: 'I set up a little race course around the station. Rings, lights, the works. Fly it once. If you get gold, I\'ll be very impressed.', done: 'Not bad! Your best time\'s on the board now.', steps: [course('home')] },
    { id: 'side_convoy', title: 'Convoy Duty', giver: 'vega', turnIn: 'vega', reward: [700, 400], req: { story: 4 }, rep: { command: 5 },
      offer: 'A freighter is leaving Kepler for Station NoCOM with medicine. Pirates know it. Stay with it all the way.', done: 'The medicine got through. People will live because you flew well today.',
      steps: [{ t: 'escort', of: 'kepler', label: 'Escort the freighter Hope from Kepler to Station NoCOM', at: () => api.activities?.escort?.obj.position || V(360, 40, -1290),
        tick: (a) => {
          if (!a.activities.escort) a.activities.startEscort({ id: 'kepler', questId: 'side_convoy', name: 'freighter Hope', hp: 700, speed: 20,
            path: [V(360, 42, -1270), V(260, 55, -1000), V(120, 55, -700), V(10, 45, -470)],
            waves: [{ at: 0.15, types: ['drone', 'drone', 'drone'] }, { at: 0.5, types: ['interceptor', 'interceptor', 'drone'] }, { at: 0.8, types: ['interceptor', 'interceptor', 'interceptor'] }] });
        } }] },
    { id: 'side_rescue', title: 'Lost Miner', giver: 'juno', turnIn: 'juno', reward: [350, 220], req: { story: 2 },
      offer: 'One of my miners lost power out past the Belt. Her pod\'s drifting. Dock with it and bring her home.', done: 'She\'s okay! Shaken, but okay. Here, you earned this.',
      steps: [{ t: 'hold', at: V(-330, 30, -900), r: 18, secs: 4, ship: true, crate: 'pod', holdText: 'Docking with the pod…', label: 'Dock with the stranded miner\'s pod' }] },
    { id: 'side_iron', title: 'Hull Patch', giver: 'bolt', turnIn: 'bolt', reward: [300, 180], req: { story: 1 },
      offer: 'I\'m out of iron for hull plates. Bring me 10 from the orange asteroids in the Belt.', done: 'Lovely. That\'ll keep a lot of ships flying.',
      steps: [{ t: 'collect', of: 'iron', n: 10, label: (p) => `Mine iron from orange asteroids in the Belt (${p}/10)`, at: () => LOC.belt }] },
    { id: 'side_wanted_kael', title: 'Wanted: Red Baron Kael', giver: 'reyes', turnIn: 'reyes', reward: [900, 500], req: { story: 3, level: 5 }, rep: { talon: -5 },
      offer: 'Red Baron Kael has shot down six of our pilots. He hunts west of the Belt. Shielded ship, very fast. Bring him down.', done: 'Kael\'s gone? The whole station will sleep better tonight.',
      steps: [{ t: 'kill', of: 'ace', n: 1, label: 'Shoot down Red Baron Kael (west of the Belt)', at: () => V(-450, 70, -1300), tick: (a) => a.activities.ensureAce('wanted:kael', 'home', V(-450, 70, -1300), 'Red Baron Kael', Math.max(5, a.level())) }] },
    { id: 'side_race_nebula', title: 'Nebula Needle', giver: 'quill', turnIn: 'quill', reward: [500, 300],
      offer: 'Haven pilots race through the clouds for fun. Well, for money. Want to try?', done: 'Ha! You made it out of the fog. Respect.', steps: [course('nebula')] },
    { id: 'side_caches', title: 'Lost Cargo', giver: 'quill', turnIn: 'quill', reward: [600, 350],
      offer: 'Three of my cargo pods got dumped in the clouds during a pirate chase. Find them and press E when you\'re close.', done: 'All three! You\'re better at this than my last three pilots.',
      steps: [
        { t: 'pickup', ship: true, crate: 'box', at: V(-450, 40, -5900), what: 'the cargo pod', text: '📦 Got one!', label: 'Find the first cargo pod (fly close, E)' },
        { t: 'pickup', ship: true, crate: 'box', at: V(450, 100, -5450), what: 'the cargo pod', text: '📦 Got another!', label: 'Find the second cargo pod (fly close, E)' },
        { t: 'pickup', ship: true, crate: 'box', at: V(-50, 20, -6200), what: 'the cargo pod', text: '📦 That\'s all three!', label: 'Find the third cargo pod (fly close, E)' },
      ] },
    { id: 'side_survey', title: 'Storm Chaser', giver: 'hale', turnIn: 'hale', reward: [550, 380],
      offer: 'I collect scans of strange things. Anomalies: storms, relics, wrecks, weirdness. Any three, from any sector. They show on your radar.', done: 'Oh, these are wonderful. Thank you, thank you.',
      steps: [{ t: 'scan', of: 'any', n: 3, label: (p) => `Scan anomalies in any sector (${p}/3)` }] },
    { id: 'side_smuggle', title: 'Smooth Operator', giver: 'quill', turnIn: null, reward: [1400, 500], rep: { scav: 10, command: -3 }, smuggle: true,
      offer: 'I have three crates that need to reach Tinker Mags in Rustport. Command\'s patrol scanners sweep near the gates. Fly around the beams, not through them. What\'s inside? Nothing. Absolutely nothing.', done: '',
      onAccept: (a) => { a.st.goods.contraband = (a.st.goods.contraband || 0) + 3; a.hud.toast('📦 You got 3 crates of contraband. Avoid the patrol scanners!', '#ffb03a'); },
      onTurnIn: (a) => { a.st.goods.contraband = Math.max(0, (a.st.goods.contraband || 0) - 3); a.achieve('smuggler'); },
      steps: [{ t: 'talk', npc: 'mags', ask: 'Quill sent you some "nothing"', text: 'Three crates of nothing! My favorite. Pleasure doing business, pilot.', need: (a) => (a.st.goods.contraband || 0) >= 3, label: 'Deliver the crates to Tinker Mags in Rustport (avoid the scanners!)' }] },
    { id: 'side_race_cryo', title: 'Ice Run', giver: 'rin', turnIn: 'rin', reward: [600, 360],
      offer: 'The cave run! Through the ice tunnels and back out over the plain. Don\'t scrape the walls.', done: 'You came out with all your paint! Amazing.', steps: [course('cryo')] },
    { id: 'side_ice', title: 'Cold Storage', giver: 'okoro', turnIn: 'okoro', reward: [600, 380],
      offer: 'Frostfall runs on ice crystals. Bring me fifteen. The cave to the west is full of them.', done: 'That\'s a week of fuel and water. You\'re a good one.',
      steps: [{ t: 'collect', of: 'ice', n: 15, label: (p) => `Mine ice crystals on Cryo-9 (${p}/15)`, at: () => api.cryo?.cave }] },
    { id: 'side_patrol', title: 'The Lost Patrol', giver: 'okoro', turnIn: 'okoro', reward: [750, 450],
      offer: 'A Command patrol ship went down on the ice years ago. Its black box might tell us what\'s under the crater. Land near the wreck and grab it.', done: 'The last thing on the recording is a roar. And then just ice. Well. Now we know.',
      steps: [
        { t: 'reach', at: V(300, 3, -10320), r: 60, label: 'Find the frozen patrol ship east of the crater' },
        { t: 'pickup', at: V(286, 0.4, -10300), crate: 'box', what: 'the black box', text: '📼 You pried the black box out of the ice.', label: 'Land, walk to the glowing crate and press E' },
      ] },
    { id: 'side_lanes', title: 'Clear the Lanes', giver: 'rin', turnIn: 'rin', reward: [700, 420], rep: { talon: -4 },
      offer: 'Talon minelayers keep seeding mines over the ice. Knock out four of them before somebody hits one.', done: 'Lanes are clear. My haulers say thanks.',
      steps: [{ t: 'kill', of: 'minelayer', n: 4, label: (p) => `Destroy Talon minelayers (${p}/4)`, at: () => V(-200, 30, -10250) }] },
    { id: 'side_race_scrap', title: 'Junk Jumper', giver: 'rusty', turnIn: 'rusty', reward: [700, 420],
      offer: 'Heh. Fly a lap through the debris field. Most kids don\'t come back with wings.', done: 'You still have wings! I owe somebody money.', steps: [course('scrap')] },
    { id: 'side_blackboxes', title: 'Black Boxes', giver: 'gizmo', turnIn: 'gizmo', reward: [800, 480],
      offer: 'Every wreck out here has a black box, and every black box is worth money to somebody. Bring me three.', done: 'Lovely. I know three widows and a lawyer who\'ll pay for these.',
      steps: [0, 1, 2].map((i) => ({ t: 'pickup', ship: true, crate: 'box', at: () => api.scrap?.wrecks[i]?.clone().add(V(0, 22, 0)), what: 'the black box', text: '📼 Black box recovered.', label: `Recover black box ${i + 1}/3 from the wrecks (fly close, E)` })) },
    { id: 'side_scrap', title: 'Scrap Drive', giver: 'mags', turnIn: 'mags', reward: [700, 400],
      offer: 'I need scrap. Lots of it. Twenty pieces from the wrecks. Shoot the glowing bits.', done: 'Twenty! I can build a whole ship out of this. A bad one.',
      steps: [{ t: 'collect', of: 'scrap', n: 20, label: (p) => `Salvage scrap from the wrecks (${p}/20)`, at: () => api.scrap?.wrecks[0] }] },
    { id: 'side_rogues', title: 'Rogue Raiders', giver: 'gizmo', turnIn: 'gizmo', reward: [900, 520], req: { rep: { scav: 0 } }, rep: { scav: 10 },
      offer: 'Some of my boys went rogue and started shooting at everybody. Including me. Deal with six of them and nobody will hold it against you.', done: 'Good. Rogues are bad for business.',
      steps: [{ t: 'kill', of: 'raider', n: 6, label: (p) => `Destroy rogue raiders (${p}/6)`, at: () => V(-100, 50, -14400),
        tick: (a) => {
          if (a.sector() !== 'scrap' || a.enemies.count('rogue') >= 3) return;
          if (a.currentPos().distanceTo(V(-100, 50, -14400)) > 700) return;
          const e = a.enemies.spawn('raider', V(-100 + (Math.random() - 0.5) * 120, 60, -14400 + (Math.random() - 0.5) * 120), { sector: 'scrap', level: Math.max(13, a.level() - 2), tag: 'rogue', aggro: true });
          e.name = 'Rogue raider';
        } }] },
    { id: 'side_wanted_widow', title: 'Wanted: The Widow', giver: 'tov', turnIn: 'tov', reward: [2200, 1200], rep: { talon: -8 },
      offer: 'A Talon ace called the Widow hunts research ships near the Rift. She killed my brother. Please.', done: 'Thank you. I... thank you.',
      steps: [{ t: 'kill', of: 'ace', n: 1, label: 'Shoot down the Widow (east of Last Light)', at: () => V(350, 60, -19000), tick: (a) => a.activities.ensureAce('wanted:widow', 'rift', V(350, 60, -19000), 'The Widow', Math.max(18, a.level())) }] },
    { id: 'side_meds', title: 'Medicine Run', giver: 'tov', turnIn: null, reward: [1500, 700], rep: { command: 5 },
      offer: 'Last Light is out of medicine. Buy five crates of medical supplies anywhere and bring them here. I\'ll pay you back and then some.', done: '',
      onTurnIn: (a) => { a.st.goods.meds = Math.max(0, (a.st.goods.meds || 0) - 5); },
      steps: [
        { t: 'flag', check: (a) => (a.st.goods.meds || 0) >= 5, label: () => `Buy 5 medical supplies at any market (${Math.min(5, api.st.goods.meds || 0)}/5)` },
        { t: 'talk', npc: 'tov', ask: 'Here\'s your medicine', text: 'You beautiful human being. This will save lives out here.', need: (a) => (a.st.goods.meds || 0) >= 5, label: 'Bring the medicine to Quartermaster Tov at Last Light' },
      ] },
    { id: 'side_shards', title: 'Shard Hunter', giver: 'varga', turnIn: 'varga', reward: [1600, 900], req: { story: 17 },
      offer: 'Ten more void shards, please. For... research. Definitely not because they are beautiful.', done: 'Look at them glow. Thank you.',
      steps: [{ t: 'collect', of: 'void', n: 10, label: (p) => `Mine void shards on the Hive structures (${p}/10)`, at: () => V(0, 60, -19100) }] },
  );

  // Who says what after the story
  function afterSetup(a) {
    const varga = a.npc('varga');
    if (varga) {
      varga.greet = () => ({
        sealed: 'The Rift is closed. I sit by the window and listen to the silence. It\'s lovely.',
        harnessed: 'The void energy is stable. Mostly. Please stop glowing near my instruments.',
        studied: 'Page one hundred and twelve! The Rift is a library, pilot. And we have a library card.',
      }[a.st.flags.ending]);
    }
    const reyes = a.npc('reyes');
    if (reyes) reyes.greet = () => (a.st.flags.ending ? 'The whole Reach knows your name now. Still want to fly contracts? Good.' : null);
  }

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
  JOB_KINDS.home.push({ kind: 'scan', min: 1, max: 1, what: 'anomalies in Kepler Reach' });
  JOB_KINDS.nebula = [
    { kind: 'ace', where: at('nebula', 380, 30, 250), what: 'the eastern clouds' },
    { kind: 'scan', min: 2, max: 3, what: 'anomalies in the Drift' },
    { kind: 'kill', of: 'any', faction: 'talon', sector: 'nebula', min: 6, max: 10, where: at('nebula', 250, 20, -300), what: 'Red Talon ships in the Drift' },
    { kind: 'collect', of: 'plasma', min: 5, max: 10, where: at('nebula'), what: 'plasma from the gas pockets' },
    { kind: 'deliver', to: 'reyes', what: 'Haven\'s reports to Commander Reyes' },
    { kind: 'deliver', to: 'quill', what: 'a sealed crate to Trader Quill' },
  ];
  JOB_KINDS.cryo = [
    { kind: 'scan', min: 2, max: 2, what: 'anomalies on Cryo-9' },
    { kind: 'ace', where: at('cryo', -300, 10, 300), what: 'the far side of the moon' },
    { kind: 'kill', of: 'any', faction: 'talon', sector: 'cryo', min: 5, max: 9, where: at('cryo', -200, -10, -150), what: 'Talon raiders on Cryo-9' },
    { kind: 'collect', of: 'ice', min: 6, max: 12, where: at('cryo', 0, -38, 0), what: 'ice crystals' },
    { kind: 'deliver', to: 'mira', what: 'fuel cells to Captain Mira Sol' },
  ];
  JOB_KINDS.scrap = [
    { kind: 'ace', where: at('scrap', 380, 20, -300), what: 'the eastern wrecks' },
    { kind: 'kill', of: 'minelayer', sector: 'scrap', min: 3, max: 5, where: at('scrap'), what: 'Talon minelayers in the Scrapyard' },
    { kind: 'collect', of: 'scrap', min: 8, max: 14, where: at('scrap'), what: 'salvage from the wrecks' },
    { kind: 'collect', of: 'iron', min: 6, max: 10, where: at('scrap'), what: 'iron plating' },
    { kind: 'deliver', to: 'rin', what: 'spare parts to Engineer Rin' },
  ];
  JOB_KINDS.rift = [
    { kind: 'scan', min: 2, max: 2, what: 'anomalies in the Rift' },
    { kind: 'ace', where: at('rift', 350, 20, 300), what: 'the southern wells' },
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
    if (p.kind === 'scan') {
      return {
        id: 'job', job: true, title: `Survey: ${p.what}`, giver: p.giver, turnIn: p.giver, reward: [Math.round(p.n * 140 * scale), Math.round(p.n * 80 * scale)],
        offer: `Scan ${p.n} ${p.what}. Anomalies show up on your radar; hold your crosshair on one while flying.`, done: 'Great data. Thanks!',
        steps: [{ t: 'scan', of: 'any', sector: p.sector, n: p.n, label: (q) => `Scan ${p.what} (${q}/${p.n})` }],
      };
    }
    if (p.kind === 'ace') {
      const name = ACE_NAMES[(p.period + p.slot) % ACE_NAMES.length];
      const tag = `job:ace:${p.period}:${p.slot}`;
      return {
        id: 'job', job: true, title: `Wanted: ${name}`, giver: p.giver, turnIn: p.giver, reward: [Math.round(900 * scale), Math.round(450 * scale)], rep: { talon: -3 },
        offer: `${name} is hunting near ${p.what}. Shielded ship, very dangerous. Big bounty.`, done: 'The bounty is yours. Nice shooting.',
        steps: [{ t: 'kill', of: 'ace', n: 1, label: `Shoot down ${name} near ${p.what}`, at: () => at, tick: (a) => a.activities.ensureAce(tag, p.sector, at, name, Math.max(lvl, 4)) }],
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

  return { STORY, SIDE, makeJob, jobOffers, JOB_STATIONS, afterSetup };
}

const ACE_NAMES = ['Vex "Knife" Morrow', 'Sable Quint', 'Iron Rask', 'Captain Ashgrin', 'Dex Halloran', 'Mad Ollie Vance', 'Nyx Calloway', 'Grim Torvald'];

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
