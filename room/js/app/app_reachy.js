import * as THREE from 'three';
import { App } from './app_more.js';
import { SpeechBubble } from '../ui/bubble.js';

// ---------------------------------------------------------------------------------------------------------------
// Reachy Mini on the desk: wake it up (click, or R) and it raises its head with its own "toudoum", then follows the
// pointer. Point at the tapes and it tells you what they are, in a speech bubble and out loud (English or Spanish,
// following the browser). Click it again and it goes back to sleep ("pfiou").
// ---------------------------------------------------------------------------------------------------------------
const LANG = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
const TOUCH = matchMedia('(hover: none)').matches;
const REPEAT_AFTER = 45;     // seconds before it explains the same stack again
const DWELL = 0.35;          // seconds on a tape before it speaks
const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _fwd = new THREE.Vector3();

Object.assign(App.prototype, {
  _reachySetup() {
    if (this._reachy !== undefined) return this._reachy;
    const r = this.world.reachy;
    if (!r) { this._reachy = null; return null; }
    const R = {
      bubble: new SpeechBubble(document.body),
      voice: null, said: {}, dwellOn: null, dwell: 0, speaking: null, greeted: false, handle: null,
    };
    this._reachy = R;
    this.hud.setReachy?.(false);
    fetch('assets/reachy/voice.json').then((res) => (res.ok ? res.json() : null)).then((v) => { R.voice = v; }).catch(() => {});
    r.onEvent = (ev, data) => {
      if (ev === 'sound') this.audio.play(data, { volume: 0.85 });
      else if (ev === 'awake') {
        this.hud.setReachy?.(true);
        this.hud.announce?.('Reachy is awake');
        if (!R.greeted) {
          R.greeted = true;
          setTimeout(() => { if (r.awake && this.view === 'home') this.reachySay(TOUCH ? 'greet_touch' : 'greet'); }, 350);
        }
      } else if (ev === 'asleep') {
        this.hud.setReachy?.(false);
        this.hud.announce?.('Reachy is asleep');
      }
    };
    return R;
  },

  async reachyToggle() {
    const r = this.world.reachy;
    const R = this._reachySetup();
    if (!r || !R) return;
    const waking = !(r.state === 'awake' || r.state === 'waking');
    if (waking && !this.audio.enabled) await this.setSound(true);     // a click: sound may start, like the CD player
    if (!waking) this._reachyHush();
    r.toggle();
  },

  reachySay(id) {
    const r = this.world.reachy;
    const R = this._reachy;
    const line = R?.voice?.lines?.[id]?.[LANG] || R?.voice?.lines?.[id]?.en;
    if (!r || !line) return false;
    R.handle?.stop(0.12);
    const voiced = this.audio.enabled && this.audio.buffers?.has(line.sound);
    R.handle = voiced ? this.audio.play(line.sound, { volume: 1 }) : null;
    // without sound the words still arrive at a relaxed reading pace
    const start = voiced ? line.start : 0.15;
    const end = voiced ? line.end : 0.15 + line.text.length * 0.042;
    R.bubble.say(line.text, { start, end, hold: 2.2, lang: LANG });
    if (voiced) r.speak(line.env, R.voice.rate);
    else r.speak(Array.from({ length: Math.ceil(end * 10) }, (_, i) => 0.35 + 0.25 * Math.sin(i * 1.9)), 10);
    R.speaking = { id, until: this.time + end + 2.2 };
    return true;
  },

  _reachyHush() {
    const R = this._reachy;
    if (!R) return;
    R.handle?.stop(0.2);
    R.handle = null;
    R.bubble.hide();
    R.speaking = null;
    this.world.reachy?.silence();
  },

  _reachyLine(tape) {
    if (tape.item?.filler) return 'blank';
    return tape.stack === 0 ? 'career' : 'projects';
  },

  _reachyUpdate(dt, time) {
    const r = this.world.reachy;
    if (!r) return;
    const R = this._reachySetup();
    const inp = this.input;
    const cam = this.stage.camera;
    // where to look: the thing under the pointer if it is in front of the robot, otherwise a point along the pointer
    // ray a little in front of the robot, so the head follows the cursor across the screen
    if (r.awake && inp && Math.abs(inp.ndc.x) <= 1 && Math.abs(inp.ndc.y) <= 1) {
      const head = r.headTop(_w);
      const hit = inp.current?.hit?.point;
      _fwd.set(1, 0, 0).applyQuaternion(r.root.quaternion);          // robot X (forward) in three.js
      if (hit && _v.subVectors(hit, head).normalize().dot(_fwd) > -0.25) r.lookAt(hit);
      else {
        _ray.setFromCamera(inp.ndc, cam);
        r.lookAt(_ray.ray.at(Math.max(0.35, cam.position.distanceTo(head) - 0.45), _v));
      }
    }
    r.update(dt, time);
    if (!R) return;
    // the tapes: explain the stack the pointer rests on
    const p = inp?.current;
    const tape = r.awake && this.view === 'home' && p?.action === 'tape' ? p.tape : null;
    const id = tape ? this._reachyLine(tape) : null;
    if (id && id === R.dwellOn) R.dwell += dt;
    else { R.dwellOn = id; R.dwell = 0; }
    if (id && R.dwell > DWELL && !R.speaking && (!R.said[id] || time - R.said[id] > REPEAT_AFTER)) {
      if (this.reachySay(id)) R.said[id] = time;
    }
    // the bubble hangs over the head while it talks; leaving the desk view or falling asleep ends the line
    if (R.speaking) {
      if (this.view !== 'home' || !r.awake) this._reachyHush();
      else if (time > R.speaking.until) { R.speaking = null; R.bubble.hide(); }
      else {
        r.headTop(_v).project(cam);
        const rect = this.stage.renderer.domElement.getBoundingClientRect();
        R.bubble.place(rect.left + (_v.x * 0.5 + 0.5) * rect.width, rect.top + (-_v.y * 0.5 + 0.5) * rect.height);
      }
    }
  },
});

export { App };
