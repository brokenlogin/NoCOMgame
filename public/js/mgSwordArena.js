// Sword Arena: everyone gets a sword in a walled arena. Die or fall out and you're out.
// Last one standing wins.
//
// Sword hits work like knockback: the attacker decides the hit and sends
//   { kind: 'swordHit', target, dmg }
// and the target applies the damage to themselves.

import { addBox } from './mgShared.js';
import { registerItem } from './items.js';

const ARENA = { x: -140, y: 20, z: -80, w: 22, d: 22 };
const WALL_H = 3.5;
const SWORD_DAMAGE = 20;

export function createSwordArena(game) {
  const { net, remotes } = game;

  // Sandy floor, stone walls you can't walk through, and a couple of pillars to hide behind
  addBox(game, { ...ARENA, top: ARENA.y, h: 1.5, color: 0xc8b07a });
  const t = 0.6;
  for (const [dx, dz, w, d] of [
    [0, -ARENA.d / 2 - t / 2, ARENA.w + t * 2, t],
    [0, ARENA.d / 2 + t / 2, ARENA.w + t * 2, t],
    [-ARENA.w / 2 - t / 2, 0, t, ARENA.d],
    [ARENA.w / 2 + t / 2, 0, t, ARENA.d],
  ]) {
    addBox(game, { x: ARENA.x + dx, top: ARENA.y + WALL_H, z: ARENA.z + dz, w, d, h: WALL_H + 1.5, color: 0x7d7468, collider: false, solid: true });
  }
  for (const [dx, dz] of [[-4, -4], [4, 4]]) {
    addBox(game, { x: ARENA.x + dx, top: ARENA.y + 4, z: ARENA.z + dz, w: 1.4, d: 1.4, h: 4, color: 0x8f8579, collider: false, solid: true });
  }

  registerItem({
    id: 'sword',
    name: 'Sword',
    icon: '🗡️',
    description: `Slash for ${SWORD_DAMAGE} damage and a small shove. Handed out in the Sword Arena.`,
    cooldown: 0.45,
    anim: 'swing',
    use({ combat, origin, dir, flatDir }) {
      for (const { player } of combat.playersInCone(origin, dir, 3.2, 50)) {
        net.sendEvent({ kind: 'swordHit', target: player.id, dmg: SWORD_DAMAGE });
        combat.knockback(player.id, [flatDir.x * 9, 4, flatDir.z * 9]);
      }
    },
  });

  net.on('event', (msg) => {
    if (msg.kind !== 'swordHit' || msg.target !== net.id || !game.player) return;
    const dmg = Math.min(Number(msg.dmg) || 0, 35);
    const by = remotes.players.get(msg.from)?.name || 'someone';
    game.player.takeDamage(dmg, by);
  });

  let gaveSword = false;

  return {
    id: 'sword',
    name: 'Sword Arena',
    icon: '⚔️',
    color: 0xd9dde3,
    arena: ARENA,

    spawnPoint(i, n) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return [ARENA.x + Math.cos(a) * 8, ARENA.y + 0.5, ARENA.z + Math.sin(a) * 8];
    },

    start({ meIn }) {
      gaveSword = false;
      if (!meIn) return;
      const inv = game.inventory;
      if (!inv.has('sword')) {
        inv.add({ id: 'sword', name: 'Sword', icon: '🗡️', maxStack: 1, count: 1 });
        gaveSword = true;
      }
      const slot = inv.slots.findIndex((s) => s?.id === 'sword');
      if (slot >= 0) inv.select(slot);
    },

    update() {},

    hud() {
      return 'left click to slash';
    },

    stop() {
      if (gaveSword) game.inventory.remove('sword', 1);
      gaveSword = false;
    },
  };
}
