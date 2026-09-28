import * as THREE from 'three';
import { App } from './app_more.js';
import { SpeechBubble } from '../ui/bubble.js';

// ---------------------------------------------------------------------------------------------------------------
// Reachy Mini on the desk: wake it up (click, or R) and it raises its head with its own "toudoum", then follows the
// pointer and explains whatever the pointer rests on: the tape stacks (career, personal projects), the lamp (off or
// on, depending), the TV and its buttons, the video, the CD player, the notepad, the computer, the window, the menu
// at the top… in a speech bubble and out loud (English or Spanish, following the browser). Click it again and it
// goes back to sleep ("pfiou"). The lines and their voice live in assets/reachy/voice.json (tools/reachy_voice.py).
// ---------------------------------------------------------------------------------------------------------------
const LANG = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
const TOUCH = matchMedia('(hover: none)').matches;
const PRIORITY = { greet: 3, tape: 2, hint: 1 };
const DWELL = { tape: 0.35, hint: 0.45 };        // seconds the pointer rests on something before Reachy speaks
const REPEAT = { tape: 45, hint: 40 };           // seconds before the same line is said again
const HOLD = 2.2;                                // the bubble stays this long after the last word
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
      voice: null, loaded: false, said: {}, dwellId: null, dwell: 0, speaking: null, greeted: false, handle: null,
      dom: null, muted: null, target: null,
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
          // its first words wait (a little) for their voice to be decoded
          const id = TOUCH ? 'greet_touch' : 'greet';
          const t0 = performance.now();
          const greet = () => {
            if (!r.awake || this.view !== 'home') return;
            const line = R.voice?.lines?.[id]?.[LANG];
            const ready = !this.audio.enabled || (line && this.audio.buffers?.has(line.sound));
            if (ready || performance.now() - t0 > 2500) this.reachySay(id, 'greet');
            else setTimeout(greet, 120);
          };
          setTimeout(greet, 350);
        }
      } else if (ev === 'asleep') {
        this.hud.setReachy?.(false);
        this.hud.announce?.('Reachy is asleep');
      }
    };
    // the menu and the buttons over the room: hover (or keyboard focus) is explained too
    const dom = [
      ...[...document.querySelectorAll('.hud-nav-link')].map((el) => [el, `nav:${(el.getAttribute('href') || '').replace(/^#/, '')}`]),
      [document.querySelector('.hud-credits-trigger'), 'credits'],
      [document.querySelector('.hud-sound'), 'sound'],
    ];
    for (const [el, target] of dom) {
      if (!el) continue;
      const enter = () => { R.dom = target; };
      const leave = () => { if (R.dom === target) R.dom = null; };
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      el.addEventListener('focus', enter);
      el.addEventListener('blur', leave);
      el.addEventListener('click', () => this._reachyClicked(target));
    }
    // a click on the thing being explained: the explanation is out of date (the lamp is off now…), so it stops, and
    // that thing is not explained again until the pointer has been somewhere else
    const inp = this.input;
    if (inp && !inp._reachyWrapped) {
      const click = inp.click.bind(inp);
      inp.click = () => { this._reachyClicked(R.target); click(); };
      inp._reachyWrapped = true;
    }
    return R;
  },

  _reachyClicked(target) {
    const R = this._reachy;
    if (!R || !target) return;
    R.muted = target;
    if (R.speaking?.target === target && R.speaking.kind === 'hint') this._reachyHush();
  },

  async reachyToggle() {
    const r = this.world.reachy;
    const R = this._reachySetup();
    if (!r || !R) return;
    const waking = !(r.state === 'awake' || r.state === 'waking');
    // a click: sound may start, like the CD player (not awaited: the robot starts moving at once, and its
    // "toudoum" 2 s later finds the sound effects decoded)
    if (waking && !this.audio.enabled) this.setSound(true).catch(() => {});
    if (!waking) this._reachyHush();
    r.toggle();
  },

  // Reachy's lines are decoded when it can first speak them (only the visitor's language)
  _reachyPreload() {
    const R = this._reachy;
    if (!R || R.loaded || !R.voice || !this.audio.context || !this.audio.enabled) return;
    R.loaded = true;
    const names = Object.values(R.voice.lines || {}).map((l) => (l[LANG] || l.en)?.sound).filter(Boolean);
    this.audio.preload?.(names);
  },

  reachySay(id, kind = 'hint', target = null) {
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
    R.bubble.say(line.text, { start, end, hold: HOLD, lang: LANG });
    if (voiced) r.speak(line.env, R.voice.rate);
    else r.speak(Array.from({ length: Math.ceil(end * 10) }, (_, i) => 0.35 + 0.25 * Math.sin(i * 1.9)), 10);
    R.speaking = { id, kind, target, talkUntil: this.time + end, until: this.time + end + HOLD };
    R.said[id] = this.time;
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

  _reachyTape(tape) {
    if (!tape) return null;
    if (tape.item?.filler) return { id: 'blank', kind: 'tape', target: `tape:${tape.index}` };
    return { id: tape.stack === 0 ? 'career' : 'projects', kind: 'tape', target: `stack:${tape.stack}` };
  },

  // what Reachy says about the thing under the pointer (null: nothing to explain there)
  _reachyHint(p) {
    if (!p) return null;
    const w = this.world;
    const h = (id, target) => ({ id, kind: 'hint', target });
    switch (p.action) {
      case 'tape': return this._reachyTape(p.tape);
      case 'tapes': {
        // the box around both stacks: the nearest tape tells which stack
        const at = p.hit?.point;
        if (!at) return null;
        let best = null;
        let bd = Infinity;
        for (const t of w.tapes.tapes) {
          const d = t.anchor.getWorldPosition(_v).distanceToSquared(at);
          if (d < bd) { bd = d; best = t; }
        }
        return this._reachyTape(best);
      }
      case 'tv': return h(w.tv.on ? 'h_tv' : 'h_tv_off', 'tv');
      case 'tvbtn':
        if (p.index === 0) return h(w.tv.on ? 'h_tvpower_on' : 'h_tvpower_off', 'tvbtn:0');
        if (p.index <= 3) return h(`h_ch${p.index}`, `tvbtn:${p.index}`);
        return h('h_tvmode', 'tvmode');
      case 'knob': return h('h_knobs', 'knobs');
      case 'vcr': return h(this.tape ? 'h_vcr_tape' : 'h_vcr', 'vcr');
      case 'vcrbtn':
        if (p.button === 'eject') return h('h_vcr_eject', 'vcr:eject');
        if (p.button === 'rec') return h('h_vcr_rec', 'vcr:rec');
        return h('h_vcr_keys', 'vcr:keys');
      case 'cd': return h('h_cd', 'cd');
      case 'cdbtn': return h('h_cd_keys', 'cd:keys');
      case 'lamp': return h(w.props.lampOn ? 'h_lamp_on' : 'h_lamp_off', 'lamp');
      case 'phone': return h(w.props.handsetTarget ? 'h_phone_up' : 'h_phone', 'phone');
      case 'work': return h('h_notepad', 'notepad');
      case 'pc':
      case 'key': return h('h_pc', 'pc');
      case 'window': return h('h_window', 'window');
      case 'reachy': return h('h_reachy', 'reachy');
      default: return null;
    }
  },

  _reachyDomHint(target) {
    if (!target) return null;
    if (target.startsWith('nav:')) return { id: `h_nav_${target.slice(4)}`, kind: 'hint', target };
    if (target === 'credits') return { id: 'h_credits', kind: 'hint', target };
    if (target === 'sound') return { id: this.audio.enabled ? 'h_sound_on' : 'h_sound_off', kind: 'hint', target };
    return null;
  },

  _reachyUpdate(dt, time) {
    const r = this.world.reachy;
    if (!r) return;
    const R = this._reachySetup();
    const inp = this.input;
    const cam = this.stage.camera;
    const p = inp?.current;
    // where to look: the thing under the pointer if it is in front of the robot, otherwise a point along the pointer
    // ray a little in front of the robot, so the head follows the cursor across the screen (and the menu).
    // Pointed at itself, it looks back at you.
    if (r.awake && inp && Math.abs(inp.ndc.x) <= 1 && Math.abs(inp.ndc.y) <= 1) {
      const head = r.headTop(_w);
      const hit = p?.hit?.point;
      _fwd.set(1, 0, 0).applyQuaternion(r.root.quaternion);          // robot X (forward) in three.js
      if (p?.group === 'reachy') r.lookAt(cam.position);
      else if (hit && !R?.dom && _v.subVectors(hit, head).normalize().dot(_fwd) > -0.25) r.lookAt(hit);
      else {
        _ray.setFromCamera(inp.ndc, cam);
        r.lookAt(_ray.ray.at(Math.max(0.35, cam.position.distanceTo(head) - 0.45), _v));
      }
    }
    r.update(dt, time);
    if (!R) return;
    this._reachyPreload();
    // what the pointer rests on (on the desk view only, where Reachy can be seen; hover needs a mouse)
    let cand = null;
    if (r.awake && this.view === 'home' && !this.rig.moving) {
      cand = this._reachyDomHint(R.dom);
      if (!cand && !TOUCH) cand = this._reachyHint(p);
      else if (!cand && TOUCH && p?.action === 'tape') cand = this._reachyTape(p.tape);
    }
    R.target = cand?.target || null;
    if (R.muted && R.muted !== R.target) R.muted = null;
    if (cand && cand.id === R.dwellId) R.dwell += dt;
    else { R.dwellId = cand?.id || null; R.dwell = 0; }
    if (cand && R.dwell >= DWELL[cand.kind] && cand.target !== R.muted && cand.id !== R.speaking?.id
      && (!R.said[cand.id] || time - R.said[cand.id] > REPEAT[cand.kind])) {
      const cur = R.speaking;
      const talking = cur && time < cur.talkUntil;
      // a new thing interrupts an explanation of another thing, never the greeting; the tapes outrank the rest
      if (!talking || PRIORITY[cand.kind] > PRIORITY[cur.kind] || (cand.kind === 'hint' && cur.kind === 'hint')) {
        this.reachySay(cand.id, cand.kind, cand.target);
      }
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
