// Numbers and words for the Realm of Embervale (dndRealm.js builds it, dndRpg.js runs it).
// A tabletop-style fantasy RPG: roll a d20, add your bonus, beat the target's Armor Class.

// ---------- Dice ----------
export const roll = (n, d) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += 1 + Math.floor(Math.random() * d);
  return t;
};
// "2d6+3" -> number (crit doubles the dice)
export function rollExpr(expr, crit = false) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr);
  if (!m) return Number(expr) || 0;
  return roll(Number(m[1]) * (crit ? 2 : 1), Number(m[2])) + Number(m[3] || 0);
}
export const mod = (score) => Math.floor((score - 10) / 2);
export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];
export const MAX_LEVEL = 10;
export const levelFor = (xp) => XP_TABLE.filter((x) => xp >= x).length;
export const prof = (lvl) => 2 + Math.floor((lvl - 1) / 4);

// ---------- Classes ----------
// abilities: [level unlocked, id]. slots: spell slots per long rest by level.
export const CLASSES = {
  fighter: {
    name: 'Fighter', icon: '🛡️', hitDie: 10, main: 'STR', color: 0xb8443a, armor: 'heavy', shield: true,
    weapon: 'longsword', armorStart: 'chainmail', skills: ['STR', 'CON'],
    desc: 'Tough, armored, hits hard. Second Wind heals you mid-fight, Action Surge attacks twice.',
    abilities: [[1, 'power'], [1, 'secondWind'], [3, 'cleave'], [5, 'surge'], [7, 'champion']],
    slots: null,
  },
  wizard: {
    name: 'Wizard', icon: '🧙', hitDie: 6, main: 'INT', color: 0x5a6ad8, armor: 'none', shield: false,
    weapon: 'staff', armorStart: null, skills: ['INT', 'WIS'],
    desc: 'Fragile but devastating. Fire Bolt for free, Magic Missile never misses, Fireball melts groups.',
    abilities: [[1, 'firebolt'], [1, 'missile'], [1, 'shield'], [3, 'scorch'], [5, 'fireball'], [7, 'cone']],
    slots: [2, 3, 4, 4, 5, 6, 7, 7, 8, 9],
  },
  rogue: {
    name: 'Rogue', icon: '🗡️', hitDie: 8, main: 'DEX', color: 0x3a8a5a, armor: 'light', shield: false,
    weapon: 'rapier', armorStart: 'leather', skills: ['DEX', 'CHA'],
    desc: 'Quick and sneaky. Hide, then Sneak Attack for huge damage. Great at locks and talking your way out.',
    abilities: [[1, 'hide'], [1, 'poison'], [3, 'offhand'], [5, 'uncanny'], [7, 'evasion']],
    slots: null,
  },
  cleric: {
    name: 'Cleric', icon: '✨', hitDie: 8, main: 'WIS', color: 0xd8b83a, armor: 'medium', shield: true,
    weapon: 'mace', armorStart: 'chainshirt', skills: ['WIS', 'CHA'],
    desc: 'Holy warrior. Heals yourself, smites with Guiding Bolt, and turns the undead to dust.',
    abilities: [[1, 'flame'], [1, 'cure'], [1, 'guiding'], [3, 'turn'], [5, 'spirit'], [7, 'massHeal']],
    slots: [2, 3, 4, 4, 5, 6, 7, 7, 8, 9],
  },
};
export const ABILITIES = {
  power: { name: 'Power Attack', icon: '💪', desc: 'Attack at -3 to hit for +6 damage' },
  secondWind: { name: 'Second Wind', icon: '🌬️', desc: 'Heal 1d10 + level (once per fight)', perFight: 1 },
  cleave: { name: 'Cleave', icon: '🪓', desc: 'Attack every enemy (once per fight)', perFight: 1 },
  surge: { name: 'Action Surge', icon: '⚡', desc: 'Attack twice this turn (once per fight)', perFight: 1 },
  champion: { name: 'Champion', icon: '👑', desc: 'Passive: your attacks crit on 19-20', passive: true },
  firebolt: { name: 'Fire Bolt', icon: '🔥', desc: 'Spell attack, 1d10 fire (2d10 at level 5). Free!' },
  missile: { name: 'Magic Missile', icon: '✴️', desc: '3 darts of 1d4+1 that never miss (1 slot)', slot: 1 },
  shield: { name: 'Shield', icon: '🔰', desc: '+5 AC until your next turn (1 slot)', slot: 1 },
  scorch: { name: 'Scorching Ray', icon: '☄️', desc: '3 rays, 2d6 fire each (1 slot)', slot: 1 },
  fireball: { name: 'Fireball', icon: '💥', desc: '8d6 fire to ALL enemies, DEX save for half (1 slot)', slot: 1 },
  cone: { name: 'Cone of Cold', icon: '❄️', desc: '8d8 cold to ALL enemies, CON save for half (1 slot)', slot: 1 },
  hide: { name: 'Hide', icon: '🌫️', desc: 'DEX check DC 12: your next attack has advantage + Sneak Attack' },
  poison: { name: 'Poisoned Blade', icon: '🧪', desc: 'Attack + 2d6 poison (twice per fight)', perFight: 2 },
  offhand: { name: 'Off-hand Strike', icon: '🔪', desc: 'Attack, then a 1d6 dagger jab' },
  uncanny: { name: 'Uncanny Dodge', icon: '💨', desc: 'Passive: the first hit each round does half damage', passive: true },
  evasion: { name: 'Evasion', icon: '🤸', desc: 'Passive: area attacks do no damage if you save', passive: true },
  flame: { name: 'Sacred Flame', icon: '🕯️', desc: 'DEX save or 1d8 radiant (2d8 at level 5). Free!' },
  cure: { name: 'Cure Wounds', icon: '💚', desc: 'Heal (level/3+1)d8 + WIS (1 slot)', slot: 1 },
  guiding: { name: 'Guiding Bolt', icon: '🌟', desc: 'Spell attack 4d6 radiant, next attack has advantage (1 slot)', slot: 1 },
  turn: { name: 'Turn Undead', icon: '☀️', desc: 'Undead make a WIS save or are stunned 2 turns (once per fight)', perFight: 1 },
  spirit: { name: 'Spirit Guardians', icon: '👼', desc: '3d8 radiant to ALL enemies for 3 turns (1 slot)', slot: 1 },
  massHeal: { name: 'Heal', icon: '🌈', desc: 'Heal 70 HP and cure everything (1 slot)', slot: 1 },
};

// ---------- Gear ----------
// dice, stat: STR or DEX (finesse = best of both), dmgType for vulnerabilities, bonus = magic +N
export const WEAPONS = {
  dagger: { name: 'Dagger', dice: '1d4', stat: 'finesse', type: 'pierce', cost: 2 },
  staff: { name: 'Quarterstaff', dice: '1d6', stat: 'STR', type: 'bludgeon', cost: 2 },
  mace: { name: 'Mace', dice: '1d6', stat: 'STR', type: 'bludgeon', cost: 5 },
  longsword: { name: 'Longsword', dice: '1d8', stat: 'STR', type: 'slash', cost: 15 },
  rapier: { name: 'Rapier', dice: '1d8', stat: 'finesse', type: 'pierce', cost: 25 },
  warhammer: { name: 'Warhammer', dice: '1d10', stat: 'STR', type: 'bludgeon', cost: 30 },
  greataxe: { name: 'Greataxe', dice: '1d12', stat: 'STR', type: 'slash', cost: 30 },
  longsword1: { name: 'Longsword +1', dice: '1d8', stat: 'STR', type: 'slash', bonus: 1, cost: 500 },
  rapier1: { name: 'Rapier +1', dice: '1d8', stat: 'finesse', type: 'pierce', bonus: 1, cost: 500 },
  mace1: { name: 'Mace of Dawn +1', dice: '1d6', stat: 'STR', type: 'bludgeon', bonus: 1, extra: '1d6', extraType: 'radiant', cost: 900 },
  staff1: { name: 'Staff of Embers +1', dice: '1d6', stat: 'STR', type: 'bludgeon', bonus: 1, spell: 1, cost: 900 },
  greataxe2: { name: 'Greataxe +2', dice: '1d12', stat: 'STR', type: 'slash', bonus: 2, cost: 2500 },
  flametongue: { name: 'Flame Tongue', dice: '1d8', stat: 'finesse', type: 'slash', bonus: 1, extra: '2d6', extraType: 'fire', cost: 5000 },
  cleaver: { name: "Gruk's Cleaver +1", dice: '1d12', stat: 'STR', type: 'slash', bonus: 1, loot: true },
  dragonslayer: { name: 'Dragonslayer +3', dice: '1d10', stat: 'finesse', type: 'slash', bonus: 3, extra: '3d6', extraType: 'radiant', loot: true },
};
// base AC, max DEX bonus (null = all), type for class limits
export const ARMOR = {
  leather: { name: 'Leather Armor', base: 11, maxDex: null, type: 'light', cost: 10 },
  studded: { name: 'Studded Leather', base: 12, maxDex: null, type: 'light', cost: 45 },
  elven: { name: 'Elven Mail', base: 14, maxDex: null, type: 'light', cost: 1500 },
  chainshirt: { name: 'Chain Shirt', base: 13, maxDex: 2, type: 'medium', cost: 50 },
  breastplate: { name: 'Breastplate', base: 14, maxDex: 2, type: 'medium', cost: 400 },
  chainmail: { name: 'Chain Mail', base: 16, maxDex: 0, type: 'heavy', cost: 75 },
  splint: { name: 'Splint Armor', base: 17, maxDex: 0, type: 'heavy', cost: 200 },
  plate: { name: 'Plate Armor', base: 18, maxDex: 0, type: 'heavy', cost: 1500 },
  robes: { name: 'Archmage Robes', base: 15, maxDex: null, type: 'none', cost: 2000 },
};
export const ARMOR_OK = { heavy: ['light', 'medium', 'heavy'], medium: ['light', 'medium'], light: ['light'], none: ['none'] };
export const POTIONS = {
  healing: { name: 'Potion of Healing', icon: '🧪', heal: '2d4+2', cost: 50 },
  greater: { name: 'Greater Healing', icon: '⚗️', heal: '4d4+4', cost: 150 },
  superior: { name: 'Superior Healing', icon: '💖', heal: '8d4+8', cost: 450 },
  fireRes: { name: 'Fire Resistance', icon: '🧯', fireRes: true, cost: 300 },
};

// ---------- Monsters ----------
// atk: to-hit bonus, dmg: dice, n: attacks per turn. traits: undead, regen, breath, prone, paralyze, poison, drain, undying, spell
export const MONSTERS = {
  goblin: { name: 'Goblin', hp: 9, ac: 13, atk: 3, dmg: '1d6+1', xp: 50, gold: [2, 10], dex: 2, model: 'goblin' },
  goblinArcher: { name: 'Goblin Archer', hp: 8, ac: 12, atk: 4, dmg: '1d6+2', xp: 50, gold: [2, 8], dex: 2, model: 'goblin', verb: 'shoots' },
  gruk: { name: 'Gruk the Goblin Boss', hp: 38, ac: 15, atk: 5, dmg: '1d10+3', xp: 450, gold: [60, 90], dex: 2, model: 'goblin', size: 1.5, boss: true },
  wolf: { name: 'Wolf', hp: 11, ac: 13, atk: 4, dmg: '2d4', xp: 50, gold: [0, 0], dex: 2, model: 'wolf', prone: true },
  direWolf: { name: 'Dire Wolf', hp: 37, ac: 14, atk: 5, dmg: '2d6+3', xp: 200, gold: [0, 0], dex: 2, model: 'wolf', size: 1.5, prone: true },
  spider: { name: 'Giant Spider', hp: 26, ac: 14, atk: 5, dmg: '1d8+3', xp: 200, gold: [0, 20], dex: 3, model: 'spider', poison: '1d8' },
  bandit: { name: 'Bandit', hp: 11, ac: 12, atk: 3, dmg: '1d6+1', xp: 25, gold: [5, 20], dex: 1, model: 'humanoid', color: 0x6a4a3a },
  banditCaptain: { name: 'Bandit Captain Vex', hp: 45, ac: 15, atk: 5, dmg: '1d8+3', n: 2, xp: 450, gold: [120, 200], dex: 3, model: 'humanoid', color: 0x8a2a2a, size: 1.15, boss: true },
  skeleton: { name: 'Skeleton', hp: 13, ac: 13, atk: 4, dmg: '1d6+2', xp: 50, gold: [1, 6], dex: 2, model: 'skeleton', undead: true, vuln: 'bludgeon' },
  zombie: { name: 'Zombie', hp: 22, ac: 8, atk: 3, dmg: '1d6+1', xp: 50, gold: [0, 3], dex: -2, model: 'zombie', undead: true, undying: true },
  ghoul: { name: 'Ghoul', hp: 22, ac: 12, atk: 4, dmg: '2d6+2', xp: 200, gold: [0, 10], dex: 2, model: 'zombie', color: 0x6a7a5a, undead: true, paralyze: true },
  varkas: { name: 'Varkas the Wight Lord', hp: 60, ac: 14, atk: 6, dmg: '1d8+3', n: 2, xp: 1100, gold: [200, 300], dex: 2, model: 'skeleton', color: 0x2a3a4a, size: 1.4, undead: true, drain: true, boss: true },
  orc: { name: 'Orc', hp: 15, ac: 13, atk: 5, dmg: '1d12+3', xp: 100, gold: [5, 15], dex: 1, model: 'orc' },
  orcShaman: { name: 'Orc Shaman', hp: 20, ac: 12, atk: 5, dmg: '2d8', xp: 100, gold: [10, 25], dex: 1, model: 'orc', color: 0x5a3a7a, verb: 'hurls a hex at', spell: true },
  ogre: { name: 'Ogre', hp: 59, ac: 11, atk: 6, dmg: '2d8+4', xp: 450, gold: [20, 60], dex: -1, model: 'orc', color: 0x8a7a5a, size: 1.9 },
  troll: { name: 'Grimtooth the Bridge Troll', hp: 84, ac: 15, atk: 7, dmg: '2d6+4', n: 2, xp: 1800, gold: [100, 150], dex: 1, model: 'orc', color: 0x4a6a4a, size: 2.1, regen: 10, boss: true },
  cultist: { name: 'Flame Cultist', hp: 12, ac: 12, atk: 3, dmg: '1d6+1', xp: 25, gold: [5, 15], dex: 1, model: 'humanoid', color: 0xb02a1a },
  flamePriest: { name: 'Pyre-Priest Moloth', hp: 60, ac: 13, atk: 5, dmg: '3d6', xp: 700, gold: [150, 220], dex: 1, model: 'humanoid', color: 0xff4a1a, size: 1.2, verb: 'blasts fire at', spell: true, fire: true, boss: true },
  wyrmling: { name: 'Red Wyrmling', hp: 75, ac: 17, atk: 6, dmg: '1d10+4', xp: 1100, gold: [80, 160], dex: 0, model: 'dragon', size: 0.45, breath: '7d6', breathDC: 13 },
  ignaroth: { name: 'IGNAROTH THE EMBER WYRM', hp: 150, ac: 17, atk: 8, dmg: '2d8+5', n: 2, xp: 13000, gold: [3000, 5000], dex: 0, model: 'dragon', size: 1.6, breath: '14d6', breathDC: 17, boss: true, final: true },
};
// Random groups that roam each zone
export const ENCOUNTERS = {
  woods: [['goblin'], ['goblin', 'goblin'], ['goblin', 'goblinArcher'], ['wolf'], ['wolf', 'wolf'], ['spider']],
  crypt: [['skeleton', 'skeleton'], ['skeleton', 'skeleton', 'skeleton'], ['zombie', 'zombie'], ['ghoul', 'skeleton'], ['zombie', 'skeleton', 'skeleton']],
  pass: [['orc', 'orc'], ['orc', 'orcShaman'], ['ogre'], ['direWolf', 'wolf'], ['orc', 'orc', 'orc']],
  peak: [['cultist', 'cultist', 'cultist'], ['cultist', 'cultist'], ['wyrmling'], ['cultist', 'orcShaman']],
};

// ---------- Story and side quests ----------
// steps: kill (of, n) · boss (of) · reach (zone) · talk (npc) · pick (item id at a spot) · check (id) · flag (id)
export const QUESTS = [
  { id: 'q1', act: 1, title: 'Smoke over Embervale', giver: 'brannoc', turnIn: 'brannoc', xp: 300, gold: 50,
    offer: 'Goblins raided the mill last night, the cowards. They came from the Whispering Woods, north of the village. Thin their numbers: six of them should do. Take a potion from the stores, you\'ll need it.',
    done: 'Six goblins! The village owes you a drink. But that\'s not the worst of it...',
    steps: [{ t: 'kill', of: 'goblin', n: 6, label: 'Defeat goblins in the Whispering Woods', zone: 'woods' }] },
  { id: 'q2', act: 1, title: "The Miller's Daughter", giver: 'brannoc', turnIn: 'brannoc', xp: 600, gold: 120,
    offer: 'They took Elsie, the miller\'s girl. There\'s a goblin camp deep in the woods, past the old oak. Free her from whatever cage they\'ve got her in, and if their boss Gruk gets in the way... well.',
    done: 'Elsie is home, crying and laughing at once. And Gruk is dead? You are a true hero of Embervale.',
    steps: [
      { t: 'check', of: 'cage', label: 'Free Elsie from the cage at the goblin camp', zone: 'woods' },
      { t: 'boss', of: 'gruk', label: 'Defeat Gruk the Goblin Boss at the camp', zone: 'woods' },
    ] },
  { id: 'q3', act: 2, title: 'Whispers of the Dead', giver: 'maren', turnIn: 'maren', xp: 900, gold: 150,
    offer: 'Gruk\'s goblins weren\'t raiding for gold. They were running. From the Crypt of the Fallen King, east of the woods. The dead walk there. Open the sealed door and put eight of them back to rest.',
    done: 'Eight souls at peace. But something below commands them. I can feel it, like cold fingers on my neck.',
    steps: [
      { t: 'check', of: 'runedoor', label: 'Open the rune-sealed crypt door', zone: 'crypt' },
      { t: 'kill', of: 'undead', n: 8, label: 'Lay undead to rest in the crypt grounds', zone: 'crypt' },
    ] },
  { id: 'q4', act: 2, title: 'The Wight Lord', giver: 'maren', turnIn: 'maren', xp: 1500, gold: 300,
    offer: 'Varkas. The Fallen King\'s champion, risen as a wight. He guards a shard of the Ember Crown, which once kept the mountain\'s dragon asleep. Destroy him and bring me the shard.',
    done: 'The Ember Crown shard! Warm to the touch... The other pieces are gone. Only the dwarves of Kharak could reforge it. Through the mountain pass.',
    steps: [{ t: 'boss', of: 'varkas', label: 'Destroy Varkas the Wight Lord in the crypt', zone: 'crypt' }],
    onDone: (s) => (s.items.crownShard = 1) },
  { id: 'q5', act: 3, title: 'The Toll of the Bridge', giver: 'maren', turnIn: 'durin', xp: 1800, gold: 0,
    offer: 'The pass to Kharak has a bridge, and the bridge has a troll. Grimtooth. Some say you can talk your way past him. Some say he eats the ones who try.',
    done: 'A visitor! Through the pass, no less. Grimtooth let you by? Ha! I\'m Durin, master smith of Kharak. What\'s that you\'re carrying... is that an Ember Crown shard?',
    steps: [
      { t: 'check', of: 'bridge', label: 'Get past Grimtooth at the troll bridge', zone: 'pass' },
      { t: 'reach', of: 'kharak', label: 'Reach the dwarf hold of Kharak', zone: 'kharak' },
    ] },
  { id: 'q6', act: 3, title: "Kharak's Forge", giver: 'durin', turnIn: 'durin', xp: 2400, gold: 400,
    offer: 'I can reforge the crown, but the orcs from the pass raid my ore carts. Kill ten of the brutes so my forge can burn again. The reforged crown will shield you from dragonfire.',
    done: 'The forge roars! Here: the Ember Crown, whole again. Wear it, and Ignaroth\'s fire will only half kill you. Half is good. Half is very good.',
    steps: [{ t: 'kill', of: 'orc', n: 10, label: 'Defeat orcs in the mountain pass', zone: 'pass' }],
    onDone: (s) => (s.items.emberCrown = 1) },
  { id: 'q7', act: 4, title: 'Cult of the Flame', giver: 'durin', turnIn: 'durin', xp: 3500, gold: 600,
    offer: 'Cultists climb Dragon\'s Peak every night, chanting to wake Ignaroth. Their Pyre-Priest leads the ritual. Stop him, and smash a few of their whelps while you\'re up there.',
    done: 'The ritual is broken, but too late. The mountain is shaking. Ignaroth is awake. Embervale will burn by morning unless...',
    steps: [
      { t: 'boss', of: 'flamePriest', label: 'Defeat Pyre-Priest Moloth on Dragon\'s Peak', zone: 'peak' },
      { t: 'kill', of: 'wyrmling', n: 1, label: 'Slay a red wyrmling on the peak', zone: 'peak' },
    ] },
  { id: 'q8', act: 4, title: 'Ignaroth', giver: 'durin', turnIn: 'brannoc', xp: 15000, gold: 2000,
    offer: 'There\'s no one else. Climb to the dragon\'s lair at the top of the peak and end this. Wear the crown. Bring potions. Bring friends if you have any. Ignaroth has burned kingdoms.',
    done: 'They say the whole sky turned gold when Ignaroth fell. Embervale is saved, and every bard in the realm will sing your name. Welcome home, Dragonslayer.',
    steps: [{ t: 'boss', of: 'ignaroth', label: 'Slay IGNAROTH at the top of Dragon\'s Peak', zone: 'peak' }],
    onDone: (s) => (s.title = 'Dragonslayer') },
];
export const SIDE_QUESTS = [
  { id: 's1', title: 'The Hungry Pack', giver: 'garrick', turnIn: 'garrick', xp: 250, gold: 60,
    offer: 'Wolves have been taking my sheep. Five pelts and I\'ll pay you fair.', done: 'Good hunting! Here\'s your coin.',
    steps: [{ t: 'kill', of: 'wolf', n: 5, label: 'Hunt wolves in the Whispering Woods', zone: 'woods' }] },
  { id: 's2', title: 'Moonpetals', giver: 'wren', turnIn: 'wren', xp: 200, gold: 40, reward: { healing: 3 },
    offer: 'Moonpetals glow blue in the woods at night... and during the day, if you look. Bring me five and I\'ll brew you potions.', done: 'Perfect! Take these potions. Fresh!',
    steps: [{ t: 'pick', of: 'moonpetal', n: 5, label: 'Gather glowing moonpetals in the woods', zone: 'woods' }] },
  { id: 's3', title: "Agatha's Ring", giver: 'agatha', turnIn: 'agatha', xp: 300, gold: 100,
    offer: 'My late husband\'s ring... I dropped it at his grave in the crypt yard and I\'m too frightened to go back. Please?', done: 'Oh! Thank you, dear. Thank you.',
    steps: [{ t: 'pick', of: 'ring', n: 1, label: 'Find Agatha\'s ring by the graves in the crypt yard', zone: 'crypt' }] },
  { id: 's4', title: 'Tavern Brawl', giver: 'bram', turnIn: 'bram', xp: 150, gold: 30,
    offer: 'Three bandits in the corner won\'t pay and won\'t leave. Mind showing them the door? Hard?', done: 'Ha! Drinks are on the house, friend.',
    steps: [{ t: 'boss', of: 'brawl', label: 'Beat the bandits in the tavern (talk to them)', zone: 'village' }] },
  { id: 's5', title: 'The Spider Nest', giver: 'garrick', turnIn: 'garrick', xp: 600, gold: 120, req: 2,
    offer: 'Giant spiders, deep in the woods. Big as ponies. Kill three before they spread.', done: 'Rather you than me. Here.',
    steps: [{ t: 'kill', of: 'spider', n: 3, label: 'Kill giant spiders in the woods', zone: 'woods' }] },
  { id: 's6', title: 'Wanted: Captain Vex', giver: 'brannoc', turnIn: 'brannoc', xp: 700, gold: 250, req: 3,
    offer: 'Bandit Captain Vex robs every cart on the east road. The bounty is 250 gold, dead or very sorry.', done: 'Vex is done? The roads are safe again. Your bounty, as promised.',
    steps: [{ t: 'boss', of: 'banditCaptain', label: 'Defeat Bandit Captain Vex on the east road', zone: 'road' }] },
  { id: 's7', title: 'The Ogre of the Pass', giver: 'durin', turnIn: 'durin', xp: 900, gold: 300,
    offer: 'An ogre sits on my best ore vein and won\'t budge. Budge him.', done: 'Budged! Nicely done.',
    steps: [{ t: 'kill', of: 'ogre', n: 1, label: 'Defeat an ogre in the mountain pass', zone: 'pass' }] },
  { id: 's8', title: 'Lost Lore', giver: 'maren', turnIn: 'maren', xp: 800, gold: 200,
    offer: 'Ancient tablets lie in each corner of the land: woods, crypt, pass and peak. Read all four (if you can make sense of them) and bring me what they say.', done: 'The tablets tell of the crown and the dragon... and the first hero who sealed it. Thank you.',
    steps: [{ t: 'pick', of: 'tablet', n: 4, label: 'Read the four ancient tablets (woods, crypt, pass, peak)' }] },
];
