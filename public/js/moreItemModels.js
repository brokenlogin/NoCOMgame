import * as THREE from 'three';
import { registerItemModel } from './itemModels.js';

// 3D models for the OP items (opItems.js, moreOpItems.js), the funny items (funnyItems.js), Sorry and Medkit.
// Same convention as itemModels.js: grip at the origin, forward is -Z, up is +Y, meters.
// Tip: very metallic materials look black here (there's no reflection map), keep metalness <= 0.5.

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
const glow = (color, intensity = 1.5, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...opts });
const glass = (color = 0xcfe8ff, opacity = 0.35) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.1, depthWrite: false });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
// Cylinder along Z: rBack at +Z (toward you), rFront at -Z
function tubeZ(rBack, rFront, length, material, z, x = 0, y = 0, seg = 16, open = false) {
  const m = mesh(new THREE.CylinderGeometry(rBack, rFront, length, seg, 1, open), material, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}
const steel = () => mat(0xb9bfc8, { roughness: 0.35, metalness: 0.5 });
const dark = () => mat(0x24262b, { roughness: 0.55 });

// ===================== OP items =====================

registerItemModel('rocket-launcher', () => {
  const g = new THREE.Group();
  const olive = mat(0x55613a, { roughness: 0.7 });
  g.add(tubeZ(0.085, 0.085, 1.1, olive, -0.25, 0, 0.12)); // tube
  g.add(tubeZ(0.1, 0.12, 0.12, olive, -0.85, 0, 0.12)); // muzzle flare
  g.add(tubeZ(0.11, 0.095, 0.1, olive, 0.33, 0, 0.12)); // back flare
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), dark(), 0, 0, 0.02)); // grip
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark(), 0, 0, -0.35)); // front grip
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.06, 0.14), dark(), -0.08, 0.2, -0.1)); // sight
  const tip = mesh(new THREE.ConeGeometry(0.07, 0.18, 14), mat(0xd8342c), 0, 0.12, -0.94);
  tip.rotation.x = -Math.PI / 2;
  g.add(tip);
  return g;
});

registerItemModel('minigun', () => {
  const g = new THREE.Group();
  const body = mat(0x3b3f46, { roughness: 0.45, metalness: 0.4 });
  const barrelMat = mat(0x5a5f68, { roughness: 0.35, metalness: 0.5 });
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), body, 0, 0.1, 0.05)); // housing
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(tubeZ(0.018, 0.018, 0.7, barrelMat, -0.42, Math.cos(a) * 0.045, 0.1 + Math.sin(a) * 0.045, 8));
  }
  for (const z of [-0.2, -0.72]) g.add(tubeZ(0.075, 0.075, 0.03, body, z, 0, 0.1)); // barrel clamps
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16, Math.PI), dark(), 0, 0.19, 0.02);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.14), mat(0x55613a), 0.13, 0.04, 0.05)); // ammo box
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark(), 0, -0.03, 0.1)); // grip
  return g;
});

registerItemModel('lightning-staff', () => {
  const g = new THREE.Group();
  const staff = new THREE.Group();
  const wood = mat(0x6b4a2b, { roughness: 0.8 });
  staff.add(mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.1, 10), wood, 0, 0.3, 0));
  staff.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), mat(0xd4a437, { metalness: 0.5, roughness: 0.3 }), 0, 0.86, 0));
  const crystal = mesh(new THREE.OctahedronGeometry(0.08, 0), glow(0x6fd8ff, 2.2), 0, 0.95, 0);
  crystal.scale.y = 1.6;
  staff.add(crystal);
  // Little zigzag bolt beside the crystal
  const bolt = new THREE.Shape();
  bolt.moveTo(0, 0); bolt.lineTo(0.05, 0.08); bolt.lineTo(0.02, 0.08); bolt.lineTo(0.07, 0.17);
  bolt.lineTo(0.0, 0.07); bolt.lineTo(0.03, 0.07); bolt.closePath();
  const b = mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.01, bevelEnabled: false }), glow(0xffe14a, 2), 0.06, 0.9, 0);
  staff.add(b);
  staff.rotation.x = -0.75;
  g.add(staff);
  return g;
});

registerItemModel('laser-beam', () => {
  const g = new THREE.Group();
  const black = mat(0x16171b, { roughness: 0.35, metalness: 0.4 });
  const red = glow(0xff2a2a, 2);
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), black, 0, 0.09, -0.12)); // body
  g.add(mesh(new THREE.BoxGeometry(0.095, 0.02, 0.38), red, 0, 0.12, -0.12)); // glow strip
  g.add(tubeZ(0.035, 0.05, 0.25, black, -0.44, 0, 0.09)); // emitter
  g.add(tubeZ(0.04, 0.04, 0.02, red, -0.57, 0, 0.09)); // lens
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), dark(), 0, -0.02, 0.03)); // grip
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.06, 0.14), black, 0, 0.17, -0.05)); // top fin
  return g;
});

registerItemModel('orbital-strike', () => {
  // A satellite in your hand: gold body, blue solar panels, a dish pointing at the ground
  const g = new THREE.Group();
  const gold = mat(0xd8b04a, { roughness: 0.35, metalness: 0.5 });
  const panel = mat(0x2a4fa8, { roughness: 0.3, metalness: 0.3, emissive: 0x0a1840 });
  const sat = new THREE.Group();
  sat.position.set(0, 0.12, -0.1);
  sat.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), gold));
  for (const side of [-1, 1]) {
    sat.add(mesh(new THREE.BoxGeometry(0.3, 0.008, 0.14), panel, side * 0.24, 0, 0));
    sat.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), steel(), side * 0.1, 0, 0).rotateZ(Math.PI / 2));
  }
  const dish = mesh(new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat(0xeeeeee, { side: THREE.DoubleSide }), 0, -0.1, 0);
  dish.rotation.x = Math.PI;
  sat.add(dish);
  sat.add(mesh(new THREE.SphereGeometry(0.015, 8, 6), glow(0xff3030, 2), 0, -0.13, 0));
  sat.rotation.set(0.3, 0.4, 0.2);
  g.add(sat);
  return g;
});

registerItemModel('nuke', () => {
  const g = new THREE.Group();
  const olive = mat(0x3d4a2c, { roughness: 0.6 });
  const yellow = mat(0xffd400, { roughness: 0.5 });
  const body = mesh(new THREE.CapsuleGeometry(0.1, 0.22, 8, 16), olive, 0, 0.08, -0.05);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  g.add(tubeZ(0.103, 0.103, 0.05, yellow, -0.05, 0, 0.08)); // warning band
  for (let i = 0; i < 4; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.005, 0.09, 0.09), olive, 0, 0.08, 0.17);
    fin.rotation.z = (i / 4) * Math.PI * 2;
    fin.position.x = Math.sin(fin.rotation.z) * 0.06;
    fin.position.y = 0.08 + Math.cos(fin.rotation.z) * 0.06;
    g.add(fin);
  }
  // Radiation symbol on the nose: yellow disc with three dark wedges
  const disc = mesh(new THREE.CircleGeometry(0.06, 24), yellow, 0, 0.08, -0.262);
  disc.rotation.y = Math.PI;
  g.add(disc);
  for (let i = 0; i < 3; i++) {
    const wedge = mesh(new THREE.CircleGeometry(0.05, 12, 0, Math.PI / 3), dark(), 0, 0.08, -0.264);
    wedge.rotation.set(0, Math.PI, (i / 3) * Math.PI * 2 + Math.PI / 6);
    g.add(wedge);
  }
  return g;
});

registerItemModel('freeze-ray', () => {
  const g = new THREE.Group();
  const shell = mat(0xd8eef8, { roughness: 0.3, metalness: 0.3 });
  const ice = glow(0x7fe3ff, 1.6, { transparent: true, opacity: 0.9 });
  const body = mesh(new THREE.SphereGeometry(0.1, 20, 14), shell, 0, 0.1, -0.02);
  body.scale.set(0.9, 0.9, 1.3);
  g.add(body);
  g.add(tubeZ(0.035, 0.03, 0.3, shell, -0.27, 0, 0.1));
  for (const z of [-0.2, -0.28, -0.36]) g.add(tubeZ(0.05, 0.05, 0.02, ice, z, 0, 0.1)); // coils
  const crystal = mesh(new THREE.OctahedronGeometry(0.045, 0), ice, 0, 0.1, -0.46);
  crystal.scale.z = 1.6;
  g.add(crystal);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), mat(0x3a6d8c), 0, -0.02, 0.05)); // grip
  g.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), ice, 0, 0.2, 0.02)); // tank
  return g;
});

registerItemModel('blink-dagger', () => {
  const g = new THREE.Group();
  const d = new THREE.Group();
  const blade = glow(0xb06cff, 0.9, { roughness: 0.2, metalness: 0.3 });
  d.add(mesh(new THREE.BoxGeometry(0.045, 0.3, 0.01), blade, 0, 0.22, 0));
  const tip = mesh(new THREE.CylinderGeometry(0, 0.032, 0.08, 4, 1), blade, 0, 0.41, 0);
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.3;
  d.add(tip);
  d.add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.035), mat(0x2b2140, { roughness: 0.3 }), 0, 0.065, 0)); // guard
  d.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.11, 10), mat(0x1c1626), 0, 0, 0)); // grip
  d.add(mesh(new THREE.OctahedronGeometry(0.025, 0), glow(0xe0b0ff, 2), 0, -0.07, 0)); // gem
  d.rotation.set(-0.8, 0.9, 0, 'YXZ');
  g.add(d);
  return g;
});

registerItemModel('sky-launcher', () => {
  // A bunch of balloons
  const g = new THREE.Group();
  const string = mat(0xeeeeee);
  const colors = [0xff4a4a, 0x4aa8ff, 0xffd84a];
  colors.forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.09, 0.42 + i * 0.04, -0.05 + Math.sin(a) * 0.09);
    const balloon = mesh(new THREE.SphereGeometry(0.09, 18, 14), mat(c, { roughness: 0.25 }), top.x, top.y, top.z);
    balloon.scale.y = 1.2;
    g.add(balloon);
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), top.clone().setY(top.y - 0.1));
    g.add(mesh(new THREE.TubeGeometry(curve, 2, 0.003, 4), string));
  });
  return g;
});

registerItemModel('singularity-cannon', () => {
  const g = new THREE.Group();
  const shell = mat(0x22202c, { roughness: 0.35, metalness: 0.4 });
  const purple = glow(0xa14bff, 2);
  g.add(tubeZ(0.11, 0.08, 0.5, shell, -0.2, 0, 0.12));
  g.add(tubeZ(0.13, 0.13, 0.05, shell, 0.05, 0, 0.12));
  for (const z of [-0.12, -0.3]) g.add(tubeZ(0.1, 0.1, 0.02, purple, z, 0, 0.12)); // glow rings
  const ring = mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 32), purple, 0, 0.12, -0.48);
  g.add(ring);
  g.add(mesh(new THREE.SphereGeometry(0.06, 20, 14), mat(0x000000, { roughness: 0.1 }), 0, 0.12, -0.5)); // the singularity
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), dark(), 0, -0.01, 0.06)); // grip
  return g;
});

registerItemModel('meteor-shower', () => {
  const g = new THREE.Group();
  const rock = mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(0x5a3b2a, { emissive: 0xff5a10, emissiveIntensity: 0.7, roughness: 1, flatShading: true }), 0, 0.12, -0.05);
  g.add(rock);
  // Flame tail streaming back
  const tail = mesh(new THREE.ConeGeometry(0.1, 0.35, 14, 1, true), glow(0xff8a20, 1.6, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 0, 0.18, 0.15);
  tail.rotation.x = -Math.PI / 2 - 0.4;
  g.add(tail);
  const tail2 = mesh(new THREE.ConeGeometry(0.06, 0.25, 12, 1, true), glow(0xffe060, 2, { transparent: true, opacity: 0.9, side: THREE.DoubleSide }), 0, 0.17, 0.11);
  tail2.rotation.x = -Math.PI / 2 - 0.4;
  g.add(tail2);
  return g;
});

registerItemModel('dynamite-shotgun', () => {
  const g = new THREE.Group();
  const wood = mat(0x7a4a26, { roughness: 0.6 });
  const metal = mat(0x4a4e55, { roughness: 0.35, metalness: 0.5 });
  for (const x of [-0.025, 0.025]) g.add(tubeZ(0.024, 0.024, 0.7, metal, -0.38, x, 0.1, 10)); // double barrel
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.25), wood, 0, 0.07, -0.12)); // forend
  const stock = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.32), wood, 0, 0.02, 0.18);
  stock.rotation.x = 0.25;
  g.add(stock);
  // Dynamite sticks poking out of the barrels
  for (const x of [-0.025, 0.025]) {
    g.add(tubeZ(0.02, 0.02, 0.1, mat(0xc8231d), -0.77, x, 0.1, 10));
  }
  g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), glow(0xffb020, 3), 0.025, 0.12, -0.83));
  return g;
});

registerItemModel('banhammer', () => {
  const g = new THREE.Group();
  const h = new THREE.Group();
  h.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 10), mat(0x5a3820, { roughness: 0.8 }), 0, 0.3, 0)); // handle
  h.add(mesh(new THREE.BoxGeometry(0.34, 0.18, 0.18), mat(0x8c939c, { roughness: 0.35, metalness: 0.5 }), 0, 0.72, 0)); // head
  h.add(mesh(new THREE.BoxGeometry(0.345, 0.05, 0.185), glow(0xd8342c, 0.6), 0, 0.72, 0)); // red band
  for (const side of [-1, 1]) h.add(mesh(new THREE.BoxGeometry(0.02, 0.2, 0.2), mat(0xd4a437, { metalness: 0.5, roughness: 0.3 }), side * 0.18, 0.72, 0));
  h.rotation.set(-0.7, 0, -0.25);
  g.add(h);
  return g;
});

registerItemModel('tornado-jar', () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 24, 1, true), glass(), 0, 0.12, 0)); // jar
  g.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 24), mat(0x9aa0a8, { metalness: 0.5, roughness: 0.3 }), 0, 0.26, 0)); // lid
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 24), glass(0xcfe8ff, 0.5), 0, 0.005, 0)); // bottom
  // Swirling funnel inside
  const swirl = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.015 + i * 0.012, 0.006, 6, 18), mat(0x8a8880, { transparent: true, opacity: 0.85 }), Math.sin(i) * 0.008, 0.04 + i * 0.04, 0);
    ring.rotation.x = Math.PI / 2;
    swirl.add(ring);
  }
  g.add(swirl);
  return g;
});

registerItemModel('god-potion', () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.1, 24, 18), glass(0xfff2c0, 0.3), 0, 0.1, 0)); // flask
  g.add(mesh(new THREE.SphereGeometry(0.085, 24, 18, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), glow(0xffc23a, 1.4), 0, 0.1, 0)); // liquid
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.1, 16, 1, true), glass(0xfff2c0, 0.35), 0, 0.23, 0)); // neck
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.04, 12), mat(0xa0703f, { roughness: 0.9 }), 0, 0.29, 0)); // cork
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(mesh(new THREE.OctahedronGeometry(0.012, 0), glow(0xfff4b0, 2.5), Math.cos(a) * 0.14, 0.18 + i * 0.03, Math.sin(a) * 0.14)); // sparkles
  }
  return g;
});

registerItemModel('cosmic-snap', () => {
  // A golden glove mid-snap with a sparkle
  const g = new THREE.Group();
  const gold = mat(0xd9a93a, { roughness: 0.3, metalness: 0.5 });
  const palm = mesh(new THREE.BoxGeometry(0.11, 0.12, 0.05), gold, 0, 0.1, 0);
  g.add(palm);
  for (let i = 0; i < 3; i++) {
    const f = mesh(new THREE.CapsuleGeometry(0.014, 0.05, 4, 8), gold, -0.02 + i * 0.025, 0.12, -0.05);
    f.rotation.x = Math.PI / 2;
    g.add(f); // curled fingers
  }
  const middle = mesh(new THREE.CapsuleGeometry(0.015, 0.06, 4, 8), gold, -0.045, 0.2, -0.01);
  middle.rotation.z = 0.5;
  g.add(middle);
  const thumb = mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 8), gold, 0.06, 0.17, 0);
  thumb.rotation.z = -0.6;
  g.add(thumb);
  g.add(tubeZ(0.065, 0.06, 0.03, gold, 0.0, 0, 0.03).rotateX(Math.PI / 2)); // cuff
  const spark = mesh(new THREE.OctahedronGeometry(0.035, 0), glow(0xfff0a0, 3), 0.0, 0.27, -0.02);
  spark.scale.set(0.5, 1.4, 0.5);
  g.add(spark);
  const spark2 = spark.clone();
  spark2.rotation.z = Math.PI / 2;
  g.add(spark2);
  return g;
});

// ===================== Funny items =====================

registerItemModel('banana-peel', () => {
  const g = new THREE.Group();
  const yellow = mat(0xf5d33a, { roughness: 0.5, side: THREE.DoubleSide });
  const inside = mat(0xfff3c4, { roughness: 0.7, side: THREE.DoubleSide });
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 12), yellow, 0, 0.07, 0)); // stem part
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.04, 8), mat(0x4a3520), 0, 0.13, 0)); // tip
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const petal = new THREE.Group();
    petal.rotation.y = a;
    const outer = mesh(new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI), yellow, 0, 0, 0);
    outer.scale.set(1, 2.4, 0.4);
    outer.position.set(0, -0.06, 0.05);
    outer.rotation.x = -0.9;
    const inner = outer.clone();
    inner.material = inside;
    inner.scale.multiplyScalar(0.92);
    petal.add(outer, inner);
    petal.position.y = 0.06;
    g.add(petal);
  }
  return g;
});

registerItemModel('whoopee-cushion', () => {
  const g = new THREE.Group();
  const pink = mat(0xff5fa2, { roughness: 0.35 });
  const body = mesh(new THREE.SphereGeometry(0.14, 24, 16), pink, 0, 0.06, -0.08);
  body.scale.set(1, 0.32, 1);
  g.add(body);
  g.add(tubeZ(0.03, 0.025, 0.1, pink, 0.1, 0, 0.06)); // nozzle toward you
  g.add(tubeZ(0.032, 0.032, 0.015, mat(0xd94a86), 0.15, 0, 0.06));
  return g;
});

registerItemModel('cream-pie', () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.05, 28), mat(0xc9ced6, { metalness: 0.4, roughness: 0.35 }), 0, 0.03, -0.06)); // tin
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 28), mat(0xd9a35c, { roughness: 0.8 }), 0, 0.065, -0.06)); // crust
  const cream = mesh(new THREE.SphereGeometry(0.14, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfffaf0, { roughness: 0.9 }), 0, 0.075, -0.06);
  cream.scale.y = 0.55;
  g.add(cream);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.025, 10, 8), mat(0xffffff, { roughness: 0.9 }), Math.cos(a) * 0.1, 0.1, -0.06 + Math.sin(a) * 0.1)); // dollops
  }
  g.add(mesh(new THREE.SphereGeometry(0.025, 14, 10), mat(0xd8122a, { roughness: 0.2 }), 0, 0.16, -0.06)); // cherry
  return g;
});

registerItemModel('rubber-chicken', () => {
  // Held by the legs, the floppy chicken hangs forward
  const g = new THREE.Group();
  const yellow = mat(0xf7d94a, { roughness: 0.4 });
  const c = new THREE.Group();
  c.rotation.x = -1.1;
  const body = mesh(new THREE.CapsuleGeometry(0.06, 0.22, 8, 14), yellow, 0, 0.2, 0);
  c.add(body);
  const neck = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 6, 10), yellow, 0, 0.38, 0);
  c.add(neck);
  c.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), yellow, 0, 0.47, 0)); // head
  const beak = mesh(new THREE.ConeGeometry(0.018, 0.05, 10), mat(0xff9a1a), 0, 0.47, -0.055);
  beak.rotation.x = -Math.PI / 2;
  c.add(beak);
  c.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.05), mat(0xe8262e), 0, 0.51, 0)); // comb
  for (const x of [-0.015, 0.015]) c.add(mesh(new THREE.SphereGeometry(0.007, 6, 6), mat(0x111111), x + Math.sign(x) * 0.025, 0.48, -0.03)); // eyes
  for (const x of [-0.025, 0.025]) c.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), mat(0xff9a1a), x, 0.04, 0)); // legs
  g.add(c);
  return g;
});

registerItemModel('sneezing-powder', () => {
  // A pepper shaker
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 20, 1, true), glass(0xf2f2f2, 0.45), 0, 0.08, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.043, 0.048, 0.1, 20), mat(0x6a5a4a, { roughness: 1 }), 0, 0.05, 0)); // powder
  const cap = mesh(new THREE.SphereGeometry(0.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb9bfc8, { metalness: 0.5, roughness: 0.3 }), 0, 0.16, 0);
  g.add(cap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.006, 6, 4), mat(0x222222), Math.cos(a) * 0.022, 0.205, Math.sin(a) * 0.022)); // holes
  }
  g.add(mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.05, 20, 1, true), mat(0xd8342c, { side: THREE.DoubleSide }), 0, 0.09, 0)); // label
  return g;
});

registerItemModel('clown-horn', () => {
  const g = new THREE.Group();
  const bulb = mesh(new THREE.SphereGeometry(0.07, 20, 14), mat(0xe8262e, { roughness: 0.35 }), 0, 0.08, 0.08);
  bulb.scale.z = 1.25;
  g.add(bulb);
  const brass = mat(0xd9a93a, { roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide });
  g.add(tubeZ(0.02, 0.02, 0.18, brass, -0.05, 0, 0.08));
  g.add(tubeZ(0.02, 0.09, 0.16, brass, -0.21, 0, 0.08, 20, true)); // bell
  return g;
});

registerItemModel('confetti-popper', () => {
  const g = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.06, 0.24, 20, 1, true), mat(0xffd84a, { roughness: 0.4, side: THREE.DoubleSide }), 0, 0.08, -0.08);
  cone.rotation.x = Math.PI / 2; // tip toward you, opening forward
  g.add(cone);
  for (const z of [-0.02, -0.1]) g.add(tubeZ(0.04 - (z + 0.02) * 0.2, 0.04, 0.02, mat(0xff4a8a), z - 0.0, 0, 0.08)); // stripes
  g.add(tubeZ(0.004, 0.004, 0.1, mat(0xeeeeee), 0.08, 0, 0.08, 6)); // pull string
  const colors = [0xff4a4a, 0x4aa8ff, 0x4cd964, 0xffd84a, 0xb06cff];
  for (let i = 0; i < 10; i++) {
    const piece = mesh(new THREE.BoxGeometry(0.02, 0.012, 0.004), mat(colors[i % colors.length]), (Math.random() - 0.5) * 0.14, 0.08 + (Math.random() - 0.5) * 0.14, -0.22 - Math.random() * 0.12);
    piece.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(piece);
  }
  return g;
});

// ===================== More OP items (moreOpItems.js) =====================

registerItemModel('mjolnir', () => {
  // A stout short-handled war hammer crackling with lightning
  const g = new THREE.Group();
  const h = new THREE.Group();
  const iron = mat(0x9aa1ab, { roughness: 0.35, metalness: 0.45 });
  h.add(mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.32, 10), mat(0x5a3820, { roughness: 0.85 }), 0, 0.1, 0)); // handle
  for (let i = 0; i < 4; i++) h.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), mat(0x3a2414), 0, 0.0 + i * 0.05, 0).rotateX(Math.PI / 2)); // leather wraps
  h.add(mesh(new THREE.BoxGeometry(0.3, 0.15, 0.15), iron, 0, 0.32, 0)); // head
  for (const x of [-0.155, 0.155]) h.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.12), mat(0x6c737c, { metalness: 0.45, roughness: 0.4 }), x, 0.32, 0)); // faces
  h.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), mat(0x3a2414), 0, -0.08, 0)); // wrist loop
  const bolt = new THREE.Shape();
  bolt.moveTo(0, 0); bolt.lineTo(0.04, 0.07); bolt.lineTo(0.015, 0.07); bolt.lineTo(0.05, 0.15);
  bolt.lineTo(-0.005, 0.06); bolt.lineTo(0.02, 0.06); bolt.closePath();
  h.add(mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.008, bevelEnabled: false }), glow(0x9fd8ff, 2.5), 0.08, 0.38, 0.08));
  h.rotation.set(-0.7, 0, 0.2);
  g.add(h);
  return g;
});

registerItemModel('dragon-breath', () => {
  // A dragon-head flamethrower breathing fire forward
  const g = new THREE.Group();
  const scales = mat(0x2f8a4a, { roughness: 0.5 });
  const head = new THREE.Group();
  head.position.set(0, 0.1, -0.1);
  const skull = mesh(new THREE.SphereGeometry(0.08, 16, 12), scales);
  skull.scale.set(1, 0.9, 1.2);
  head.add(skull);
  const snout = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.16), scales, 0, -0.01, -0.12);
  head.add(snout);
  for (const x of [-0.04, 0.04]) {
    const horn = mesh(new THREE.ConeGeometry(0.018, 0.12, 8), mat(0xe8dcc0), x, 0.08, 0.06);
    horn.rotation.x = 0.7;
    head.add(horn);
    head.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), glow(0xffd400, 2), x * 1.3, 0.035, -0.06)); // eyes
  }
  for (let i = 0; i < 3; i++) head.add(mesh(new THREE.ConeGeometry(0.012, 0.04, 6), mat(0x1f6a36), 0, 0.075, 0.02 + i * 0.05)); // spines
  const fire = mesh(new THREE.ConeGeometry(0.06, 0.25, 14, 1, true), glow(0xff7a1a, 2, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 0, -0.01, -0.33);
  fire.rotation.x = Math.PI / 2;
  head.add(fire);
  const fire2 = mesh(new THREE.ConeGeometry(0.03, 0.16, 12, 1, true), glow(0xffe060, 2.5, { transparent: true, opacity: 0.9, side: THREE.DoubleSide }), 0, -0.01, -0.28);
  fire2.rotation.x = Math.PI / 2;
  head.add(fire2);
  g.add(head);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark(), 0, -0.02, 0.03)); // grip
  return g;
});

registerItemModel('mega-magnet', () => {
  // Classic horseshoe magnet, open end forward
  const g = new THREE.Group();
  const red = mat(0xd8262e, { roughness: 0.35 });
  const shoe = mesh(new THREE.TorusGeometry(0.09, 0.035, 12, 24, Math.PI), red, 0, 0.1, 0);
  shoe.rotation.set(Math.PI / 2, 0, Math.PI); // U opening toward -Z
  g.add(shoe);
  for (const x of [-0.09, 0.09]) {
    g.add(tubeZ(0.036, 0.036, 0.12, red, -0.06, x, 0.1, 14));
    g.add(tubeZ(0.037, 0.037, 0.06, mat(0xd8dde4, { metalness: 0.5, roughness: 0.3 }), -0.15, x, 0.1, 14)); // silver tips
  }
  return g;
});

registerItemModel('portal-gun', () => {
  // Dark handheld emitter with a blue ring and an orange ring
  const g = new THREE.Group();
  const shell = mat(0x2c3038, { roughness: 0.35, metalness: 0.4 });
  g.add(tubeZ(0.07, 0.06, 0.3, shell, -0.08, 0, 0.1)); // body
  g.add(tubeZ(0.03, 0.03, 0.3, glow(0xdff4ff, 1.2), -0.08, 0, 0.1)); // core (seen through the rings)
  g.add(tubeZ(0.072, 0.072, 0.025, glow(0x3aa0ff, 2.2), -0.18, 0, 0.1)); // blue ring
  g.add(tubeZ(0.072, 0.072, 0.025, glow(0xff8a1a, 2.2), 0.02, 0, 0.1)); // orange ring
  for (let i = 0; i < 3; i++) {
    const prong = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.1), shell, 0, 0, 0);
    const a = (i / 3) * Math.PI * 2;
    prong.position.set(Math.cos(a) * 0.05, 0.1 + Math.sin(a) * 0.05, -0.27);
    g.add(prong);
  }
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark(), 0, -0.02, 0.04)); // grip
  return g;
});

registerItemModel('volcano-staff', () => {
  const g = new THREE.Group();
  const s = new THREE.Group();
  const rock = mat(0x3b302a, { roughness: 0.95, flatShading: true });
  s.add(mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.0, 8), rock, 0, 0.28, 0)); // stone staff
  s.add(mesh(new THREE.CylinderGeometry(0.03, 0.11, 0.14, 10), rock, 0, 0.84, 0)); // little volcano
  s.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 10), glow(0xff5a10, 2.5), 0, 0.915, 0)); // lava in the crater
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    s.add(mesh(new THREE.BoxGeometry(0.012, 0.09, 0.01), glow(0xff7a1a, 2), Math.cos(a) * 0.06, 0.82, Math.sin(a) * 0.06)); // lava streaks
  }
  s.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), glow(0xffb020, 3), 0.02, 0.98, 0)); // spark
  s.rotation.x = -0.75;
  g.add(s);
  return g;
});

registerItemModel('ice-age', () => {
  // A cluster of ice crystals
  const g = new THREE.Group();
  const ice = new THREE.MeshStandardMaterial({ color: 0xbfeeff, emissive: 0x4fbfff, emissiveIntensity: 0.4, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
  const shards = [[0, 0.14, 0, 1.0, 0], [0.06, 0.1, 0.02, 0.7, -0.4], [-0.06, 0.1, -0.02, 0.75, 0.45], [0.02, 0.08, 0.06, 0.55, 0.3], [-0.03, 0.08, -0.06, 0.5, -0.3]];
  for (const [x, y, z, sc, tilt] of shards) {
    const c = mesh(new THREE.OctahedronGeometry(0.05, 0), ice, x, y, z);
    c.scale.set(sc * 0.8, sc * 2.4, sc * 0.8);
    c.rotation.z = tilt;
    g.add(c);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 8), mat(0xe8f6ff, { roughness: 0.6, flatShading: true }), 0, 0.02, 0)); // snowy base
  return g;
});

registerItemModel('time-stop', () => {
  // Gold stopwatch
  const g = new THREE.Group();
  const gold = mat(0xd9a93a, { roughness: 0.3, metalness: 0.5 });
  const w = new THREE.Group();
  w.position.set(0, 0.12, -0.04);
  w.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 32), gold).rotateX(Math.PI / 2)); // case
  const face = mesh(new THREE.CircleGeometry(0.078, 32), mat(0xfaf8f0, { roughness: 0.5 }), 0, 0, 0.016);
  w.add(face);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    w.add(mesh(new THREE.BoxGeometry(0.004, i % 3 ? 0.008 : 0.016, 0.002), dark(), Math.sin(a) * 0.066, Math.cos(a) * 0.066, 0.018).rotateZ(-a));
  }
  w.add(mesh(new THREE.BoxGeometry(0.005, 0.06, 0.003), dark(), 0, 0.025, 0.019)); // minute hand
  w.add(mesh(new THREE.BoxGeometry(0.004, 0.045, 0.003), mat(0xd8262e), 0.016, -0.012, 0.02).rotateZ(2.2)); // second hand
  w.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 12), gold, 0, 0.1, 0)); // crown
  w.add(mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 14), gold, 0, 0.125, 0)); // ring
  w.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), gold, 0.06, 0.075, 0).rotateZ(-0.7)); // side button
  w.rotation.y = Math.PI; // face the player in first person
  g.add(w);
  return g;
});

registerItemModel('shark-launcher', () => {
  const g = new THREE.Group();
  const tube = mat(0x2d5f8a, { roughness: 0.45 });
  g.add(tubeZ(0.1, 0.1, 0.6, tube, -0.1, 0, 0.12, 18, true)); // launcher tube (open)
  g.add(tubeZ(0.11, 0.11, 0.04, mat(0xffb020), -0.4, 0, 0.12)); // muzzle band
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), dark(), 0, 0, 0.05)); // grip
  // Shark nosing out of the front
  const grey = mat(0x7d8b96, { roughness: 0.45 });
  const shark = new THREE.Group();
  shark.position.set(0, 0.12, -0.42);
  const body = mesh(new THREE.ConeGeometry(0.085, 0.3, 16), grey, 0, 0, -0.05);
  body.rotation.x = -Math.PI / 2;
  shark.add(body);
  const fin = mesh(new THREE.ConeGeometry(0.035, 0.09, 4), grey, 0, 0.085, 0.04);
  fin.scale.z = 0.3;
  shark.add(fin);
  shark.add(mesh(new THREE.BoxGeometry(0.11, 0.012, 0.06), mat(0xffffff), 0, -0.035, -0.08)); // teeth
  for (const x of [-0.045, 0.045]) shark.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), mat(0x111111), x, 0.02, -0.1));
  g.add(shark);
  return g;
});

registerItemModel('cluster-bomb', () => {
  const g = new THREE.Group();
  const shell = mat(0x2a2d33, { roughness: 0.45, metalness: 0.3 });
  g.add(mesh(new THREE.SphereGeometry(0.09, 20, 14), shell, 0, 0.1, 0));
  const red = mat(0xd8342c, { roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / 10);
    const th = Math.PI * (1 + Math.sqrt(5)) * i;
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), red, Math.sin(phi) * Math.cos(th) * 0.095, 0.1 + Math.cos(phi) * 0.095, Math.sin(phi) * Math.sin(th) * 0.095));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 10), mat(0xb9bfc8, { metalness: 0.5, roughness: 0.3 }), 0, 0.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), glow(0xffb020, 3), 0, 0.23, 0));
  return g;
});

registerItemModel('tsunami', () => {
  // A curling wave with foam on top
  const g = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({ color: 0x2a8fd8, emissive: 0x0a3a6a, roughness: 0.15, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const wave = mesh(new THREE.TorusGeometry(0.1, 0.045, 12, 24, Math.PI * 1.3), water, 0, 0.12, -0.02);
  wave.rotation.y = Math.PI / 2;
  wave.scale.set(1, 1, 1.6);
  g.add(wave);
  const foam = mat(0xffffff, { roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.25 + i * 0.13);
    g.add(mesh(new THREE.SphereGeometry(0.022 + (i % 2) * 0.008, 10, 8), foam, (i % 2 ? 1 : -1) * 0.04, 0.12 + Math.sin(a) * 0.11, -0.02 + Math.cos(a) * 0.11));
  }
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), water, 0, 0.015, -0.02)); // base water
  return g;
});

registerItemModel('railgun', () => {
  const g = new THREE.Group();
  const body = mat(0x3a3f47, { roughness: 0.35, metalness: 0.45 });
  const blue = glow(0x4ad8ff, 2.2);
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.32), body, 0, 0.09, 0.0)); // receiver
  for (const x of [-0.03, 0.03]) g.add(mesh(new THREE.BoxGeometry(0.015, 0.05, 0.6), body, x, 0.09, -0.45)); // the two rails
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.075, 0.012, 0.012), blue, 0, 0.12, -0.25 - i * 0.1)); // coils
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.58), glow(0x4ad8ff, 1.2, { transparent: true, opacity: 0.6 }), 0, 0.09, -0.45)); // charge between rails
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), dark(), 0, -0.02, 0.06)); // grip
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), body, 0, 0.06, 0.24)); // stock
  g.add(tubeZ(0.02, 0.02, 0.08, mat(0x111111), -0.05, 0, 0.17)); // scope
  return g;
});

registerItemModel('gravity-bomb', () => {
  // A tiny ringed planet
  const g = new THREE.Group();
  const planet = mesh(new THREE.SphereGeometry(0.085, 24, 18), mat(0xd98a3a, { roughness: 0.6, emissive: 0x3a1a00 }), 0, 0.12, 0);
  g.add(planet);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.0855, 0.006, 6, 30), mat(0xb8642a), 0, 0.12 + (i - 1) * 0.035, 0).rotateX(Math.PI / 2)); // bands
  const ring = mesh(new THREE.RingGeometry(0.11, 0.16, 40), glow(0xc8a0ff, 0.8, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 0, 0.12, 0);
  ring.rotation.set(Math.PI / 2 - 0.4, 0.2, 0);
  g.add(ring);
  return g;
});

registerItemModel('ghost-cloak', () => {
  // A friendly sheet ghost
  const g = new THREE.Group();
  const sheet = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0x8090c0, emissiveIntensity: 0.25, roughness: 0.6, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const top = mesh(new THREE.SphereGeometry(0.09, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), sheet, 0, 0.18, 0);
  g.add(top);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 20, 1, true), sheet, 0, 0.11, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), sheet, Math.cos(a) * 0.09, 0.04, Math.sin(a) * 0.09)); // wavy hem
  }
  for (const x of [-0.03, 0.03]) {
    const eye = mesh(new THREE.SphereGeometry(0.016, 10, 8), mat(0x111111), x, 0.19, -0.082);
    eye.scale.y = 1.4;
    g.add(eye);
  }
  return g;
});

registerItemModel('moon-boots', () => {
  const g = new THREE.Group();
  const grey = mat(0xc9ced6, { roughness: 0.55 });
  const sole = glow(0x5ac8ff, 1.6);
  for (const x of [-0.07, 0.07]) {
    const boot = new THREE.Group();
    boot.position.set(x, 0, 0);
    boot.add(mesh(new THREE.BoxGeometry(0.09, 0.14, 0.11), grey, 0, 0.12, 0.02)); // shaft
    boot.add(mesh(new THREE.BoxGeometry(0.1, 0.07, 0.19), grey, 0, 0.045, -0.02)); // foot
    boot.add(mesh(new THREE.BoxGeometry(0.105, 0.03, 0.2), sole, 0, 0.005, -0.02)); // glowing sole
    boot.add(mesh(new THREE.BoxGeometry(0.095, 0.02, 0.115), mat(0x2a6fd8), 0, 0.17, 0.02)); // cuff stripe
    g.add(boot);
  }
  return g;
});

registerItemModel('flash-potion', () => {
  // Cone flask of fizzy yellow speed
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.1, 0.16, 24, 1, true), glass(0xfff7d0, 0.3), 0, 0.08, 0)); // flask
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.095, 0.1, 24), glow(0xffe14a, 1.4), 0, 0.05, 0)); // liquid
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.06, 16, 1, true), glass(0xfff7d0, 0.35), 0, 0.19, 0)); // neck
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 12), mat(0xa0703f), 0, 0.235, 0)); // cork
  const bolt = new THREE.Shape();
  bolt.moveTo(0, 0); bolt.lineTo(0.03, 0.05); bolt.lineTo(0.012, 0.05); bolt.lineTo(0.035, 0.1);
  bolt.lineTo(-0.005, 0.04); bolt.lineTo(0.013, 0.04); bolt.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.006, bevelEnabled: false }), glow(0xfff2a0, 2.5), -0.015, 0.03, -0.1)); // bolt label
  return g;
});

registerItemModel('insta-wall', () => {
  // A little stack of bricks
  const g = new THREE.Group();
  const brick = mat(0xb5532e, { roughness: 0.85 });
  const mortar = mat(0xd8d0c4, { roughness: 1 });
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.15, 0.07), mortar, 0, 0.08, -0.04));
  for (let row = 0; row < 3; row++) {
    const off = row % 2 ? 0.04 : 0;
    for (let i = 0; i < 3; i++) {
      const x = -0.08 + i * 0.08 + off;
      if (x > 0.12) continue;
      g.add(mesh(new THREE.BoxGeometry(0.072, 0.042, 0.075), brick, x, 0.025 + row * 0.048, -0.04));
    }
  }
  return g;
});

registerItemModel('rainbow-bridge', () => {
  // A little rainbow arc
  const g = new THREE.Group();
  const colors = [0xff3b30, 0xff9500, 0xffcc00, 0x4cd964, 0x34aadc, 0x5856d6];
  colors.forEach((c, i) => {
    const arc = mesh(new THREE.TorusGeometry(0.16 - i * 0.017, 0.009, 8, 32, Math.PI), glow(c, 0.6), 0, 0.02, -0.05);
    g.add(arc);
  });
  for (const x of [-0.15, 0.15]) {
    const cloud = mesh(new THREE.SphereGeometry(0.04, 12, 10), mat(0xffffff, { roughness: 0.9 }), x * 0.8, 0.02, -0.05);
    cloud.scale.set(1.4, 0.8, 1);
    g.add(cloud);
  }
  return g;
});

registerItemModel('land-mine', () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 28), mat(0x55613a, { roughness: 0.7 }), 0, 0.03, -0.04)); // casing
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.02, 24), mat(0x9aa1ab, { metalness: 0.45, roughness: 0.35 }), 0, 0.065, -0.04)); // pressure plate
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), dark(), Math.cos(a) * 0.095, 0.058, -0.04 + Math.sin(a) * 0.095)); // bolts
  }
  g.add(mesh(new THREE.SphereGeometry(0.012, 10, 8), glow(0xff2a2a, 3), 0.085, 0.07, -0.04)); // armed light
  return g;
});

registerItemModel('bee-swarm', () => {
  // A beehive with a few bees buzzing around it
  const g = new THREE.Group();
  const hive = mat(0xd8a03a, { roughness: 0.75 });
  for (let i = 0; i < 4; i++) {
    const r = 0.085 - Math.abs(i - 1.3) * 0.018;
    g.add(mesh(new THREE.TorusGeometry(r, 0.028, 8, 20), hive, 0, 0.04 + i * 0.045, 0).rotateX(Math.PI / 2));
  }
  g.add(mesh(new THREE.SphereGeometry(0.055, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hive, 0, 0.17, 0)); // top
  g.add(mesh(new THREE.CircleGeometry(0.02, 12), mat(0x2a1a0a), 0, 0.06, -0.09).rotateY(Math.PI)); // entrance
  const yellow = mat(0xffd400, { roughness: 0.4 });
  const black = mat(0x111111);
  const wing = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  for (const [x, y, z] of [[0.12, 0.16, -0.04], [-0.11, 0.21, 0.02], [0.05, 0.25, -0.1]]) {
    const bee = new THREE.Group();
    bee.position.set(x, y, z);
    const body = mesh(new THREE.SphereGeometry(0.018, 10, 8), yellow);
    body.scale.set(1, 1, 1.5);
    bee.add(body);
    bee.add(mesh(new THREE.TorusGeometry(0.0175, 0.004, 6, 12), black, 0, 0, 0.003));
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.CircleGeometry(0.014, 10), wing, s * 0.014, 0.014, 0);
      w.rotation.set(-Math.PI / 2, 0, s * 0.4);
      bee.add(w);
    }
    g.add(bee);
  }
  return g;
});

registerItemModel('swap-ray', () => {
  const g = new THREE.Group();
  const shell = mat(0xe8e8ee, { roughness: 0.35, metalness: 0.2 });
  g.add(tubeZ(0.05, 0.04, 0.3, shell, -0.1, 0, 0.1)); // barrel
  g.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), shell, 0, 0.1, 0.06)); // body
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark(), 0, -0.01, 0.08)); // grip
  // Two curved arrows chasing each other around the barrel
  const cyan = glow(0x32e0ff, 2);
  const pink = glow(0xff4ad8, 2);
  const a1 = mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 24, Math.PI * 0.8), cyan, 0, 0.1, -0.16);
  const a2 = mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 24, Math.PI * 0.8), pink, 0, 0.1, -0.16);
  a2.rotation.z = Math.PI;
  g.add(a1, a2);
  for (const [m, rz] of [[cyan, Math.PI * 0.8], [pink, Math.PI * 1.8]]) {
    const head = mesh(new THREE.ConeGeometry(0.022, 0.04, 8), m, Math.cos(rz) * 0.075, 0.1 + Math.sin(rz) * 0.075, -0.16);
    head.rotation.z = rz;
    g.add(head);
  }
  return g;
});

// ===================== Medkit =====================

registerItemModel('medkit', () => {
  const g = new THREE.Group();
  const white = mat(0xf4f4f2, { roughness: 0.45 });
  const red = mat(0xd8262e, { roughness: 0.4 });
  const box = new THREE.Group();
  box.position.set(0, 0.04, -0.06);
  box.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), white)); // case
  box.add(mesh(new THREE.BoxGeometry(0.305, 0.02, 0.105), mat(0xc9ced6, { roughness: 0.4 }), 0, 0.02, 0)); // lid seam
  // Red cross on both big faces
  for (const z of [-0.051, 0.051]) {
    box.add(mesh(new THREE.BoxGeometry(0.12, 0.035, 0.004), red, 0, -0.02, z));
    box.add(mesh(new THREE.BoxGeometry(0.035, 0.12, 0.004), red, 0, -0.02, z));
  }
  const handle = mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI), mat(0x2a2c31), 0, 0.1, 0);
  box.add(handle);
  box.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), mat(0xb9bfc8, { metalness: 0.5, roughness: 0.3 }), -0.1, 0.02, -0.052)); // latch
  box.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), mat(0xb9bfc8, { metalness: 0.5, roughness: 0.3 }), 0.1, 0.02, -0.052));
  box.rotation.y = 0.25;
  g.add(box);
  return g;
});

// ===================== Sorry =====================

registerItemModel('sorry', () => {
  // A little "SORRY" sign on a stick
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#ff6fa8';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#d6336c';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SORRY', 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  sign.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 8), mat(0xb07a45), 0, 0.15, 0)); // stick
  sign.add(mesh(new THREE.BoxGeometry(0.3, 0.15, 0.01), mat(0xffffff), 0, 0.38, 0)); // board
  const face = mesh(new THREE.PlaneGeometry(0.29, 0.145), new THREE.MeshBasicMaterial({ map: tex }), 0, 0.38, -0.006);
  face.rotation.y = Math.PI;
  sign.add(face);
  const back = mesh(new THREE.PlaneGeometry(0.29, 0.145), new THREE.MeshBasicMaterial({ map: tex }), 0, 0.38, 0.006);
  sign.add(back);
  sign.rotation.y = 0.3;
  g.add(sign);
  return g;
});
