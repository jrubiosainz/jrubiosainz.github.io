import * as THREE from 'three';
import { LIGHTS } from './materials.js';
import { toThree, LAMP_HEAD } from './room.js';

// ---------------------------------------------------------------------------------------------------------------
// The desk lamp can be aimed: press and hold on it, then point. The shade (with its socket and bulb) swivels about
// the joint at the top of the stem, like a real ball joint, and the light goes with it.
//
// Lighting: the bake knows the lamp in its original pose only. Once the shade is turned away (more than a few
// degrees) the room's shader swaps the baked lamp for a live spot at the shade's mouth (same cone, power and colour
// as the 'lampi' bake light, blender/build_scene.py LAMP_SPOT) with a soft shadow map, plus that bake: the lamp's
// bounce light. Moving objects (Reachy, Stack-chan) already use analytic lamp light; they just follow the new pose.
// ---------------------------------------------------------------------------------------------------------------
const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SPOT = { energy: 48, radius: 0.03, cone: 108 * DEG, blend: 0.55 };   // defaults = blender/build_scene.py LAMP_SPOT
const PITCH = [-86 * DEG, 52 * DEG];          // how far the shade can tip (world elevation of the beam)
const YAW = 150 * DEG;                        // how far it can swing either side of where it was set
const REST = [0.8 * DEG, 3.5 * DEG];          // the baked lamp fades into the live one over these angles
const GAIN = 0.93;                            // live spot vs. the bake: measured at rest (qa), within 1% off the pool

// what the pointer can point the lamp at when it is on no prop: the room's big surfaces (three.js coordinates)
const ROOM = { x0: -1.70, x1: 1.30, y0: 0, y1: 2.80, z0: -0.62, z1: 2.90 };
const TOPS = [
  { y: 0.74, x0: -0.88, x1: 0.88, z0: -0.50, z1: 0.26 },    // desk
  { y: 0.78, x0: -1.70, x1: -1.10, z0: -0.40, z1: 0.62 },   // dresser
];

function spring(s, target, w, dt) {           // critically damped, implicit
  const hoo = dt * w * w;
  const f = 1 + 2 * dt * w;
  const det = 1 / (f + dt * hoo);
  const x = (f * s.x + dt * s.v + dt * hoo * target) * det;
  s.v = (s.v + hoo * (target - s.x)) * det;
  s.x = x;
}

export class LampLight {
  constructor({ room, quality = 'high' }) {
    const L = room.lmMeta?.lights || {};
    const get = (n) => room.byName.get(n);
    this.ok = !!(L.Lamp_LightPos && L.Lamp_LightAim && get('Lamp_Root'));
    if (!this.ok) return;
    const bulb = toThree(L.Lamp_LightPos.pos);
    const aim = toThree(L.Lamp_LightAim.pos);
    this.a0 = aim.clone().sub(bulb).normalize();
    // pivot: the joint on top of the stem (older bakes: the joint mesh's centre)
    let pivot = L.Lamp_Pivot ? toThree(L.Lamp_Pivot.pos) : null;
    if (!pivot) {
      const j = get('Lamp_Joint');
      j?.updateWorldMatrix(true, true);
      pivot = j ? new THREE.Box3().setFromObject(j).getCenter(new THREE.Vector3()) : bulb.clone();
    }
    this.pivotW = pivot;
    const mouth = L.Lamp_Mouth ? toThree(L.Lamp_Mouth.pos) : bulb.clone().addScaledVector(this.a0, 0.106);
    this.bulbRel = bulb.clone().sub(pivot);
    this.mouthRel = mouth.clone().sub(pivot);
    const sp = L.BL_LampSpot;
    const energy = sp?.energy ?? SPOT.energy;
    const cone = sp?.spot_size ?? SPOT.cone;
    const blend = sp?.spot_blend ?? SPOT.blend;
    const col = sp?.color ?? [1.0, 0.74, 0.5];
    const cosHalf = Math.cos(cone / 2);
    LIGHTS.spotCone.value.set(cosHalf, 1 / ((1 - cosHalf) * blend));
    // Cycles: I = P / 4pi W/sr, the diffuse bake stores E / pi
    LIGHTS.spotCol.value.setRGB(col[0], col[1], col[2]).multiplyScalar(energy / (4 * Math.PI * Math.PI) * GAIN);
    this.halfAngle = cone / 2;

    // the swivelling head, re-parented under a pivot at the joint (world transforms kept)
    const root = get('Lamp_Root');
    root.updateWorldMatrix(true, true);
    this.rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    this.pivot = new THREE.Group();
    this.pivot.name = 'Lamp_Pivot_Runtime';
    this.pivot.position.copy(root.worldToLocal(pivot.clone()));
    root.add(this.pivot);
    this.pivot.updateMatrixWorld(true);
    this.head = [];
    for (const n of LAMP_HEAD) {
      const o = get(n);
      if (!o) continue;
      o.updateWorldMatrix(true, true);
      this.pivot.attach(o);
      o.updateMatrix();
      this.head.push(o);
    }

    // aim state: world yaw (about +Y, from +Z toward +X) and pitch (elevation) of the beam
    this.yaw0 = Math.atan2(this.a0.x, this.a0.z);
    this.pitch0 = Math.asin(clamp(this.a0.y, -1, 1));
    this.yaw = { x: this.yaw0, v: 0 };
    this.pitch = { x: this.pitch0, v: 0 };
    this.target = { yaw: this.yaw0, pitch: this.pitch0 };
    this.held = false;
    this.moved = false;
    this.speed = 0;
    this.q = new THREE.Quaternion();
    this.dir = this.a0.clone();

    // shadow map: packed distance from the spot, rendered only while the live spot is in use
    const size = quality === 'mobile' ? 512 : 1024;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true,
    });
    this.rt.texture.name = 'LampShadow';
    this.cam = new THREE.PerspectiveCamera(2 * (this.halfAngle + 3 * DEG) / DEG, 1, 0.02, 6);
    this.distMat = new THREE.ShaderMaterial({
      uniforms: { uLight: { value: new THREE.Vector3() }, uFar: { value: 6 } },
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform vec3 uLight; uniform float uFar; varying vec3 vW;
        void main() { gl_FragColor = packDepthToRGBA(clamp(length(vW - uLight) / uFar, 0.0, 0.99999)); }`,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    LIGHTS.spotShadow.value = this.rt.texture;
    LIGHTS.spotShadowP.value.set(6, 1 / size, sp?.radius ?? SPOT.radius, 1);
    this.hidden = [];                          // meshes kept out of the shadow pass (glass, window, the head itself)
    this.clear = new THREE.Color();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._apply();
  }

  // things that do not cast the lamp's shadow
  exclude(...objs) {
    for (const o of objs) o?.traverse((m) => { if (m.isMesh) this.hidden.push(m); });
  }

  get live() { return this.ok && LIGHTS.lampRT.value > 0.001; }

  grab() { if (this.ok) { this.held = true; this.moved = true; } }

  release() { this.held = false; }

  // point the beam at a world position
  aimAt(p) {
    if (!this.ok) return;
    const d = this._v.copy(p).sub(this.pivotW);
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    let yaw = Math.atan2(d.x, d.z);
    // keep the swing continuous and within reach of the joint
    let dy = Math.atan2(Math.sin(yaw - this.yaw0), Math.cos(yaw - this.yaw0));
    dy = clamp(dy, -YAW, YAW);
    yaw = this.yaw0 + dy;
    this.target.yaw = yaw;
    this.target.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), PITCH[0], PITCH[1]);
  }

  // the pointer ray: the prop under it if any, else the desk, the dresser, walls, floor or ceiling
  aimAlong(ray, hit = null) {
    if (hit) { this.aimAt(hit); return; }
    const o = ray.origin;
    const d = ray.direction;
    let best = Infinity;
    const test = (t, ok) => { if (t > 0.05 && t < best && ok) best = t; };
    for (const top of TOPS) {
      if (Math.abs(d.y) < 1e-5) continue;
      const t = (top.y - o.y) / d.y;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      test(t, x >= top.x0 && x <= top.x1 && z >= top.z0 && z <= top.z1);
    }
    for (const [axis, v] of [['x', ROOM.x0], ['x', ROOM.x1], ['y', ROOM.y0], ['y', ROOM.y1], ['z', ROOM.z0], ['z', ROOM.z1]]) {
      if (Math.abs(d[axis]) < 1e-5) continue;
      test((v - o[axis]) / d[axis], true);
    }
    if (best < Infinity) this.aimAt(this._w.copy(o).addScaledVector(d, best));
  }

  update(dt) {
    if (!this.ok) return;
    const py = this.yaw.x;
    const pp = this.pitch.x;
    spring(this.yaw, this.target.yaw, this.held ? 16 : 10, dt);
    spring(this.pitch, this.target.pitch, this.held ? 16 : 10, dt);
    this.speed = Math.hypot(this.yaw.x - py, this.pitch.x - pp) / Math.max(dt, 1e-3);
    this._apply();
  }

  _apply() {
    // world rotation: tip about the horizontal axis across the rest beam, then swing about the vertical
    const up = this._w.set(0, 1, 0);
    const h = this._v.copy(this.a0).cross(up).normalize();
    const qp = new THREE.Quaternion().setFromAxisAngle(h, this.pitch.x - this.pitch0);
    const qy = new THREE.Quaternion().setFromAxisAngle(up, this.yaw.x - this.yaw0);
    this.q.copy(qy).multiply(qp);
    // pivot is a child of Lamp_Root: local = root^-1 * q * root
    this.pivot.quaternion.copy(this.rootQ).invert().multiply(this.q).multiply(this.rootQ);
    this.pivot.updateMatrixWorld(true);
    this.dir.copy(this.a0).applyQuaternion(this.q);
    LIGHTS.lampDir.value.copy(this.dir);
    LIGHTS.lampPos.value.copy(this.bulbRel).applyQuaternion(this.q).add(this.pivotW);
    LIGHTS.spotPos.value.copy(this.mouthRel).applyQuaternion(this.q).add(this.pivotW);
    LIGHTS.spotDir.value.copy(this.dir);
    LIGHTS.lampRT.value = smooth(REST[0], REST[1], this.dir.angleTo(this.a0));
  }

  // the shadow map of the live spot (call before the frame is drawn)
  renderShadow(renderer, scene) {
    if (!this.live || LIGHTS.lampK.value < 0.001) return;
    const cam = this.cam;
    cam.position.copy(LIGHTS.spotPos.value);
    cam.up.set(0, 1, 0);
    if (Math.abs(this.dir.y) > 0.98) cam.up.set(0, 0, 1);
    cam.lookAt(this._v.copy(cam.position).add(this.dir));
    cam.updateMatrixWorld(true);
    LIGHTS.spotMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.distMat.uniforms.uLight.value.copy(cam.position);
    const vis = this.hidden.map((m) => m.visible);
    for (const m of this.hidden) m.visible = false;
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    scene.overrideMaterial = this.distMat;
    scene.background = null;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.clear, prevAlpha);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    this.hidden.forEach((m, i) => { m.visible = vis[i]; });
  }
}
