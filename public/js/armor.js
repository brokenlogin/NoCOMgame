import * as THREE from 'three';
import { registerItem } from './items.js';
import { registerItemModel } from './itemModels.js';
import { LocalPlayer } from './player.js';

// Armor: one chest piece per material. Having it in your inventory (hotbar or backpack) means
// you're wearing it; only your best piece counts. It cuts the damage you take; knockback
// is unchanged. Survival recipes are in survival.js (CUSTOM_RECIPES), priced like pickaxes.
//
//   player.damageResist  0..1, worked out from your inventory whenever it's read (used by takeDamage)

export const ARMOR = [
  { id: 'armor-stone', name: 'Stone Armor', resist: 0.2, color: 0x8c8a86, trim: 0x5a5854, rough: 1, metal: 0, flat: true },
  { id: 'armor-iron', name: 'Iron Armor', resist: 0.4, color: 0xd6dbe2, trim: 0x8a929c, rough: 0.32, metal: 0.5 },
  { id: 'armor-gold', name: 'Gold Armor', resist: 0.6, color: 0xf2c440, trim: 0xb8862a, rough: 0.28, metal: 0.5, emissive: 0x3a2800 },
];

for (const a of ARMOR) {
  registerItem({
    id: a.id,
    name: a.name,
    icon: '🛡️',
    description: `Takes ${Math.round(a.resist * 100)}% off all damage while it's in your inventory (only your best armor counts).`,
    maxStack: 1,
    use: () => false, // nothing to click: carrying it is wearing it
  });
  registerItemModel(a.id, () => buildChestplate(a));
}

// A chestplate: rounded breastplate, shoulder guards, belt, trim
function buildChestplate(a) {
  const g = new THREE.Group();
  const plate = new THREE.MeshStandardMaterial({ color: a.color, roughness: a.rough, metalness: a.metal, flatShading: !!a.flat, emissive: a.emissive || 0x000000 });
  const trim = new THREE.MeshStandardMaterial({ color: a.trim, roughness: 0.5, metalness: a.metal * 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.9 });
  const body = new THREE.Group();
  body.position.set(0, 0.16, -0.05);
  // Breastplate: a squashed half-cylinder facing forward
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.32, 20, 1, false, -Math.PI / 2, Math.PI), plate);
  chest.rotation.y = Math.PI;
  chest.scale.z = 0.6;
  body.add(chest);
  // Back plate
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.135, 0.3, 20, 1, false, -Math.PI / 2, Math.PI), trim);
  back.scale.z = 0.45;
  body.add(back);
  // Center ridge and collar
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.3, 0.03), trim);
  ridge.position.set(0, 0, -0.1);
  body.add(ridge);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI), trim);
  collar.position.set(0, 0.16, -0.02);
  collar.rotation.x = -Math.PI / 2 + 0.3;
  body.add(collar);
  // Shoulder guards
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate);
    pad.position.set(s * 0.17, 0.13, 0);
    pad.scale.set(1, 0.7, 1.1);
    pad.rotation.z = -s * 0.5;
    body.add(pad);
  }
  // Belt with a buckle
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.035, 20, 1, true), strap);
  belt.position.y = -0.15;
  belt.scale.z = 0.62;
  body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.012), trim);
  buckle.position.set(0, -0.15, -0.09);
  body.add(buckle);
  body.rotation.y = Math.PI + 0.35; // show the front in first person
  g.add(body);
  return g;
}

export function setupArmor(game) {
  const { inventory } = game;
  const bestArmor = () => {
    let best = null;
    for (const a of ARMOR) if (inventory.has(a.id) && (!best || a.resist > best.resist)) best = a;
    return best;
  };
  // Always up to date, no waiting for the next frame after you pick armor up or drop it
  Object.defineProperty(LocalPlayer.prototype, 'damageResist', {
    configurable: true,
    get: () => bestArmor()?.resist || 0,
  });

  // HUD: a small shield badge next to the health bar
  const badge = document.createElement('div');
  badge.id = 'armor-badge';
  badge.className = 'hidden';
  document.getElementById('hud').appendChild(badge);

  let shown = null;
  game.addSystem((dt, game) => {
    const best = bestArmor();
    game.player.extraState.ar = best ? ARMOR.indexOf(best) + 1 : undefined; // others could show it
    if (best !== shown) {
      shown = best;
      badge.classList.toggle('hidden', !best);
      if (best) badge.textContent = `🛡️ ${Math.round(best.resist * 100)}%`;
      if (best) badge.title = `${best.name}: ${Math.round(best.resist * 100)}% less damage`;
    }
  });
  game.net.on('close', () => badge.classList.add('hidden'));
}
