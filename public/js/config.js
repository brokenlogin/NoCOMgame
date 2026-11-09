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
  grappleReelSpeed: 140, // how fast the hook flies back after letting go // how far below someone's head-top your feet can be and still land on them

  // World
  terrainSize: 200, // square, centered on origin
  killY: -50, // fall below this and you respawn

  // Camera (first person)
  eyeHeight: 1.6, // above player feet
  fov: 75,
  mouseSensitivity: 0.0022,

  // Networking
  sendRateHz: 20,
};
