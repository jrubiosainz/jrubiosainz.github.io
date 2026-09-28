import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------------------------
// Static batching: every lightmapped mesh that never moves or reacts is baked into one draw call per material.
// The scene has ~1500 nodes (plant veins, rolodex cards, keys…); after this it renders in ~100 draw calls.
// ---------------------------------------------------------------------------------------------------------------
const ATTRS = { position: 3, normal: 3, uv: 2, uv1: 2, aMat: 4, aAlb: 4 };

function prepare(mesh) {
  let g = mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!(name in ATTRS)) { g.deleteAttribute(name); continue; }
    const a = g.attributes[name];
    if (a.isInterleavedBufferAttribute) g.setAttribute(name, a.clone());
  }
  const n = g.attributes.position.count;
  for (const [name, size] of Object.entries(ATTRS)) {
    if (!g.attributes[name]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * size), size));
    else if (!(g.attributes[name].array instanceof Float32Array)) {
      const a = g.attributes[name];
      const f = new Float32Array(a.count * size);
      for (let i = 0; i < a.count; i += 1) for (let k = 0; k < size; k += 1) f[i * size + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(f, size));
    }
  }
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

export function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.userData.mergeable || keep.has(o)) return;
    const list = groups.get(o.material) || [];
    list.push(o);
    groups.set(o.material, list);
  });
  let before = 0;
  let after = 0;
  for (const [material, meshes] of groups) {
    before += meshes.length;
    if (meshes.length < 2) { after += meshes.length; continue; }
    const merged = mergeGeometries(meshes.map(prepare), false);
    if (!merged) { after += meshes.length; continue; }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const m = new THREE.Mesh(merged, material);
    m.name = `Batch_${after}`;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    for (const mesh of meshes) mesh.removeFromParent();
    root.add(m);
    m.updateMatrixWorld(true);
    after += 1;
  }
  return { before, after };
}
