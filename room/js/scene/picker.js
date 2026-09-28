import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Pointer picking without raycasting the whole (batched) room: every interactive prop gets an invisible oriented
// box proxy; small controls (buttons, keys, tapes) are raycast individually and win inside their own prop's box.
// ---------------------------------------------------------------------------------------------------------------
const hidden = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

export class Picker {
  constructor(camera) {
    this.camera = camera;
    this.ray = new THREE.Raycaster();
    this.groups = [];
    this.fine = [];
  }

  addGroup(name, root, info = {}, { pad = 0.004, only = null } = {}) {
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    const m = new THREE.Matrix4();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.userData.pickProxy) return;
      if (only && !only(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
    });
    if (box.isEmpty()) return null;
    box.expandByScalar(pad);
    const size = box.getSize(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), hidden);
    box.getCenter(proxy.position);
    proxy.userData.pickProxy = true;
    proxy.userData.pick = { kind: 'group', group: name, ...info };
    proxy.name = `Pick_${name}`;
    root.add(proxy);
    proxy.updateMatrixWorld(true);
    this.groups.push(proxy);
    return proxy;
  }

  // a hand-made proxy (e.g. a cylinder) when a box around the whole object would swallow its neighbours
  addProxy(name, parent, geometry, info = {}, position = null) {
    const proxy = new THREE.Mesh(geometry, hidden);
    if (position) proxy.position.copy(position);
    proxy.userData.pickProxy = true;
    proxy.userData.pick = { kind: 'group', group: name, ...info };
    proxy.name = `Pick_${name}`;
    parent.add(proxy);
    proxy.updateMatrixWorld(true);
    this.groups.push(proxy);
    return proxy;
  }

  addFine(mesh, info) {
    if (!mesh) return;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.pick = { kind: 'fine', ...info };
      this.fine.push(o);
    });
  }

  pick(ndc, { enabled = null } = {}) {
    this.ray.setFromCamera(ndc, this.camera);
    const ok = (p) => !enabled || enabled(p);
    const gh = this.ray.intersectObjects(this.groups, false).filter((h) => ok(h.object.userData.pick));
    const fh = this.ray.intersectObjects(this.fine, false);
    const g = gh[0];
    for (const h of fh) {
      const p = h.object.userData.pick;
      if (!ok(p)) continue;
      if (!g || h.distance <= g.distance + 0.002 || p.group === g.object.userData.pick.group) return { ...p, hit: h };
    }
    return g ? { ...g.object.userData.pick, hit: g } : null;
  }
}
