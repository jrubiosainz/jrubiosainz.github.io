import * as THREE from 'three';
import { LIGHTS } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// The "This is fine" diorama on the dresser (blender/lib/props_toys.py), shaped like the figurine with light-up
// flames: a calm rubber duck having its coffee while laser-cut acrylic flames rise around it. Press it and the LEDs
// in the base light the acrylic up (vibrant orange, hottest along the printed border band), the fire crackles and a
// very calm voice says it's fine. Then it goes dark again. The flames are drawn here; their light on the dresser, the PC and the wall uses the room's live
// point lights (materials.js).
// ---------------------------------------------------------------------------------------------------------------
const FLAMES = ['Fine_Flame_Back', 'Fine_Flame_Left', 'Fine_Flame_Right'];
const SHOW = { ramp: 0.22, voice: 1.05, hold: 6.2, fade: 0.9 };

function flameMaterial({ height, line }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uOn: { value: 0 }, uH: { value: height }, uLine: { value: line ? 1 : 0 }, uPlaneN: { value: new THREE.Vector3(0, 0, 1) },
      uLampK: LIGHTS.lampK, uAmbK: LIGHTS.ambK, uLampPos: LIGHTS.lampPos, uHover: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP; varying float vY;
      void main() { vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uOn; uniform float uH; uniform float uLine; uniform vec3 uPlaneN;
      uniform float uLampK; uniform float uAmbK; uniform vec3 uLampPos; uniform float uHover;
      varying vec3 vN; varying vec3 vP; varying float vY;
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vP);
        if (dot(N, V) < 0.0) N = -N;
        float h = clamp(vY / uH, 0.0, 1.0);
        // the cut edges of the sheet (normals in its plane) and the engraved line catch the light
        float edge = max(1.0 - abs(dot(N, uPlaneN)), uLine);
        // off: pale amber acrylic with a saturated orange border band (the printed edge of the figurine's flames) in a
        // dim room, a little sheen from the lamp. The tone mapper turns saturated orange toward yellow, so the pigments
        // lean red
        vec3 amber = mix(vec3(1.0, 0.62, 0.16), vec3(1.0, 0.36, 0.04), edge);
        vec3 L = normalize(uLampPos - vP);
        float sheen = pow(max(dot(N, normalize(L + V)), 0.0), 80.0) * uLampK * 0.25;
        float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 off = amber * (0.032 * uAmbK + 0.05 * uLampK) * (0.9 + 0.6 * edge) + vec3(1.0, 0.75, 0.5) * (sheen + fr * 0.01);
        // on: LEDs under the base feed the sheet from below; vibrant orange, deeper toward the tips. The peak stays low
        // enough that the tone mapper keeps it orange (brighter bleaches to yellow-white); bloom does the halo.
        vec3 hot = mix(vec3(1.0, 0.11, 0.0), vec3(1.0, 0.06, 0.0), h);
        vec3 glow = hot * (1.1 - 0.6 * h) * (0.6 + 1.3 * edge);
        vec3 col = off + glow * uOn * 1.65;
        col *= 1.0 + uHover * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  // the printed band lies a hair above the sheet: keep it in front of it from across the room
  if (line) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return m;
}

export class FineToy {
  constructor({ room, audio }) {
    const get = (n) => room.byName.get(n);
    this.audio = audio;
    this.root = get('Fine_Root');
    this.ok = !!this.root;
    if (!this.ok) return;
    this.flames = [];
    this.materials = [];
    this.lights = [];
    this.root.updateMatrixWorld(true);
    FLAMES.forEach((name, i) => {
      const body = get(name);
      if (!body) return;
      const h = body.userData?.flame_h || 0.05;
      const planeN = new THREE.Vector3(0, 0, 1).transformDirection(body.matrixWorld);
      const base = new THREE.Vector3(0, 0.012, 0).applyMatrix4(body.matrixWorld);
      for (const [node, line] of [[body, false], [get(`${name}_Line`), true]]) {
        node?.traverse((o) => {
          if (!o.isMesh) return;
          const m = flameMaterial({ height: h, line });
          m.uniforms.uPlaneN.value.copy(planeN);
          o.material = m;
          o.renderOrder = 6;
          this.materials.push(m);
          this.flames.push({ m, i });
        });
      }
      this.lights.push({ pos: base, i, h });
    });
    this.button = get('Fine_Button');
    this.buttonHome = this.button?.position.clone();
    if (this.button) this.button.matrixAutoUpdate = true;
    this.t = -1;                      // time since the last press (-1: dark)
    this.level = 0;
    this.crackle = null;
    this.voice = null;
    this.press = 0;
  }

  get burning() { return this.t >= 0 && this.t < SHOW.hold + SHOW.fade; }

  trigger() {
    if (!this.ok) return;
    const restart = this.burning;
    this.t = 0;
    this.press = 0.14;
    this.audio?.play('fine_click', { volume: 0.8 });
    if (!restart || !this.crackle) {
      this.crackle?.stop(0.1);
      this.crackle = this.audio?.loop('fine_crackle_loop', { volume: 0.9, fade: 0.25, bus: 'sfx' }) || null;
    }
    this.voice?.stop(0.08);
    this.voice = this.audio?.play('fine_voice', { volume: 1.0, delay: SHOW.voice }) || null;
  }

  update(dt, time) {
    if (!this.ok) return;
    // the button springs back
    if (this.button && this.buttonHome) {
      this.press = Math.max(0, this.press - dt);
      this.button.position.copy(this.buttonHome);
      this.button.position.x -= this.press > 0 ? 0.0016 : 0;
    }
    let target = 0;
    if (this.t >= 0) {
      this.t += dt;
      if (this.t < SHOW.hold) target = Math.min(1, this.t / SHOW.ramp);
      else if (this.t < SHOW.hold + SHOW.fade) target = 1 - (this.t - SHOW.hold) / SHOW.fade;
      else {
        this.t = -1;
        this.crackle?.stop(0.4);
        this.crackle = null;
      }
      if (this.t > SHOW.hold - 0.2 && this.crackle && !this._fading) {
        this._fading = true;
        this.crackle.setVolume?.(0, SHOW.fade + 0.2);
      }
      if (this.t < SHOW.hold - 0.2) this._fading = false;
    }
    this.level += (target - this.level) * (1 - Math.exp(-dt * 18));
    // LED fire flicker, a different phase per flame
    for (const f of this.flames) {
      const i = f.i;
      const flick = 0.8 + 0.1 * Math.sin(time * 13.1 + i * 2.1) + 0.06 * Math.sin(time * 27.3 + i * 4.3)
        + 0.05 * Math.sin(time * 5.7 + i) + 0.04 * (Math.sin(time * 61.0 + i * 7.0) > 0.6 ? 1 : 0);
      f.m.uniforms.uOn.value = this.level * flick;
    }
    // their light on the surroundings (live point lights 1..3)
    this.lights.forEach((l, k) => {
      const slot = 1 + k;
      if (slot > 3) return;
      const flick = 0.82 + 0.1 * Math.sin(time * 11.3 + k * 1.7) + 0.08 * Math.sin(time * 23.9 + k * 3.1);
      const s = this.level * flick * (k === 0 ? 0.0105 : 0.0075);
      LIGHTS.pointPos.value[slot].set(l.pos.x, l.pos.y, l.pos.z, 0.03);
      LIGHTS.pointCol.value[slot].set(1.0 * s, 0.38 * s, 0.07 * s, 0.9);
    });
  }
}
