import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Pointer + keyboard. Drag = free look; click = act on what is under the pointer; hover = tooltip + glow.
// Press and hold: on the lamp, aim it (the shade follows the pointer until release); on Stack-chan, switch it off.
// Wheel over Stack-chan: its LED colour. Rubbing the pointer over its head: a scratch.
// Keyboard: C computer · M CD · Z zoom TV · W window · 1–6 monitor buttons · N card · L lamp · R Reachy ·
// S Stack-chan · Esc back. On the PC view every key goes to the computer (a hidden input summons the on-screen
// keyboard on touch devices).
// ---------------------------------------------------------------------------------------------------------------
const PC_VIEWS = new Set(['pc']);
const HOLD = { lamp: [260, 380], stackchan: [700, 750] };   // ms to hold (mouse, touch) before it counts

export class Input {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ndc = new THREE.Vector2(9, 9);
    this.down = null;
    this.dragging = false;
    this.hoverKey = null;
    this.hoverMats = [];
    this.lastMove = 0;
    this.dirty = true;
    this.kbd = document.createElement('textarea');
    this.kbd.className = 'pc-keyboard-proxy';
    this.kbd.setAttribute('autocapitalize', 'off');
    this.kbd.setAttribute('autocomplete', 'off');
    this.kbd.setAttribute('autocorrect', 'off');
    this.kbd.setAttribute('spellcheck', 'false');
    this.kbd.setAttribute('aria-label', 'Computer keyboard');
    document.body.appendChild(this.kbd);
    this.kbd.addEventListener('input', () => {
      const v = this.kbd.value;
      this.kbd.value = '';
      if (!v || !this._pcActive()) return;
      for (const ch of v) this._pcKey(ch === '\n' ? 'Enter' : ch, ch === '\n' ? 'Enter' : null);
    });
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', () => this.onCancel());
    canvas.addEventListener('pointerleave', () => { if (!this.aiming) { this.ndc.set(9, 9); this.dirty = true; } });
    // a long press is ours (lamp, Stack-chan): no context menu, no text selection callout
    canvas.addEventListener('contextmenu', (e) => { if (this.hold || this.aiming) e.preventDefault(); });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.onCancel());
  }

  _pcActive() { return this.app.view === 'pc'; }

  _setNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.client = { x: e.clientX, y: e.clientY };
    this.app.rig.setPointer(this.ndc.x, this.ndc.y);
    this.dirty = true;
  }

  onDown(e) {
    if (e.button !== 0) return;
    this._setNdc(e);
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType };
    this.dragging = false;
    this.holdFired = false;
    this.hold = null;
    // something to press and hold?
    if (this.app.view === 'home') {
      const p = this.pick();
      const kind = p?.action === 'lamp' ? 'lamp' : p?.action === 'stackchan' && this.app.world.stack?.awake ? 'stackchan' : null;
      if (kind) this.hold = { kind, t: this.down.t, ms: HOLD[kind][e.pointerType === 'touch' ? 1 : 0] };
    }
    this.app.audio.context?.state === 'suspended' && this.app.audio.context.resume();
  }

  // called every frame: a hold that has lasted long enough fires
  _checkHold() {
    const h = this.hold;
    if (!h || !this.down || this.dragging || this.holdFired) return;
    if (performance.now() - h.t < h.ms) return;
    this.holdFired = true;
    this.hold = null;
    const app = this.app;
    if (h.kind === 'lamp') {
      if (!app.lampGrab?.()) return;
      this.aiming = true;
      this.canvas.classList.add('is-aiming');
      app.hud.showTooltip('AIM THE LAMP', this.client?.x ?? 0, this.client?.y ?? 0);
      app.lampAim?.(this.ndc);
    } else if (h.kind === 'stackchan') {
      app.stackToggle?.();
    }
  }

  // hover state is stale (e.g. Stack-chan's label changed): re-pick on the next frame
  refresh() { this.dirty = true; this.hoverKey = '__refresh__'; }

  onMove(e) {
    const px = this.client?.x;
    this._setNdc(e);
    if (this.aiming) {
      this.app.lampAim?.(this.ndc);
      this.app.hud.showTooltip('AIM THE LAMP', e.clientX, e.clientY);
      return;
    }
    // rubbing Stack-chan's head: horizontal pointer strokes over it (mouse hover, or a finger on it)
    if (px !== undefined && this.current?.group === 'stackchan' && (!this.down || this.hold || this.down.type === 'touch')) {
      this.app.stackRub?.(e.clientX - px);
    }
    if (!this.down) return;
    const dx = e.clientX - this.down.x;
    const dy = e.clientY - this.down.y;
    // moving cancels a press-and-hold (a finger rubbing Stack-chan must not switch it off)
    if (this.hold && Math.hypot(dx, dy) > (this.down.type === 'touch' ? 10 : 5)) this.hold = null;
    // a finger rubbing Stack-chan is not a camera drag
    if (this.down.type === 'touch' && this.current?.group === 'stackchan' && this.app.world.stack?.awake) return;
    if (!this.dragging && Math.hypot(dx, dy) > (this.down.type === 'touch' ? 10 : 5)) {
      this.hold = null;
      this.dragging = true;
      this.app.rig.dragStart();
      this.canvas.classList.add('is-dragging');
      this.app.hud.hideTooltip();
      this._last = { x: e.clientX, y: e.clientY };
    }
    if (this.dragging) {
      this.app.rig.drag(e.clientX - this._last.x, e.clientY - this._last.y);
      this._last = { x: e.clientX, y: e.clientY };
    }
  }

  onUp(e) {
    if (!this.down) return;
    const wasDrag = this.dragging;
    const held = this.holdFired;
    this.down = null;
    this.dragging = false;
    this.hold = null;
    this.holdFired = false;
    this.canvas.classList.remove('is-dragging');
    if (this.aiming) { this._endAim(); return; }
    if (wasDrag) { this.app.rig.dragEnd(); return; }
    if (held) return;
    if (e.target !== this.canvas) return;
    this._setNdc(e);
    this.click();
  }

  _endAim() {
    this.aiming = false;
    this.canvas.classList.remove('is-aiming');
    this.app.lampRelease?.();
    this.dirty = true;
  }

  onCancel() {
    if (this.dragging) this.app.rig.dragEnd();
    if (this.aiming) this._endAim();
    this.down = null;
    this.dragging = false;
    this.hold = null;
    this.canvas.classList.remove('is-dragging');
  }

  onWheel(e) {
    const app = this.app;
    if (app.view === 'posts') app.world.tv.input({ type: 'key', key: e.deltaY > 0 ? 'ArrowDown' : 'ArrowUp', down: true });
    else if (app.view === 'pc') this._pcKey(e.deltaY > 0 ? 'PageDown' : 'PageUp', e.deltaY > 0 ? 'PageDown' : 'PageUp');
    else if (this.current?.group === 'stackchan') app.stackWheel?.(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY);
  }

  // ---- picking --------------------------------------------------------------------------------------------------
  pick() {
    const app = this.app;
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return null;
    // looking out of the window: the whole view is the way back
    if (app.view === 'window') return app.rig.moving ? null : { action: 'back', label: 'BACK TO THE DESK' };
    if (app.view === 'work') {
      const row = app.world.held.pick(this.ndc);
      if (row >= 0) return { action: 'workrow', index: row, label: `PLAY · ${(app.items[row]?.title || '').toUpperCase()}` };
      if (row === -2) return { action: 'none' };
    }
    const enabled = (p) => {
      if (app.rig.moving && app.rig.t < 0.85) return false;
      if (app.view === 'pc') return p.group === 'pc' || p.group === 'keyboard' || p.group === 'pccase';
      return true;
    };
    const hit = app.world.picker.pick(this.ndc, { enabled });
    if (!hit) return null;
    // zoomed TV/posts views: clicks on the picture go to the programme
    if ((app.view === 'posts' || app.view === 'tv' || app.view === 'tape') && hit.group === 'tv' && hit.action === 'tv') {
      const scr = app.world.tvScreenHit?.(this.ndc);
      if (scr) return { action: 'screen', uv: scr, label: app.view === 'posts' ? 'SELECT' : '' };
    }
    return hit;
  }

  hoverKeyOf(p) {
    if (!p) return null;
    if (p.action === 'tape') return `tape:${p.tape.index}`;
    if (p.action === 'tvbtn') return `tvbtn:${p.index}`;
    if (p.action === 'knob') return `knob:${p.index}`;
    if (p.action === 'vcrbtn') return `vcrbtn:${p.button}`;
    if (p.action === 'cdbtn') return `cdbtn:${p.button}`;
    if (['cdp', 'lamp', 'phone', 'notepad', 'reachy', 'stackchan', 'fine'].includes(p.group)) return `group:${p.group}`;
    return null;
  }

  updateHover(dt) {
    const app = this.app;
    this._checkHold();
    // on the desk view, a turned head stays turned while the pointer rests on something it can use (the diorama on the
    // dresser, the clock side of the room…); it drifts back once the pointer leaves it
    const L = app.rig.look;
    if (app.view === 'home' && !this.dragging && L.releasedAt >= 0 && this.current?.action && this.current.action !== 'none') {
      L.releasedAt = app.rig.time;
    }
    if (this.dragging || this.aiming) return;
    if (this.dirty || app.rig.moving) {
      this.dirty = false;
      const p = this.pick();
      this.current = p;
      const key = this.hoverKeyOf(p);
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.hoverMats = key ? (app.world.hoverSets.get(key) || []) : [];
        if (p?.action === 'tape' && app.view !== 'work') app.world.tapes.setHover(p.tape);
        else if (app.view !== 'work') app.world.tapes.setHover(null);
        if (key && p?.action !== 'tape') app.audio.play('ui_hover', { volume: 0.25 });
      }
      if (app.view === 'work') app._highlightWork(p?.action === 'workrow' ? p.index : -1);
      const label = p && p.action !== 'none' && !(app.view === 'pc' && p.group !== 'keyboard') ? this._label(p) : '';
      if (label && this.client && !('ontouchstart' in window && this.down)) app.hud.showTooltip(label, this.client.x, this.client.y);
      else app.hud.hideTooltip();
      this.canvas.style.cursor = p && p.action !== 'none' ? 'pointer' : '';
    }
    // hover glow fades in/out
    const all = app.world.hoverSets;
    for (const [key, mats] of all) {
      const target = key === this.hoverKey ? 1 : 0;
      for (const m of mats) {
        const u = m.uniforms.uHover;
        if (Math.abs(u.value - target) > 1e-3) u.value += (target - u.value) * (1 - Math.exp(-dt * 14));
      }
    }
  }

  _label(p) {
    const app = this.app;
    if (p.action === 'tv' && app.view === 'tv') return '';
    if (p.action === 'tv') return 'ZOOM TV';
    if (p.action === 'vcr') return this.app.tape ? `VCR · ${this.app.tape.item.title.toUpperCase()}` : 'VCR';
    if (p.action === 'lamp') return `${app.world.props.lampOn ? 'LAMP · OFF' : 'LAMP · ON'}${app.world.lamp?.ok ? ' · HOLD TO AIM' : ''}`;
    if (p.action === 'fine') return 'THIS IS FINE · PRESS';
    if (p.action === 'stackchan') {
      const s = app.world.stack;
      if (!s || s.state === 'off') return 'STACK-CHAN · SWITCH ON';
      if (s.busy) return 'STACK-CHAN';
      return s.led.on ? `STACK-CHAN · ${s.colourName} · WHEEL` : 'STACK-CHAN · LIGHTS';
    }
    if (p.action === 'phone') return 'PHONE';
    if (p.action === 'reachy') {
      const st = app.world.reachy?.state;
      return st === 'awake' || st === 'waking' ? 'REACHY · GO TO SLEEP' : 'REACHY · WAKE UP';
    }
    if (p.action === 'tapes') return 'TAPES';
    if (p.action === 'key') return '';
    return p.label || '';
  }

  click() {
    const app = this.app;
    const p = this.pick();
    app.audio.context?.state === 'suspended' && app.audio.context.resume();
    if (!p) {
      if (app.view === 'work') app.back();
      return;
    }
    switch (p.action) {
      case 'workrow': app.workSelect(p.index); break;
      case 'window': app.navigate('window'); break;
      case 'back': app.back(); break;
      case 'tape': app.world.tapes.setHover(null); app.playTape(p.tape); break;
      case 'tapes': app.navigate('work'); break;
      case 'tvbtn': app.tvButton(p.index); break;
      case 'knob': app.knob(p.index); break;
      case 'vcrbtn': app.vcrButton(p.button); break;
      case 'vcr': if (app.tape) app.navigate('tape', { param: app.tape.item.id }); else app.hud.showToast('PICK A TAPE FROM THE DESK'); break;
      case 'cdbtn': app.cdCommand(p.button === 'play' ? 'toggle' : p.button); break;
      case 'cd': if (app.view !== 'cd') app.navigate('cd'); else app.cdCommand('toggle'); break;
      case 'lamp': app.world.props.toggleLamp(); break;
      case 'phone': app.world.props.liftPhone(); break;
      case 'reachy': app.reachyToggle(); break;
      case 'stackchan': app.stackClick?.(); break;
      case 'fine': app.fineTrigger?.(); break;
      case 'work': app.navigate('work'); break;
      case 'pc':
        if (app.view !== 'pc') app.navigate('pc');
        else this.focusKeyboard();
        break;
      case 'key':
        if (app.view !== 'pc') app.navigate('pc');
        else { this._pcKey(keyFromCode(p.code), p.code); this.focusKeyboard(); }
        break;
      case 'screen': {
        const [x, y] = p.uv;
        app.world.tv.input({ type: 'pointer', kind: 'down', x, y });
        break;
      }
      case 'tv':
        if (app.view === 'tv') app.back();
        else app.navigate('tv');
        break;
      default: break;
    }
  }

  focusKeyboard() {
    if (matchMedia('(pointer: coarse)').matches) this.kbd.focus({ preventScroll: true });
  }

  // ---- keyboard -------------------------------------------------------------------------------------------------
  _pcKey(key, code, down = true, mods = {}) {
    const pc = this.app.world.pc;
    pc.input({ type: 'key', key, code: code || undefined, down, ...mods });
    if (down && key.length === 1) setTimeout(() => pc.input({ type: 'key', key, code: code || undefined, down: false }), 70);
  }

  onKey(e, down) {
    const app = this.app;
    const t = e.target;
    if (e.defaultPrevented && down) return;          // e.g. Esc already closed the credits card
    if (t && t !== this.kbd && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || (e.ctrlKey && !this._pcActive())) return;
    if (this._pcActive()) {
      if (e.key === 'Escape' && down) { e.preventDefault(); app.back(); return; }
      if (t === this.kbd && e.key.length === 1) return;          // handled by the input event (mobile)
      e.preventDefault();
      app.world.pc.input({ type: 'key', key: e.key, code: e.code, down, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, repeat: e.repeat });
      return;
    }
    if (!down) return;
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      app.back();
      return;
    }
    if (e.repeat && !/^Arrow/.test(k)) return;
    // routed views that take arrows
    if (app.view === 'posts' && (/^Arrow/.test(k) || k === 'Enter' || /^[0-9]$/.test(k))) {
      e.preventDefault();
      app.world.tv.input({ type: 'key', key: k, down: true });
      if (k.startsWith('Arrow')) app.audio.play('tv_btn', { volume: 0.25, rate: 1.4 });
      return;
    }
    if (app.view === 'work' && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter')) {
      e.preventDefault();
      const n = app.items.length;
      if (k === 'Enter') { if (app.workHighlight >= 0) app.workSelect(app.workHighlight); return; }
      const next = app.workHighlight < 0 ? 0 : (app.workHighlight + (k === 'ArrowDown' ? 1 : -1) + n) % n;
      app._highlightWork(next);
      return;
    }
    if (app.view === 'cd') {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); app.cdCommand('toggle'); return; }
      if (k === 'ArrowRight') { app.cdCommand('next'); return; }
      if (k === 'ArrowLeft') { app.cdCommand('prev'); return; }
    }
    const lower = k.toLowerCase();
    if (lower === 'c') { app.navigate(app.view === 'pc' ? 'home' : 'pc'); return; }
    if (lower === 'm') { app.navigate(app.view === 'cd' ? 'home' : 'cd'); return; }
    if (lower === 'z') { app.navigate(app.route === 'tv' ? 'home' : 'tv'); return; }
    if (lower === 'w') { app.navigate(app.view === 'window' ? 'home' : 'window'); return; }
    if (lower === 'r') { app.reachyToggle(); return; }
    if (lower === 's') { app.stackToggle?.(); return; }
    if (lower === 'n') {
      if (!app.cardHidden && app.hud.cardVisible()) {
        app.hud.hideCard();
        app.cardHidden = true;
        app.audio.play('ui_card_close', { volume: 0.6 });
        return;
      }
      app.cardHidden = false;
      app.audio.play('ui_card_open', { volume: 0.6 });
      if (app.route === 'tv') app._tvCard();
      else if (app.route === 'tape') app._tapeCard();
      else if (app.route === 'cd') app._cdCard();
      return;
    }
    if (lower === 'l') { app.world.props.toggleLamp(); return; }
    if (lower === 'e' && app.tape) { app.eject(); return; }
    if (/^[1-6]$/.test(k)) { app.tvButton(Number(k)); return; }
    if (k === '0') { app.tvButton(0); }
  }
}

const CODE_KEYS = {
  Space: ' ', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', Comma: ',',
  Period: '.', Slash: '/', NumpadEnter: 'Enter', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDecimal: '.',
};

export function keyFromCode(code = '') {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && /\d$/.test(code)) return code.slice(-1);
  if (/^F\d+$/.test(code)) return code;
  return CODE_KEYS[code] || '';
}
