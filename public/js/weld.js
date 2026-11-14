import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Welding: turning many small meshes into a few big ones.
//
// Every separate mesh costs the same fixed amount of work to draw, however tiny it is, so a
// character or a rock built from dozens of little parts is far more expensive than it looks.
// weldParts(root) merges the meshes that sit directly inside the same Group and share a
// material into one mesh. Things that move on their own are separate Groups, so they keep
// moving; only parts that are fixed to each other get welded.
//
//   weldParts(root)                         weld everything under root
//   weldParts(root, { keep: new Set([m]) }) ...but leave these meshes alone (other code uses them)
//   weldParts(root, { remember: true })     reuse the welded shapes for the next identical object
//                                           (only when the source shapes are shared and never change)
//
// Meshes with userData, children, several materials, or that are hidden are left as they are.

const NOTHING = new Set();
const welded = new Map(); // fingerprint of the parts -> merged geometry
const round = (v) => Math.round(v * 1e4);
function fingerprint(mesh) {
  const pos = mesh.geometry.attributes.position;
  const a = pos.array, n = a.length, mid = (n >> 1) - ((n >> 1) % 3);
  let s = `${n}:${mesh.geometry.index ? mesh.geometry.index.count : 0}:${round(a[0])},${round(a[1])},${round(a[2])},${round(a[mid])},${round(a[mid + 1])},${round(a[mid + 2])},${round(a[n - 3])},${round(a[n - 2])},${round(a[n - 1])}@`;
  const e = mesh.matrix.elements;
  for (let i = 0; i < 15; i++) if (i !== 3 && i !== 7 && i !== 11) s += round(e[i]) + ',';
  return s;
}
function weldable(o, keep) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o) || o.children.length || !o.visible) return false;
  if (Array.isArray(o.material) || Object.keys(o.userData).length) return false;
  const at = o.geometry.attributes;
  if (!at.position || !at.normal || !at.uv || at.position.isInterleavedBufferAttribute) return false;
  o.updateMatrix();
  return o.matrix.determinant() > 0; // mirrored parts would come out inside-out
}
export function weldParts(root, { keep = NOTHING, remember = false } = {}) {
  const limbs = [];
  root.traverse((o) => {
    if (!o.isMesh) limbs.push(o);
  });
  for (const limb of limbs) {
    const buckets = new Map();
    for (const ch of limb.children) {
      if (!weldable(ch, keep)) continue;
      const k = `${ch.material.uuid}|${ch.castShadow}|${ch.receiveShadow}|${ch.renderOrder}|${ch.layers.mask}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(ch);
    }
    for (const parts of buckets.values()) {
      if (parts.length < 2) continue;
      const key = remember ? parts.map(fingerprint).join('|') : null;
      let geo = remember ? welded.get(key) : null;
      if (!geo) {
        const pieces = parts.map((p) => {
          const src = p.geometry;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', src.attributes.position.clone());
          g.setAttribute('normal', src.attributes.normal.clone());
          g.setAttribute('uv', src.attributes.uv.clone());
          if (src.index) g.setIndex(src.index.clone());
          g.applyMatrix4(p.matrix);
          return g;
        });
        const mixed = pieces.some((g) => g.index) && pieces.some((g) => !g.index);
        geo = mergeGeometries(mixed ? pieces.map((g) => (g.index ? g.toNonIndexed() : g)) : pieces, false);
        if (!geo) continue; // couldn't be merged: leave the parts as they are
        if (remember) welded.set(key, geo);
      }
      const first = parts[0];
      const m = new THREE.Mesh(geo, first.material);
      m.castShadow = first.castShadow;
      m.receiveShadow = first.receiveShadow;
      m.renderOrder = first.renderOrder;
      m.layers.mask = first.layers.mask;
      for (const p of parts) limb.remove(p);
      limb.add(m);
    }
  }
}
