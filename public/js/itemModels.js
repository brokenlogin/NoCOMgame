import * as THREE from 'three';

// 3D models for items, used for inventory icons and the held item in first person.
//
// Convention for every model: the grip (where your hand is) at the origin, pointing
// forward along -Z, up is +Y, sizes in meters. Add yours with registerItemModel(id, fn)
// or pass `model: () => object3D` to registerItem().

const builders = new Map();

export function registerItemModel(id, build) {
  builders.set(id, build);
}

export function hasItemModel(id) {
  return builders.has(id);
}

// A fresh copy of an item's model, or null if it has none
export function createItemModel(id) {
  const build = builders.get(id);
  if (!build) return null;
  const obj = build(THREE);
  obj.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return obj;
}

// ---------- Helpers ----------
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
const glow = (color, intensity = 1.5) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

// A cylinder lying along the Z axis (three.js cylinders stand along Y).
// rBack is the radius at the +Z end (toward you), rFront at the -Z end (forward).
function tubeZ(rBack, rFront, length, material, z, x = 0, y = 0, seg = 16) {
  const m = mesh(new THREE.CylinderGeometry(rBack, rFront, length, seg), material, x, y, z);
  m.rotation.x = Math.PI / 2; // geometry's +Y (top) now points at +Z
  return m;
}

// ---------- Models ----------

registerItemModel('bat', () => {
  const g = new THREE.Group();
  const wood = mat(0xc89a5b, { roughness: 0.5 });
  const tape = mat(0x1d1d22, { roughness: 0.9 });
  const bat = new THREE.Group();
  bat.add(mesh(new THREE.CylinderGeometry(0.06, 0.022, 0.6, 20), wood, 0, 0.45, 0)); // barrel taper
  bat.add(mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.28, 16), tape, 0, 0.02, 0)); // grip tape
  bat.add(mesh(new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), wood, 0, 0.75, 0)); // rounded end
  bat.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), wood, 0, -0.13, 0)); // knob
  bat.rotation.x = -0.9; // held up and leaning forward
  g.add(bat);
  return g;
});

registerItemModel('potato-cannon', () => {
  const g = new THREE.Group();
  const pvc = mat(0xe8e8e2, { roughness: 0.35 });
  const cap = mat(0xff7a1a, { roughness: 0.4 });
  const dark = mat(0x2a2c31);
  g.add(tubeZ(0.05, 0.05, 0.85, pvc, -0.45, 0, 0.12)); // barrel
  g.add(tubeZ(0.09, 0.09, 0.32, pvc, 0.08, 0, 0.12)); // combustion chamber
  g.add(tubeZ(0.1, 0.1, 0.05, cap, 0.26, 0, 0.12)); // end cap
  g.add(tubeZ(0.065, 0.065, 0.06, pvc, -0.12, 0, 0.12)); // reducer collar
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), dark, 0, 0, 0.02)); // pistol grip
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), cap, 0, 0.06, -0.06)); // igniter button
  const potato = mesh(new THREE.SphereGeometry(0.06, 14, 10), mat(0xb08850, { roughness: 0.95 }), 0, 0.12, -0.9);
  potato.scale.set(1, 0.85, 1.35);
  g.add(potato);
  return g;
});

registerItemModel('boxing-glove', () => {
  const g = new THREE.Group();
  const red = mat(0xd42a2a, { roughness: 0.35 });
  const white = mat(0xf2f2f2, { roughness: 0.5 });
  const fist = mesh(new THREE.SphereGeometry(0.13, 24, 16), red, 0, 0.02, -0.12);
  fist.scale.set(1, 0.95, 1.2);
  g.add(fist);
  const thumb = mesh(new THREE.CapsuleGeometry(0.045, 0.1, 6, 12), red, -0.11, 0.0, -0.1);
  thumb.rotation.x = Math.PI / 2;
  thumb.rotation.z = 0.3;
  g.add(thumb);
  g.add(tubeZ(0.11, 0.1, 0.14, white, 0.08, 0, 0)); // cuff
  g.add(tubeZ(0.112, 0.112, 0.03, red, 0.14, 0, 0)); // cuff trim
  return g;
});

registerItemModel('leaf-blower', () => {
  const g = new THREE.Group();
  const body = mat(0xf2a516, { roughness: 0.45 });
  const dark = mat(0x26282d);
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), body, 0, -0.08, 0.1)); // engine housing
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 20), dark, 0, -0.08, 0.1).rotateZ(Math.PI / 2)); // fan
  const handle = mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 20, Math.PI), dark, 0, 0.02, 0.1);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  g.add(tubeZ(0.06, 0.045, 0.7, body, -0.4, 0, -0.08)); // nozzle, narrowing toward the tip
  g.add(tubeZ(0.05, 0.05, 0.04, dark, -0.76, 0, -0.08)); // nozzle tip
  return g;
});

registerItemModel('air-horn', () => {
  const g = new THREE.Group();
  const can = mat(0xd8262e, { roughness: 0.3, metalness: 0.3 });
  const black = mat(0x1b1c20, { roughness: 0.5 });
  const label = mat(0xffffff, { roughness: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 24), can, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.07, 24), label, 0, 0.01, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.04, 24), black, 0, 0.13, 0)); // valve cap
  // Horn trumpet pointing forward
  const horn = mesh(new THREE.CylinderGeometry(0.075, 0.02, 0.22, 24, 1, true), black, 0, 0.17, -0.12);
  horn.rotation.x = -Math.PI / 2;
  horn.material = black.clone();
  horn.material.side = THREE.DoubleSide;
  g.add(horn);
  return g;
});

registerItemModel('plunger', () => {
  const g = new THREE.Group();
  const wood = mat(0xb07a45, { roughness: 0.55 });
  const rubber = mat(0xc4161c, { roughness: 0.3 });
  g.add(tubeZ(0.018, 0.018, 0.75, wood, -0.2));
  const cup = mesh(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), rubber, 0, 0, -0.6);
  cup.rotation.x = Math.PI / 2; // dome toward the handle, opening forward
  cup.material = rubber.clone();
  cup.material.side = THREE.DoubleSide;
  g.add(cup);
  return g;
});

registerItemModel('grappling-hook', () => {
  const g = new THREE.Group();
  const gun = mat(0x3a3f47, { roughness: 0.4, metalness: 0.6 });
  const accent = mat(0x2fb8ff, { roughness: 0.3, emissive: 0x0b4a6b });
  const steel = mat(0xc9ced6, { roughness: 0.25, metalness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.4), gun, 0, 0.08, -0.12)); // body
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), gun, 0, -0.02, 0.02)); // grip
  g.add(tubeZ(0.05, 0.05, 0.12, accent, 0.0, 0, 0.08)); // reel drum
  g.add(tubeZ(0.03, 0.03, 0.2, gun, -0.4, 0, 0.09)); // barrel
  // Three-pronged hook at the muzzle
  const hook = new THREE.Group();
  hook.position.set(0, 0.09, -0.52);
  hook.add(tubeZ(0.012, 0.012, 0.12, steel, 0));
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Group();
    prong.rotation.z = (i / 3) * Math.PI * 2;
    const arc = mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), steel, 0, 0.045, -0.05);
    arc.rotation.y = Math.PI / 2;
    prong.add(arc);
    prong.add(mesh(new THREE.ConeGeometry(0.014, 0.035, 8), steel, 0, 0.09, -0.04).rotateX(Math.PI / 2));
    hook.add(prong);
  }
  g.add(hook);
  return g;
});

registerItemModel('dynamite', () => {
  const g = new THREE.Group();
  const red = mat(0xc8231d, { roughness: 0.55 });
  const tape = mat(0x2a2a2a, { roughness: 0.8 });
  const paper = mat(0xf0e2c0, { roughness: 0.9 });
  const offsets = [[-0.035, 0], [0.035, 0], [0, 0.06]];
  for (const [x, y] of offsets) {
    g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 16), red, x, y, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 16), paper, x, y + 0.151, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.04, 0.075), tape, 0, 0.025, 0)); // band
  // Fuse with a spark
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.21, 0),
    new THREE.Vector3(0.03, 0.27, -0.02),
    new THREE.Vector3(-0.01, 0.31, -0.05),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.006, 6), mat(0x8a7350)));
  g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), glow(0xffb020, 3), -0.01, 0.315, -0.05));
  g.rotation.z = -0.3;
  return g;
});

registerItemModel('gravity-flipper', () => {
  const g = new THREE.Group();
  const body = mat(0x6a3fc0, { roughness: 0.35, metalness: 0.4 });
  const dark = mat(0x23252b, { roughness: 0.5 });
  const cyan = glow(0x39e6ff, 1.2);
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16), dark, 0, 0, 0)); // handle
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 24), body, 0, 0.11, 0)); // base disc
  const ring = mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 32), cyan, 0, 0.19, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), cyan, 0, 0.19, 0)); // core
  // Arrows: one up, one down
  g.add(mesh(new THREE.ConeGeometry(0.035, 0.07, 16), body, 0, 0.29, 0));
  const down = mesh(new THREE.ConeGeometry(0.035, 0.07, 16), body, 0, 0.09, -0.11);
  down.rotation.x = Math.PI;
  g.add(down);
  return g;
});

registerItemModel('black-hole', () => {
  const g = new THREE.Group();
  const shell = mat(0x0b0b10, { roughness: 0.2, metalness: 0.7 });
  const purple = glow(0xa14bff, 2);
  const steel = mat(0xc9ced6, { roughness: 0.25, metalness: 0.9 });
  g.add(mesh(new THREE.SphereGeometry(0.09, 28, 20), shell, 0, 0.1, 0));
  const disk = mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 40), purple, 0, 0.1, 0);
  disk.rotation.x = Math.PI / 2 - 0.35;
  g.add(disk);
  const band = mesh(new THREE.TorusGeometry(0.091, 0.008, 8, 32), purple, 0, 0.1, 0);
  band.rotation.y = Math.PI / 2;
  g.add(band);
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 16), steel, 0, 0.2, 0)); // fuse cap
  const pin = mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 16), steel, 0.035, 0.22, 0);
  pin.rotation.y = Math.PI / 2;
  g.add(pin);
  return g;
});

registerItemModel('sword', () => {
  const g = new THREE.Group();
  const blade = mat(0xe4e9ef, { roughness: 0.25, metalness: 0.35 }); // very metallic looks black without reflections
  const gold = mat(0xd4a437, { roughness: 0.3, metalness: 0.5 });
  const leather = mat(0x5a3820, { roughness: 0.85 });
  const sword = new THREE.Group();
  // Blade: a flattened box that tapers to a point
  sword.add(mesh(new THREE.BoxGeometry(0.06, 0.62, 0.012), blade, 0, 0.42, 0));
  const tip = mesh(new THREE.CylinderGeometry(0, 0.042, 0.12, 4, 1), blade, 0, 0.79, 0);
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(1, 1, 0.28);
  sword.add(tip);
  sword.add(mesh(new THREE.BoxGeometry(0.008, 0.6, 0.016), mat(0xaab2bd, { metalness: 0.35, roughness: 0.3 }), 0, 0.42, 0)); // fuller
  sword.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), gold, 0, 0.1, 0)); // crossguard
  sword.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.15, 12), leather, 0, 0.01, 0)); // grip
  sword.add(mesh(new THREE.SphereGeometry(0.03, 14, 10), gold, 0, -0.08, 0)); // pommel
  sword.rotation.set(-0.75, 0.9, 0, 'YXZ'); // raised, pointing forward, flat of the blade toward you
  g.add(sword);
  return g;
});

// ---------- Icon rendering ----------
// Renders each model once into a small transparent PNG for the inventory slots.

let iconRenderer = null;
let iconScene = null;
let iconCamera = null;
const iconCache = new Map();
const ICON_SIZE = 128;

function setupIconRenderer() {
  iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  iconRenderer.setSize(ICON_SIZE, ICON_SIZE);
  iconRenderer.setClearColor(0x000000, 0);
  iconScene = new THREE.Scene();
  iconScene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 2);
  iconScene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2);
  rim.position.set(-3, 1, -2);
  iconScene.add(rim);
  iconCamera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
}

// PNG data URL for an item's icon, or null if it has no model
export function getItemIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const model = createItemModel(id);
  if (!model) return null;
  let url = null;
  try {
    if (!iconRenderer) setupIconRenderer();
    // Three-quarter view so the shape reads well
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.rotation.set(0.35, -2.3, 0);
    iconScene.add(pivot);
    pivot.updateMatrixWorld(true);

    // Frame it: center on its bounds and back the camera off to fit
    const box = new THREE.Box3().setFromObject(pivot);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 0.3;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(iconCamera.fov / 2))) * 0.92;
    iconCamera.position.set(center.x, center.y, center.z + dist);
    iconCamera.lookAt(center);

    iconRenderer.render(iconScene, iconCamera);
    url = iconRenderer.domElement.toDataURL('image/png');
    iconScene.remove(pivot);
    pivot.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  } catch (err) {
    console.warn('[itemModels] could not render icon for', id, err);
  }
  iconCache.set(id, url);
  return url;
}
