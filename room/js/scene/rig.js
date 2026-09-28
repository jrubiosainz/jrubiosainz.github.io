import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Camera rig: named views (from the Blender cameras), eased flights between them, drag-to-look with a soft spring
// back, pointer parallax, a breathing idle drift and per-view depth of field.
// ---------------------------------------------------------------------------------------------------------------
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
const LOOK_DEFAULT = { limitYaw: 1.25, limitUp: 0.5, limitDown: 0.5, spring: true, speed: 1 };

export class Rig {
  constructor(camera, views, { reducedMotion = false } = {}) {
    this.camera = camera;
    this.views = views;
    this.reduced = reducedMotion;
    this.cur = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
    this.from = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
    this.to = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
    this.t = 1;
    this.dur = 1.4;
    this.arc = 0;
    this.name = null;
    // free look (radians), pointer parallax (-1..1)
    this.look = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, dragging: false, releasedAt: -1, ...LOOK_DEFAULT };
    this.pointer = new THREE.Vector2();
    this.parallax = new THREE.Vector2();
    this.parallaxK = 1;
    this.focus = 2.2;
    this.aperture = 12;
    this.time = 0;
    this.onArrive = null;
    this.adaptFov = (f) => f;      // maps the authored (16:10) vertical fov to the current aspect
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._up = new THREE.Vector3(0, 1, 0);
    this._m = new THREE.Matrix4();
    this._fwd = new THREE.Vector3();
  }

  get moving() { return this.t < 1; }

  view(name) { return this.views[name]; }

  // opts: { duration, arc (m lift at mid-flight), fov, target, pos, instant }
  go(name, opts = {}) {
    const v = typeof name === 'string' ? this.views[name] : name;
    if (!v) return;
    this.name = typeof name === 'string' ? name : (opts.name || 'custom');
    this.from.pos.copy(this.cur.pos);
    this.from.target.copy(this.cur.target);
    this.from.fov = this.cur.fov;
    this.to.pos.copy(opts.pos || v.pos);
    this.to.target.copy(opts.target || v.target);
    this.to.fov = opts.fov || v.fov;
    const dist = this.from.pos.distanceTo(this.to.pos) + this.from.target.distanceTo(this.to.target) * 0.5;
    this.dur = opts.instant || this.reduced ? 0 : (opts.duration ?? THREE.MathUtils.clamp(0.9 + dist * 0.55, 1.0, 2.1));
    this.arc = opts.arc ?? Math.min(0.12, dist * 0.05);
    this.t = this.dur === 0 ? 1 : 0;
    this.onArrive = opts.onArrive || null;
    this.look.tyaw = 0;
    this.look.tpitch = 0;
    if (this.dur === 0) {
      this.cur.pos.copy(this.to.pos);
      this.cur.target.copy(this.to.target);
      this.cur.fov = this.to.fov;
      this._arrive();
    }
  }

  _arrive() {
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  // free-look range for the current view (radians); spring = drift back to the framing after letting go
  setLook(opts = null) {
    Object.assign(this.look, LOOK_DEFAULT, opts || {});
    this.look.tyaw = THREE.MathUtils.clamp(this.look.tyaw, -this.look.limitYaw, this.look.limitYaw);
    this.look.tpitch = THREE.MathUtils.clamp(this.look.tpitch, -this.look.limitDown, this.look.limitUp);
  }

  dragStart() { this.look.dragging = true; }

  drag(dx, dy) {
    const L = this.look;
    const k = (this.camera.fov / 45) * L.speed;
    L.tyaw = THREE.MathUtils.clamp(L.tyaw - dx * 0.0042 * k, -L.limitYaw, L.limitYaw);
    L.tpitch = THREE.MathUtils.clamp(L.tpitch - dy * 0.0036 * k, -L.limitDown, L.limitUp);
  }

  dragEnd() {
    this.look.dragging = false;
    this.look.releasedAt = this.time;
  }

  setPointer(x, y) { this.pointer.set(x, y); }

  update(dt) {
    this.time += dt;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / Math.max(this.dur, 1e-3));
      const e = easeInOut(this.t);
      this.cur.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.cur.pos.y += Math.sin(Math.PI * e) * this.arc;
      // aim: lerp the target, so the camera turns smoothly while flying
      this.cur.target.lerpVectors(this.from.target, this.to.target, easeInOut(Math.min(1, this.t * 1.12)));
      this.cur.fov = THREE.MathUtils.lerp(this.from.fov, this.to.fov, e);
      if (this.t >= 1) this._arrive();
    }
    // spring back from free look ~0.9 s after release
    const L = this.look;
    if (L.spring && !L.dragging && L.releasedAt >= 0 && this.time - L.releasedAt > 0.9) {
      L.tyaw = damp(L.tyaw, 0, 2.2, dt);
      L.tpitch = damp(L.tpitch, 0, 2.2, dt);
      if (Math.abs(L.tyaw) < 1e-4 && Math.abs(L.tpitch) < 1e-4) L.releasedAt = -1;
    }
    L.yaw = damp(L.yaw, L.tyaw, L.dragging ? 14 : 6, dt);
    L.pitch = damp(L.pitch, L.tpitch, L.dragging ? 14 : 6, dt);
    const px = this.reduced ? 0 : this.pointer.x;
    const py = this.reduced ? 0 : this.pointer.y;
    this.parallax.x = damp(this.parallax.x, px, 2.5, dt);
    this.parallax.y = damp(this.parallax.y, py, 2.5, dt);

    const cam = this.camera;
    // base orientation looking at the target
    this._m.lookAt(this.cur.pos, this.cur.target, this._up);
    this._q.setFromRotationMatrix(this._m);
    // breathing drift + parallax (tiny, only when not flying)
    const settle = this.reduced ? 0 : 1 - Math.min(1, (1 - this.t) * 4);
    const breathe = this.reduced ? 0 : 1;
    const bx = Math.sin(this.time * 0.23) * 0.0035 * breathe + this.parallax.x * 0.012 * this.parallaxK * settle;
    const by = Math.sin(this.time * 0.31 + 1.3) * 0.0025 * breathe + this.parallax.y * 0.008 * this.parallaxK * settle;
    cam.position.copy(this.cur.pos);
    cam.position.add(new THREE.Vector3(bx, by, 0).applyQuaternion(this._q));
    this._e.set(L.pitch + this.parallax.y * 0.012 * settle, L.yaw - this.parallax.x * 0.018 * settle, 0, 'YXZ');
    cam.quaternion.copy(this._q).multiply(new THREE.Quaternion().setFromEuler(this._e));
    const fov = this.adaptFov(this.cur.fov);
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // focus on the target, a little in front when looking around
    const fd = this.cur.pos.distanceTo(this.cur.target);
    const lookAway = Math.min(1, Math.hypot(L.yaw, L.pitch) * 1.6);
    this.focus = THREE.MathUtils.lerp(fd, Math.max(fd, 2.4), lookAway);
  }
}
