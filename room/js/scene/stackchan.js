import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import { dynamicMaterial, LIGHTS } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// Stack-chan, the little open-source robot by Shinya Ishikawa (github.com/stack-chan/stack-chan), here as M5Stack's
// StackChan: a CoreS3 whose screen is the face, a cube of a head on two feedback servos (pan in the base, tilt in the
// neck) and two rows of RGB LEDs behind the teal light pipes on its top side edges. It sits where the VCR remote was.
// Switched on (click, or S) it boots, raises its head and follows the pointer with head and eyes; scratch its head
// (rub the pointer back and forth over it) and it smiles; click it while it is on and its light pipes light up, and
// the mouse wheel runs them round the colour wheel (blue, green, yellow, red…). Model: blender/stackchan/.
//
// Robot frame (rig.json): X right, Y back, Z up, face toward -Y. three.js: (x, y, z)robot -> (x, z, -y).
// ---------------------------------------------------------------------------------------------------------------
export const STACK_SPOT = { x: -0.035, y: 0.74, z: 0.13, rz: -6 };   // twin of blender/lib/layout.py SPOTS['stackchan']

const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
const ease = (t) => t * t * (3 - 2 * t);
const PAN = 85 * DEG;
const SERVO = 5.2;                   // rad/s: an SG90 with a load, a little slower than its data sheet
const HUE_STEP = 15;
const PALETTE = [225, 120, 60, 0, 300, 180];     // touch: blue, green, yellow, red, magenta, cyan
const COLOURS = [
  [0, 'RED'], [18, 'ORANGE'], [40, 'AMBER'], [58, 'YELLOW'], [85, 'LIME'], [120, 'GREEN'], [155, 'MINT'],
  [180, 'CYAN'], [200, 'SKY'], [225, 'BLUE'], [255, 'INDIGO'], [280, 'VIOLET'], [305, 'MAGENTA'], [330, 'PINK'],
];
// how the materials read under the lamp: [specular, rim]
const LOOK = { stack_bezel: [0.45, 0.8], stack_shell: [0.35, 0.8], stack_neck: [0.3, 0.6], stack_dark: [0.35, 0.5],
  stack_ring: [0.4, 0.4], stack_hole: [0.1, 0.1], stack_glass: [1.8, 0.35], stack_label: [0.3, 0.5],
  stack_ink: [0.2, 0.2], stack_cam: [1.0, 0.3], stack_lens: [1.5, 0.2], stack_teal: [0.5, 0.4],
  stack_red: [0.3, 0.2], stack_button: [0.5, 0.3] };

export function colourName(h) {
  const hue = ((h % 360) + 360) % 360;
  let best = COLOURS[0];
  let bd = 999;
  for (const c of COLOURS) {
    const d = Math.min(Math.abs(hue - c[0]), 360 - Math.abs(hue - c[0]));
    if (d < bd) { bd = d; best = c; }
  }
  return best[1];
}

export async function loadStackchan({ base = 'assets/stackchan/' } = {}) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/three/draco/');
  loader.setDRACOLoader(draco);
  const [rig, gltf] = await Promise.all([
    fetch(`${base}rig.json`).then((r) => r.json()),
    loader.loadAsync(`${base}stackchan.glb`),
  ]);
  draco.dispose();
  return new Stackchan(rig, gltf.scene);
}

function screenMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: { tMap: { value: texture }, uOn: { value: 0 }, uLampK: LIGHTS.lampK, uAmbK: LIGHTS.ambK },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap; uniform float uOn; uniform float uLampK; uniform float uAmbK;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 c = texture2D(tMap, vUv).rgb;
        // IPS panel: a hint of backlight glow even on black, the picture itself a little over "paper white"
        vec3 col = (c * c * 1.9 + vec3(0.004, 0.005, 0.007)) * uOn;
        float fr = pow(1.0 - max(dot(normalize(vN), normalize(cameraPosition - vP)), 0.0), 4.0);
        col += vec3(0.5, 0.52, 0.6) * fr * 0.05 * (0.3 + uLampK * 0.7 + uAmbK * 0.2);
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
  });
}

function ledMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0, 0, 0) }, uLevel: { value: 0 }, uLampK: LIGHTS.lampK, uAmbK: LIGHTS.ambK },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uLevel; uniform float uLampK; uniform float uAmbK;
      varying vec3 vN; varying vec3 vP;
      void main() {
        // teal translucent light pipe: dim when off, the LEDs' colour glowing through when on
        vec3 off = vec3(0.3, 0.6, 0.62) * (0.03 * uAmbK + 0.1 * uLampK);
        vec3 glow = uColor * uLevel * 5.0 + mix(uColor, vec3(1.0), 0.35) * uLevel * 2.0;
        gl_FragColor = vec4(off * (1.0 - uLevel * 0.8) + glow, 1.0);
      }`,
    toneMapped: false,
  });
}

export class Stackchan {
  constructor(rig, scene) {
    this.rig = rig;
    this.tiltRange = rig.tilt_range || [-16 * DEG, 8 * DEG];     // the cube head clears the neck within these
    this.root = new THREE.Group();
    this.root.name = 'Stackchan_Root_Runtime';
    this.root.position.set(STACK_SPOT.x, STACK_SPOT.y, STACK_SPOT.z);
    this.root.rotation.y = STACK_SPOT.rz * DEG;
    const model = scene.getObjectByName('Stackchan_Root') || scene;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    this.root.add(model);
    this.root.updateMatrixWorld(true);
    const byName = (n) => model.getObjectByName(n);
    // pivots: pan (vertical, through the turntable) and tilt (horizontal, at the bottom of the head)
    this.panPivot = new THREE.Group();
    this.panPivot.position.copy(toThree(rig.pan_pivot));
    this.tiltPivot = new THREE.Group();
    this.tiltPivot.position.copy(toThree(rig.tilt_pivot)).sub(this.panPivot.position);
    model.add(this.panPivot);
    this.panPivot.add(this.tiltPivot);
    this.root.updateMatrixWorld(true);
    for (const n of rig.pan_parts) { const o = byName(n); if (o) this.panPivot.attach(o); }
    for (const n of rig.tilt_parts) { const o = byName(n); if (o) this.tiltPivot.attach(o); }

    // face: a 320×240 canvas like the M5Stack's panel
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.flipY = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.screenMat = screenMaterial(this.tex);
    this.leds = [];
    this.ledMat = ledMaterial();
    const mats = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const src = o.material;
      if (src.name === 'stack_screen') { o.material = this.screenMat; return; }
      if (src.name === 'stack_led') { o.material = this.ledMat; this.leds.push(o); return; }
      if (!mats.has(src)) {
        const [spec, rim] = LOOK[src.name] || [0.5, 0.5];
        const m = dynamicMaterial({
          useAtlas: false, color: src.color, rough: src.roughness ?? 0.5, spec, metal: src.metalness ?? 0,
          ambient: new THREE.Color(0.05, 0.04, 0.034),
        });
        // calibrated against the baked mug next to it: the lamp's pool (it stands at the edge of the cone), the TV and
        // the window's bounce off the desk reach its sides too
        m.uniforms.uLampPower.value = 0.26;
        m.uniforms.uTvPower.value = 0.03;
        m.uniforms.uSpill.value = 0.03;
        m.uniforms.uPointK.value = 0.6;
        m.uniforms.uAmbient.value.setRGB(0.09, 0.068, 0.052);
        m.uniforms.uRim.value.setRGB(0.05, 0.036, 0.03).multiplyScalar(rim);
        m.name = `live_${src.name}`;
        mats.set(src, m);
      }
      o.material = mats.get(src);
    });
    this.materials = [...mats.values()];

    // state
    this.state = 'off';               // off | booting | on | shutting
    this.t = 0;                       // time in the current state
    this.time = 0;
    this.pan = { x: 0, target: 0 };
    this.tilt = { x: rig.sleep_tilt, target: rig.sleep_tilt };
    this.gaze = new THREE.Vector2();
    this.gazeT = new THREE.Vector2();
    this.blink = 0;
    this.nextBlink = 2;
    this.happy = 0;                   // seconds of smile left
    this.rubs = [];
    this.rubDir = 0;
    this.rubAcc = 0;
    this.led = { on: false, level: 0, hue: 225, osd: 0 };
    this.lookTarget = null;
    this.lastLook = 0;
    this.idleAt = 0;
    this.speed = 0;
    this.onEvent = () => {};
    this.faceDirty = true;
    this._faceT = 0;
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._pose();
    this._drawFace();
  }

  get awake() { return this.state === 'on'; }
  get busy() { return this.state === 'booting' || this.state === 'shutting'; }
  get ledColour() { return new THREE.Color().setHSL(this.led.hue / 360, 1, 0.5); }
  get colourName() { return colourName(this.led.hue); }

  toggle() { if (this.state === 'off' || this.state === 'shutting') this.wake(); else this.sleep(); }

  wake() {
    if (this.state === 'on' || this.state === 'booting') return false;
    this.state = 'booting';
    this.t = 0;
    this.onEvent('sound', 'stack_boot');
    return true;
  }

  sleep() {
    if (this.state === 'off' || this.state === 'shutting') return false;
    this.state = 'shutting';
    this.t = 0;
    this.happy = 0;
    this.onEvent('sound', 'stack_sleep');
    return true;
  }

  // LEDs: click toggles them, the wheel turns them round the colour wheel (and switches them on)
  setLeds(on) {
    if (!this.awake || on === this.led.on) return;
    this.led.on = on;
    this.led.osd = on ? 1.4 : 0;
    this.faceDirty = true;
    this.onEvent('sound', on ? 'stack_led_on' : 'stack_led_off');
  }

  turn(steps) {
    if (!this.awake || !steps) return;
    if (!this.led.on) this.setLeds(true);
    else this.led.hue = (((this.led.hue - steps * HUE_STEP) % 360) + 360) % 360;
    this.led.osd = 1.4;
    this.faceDirty = true;
    this.onEvent('tick', this.led.hue);
  }

  // touch screens have no wheel: each tap steps round a small palette, then the lights go off
  cycle() {
    if (!this.awake) return;
    if (!this.led.on) { this.led.hue = PALETTE[0]; this.setLeds(true); return; }
    const i = PALETTE.findIndex((h) => h === this.led.hue);
    if (i === PALETTE.length - 1) { this.setLeds(false); return; }
    this.led.hue = PALETTE[i + 1];
    this.led.osd = 1.4;
    this.faceDirty = true;
    this.onEvent('tick', this.led.hue);
  }

  // pointer rubbing over the head (screen-space dx in px): three quick back-and-forths make it smile
  rub(dx) {
    if (!this.awake || Math.abs(dx) < 0.5) return;
    const dir = Math.sign(dx);
    if (dir !== this.rubDir) {
      if (Math.abs(this.rubAcc) > 7) this.rubs.push(this.time);
      this.rubDir = dir;
      this.rubAcc = 0;
    }
    this.rubAcc += dx;
    this.rubs = this.rubs.filter((t) => this.time - t < 1.2);
    if (this.rubs.length >= 3) {
      if (this.happy <= 0) this.onEvent('sound', 'stack_happy');
      this.happy = 2.6;
      this.faceDirty = true;
    }
  }

  lookAt(point) {
    this.lookTarget = point ? (this.lookTarget || new THREE.Vector3()).copy(point) : null;
    if (point) this.lastLook = this.time;
  }

  // points on the head (robot frame) follow the tilt pivot, which sits at rig.tilt_pivot in the model
  _onHead(p, out) { return this.tiltPivot.localToWorld(out.copy(toThree(p)).sub(toThree(this.rig.tilt_pivot))); }

  headTop(out = new THREE.Vector3()) { return this._onHead(this.rig.head_top, out); }

  headCenter(out = new THREE.Vector3()) { return this._onHead(this.rig.head_box.center, out); }

  _aim(dt) {
    const awake = this.state === 'on';
    const following = awake && this.lookTarget && this.time - this.lastLook < 4;
    if (following) {
      // target in the pan frame: pan = its bearing, tilt = minus its elevation from the tilt axis
      const local = this.root.worldToLocal(this._v.copy(this.lookTarget)).sub(this.panPivot.position);
      let pan = Math.atan2(local.x, local.z);
      const tp = this.tiltPivot.position;
      const horiz = Math.hypot(local.x, local.z);
      let tilt = -Math.atan2(local.y - tp.y, Math.max(horiz, 0.02));
      pan = clamp(pan, -PAN, PAN);
      tilt = clamp(tilt, this.tiltRange[0], this.tiltRange[1]);
      this.pan.target = pan;
      this.tilt.target = tilt;
    } else if (awake) {
      // nobody moving the pointer: an occasional glance around
      if (this.time > this.idleAt) {
        this.idleAt = this.time + 2.5 + Math.random() * 3.5;
        this.pan.target = (Math.random() - 0.5) * 70 * DEG;
        this.tilt.target = clamp(this.rig.awake_tilt + (Math.random() - 0.6) * 14 * DEG, this.tiltRange[0], this.tiltRange[1]);
      }
    }
    if (this.happy > 0 && awake) {
      // leans into the scratch
      this.tilt.target = Math.max(this.tiltRange[0], Math.min(this.tilt.target, -10 * DEG));
      this.pan.target += Math.sin(this.time * 9) * 5 * DEG;
    }
    // servo: speed-limited, eased at the end of each move
    const moved = [this.pan, this.tilt].reduce((acc, s) => {
      const d = s.target - s.x;
      const step = clamp(d * Math.min(1, dt * 14), -SERVO * dt, SERVO * dt);
      s.x += step;
      return acc + Math.abs(step);
    }, 0);
    this.speed = moved / Math.max(dt, 1e-3);
    // the eyes lead the head (on the screen), then settle back to the centre
    this.gazeT.set(clamp((this.pan.target - this.pan.x) / (25 * DEG), -1, 1), clamp((this.tilt.target - this.tilt.x) / (15 * DEG), -1, 1));
    if (!this.lookTarget) this.gazeT.multiplyScalar(0.5);
    const g = 1 - Math.exp(-dt * 16);
    const gx = this.gaze.x + (this.gazeT.x - this.gaze.x) * g;
    const gy = this.gaze.y + (this.gazeT.y - this.gaze.y) * g;
    if (Math.abs(gx - this.gaze.x) + Math.abs(gy - this.gaze.y) > 0.004) this.faceDirty = true;
    this.gaze.set(gx, gy);
  }

  _pose() {
    this.panPivot.rotation.set(0, this.pan.x, 0);
    this.tiltPivot.rotation.set(this.tilt.x, 0, 0);
    this.root.updateMatrixWorld(true);
  }

  update(dt, time) {
    this.time = time;
    this.t += dt;
    const R = this.rig;
    let on = this.screenMat.uniforms.uOn.value;
    if (this.state === 'booting') {
      on = Math.min(1, this.t / 0.35);
      if (this.t > 0.55) { this.tilt.target = R.awake_tilt - 4 * DEG; this.pan.target = 0; }
      if (this.t > 1.35) this.tilt.target = R.awake_tilt + 5 * DEG;          // a little nod hello
      if (this.t > 1.65) this.tilt.target = R.awake_tilt;
      if (this.t > 1.9) { this.state = 'on'; this.t = 0; this.onEvent('awake'); }
      this.faceDirty = true;
    } else if (this.state === 'shutting') {
      this.tilt.target = R.sleep_tilt;
      this.pan.target = 0;
      this.led.on = false;
      on = this.t < 1.1 ? 1 : Math.max(0, 1 - (this.t - 1.1) / 0.5);
      if (this.t > 1.7) { this.state = 'off'; this.t = 0; this.onEvent('asleep'); }
      this.faceDirty = true;
    } else if (this.state === 'off') {
      on = 0;
    }
    this.screenMat.uniforms.uOn.value = on;
    this._aim(dt);
    this._pose();
    // blinks
    if (this.state === 'on') {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink = 0.16; this.nextBlink = 2 + Math.random() * 4.5; }
    }
    if (this.blink > 0) { this.blink = Math.max(0, this.blink - dt); this.faceDirty = true; }
    if (this.happy > 0) { this.happy = Math.max(0, this.happy - dt); if (this.happy === 0) this.faceDirty = true; }
    if (this.led.osd > 0) { this.led.osd = Math.max(0, this.led.osd - dt); this.faceDirty = true; }
    // LEDs: fade, and their light on the desk and the VCR
    const tgt = this.led.on && this.state === 'on' ? 1 : 0;
    this.led.level += (tgt - this.led.level) * (1 - Math.exp(-dt * 10));
    const col = this.ledColour;
    this.ledMat.uniforms.uColor.value.copy(col);
    this.ledMat.uniforms.uLevel.value = this.led.level;
    const p = LIGHTS.pointPos.value[0];
    const c = LIGHTS.pointCol.value[0];
    this._onHead(this.rig.led_light || this.rig.head_top, this._v);
    p.set(this._v.x, this._v.y, this._v.z, 0.035);
    const k = 0.011 * this.led.level;
    c.set(col.r * k, col.g * k, col.b * k, 0.75);
    // the face redraws at up to 30 fps, only when something changed
    this._faceT += dt;
    if (this.faceDirty && this._faceT > 1 / 30) { this._faceT = 0; this._drawFace(); }
  }

  _drawFace() {
    this.faceDirty = false;
    const g = this.ctx;
    const W = 320;
    const H = 240;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (this.state === 'off') { this.tex.needsUpdate = true; return; }
    const boot = this.state === 'booting' ? this.t : 99;
    if (boot < 0.8) {
      // boot splash
      g.fillStyle = '#0b0c0f';
      g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(230,232,236,${Math.min(1, boot / 0.25)})`;
      g.font = '600 26px "Space Mono", "Courier New", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('stack-chan', W / 2, H / 2 - 8);
      const dots = Math.floor(boot / 0.2) % 4;
      g.font = '500 18px "Space Mono", monospace';
      g.fillText('.'.repeat(dots).padEnd(3, ' '), W / 2, H / 2 + 22);
      this.tex.needsUpdate = true;
      return;
    }
    const fade = this.state === 'booting' ? ease(clamp((boot - 0.8) / 0.3, 0, 1)) : 1;
    const shut = this.state === 'shutting' ? clamp(this.t / 1.0, 0, 1) : 0;
    const ink = `rgba(242,242,238,${fade})`;
    g.fillStyle = ink;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const gx = this.gaze.x * 14;
    const gy = this.gaze.y * 10;
    const eyes = [[94 + gx, 96 + gy], [226 + gx, 96 + gy]];
    const happy = this.happy > 0 && this.state === 'on';
    if (happy) {
      // ^ ^ eyes, a wide smile, and a blush
      g.lineWidth = 9;
      for (const [x, y] of eyes) { g.beginPath(); g.arc(x, y + 8, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      g.fillStyle = 'rgba(255,120,150,0.55)';
      for (const [x, y] of eyes) { g.beginPath(); g.ellipse(x + (x < 160 ? -22 : 22), y + 34, 16, 9, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = ink;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(160 + gx * 0.5, 146 + gy * 0.5, 30, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    } else {
      // StackChan's own face: two small dot eyes and a flat line of a mouth; blinking and falling asleep squash the
      // dots into dashes
      const b = this.blink > 0 ? Math.sin((this.blink / 0.16) * Math.PI) : 0;
      const open = Math.max(0.12, (1 - b) * (1 - shut));
      for (const [x, y] of eyes) {
        g.beginPath();
        g.ellipse(x, y, 8 + (1 - open) * 3, Math.max(1.4, 8 * open), 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      const mw = 84;
      const mx = 160 + gx * 0.5;
      const my = 150 + gy * 0.5;
      g.roundRect(mx - mw / 2, my - 2.5, mw, 5, 2.5);
      g.fill();
    }
    // colour readout while the LEDs are being set
    if (this.led.osd > 0 && this.led.on) {
      const a = Math.min(1, this.led.osd / 0.3);
      const col = `#${this.ledColour.getHexString()}`;
      g.globalAlpha = a;
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(84, 196, 152, 28, 14);
      g.fill();
      g.fillStyle = '#0a0a0a';
      g.font = '700 16px "Space Mono", "Courier New", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(this.colourName, 160, 211);
      g.globalAlpha = 1;
    }
    this.tex.needsUpdate = true;
  }
}
