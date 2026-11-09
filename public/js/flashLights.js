import * as THREE from 'three';

// A small, fixed pool of point lights for explosion flashes, zaps, glows, etc.
//
// WHY: in three.js, adding or removing a light changes the number of lights, which makes
// EVERY lit material in the scene recompile its shader. With thousands of materials in the
// world that's a 200ms+ freeze per explosion (and again when the light is removed).
// These lights are created once and never removed, so the light count never changes.
//
// Use game.flash(position, { color, intensity, distance, duration }) for a fading flash,
// or game.flashLights.hold(...) for a light you keep (returns a handle with .update() / .release()).

const POOL_SIZE = 4;

export function createFlashLights(scene) {
  const slots = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 10, 1.5);
    light.visible = true; // always "on" (intensity 0 when free) so the shader never changes
    scene.add(light);
    slots.push({ light, t: 0, duration: 0, peak: 0, held: false, owner: null });
  }

  // Take the free slot, or else the one closest to fading out
  function grab() {
    let best = null;
    let bestScore = Infinity;
    for (const s of slots) {
      if (s.held) continue;
      const score = s.duration > 0 ? 1 - s.t / s.duration : 0; // remaining fraction; free = 0
      const rank = s.light.intensity === 0 ? -1 : score;
      if (rank < bestScore) (bestScore = rank), (best = s);
    }
    return best;
  }

  function flash(position, { color = 0xffa040, intensity = 60, distance = 30, duration = 0.35 } = {}) {
    const s = grab();
    if (!s) return;
    s.light.position.copy(position);
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.intensity = intensity;
    s.peak = intensity;
    s.t = 0;
    s.duration = duration;
  }

  // A light you keep until release() (black holes etc.). Returns null if all are busy.
  function hold(position, { color = 0xffffff, intensity = 20, distance = 30 } = {}) {
    const s = grab();
    if (!s) return null;
    s.held = true;
    s.duration = 0;
    s.light.position.copy(position);
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.intensity = intensity;
    return {
      light: s.light,
      update(pos, newIntensity) {
        if (pos) s.light.position.copy(pos);
        if (newIntensity !== undefined) s.light.intensity = newIntensity;
      },
      release() {
        s.held = false;
        s.light.intensity = 0;
      },
    };
  }

  function update(dt) {
    for (const s of slots) {
      if (s.held || s.duration <= 0) continue;
      s.t += dt;
      const k = Math.max(0, 1 - s.t / s.duration);
      s.light.intensity = s.peak * k * k;
      if (k <= 0) s.duration = 0;
    }
  }

  return { flash, hold, update };
}
