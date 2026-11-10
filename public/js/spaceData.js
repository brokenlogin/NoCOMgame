// Numbers and names for the space RPG, all in one place so they're easy to tweak.
// Used by spaceRpg.js, spaceShip.js and the other space*.js files.

// ---------- Ships (bought at Juno's shipyard) ----------
// Multipliers on the base stats; `look` picks the model in buildShip (spaceShip.js).
export const SHIPS = {
  sparrow: { name: 'Sparrow', role: 'Scout', cost: 0, level: 1, look: 'scout', speed: 1, accel: 1, hull: 1, shield: 1, laser: 1, cargo: 40, slots: 1, desc: 'Your trusty starter. Light, quick and forgiving.' },
  viper: { name: 'Viper', role: 'Fighter', cost: 2500, level: 4, look: 'fighter', speed: 1.25, accel: 1.35, hull: 0.85, shield: 1.15, laser: 1.15, cargo: 25, slots: 2, desc: 'A pure dogfighter. Fastest thing in the sector.' },
  mule: { name: 'Mule', role: 'Hauler', cost: 3000, level: 3, look: 'hauler', speed: 0.8, accel: 0.75, hull: 1.6, shield: 1, laser: 0.9, cargo: 160, slots: 2, desc: 'Slow and tough with a huge cargo hold. Traders love it.' },
  warden: { name: 'Warden', role: 'Gunship', cost: 7000, level: 8, look: 'gunship', speed: 0.9, accel: 0.85, hull: 2, shield: 1.7, laser: 1.35, cargo: 60, slots: 3, desc: 'A flying fortress with three module slots.' },
};
export const SHIP_IDS = Object.keys(SHIPS);

// ---------- Ship upgrades (Juno) ----------
export const UPGRADES = {
  engine: { name: 'Engines', icon: '🔥', costs: [200, 500, 1000, 2000], values: [45, 58, 72, 90, 105], unit: 'm/s top speed' },
  lasers: { name: 'Lasers', icon: '🔫', costs: [250, 600, 1200, 2400], values: [10, 15, 22, 32, 42], unit: 'damage' },
  hull: { name: 'Hull plating', icon: '🔩', costs: [200, 500, 1000, 2000], values: [100, 150, 220, 320, 420], unit: 'hull' },
  shields: { name: 'Shield generator', icon: '🛡️', costs: [300, 700, 1400, 2800], values: [40, 70, 110, 160, 220], unit: 'shield' },
};

// ---------- Secondary weapons (R to fire, Q to switch) ----------
export const SECONDARIES = {
  missiles: { name: 'Lock-on Missiles', icon: '🚀', cost: 0, ammo: 6, regen: 8, dmg: 60, desc: 'Lock onto the enemy nearest your crosshair, then R. They chase it.' },
  mines: { name: 'Proximity Mines', icon: '💣', cost: 800, ammo: 4, regen: 10, dmg: 90, desc: 'Drop mines behind you. Anything that gets close goes boom.' },
  ion: { name: 'Ion Cannon', icon: '⚡', cost: 1500, ammo: 3, regen: 5, dmg: 45, desc: 'A charged bolt that stuns enemies for 3 seconds and wrecks shields.' },
  tractor: { name: 'Tractor Beam', icon: '🧲', cost: 600, ammo: 0, regen: 0, dmg: 0, desc: 'Hold R to pull in loot, ore and crates from far away.' },
};
export const SECONDARY_IDS = Object.keys(SECONDARIES);

// ---------- Materials and trade goods ----------
export const MATERIALS = {
  ore: { name: 'Crystal ore', icon: '💎', price: 12 },
  iron: { name: 'Iron', icon: '🔩', price: 8 },
  ice: { name: 'Ice crystal', icon: '🧊', price: 18 },
  plasma: { name: 'Plasma', icon: '🟣', price: 25 },
  scrap: { name: 'Scrap', icon: '⚙️', price: 10 },
  void: { name: 'Void shard', icon: '🌀', price: 80 },
};
// Base prices; every station buys and sells at its own multipliers (see SECTORS[...].market)
export const GOODS = {
  food: { name: 'Hydroponic food', icon: '🥫', price: 40 },
  meds: { name: 'Medical supplies', icon: '💊', price: 90 },
  tech: { name: 'Electronics', icon: '🔌', price: 130 },
  fuel: { name: 'Fuel cells', icon: '🔋', price: 60 },
  luxury: { name: 'Luxury goods', icon: '💎', price: 220 },
  contraband: { name: 'Contraband', icon: '📦', price: 300, illegal: true },
};

// ---------- Factions ----------
export const FACTIONS = {
  command: { name: 'Station Command', color: '#5fb8ff' },
  talon: { name: 'Red Talon Pirates', color: '#ff5a4a' },
  scav: { name: 'Scavenger Clans', color: '#d8b45a' },
  hive: { name: 'The Hive', color: '#c06bff' },
};
export function standing(rep) {
  if (rep <= -50) return 'Hated';
  if (rep <= -10) return 'Hostile';
  if (rep < 25) return 'Neutral';
  if (rep < 60) return 'Friendly';
  return 'Honored';
}

// ---------- Sectors (spaceSectors.js builds them; jump gates connect them) ----------
// Each is its own void in CONFIG.terrain.voids, 4500m apart so you can't see one from another.
export const SECTORS = {
  home: {
    name: 'Kepler Reach', short: 'Home', color: '#5fd4ff', zone: { x0: -700, x1: 700, z0: -1900, z1: -312 },
    center: [0, 40, -1106], gate: [330, 55, -620], arrive: [0, 30.5, -382],
    market: { food: 1, meds: 1.15, tech: 1.2, fuel: 0.9, luxury: 1.25 },
  },
  nebula: {
    name: 'Nebula Drift', short: 'Nebula', color: '#c58bff', zone: { x0: -700, x1: 700, z0: -6300, z1: -4900 },
    center: [0, 40, -5600], gate: [0, 60, -5000], arrive: [-200, 30.5, -5300], unlock: { story: 6, level: 5 },
    market: { food: 1.3, meds: 1.4, tech: 0.85, fuel: 1.1, luxury: 0.9 },
  },
  cryo: {
    name: 'Cryo-9 Ice Moon', short: 'Cryo-9', color: '#bff4ff', zone: { x0: -700, x1: 700, z0: -10800, z1: -9400 },
    center: [0, 40, -10100], gate: [0, 70, -9500], arrive: [0, 1.1, -9800], floor: -45, unlock: { story: 10, level: 10 },
    market: { food: 1.5, meds: 1.2, tech: 1.1, fuel: 0.75, luxury: 1.3 },
  },
  scrap: {
    name: 'The Scrapyard', short: 'Scrapyard', color: '#e0b060', zone: { x0: -700, x1: 700, z0: -15300, z1: -13900 },
    center: [0, 40, -14600], gate: [0, 60, -14000], arrive: [260, 30.5, -14300], unlock: { story: 12, level: 13 },
    market: { food: 1.25, meds: 1.3, tech: 0.7, fuel: 1.2, luxury: 1.1, contraband: 1.6 },
  },
  rift: {
    name: 'The Void Rift', short: 'Rift', color: '#ff5ad0', zone: { x0: -700, x1: 700, z0: -19800, z1: -18400 },
    center: [0, 40, -19100], gate: [0, 60, -18500], arrive: [-300, 30.5, -18700], unlock: { story: 15, level: 17 },
    market: { food: 1.8, meds: 1.9, tech: 1.4, fuel: 1.5, luxury: 0.8 },
  },
};
export const SECTOR_IDS = Object.keys(SECTORS);
export function sectorAt(p) {
  for (const id of SECTOR_IDS) {
    const z = SECTORS[id].zone;
    if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) return id;
  }
  return null;
}

// ---------- Loot ----------
export const RARITY = [
  { id: 'common', name: 'Common', color: '#d8dde6', stats: 1, mult: 1 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', stats: 2, mult: 1.25 },
  { id: 'epic', name: 'Epic', color: '#b36bff', stats: 3, mult: 1.55 },
  { id: 'legendary', name: 'Legendary', color: '#ffa32a', stats: 3, mult: 1.9 },
];
// Weapons replace your main laser (mode changes how it fires); modules add stats.
export const GEAR = {
  pulse: { slot: 'weapon', name: 'Pulse Laser', icon: '🟢', mode: 'twin', dmg: 1, rate: 1 },
  scatter: { slot: 'weapon', name: 'Scatter Laser', icon: '🎆', mode: 'scatter', dmg: 0.5, rate: 0.8 },
  rail: { slot: 'weapon', name: 'Rail Lance', icon: '🔱', mode: 'rail', dmg: 3.4, rate: 0.32 },
  repeater: { slot: 'weapon', name: 'Plasma Repeater', icon: '🔥', mode: 'repeater', dmg: 0.55, rate: 2.1 },
  shieldBooster: { slot: 'module', name: 'Shield Booster', icon: '🛡️', stat: 'shield' },
  armor: { slot: 'module', name: 'Armor Plating', icon: '🔩', stat: 'hull' },
  tuner: { slot: 'module', name: 'Engine Tuner', icon: '🔥', stat: 'speed' },
  capacitor: { slot: 'module', name: 'Capacitor', icon: '🔋', stat: 'boost' },
  targeting: { slot: 'module', name: 'Targeting Computer', icon: '🎯', stat: 'crit' },
  salvager: { slot: 'module', name: 'Salvager Rig', icon: '🧰', stat: 'luck' },
  coolant: { slot: 'module', name: 'Laser Coolant', icon: '❄️', stat: 'rate' },
};
export const GEAR_IDS = Object.keys(GEAR);
// Random stat lines: [min, max] percent at item level 1 (grows with item level)
export const STAT_LINES = {
  dmg: { name: 'laser damage', min: 4, max: 10 },
  rate: { name: 'fire rate', min: 3, max: 8 },
  hull: { name: 'hull', min: 5, max: 12 },
  shield: { name: 'shields', min: 6, max: 14 },
  speed: { name: 'top speed', min: 3, max: 7 },
  boost: { name: 'boost energy', min: 8, max: 20 },
  crit: { name: 'crit chance', min: 2, max: 5 },
  luck: { name: 'loot luck', min: 5, max: 12 },
  regen: { name: 'shield recharge', min: 6, max: 15 },
};
export const PERKS = {
  phoenix: { name: 'Phoenix Core', desc: 'Once per flight, survive a killing blow with full shields' },
  vampire: { name: 'Vampiric', desc: 'Laser hits repair your hull a little' },
  chain: { name: 'Chain Lightning', desc: 'Hits arc to a second enemy nearby' },
  overcharge: { name: 'Overcharge', desc: 'Every 6th shot deals triple damage' },
  magnet: { name: 'Magnetic', desc: 'Loot flies to you from much further away' },
};
export const PERK_IDS = Object.keys(PERKS);

// ---------- Skill tree (1 point per level, up to level 30) ----------
export const SKILLS = [
  { id: 'thrusters', branch: 'Pilot', name: 'Thrusters', desc: '+5% top speed', max: 3 },
  { id: 'afterburner', branch: 'Pilot', name: 'Afterburner', desc: '+25% boost energy', max: 3 },
  { id: 'handling', branch: 'Pilot', name: 'Ace Handling', desc: '+10% acceleration', max: 3 },
  { id: 'evasive', branch: 'Pilot', name: 'Evasive', desc: '5% chance to dodge a hit', max: 3 },
  { id: 'hotLasers', branch: 'Gunner', name: 'Hot Lasers', desc: '+8% laser damage', max: 3 },
  { id: 'rapid', branch: 'Gunner', name: 'Rapid Fire', desc: '+7% fire rate', max: 3 },
  { id: 'ordnance', branch: 'Gunner', name: 'Ordnance', desc: '+1 secondary ammo, +10% secondary damage', max: 3 },
  { id: 'deadeye', branch: 'Gunner', name: 'Deadeye', desc: '+5% critical hit chance', max: 3 },
  { id: 'plating', branch: 'Engineer', name: 'Plating', desc: '+8% hull', max: 3 },
  { id: 'shieldTech', branch: 'Engineer', name: 'Shield Tech', desc: '+10% shields', max: 3 },
  { id: 'recharge', branch: 'Engineer', name: 'Quick Recharge', desc: 'Shields recharge sooner and faster', max: 3 },
  { id: 'repair', branch: 'Engineer', name: 'Field Repair', desc: 'Slowly repair hull in flight', max: 3 },
  { id: 'prospector', branch: 'Explorer', name: 'Prospector', desc: '+25% chance of bonus ore', max: 3 },
  { id: 'haggler', branch: 'Explorer', name: 'Haggler', desc: '+5% better prices', max: 3 },
  { id: 'lucky', branch: 'Explorer', name: 'Lucky Find', desc: 'Better loot drops', max: 3 },
  { id: 'scanner', branch: 'Explorer', name: 'Long Scanner', desc: '+150m radar range, faster scans', max: 3 },
];
export const MAX_LEVEL = 30;

// ---------- Crafting (refinery at any station) ----------
export const RECIPES = [
  { id: 'repairKit', name: 'Repair kit ×3', desc: 'Press F in flight to repair 40% hull', cost: { iron: 6, scrap: 4 }, credits: 50, gives: { kits: 3 } },
  { id: 'ammo', name: 'Ordnance restock', desc: 'Fills all secondary ammo', cost: { iron: 4, plasma: 1 }, credits: 30, gives: { ammo: 1 } },
  { id: 'rareModule', name: 'Forge a Rare module', desc: 'A random Rare module', cost: { ore: 10, ice: 6, scrap: 6 }, credits: 300, gives: { gear: 'rare' } },
  { id: 'epicWeapon', name: 'Forge an Epic weapon', desc: 'A random Epic weapon', cost: { plasma: 10, ice: 10, scrap: 12 }, credits: 900, gives: { gear: 'epic', slot: 'weapon' } },
  { id: 'legendary', name: 'Forge a Legendary', desc: 'Needs void shards from the Rift', cost: { void: 6, plasma: 12, ice: 12 }, credits: 3000, gives: { gear: 'legendary' } },
];

// ---------- Achievements (each unlocks a title) ----------
export const ACHIEVEMENTS = [
  { id: 'firstKill', name: 'First Blood', desc: 'Destroy an enemy', title: 'Rookie' },
  { id: 'kills100', name: 'Ace of Aces', desc: 'Destroy 100 enemies', title: 'Ace' },
  { id: 'kills500', name: 'Exterminator', desc: 'Destroy 500 enemies', title: 'Exterminator' },
  { id: 'miner', name: 'Rock Hound', desc: 'Mine 200 materials', title: 'Miner' },
  { id: 'rich', name: 'Space Tycoon', desc: 'Hold 10,000 credits', title: 'Tycoon' },
  { id: 'mother', name: 'Hero of NoCOM', desc: 'Destroy the Pirate Mothership', title: 'Hero of NoCOM' },
  { id: 'scrapking', name: 'Junk Monarch', desc: 'Defeat the Scrap King', title: 'Scrapbreaker' },
  { id: 'wyrm', name: 'Wyrmslayer', desc: 'Defeat the Frost Wyrm', title: 'Wyrmslayer' },
  { id: 'queen', name: 'Hive Breaker', desc: 'Defeat the Hive Queen', title: 'Queenslayer' },
  { id: 'explorer', name: 'Explorer', desc: 'Visit all five sectors', title: 'Explorer' },
  { id: 'codex', name: 'Archivist', desc: 'Find 20 codex entries', title: 'Archivist' },
  { id: 'legend', name: 'Lucky Star', desc: 'Find a Legendary item', title: 'Lucky Star' },
  { id: 'fleet', name: 'Fleet Admiral', desc: 'Own all four ships', title: 'Admiral' },
  { id: 'racer', name: 'Speed Demon', desc: 'Win gold in every time trial', title: 'Speed Demon' },
  { id: 'lvl30', name: 'Living Legend', desc: 'Reach level 30', title: 'Legend' },
  { id: 'leviathan', name: 'Whale Rider', desc: 'Help defeat the Leviathan', title: 'Whale Rider' },
  { id: 'arena', name: 'Gladiator', desc: 'Score 10 arena kills', title: 'Gladiator' },
  { id: 'gambler', name: 'High Roller', desc: 'Win 1,000 credits at holo-dice', title: 'High Roller' },
  { id: 'smuggler', name: 'Smooth Operator', desc: 'Finish a smuggling run without being scanned', title: 'Smuggler' },
  { id: 'story', name: 'Savior of the Reach', desc: 'Finish the story', title: 'Savior' },
  { id: 'jobs25', name: 'Contractor', desc: 'Finish 25 contracts', title: 'Contractor' },
  { id: 'boarder', name: 'Boarding Party', desc: 'Clear the Talon Fortress on foot', title: 'Marine' },
];

// ---------- Cosmetics (Pix's shop in the cantina, some from achievements) ----------
export const PAINTS = [
  { id: 'default', name: 'Station Blue', color: 0x3ad6ff, cost: 0 },
  { id: 'crimson', name: 'Crimson', color: 0xff3a4a, cost: 400 },
  { id: 'lime', name: 'Toxic Lime', color: 0x7dff4a, cost: 400 },
  { id: 'sunset', name: 'Sunset', color: 0xff8a3a, cost: 600 },
  { id: 'violet', name: 'Violet', color: 0xb36bff, cost: 800 },
  { id: 'gold', name: 'Solid Gold', color: 0xffc23a, cost: 1500 },
  { id: 'frost', name: 'Frost', color: 0xcff6ff, achievement: 'wyrm' },
  { id: 'void', name: 'Void Black', color: 0x8a2be2, achievement: 'queen' },
];
export const TRAILS = [
  { id: 'none', name: 'No trail', cost: 0 },
  { id: 'ion', name: 'Ion blue', color: 0x5fd4ff, cost: 300 },
  { id: 'fire', name: 'Fire', color: 0xff7a1a, cost: 500 },
  { id: 'toxic', name: 'Toxic', color: 0x7dff4a, cost: 500 },
  { id: 'rainbow', name: 'Rainbow', rainbow: true, cost: 2500 },
  { id: 'gold', name: 'Gold dust', color: 0xffd23d, achievement: 'racer' },
];
export const HATS = [
  { id: 'none', name: 'No hat', cost: 0 },
  { id: 'party', name: 'Party hat', cost: 300 },
  { id: 'chef', name: 'Chef hat', cost: 400 },
  { id: 'captain', name: "Captain's cap", cost: 600 },
  { id: 'propeller', name: 'Propeller cap', cost: 700 },
  { id: 'horns', name: 'Devil horns', cost: 800 },
  { id: 'tophat', name: 'Top hat', cost: 1000 },
  { id: 'crown', name: 'Crown', cost: 6000 },
  { id: 'halo', name: 'Halo', achievement: 'story' },
];

// ---------- Cantina drinks (buffs) ----------
export const DRINKS = [
  { id: 'nova', name: 'Nova Fizz', cost: 60, desc: '+15% top speed for 5 minutes', buff: { speed: 0.15 } },
  { id: 'blaster', name: 'Pan-Galactic Blaster', cost: 90, desc: '+15% laser damage for 5 minutes', buff: { dmg: 0.15 } },
  { id: 'iron', name: 'Iron Stout', cost: 80, desc: '+20% hull and shields for 5 minutes', buff: { hull: 0.2, shield: 0.2 } },
  { id: 'lucky', name: 'Lucky Comet', cost: 120, desc: 'Better loot for 5 minutes', buff: { luck: 0.3 } },
];

export const levelFor = (xp) => Math.min(MAX_LEVEL, Math.floor(Math.sqrt(xp / 40)) + 1);
export const xpForLevel = (lvl) => 40 * (lvl - 1) ** 2;
