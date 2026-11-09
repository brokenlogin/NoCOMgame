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
    // Flat path at height 0 out to the parkour course on the east edge (+X, around z=0)
    const path = 1 - THREE.MathUtils.smoothstep(Math.abs(z), 6, 16) * 1;
    const toEdge = THREE.MathUtils.smoothstep(x, 55, 80) * path;
    return hills * (0.25 + 0.75 * calm) * (1 - toEdge);
  };
  const roof = (x, z) => {
    // Ridged noise hanging down from the roof, like stalactites
    const n = 1 - Math.abs(fbm(x / T.roofScale, z / T.roofScale, seed + 9999, 4));
    const y = T.roofHeight - n * n * T.roofDepth;
    return Math.max(y, ground(x, z) + T.minGap);
  };
  return { ground, roof };
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

// Creates the ground + roof tile meshes and adds them to the scene.
// Call `generate(seed)` again to reshape them into a different world.
export function createTerrain(scene) {
  const T = CONFIG.terrain;
  const size = CONFIG.terrainSize;
  const tileSize = size / T.tiles;
  const segs = Math.round(tileSize / T.resolution);

  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  const groundTiles = [];
  const roofTiles = [];
  for (let tz = 0; tz < T.tiles; tz++) {
    for (let tx = 0; tx < T.tiles; tx++) {
      const g = new THREE.Mesh(new THREE.BufferGeometry(), groundMat);
      g.receiveShadow = true;
      g.castShadow = true;
      g.name = 'ground';
      g.userData.tile = [tx, tz];
      scene.add(g);
      groundTiles.push(g);

      const r = new THREE.Mesh(new THREE.BufferGeometry(), roofMat);
      r.receiveShadow = true;
      r.castShadow = false; // would put the whole world in shadow
      r.name = 'roof';
      r.userData.tile = [tx, tz];
      scene.add(r);
      roofTiles.push(r);
    }
  }

  const terrain = {
    seed: 0,
    groundTiles,
    roofTiles,
    groundHeight: () => 0,
    roofHeight: () => T.roofHeight,
    generate(seed) {
      terrain.seed = seed;
      const { ground, roof } = makeHeightFunctions(seed);
      terrain.groundHeight = ground;
      terrain.roofHeight = roof;
      const half = size / 2;
      for (const [list, fn, down, colorFn] of [
        [groundTiles, ground, false, groundColor],
        [roofTiles, roof, true, roofColor],
      ]) {
        for (const mesh of list) {
          const [tx, tz] = mesh.userData.tile;
          mesh.geometry.dispose();
          mesh.geometry = buildTile(-half + tx * tileSize, -half + tz * tileSize, tileSize, segs, fn, down, colorFn);
        }
      }
    },
  };
  return terrain;
}
