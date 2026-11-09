import * as THREE from 'three';
import { CONFIG } from './config.js';

// Procedural terrain: rolling hills on the ground and a rocky roof overhead.
// Everything is generated from a seed, so every player in a room (same seed) gets the same world.
// The world is split into tiles so the player's ground raycast only checks nearby triangles.

// ---------- Seeded noise ----------
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295; // 0..1
}

function smooth(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Smooth value noise, roughly -1..1
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

// Several layers of noise stacked: big hills + small bumps
function fbm(x, z, seed, octaves = 5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------- Height functions ----------
export function makeHeightFunctions(seed) {
  const T = CONFIG.terrain;
  const ground = (x, z) => {
    const hills = fbm(x / T.hillScale, z / T.hillScale, seed) * T.hillHeight;
    // Keep the spawn area near the middle fairly gentle
    const d = Math.hypot(x, z);
    const calm = THREE.MathUtils.smoothstep(d, 4, 20);
    // Flat path at height 0 out to the parkour course (+X, around z=0)
    const path = 1 - THREE.MathUtils.smoothstep(Math.abs(z), 6, 16);
    const toEdge = THREE.MathUtils.smoothstep(x, 55, 80) * (1 - THREE.MathUtils.smoothstep(x, 185, 205)) * path;
    const land = hills * (0.25 + 0.75 * calm) * (1 - toEdge);
    return land + (VOID_FLOOR - land) * voidAmount(x, z);
  };
  const roof = (x, z) => {
    // Ridged noise hanging down from the roof, like stalactites
    const n = 1 - Math.abs(fbm(x / T.roofScale, z / T.roofScale, seed + 9999, 4));
    const y = Math.max(T.roofHeight - n * n * T.roofDepth, ground(x, z) + T.minGap);
    return y + (VOID_SKY - y) * voidAmount(x, z);
  };
  return { ground, roof };
}

// Inside a void (config terrain.voids) the ground drops away and the roof opens to the sky.
const VOID_FLOOR = -120;
const VOID_SKY = 220;
const VOID_EDGE = 4; // meters of cliff around a void
export function voidAmount(x, z) {
  let a = 0;
  for (const v of CONFIG.terrain.voids) {
    const dx = Math.max(v.x0 - x, x - v.x1); // > 0 outside, < 0 inside
    const dz = Math.max(v.z0 - z, z - v.z1);
    const d = Math.max(dx, dz);
    a = Math.max(a, 1 - THREE.MathUtils.smoothstep(d, -VOID_EDGE, 0));
  }
  return a;
}

// ---------- Mesh building ----------
const GROUND_LOW = new THREE.Color(0x4f6b3a);
const GROUND_MID = new THREE.Color(0x7a8a4e);
const GROUND_HIGH = new THREE.Color(0x8d8578);
const ROOF_A = new THREE.Color(0x9c8a76);
const ROOF_B = new THREE.Color(0x6e6052);

function buildTile(x0, z0, size, segs, heightFn, facingDown, colorFn) {
  const n = segs + 1;
  const step = size / segs;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const color = new THREE.Color();
  const e = 0.5; // for slope estimate

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const y = heightFn(x, z);
      const k = (j * n + i) * 3;
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = z;
      // Normal from the height function itself, so tile edges line up seamlessly
      const dx = heightFn(x + e, z) - heightFn(x - e, z);
      const dz = heightFn(x, z + e) - heightFn(x, z - e);
      const nv = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
      if (facingDown) nv.negate();
      normals[k] = nv.x;
      normals[k + 1] = nv.y;
      normals[k + 2] = nv.z;
      colorFn(x, y, z, Math.abs(nv.y), color);
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
    }
  }

  const indices = [];
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = j * n + i + 1, d = (j + 1) * n + i + 1;
      // Winding decides which way the surface faces (and which side rays hit)
      if (facingDown) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function groundColor(x, y, z, flatness, out) {
  const T = CONFIG.terrain;
  const t = THREE.MathUtils.clamp((y + T.hillHeight * 0.3) / (T.hillHeight * 1.0), 0, 1);
  out.copy(GROUND_LOW).lerp(GROUND_MID, Math.min(1, t * 1.6));
  if (t > 0.6) out.lerp(GROUND_HIGH, (t - 0.6) / 0.4);
  // Steep slopes look rocky
  out.lerp(GROUND_HIGH, THREE.MathUtils.clamp((0.85 - flatness) * 3, 0, 1));
  // A little speckle so you can see yourself move
  const s = 0.92 + hash2(Math.floor(x), Math.floor(z), 7) * 0.12;
  out.multiplyScalar(s);
}

function roofColor(x, y, z, flatness, out) {
  out.copy(ROOF_A).lerp(ROOF_B, THREE.MathUtils.clamp(1 - flatness, 0, 1));
  out.multiplyScalar(0.9 + hash2(Math.floor(x), Math.floor(z), 13) * 0.2);
}

// Endless terrain: ground + roof chunks are built around a focus point (the player)
// as you move, and thrown away once you're far from them.
//
//   generate(seed)      switch to a different world (clears all chunks)
//   update(focus)       call every frame with the player's position
//   groundHeight(x, z)  exact ground height anywhere, loaded or not
//   roofHeight(x, z)    exact roof height anywhere
//   onChunkLoad / onChunkUnload (cx, cz)   hooks (structures use these)
//
// Chunk meshes are added to/removed from `colliders` so raycasts hit them.
export function createTerrain(scene, colliders) {
  const T = CONFIG.terrain;
  const S = T.chunkSize;
  const segs = Math.max(2, Math.round(S / T.resolution));

  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  const chunks = new Map(); // "cx,cz" -> { cx, cz, ground, roof }
  const key = (cx, cz) => `${cx},${cz}`;

  function loadChunk(cx, cz) {
    const x0 = cx * S, z0 = cz * S;
    const ground = new THREE.Mesh(buildTile(x0, z0, S, segs, terrain.groundHeight, false, groundColor), groundMat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    ground.name = 'ground';
    const roof = new THREE.Mesh(buildTile(x0, z0, S, segs, terrain.roofHeight, true, roofColor), roofMat);
    roof.receiveShadow = true;
    roof.castShadow = false; // would put the whole world in shadow
    roof.name = 'roof';
    ground.visible = roof.visible = terrain.landVisible !== false;
    scene.add(ground, roof);
    colliders.push(ground, roof);
    const chunk = { cx, cz, ground, roof };
    chunks.set(key(cx, cz), chunk);
    terrain.onChunkLoad?.(cx, cz);
    return chunk;
  }

  function unloadChunk(chunk) {
    for (const m of [chunk.ground, chunk.roof]) {
      scene.remove(m);
      m.geometry.dispose();
      const i = colliders.indexOf(m);
      if (i >= 0) colliders.splice(i, 1);
    }
    chunks.delete(key(chunk.cx, chunk.cz));
    terrain.onChunkUnload?.(chunk.cx, chunk.cz);
  }

  const terrain = {
    seed: 0,
    chunks,
    groundHeight: () => 0,
    roofHeight: () => T.roofHeight,
    onChunkLoad: null,
    onChunkUnload: null,

    generate(seed) {
      for (const c of [...chunks.values()]) unloadChunk(c);
      terrain.seed = seed;
      const { ground, roof } = makeHeightFunctions(seed);
      terrain.groundHeight = ground;
      terrain.roofHeight = roof;
    },

    // Load what's near `focus` (nearest first, a few per frame), unload what's far away
    update(focus) {
      const R = T.viewChunks;
      const fcx = Math.floor(focus.x / S), fcz = Math.floor(focus.z / S);

      for (const c of [...chunks.values()]) {
        if (Math.abs(c.cx - fcx) > R + 1 || Math.abs(c.cz - fcz) > R + 1) unloadChunk(c);
      }

      const missing = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          if (!chunks.has(key(fcx + dx, fcz + dz))) missing.push([dx * dx + dz * dz, fcx + dx, fcz + dz]);
        }
      }
      if (!missing.length) return;
      missing.sort((a, b) => a[0] - b[0]);
      let built = 0;
      for (const [d2, cx, cz] of missing) {
        // Always build the ones right around you immediately; the rest a few per frame
        if (d2 > 2 && built >= T.chunksPerFrame) break;
        loadChunk(cx, cz);
        built++;
      }
    },
  };
  return terrain;
}
