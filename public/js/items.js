// Usable items. No health in this game: everything is about knockback.
//
// Add your own with registerItem({...}) and it shows up in the Tab item spawner:
//   id, name, icon (emoji or image URL), description, maxStack (1 for tools)
//   cooldown: seconds between uses
//   use(ctx):      called on left-click (once per click, respecting cooldown)
//   hold(ctx, dt, state): called every frame while left mouse is held (instead of use);
//                  `state` is a scratch object that persists between calls
//   anim:          'swing' | 'recoil' | 'blow' viewmodel animation
// ctx = { game, combat, player, item, origin, dir, flatDir }
//   origin/dir: your eye position and look direction; flatDir: look direction with no up/down

export const ITEMS = new Map();
let refreshSpawner = () => {};

export function registerItem(def) {
  ITEMS.set(def.id, { maxStack: 1, cooldown: 0.3, anim: 'swing', ...def });
  refreshSpawner(); // items registered after startup still show up
}

// Horizontal push along `dir`, plus lift
function launch(dir, power, lift) {
  return [dir.x * power, lift, dir.z * power];
}

registerItem({
  id: 'bat',
  name: 'Baseball Bat',
  icon: '🏏',
  description: 'Home run. Huge knockback, short range.',
  cooldown: 0.6,
  use({ combat, origin, dir, flatDir }) {
    for (const { player } of combat.playersInCone(origin, dir, 3, 55)) {
      combat.knockback(player.id, launch(flatDir, 32, 11));
    }
  },
});

registerItem({
  id: 'potato-cannon',
  name: 'Potato Cannon',
  icon: '🔫',
  description: 'Fires potatoes. Lots of knockback at range.',
  cooldown: 0.8,
  anim: 'recoil',
  use({ combat, player, origin, dir }) {
    const p = origin.clone().addScaledVector(dir, 0.8);
    const speed = 38;
    combat.spawnProjectile({
      type: 'potato',
      p: p.toArray(),
      v: [dir.x * speed, dir.y * speed + 2, dir.z * speed],
      gravity: 12,
      radius: 0.25,
      onHit(target, vel) {
        vel.y = 0;
        vel.normalize();
        combat.knockback(target.id, launch(vel, 28, 9));
      },
    });
    // A bit of recoil
    player.velocity.x -= dir.x * 3;
    player.velocity.z -= dir.z * 3;
  },
});

registerItem({
  id: 'boxing-glove',
  name: 'Boxing Glove',
  icon: '🥊',
  description: 'Fast jabs, medium knockback.',
  cooldown: 0.25,
  use({ combat, origin, dir, flatDir }) {
    for (const { player } of combat.playersInCone(origin, dir, 2.6, 45)) {
      combat.knockback(player.id, launch(flatDir, 12, 5));
    }
  },
});

registerItem({
  id: 'leaf-blower',
  name: 'Leaf Blower',
  icon: '🌬️',
  description: 'Hold to blow people away. Constant push.',
  anim: 'blow',
  hold({ combat, origin, dir, flatDir }, dt, state) {
    state.tick = (state.tick ?? 0) - dt;
    if (state.tick > 0) return;
    state.tick = 0.15;
    for (const { player, dist } of combat.playersInCone(origin, dir, 10, 25)) {
      const power = 6 * (1 - dist / 14);
      combat.knockback(player.id, launch(flatDir, power, 0.5));
    }
  },
});

registerItem({
  id: 'air-horn',
  name: 'Air Horn',
  icon: '📯',
  description: 'Blasts everyone around you away. Long cooldown.',
  cooldown: 3,
  anim: 'recoil',
  use({ game, combat, player }) {
    const center = player.position.clone().setY(player.position.y + 1);
    const R = 8;
    for (const { player: rp, dist } of combat.playersInRadius(center, R)) {
      const away = combat.bodyCenter(rp).sub(center).setY(0);
      if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      const power = 24 * (1 - (dist / R) * 0.5);
      combat.knockback(rp.id, launch(away, power, 10));
    }
    game.chat('HOOONK', true);
  },
});

registerItem({
  id: 'plunger',
  name: 'Plunger',
  icon: '🪠',
  description: 'Yanks someone toward you from far away.',
  cooldown: 1.2,
  use({ combat, player, origin, dir }) {
    const hit = combat.playersInCone(origin, dir, 18, 10)[0];
    if (!hit) return;
    const toMe = player.position.clone().sub(hit.player.mesh.position).setY(0);
    const dist = toMe.length();
    toMe.normalize();
    combat.knockback(hit.player.id, launch(toMe, Math.min(dist * 2.2, 30), 7));
  },
});

// Wires items to the mouse and shows the held item on screen
export function setupItems(game) {
  const { inventory, input, combat, THREE } = game;
  refreshSpawner = () =>
    inventory.setSpawnerItems(
      [...ITEMS.values()].map(({ id, name, icon, description, maxStack }) => ({ id, name, icon, description, maxStack }))
    );
  refreshSpawner();

  const viewmodel = document.createElement('div');
  viewmodel.id = 'viewmodel';
  document.getElementById('hud').appendChild(viewmodel);

  const cooldowns = new Map(); // item id -> time left
  const holdState = new Map(); // item id -> scratch state for hold items
  let shownId = null;

  function playAnim(name) {
    viewmodel.classList.remove('swing', 'recoil');
    void viewmodel.offsetWidth; // restart the CSS animation
    if (name && name !== 'blow') viewmodel.classList.add(name);
  }

  game.addSystem((dt) => {
    for (const [id, t] of cooldowns) cooldowns.set(id, Math.max(0, t - dt));

    const item = inventory.getSelected();
    const def = item && ITEMS.get(item.id);

    // Viewmodel
    const showId = inventory.isOpen ? null : item?.id ?? null;
    if (showId !== shownId) {
      shownId = showId;
      viewmodel.textContent = showId ? item.icon ?? '' : '';
      viewmodel.className = '';
    }

    if (!def || inventory.isOpen) {
      input.consumePressed(0);
      return;
    }

    const { origin, dir } = combat.aim();
    const flatDir = new THREE.Vector3(dir.x, 0, dir.z);
    if (flatDir.lengthSq() < 1e-6) flatDir.set(-Math.sin(game.player.yaw), 0, -Math.cos(game.player.yaw));
    flatDir.normalize();
    const ctx = { game, combat, player: game.player, item, origin, dir, flatDir };

    if (def.hold) {
      const holding = input.isMouseDown(0);
      viewmodel.classList.toggle('blow', holding);
      if (!holdState.has(def.id)) holdState.set(def.id, {});
      if (holding) def.hold(ctx, dt, holdState.get(def.id));
      input.consumePressed(0);
      return;
    }

    if (input.consumePressed(0) && !(cooldowns.get(def.id) > 0)) {
      cooldowns.set(def.id, def.cooldown);
      playAnim(def.anim);
      try {
        def.use(ctx);
      } catch (err) {
        console.error(`[items] ${def.id} use() threw`, err);
      }
    }
  });
}
