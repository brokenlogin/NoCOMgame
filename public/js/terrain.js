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
// ---------- Regions ----------
// Big, slow noise decides what kind of land you're in, and the regions blend into each other:
//   plains:    low, gentle, bright grass (lots of trees in Survival)
//   mountains: tall ridged peaks with rock faces and snow on top (more ore and crystal)
//   mesas:     sandy desert with flat-topped terraces and cliffs (more gold)
//   valleys:   winding dry riverbeds cut through everything
export function makeBiomeFunction(seed) {
  const R = CONFIG.terrain.regions || {};
  const scale = R.scale ?? 380;
  return (x, z) => {
    // Near spawn everything stays ordinary hills
    const fromSpawn = THREE.MathUtils.smoothstep(Math.hypot(x, z), 60, 140);
    const mountain = THREE.MathUtils.smoothstep(fbm(x / scale, z / scale, seed + 501, 3), 0.12, 0.38) * fromSpawn;
    const plains = THREE.MathUtils.smoothstep(fbm(x / (scale * 0.85), z / (scale * 0.85), seed + 733, 3), 0.02, 0.3) * (1 - mountain);
    const mesa = THREE.MathUtils.smoothstep(fbm(x / (scale * 1.15), z / (scale * 1.15), seed + 977, 3), 0.18, 0.4) * (1 - mountain) * (1 - plains) * fromSpawn;
    // Riverbeds: where a slow noise crosses zero, a narrow channel
    const rv = Math.abs(fbm(x / 230, z / 230, seed + 2222, 3));
    const valley = (1 - THREE.MathUtils.smoothstep(rv, 0.015, 0.06)) * fromSpawn;
    return { mountain, plains, mesa, valley };
  };
}

// The roof has its own regions, unlike anything on the ground:
//   fungal:  purple/teal ceiling with bulbous lumps hanging down
//   basalt:  dark stepped shelves hanging down, with ember-orange on the lowest ones
//   grotto:  the ceiling opens up into tall deep-blue crystal caverns
export function makeRoofBiomeFunction(seed) {
  const scale = CONFIG.terrain.roofRegions?.scale ?? 260;
  return (x, z) => {
    const fromSpawn = THREE.MathUtils.smoothstep(Math.hypot(x, z), 40, 110);
    const a = fbm(x / scale, z / scale, seed + 3101, 3);
    const b = fbm(x / (scale * 0.9), z / (scale * 0.9), seed + 3307, 3);
    const grotto = THREE.MathUtils.smoothstep(-a, 0.1, 0.32) * fromSpawn;
    const fungal = THREE.MathUtils.smoothstep(b, 0.08, 0.3) * (1 - grotto) * fromSpawn;
    const basalt = THREE.MathUtils.smoothstep(-b, 0.08, 0.3) * (1 - grotto) * fromSpawn;
    // (There used to be a "spires" region of thin needles here: the 1.25m terrain grid is far too
    // coarse for needles, so it rendered as huge broken sheets hanging to the ground. Removed.)
    return { fungal, basalt, grotto };
  };
}

export function makeHeightFunctions(seed) {
  const T = CONFIG.terrain;
  const biome = makeBiomeFunction(seed);
  const R = T.regions || {};
  // (b: the biome at (x, z), if the caller already has it; chunk building does)
  const ground = (x, z, b = biome(x, z)) => {
    let hills = fbm(x / T.hillScale, z / T.hillScale, seed) * T.hillHeight;
    // Plains: flatten the hills
    hills *= 1 - 0.75 * b.plains;
    // Mountains: sharp ridges (1 - |noise| makes crests), squared for pointy peaks
    if (b.mountain > 0) {
      const ridge = 1 - Math.abs(fbm(x / 95, z / 95, seed + 1234, 4));
      hills += b.mountain * (ridge * ridge * (R.mountainHeight ?? 38) + 6);
    }
    // Mesas: raise the land and cut it into flat steps with steep cliffs between them
    if (b.mesa > 0) {
      const raised = hills * 1.2 + 8;
      const step = R.mesaStep ?? 5;
      const t = raised / step;
      const f = t - Math.floor(t);
      const terraced = (Math.floor(t) + THREE.MathUtils.smoothstep(f, 0.78, 1)) * step;
      hills += (terraced - hills) * b.mesa;
    }
    // Valleys: carve a riverbed
    hills -= b.valley * (R.valleyDepth ?? 6);
    // Keep the spawn area near the middle fairly gentle
    const d = Math.hypot(x, z);
    const calm = THREE.MathUtils.smoothstep(d, 4, 20);
    // Flat path at height 0 out to the parkour course (+X, around z=0)
    const path = 1 - THREE.MathUtils.smoothstep(Math.abs(z), 6, 16);
    const toEdge = THREE.MathUtils.smoothstep(x, 55, 80) * (1 - THREE.MathUtils.smoothstep(x, 185, 205)) * path;
    const land = hills * (0.25 + 0.75 * calm) * (1 - toEdge);
    return land + (VOID_FLOOR - land) * voidAmount(x, z);
  };
  const roofBiome = makeRoofBiomeFunction(seed);
  // (groundY, rb: the ground height and roof biome at (x, z), if the caller already has them)
  const roof = (x, z, groundY = ground(x, z), rb = roofBiome(x, z)) => {
    // Ridged noise hanging down from the roof, like stalactites
    const n = 1 - Math.abs(fbm(x / T.roofScale, z / T.roofScale, seed + 9999, 4));
    let y = T.roofHeight - n * n * T.roofDepth;
    if (rb.fungal > 0) {
      // Rounded bulbs
      const blob = fbm(x / 11, z / 11, seed + 5555, 2);
      y -= rb.fungal * THREE.MathUtils.smoothstep(blob, 0.0, 0.45) * 9;
    }
    if (rb.basalt > 0) {
      // Stepped basalt shelves: smooth noise cut into 2.5m terraces with short steep edges.
      // (Real columns with sudden 9m jumps can't be drawn by the 1.25m terrain grid; they came
      // out as jagged broken sheets.)
      const v = (fbm(x / 18, z / 18, seed + 6666, 3) * 0.5 + 0.5) * 10;
      const step = 2.5;
      const t = v / step;
      const f = t - Math.floor(t);
      const terraced = (Math.floor(t) + THREE.MathUtils.smoothstep(f, 0.7, 1)) * step;
      y -= rb.basalt * (2 + terraced);
    }
    if (rb.grotto > 0) {
      // Open up into tall caverns
      y += rb.grotto * (8 + 10 * THREE.MathUtils.smoothstep(fbm(x / 35, z / 35, seed + 7777, 2), -0.2, 0.4));
    }
    y = Math.max(y, groundY + T.minGap);
    return y + (VOID_SKY - y) * voidAmount(x, z);
  };
  return { ground, roof, biome, roofBiome };
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

// Builds one square of ground or roof from a grid of heights that's one point bigger on every
// side than the tile (the extra ring is only for working out slopes, so the shading lines up
// seamlessly with the next tile). heights[(j + 1) * (n + 2) + (i + 1)] is vertex (i, j).
// Working every height out exactly once is what makes streaming new terrain cheap: the old way
// asked the (expensive) height function five times per vertex.
const tileIndices = new Map(); // "segs|down" -> Uint16Array, the same triangles for every tile
function indicesFor(segs, facingDown) {
  const k = `${segs}|${facingDown}`;
  let arr = tileIndices.get(k);
  if (arr) return arr;
  const n = segs + 1;
  arr = new (n * n > 65535 ? Uint32Array : Uint16Array)(segs * segs * 6);
  let q = 0;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = j * n + i + 1, d = (j + 1) * n + i + 1;
      // Winding decides which way the surface faces (and which side rays hit)
      if (facingDown) arr.set([a, c, b, b, c, d], q);
      else arr.set([a, b, c, b, d, c], q);
      q += 6;
    }
  }
  tileIndices.set(k, arr);
  return arr;
}

function buildTile(x0, z0, size, segs, heights, facingDown, colorFn, biomes) {
  const n = segs + 1;
  const w = n + 2; // width of the padded height grid
  const step = size / segs;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const color = new THREE.Color();
  const sign = facingDown ? -1 : 1;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = (j + 1) * w + (i + 1);
      const y = heights[h];
      const k = (j * n + i) * 3;
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = z;
      // Slope from the neighbouring grid points
      const dx = heights[h + 1] - heights[h - 1];
      const dz = heights[h + w] - heights[h - w];
      const up = 2 * step;
      const len = Math.sqrt(dx * dx + up * up + dz * dz);
      const ny = up / len;
      normals[k] = (-dx / len) * sign;
      normals[k + 1] = ny * sign;
      normals[k + 2] = (-dz / len) * sign;
      colorFn(x, y, z, ny, color, biomes[j * n + i]);
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indicesFor(segs, facingDown), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const PLAINS_GREEN = new THREE.Color(0x6e9a46);
const SAND = new THREE.Color(0xd2a868);
const MESA_RED = new THREE.Color(0xb8643c);
const MOUNTAIN_ROCK = new THREE.Color(0x7c7670);
const SNOW = new THREE.Color(0xf2f5f8);
const RIVERBED = new THREE.Color(0x8a7a5c);
const _c = new THREE.Color();

// Ground color from height, steepness and region (biome = { mountain, plains, mesa, valley })
function groundColor(x, y, z, flatness, out, biome) {
  const T = CONFIG.terrain;
  const t = THREE.MathUtils.clamp((y + T.hillHeight * 0.3) / (T.hillHeight * 1.0), 0, 1);
  out.copy(GROUND_LOW).lerp(GROUND_MID, Math.min(1, t * 1.6));
  if (t > 0.6) out.lerp(GROUND_HIGH, (t - 0.6) / 0.4);
  if (biome) {
    // Plains: lush green
    out.lerp(PLAINS_GREEN, biome.plains * 0.8);
    // Mesas: sand on the flat tops, banded red rock on the cliffs
    if (biome.mesa > 0) {
      const band = 0.5 + 0.5 * Math.sin(y * 1.3);
      _c.copy(SAND).lerp(MESA_RED, flatness < 0.8 ? 0.6 + band * 0.4 : band * 0.25);
      out.lerp(_c, biome.mesa);
    }
    // Mountains: bare rock, snow up high on the gentler bits
    if (biome.mountain > 0) {
      out.lerp(MOUNTAIN_ROCK, biome.mountain * 0.85);
      const snow = THREE.MathUtils.smoothstep(y, 24, 32) * THREE.MathUtils.smoothstep(flatness, 0.55, 0.8);
      out.lerp(SNOW, snow * biome.mountain);
    }
    // Dry riverbeds
    out.lerp(RIVERBED, biome.valley * 0.7);
  }
  // Steep slopes look rocky (mesa cliffs keep their red)
  out.lerp(GROUND_HIGH, THREE.MathUtils.clamp((0.85 - flatness) * 3, 0, 1) * (1 - (biome?.mesa || 0) * 0.8));
  // A little speckle so you can see yourself move
  const s = 0.92 + hash2(Math.floor(x), Math.floor(z), 7) * 0.12;
  out.multiplyScalar(s);
}

const FUNGAL_PURPLE = new THREE.Color(0x6a3d8a);
const FUNGAL_TEAL = new THREE.Color(0x2fa89a);
const BASALT = new THREE.Color(0x2c2a2e);
const EMBER = new THREE.Color(0xd2541c);
const GROTTO_BLUE = new THREE.Color(0x24407a);
const GROTTO_SPARK = new THREE.Color(0x9fe8ff);

// Roof color from steepness and roof region (rb = { fungal, basalt, grotto })
function roofColor(x, y, z, flatness, out, rb) {
  out.copy(ROOF_A).lerp(ROOF_B, THREE.MathUtils.clamp(1 - flatness, 0, 1));
  if (rb) {
    if (rb.fungal > 0) {
      _c.copy(FUNGAL_PURPLE).lerp(FUNGAL_TEAL, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.2));
      out.lerp(_c, rb.fungal * 0.85);
    }
    if (rb.basalt > 0) {
      // Dark columns; the lowest (longest) ones glow ember-orange at the tips
      const tip = THREE.MathUtils.smoothstep(CONFIG.terrain.roofHeight - y, 22, 27) * 0.85; // only the deepest tips
      _c.copy(BASALT).lerp(EMBER, tip);
      out.lerp(_c, rb.basalt * 0.9);
    }
    if (rb.grotto > 0) {
      out.lerp(GROTTO_BLUE, rb.grotto * 0.85);
      if (hash2(Math.floor(x * 2), Math.floor(z * 2), 31) > 0.93) out.lerp(GROTTO_SPARK, rb.grotto); // crystal glints
    }
  }
  out.multiplyScalar(0.9 + hash2(Math.floor(x), Math.floor(z), 13) * 0.2);
}

// Endless terrain: ground + roof chunks are built around a focus point (the player)
// as you move, and thrown away once you're far from them.
//
//   generate(seed)      switch to a different world (clears all chunks)
//   update(focus)       call every frame with the player's position
//   groundHeight(x, z)  exact ground height anywhere, loaded or not
//   roofHeight(x, z)    exact roof height anywhere
//   biome(x, z)         which region you're in: { mountain, plains, mesa, valley } (0..1 each)
//   roofBiome(x, z)     which roof region is overhead: { fungal, basalt, grotto }
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

  const gridN = segs + 1, gridW = gridN + 2;
  const groundH = new Float32Array(gridW * gridW), roofH = new Float32Array(gridW * gridW);
  const groundBiomes = new Array(gridN * gridN), roofBiomes = new Array(gridN * gridN);

  function loadChunk(cx, cz) {
    const x0 = cx * S, z0 = cz * S;
    // Every height exactly once (plus a ring of one around the tile, for slopes). The roof needs
    // the ground height under it, and the colors need the biomes, so those are shared too.
    const step = S / segs;
    for (let j = -1; j <= gridN; j++) {
      for (let i = -1; i <= gridN; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const h = (j + 1) * gridW + (i + 1);
        const b = terrain.biome(x, z), rb = terrain.roofBiome(x, z);
        const g = terrain.groundHeight(x, z, b);
        groundH[h] = g;
        roofH[h] = terrain.roofHeight(x, z, g, rb);
        if (i >= 0 && j >= 0 && i < gridN && j < gridN) {
          groundBiomes[j * gridN + i] = b;
          roofBiomes[j * gridN + i] = rb;
        }
      }
    }
    const ground = new THREE.Mesh(buildTile(x0, z0, S, segs, groundH, false, groundColor, groundBiomes), groundMat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    ground.name = 'ground';
    const roof = new THREE.Mesh(buildTile(x0, z0, S, segs, roofH, true, roofColor, roofBiomes), roofMat);
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
    biome: () => ({ mountain: 0, plains: 0, mesa: 0, valley: 0 }),
    roofBiome: () => ({ fungal: 0, basalt: 0, grotto: 0 }),
    onChunkLoad: null,
    onChunkUnload: null,

    generate(seed) {
      for (const c of [...chunks.values()]) unloadChunk(c);
      terrain.seed = seed;
      const { ground, roof, biome, roofBiome } = makeHeightFunctions(seed);
      terrain.groundHeight = ground;
      terrain.roofHeight = roof;
      terrain.roofBiome = roofBiome; // (x, z) -> { fungal, basalt, grotto }, each 0..1
      terrain.biome = biome; // (x, z) -> { mountain, plains, mesa, valley }, each 0..1
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
      const started = performance.now();
      for (const [d2, cx, cz] of missing) {
        // Always build the ones right around you immediately; the rest a few per frame,
        // and never for more than a few milliseconds (so driving fast doesn't stutter)
        if (d2 > 2 && (built >= T.chunksPerFrame || performance.now() - started > 4)) break;
        loadChunk(cx, cz);
        built++;
      }
    },
  };
  return terrain;
}
