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
  killY: -50, // fall below this and you respawn

  // Camera (first person)
  eyeHeight: 1.6, // above player feet
  fov: 75,
  mouseSensitivity: 0.0022,

  // Networking
  sendRateHz: 20,
};
