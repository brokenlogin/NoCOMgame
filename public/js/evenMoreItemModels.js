import * as THREE from 'three';
import { registerItemModel } from './itemModels.js';
import { itemTexture } from './itemTextures.js';

// 3D models for the items in evenMoreOpItems.js.
// Same convention as itemModels.js: grip at the origin, forward is -Z, up is +Y, meters.

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
const glow = (color, intensity = 1.5, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...opts });
const glass = (color = 0xcfe8ff, opacity = 0.35) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.1, depthWrite: false });
const steel = () => mat(0xb9bfc8, { roughness: 0.35, metalness: 0.5 });
const dark = () => mat(0x24262b, { roughness: 0.55 });
// Glowing circuit traces over a dark body
const circuit = (color) =>
  mat(0x1a1d24, { emissive: color, emissiveIntensity: 1.2, emissiveMap: itemTexture('circuit'), roughness: 0.4 });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
// Cylinder along Z: rBack at +Z (toward you), rFront at -Z
function tubeZ(rBack, rFront, length, material, z, x = 0, y = 0, seg = 16) {
  const m = mesh(new THREE.CylinderGeometry(rBack, rFront, length, seg), material, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}
// A pistol-style grip so blasters look held
function grip(g, color = 0x8a8f99) {
  const h = mesh(new THREE.BoxGeometry(0.045, 0.15, 0.07), mat(color, { map: itemTexture('carbon') }), 0, -0.02, 0.03);
  h.rotation.x = 0.25;
  g.add(h);
}

registerItemModel('whale-drop', () => {
  // A remote with a big red button and a tiny whale on top
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), mat(0xe8e8ee), 0, 0.02, -0.04));
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.02, 20), glow(0xff3030, 1.2), 0, 0.055, -0.07));
  const whale = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.04, 16, 12), mat(0x3d5f86));
  body.scale.set(1, 0.8, 1.8);
  const tail = mesh(new THREE.BoxGeometry(0.07, 0.008, 0.025), mat(0x3d5f86), 0, 0.01, 0.075);
  whale.add(body, tail);
  whale.position.set(0, 0.1, 0);
  g.add(whale);
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), steel(), 0.03, 0.08, 0.02)); // antenna
  return g;
});

registerItemModel('boomerang', () => {
  const g = new THREE.Group();
  const wood = mat(0xb5773a, { roughness: 0.6 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.12, 0.05, 0.26, 0.0);
  shape.lineTo(0.26, 0.05);
  shape.quadraticCurveTo(0.1, 0.1, 0.03, 0.06);
  shape.quadraticCurveTo(0.08, 0.2, 0.05, 0.3);
  shape.lineTo(0.0, 0.29);
  shape.quadraticCurveTo(0.03, 0.15, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2 });
  const b = new THREE.Mesh(geo, wood);
  b.rotation.set(-Math.PI / 2 + 0.3, 0, Math.PI * 0.75);
  b.position.set(0.05, 0.02, 0);
  g.add(b);
  // Painted dots
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), mat(i % 2 ? 0xfff2c8 : 0xc23b22), -0.02 + i * 0.03, 0.035, -0.06 - i * 0.02));
  return g;
});

registerItemModel('ufo-abduction', () => {
  // A toy UFO on a stick, beam glowing underneath
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), dark(), 0, 0.02, 0));
  const ufo = new THREE.Group();
  ufo.position.set(0, 0.17, -0.02);
  const saucer = mesh(new THREE.SphereGeometry(0.11, 24, 12), steel());
  saucer.scale.y = 0.25;
  ufo.add(saucer);
  ufo.add(mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass(0x8affc8, 0.6), 0, 0.015, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ufo.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), glow(i % 2 ? 0xffd23d : 0x7affc8, 2), Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1));
  }
  const beam = mesh(new THREE.ConeGeometry(0.06, 0.12, 16, 1, true), glass(0x9affd0, 0.3), 0, -0.07, 0);
  ufo.add(beam);
  g.add(ufo);
  return g;
});

registerItemModel('firework-launcher', () => {
  const g = new THREE.Group();
  grip(g);
  // A bundle of striped tubes
  const colors = [0xff4d6d, 0x4dd9ff, 0xffd23d, 0x9a6bff];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const x = Math.cos(a) * 0.035, y = 0.1 + Math.sin(a) * 0.035;
    g.add(tubeZ(0.028, 0.028, 0.4, mat(c), -0.14, x, y));
    const tip = mesh(new THREE.ConeGeometry(0.028, 0.06, 12), mat(0xffffff), x, y, -0.37);
    tip.rotation.x = -Math.PI / 2;
    g.add(tip);
  });
  g.add(tubeZ(0.07, 0.07, 0.04, mat(0x2b2b2b, { map: itemTexture('hazard') }), 0.05, 0, 0.1));
  return g;
});

registerItemModel('storm-cloud', () => {
  // A jar holding a tiny thundercloud
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.18, 24, 1, true), glass(0xcfe8ff, 0.3), 0, 0.09, -0.02));
  g.add(mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.025, 24), mat(0x8a6b45, { roughness: 0.7 }), 0, 0.19, -0.02)); // cork lid
  const cloud = mat(0x4a4e5a, { roughness: 1 });
  for (const [x, y, z, r] of [[0, 0.11, -0.02, 0.035], [0.025, 0.12, -0.01, 0.03], [-0.025, 0.115, -0.03, 0.03], [0.01, 0.135, -0.03, 0.028]]) {
    g.add(mesh(new THREE.SphereGeometry(r, 12, 10), cloud, x, y, z));
  }
  const bolt = new THREE.Shape();
  bolt.moveTo(0, 0); bolt.lineTo(0.015, 0.03); bolt.lineTo(0.005, 0.03); bolt.lineTo(0.02, 0.06);
  bolt.lineTo(-0.005, 0.025); bolt.lineTo(0.006, 0.025); bolt.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.004, bevelEnabled: false }), glow(0xbfe8ff, 3), -0.01, 0.02, -0.02));
  return g;
});

registerItemModel('decoy-clones', () => {
  // A hand mirror with little capsule people reflected in it
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), mat(0xc8a24a, { metalness: 0.45, roughness: 0.35 }), 0, 0, 0));
  const frame = mesh(new THREE.TorusGeometry(0.075, 0.012, 10, 32), mat(0xc8a24a, { metalness: 0.45, roughness: 0.35 }), 0, 0.15, 0);
  g.add(frame);
  g.add(mesh(new THREE.CircleGeometry(0.072, 32), mat(0xdfeeff, { metalness: 0.5, roughness: 0.05 }), 0, 0.15, 0.002));
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.CapsuleGeometry(0.01, 0.025, 4, 8), mat(0x6fb6ff), -0.03 + i * 0.03, 0.14, 0.012);
    g.add(c);
  }
  g.rotation.x = -0.3;
  return g;
});

registerItemModel('ice-field', () => {
  // An ice crystal wand
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.3, 10), mat(0xe8f4ff, { metalness: 0.4, roughness: 0.3 }), 0, 0.08, 0));
  const ice = new THREE.MeshStandardMaterial({ color: 0xaee6ff, emissive: 0x4fb8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.05 });
  const crystal = mesh(new THREE.OctahedronGeometry(0.06, 0), ice, 0, 0.28, 0);
  crystal.scale.set(0.7, 1.5, 0.7);
  g.add(crystal);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = mesh(new THREE.OctahedronGeometry(0.022, 0), ice, Math.cos(a) * 0.04, 0.24, Math.sin(a) * 0.04);
    s.scale.y = 1.8;
    s.rotation.z = Math.cos(a) * 0.6;
    s.rotation.x = Math.sin(a) * 0.6;
    g.add(s);
  }
  g.rotation.x = -0.4;
  return g;
});

registerItemModel('sonic-boom', () => {
  // A chunky speaker cannon
  const g = new THREE.Group();
  grip(g);
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.2), mat(0x9aa0aa, { map: itemTexture('carbon') }), 0, 0.12, -0.08));
  g.add(tubeZ(0.065, 0.065, 0.02, dark(), -0.19, 0, 0.12, 32));
  g.add(tubeZ(0.03, 0.055, 0.03, mat(0x3a3d44), -0.2, 0, 0.12, 32)); // cone
  g.add(mesh(new THREE.SphereGeometry(0.018, 12, 8), steel(), 0, 0.12, -0.215)); // dust cap
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.08 + i * 0.03, 0.003, 6, 40), glow(0xdff4ff, 2, { transparent: true, opacity: 0.6 - i * 0.18 }), 0, 0.12, -0.26 - i * 0.05);
    g.add(ring);
  }
  return g;
});

registerItemModel('giant-axe', () => {
  const g = new THREE.Group();
  const axe = new THREE.Group();
  axe.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.8, 10), mat(0x6b4423, { roughness: 0.8 }), 0, 0.25, 0));
  // Double-sided blade
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.12);
  blade.quadraticCurveTo(0.22, -0.2, 0.26, 0);
  blade.quadraticCurveTo(0.22, 0.2, 0, 0.12);
  blade.lineTo(0, -0.12);
  const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 2 });
  const steelMat = mat(0xc4cad2, { metalness: 0.5, roughness: 0.3 });
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(geo, steelMat);
    b.scale.x = s;
    b.position.set(0, 0.58, -0.01);
    axe.add(b);
  }
  axe.add(mesh(new THREE.BoxGeometry(0.07, 0.12, 0.06), dark(), 0, 0.58, 0)); // socket
  axe.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 8), steelMat, 0, 0.68, 0)); // spike
  axe.rotation.set(-0.8, 0, 0.15);
  g.add(axe);
  return g;
});

registerItemModel('shrink-ray', () => {
  const g = new THREE.Group();
  grip(g, 0x5a3a8a);
  g.add(tubeZ(0.05, 0.035, 0.22, circuit(0xc77dff), -0.08, 0, 0.1));
  for (let i = 0; i < 3; i++) g.add(tubeZ(0.045 - i * 0.01, 0.045 - i * 0.01, 0.012, glow(0xc77dff, 2), -0.22 - i * 0.035, 0, 0.1));
  const dish = mesh(new THREE.ConeGeometry(0.06, 0.05, 20, 1, true), mat(0xd8dde4, { metalness: 0.4, side: THREE.DoubleSide }), 0, 0.1, -0.33);
  dish.rotation.x = Math.PI / 2;
  g.add(dish);
  // A tiny mushroom on the back
  g.add(mesh(new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe8403a), 0, 0.165, 0.02));
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.02, 8), mat(0xfff2dc), 0, 0.155, 0.02));
  return g;
});

registerItemModel('balloon-gun', () => {
  const g = new THREE.Group();
  grip(g, 0xff6fa8);
  g.add(tubeZ(0.03, 0.03, 0.22, mat(0xff6fa8), -0.08, 0, 0.1));
  g.add(tubeZ(0.04, 0.03, 0.04, mat(0xffffff), -0.2, 0, 0.1));
  const colors = [0xff4d6d, 0x4dd9ff, 0xffd23d];
  colors.forEach((c, i) => {
    const b = mesh(new THREE.SphereGeometry(0.045, 14, 10), mat(c, { roughness: 0.25 }), (i - 1) * 0.06, 0.32 + (i % 2) * 0.04, 0.02);
    b.scale.y = 1.25;
    g.add(b);
    g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.2, 4), mat(0xffffff), (i - 1) * 0.03, 0.2, 0.02));
  });
  return g;
});

registerItemModel('falcon-punch', () => {
  // A flaming boxing gauntlet
  const g = new THREE.Group();
  const leather = mat(0xc4502a, { roughness: 0.45 });
  const fist = mesh(new THREE.SphereGeometry(0.075, 18, 14), leather, 0, 0.04, -0.06);
  fist.scale.set(1, 0.9, 1.15);
  g.add(fist);
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 16), mat(0xffd23d, { roughness: 0.5 }), 0, 0.02, 0.04).rotateX(Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    const f = mesh(new THREE.ConeGeometry(0.02, 0.08, 6), glow(i % 2 ? 0xff7a1a : 0xffd23d, 2.5, { transparent: true, opacity: 0.85 }), (Math.random() - 0.5) * 0.08, 0.1 + Math.random() * 0.03, -0.02 - i * 0.02);
    f.rotation.x = 0.6;
    g.add(f);
  }
  return g;
});

registerItemModel('anchor', () => {
  const g = new THREE.Group();
  const iron = mat(0x4a5058, { metalness: 0.45, roughness: 0.45 });
  const a = new THREE.Group();
  a.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 10), iron, 0, 0.1, 0));
  a.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), iron, 0, 0.33, 0));
  a.add(mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), iron, 0, 0.24, 0));
  const arc = mesh(new THREE.TorusGeometry(0.12, 0.016, 8, 24, Math.PI), iron, 0, -0.05, 0);
  arc.rotation.z = Math.PI;
  a.add(arc);
  for (const s of [-1, 1]) {
    const fluke = mesh(new THREE.ConeGeometry(0.03, 0.07, 4), iron, s * 0.12, -0.03, 0);
    fluke.rotation.z = -s * 0.5;
    a.add(fluke);
  }
  a.add(mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16), mat(0xc8a24a, { metalness: 0.4 }), 0, 0.37, 0).rotateY(Math.PI / 2)); // rope ring
  a.rotation.x = -0.5;
  g.add(a);
  return g;
});

registerItemModel('sticky-c4', () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), mat(0xd9c9a3, { roughness: 0.85 }), 0, 0.03, -0.04));
  g.add(mesh(new THREE.BoxGeometry(0.145, 0.02, 0.105), mat(0x2b2b2b, { map: itemTexture('hazard') }), 0, 0.03, -0.04)); // tape band
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.015, 0.035), dark(), 0.02, 0.067, -0.05)); // timer
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.004, 0.015), glow(0xff2020, 2.5), 0.02, 0.076, -0.05)); // red digits
  for (const [c, x] of [[0xd8342c, -0.03], [0x3a86ff, -0.04]]) {
    const wire = mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 12, Math.PI), mat(c), x, 0.065, -0.03);
    wire.rotation.y = Math.PI / 2;
    g.add(wire);
  }
  // Detonator clicker
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.07, 0.03), mat(0x3a3d44), 0, 0.02, 0.07));
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 10), glow(0xff3030, 1.2), 0, 0.06, 0.07));
  return g;
});

registerItemModel('darkness-bomb', () => {
  // A black orb wrapped in purple energy
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.075, 24, 18), mat(0x08080c, { roughness: 0.2, metalness: 0.4 }), 0, 0.09, -0.03));
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.09, 0.004, 6, 40), glow(0x8a3cff, 2.5), 0, 0.09, -0.03);
    ring.rotation.set(i * 1.05, i * 0.7, 0);
    g.add(ring);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.03, 12), steel(), 0, 0.17, -0.03)); // fuse cap
  return g;
});
