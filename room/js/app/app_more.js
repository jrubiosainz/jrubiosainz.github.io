import * as THREE from 'three';
import { App } from './app.js';
import { LIGHTS } from '../scene/materials.js';

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// ---- tapes & VCR ----------------------------------------------------------------------------------------------
Object.assign(App.prototype, {
  playTape(tape, { navigate = true, first = false } = {}) {
    const { tapes } = this.world;
    if (navigate) {
      this.navigate('tape', { param: tape.item.id });
      return;
    }
    this.hud.setRoute('work');
    this.hud.setHint('CARD · N');
    this.hud.setBack('BACK TO THE DESK · ESC');
    this.hud.hideCard();
    this.view = 'tape';
    this.pendingTape = tape;
    if (this.tape === tape) {
      this.rig.go(this.tvCam(), { duration: first ? 0 : undefined });
      if (!this.line) this._showLine();
      this._tapeCard();
      return;
    }
    // watch the tape go in from the desk, then move in on the TV
    this.rig.go('Cam_Home', { duration: first ? 0 : 1.1 });
    tapes.insert(tape);
    if (first) {
      // deep link: skip the flight
      tapes.update(10);
    }
  },

  _tapeInserted(tape) {
    this.tape = tape;
    this.vcr = { state: 'play', counter: 0, rate: 1, until: 0 };
    this.world.vfd.input({ type: 'state', state: 'play', title: tape.item.title, counter: 0 });
    this.world.vfd.flash(0.8);
    if (!this.world.tv.on) this.world.tv.setPower(true);
    this._showLine();
    if (this.route === 'tape' && this.pendingTape === tape) {
      this.rig.go(this.tvCam(), { duration: 1.6 });
      setTimeout(() => { if (this.route === 'tape') this._tapeCard(); }, 900);
    }
  },

  _tapeEjected() {
    this.tape = null;
    this.vcr = { state: 'eject', counter: 0, rate: 1, until: this.time + 1.4 };
    this.world.vfd.input({ type: 'state', state: 'eject', title: '', counter: 0 });
    this.world.tv.rate = 1;
    if (this.line) this.world.tv.mount('tv_nosignal', null, { burst: 0.4 });
    if (this.route === 'tape') this.hud.hideCard();
  },

  eject() {
    const { tapes } = this.world;
    this.world.props.press('VCR_Btn_Eject');
    if (!tapes.inserted) {
      this.audio.play('vcr_btn');
      this.world.vfd.input({ type: 'state', state: 'eject' });
      setTimeout(() => this.world.vfd.input({ type: 'state', state: 'empty' }), 900);
      return;
    }
    tapes.eject(() => {
      this.world.vfd.input({ type: 'state', state: 'empty' });
      if (this.line) this._showChannel(0);
    });
    if (this.route === 'tape' || this.route === 'tv') this.navigate('home');
  },

  vcrButton(b) {
    const { tv, props, vfd } = this.world;
    const map = { eject: 'Eject', ff: 'FF', play: 'Play', power: 'Power', rec: 'Rec', rew: 'Rew', stop: 'Stop' };
    props.press(`VCR_Btn_${map[b]}`);
    if (b === 'eject') { this.eject(); return; }
    this.audio.play('vcr_btn');
    if (b === 'rec') {
      this.hud.showToast(this.tape ? 'THIS TAPE IS WRITE-PROTECTED' : 'NO TAPE');
      this.audio.play('pc_beep', { volume: 0.2, rate: 1.4 });
      return;
    }
    if (b === 'power') {
      vfd.flash(1);
      return;
    }
    if (!this.tape) {
      this.hud.showToast('NO TAPE — PICK ONE FROM THE DESK');
      return;
    }
    if (!this.line) this._showLine();
    if (b === 'play') {
      if (this.vcr.state === 'stop') {
        this.vcr.state = 'play';
        this._showLine();
      }
      this.vcr.state = 'play';
      tv.rate = 1;
      this.audio.play('vcr_play');
      this.audio.vcrMotor(true, { volume: 0.8 });
    } else if (b === 'stop') {
      this.vcr.state = 'stop';
      tv.rate = 0;
      this.audio.play('vcr_stop');
      this.audio.vcrMotor(false);
      tv.mount('tv_nosignal', null, { burst: 0.25 });
    } else if (b === 'ff' || b === 'rew') {
      if (this.vcr.state === 'stop') { this.vcr.state = 'play'; this._showLine(); }
      this.vcr.state = b;
      this.vcr.until = this.time + 2.6;
      tv.rate = b === 'ff' ? 7 : -5;
      this._seekLoop?.stop(0.1);
      this._seekLoop = this.audio.loop(b === 'ff' ? 'vcr_ff_loop' : 'vcr_rew_loop', { bus: 'sfx', volume: 0.7, fade: 0.05 });
    }
    vfd.input({ type: 'state', state: this.vcr.state });
  },

  _tapeCard() {
    const tape = this.tape;
    if (!tape || this.cardHidden) return;
    this.hud.showCard('tape', { item: tape.item, index: tape.index, loaded: true, actions: ['eject', 'home'] });
  },

  // ---- work notepad ---------------------------------------------------------------------------------------------
  _highlightWork(i) {
    if (i === this.workHighlight) return;
    this.workHighlight = i;
    this.world.held.paint(i);
    this.world.tv.input({ type: 'highlight', index: Math.max(0, i) });
    const tape = this.world.tapes.forItem(i);
    this.world.tapes.setHover(i >= 0 ? tape : null);
    if (i >= 0) this.audio.play('paper_flip', { volume: 0.12, rate: 1.6 });
  },

  workSelect(i) {
    const tape = this.world.tapes.forItem(i);
    if (!tape) return;
    this.world.held.show(false);
    this.playTape(tape);
  },

  // ---- CD player ------------------------------------------------------------------------------------------------
  async cdCommand(cmd, value) {
    const a = this.audio;
    const m = a.music;
    const { props } = this.world;
    const press = { prev: 'CDP_Btn_Prev', next: 'CDP_Btn_Next', toggle: 'CDP_Btn_Play', play: 'CDP_Btn_Play', stop: 'CDP_Btn_Stop' }[cmd];
    if (press) { props.press(press); a.play('cd_btn'); this.world.lcd.flash(1.6); }
    if (cmd === 'volume') {
      m.volume = value;
      props.setCdVolume(value);
      this.world.lcd.input({ type: 'state', volume: value });
      return;
    }
    if (!a.enabled && (cmd === 'toggle' || cmd === 'play' || cmd === 'next' || cmd === 'prev')) {
      await this.setSound(true);
    }
    if (cmd === 'toggle' || cmd === 'play') {
      if (m.playing && cmd === 'toggle') { m.pause(); props.setDisc(false); }
      else {
        if (props.lidOpen) { props.setLid(false); await new Promise((r) => setTimeout(r, 380)); }
        a.play('cd_start');
        props.setDisc(true);
        await new Promise((r) => setTimeout(r, 650));
        await m.play();
      }
    } else if (cmd === 'stop') {
      m.pause();
      m.seek(0);
      props.setDisc(false);
    } else if (cmd === 'next' || cmd === 'prev') {
      a.play('cd_seek');
      props.setDisc(true);
      if (props.lidOpen) props.setLid(false);
      await (cmd === 'next' ? m.next() : m.prev());
    }
    this._musicChanged();
  },

  _musicChanged() {
    const m = this.audio.music;
    const { lcd, props } = this.world;
    const total = m.tracks.reduce((sum, t) => sum + (this.audio.manifest?.[t.id]?.duration || 0), 0);
    lcd.input({ type: 'state', track: m.index + 1, time: m.currentTime, playing: m.playing, paused: !m.playing && m.currentTime > 0.5, volume: m.volume, tracks: m.tracks.length, total });
    props.setDisc(m.playing);
    props.setGlow(props.cdLed, m.playing ? 1 : 0.1);
    if (this.route === 'cd') this.hud.updateCard('cd', { index: m.index, time: m.currentTime, duration: m.duration, playing: m.playing, volume: m.volume });
    this._ambience();
  },

  _cdCard() {
    const m = this.audio.music;
    const c = this.content.music || {};
    this.hud.showCard('cd', {
      album: c.album, artist: c.artist, tracks: c.tracks || m.tracks, index: m.index,
      time: m.currentTime, duration: m.duration, playing: m.playing, volume: m.volume,
    });
  },

  // ---- sound ----------------------------------------------------------------------------------------------------
  async setSound(on) {
    const a = this.audio;
    if (on && !a.context) await a.unlock();
    else if (on && a.context.state !== 'running') await a.context.resume();
    a.setEnabled(on);
    this.hud.setSound(on);
    if (on) {
      this.world.pc.input({ type: 'audio', audio: a });
      this.audio.setListener(this.view === 'tape' ? 'tv' : this.view === 'work' ? 'work' : this.view);
      this.world.tv.refreshAudio();
      if (this.tape && this.vcr.state === 'play') a.vcrMotor(true, { volume: 0.8 });
    } else {
      a.tv.stop(0.2);
      a.vcrMotor(false);
    }
    this._ambience();
  },

  _ambience() {
    const a = this.audio;
    if (!a.enabled) return;
    const v = this.view;
    const tv = this.world.tv;
    a.setScene({
      rain: v === 'pc' ? 0.55 : v === 'window' ? 1.0 : 0.85,
      city: v === 'pc' ? 0.3 : v === 'window' ? 0.95 : 0.55,
      room: v === 'window' ? 0.4 : 0.6,
      pcFan: v === 'pc' ? 0.8 : 0.25,
      cdSpin: a.music.playing ? (v === 'cd' ? 0.6 : 0.12) : 0,
      tvOn: tv.on,
      crtWhine: v === 'tv' || v === 'tape' || v === 'posts' ? 1 : 0.35,
    });
  },

  // ---- per frame ------------------------------------------------------------------------------------------------
  update(dt, time) {
    this.time = time;
    const w = this.world;
    this.rig.update(dt);
    w.tapes.update(dt);
    w.props.update(dt, time);
    w.lamp?.update(dt);
    w.fine?.update(dt, time);
    w.held.update(dt, time);
    this._reachyUpdate?.(dt, time);
    this._stackUpdate?.(dt, time);
    w.win.update(time, dt, this.stage.camera);
    w.tv.frame(time, dt);
    w.pc.frame(time, dt);
    // VCR: counter + seek timeout
    if (this.tape) {
      const r = this.vcr.state === 'play' ? 1 : this.vcr.state === 'ff' ? 7 : this.vcr.state === 'rew' ? -5 : 0;
      this.vcr.counter = Math.max(0, this.vcr.counter + dt * r);
      if ((this.vcr.state === 'ff' || this.vcr.state === 'rew') && time > this.vcr.until) {
        this.vcr.state = 'play';
        w.tv.rate = 1;
        this._seekLoop?.stop(0.15);
        this._seekLoop = null;
        this.audio.play('vcr_play', { volume: 0.5 });
      }
      w.vfd.input({ type: 'state', state: this.vcr.state, counter: this.vcr.counter });
    } else if (this.vcr.state === 'eject' && time > this.vcr.until) {
      this.vcr.state = 'empty';
      w.vfd.input({ type: 'state', state: 'empty' });
    }
    w.vfd.frame(time, dt);
    if (this.audio.music.playing) this._lcdTick = (this._lcdTick || 0) + dt;
    if ((this._lcdTick || 0) > 0.25) {
      this._lcdTick = 0;
      const m = this.audio.music;
      w.lcd.input({ type: 'state', time: m.currentTime, track: m.index + 1, playing: m.playing });
      if (this.route === 'cd') this.hud.updateCard('cd', { time: m.currentTime, duration: m.duration, index: m.index, playing: m.playing });
    }
    w.lcd.frame(time, dt);
    // light from the TV onto the room (baked TV lightmap × live picture colour)
    LIGHTS.tvK.value.copy(w.tv.light).multiplyScalar(TV_GAIN_RT * this.bakeK);
    LIGHTS.tvRoom.value.copy(LIGHTS.tvK.value).multiplyScalar(TV_ROOM_BOOST);
    LIGHTS.time.value = time;
    this._boatSound(dt);
    // occluders dissolve as the camera flies into them (the plant on the way to the PC)
    const camPos = this.stage.camera.position;
    for (const o of w.occluders || []) {
      const f = THREE.MathUtils.smoothstep(o.box.distanceToPoint(camPos), 0.04, 0.26);
      if (Math.abs(f - o.fade) < 0.002) continue;
      o.fade = f;
      for (const m of o.materials) m.uniforms.uFade.value = f;
    }
    // depth of field follows the rig
    const post = this.stage.post;
    const views = { home: [0, 1.0], tape: [0.4, 1], tv: [0.25, 1], posts: [0.3, 1], pc: [0.55, 1], cd: [0.45, 1], work: [1.0, 1], window: [0, 1] };
    const [amt] = views[this.view] || [0.6, 1];
    // the CD view focuses a little in front of the disc, so the LCD and the buttons stay sharp too
    // at the window the eye is on the city: the glass and everything outside stay sharp
    const outside = this.view === 'window';
    post.dof.focus = outside ? 60 : this.view === 'work' ? Math.max(0.45, w.held.dist) : this.rig.focus * (this.view === 'cd' && !this.rig.moving ? 0.9 : 1);
    post.dof.aperture = this.view === 'home' ? 9 : 14;
    post.dof.amount = damp(post.dof.amount, outside ? 0.08 : 0.35 + amt * 0.65, 3, dt);
    // exposure follows the lamp a little, like an eye adapting
    const lampK = LIGHTS.lampK.value;
    const viewExp = { cd: 1.75, pc: 1.12, work: 1.05, window: 1.3 }[this.view] || 1.0;
    post.params.uExposure.value = damp(post.params.uExposure.value, viewExp * (1.0 + (1 - lampK) * 0.55), 1.5, dt);
    post.params.uBloom.value = 0.08 + (this.view === 'tv' || this.view === 'tape' ? 0.03 : 0);
    // the aimed lamp's shadow map, once everything has moved for this frame
    w.lamp?.renderShadow(this.stage.renderer, w.scene);
  },
});


// ---- the ría outside --------------------------------------------------------------------------------------------
Object.assign(App.prototype, {
  // a small boat engine carries through the closed glass: louder the closer it gets, and at the window.
  _boatSound(dt) {
    const a = this.audio;
    const loud = this.world.win.boatLoudness?.() || 0;
    if (!a.enabled || loud < 0.02) {
      if (this._boatLoop && (this._boatQuiet = (this._boatQuiet || 0) + dt) > 1.5) {
        this._boatLoop.stop(0.8);
        this._boatLoop = null;
      }
      return;
    }
    this._boatQuiet = 0;
    const room = { window: 1, home: 0.35, tv: 0.24, posts: 0.24, tape: 0.24, work: 0.28, cd: 0.25, pc: 0.22 }[this.view] ?? 0.25;
    const v = loud * room;
    if (!this._boatLoop) {
      this._boatLoop = a.loop('boat_loop', { bus: 'amb', volume: 0, fade: 0.05 });
      this._boatVol = -1;
    }
    if (Math.abs(v - (this._boatVol ?? -1)) > 0.01) {
      this._boatVol = v;
      this._boatLoop.setVolume(v, 0.25);
    }
  },
});

// ---- events from the screens and the HUD ------------------------------------------------------------------------
Object.assign(App.prototype, {
  _go(to) {
    const h = String(to || '').replace(/^#\/?/, '');
    const [route, param] = h.split('/');
    this.navigate(route || 'home', { param: param || null });
  },

  _open(url) {
    if (!url) return;
    if (/^(mailto:|https?:)/.test(url) && !url.startsWith(location.origin)) window.open(url, '_blank', 'noopener');
    else location.href = url;
  },

  pcEvent(ev) {
    const a = this.audio;
    const { props } = this.world;
    switch (ev?.type) {
      case 'key-sound': {
        props.key(ev.code, ev.down);
        if (this.view !== 'pc' && !ev.down) break;
        const big = ev.code === 'Space' ? 'pc_key_space' : ev.code === 'Enter' || ev.code === 'NumpadEnter' ? 'pc_key_enter' : null;
        a.play(ev.down ? (big || 'pc_key_down') : 'pc_key_up', { volume: this.view === 'pc' ? 0.9 : 0.35, pan: -0.35 });
        break;
      }
      case 'sfx': {
        const n = { hdd_seek: 'pc_hdd_seek', floppy_seek: 'pc_floppy_seek' }[ev.name] || ev.name;
        a.play(n, { volume: 0.8, pan: -0.4 });
        if (n === 'pc_hdd_seek') props.pulseDrive('C', 0.3);
        if (n === 'pc_floppy_seek') props.pulseDrive('A', 0.6);
        break;
      }
      case 'drive': props.setDrive(ev.drive, !!ev.busy); break;
      case 'navigate': this._go(ev.to); break;
      case 'open': this._open(ev.url); break;
      case 'exit': this.back(); break;
      case 'lamp': props.toggleLamp(); break;
      case 'reboot': this._rebootPc(); break;
      case 'rain': this.world.win.setRain(Number(ev.value) || 0); this.audio.setScene?.({}); break;
      default: break;
    }
  },

  // power-cycle the PC: screen collapses, fan spins down and up again, the BIOS beeps, BASIC comes back
  _rebootPc() {
    const pc = this.world.pc;
    if (this._rebooting) return;
    this._rebooting = true;
    pc.powerTarget = 0;
    this.world.props.setDrive?.('C', true);
    this.audio.play('pc_power_on', { volume: 0.9, pan: -0.4, delay: 0.35 });
    setTimeout(() => {
      try { pc.program?.stop?.(); } catch (e) { console.warn(e); }
      pc.program = null;
      pc.boot(this.audio.enabled ? this.audio : null);
      if (this.audio.enabled) pc.input({ type: 'audio', audio: this.audio });
      this.world.props.setDrive?.('C', false);
      this._rebooting = false;
    }, 1400);
  },

  tvEvent(ev) {
    if (ev?.type === 'navigate') this._go(ev.to);
    else if (ev?.type === 'open') this._open(ev.url);
  },

  hudAction(action, data) {
    if (['back', 'home', 'eject', 'tape', 'card-hide', 'open'].includes(action)) this.audio.play('ui_click', { volume: 0.5 });
    switch (action) {
      case 'sound': this.setSound(!this.audio.enabled); break;
      case 'reachy': this.reachyToggle?.(); break;
      case 'back': this.back(); break;
      case 'home': this.navigate('home'); break;
      case 'eject': this.eject(); break;
      case 'tape': {
        const t = this.world.tapes.tapes[(Number(data) || 1) - 1];
        if (t) this.playTape(t);
        break;
      }
      case 'card-hide': this.cardHidden = true; break;
      case 'cd': this.cdCommand(data?.cmd, data?.value); break;
      case 'open': this._open(data); break;
      case 'credits': this.audio.play('ui_card_open'); break;
      case 'credits-close': this.audio.play('ui_card_close'); break;
      default: break;
    }
  },
});

export const TV_GAIN_RT = 0.55;
// A 10" tube barely lights a room physically; the baked TV group is pushed so its glow reads on the desk and props.
export const TV_ROOM_BOOST = 9;
export { App };
