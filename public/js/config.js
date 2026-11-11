// Shared tunables. Tweak freely.
export const CONFIG = {
  // Player capsule
  playerRadius: 0.5,
  playerHeight: 2.0, // total height including the round caps

  // Movement
  walkSpeed: 6,
  sprintSpeed: 10,
  groundAccel: 60,
  airAccel: 15,
  groundFriction: 12,
  jumpVelocity: 8,
  gravity: 24,
  headLandTolerance: 0.5,

  // Air dash (Shift while in the air)
  airDash: {
    speed: 20, // horizontal speed right after dashing
    lift: 2, // small hop so a dash doesn't immediately drop you
    charges: 1, // dashes per jump; refilled when you land
    fovKick: 10, // degrees the view widens for a moment
  },

  // Knockback (no health in this game, just getting launched)
  knockbackStun: 0.35, // seconds of reduced control after a hit
  knockbackMinLift: 4, // every hit pops you up at least this much
  knockbackAirDrag: 0.3,
  knockbackGroundDrag: 4, // sliding after you land
  maxKnockback: 60,

  // Grappling hook
  grappleRange: 70, // how far the hook flies before giving up
  grappleSpeed: 110, // hook flight speed (m/s)
  grappleScrollSensitivity: 0.08, // rope length change per pixel of scroll (one notch is ~100px = 8m)
  grappleMinLength: 1.5,
  grappleMaxLength: 80,
  grapplePullStiffness: 10, // how hard the rope pulls when it's longer than its set length
  grappleMaxPullSpeed: 45,
  grappleReelSpeed: 140, // how fast the hook flies back after letting go

  // World
  terrainSize: 200, // the original "main map" area around spawn (the terrain itself goes on forever)
  killY: -50, // fall below this (or this far above the roof) and you respawn
  terrain: {
    chunkSize: 25, // the endless world is loaded in square chunks this big
    resolution: 1.25, // meters between terrain vertices
    viewChunks: 6, // chunks loaded in each direction around you
    chunksPerFrame: 3, // how many new chunks to build per frame (higher = faster loading, more stutter)
    hillScale: 45, // bigger = wider hills
    hillHeight: 14, // how tall the hills get
    roofHeight: 42, // highest point of the roof
    roofScale: 30,
    roofDepth: 16, // how far roof spikes hang down
    minGap: 10, // roof never comes closer than this to the ground
    structureChance: 0.35, // chance each chunk gets a building/ruin
    // Open-sky chasms with no ground or roof, for things that float in the air.
    // { x0, x1, z0, z1 } in meters. Add one if you build something that needs open air around it.
    voids: [
      { x0: 100, x1: 177, z0: -12, z1: 12 }, // under the parkour course (falling off = back to checkpoint)
      { x0: -226, x1: -116, z0: -176, z1: 176 }, // around the minigame lobby and arenas
      { x0: -62, x1: 27, z0: 210, z1: 422 }, // around the extreme parkour lobby and course
      { x0: -1130, x1: -730, z0: -430, z1: 430 }, // minigame packs and the Solo Arcade (mgKit.js SLOT, HUB)
      { x0: 400, x1: 1100, z0: -250, z1: 450 }, // the Realm of Embervale (dndRealm.js)
      { x0: -702, x1: 702, z0: -1902, z1: -310 }, // space: Station NoCOM and the whole space RPG area (space.js, spaceRpg.js)
      { x0: -702, x1: 702, z0: -6302, z1: -4898 }, // space: Nebula Drift (spaceSectors.js)
      { x0: -702, x1: 702, z0: -10802, z1: -9398 }, // space: Cryo-9 Ice Moon
      { x0: -702, x1: 702, z0: -15302, z1: -13898 }, // space: The Scrapyard
      { x0: -702, x1: 702, z0: -19802, z1: -18398 }, // space: The Void Rift
    ],
  },

  // Space (space.js)
  space: {
    gravity: 0.35, // gravity multiplier while you're in the space zone
  },

  // Health & dynamite
  maxHealth: 100,
  dynamite: {
    throwSpeed: 18,
    fuse: 2.5, // seconds
    cooldown: 0.6,
    radius: 7, // blast radius
    damage: 70, // at the center, falls off to 0 at the edge
    knockback: 22,
  },

  // Jetpack (hold Shift in the air; a quick tap is the air dash instead)
  jetpack: {
    holdDelay: 0.18, // seconds Shift must be held in the air before the jetpack fires
    thrust: 46, // upward acceleration (gravity is 24)
    maxRiseSpeed: 11,
    burnRate: 0.28, // fuel used per second (1 = full tank)
    refillRate: 0.45, // fuel regained per second while standing on something
  },

  // Black hole grenades (I key)
  blackHole: {
    throwSpeed: 16,
    fuse: 1.4, // seconds before it opens
    cooldown: 2.5,
    startRadius: 0.5, // event horizon size when it opens
    maxRadius: 40,
    growth: 2, // how much each eaten block adds (in radius^3)
    life: 25, // seconds before it collapses
    pull: 70, // pull strength
    pullRange: 5, // pulls things within pullRange + 3 * radius
    damage: 45, // health per second inside the event horizon
  },

  // Camera (first person)
  eyeHeight: 1.6, // above player feet
  fov: 75,
  mouseSensitivity: 0.0022,

  // Networking
  sendRateHz: 20,
};
