// Helpers shared by the minigame lobby and the minigames.

// A box whose top surface is at `top`. Adds it to colliders (stand on it) and,
// if `solid`, to solidBoxes (can't walk through it).
export function addBox(game, { x, top, z, w, d, h = 1, color, collider = true, solid = false }) {
  const { THREE, scene, world } = game;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.position.set(x, top - h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collider) world.colliders.push(mesh);
  if (solid) {
    mesh.updateMatrixWorld();
    world.solidBoxes.push(new THREE.Box3().setFromObject(mesh));
  }
  return mesh;
}

// Flat sign with text, facing +Z unless rotated
export function makeSign(game, text, { color = '#ffffff', bg = 'rgba(20,22,27,0.85)', width = 6, height = 1.5 } = {}) {
  const { THREE } = game;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = canvas.height * 0.6;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > canvas.width * 0.92 && size > 10) {
    size -= 2;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  game.scene.add(mesh);
  return mesh;
}

// Is a feet position standing inside a rectangular area whose floor is at area.y?
export function inArea(p, area, margin = 0.5) {
  return (
    Math.abs(p.x - area.x) <= area.w / 2 + margin &&
    Math.abs(p.z - area.z) <= area.d / 2 + margin &&
    p.y > area.y - 1 &&
    p.y < area.y + 8
  );
}

// Small seeded RNG so every client simulates the same thing from the same seed
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Put the local player somewhere, cancelling momentum and gravity flips
export function teleport(player, x, y, z) {
  player.position.set(x, y, z);
  player.velocity.set(0, 0, 0);
  player.gravityDir = -1;
  player.launched = false;
  player.knockbackTime = 0;
  player.onGround = false;
}

// Item lock: while any registered check returns true, item hotkeys (Y dynamite, I black hole,
// G gravity flip, 1-9 hotbar) do nothing and the item spawner is hidden from the Tab inventory.
const lockChecks = [];
export function addItemLock(game, check) {
  lockChecks.push(check);
  if (lockChecks.length > 1) return; // already set up
  const locked = () => !!game.player && lockChecks.some((f) => f());

  // Swallow the keys before the game sees them
  const BLOCKED_KEYS = /^(KeyY|KeyI|KeyG|Digit[1-9])$/;
  window.addEventListener('keydown', (e) => {
    if (locked() && BLOCKED_KEYS.test(e.code)) e.stopImmediatePropagation();
  }, true);

  const inv = game.inventory;
  const parts = [inv.spawnerGrid, inv.spawnerGrid.previousElementSibling, inv.spawnerGrid.nextElementSibling];
  const spawnerClick = inv.spawnerClick.bind(inv);
  inv.spawnerClick = (...args) => (locked() ? undefined : spawnerClick(...args));
  let hidden = false;
  game.addSystem(() => {
    const h = locked();
    if (h === hidden) return;
    hidden = h;
    for (const el of parts) if (el) el.style.display = h ? 'none' : '';
  });
}
