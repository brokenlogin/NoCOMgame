// Parkour course that runs off the east edge of the main map (+X) to a finish platform.
// Fall off and you go back to your last checkpoint. Finishing posts your time to everyone.
//
// Jump math with the default CONFIG: ~1.3m max rise, ~6m gap when sprinting.
// If someone changes jump/gravity/speed, some of these gaps may get harder (or easier). Chaos!

import { shrinkVisual } from './mgShared.js';

const EDGE = 100; // east edge of the 200x200 terrain

// [centerX, topY, centerZ, width(x), depth(z), kind]
const PLATFORMS = [
  [103, 0.0, 0, 6, 6, 'start'],
  [109, 0.5, 0, 3, 3],
  [113.5, 1.2, 2, 2.5, 2.5],
  [118, 1.8, -1, 2.5, 2.5],
  [122.5, 2.2, -4, 2, 2],
  [127, 2.8, -4, 2, 2, 'checkpoint'],
  [133, 2.8, -4, 6, 0.8], // narrow beam
  [139.5, 3.5, -1, 2, 2],
  [143, 4.2, 2, 2, 2],
  [147.5, 4.0, 5, 1.5, 1.5, 'checkpoint'],
  [152, 4.6, 5, 1.5, 1.5], // sprint for this one
  [157, 5.3, 2, 2, 2],
  [161.5, 6.0, -1, 2, 2],
  [168, 6.5, -1, 6, 6, 'finish'],
];

const THICKNESS = 0.5;
const FALL_Y = -8; // below this while off the map = back to checkpoint

export function addParkour(game) {
  const { THREE, scene, world } = game;
  const pads = [];

  PLATFORMS.forEach(([x, y, z, w, d, kind], i) => {
    const color =
      kind === 'start' ? 0x3a86ff :
      kind === 'checkpoint' ? 0x2ec46b :
      kind === 'finish' ? 0xffc23a :
      new THREE.Color().setHSL((i / PLATFORMS.length) * 0.8, 0.65, 0.55);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, THICKNESS, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    mesh.position.set(x, y - THICKNESS / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `parkour-${i}`;
    scene.add(mesh);
    shrinkVisual(mesh, w, d); // drawn a bit smaller than the hitbox (see mgShared.js)
    world.colliders.push(mesh);
    pads.push({ x, y, z, w, d, kind, index: i });
  });

  // Beacon over the finish so you can see where you're headed
  const finish = pads[pads.length - 1];
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd966, transparent: true, opacity: 0.25, depthWrite: false })
  );
  beacon.position.set(finish.x, finish.y + 30, finish.z);
  scene.add(beacon);

  // Arch on the finish pad
  const archMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc23a, emissiveIntensity: 0.6 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 0.3), archMat);
    post.position.set(finish.x - 2, finish.y + 1.75, finish.z + side * 2.2);
    post.castShadow = true;
    scene.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.7), archMat);
  bar.position.set(finish.x - 2, finish.y + 3.5, finish.z);
  scene.add(bar);

  // Arrows on the main map pointing at the course
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3a86ff });
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(1.5, 0);
  arrowShape.lineTo(-1, 1.2);
  arrowShape.lineTo(-0.4, 0);
  arrowShape.lineTo(-1, -1.2);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  for (let ax = EDGE - 20; ax < EDGE; ax += 5) {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(ax, 0.02, 0);
    scene.add(arrow);
  }

  // Timer HUD
  const timerEl = document.createElement('div');
  Object.assign(timerEl.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
    padding: '6px 14px', borderRadius: '8px', background: 'rgba(20,22,27,0.75)',
    font: '600 18px system-ui, sans-serif', color: '#ffd966', display: 'none', pointerEvents: 'none',
  });
  document.getElementById('hud').appendChild(timerEl);

  // Per-player run state, reset when a new LocalPlayer is created
  let owner = null;
  let checkpoint = pads[0];
  let running = false;
  let startTime = 0;
  let best = Infinity;

  function padUnder(p) {
    for (const pad of pads) {
      if (
        Math.abs(p.x - pad.x) <= pad.w / 2 + 0.05 &&
        Math.abs(p.z - pad.z) <= pad.d / 2 + 0.05 &&
        Math.abs(p.y - pad.y) < 0.1
      ) return pad;
    }
    return null;
  }

  game.addSystem((dt, game) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      checkpoint = pads[0];
      running = false;
      timerEl.style.display = 'none';
    }
    const p = player.position;
    const now = performance.now();

    const pad = player.onGround ? padUnder(p) : null;
    if (pad) {
      if (pad.kind === 'start') {
        running = false;
        checkpoint = pad;
        timerEl.style.display = 'block';
        timerEl.textContent = best < Infinity ? `Parkour · best ${best.toFixed(2)}s` : 'Parkour · go!';
      } else if (pad.kind === 'finish') {
        if (running) {
          running = false;
          const t = (now - startTime) / 1000;
          const pb = t < best;
          best = Math.min(best, t);
          timerEl.textContent = `Finished! ${t.toFixed(2)}s${pb ? ' (new best)' : ''}`;
          game.chat(`You finished the parkour in ${t.toFixed(2)}s!`, true);
          game.net.sendEvent({ kind: 'parkourFinish', name: player.name, time: t });
        }
        checkpoint = pad;
      } else if (pad.kind === 'checkpoint' && pad.index > checkpoint.index) {
        checkpoint = pad;
        if (running) game.chat('Checkpoint!', true);
      }
    }

    // Leaving the start pad starts the clock
    if (!running && checkpoint.kind === 'start' && p.x > pads[0].x + pads[0].w / 2) {
      running = true;
      startTime = now;
    }
    if (running) timerEl.textContent = `${((now - startTime) / 1000).toFixed(2)}s`;

    // Fell off the course: back to the last checkpoint
    if (p.y < FALL_Y && p.x > EDGE) {
      p.set(checkpoint.x, checkpoint.y + 0.5, checkpoint.z);
      player.velocity.set(0, 0, 0);
    }
  });

  game.net.on('event', (msg) => {
    if (msg.kind === 'parkourFinish' && typeof msg.time === 'number') {
      game.chat(`${String(msg.name).slice(0, 16)} finished the parkour in ${msg.time.toFixed(2)}s!`, true);
    }
  });
}
