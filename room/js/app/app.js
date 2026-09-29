import * as THREE from 'three';
import { LIGHTS } from '../scene/materials.js';
import { Rig } from '../scene/rig.js';
import { workItems } from '../content.js';

// ---------------------------------------------------------------------------------------------------------------
// App: routes (hash), views, what each screen shows, audio mix, cards and hints. Input lives in input.js.
//   home · about (PC pager) · online (PC BBS) · pc (C) · work (notepad) · posts (teletext) · tv (Z) · cd (M)
//   · tape/<id> (a tape in the VCR) · window (looking out at the city)
// ---------------------------------------------------------------------------------------------------------------
const HINT_HOME = 'C computer · M CD player · Z zoom TV · W look outside · R Reachy · S Stack-chan · 1–6 TV buttons';
const V = (p, t, fov) => ({ pos: new THREE.Vector3(...p), target: new THREE.Vector3(...t), fov });
// the LOOK OUTSIDE view: camera, framing and how far you can turn your head (radians)
export const LOOK_CAM = {
  pos: [0.26, 1.36, -0.37],
  target: [0.169, 1.154, -1.667],
  fov: 50,
  look: { limitYaw: 0.55, limitUp: 0.3, limitDown: 0.45, spring: false, speed: 0.8 },
};

export const CHANNELS = {
  0: { id: 'tv_ident', label: 'CH 00' },
  1: { id: 'tv_forecast', label: 'CH 01' },
  2: { id: 'tv_work', label: 'CH 02' },
  3: { id: 'tv_teletext', label: 'CH 03' },
};

export class App {
  constructor({ stage, world, hud, audio, content }) {
    this.stage = stage;
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    this.content = content;
    this.items = workItems(content);
    const views = { ...world.room.views };
    // extra framings (not in the GLB): the held notepad, a slightly wider desk
    views.Cam_Work = V([0.3, 1.1, 1.45], [0.36, 0.93, -0.3], 30);
    views.Cam_Intro = V([0.05, 1.16, 2.35], [0.0, 1.06, -0.62], 26.4);
    // leaning over the desk with the nose almost on the glass, looking down at the rail yard
    // the window scene may bring its own framing (city_meta.json "look_cam"), merged over the default
    const lc = world.win?.meta?.look_cam || {};
    this.lookCam = { ...LOOK_CAM, ...lc, look: { ...LOOK_CAM.look, ...(lc.look || {}) } };
    views.Cam_Look = V(this.lookCam.pos, this.lookCam.target, this.lookCam.fov);
    // the TV close-up with room for the info card on the right (landscape screens): slide the camera sideways
    if (views.Cam_TV) {
      const side = new THREE.Vector3(0.068, 0, 0);
      views.Cam_TVc = { ...views.Cam_TV, pos: views.Cam_TV.pos.clone().add(side), target: views.Cam_TV.target.clone().add(side) };
    }
    this.rig = new Rig(stage.camera, views, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    this.rig.adaptFov = (f) => stage.adaptFov(f);
    this.route = null;
    this.view = 'home';
    this.channel = 0;          // what the TV shows when no tape is playing
    this.line = false;         // TV input set to the VCR
    this.tape = null;          // the tape in the VCR
    this.vcr = { state: 'empty', counter: 0, rate: 1, until: 0 };
    this.cardHidden = false;
    this.time = 0;
    this.tvMeta = null;
    this.hover = null;
    this.workHighlight = -1;
    this.pcBooted = false;
    this.bakeK = 1 / (world.room.lmMeta.tv_bake_strength || 6);
    world.tapes.onInsert = (tape, info) => this._tapeInserted(tape, info);
    world.tapes.onEject = (tape) => this._tapeEjected(tape);
    audio.music.onchange((s) => this._musicChanged(s));
  }

  // ---- boot ---------------------------------------------------------------------------------------------------
  start() {
    const { tv, pc } = this.world;
    this.rig.go('Cam_Intro', { instant: true });
    tv.mount('tv_ident', null, { burst: 0.2 });
    this.pcBooted = true;
    pc.boot(this.audio);
    this._musicChanged();                       // the CD player's LCD shows the loaded disc
    setTimeout(() => tv.setPower(true), 450);
    const r = this._parseHash();
    this.navigate(r.route, { replace: true, param: r.param, first: true });
    addEventListener('hashchange', () => {
      const h = this._parseHash();
      if (h.route !== this.route || h.param !== this.routeParam) this.navigate(h.route, { param: h.param, fromHash: true });
    });
  }

  _parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [route, param] = h.split('/');
    const known = ['about', 'online', 'pc', 'work', 'posts', 'tv', 'cd', 'tape', 'window'];
    return known.includes(route) ? { route, param: param || null } : { route: 'home', param: null };
  }

  _setHash(route, param, replace) {
    const h = route === 'home' ? '' : `#${route}${param ? `/${encodeURIComponent(param)}` : ''}`;
    const url = `${location.pathname}${location.search}${h}`;
    if (`${location.pathname}${location.search}${location.hash}` === url) return;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

  // ---- routing ------------------------------------------------------------------------------------------------
  navigate(route, { param = null, replace = false, fromHash = false, first = false } = {}) {
    const prev = this.route;
    if (route === 'tape') {
      const tape = this.world.tapes.tapes.find((t) => t.item.id === param || String(t.index) === param);
      if (!tape) route = 'work';
      else {
        if (!fromHash) this._setHash('tape', tape.item.id, replace);
        this.route = 'tape';
        this.routeParam = tape.item.id;
        this._leave(prev, 'tape');
        this.playTape(tape, { navigate: false, first });
        return;
      }
    }
    if (!fromHash) this._setHash(route, param, replace);
    this.route = route;
    this.routeParam = param;
    this._leave(prev, route);
    const { tv, pc, held, props } = this.world;
    const hud = this.hud;
    hud.setRoute(route === 'tv' ? (this.line ? 'work' : 'home') : route);
    hud.hideCard();
    hud.hideTooltip();
    this.cardHidden = false;
    const intro = first && route === 'home';
    switch (route) {
      case 'about':
      case 'online':
      case 'pc':
        this.view = 'pc';
        this.rig.go('Cam_PC', { duration: first ? 0 : undefined });
        if (route !== 'pc') pc.input({ type: 'run', command: route === 'about' ? 'ABOUT' : 'ONLINE' });
        hud.setHint(route === 'pc' ? 'Type HELP · F1 about · F2 online' : '↑↓ Space · L link · Q quit');
        hud.setBack('BACK TO THE DESK · ESC');
        this.audio.setListener('pc');
        break;
      case 'work':
        this.view = 'work';
        this.rig.go('Cam_Work', { duration: first ? 0 : 1.3 });
        held.show(true);
        this._showChannel(2);
        hud.setHint('↑ ↓ pick a tape · Enter plays it');
        hud.setBack('PUT DOWN NOTEPAD · ESC');
        this.audio.setListener('work');
        break;
      case 'posts':
        this.view = 'posts';
        this.rig.go('Cam_Channel', { duration: first ? 0 : undefined });
        this._showChannel(3);
        hud.setHint('↑ ↓ pick · Enter reads · ← → turns the page');
        hud.setBack('BACK TO THE DESK · ESC');
        this.audio.setListener('posts');
        break;
      case 'tv':
        this.view = 'tv';
        this.rig.go(this.tvCam(), { duration: first ? 0 : undefined });
        this._tvCard();
        hud.setHint('CARD · N');
        hud.setBack('BACK TO THE DESK · ESC');
        this.audio.setListener('tv');
        break;
      case 'window':
        this.view = 'window';
        this.rig.go('Cam_Look', { duration: first ? 0 : 2.1, arc: 0.03 });
        this.rig.setLook(this.lookCam.look);
        this.world.win.lookingOut(true, this.time);
        hud.setHint('Drag to look around · click or ESC to go back');
        hud.setBack('BACK TO THE DESK · ESC');
        hud.announce?.('Looking out of the window');
        this.audio.setListener('window');
        break;
      case 'cd':
        this.view = 'cd';
        this.rig.go('Cam_CD', { duration: first ? 0 : undefined });
        if (!this.audio.music.playing) props.setLid(true);
        this.world.lcd.flash(2.2);
        this._cdCard();
        hud.setHint('Space play · ← → track · ESC back');
        hud.setBack('BACK TO THE DESK · ESC');
        this.audio.setListener('cd');
        break;
      default:
        this.view = 'home';
        this.rig.go(intro ? 'Cam_Home' : 'Cam_Home', { duration: intro ? 3.2 : undefined, arc: intro ? 0 : undefined });
        if (!this.line && this.channel !== 0 && prev !== 'tv') this._showChannel(0);
        hud.setHint(HINT_HOME);
        hud.setBack('');
        this.audio.setListener('home');
    }
    this._leds();
  }

  _leave(prev, next) {
    const { held, props } = this.world;
    if (prev === 'window' && next !== 'window') this.rig.setLook(null);
    if (prev === 'work' && next !== 'work') held.show(false);
    if (prev === 'cd' && next !== 'cd' && props.lidOpen) props.setLid(false);
    if (this.workHighlight !== -1 && next !== 'work') this._highlightWork(-1);
  }

  tvCam() {
    return innerWidth >= 900 && innerWidth / innerHeight > 1.25 && this.rig.views.Cam_TVc ? 'Cam_TVc' : 'Cam_TV';
  }

  back() {
    if (this.route === 'home') return;
    this.navigate('home');
  }

  // ---- TV -----------------------------------------------------------------------------------------------------
  _showChannel(n, { sound = true } = {}) {
    const { tv } = this.world;
    const ch = CHANNELS[n] || CHANNELS[0];
    const changed = this.line || this.channel !== n;
    this.channel = n;
    this.line = false;
    if (changed && sound) this.audio.play('tv_channel');
    tv.rate = 1;
    tv.mount(ch.id, null, { burst: changed ? 0.55 : 0.1 });
    tv.showOsd(ch.label, null, 1600);
    this._leds();
    if (this.route === 'tv') this._tvCard();
  }

  _showLine() {
    const { tv } = this.world;
    const tape = this.tape;
    this.line = true;
    this.audio.play('tv_channel');
    if (!tape) {
      tv.mount('tv_nosignal', null, { burst: 0.5 });
    } else if (this.vcr.state === 'stop') {
      tv.mount('tv_nosignal', null, { burst: 0.3 });
    } else {
      tv.mount('tv_tape', { item: tape.item, index: tape.index - 1 }, { burst: 0.6 });
    }
    tv.showOsd('LINE', null, 1400);
    this._leds();
  }

  tvButton(i) {
    const { tv, props } = this.world;
    props.press(i === 0 ? 'TV_Btn_Power' : `TV_Btn_${i}`);
    this.audio.play('tv_btn');
    if (i === 0) {
      tv.setPower(!tv.on);
      this._leds();
      return;
    }
    if (!tv.on) { tv.setPower(true); }
    if (i >= 1 && i <= 3) {
      // pressing the lit channel again toggles back to the VCR line when a tape is in
      if (!this.line && this.channel === i && this.tape) this._showLine();
      else this._showChannel(i);
    } else {
      const mode = ['underscan', 'hv', 'blue'][i - 4];
      tv.toggleMode(mode);
      if (mode === 'hv') this.audio.play('degauss', { volume: 0.25, rate: 1.6 });
    }
    this._leds();
  }

  knob(i) {
    const { tv, props } = this.world;
    const name = ['volume', 'contrast', 'bright'][i - 1];
    const v = tv.turnKnob(name, 1);
    props.turnKnob(i, v);
    this.audio.play('tv_btn', { rate: 0.7, volume: 0.6 });
  }

  _leds() {
    const { tv, props } = this.world;
    const on = tv.on;
    props.setGlow(props.tvLeds[0], on ? 1 : 0.05);
    for (let i = 1; i <= 3; i += 1) props.setGlow(props.tvLeds[i], on && !this.line && this.channel === i ? 1 : 0);
    const modes = ['underscan', 'hv', 'blue'];
    for (let i = 4; i <= 6; i += 1) props.setGlow(props.tvLeds[i], on && tv.modes[modes[i - 4]] ? 1 : 0);
  }

  _tvCard() {
    if (this.route !== 'tv' || this.cardHidden) return;
    const tape = this.line ? this.tape : null;
    const ch = CHANNELS[this.channel];
    const programme = {
      tv_ident: ['Station ident', `${this.content.site?.name || ''} — ${this.content.site?.tagline || ''}`],
      tv_forecast: ['The Late Forecast', 'Weather, the city at night, and a little about me.'],
      tv_work: ['Tonight on CH 02', 'The tapes on the desk: pick one to play it.'],
      tv_teletext: ['LATETEXT', 'Posts and notes, teletext style. Arrows pick, Enter reads.'],
    }[ch.id] || ['', ''];
    this.hud.showCard('tv', {
      channel: tape ? 'LINE A' : ch.label,
      title: tape ? tape.item.title : programme[0],
      subtitle: tape ? tape.item.years : '',
      lines: [tape ? tape.item.description : programme[1]],
      actions: tape ? ['hide', 'eject', 'home'] : ['hide', 'home'],
    });
  }
}
