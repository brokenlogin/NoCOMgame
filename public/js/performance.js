// Things that keep the frame rate up without changing how the game looks or plays.
//
//  1. Resolution: never draw more pixels than a normal laptop GPU can fill, and if the frame
//     rate still drops, draw slightly fewer for a while (then carefully try more again).
//  2. Fog clipping: on the map, anything past the end of the fog is exactly the color of the sky,
//     so it's invisible. Don't draw it at all.
//  3. Far-away things: the scene holds every zone at once. Objects too far away to be seen are
//     left out of the draw completely (and their positions aren't recalculated every frame).
//
// main.js calls beforeRender(dt) right before drawing the world and afterRender() right after.

import * as THREE from 'three';

const MAX_PIXELS = 2.4e6; // about 2000 x 1200: more than this is wasted on small 3D shapes
const MIN_SCALE = 0.55; // never go blurrier than this fraction of the starting resolution

export function setupPerformance({ renderer, scene, camera }) {
  // ---------- 1. Resolution ----------
  let scale = 1; // lowered when the game runs slowly
  function basePixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssPixels = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.min(dpr, Math.sqrt(MAX_PIXELS / cssPixels));
  }
  function applyResolution() {
    const ratio = Math.max(0.5, basePixelRatio() * scale);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.01) renderer.setPixelRatio(ratio);
  }
  applyResolution();

  // Watch the frame rate in ~1 second windows
  let acc = 0, frames = 0, slowWindows = 0, goodWindows = 0;
  let skip = 5; // windows to ignore (loading, right after a change, coming back to the tab)
  let retryAfter = 8; // good seconds needed before trying a higher resolution again
  let justRaised = false;
  let fpsAtLastDrop = 0, fruitless = 0, adaptive = true;
  document.addEventListener('visibilitychange', () => {
    skip = 3;
    acc = frames = 0;
  });
  function watchFrameRate(dt) {
    if (!adaptive || document.hidden || dt <= 0) return;
    acc += dt;
    frames++;
    if (acc < 1) return;
    const fps = frames / acc;
    acc = 0;
    frames = 0;
    if (skip > 0) {
      skip--;
      return;
    }
    if (fps < 45) {
      goodWindows = 0;
      // Just tried a higher resolution and it didn't hold: go back and wait longer next time
      if (justRaised) retryAfter = Math.min(120, retryAfter * 2);
      if (++slowWindows >= 2 || justRaised) {
        slowWindows = 0;
        justRaised = false;
        // If drawing fewer pixels isn't making it faster, the graphics card isn't the problem
        // (a 30 fps screen, a busy CPU...): put the resolution back and leave it alone
        fruitless = fpsAtLastDrop && fps < fpsAtLastDrop * 1.12 ? fruitless + 1 : 0;
        if (fruitless >= 2) {
          adaptive = false;
          scale = 1;
          applyResolution();
          return;
        }
        if (scale > MIN_SCALE) {
          fpsAtLastDrop = fps;
          scale = Math.max(MIN_SCALE, scale * 0.85);
          applyResolution();
          skip = 1;
        }
      }
    } else {
      slowWindows = 0;
      justRaised = false;
      if (fps > 57 && scale < 1 && ++goodWindows >= retryAfter) {
        goodWindows = 0;
        fpsAtLastDrop = 0;
        scale = Math.min(1, scale / 0.85);
        justRaised = true;
        applyResolution();
      }
    }
  }

  // ---------- 2. Don't draw past the fog ----------
  function clipToFog() {
    const fog = scene.fog, bg = scene.background;
    if (!fog?.isFog || !bg?.isColor) return;
    // Only when the fog fades into the sky (same color): then things past it can't be seen
    const c = fog.color;
    if (Math.abs(c.r - bg.r) + Math.abs(c.g - bg.g) + Math.abs(c.b - bg.b) > 0.02) return;
    const far = fog.far + 3;
    if (camera.far > far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  // ---------- 3. Leave out what's too far away to see ----------
  // The scene holds everything at once: the map, the minigames, the space station, whole space
  // sectors kilometers away... three.js would walk through all ~10,000 objects several times a
  // frame (positions, "is it on screen?", shadows) even though most are far out of sight.
  //
  // So every frame, each top-level object (and the parts of very big groups) is checked against
  // a remembered bounding ball. If it's further away than the camera can see, it is switched off
  // just for the draw and switched straight back on afterwards, so no other code ever notices.
  // The ball is re-measured about twice a second, in turns, so moving things stay right.
  // This also replaces scene.updateMatrixWorld(): hidden and far-away objects only get their
  // positions worked out when they're re-measured.
  scene.matrixWorldAutoUpdate = false;
  const REFRESH = 32; // frames between re-measuring one object
  const MARGIN = 30; // meters of slack, for things that move between measurements
  const hidden = [];
  const _s = new THREE.Sphere();
  let tick = 0;

  function measure(o, c) {
    let never = false;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    o.traverse((n) => {
      if (n.isLight || n.isCamera) {
        never = true; // switching lights on and off makes three.js rebuild its shaders
        return;
      }
      if (n.isSprite) {
        _s.center.set(0, 0, 0);
        _s.radius = 0.7071;
      } else if (n.geometry) {
        if (n.frustumCulled === false) {
          never = true; // "always draw me"
          return;
        }
        // The same ball three.js itself uses to decide if something is on screen
        const owner = n.boundingSphere !== undefined ? n : n.geometry;
        if (owner.boundingSphere === null) owner.computeBoundingSphere();
        _s.copy(owner.boundingSphere);
      } else {
        return;
      }
      _s.applyMatrix4(n.matrixWorld);
      const r = _s.radius, p = _s.center;
      if (p.x - r < minX) minX = p.x - r;
      if (p.y - r < minY) minY = p.y - r;
      if (p.z - r < minZ) minZ = p.z - r;
      if (p.x + r > maxX) maxX = p.x + r;
      if (p.y + r > maxY) maxY = p.y + r;
      if (p.z + r > maxZ) maxZ = p.z + r;
    });
    c.never = never;
    if (minX > maxX) {
      c.r = -1; // nothing in it to draw (yet)
      c.split = false;
      return;
    }
    c.x = (minX + maxX) / 2;
    c.y = (minY + maxY) / 2;
    c.z = (minZ + maxZ) / 2;
    c.r = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    c.px = o.position.x;
    c.py = o.position.y;
    c.pz = o.position.z;
    // Huge groups (a whole space sector...) are checked piece by piece instead
    c.split = c.r > 150 && o.children.length >= 8;
  }

  const unmoved = (o) =>
    o.position.x === 0 && o.position.y === 0 && o.position.z === 0 &&
    o.quaternion.x === 0 && o.quaternion.y === 0 && o.quaternion.z === 0 &&
    o.scale.x === 1 && o.scale.y === 1 && o.scale.z === 1;

  function sweep(list, far, cam) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      let c = o._cull;
      if (!c) {
        // First time we see it: place it, measure it when its turn comes
        o._cull = { x: 0, y: 0, z: 0, r: -1, px: 0, py: 0, pz: 0, never: true, split: false };
        o.updateMatrixWorld();
        continue;
      }
      const turn = (i + tick) % REFRESH === 0;
      if (!o.visible) {
        if (turn) o.updateMatrixWorld();
        continue;
      }
      if (turn) {
        o.updateMatrixWorld();
        measure(o, c);
      }
      if (!c.never && c.r >= 0) {
        const dx = c.x + o.position.x - c.px - cam.x;
        const dy = c.y + o.position.y - c.py - cam.y;
        const dz = c.z + o.position.z - c.pz - cam.z;
        const lim = far + MARGIN + c.r;
        if (dx * dx + dy * dy + dz * dz > lim * lim) {
          o.visible = false;
          hidden.push(o);
          continue;
        }
      }
      if (turn) continue; // already placed above
      if (c.split && unmoved(o)) sweep(o.children, far, cam);
      else o.updateMatrixWorld();
    }
  }

  function restore() {
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
    hidden.length = 0;
  }

  return {
    beforeRender(dt) {
      restore(); // (in case a draw failed halfway last frame)
      watchFrameRate(dt);
      clipToFog();
      tick++;
      sweep(scene.children, camera.far, camera.position);
    },
    afterRender: restore,
    resized: applyResolution,
    get resolutionScale() {
      return scale;
    },
  };
}
