// Usable items. No health in this game: everything is about knockback.
//
// Add your own with registerItem({...}) and it shows up in the Tab item spawner:
//   id, name, icon (emoji or image URL), description, maxStack (1 for tools)
//   cooldown: seconds between uses
//   use(ctx):      called on left-click (once per click, respecting cooldown);
//                  return false if nothing happened and the cooldown shouldn't start
//   hold(ctx, dt, state): called every frame while left mouse is held (instead of use);
//                  `state` is a scratch object that persists between calls
//   altUse(ctx):   called on right-click
//   wheel(ctx, deltaY): mouse wheel while selected; return true to stop it switching hotbar slots
//   onDeselect(ctx): called when you switch to a different hotbar slot
//   anim:          'swing' | 'recoil' | 'blow' viewmodel animation
//   model(THREE):  optional 3D model for the icon and held view (grip at origin, forward -Z);
//                  see itemModels.js. Without one, the emoji `icon` is used.
// ctx = { game, combat, player, item, origin, dir, flatDir }
//   origin/dir: your eye position and look direction; flatDir: look direction with no up/down

import { registerItemModel, getItemIcon } from './itemModels.js';
import './moreItemModels.js'; // models for the OP / funny / sorry items
import './evenMoreItemModels.js'; // models for the evenMoreOpItems.js items
import { setIconResolver, setDescriptionResolver } from './inventory.js';
import { Viewmodel } from './viewmodel.js';

export const ITEMS = new Map();

// Things that stop you using items right now (e.g. the minigame lobby safe zone).
// Each is () => falsy, or a short reason string shown in chat when you try anyway.
const itemBlockers = [];
export function addItemBlocker(check) {
  itemBlockers.push(check);
}
function itemsBlocked() {
  for (const f of itemBlockers) {
    try {
      const r = f();
      if (r) return r;
    } catch {}
  }
  return null;
}
let refreshSpawner = () => {};

export function registerItem(def) {
  if (typeof def.model === 'function') registerItemModel(def.id, def.model);
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
  description: 'Home run. Huge knockback, decent reach.',
  cooldown: 0.6,
  use({ combat, origin, dir, flatDir }) {
    for (const { player } of combat.playersInCone(origin, dir, 5, 55)) {
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

registerItem({
  id: 'medkit',
  name: 'Medkit',
  icon: '🩹',
  description: 'Heals 40 health. 4 second cooldown.',
  cooldown: 4,
  anim: 'recoil',
  use({ game, player }) {
    const max = game.CONFIG.maxHealth;
    if (player.health >= max) {
      game.chat('Already at full health.', true);
      return false; // don't waste the cooldown
    }
    const healed = Math.min(40, max - player.health);
    player.health += healed;
    healFlash();
    game.chat(`🩹 +${Math.round(healed)} health`, true);
  },
});

// Quick green glow around the screen when you heal
let healEl = null;
function healFlash() {
  if (!healEl) {
    healEl = document.createElement('div');
    Object.assign(healEl.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0',
      boxShadow: 'inset 0 0 140px 40px rgba(76, 217, 100, 0.6)', transition: 'opacity 0.6s',
    });
    document.getElementById('hud').appendChild(healEl);
  }
  healEl.style.transition = 'none';
  healEl.style.opacity = '1';
  requestAnimationFrame(() => {
    healEl.style.transition = 'opacity 0.6s';
    healEl.style.opacity = '0';
  });
}

// Wires items to the mouse and shows the held item on screen
export function setupItems(game) {
  const { inventory, input, combat, THREE } = game;
  // Inventory slots show a rendered 3D icon when the item has a model
  setIconResolver((item) => getItemIcon(item.id));
  setDescriptionResolver((item) => ITEMS.get(item.id)?.description);
  inventory.render();
  refreshSpawner = () =>
    inventory.setSpawnerItems(
      [...ITEMS.values()].map(({ id, name, icon, description, maxStack }) => ({ id, name, icon, description, maxStack }))
    );
  refreshSpawner();

  // The item in your hand (3D, drawn on top of the world after the main render)
  const viewmodel = new Viewmodel(game);
  game.viewmodel = viewmodel;
  game.addOverlay?.((renderer, dt) => {
    if (!game.player) return viewmodel.show(null);
    viewmodel.update(dt);
    viewmodel.render(renderer);
  });

  const cooldowns = new Map(); // item id -> time left
  const holdState = new Map(); // item id -> scratch state for hold items

  function playAnim(name) {
    viewmodel.play(name);
  }

  function makeCtx(item) {
    const { origin, dir } = combat.aim();
    const flatDir = new THREE.Vector3(dir.x, 0, dir.z);
    if (flatDir.lengthSq() < 1e-6) flatDir.set(-Math.sin(game.player.yaw), 0, -Math.cos(game.player.yaw));
    flatDir.normalize();
    return { game, combat, player: game.player, item, origin, dir, flatDir };
  }

  function call(def, fn, ...args) {
    try {
      return def[fn]?.(...args);
    } catch (err) {
      console.error(`[items] ${def.id} ${fn}() threw`, err);
    }
  }

  // Mouse wheel: the selected item gets first dibs (return true to stop the hotbar scrolling)
  game.itemWheel = (deltaY) => {
    const item = inventory.getSelected();
    const def = item && ITEMS.get(item.id);
    if (!def?.wheel || !game.player || inventory.isOpen) return false;
    return !!call(def, 'wheel', makeCtx(item), deltaY);
  };

  let prevDef = null;
  let lastBlockedMsg = 0;

  game.addSystem((dt) => {
    for (const [id, t] of cooldowns) cooldowns.set(id, Math.max(0, t - dt));

    const item = inventory.getSelected();
    const def = item && ITEMS.get(item.id);

    // Switched away from an item
    if (prevDef && prevDef !== def) call(prevDef, 'onDeselect', makeCtx(null));
    prevDef = def || null;

    // Held item (hidden while the inventory is open)
    viewmodel.show(inventory.isOpen ? null : item);

    if (!def || inventory.isOpen) {
      viewmodel.setBlowing(false);
      input.consumePressed(0);
      input.consumePressed(2);
      return;
    }

    // Not allowed to use items here? Swallow the clicks and say why (at most every 3s)
    const blocked = itemsBlocked();
    if (blocked) {
      viewmodel.setBlowing(false);
      const tried = input.consumePressed(0) | input.consumePressed(2) | input.isMouseDown(0);
      if (tried && performance.now() - lastBlockedMsg > 3000) {
        lastBlockedMsg = performance.now();
        game.chat(blocked, true);
      }
      return;
    }

    const ctx = makeCtx(item);

    // Right click
    if (input.consumePressed(2) && def.altUse) call(def, 'altUse', ctx);

    if (def.hold) {
      const holding = input.isMouseDown(0);
      viewmodel.setBlowing(holding);
      if (!holdState.has(def.id)) holdState.set(def.id, {});
      if (holding) call(def, 'hold', ctx, dt, holdState.get(def.id));
      input.consumePressed(0);
      return;
    }

    if (input.consumePressed(0) && !(cooldowns.get(def.id) > 0)) {
      cooldowns.set(def.id, def.cooldown);
      // use() can return false to say "didn't do anything": no cooldown, no animation
      if (call(def, 'use', ctx) === false) cooldowns.set(def.id, 0);
      else playAnim(def.anim);
    }
  });
}
