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
  headLandTolerance: 0.5, // how far below someone's head-top your feet can be and still land on them

  // World
  terrainSize: 200, // square, centered on origin
  killY: -50, // fall below this (or this far above the roof) and you respawn
  terrain: {
    tiles: 8, // world is split into tiles x tiles chunks
    resolution: 1, // meters between terrain vertices
    hillScale: 45, // bigger = wider hills
    hillHeight: 14, // how tall the hills get
    roofHeight: 42, // highest point of the roof
    roofScale: 30,
    roofDepth: 16, // how far roof spikes hang down
    minGap: 10, // roof never comes closer than this to the ground
    structures: 22, // how many buildings/ruins to scatter around
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

  // Camera (first person)
  eyeHeight: 1.6, // above player feet
  fov: 75,
  mouseSensitivity: 0.0022,

  // Networking
  sendRateHz: 20,
};
