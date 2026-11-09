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
