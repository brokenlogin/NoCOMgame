import * as THREE from 'three';
import { CONFIG } from './config.js';

// Buildings and ruins scattered over the terrain, made of blocks that dynamite can blow apart.
// Generated from the room seed so everyone sees the same layout.

const B = 2; // block size in meters

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MATERIALS = {
  stone: new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.9 }),
  darkStone: new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.95 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa0523d, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.8 }),
  plank: new THREE.MeshStandardMaterial({ color: 0xb48a57, roughness: 0.8 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x1a6080, roughness: 0.2, metalness: 0.1 }),
};
const boxGeoCache = new Map();
function boxGeo(sx, sy, sz) {
  const key = `${sx},${sy},${sz}`;
  if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(sx, sy, sz));
  return boxGeoCache.get(key);
}

export function createStructures(scene, colliders, solidBoxes) {
  const group = new THREE.Group();
  group.name = 'structures';
  scene.add(group);

  const blocks = new Set();
  const debris = [];

  function addBlock(x, y, z, sx, sy, sz, mat) {
    const mesh = new THREE.Mesh(boxGeo(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld();
    mesh.userData.box = new THREE.Box3().setFromObject(mesh);
    group.add(mesh);
    colliders.push(mesh);
    solidBoxes.push(mesh.userData.box);
    blocks.add(mesh);
    return mesh;
  }

  function removeBlock(mesh) {
    group.remove(mesh);
    blocks.delete(mesh);
    const ci = colliders.indexOf(mesh);
    if (ci >= 0) colliders.splice(ci, 1);
    const bi = solidBoxes.indexOf(mesh.userData.box);
    if (bi >= 0) solidBoxes.splice(bi, 1);
  }

  // ---------- Structure types ----------
  // Each gets a center (x,z), a base height, the rng, and the terrain.

  function tower(cx, base, cz, rng) {
    const mat = rng() < 0.5 ? MATERIALS.stone : MATERIALS.brick;
    const levels = 5 + Math.floor(rng() * 5);
    for (let l = 0; l < levels; l++) {
      for (let i = -1; i <= 1; i++) {
        for (let k = -1; k <= 1; k++) {
          if (i === 0 && k === 0) continue; // hollow
          if (l < 2 && i === 0 && k === 1) continue; // doorway
          addBlock(cx + i * B, base + B / 2 + l * B, cz + k * B, B, B, B, mat);
        }
      }
    }
    // Floor on top + battlements
    const top = base + levels * B;
    addBlock(cx, top + 0.25, cz, 3 * B, 0.5, 3 * B, MATERIALS.darkStone);
    for (const [i, k] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      addBlock(cx + i * B, top + 0.5 + B / 4, cz + k * B, B, B / 2, B, mat);
    }
  }

  function hut(cx, base, cz, rng) {
    const wall = rng() < 0.5 ? MATERIALS.wood : MATERIALS.plank;
    const n = 2; // blocks from center to wall
    for (let l = 0; l < 2; l++) {
      for (let i = -n; i <= n; i++) {
        for (let k = -n; k <= n; k++) {
          if (Math.abs(i) !== n && Math.abs(k) !== n) continue; // walls only
          if (l === 0 && i === 0 && k === n) continue; // door
          if (l === 1 && (i === 0 || k === 0) && rng() < 0.6) continue; // windows
          addBlock(cx + i * B, base + B / 2 + l * B, cz + k * B, B, B, B, wall);
        }
      }
    }
    // Flat roof made of planks
    for (let i = -n; i <= n; i++) {
      addBlock(cx + i * B, base + 2 * B + 0.25, cz, B, 0.5, (2 * n + 1) * B, MATERIALS.darkStone);
    }
  }

  function ruins(cx, base, cz, rng) {
    const mat = MATERIALS.stone;
    for (let i = -2; i <= 2; i++) {
      for (let k = -2; k <= 2; k++) {
        if (rng() < 0.55) continue;
        const h = 1 + Math.floor(rng() * 3);
        for (let l = 0; l < h; l++) addBlock(cx + i * B, base + B / 2 + l * B, cz + k * B, B, B, B, mat);
      }
    }
  }

  function arch(cx, base, cz, rng, terrain) {
    const mat = rng() < 0.5 ? MATERIALS.stone : MATERIALS.brick;
    const h = 3 + Math.floor(rng() * 2);
    const along = rng() < 0.5;
    for (const side of [-2, 2]) {
      const x = cx + (along ? side * B : 0), z = cz + (along ? 0 : side * B);
      for (let l = 0; l < h; l++) addBlock(x, base + B / 2 + l * B, z, B, B, B, mat);
    }
    for (let i = -2; i <= 2; i++) {
      const x = cx + (along ? i * B : 0), z = cz + (along ? 0 : i * B);
      addBlock(x, base + B / 2 + h * B, z, B, B, B, mat);
    }
  }

  // A column that reaches all the way up to the roof, topped with a glowing crystal
  function pillar(cx, base, cz, rng, terrain) {
    const roofY = terrain.roofHeight(cx, cz);
    const levels = Math.floor((roofY - base) / B) - 1;
    for (let l = 0; l < levels; l++) {
      addBlock(cx, base + B / 2 + l * B, cz, B, B, B, l % 4 === 3 ? MATERIALS.darkStone : MATERIALS.stone);
    }
    addBlock(cx, base + levels * B + 0.5, cz, 1, 1, 1, MATERIALS.crystal);
  }

  const TYPES = [tower, hut, hut, ruins, ruins, arch, pillar];

  const api = {
    group,
    blocks,
    generate(seed, terrain) {
      for (const b of [...blocks]) removeBlock(b);
      const rng = mulberry32(seed * 7919 + 17);
      const half = CONFIG.terrainSize / 2 - 14;
      const placed = [];
      let tries = 0;
      while (placed.length < CONFIG.terrain.structures && tries++ < 500) {
        const x = (rng() * 2 - 1) * half;
        const z = (rng() * 2 - 1) * half;
        if (Math.hypot(x, z) < 16) continue; // keep spawn clear
        if (x > 45 && Math.abs(z) < 22) continue; // keep the path to the parkour course clear
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 16)) continue;
        // Sit the base slightly into the lowest point under the footprint
        let base = Infinity;
        for (const [dx, dz] of [[0, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]]) {
          base = Math.min(base, terrain.groundHeight(x + dx, z + dz));
        }
        base -= 0.3;
        // Snap to the block grid so blocks line up nicely
        const sx = Math.round(x / B) * B, sz = Math.round(z / B) * B;
        const type = TYPES[Math.floor(rng() * TYPES.length)];
        type(sx, base, sz, rng, terrain);
        placed.push({ x, z });
      }
    },

    // Blow apart every block within `radius` of `point`. Returns how many were destroyed.
    destroyNear(point, radius) {
      let count = 0;
      const c = new THREE.Vector3();
      for (const mesh of [...blocks]) {
        mesh.userData.box.getCenter(c);
        const d = c.distanceTo(point);
        if (d > radius) continue;
        removeBlock(mesh);
        count++;
        // Fling it as debris
        const dir = c.clone().sub(point).normalize();
        if (!Number.isFinite(dir.x)) dir.set(0, 1, 0);
        const v = dir.multiplyScalar(8 + 10 * (1 - d / radius)).add(new THREE.Vector3(0, 6, 0));
        scene.add(mesh);
        debris.push({ mesh, v, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(8), life: 2 });
      }
      return count;
    },

    update(dt) {
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life -= dt;
        d.v.y -= CONFIG.gravity * dt;
        d.mesh.position.addScaledVector(d.v, dt);
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;
        d.mesh.scale.setScalar(Math.max(0.01, Math.min(1, d.life)));
        if (d.life <= 0) {
          scene.remove(d.mesh);
          debris.splice(i, 1);
        }
      }
    },
  };
  return api;
}
