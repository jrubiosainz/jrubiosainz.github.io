import * as THREE from 'three';
import { mountProgram } from '../programs/index.js';
import pcProgramme from '../pc/index.js';
import { createInstance } from '../programs/util.js';
import { Phosphor, crtMaterial, CanvasAverager } from './crt.js';
import { canvasDisplayMaterial } from './materials.js';

const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));

function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// The production monitor: programmes draw into a 640x480 canvas, the phosphor pass adds persistence and the CRT
// shader turns it into light. Also owns power, the monitor modes, the knobs and an on-screen display.
// ---------------------------------------------------------------------------------------------------------------
export class TvSet {
  constructor({ renderer, mesh, content, audio, emit }) {
    this.content = content;
    this.audio = audio;
    this.emit = emit;
    this.mesh = mesh;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, 640, 480);
    this.phosphor = new Phosphor(renderer, this.canvas, { decay: 0.42 });
    this.material = crtMaterial(this.phosphor.texture, { res: [640, 480], lines: 240, mask: 0.5 });
    if (mesh) mesh.material = this.material;
    this.avg = new CanvasAverager(8, 6);
    this.light = new THREE.Color(0, 0, 0);
    this.program = null;
    this.programId = null;
    this.params = null;
    this.mountedAt = 0;
    this.on = false;
    this.power = 0;
    this.powerTarget = 0;
    this.modes = { underscan: false, hv: false, blue: false };
    this.knobs = { volume: 0.7, contrast: 0.75, bright: 0.6 };
    this.osd = null;
    this.burst = 0;
    this.degauss = 0;
    this.accum = 1;
    this.frameRate = 30;
    this.time = 0;
    this.clock = 0;        // programme time (runs at `rate`: VCR fast-forward / rewind / pause)
    this.rate = 1;
  }

  get meta() { return this.program?.meta || {}; }

  mount(id, params = null, { burst = 0.45 } = {}) {
    if (this.programId === id && JSON.stringify(params) === JSON.stringify(this.params)) return;
    try { this.program?.stop?.(); } catch (e) { console.warn(e); }
    this.programId = id;
    this.params = params;
    this.program = mountProgram(id, {
      canvas: this.canvas, ctx: this.ctx, content: this.content, params, emit: this.emit, audio: this.audio,
    });
    this.mountedAt = this.time;
    this.clock = 0;
    this.burst = Math.max(this.burst, burst);
    this.accum = 1;
    this._music();
  }

  _music() {
    const a = this.audio;
    if (!a?.enabled) return;
    const m = this.on ? this.meta.music : null;
    if (m) a.tv.playLoop(m, { fade: 0.35, intro: this.meta.intro });
    else a.tv.stop(0.3);
  }

  refreshAudio() { this._music(); }

  setPower(on) {
    if (on === this.on) return;
    this.on = on;
    this.powerTarget = on ? 1 : 0;
    if (on) {
      this.degauss = 1;
      this.audio?.play('tv_on');
      this.audio?.play('degauss', { delay: 0.12, volume: 0.9 });
    } else {
      this.audio?.play('tv_power_off');
    }
    this._music();
  }

  degaussNow() {
    this.degauss = 1;
    this.audio?.play('degauss');
  }

  toggleMode(name) {
    this.modes[name] = !this.modes[name];
    const label = { underscan: 'UNDERSCAN', hv: 'H/V DELAY', blue: 'BLUE ONLY' }[name];
    this.showOsd(`${label} ${this.modes[name] ? 'ON' : 'OFF'}`);
    return this.modes[name];
  }

  turnKnob(name, dir = 1) {
    const k = this.knobs;
    const step = 0.125;
    let v = k[name] + step * dir;
    if (v > 1.001) v = 0;
    if (v < -0.001) v = 1;
    k[name] = THREE.MathUtils.clamp(v, 0, 1);
    this.showOsd(name.toUpperCase(), k[name]);
    if (name === 'volume') this.audio?.tv?.setVolume?.(k.volume * 1.3);
    return k[name];
  }

  showOsd(text, bar = null, ms = 1800) { this.osd = { text, bar, until: this.time + ms / 1000 }; }

  input(ev) { try { this.program?.input?.(ev); } catch (e) { console.warn(e); } }

  _drawOsd() {
    const o = this.osd;
    if (!o || this.time > o.until) return;
    const c = this.ctx;
    c.save();
    c.font = '34px VT323, monospace';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#6dff8a';
    c.shadowColor = 'rgba(0,0,0,.9)';
    c.shadowOffsetX = 2;
    c.shadowOffsetY = 2;
    c.fillText(o.text, 56, 400);
    if (o.bar != null) {
      const n = 24;
      for (let i = 0; i < n; i += 1) {
        c.fillStyle = i / n < o.bar ? '#6dff8a' : 'rgba(109,255,138,.18)';
        c.fillRect(56 + i * 20, 414, 14, 18);
      }
    }
    c.restore();
  }

  frame(t, dt) {
    this.time = t;
    this.power = damp(this.power, this.powerTarget, this.powerTarget > this.power ? 3.2 : 7.5, dt);
    if (this.powerTarget === 0 && this.power < 0.004) this.power = 0;
    this.degauss = Math.max(0, this.degauss - dt * 0.85);
    this.burst = Math.max(0, this.burst - dt * 1.9);
    const u = this.material.uniforms;
    this.clock = Math.max(0, this.clock + dt * this.rate);
    if (this.power > 0.001 && this.program) {
      this.accum += dt;
      if (this.accum >= 1 / this.frameRate) {
        this.accum = 0;
        try { this.program.frame(this.clock, dt); } catch (e) { console.warn(e); }
        this._drawOsd();
        this.phosphor.tex.needsUpdate = true;
      }
      this.phosphor.update();
    }
    const m = this.meta;
    const k = this.knobs;
    u.uTime.value = t;
    u.uPower.value = this.power;
    u.uBright.value = (0.75 + k.bright * 1.1) * (m.brightness ?? 1) * (0.7 + k.contrast * 0.5);
    u.uScale.value = this.modes.underscan ? 0.9 : (m.fit ? 0.985 : 1.035);
    u.uHV.value = this.modes.hv ? 1 : 0;
    u.uBlue.value = this.modes.blue ? 1 : 0;
    const seek = Math.min(1, Math.abs(this.rate - 1) / 6) * (this.rate === 0 ? 0 : 1);
    u.uVhs.value = Math.min(1, Number(m.vhs || 0) + seek * 0.8);
    u.uNoise.value = Math.min(1, Number(m.noise || 0) * 0.35 + this.burst * this.burst + seek * 0.18);
    u.uDegauss.value = this.degauss * this.degauss;
    // light spilled on the room (linear average of the picture, smoothed)
    const avg = this.avg.sample(this.canvas, 4);
    const onK = this.power * u.uBright.value;
    const blueOnly = this.modes.blue;
    const r = blueOnly ? 0 : avg.r;
    const g = blueOnly ? 0 : avg.g;
    const snow = u.uNoise.value * 0.35;
    this.light.r = damp(this.light.r, (r + snow) * onK, 10, dt);
    this.light.g = damp(this.light.g, (g + snow) * onK, 10, dt);
    this.light.b = damp(this.light.b, (avg.b + snow) * onK, 10, dt);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The PC's monochrome monitor (green P39-ish phosphor with long persistence).
// ---------------------------------------------------------------------------------------------------------------
export class PcScreen {
  constructor({ renderer, mesh, content, emit }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 400;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.phosphor = new Phosphor(renderer, this.canvas, { decay: 0.62 });
    this.material = crtMaterial(this.phosphor.texture, {
      res: [640, 400], mono: true, lines: 400, mask: 0, tint: new THREE.Color(0.34, 1.0, 0.5),
    });
    // 80x25 cells fill the canvas edge to edge: underscan so the raster sits inside the glass with a dark border
    this.material.uniforms.uScale.value = 0.93;
    this.material.uniforms.uBright.value = 2.1;
    if (mesh) mesh.material = this.material;
    this.content = content;
    this.emit = emit;
    this.program = null;
    this.power = 0;
    this.powerTarget = 0;
    this.accum = 1;
    this.light = new THREE.Color();
    this.avg = new CanvasAverager(8, 5);
  }

  get meta() { return this.program?.meta || {}; }

  boot(audio = null) {
    if (this.program) return;
    this.program = createInstance(pcProgramme, {
      canvas: this.canvas, ctx: this.ctx, content: this.content, emit: this.emit, audio,
    });
    this.powerTarget = 1;
  }

  input(ev) { try { this.program?.input?.(ev); } catch (e) { console.warn(e); } }

  frame(t, dt) {
    this.power = damp(this.power, this.powerTarget, 2.5, dt);
    const u = this.material.uniforms;
    if (this.program && this.power > 0.001) {
      this.accum += dt;
      if (this.accum >= 1 / 30) {
        this.accum = 0;
        try { this.program.frame(performance.now() / 1000, dt); } catch (e) { console.warn(e); }
        this.phosphor.tex.needsUpdate = true;
      }
      this.phosphor.update();
    }
    u.uTime.value = t;
    u.uPower.value = this.power;
    u.uNoise.value = Number(this.meta.noise || 0) * 0.15;
    const avg = this.avg.sample(this.canvas, 6);
    const lum = (avg.r * 0.3 + avg.g * 0.59 + avg.b * 0.11) * this.power * u.uBright.value;
    this.light.setRGB(lum * 0.34, lum, lum * 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Small displays: the VCR's vacuum-fluorescent display and the CD player's reflective LCD.
// ---------------------------------------------------------------------------------------------------------------
export class SmallDisplay {
  constructor({ mesh, programId, content, strength = 1, reflective = false, fps = 15, glass = 0.04 }) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.program = mountProgram(programId, { canvas: this.canvas, ctx: this.ctx, content });
    this.texture = canvasTexture(this.canvas);
    this.material = canvasDisplayMaterial(this.texture, { strength, reflective, glass });
    if (mesh) mesh.material = this.material;
    this.fps = fps;
    this.accum = 1;
    this.backlight = 0;
  }

  input(ev) { try { this.program?.input?.(ev); } catch (e) { console.warn(e); } }

  flash(v = 1) { this.backlight = Math.max(this.backlight, v); }

  frame(t, dt) {
    this.accum += dt;
    if (this.accum >= 1 / this.fps) {
      this.accum = 0;
      try { this.program.frame(t, dt); } catch (e) { console.warn(e); }
      this.texture.needsUpdate = true;
    }
    this.backlight = Math.max(0, this.backlight - dt * 0.5);
    this.material.uniforms.uBacklight.value = Math.min(1, this.backlight) * 0.55;
  }
}
