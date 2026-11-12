// Places where your own items don't come with you, in both Creative and Survival:
//   the minigame lobby and arenas (both minigame voids, including the Solo Arcade) while the
//     lobby's items switch says "Only minigame items" (on "All items" you keep your stuff there),
//   space (Station NoCOM and every sector), and the Realm of Embervale.
// Walk in and your inventory is packed away; walk out (or respawn on the map) and you get it
// back exactly as it was. The games there still hand out their own things (minigame items,
// ship lasers, the boarding blaster...). While you're inside, the free dynamite (Y) and black
// hole (I) keys do nothing and the Tab item spawner is hidden.

const MINIGAME_VOIDS = [
  { x0: -226, x1: -116, z0: -176, z1: 176 }, // lobby + first arenas (minigames.js)
  { x0: -1130, x1: -730, z0: -430, z1: 430 }, // new arenas + Solo Arcade (mgKit.js)
];
const inBox = (p, b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;

export function setupItemFreeZones(game) {
  const inv = game.inventory;
  const zones = [
    (p) => MINIGAME_VOIDS.some((b) => inBox(p, b)) && !game.minigames?.ownItemsAllowed?.(),
    (p) => !!game.space?.inZone?.(p),
    (p) => !!game.dnd?.realm?.inRealm(p),
  ];
  let stash = null; // { slots, selected } while you're inside
  let inside = false;
  const isInside = () => !!game.player && zones.some((f) => f(game.player.position));

  // No free grenades from hotkeys, no spawner
  window.addEventListener('keydown', (e) => {
    if (inside && (e.code === 'KeyY' || e.code === 'KeyI')) e.stopImmediatePropagation();
  }, true);
  const spawnerClick = inv.spawnerClick.bind(inv);
  inv.spawnerClick = (...args) => (inside ? undefined : spawnerClick(...args));
  const spawnerParts = () => [inv.spawnerGrid, inv.spawnerGrid?.previousElementSibling, inv.spawnerGrid?.nextElementSibling];

  let owner = null;
  game.addSystem(() => {
    if (game.player !== owner) {
      // New game: forget anything packed from the last one
      owner = game.player;
      stash = null;
    }
    const now = isInside();
    if (now && !stash) {
      stash = { slots: inv.slots.map((s) => s && { ...s }), selected: inv.selected };
      inv.held = null;
      inv.clear();
      inv.changed();
      if (stash.slots.some(Boolean)) game.chat('🎒 Your items are packed away here. You get them back when you leave.', true);
    } else if (!now && stash) {
      inv.held = null;
      stash.slots.forEach((s, i) => (inv.slots[i] = s && { ...s }));
      inv.select(stash.selected);
      inv.changed();
      stash = null;
    }
    if (now !== inside) {
      inside = now;
      for (const el of spawnerParts()) if (el) el.style.display = inside ? 'none' : '';
    }
    if (inside) for (const el of spawnerParts()) if (el && el.style.display !== 'none') el.style.display = 'none';
  });

  return { get inside() { return inside; } };
}
