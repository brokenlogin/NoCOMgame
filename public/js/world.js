import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createTerrain } from './terrain.js';
import { createStructures } from './structures.js';

// Builds the scene: sky, lights, generated terrain, roof, and structures.
// `colliders` is a list of meshes the player can stand on (add yours here!).
// `solidBoxes` is a list of THREE.Box3 the player can't walk through (add yours here too!).
export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9b4c2);
  scene.fog = new THREE.Fog(0xa9b4c2, 45, 145); // ends before the edge of the loaded chunks

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2);
  scene.add(hemi);
  // Soft light from below so the underside of the roof isn't pitch black
  const bounce = new THREE.DirectionalLight(0xbfd0a0, 0.9);
  bounce.position.set(-20, -50, -10);
  scene.add(bounce);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.camera.layers.enableAll(); // so the local player's hidden body still casts a shadow
  sun.shadow.mapSize.set(2048, 2048);
  const s = 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 150 });
  scene.add(sun);
  scene.add(sun.target);

  // Endless generated ground + roof + structures, streamed in chunks around the player
  // (regenerated per room, see `generate`; call `update(position)` every frame)
  const colliders = [];
  const solidBoxes = [];
  const terrain = createTerrain(scene, colliders);
  const structures = createStructures(scene, colliders, solidBoxes);
  terrain.onChunkLoad = (cx, cz) => structures.loadChunk(cx, cz);
  terrain.onChunkUnload = (cx, cz) => structures.unloadChunk(cx, cz);

  const world = {
    scene,
    sun,
    terrain,
    structures,
    colliders,
    solidBoxes,
    // Same seed => same world, so everyone in a room sees the same thing
    generate(seed) {
      structures.generate(seed, terrain);
      terrain.generate(seed);
    },
    // Load/unload terrain chunks around `focus` (a position)
    update(focus) {
      terrain.update(focus);
    },
    // Hide/show the ground, roof and buildings (space.js hides them while you're in space).
    // Hidden things are still solid.
    setLandVisible(visible) {
      terrain.landVisible = visible;
      for (const c of terrain.chunks.values()) c.ground.visible = c.roof.visible = visible;
      structures.group.visible = visible;
    },
    // Keep the shadow camera centered on the local player
    followShadow(target) {
      sun.position.set(target.x + 30, target.y + 50, target.z + 20);
      sun.target.position.copy(target);
    },
  };
  world.generate(1);
  return world;
}
