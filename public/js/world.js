import * as THREE from 'three';
import { CONFIG } from './config.js';

// Builds the scene: sky, lights, and flat grey terrain.
// `colliders` is a list of meshes the player can stand on (add yours here!).
export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9b4c2);
  scene.fog = new THREE.Fog(0xa9b4c2, 60, 180);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 150 });
  scene.add(sun);
  scene.add(sun.target);

  // Flat grey terrain
  const size = CONFIG.terrainSize;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // Subtle grid so you can see yourself move
  const grid = new THREE.GridHelper(size, size / 2, 0x6a6a6a, 0x747474);
  grid.position.y = 0.01;
  scene.add(grid);

  return {
    scene,
    sun,
    colliders: [ground],
    // Keep the shadow camera centered on the local player
    followShadow(target) {
      sun.position.set(target.x + 30, target.y + 50, target.z + 20);
      sun.target.position.copy(target);
    },
  };
}
