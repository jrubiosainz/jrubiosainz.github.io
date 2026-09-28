import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import { dynamicMaterial } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// Reachy Mini, the little open-source desk robot by Pollen Robotics (github.com/pollen-robotics/reachy_mini,
// Apache-2.0), sitting where the pencil cup used to be. The parts are its own CAD meshes (blender/reachy/
// build_reachy.py → assets/reachy/), the head rides a six-legged Stewart platform solved here with the robot's
// geometry, and waking up / going to sleep replay the SDK's wake_up() and goto_sleep() timelines, sounds included.
// Awake, it looks at whatever the pointer is on, turning its body when the head alone can't get there.
//
// Robot frame: X forward, Y left, Z up, metres, origin under the foot. three.js: (x, y, z)robot → (x, z, -y).
// Head poses follow the SDK: a 4×4 pose of the head relative to its neutral position (head_z_offset above the base).
// ---------------------------------------------------------------------------------------------------------------
export const REACHY_SPOT = { x: -0.57, y: 0.74, z: -0.05, rz: -73.2 };   // twin of blender/lib/layout.py SPOTS['reachy']

const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const minJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);        // reachy_mini.utils.interpolation (MIN_JERK)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rowMajor = (a) => new THREE.Matrix4().set(...a);

const C = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);  // robot → glTF (Y up)
const Ci = C.clone().invert();

// SDK limits (analytical_kinematics: max_relative_yaw 65°, max_body_yaw 160°) and a comfortable look range
const MAX_REL_YAW = 65 * DEG;
const MAX_BODY_YAW = 160 * DEG;
const PITCH_UP = -30 * DEG;
const PITCH_DOWN = 28 * DEG;

// speech sway, after reachy_mini.motion.speech_tapper (SWAY_* tunables)
const SWAY = {
  pitch: [2.2, 4.5 * DEG], yaw: [0.6, 7.5 * DEG], roll: [1.3, 2.25 * DEG],
  x: [0.35, 0.0045], y: [0.45, 0.00375], z: [0.25, 0.00225],
};

// how the CAD materials read under the lamp: [specular, rim]
const LOOK = {
  reachy_white: [0.55, 0.9],
  reachy_lens: [1.4, 0.3],
  reachy_black: [0.8, 0.5],
  reachy_frame: [0.6, 0.5],
  reachy_dark: [0.45, 0.5],
  reachy_antenna: [0.7, 0.8],
  reachy_metal: [0.9, 0.5],
  reachy_rod: [0.8, 0.5],
};

function spring(s, target, w, dt) {           // critically damped, implicit (stable at any dt)
  const hoo = dt * w * w;
  const f = 1 + 2 * dt * w;
  const det = 1 / (f + dt * hoo);
  const x = (f * s.x + dt * s.v + dt * hoo * target) * det;
  s.v = (s.v + hoo * (target - s.x)) * det;
  s.x = x;
}

class Pose {
  constructor() { this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); }
  copy(o) { this.p.copy(o.p); this.q.copy(o.q); return this; }
  fromMatrix(m) { m.decompose(this.p, this.q, new THREE.Vector3()); return this; }
  fromEuler(roll, pitch, yaw) {                 // R = Rz(yaw) · Ry(pitch) · Rx(roll), like scipy 'xyz' extrinsic
    this.q.setFromEuler(new THREE.Euler(roll, pitch, yaw, 'ZYX'));
    return this;
  }
  angleTo(o) { return this.q.angleTo(o.q) + this.p.distanceTo(o.p) * 20; }
}

export async function loadReachy({ base = 'assets/reachy/' } = {}) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/three/draco/');
  loader.setDRACOLoader(draco);
  const [rig, gltf] = await Promise.all([
    fetch(`${base}rig.json`).then((r) => r.json()),
    loader.loadAsync(`${base}reachy.glb`),
  ]);
  draco.dispose();
  return new Reachy(rig, gltf.scene);
}

export class Reachy {
  constructor(rig, scene) {
    this.root = new THREE.Group();
    this.root.name = 'Reachy_Root_Runtime';
    this.root.position.set(REACHY_SPOT.x, REACHY_SPOT.y, REACHY_SPOT.z);
    this.root.rotation.y = REACHY_SPOT.rz * DEG;
    const model = scene.getObjectByName('Reachy_Root') || scene;
    this.root.add(model);
    this.parts = {};
    for (const o of model.children) {
      if (!o.name?.startsWith('Reachy_')) continue;
      this.parts[o.name.slice('Reachy_'.length)] = o;
      o.matrixAutoUpdate = false;
    }
    // live-lit materials (lamp cone, TV, window rim), one per CAD material
    const mats = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      if (!mats.has(src)) {
        const [spec, rim] = LOOK[src.name] || [0.5, 0.5];
        const m = dynamicMaterial({
          useAtlas: false, color: src.color, rough: src.roughness ?? 0.5, spec, metal: src.metalness ?? 0,
          ambient: new THREE.Color(0.055, 0.042, 0.034),
        });
        m.uniforms.uLampPower.value = 0.24;
        m.uniforms.uTvPower.value = 0.014;
        m.uniforms.uSpill.value = 0.011;
        m.uniforms.uRim.value.setRGB(0.05, 0.036, 0.03).multiplyScalar(rim);
        m.name = `live_${src.name}`;
        mats.set(src, m);
      }
      o.material = mats.get(src);
      o.frustumCulled = false;
    });
    this.materials = [...mats.values()];

    // kinematics ---------------------------------------------------------------------------------------------
    this.rest = Object.fromEntries(Object.entries(rig.rest).map(([k, v]) => [k, rowMajor(v)]));
    this.z0 = rig.head_z_offset;
    this.headInit = rowMajor(rig.init_head_part);        // Head part when the SDK pose is identity
    const headRestInv = this.rest.Head.clone().invert();
    this.legs = rig.legs.map((l) => {
      const hornRest = this.rest[l.horn];
      const arm = new THREE.Vector3(...l.arm);
      const hp = new THREE.Vector3(...l.head_point);
      const a0 = arm.clone().applyMatrix4(hornRest);
      const b0 = hp.clone().applyMatrix4(this.rest.Head);
      return {
        horn: this.parts[l.horn], rod: this.parts[l.rod], hornRest, hornRestInv: hornRest.clone().invert(),
        arm, hp, len2: l.length * l.length, a0, u0: b0.clone().sub(a0).normalize(), rodRest: this.rest[l.rod],
      };
    });
    this.theta = [...(rig.init_joints || [0, 0, 0, 0, 0, 0])];
    this.antOff = {
      Antenna_L: headRestInv.clone().multiply(this.rest.Antenna_L),
      Antenna_R: headRestInv.clone().multiply(this.rest.Antenna_R),
    };
    this.INIT = new Pose();
    this.SLEEP = new Pose().fromMatrix(rowMajor(rig.sleep_head));
    this.INIT_ANT = [...rig.init_antennas];
    this.SLEEP_ANT = [...rig.sleep_antennas];

    // state --------------------------------------------------------------------------------------------------
    this.state = 'asleep';          // asleep | waking | awake | sleeping
    this.pose = new Pose().copy(this.SLEEP);
    this.ant = [...this.SLEEP_ANT];
    this.body = 0;
    this.seq = [];
    this.step = null;
    this.onEvent = () => {};
    this.target = null;             // world point to look at
    this.targetAt = 0;
    this.glance = null;
    this.nextGlance = 0;
    this.yaw = { x: 0, v: 0 };
    this.pitch = { x: 0, v: 0 };
    this.bodyS = { x: 0, v: 0 };
    this.talk = null;
    this.loud = 0;
    this.time = 0;
    this._m = Array.from({ length: 8 }, () => new THREE.Matrix4());
    this._v = Array.from({ length: 4 }, () => new THREE.Vector3());
    this._q = new THREE.Quaternion();
    this._pose = new Pose();
    this._off = new Pose();
    this._apply(0);
  }

  get awake() { return this.state === 'awake'; }
  get busy() { return this.state === 'waking' || this.state === 'sleeping'; }

  // ---- behaviour ------------------------------------------------------------------------------------------------
  wake() {
    if (this.state === 'awake' || this.state === 'waking') return false;
    this.state = 'waking';
    const roll = new Pose().fromEuler(20 * DEG, 0, 0);
    this._run([
      { goto: this.INIT, ant: this.INIT_ANT, body: 0, dur: 2.0 },
      { wait: 0.1 },
      { call: () => this.onEvent('sound', 'reachy_wake') },     // "toudoum"
      { goto: roll, dur: 0.2 },                                  // roll 20° to the left…
      { goto: this.INIT, dur: 0.2 },                             // …and back
      { call: () => { this._enterAwake(); this.onEvent('awake'); } },
    ]);
    return true;
  }

  sleep() {
    if (this.state === 'asleep' || this.state === 'sleeping') return false;
    this.state = 'sleeping';
    this.talk = null;
    const far = this.pose.angleTo(this.INIT) > 0.2 || Math.abs(this.body) > 0.1;
    this._run([
      ...(far ? [{ goto: this.INIT, ant: this.INIT_ANT, body: 0, dur: 1.0 }, { wait: 0.2 }] : []),
      { call: () => this.onEvent('sound', 'reachy_sleep') },    // "pfiou"
      { goto: this.SLEEP, ant: this.SLEEP_ANT, body: 0, dur: 2.0 },
      { wait: 2.0 },
      { call: () => { this.state = 'asleep'; this.onEvent('asleep'); } },
    ]);
    return true;
  }

  toggle() { return this.state === 'awake' || this.state === 'waking' ? this.sleep() : this.wake(); }

  lookAt(point) {
    if (!point) { this.target = null; return; }
    if (!this.target) this.target = new THREE.Vector3();
    if (this.target.distanceToSquared(point) > 1e-4) this.targetAt = this.time;
    this.target.copy(point);
  }

  // env: loudness 0..1 sampled at `rate` Hz, starting when the voice starts
  speak(env, rate, delay = 0) { this.talk = { env, rate, t0: this.time + delay }; }
  silence() { this.talk = null; }

  // top of the head in world space (for the speech bubble)
  headTop(out = new THREE.Vector3()) {
    const P = this._pose;
    out.set(P.p.x + 0.004, P.p.y, P.p.z + this.z0 + 0.105);          // above the antennas' springs
    out.set(out.x, out.z, -out.y);
    return this.root.localToWorld(out);
  }

  _enterAwake() {
    this.state = 'awake';
    const e = new THREE.Euler().setFromQuaternion(this.pose.q, 'ZYX');
    this.yaw.x = e.z; this.yaw.v = 0;
    this.pitch.x = e.y; this.pitch.v = 0;
    this.bodyS.x = this.body; this.bodyS.v = 0;
    this.targetAt = this.time;
    this.nextGlance = this.time + 6;
  }

  _run(steps) { this.seq = steps; this.step = null; }

  _advance(dt) {
    while (this.seq.length || this.step) {
      if (!this.step) {
        const s = this.seq.shift();
        if (s.call) { s.call(); continue; }
        this.step = { ...s, t: 0, from: new Pose().copy(this.pose), ant0: [...this.ant], body0: this.body };
      }
      const s = this.step;
      s.t += dt;
      dt = 0;
      if (s.goto) {
        const k = minJerk(clamp(s.t / s.dur, 0, 1));
        this.pose.p.lerpVectors(s.from.p, s.goto.p, k);
        this.pose.q.slerpQuaternions(s.from.q, s.goto.q, k);
        if (s.ant) for (let i = 0; i < 2; i += 1) this.ant[i] = s.ant0[i] + (s.ant[i] - s.ant0[i]) * k;
        if (s.body !== undefined) this.body = s.body0 + (s.body - s.body0) * k;
        if (s.t < s.dur) return;
      } else if (s.wait && s.t < s.wait) return;
      dt = s.t - (s.dur ?? s.wait ?? 0);
      this.step = null;
      if (dt <= 0) dt = 0;
    }
  }

  _track(dt, time) {
    // where to look: the pointer target, or an idle glance when the pointer has been still for a while
    let yawT = 0;
    let pitchT = 0;
    if (time > this.nextGlance && time - this.targetAt > 5) {
      this.glance = { yaw: (Math.random() * 2 - 1) * 35 * DEG, pitch: (Math.random() * 2 - 1) * 12 * DEG - 4 * DEG, until: time + 1.2 + Math.random() * 1.6 };
      this.nextGlance = time + 3.5 + Math.random() * 4;
    }
    if (this.glance && (time > this.glance.until || time - this.targetAt < 0.1)) this.glance = null;
    if (this.glance) {
      yawT = this.glance.yaw;
      pitchT = this.glance.pitch;
    } else if (this.target) {
      const v = this.root.worldToLocal(this._v[0].copy(this.target));
      const dx = v.x;
      const dy = -v.z;
      const dz = v.y - this.z0;
      yawT = Math.atan2(dy, dx);
      pitchT = -Math.atan2(dz, Math.hypot(dx, dy));
    }
    yawT = clamp(yawT, -MAX_BODY_YAW * 0.75, MAX_BODY_YAW * 0.75);
    pitchT = clamp(pitchT, PITCH_UP, PITCH_DOWN);
    spring(this.yaw, yawT, 7.5, dt);
    spring(this.pitch, pitchT, 7.5, dt);
    // the body shares big turns, and must keep the head within its mechanical range
    const y = this.yaw.x;
    let bodyT = Math.sign(y) * Math.max(0, Math.abs(y) - 25 * DEG) * 0.6;
    bodyT = clamp(bodyT, y - MAX_REL_YAW + 2 * DEG, y + MAX_REL_YAW - 2 * DEG);
    spring(this.bodyS, clamp(bodyT, -MAX_BODY_YAW, MAX_BODY_YAW), 3.2, dt);
    this.body = clamp(this.bodyS.x, y - MAX_REL_YAW, y + MAX_REL_YAW);
    this.pose.p.set(0, 0, 0);
    this.pose.fromEuler(0, this.pitch.x, this.yaw.x);
    // antennas: at rest ±10°, with a lazy drift
    const s = 4 * DEG;
    this.ant[0] = this.INIT_ANT[0] + Math.sin(time * 0.63) * s + Math.sin(time * 1.37 + 1) * s * 0.4;
    this.ant[1] = this.INIT_ANT[1] - Math.sin(time * 0.58 + 2) * s - Math.sin(time * 1.21) * s * 0.4;
  }

  update(dt, time) {
    this.time = time;
    dt = Math.min(dt, 0.1);
    this._dt = dt;
    if (this.seq.length || this.step) this._advance(dt);
    else if (this.state === 'awake') this._track(dt, time);
    this._apply(time);
  }

  // ---- pose → parts -----------------------------------------------------------------------------------------------
  _offsets(time) {
    const O = this._off;
    O.p.set(0, 0, 0);
    O.q.identity();
    // breathing: awake a small lift, asleep a slow sigh
    const awake = this.state === 'awake' || this.state === 'waking';
    const br = awake ? 0.0012 : 0.0006;
    O.p.z += Math.sin(time * (awake ? 1.25 : 0.9)) * br;
    // speech sway (loudness-driven)
    let target = 0;
    if (this.talk) {
      const i = (time - this.talk.t0) * this.talk.rate;
      const env = this.talk.env;
      if (i >= env.length) this.talk = null;
      else if (i >= 0) {
        const i0 = Math.floor(i);
        const f = i - i0;
        target = (env[i0] ?? 0) * (1 - f) + (env[Math.min(env.length - 1, i0 + 1)] ?? 0) * f;
      }
    }
    this.loud += (target - this.loud) * (1 - Math.exp(-(target > this.loud ? 1 / 0.05 : 1 / 0.25) * (this._dt || 0.016)));
    const L = this.state === 'awake' ? this.loud * 1.5 : 0;
    if (L > 0.002) {
      const sw = (k, ph = 0) => Math.sin(2 * Math.PI * SWAY[k][0] * time + ph) * SWAY[k][1] * L;
      O.p.x += sw('x');
      O.p.y += sw('y', 1.3);
      O.p.z += sw('z', 0.4);
      this._q.setFromEuler(new THREE.Euler(sw('roll', 2.1), sw('pitch', 0.7), sw('yaw', 1.9), 'ZYX'));
      O.q.multiply(this._q);
    }
    return O;
  }

  _apply(time) {
    const [mP, H, Hb, Rz, T, mA, mB, mTz] = this._m;
    const [va, vb, vu, vp] = this._v;
    const off = this._offsets(time);
    const P = this._pose.copy(this.pose);
    P.p.add(off.p);
    P.q.multiply(off.q);
    const ant = this.state === 'awake' ? this.ant.map((a, i) => a + Math.sin(time * 8.5 + i * 1.7) * this.loud * 0.3) : this.ant;
    // Head part, robot frame: Tz(z0) · P · Tz(-z0) · head_init
    mP.compose(P.p, P.q, vp.set(1, 1, 1));
    H.makeTranslation(0, 0, this.z0).multiply(mP).multiply(mTz.makeTranslation(0, 0, -this.z0)).multiply(this.headInit);
    // the Stewart platform turns with the body
    Rz.makeRotationZ(-this.body);
    Hb.multiplyMatrices(Rz, H);
    Rz.makeRotationZ(this.body);
    for (let i = 0; i < 6; i += 1) {
      const L = this.legs[i];
      // horn angle: the rod (length L) must join the horn's ball to the head's ball
      const p = vp.copy(L.hp).applyMatrix4(Hb).applyMatrix4(L.hornRestInv);
      const a = L.arm;
      const A = a.x * p.x + a.y * p.y;
      const B = a.x * p.y - a.y * p.x;
      const Cc = (a.lengthSq() + p.lengthSq() - L.len2) / 2 - a.z * p.z;
      const r = Math.hypot(A, B) || 1e-9;
      const base = Math.atan2(B, A);
      const d = Math.acos(clamp(Cc / r, -1, 1));
      const s1 = wrap(base + d);
      const s2 = wrap(base - d);
      const prev = this.theta[i];
      this.theta[i] = Math.abs(wrap(s1 - prev)) <= Math.abs(wrap(s2 - prev)) ? s1 : s2;
      // horn
      mA.makeRotationZ(this.theta[i]).premultiply(L.hornRest);          // body frame
      T.multiplyMatrices(Rz, mA);
      this._set(L.horn, T);
      // rod: from the horn's ball (A) to the head's ball (B)
      va.copy(L.arm).applyMatrix4(mA);
      vb.copy(L.hp).applyMatrix4(Hb);
      vu.subVectors(vb, va).normalize();
      this._q.setFromUnitVectors(L.u0, vu);
      mB.makeTranslation(-L.a0.x, -L.a0.y, -L.a0.z).premultiply(T.makeRotationFromQuaternion(this._q));
      mB.premultiply(T.makeTranslation(va.x, va.y, va.z)).multiply(L.rodRest);
      T.multiplyMatrices(Rz, mB);
      this._set(L.rod, T);
    }
    this._set(this.parts.Head, H);
    for (const [name, a] of [['Antenna_L', ant[0]], ['Antenna_R', ant[1]]]) {
      T.multiplyMatrices(H, this.antOff[name]).multiply(mA.makeRotationZ(a));
      this._set(this.parts[name], T);
    }
    T.multiplyMatrices(Rz, this.rest.Body);
    this._set(this.parts.Body, T);
    this._set(this.parts.Foot, this.rest.Foot);
  }

  _set(obj, M) {
    if (!obj) return;
    obj.matrix.multiplyMatrices(C, M).multiply(Ci);
    obj.matrixWorldNeedsUpdate = true;
  }
}
