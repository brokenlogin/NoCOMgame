import * as THREE from 'three';
import { CONFIG } from './config.js';

// Visual capsule character. The group's origin sits at the player's feet.
export function createCapsuleMesh(color = 0xffffff, name = '') {
  const r = CONFIG.playerRadius;
  const length = CONFIG.playerHeight - 2 * r;

  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, length, 8, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
  );
  body.position.y = CONFIG.playerHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Visor so you can tell which way a capsule is facing (-Z is forward)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(r * 1.2, r * 0.35, r * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2, metalness: 0.5 })
  );
  visor.position.set(0, CONFIG.playerHeight * 0.75, -r * 0.85);
  visor.castShadow = true;
  group.add(visor);

  if (name) group.add(createNameTag(name));

  group.userData.body = body;
  return group;
}

function createNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 12);
  ctx.fill();
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = CONFIG.playerHeight + 0.5;
  return sprite;
}
