import { createItemModel } from './itemModels.js';

// Shows the item each player is holding in their character's right hand.
// You send your selected hotbar item as `hi` in your player state; everyone else's
// character gets that item's 3D model (itemModels.js) in its hand, arm raised forward.

const ARM_RAISE = 1.15; // radians the holding arm is lifted forward (see animateCharacter)

export function setupHeldItems(game) {
  const { CONFIG } = game;
  const shown = new Map(); // player id -> { id, model, grip }

  function dispose(entry) {
    entry.grip.parent?.remove(entry.grip);
    entry.model?.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  game.addSystem((dt, game) => {
    // ---- Tell everyone what you're holding ----
    const player = game.player;
    const item = game.inventory.getSelected();
    if (item) player.extraState.hi = item.id;
    else delete player.extraState.hi;

    // ---- Put other players' items in their hands ----
    for (const [pid, entry] of shown) {
      if (!game.remotes.players.has(pid)) {
        dispose(entry);
        shown.delete(pid);
      }
    }
    for (const rp of game.remotes.players.values()) {
      const rig = rp.mesh.userData.rig;
      if (!rig) continue;
      // They swung / chopped: play it on their character (capsule.js animates rig.swing)
      const sw = rp.state?.sw;
      if (sw !== undefined && sw !== rig.lastSw) {
        if (rig.lastSw !== undefined) rig.swing = { t: 0, d: Math.min(1, Math.max(0.15, +rp.state.swd || 0.32)), kind: rp.state.swk };
        rig.lastSw = sw;
      }
      const want = typeof rp.state?.hi === 'string' ? rp.state.hi : null;
      const cur = shown.get(rp.id);
      if ((cur?.id ?? null) === want) continue;

      if (cur) dispose(cur);
      shown.delete(rp.id);
      rig.holding = false;
      if (!want) continue;

      const model = createItemModel(want);
      if (!model) continue; // no 3D model for that item
      // Grip sits at the right glove; tilt it back so the item points forward while the arm is raised
      const grip = new game.THREE.Group();
      grip.rotation.x = -ARM_RAISE;
      grip.add(model);
      if (rig.hands?.[1]) {
        // In the right glove (follows the elbow when the arm chops)
        grip.position.set(0, -0.07, 0);
        rig.hands[1].add(grip);
      } else {
        const s = CONFIG.playerHeight / 2;
        grip.position.set(0.02 * s, -0.55 * s, 0);
        rig.arms[1].add(grip); // arms = [left, right]
      }
      rig.holding = true;
      shown.set(rp.id, { id: want, model, grip });
    }
  });

  // Leaving the room: drop everything
  game.net.on('close', () => {
    for (const entry of shown.values()) dispose(entry);
    shown.clear();
  });
}

export { ARM_RAISE };
