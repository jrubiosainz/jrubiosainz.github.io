import * as THREE from 'three';
import { LIGHTS } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// Small mechanical behaviour of the room: the lamp, press-able buttons/keys, knobs, LEDs, the CD player's lid and
// disc, the wall clock and the phone handset. Everything is driven from update(dt, time).
// ---------------------------------------------------------------------------------------------------------------
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

class Press {
  constructor(obj, depth, axis = new THREE.Vector3(0, 0, -1)) {
    this.obj = obj;
    this.home = obj.position.clone();
    this.depth = depth;
    this.axis = axis;
    this.v = 0;
    this.held = false;
    this.until = 0;
  }

  tap(time, ms = 120) { this.until = time + ms / 1000; }

  update(dt, time) {
    const target = this.held || time < this.until ? 1 : 0;
    this.v = damp(this.v, target, target ? 60 : 22, dt);
    this.obj.position.copy(this.home).addScaledVector(this.axis, this.v * this.depth);
    this.obj.updateMatrix();
    this.obj.updateMatrixWorld(true);
  }
}

export class Props {
  constructor({ room, audio }) {
    this.room = room;
    this.audio = audio;
    const get = (n) => room.byName.get(n);
    this.get = get;
    this.time = 0;
    this.moving = new Set();

    // lamp
    this.lampOn = true;
    this.lampK = 1;
    this.lampFlicker = 0;
    this.bulb = this._glow('Lamp_Bulb');

    // presses (static lightmapped parts moved by a few mm; their bake stays valid)
    this.presses = new Map();
    const addPress = (name, depth, axis) => {
      const o = get(name);
      if (!o) return null;
      o.matrixAutoUpdate = false;
      const p = new Press(o, depth, axis);
      this.presses.set(name, p);
      return p;
    };
    const back = new THREE.Vector3(0, 0, -1);
    const down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i <= 6; i += 1) addPress(i === 0 ? 'TV_Btn_Power' : `TV_Btn_${i}`, 0.0035, back);
    for (const n of ['Eject', 'FF', 'Play', 'Power', 'Rec', 'Rew', 'Stop']) addPress(`VCR_Btn_${n}`, 0.0025, back);
    for (const n of ['Next', 'Play', 'Prev', 'Stop']) addPress(`CDP_Btn_${n}`, 0.0018, down);
    addPress('Lamp_Switch', 0.003, down);
    addPress('PC_PowerSwitch', 0.003, back);
    for (const n of ['FF', 'PLAY', 'REW', 'STOP']) addPress(`Cassette_Btn_${n}`, 0.003, down);
    // keys: glTF nodes named Key_<code>
    for (const [name, o] of room.byName) {
      if (name.startsWith('Key_') && !this.presses.has(name) && o.userData?.role === 'key') addPress(name, 0.0032, down);
    }

    // knobs
    this.knobs = [1, 2, 3].map((i) => {
      const o = get(`TV_Knob_${i}`);
      if (!o) return null;
      o.matrixAutoUpdate = false;
      return { obj: o, home: o.quaternion.clone(), angle: 0, target: 0 };
    });

    // LEDs
    this.tvLeds = [0, 1, 2, 3, 4, 5, 6].map((i) => this._glow(i === 0 ? 'TV_LED_Power' : `TV_LED_${i}`));
    this.pcLeds = {
      power: this._glow('PC_LED_Power'), hdd: this._glow('PC_LED_HDD'), a: this._glow('PC_LED_FloppyA'),
      b: this._glow('PC_LED_FloppyB'), monitor: this._glow('PC_LED_Monitor'),
    };
    this.cdLed = this._glow('CDP_LED');
    this.drive = { C: 0, A: 0 };
    this.driveBusy = { C: false, A: false };

    // CD player
    this.lid = get('CDP_Lid');
    this.lidHome = this.lid?.quaternion.clone();
    this.lidAngle = 0;
    this.lidOpen = false;
    this.disc = get('CDP_Disc');
    this.discHome = this.disc?.quaternion.clone();
    this.discSpin = 0;
    this.discSpeed = 0;
    this.discTarget = 0;
    this.vol = get('CDP_Vol');
    this.volHome = this.vol?.position.clone();

    // clock
    this.hands = ['h', 'm', 's'].map((h) => {
      const o = get(`Clock_Hand${h.toUpperCase()}`);
      return o ? { o, h, home: o.quaternion.clone() } : null;
    }).filter(Boolean);

    // phone: the handset and its two grilles are siblings; they move together around the handset's origin
    this.handset = get('Phone_Handset');
    this.handsetParts = ['Phone_Handset', 'Phone_Handset_Grille_Left', 'Phone_Handset_Grille_Right'].map(get).filter(Boolean)
      .map((o) => { o.matrixAutoUpdate = false; return { o, p: o.position.clone(), q: o.quaternion.clone() }; });
    this.handsetHome = this.handset ? { p: this.handset.position.clone(), q: this.handset.quaternion.clone() } : null;
    this.handsetLift = 0;
    this.handsetTarget = 0;
    this.dialTone = null;
  }

  _glow(name) {
    const o = this.get(name);
    let mat = null;
    o?.traverse((m) => { if (m.isMesh && m.material?.uniforms?.uOn) mat = m.material; });
    if (!mat) return null;
    return { mat, base: mat.uniforms.uStrength.value, on: mat.uniforms.uOn.value, target: 1 };
  }

  setGlow(g, v) { if (g) g.target = v; }

  press(name, { hold = null, ms = 120 } = {}) {
    const p = this.presses.get(name);
    if (!p) return;
    if (hold === null) p.tap(this.time, ms);
    else p.held = hold;
  }

  key(code, down) { this.press(`Key_${code}`, { hold: down }); }

  // lamp -------------------------------------------------------------------------------------------------------
  toggleLamp(on = !this.lampOn) {
    this.lampOn = on;
    this.press('Lamp_Switch', { ms: 160 });
    this.audio?.play(on ? 'lamp_switch_on' : 'lamp_switch_off');
    if (on) {
      this.lampFlicker = 0.35;
      this.audio?.play('lamp_flicker', { delay: 0.04, volume: 0.6 });
    }
  }

  // TV knob ----------------------------------------------------------------------------------------------------
  turnKnob(i, value) {
    const k = this.knobs[i - 1];
    if (!k) return;
    k.target = (value - 0.5) * 4.4;
  }

  // CD ---------------------------------------------------------------------------------------------------------
  setLid(open) {
    if (!this.lid || open === this.lidOpen) return;
    this.lidOpen = open;
    this.audio?.play(open ? 'cd_open' : 'cd_close');
  }

  setDisc(playing) { this.discTarget = playing ? 1 : 0; }

  setCdVolume(v) {
    if (!this.vol) return;
    this.vol.position.copy(this.volHome);
    this.vol.position.z += (v - 0.5) * 0.012;
  }

  // phone ------------------------------------------------------------------------------------------------------
  liftPhone() {
    if (!this.handset) return;
    const up = this.handsetTarget === 0;
    this.handsetTarget = up ? 1 : 0;
    this.audio?.play(up ? 'notepad_pick' : 'mug_set', { volume: 0.7, rate: up ? 1.2 : 0.8 });
    if (up) this._dialTone(true);
    else this._dialTone(false);
  }

  _dialTone(on) {
    const a = this.audio;
    const ctx = a?.context;
    if (this.dialTone) {
      const { g, oscs } = this.dialTone;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.03);
      oscs.forEach((o) => o.stop(t + 0.2));
      this.dialTone = null;
    }
    if (!on || !ctx || !a.enabled) return;
    // dial tone through a tiny earpiece: 350 + 440 Hz, band-limited, heard from arm's length
    const g = ctx.createGain();
    g.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const oscs = [350, 440].map((f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(bp); o.start(ctx.currentTime + 0.35); return o; });
    bp.connect(g).connect(a.buses.sfx);
    g.gain.setTargetAtTime(0.012, ctx.currentTime + 0.35, 0.02);
    g.gain.setTargetAtTime(0, ctx.currentTime + 6, 0.2);
    oscs.forEach((o) => o.stop(ctx.currentTime + 7));
    this.dialTone = { g, oscs };
  }

  // PC drives --------------------------------------------------------------------------------------------------
  setDrive(drive, busy) { this.driveBusy[drive === 'A' ? 'A' : 'C'] = busy; }

  pulseDrive(drive = 'C', s = 0.25) { this.drive[drive] = Math.max(this.drive[drive], s); }

  update(dt, time) {
    this.time = time;
    // lamp intensity (with a short warm-up flicker)
    if (this.lampFlicker > 0) this.lampFlicker = Math.max(0, this.lampFlicker - dt);
    let target = this.lampOn ? 1 : 0;
    if (this.lampOn && this.lampFlicker > 0) target = Math.sin(time * 173) > -0.2 ? (0.55 + Math.random() * 0.45) : 0.12;
    this.lampK = this.lampOn ? damp(this.lampK, target, 30, dt) : damp(this.lampK, 0, 26, dt);
    LIGHTS.lampK.value = this.lampK;
    if (this.bulb) this.bulb.mat.uniforms.uOn.value = this.lampK;

    for (const p of this.presses.values()) {
      if (p.v > 1e-4 || p.held || time < p.until) p.update(dt, time);
    }
    for (const k of this.knobs) {
      if (!k) continue;
      if (Math.abs(k.angle - k.target) < 1e-4) continue;
      k.angle = damp(k.angle, k.target, 16, dt);
      k.obj.quaternion.copy(k.home).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -k.angle));
      k.obj.updateMatrix();
      k.obj.updateMatrixWorld(true);
    }
    // LEDs ease to their targets (with a slight flicker for the drive lights)
    for (const g of [...this.tvLeds, this.cdLed, ...Object.values(this.pcLeds)]) {
      if (!g) continue;
      g.mat.uniforms.uOn.value = damp(g.mat.uniforms.uOn.value, g.target, 25, dt);
    }
    for (const d of ['C', 'A']) {
      this.drive[d] = Math.max(0, this.drive[d] - dt);
      const busy = this.driveBusy[d] || this.drive[d] > 0;
      const led = d === 'C' ? this.pcLeds.hdd : this.pcLeds.a;
      if (led) led.target = busy ? (Math.random() < 0.55 ? 1 : 0.15) : 0;
    }

    // CD lid + disc
    if (this.lid) {
      this.lidAngle = damp(this.lidAngle, this.lidOpen ? 1 : 0, this.lidOpen ? 7 : 11, dt);
      this.lid.quaternion.copy(this.lidHome).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.lidAngle * 1.75));
    }
    if (this.disc) {
      this.discSpeed = damp(this.discSpeed, this.discTarget * (this.lidOpen ? 0 : 1), this.discTarget ? 1.6 : 0.9, dt);
      this.discSpin += this.discSpeed * dt * Math.PI * 2 * 5.5;
      this.disc.quaternion.copy(this.discHome).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.discSpin));
    }

    // wall clock (real time)
    if (this.hands.length) {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      for (const hand of this.hands) {
        const frac = hand.h === 's' ? Math.floor(s) / 60 : hand.h === 'm' ? m / 60 : h / 12;
        hand.o.quaternion.copy(hand.home).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -frac * Math.PI * 2));
      }
    }

    // phone handset
    if (this.handset && this.handsetHome && Math.abs(this.handsetLift - this.handsetTarget) > 1e-4) {
      this.handsetLift = damp(this.handsetLift, this.handsetTarget, 7, dt);
      const k = this.handsetLift;
      const pivot = this.handsetHome.p;
      const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35 * k, 0, -0.2 * k));
      const T = new THREE.Vector3(0, 0.07 * k, 0.03 * k);
      for (const part of this.handsetParts) {
        part.o.position.copy(part.p).sub(pivot).applyQuaternion(R).add(pivot).add(T);
        part.o.quaternion.copy(R).multiply(part.q);
        part.o.updateMatrix();
        part.o.updateMatrixWorld(true);
      }
    }
  }
}
