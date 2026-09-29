import * as THREE from 'three';
import { App } from './app_reachy.js';

// ---------------------------------------------------------------------------------------------------------------
// The toys on the desk: Stack-chan (click or S: switch on; then click: LEDs, mouse wheel: colour; rub its head: it
// smiles; hold it: switch off), the "This is fine" diorama (press it) and the desk lamp (hold it and point: the shade
// turns to follow the pointer). Input routing lives in input.js; this is what the app does with it.
// ---------------------------------------------------------------------------------------------------------------
const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const WHEEL_STEP = 100;              // wheel delta per 15° colour step: one mouse notch (trackpads add up small deltas)
const TOUCH = matchMedia('(hover: none)').matches;

Object.assign(App.prototype, {
  _stackSetup() {
    const s = this.world.stack;
    if (!s || s._wired) return s;
    s._wired = true;
    s.onEvent = (ev, data) => {
      if (ev === 'sound') this.audio.play(data, { volume: 0.8 });
      else if (ev === 'tick') {
        // one little detent click per colour step, pitched a touch by hue
        this.audio.play('stack_tick', { volume: 0.55, rate: 0.9 + (data / 360) * 0.25 });
      } else if (ev === 'awake') {
        this.hud.announce?.('Stack-chan is on');
        this._servo = this.audio.loop('stack_servo_loop', { volume: 0, fade: 0.2, bus: 'sfx' });
      } else if (ev === 'asleep') {
        this.hud.announce?.('Stack-chan is off');
        this._servo?.stop(0.2);
        this._servo = null;
      }
    };
    return s;
  },

  stackToggle() {
    const s = this._stackSetup();
    if (!s) return;
    // a click can start the sound, like the CD player and Reachy
    if (s.state === 'off' && !this.audio.enabled) this.setSound(true).catch(() => {});
    s.toggle();
    this.input?.refresh?.();
  },

  // click: off -> switch on; on -> LEDs on / off (touch: each tap, the next colour)
  stackClick() {
    const s = this._stackSetup();
    if (!s) return;
    if (s.state === 'off') this.stackToggle();
    else if (s.awake && TOUCH) s.cycle();
    else if (s.awake) s.setLeds(!s.led.on);
    this.input?.refresh?.();
  },

  stackWheel(deltaY) {
    const s = this._stackSetup();
    if (!s?.awake) return false;
    this._wheelAcc = (this._wheelAcc || 0) + deltaY;
    let steps = 0;
    while (Math.abs(this._wheelAcc) >= WHEEL_STEP) {
      steps += Math.sign(this._wheelAcc);
      this._wheelAcc -= Math.sign(this._wheelAcc) * WHEEL_STEP;
    }
    // the first nudge of the wheel switches the LEDs on even before a whole step
    if (!steps && !s.led.on && Math.abs(deltaY) > 0) steps = Math.sign(deltaY);
    if (steps) s.turn(steps);
    this.input?.refresh?.();
    return true;
  },

  stackRub(dx) { this.world.stack?.rub(dx); },

  _stackUpdate(dt, time) {
    const s = this._stackSetup();
    if (!s) return;
    const inp = this.input;
    const cam = this.stage.camera;
    const p = inp?.current;
    // it follows the pointer when it moves (and the rig's moves); a still pointer lets it look around after a while
    const nx = inp?.ndc.x ?? 9;
    const ny = inp?.ndc.y ?? 9;
    const moved = !this._stackNdc || Math.abs(this._stackNdc.x - nx) + Math.abs(this._stackNdc.y - ny) > 1e-4 || this.rig.moving;
    this._stackNdc = { x: nx, y: ny };
    if (s.awake && moved && Math.abs(nx) <= 1 && Math.abs(ny) <= 1) {
      const head = s.headCenter(_w);
      const hit = p?.hit?.point;
      _fwd.set(0, 0, 1).applyQuaternion(s.root.quaternion);
      if (p?.group === 'stackchan') s.lookAt(cam.position);
      else if (hit && _v.subVectors(hit, head).normalize().dot(_fwd) > -0.1) s.lookAt(hit);
      else {
        _ray.setFromCamera(inp.ndc, cam);
        s.lookAt(_ray.ray.at(Math.max(0.3, cam.position.distanceTo(head) - 0.4), _v));
      }
    }
    s.update(dt, time);
    // the servos whine while they move
    if (this._servo) {
      const v = Math.min(1, s.speed / 3) * 0.55;
      if (Math.abs(v - (this._servoV || 0)) > 0.03) { this._servoV = v; this._servo.setVolume(v, 0.06); }
    }
  },

  // ---- the diorama ----------------------------------------------------------------------------------------------
  fineTrigger() {
    const f = this.world.fine;
    if (!f?.ok) return;
    const go = () => f.trigger();
    if (!this.audio.enabled) this.setSound(true).then(go, go);
    else go();
  },

  // ---- aiming the lamp ------------------------------------------------------------------------------------------
  lampGrab() {
    const l = this.world.lamp;
    if (!l?.ok) return false;
    l.grab();
    this.audio.play('lamp_grab', { volume: 0.7 });
    this.hud.announce?.('Aiming the lamp');
    return true;
  },

  lampAim(ndc) {
    const l = this.world.lamp;
    if (!l?.ok) return;
    const hit = this.input?.pick?.()?.hit?.point || null;
    _ray.setFromCamera(ndc, this.stage.camera);
    l.aimAlong(_ray.ray, hit);
  },

  lampRelease() {
    const l = this.world.lamp;
    if (!l?.held) return;
    l.release();
    this.audio.play('lamp_release', { volume: 0.55 });
  },
});

export { App };
