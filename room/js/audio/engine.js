const STORAGE_KEY = 'sound';

function dbToGain(db = 0) { return Math.pow(10, db / 20); }
function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function noopHandle() { return { stop() {}, setVolume() {} }; }

export class AudioEngine {
  constructor({ basePath = 'assets/audio/' } = {}) {
    this.basePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.manifest = {};
    this.buffers = new Map();
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.activeLoops = new Map();
    this.sceneLoops = new Map();
    this.tvLoop = null;
    this.tvLoopName = null;
    this.vcrMotorLoop = null;
    this.whine = null;
    this.hum = null;
    this._enabled = localStorage.getItem(STORAGE_KEY) === 'on';
    this._musicCallbacks = new Set();
    this._mediaSource = null;
    this._musicAudio = null;
    this._musicGain = null;
    this._musicIndex = 0;
    this._musicVolume = 0.85;
    this._musicTitles = ['Rain on Glass', 'Night Shift', 'Tape Hiss Lullaby'];
    this.music = this._makeMusicApi();
    this.tv = this._makeTvApi();
    this.pcSpeaker = { context: null, destination: null };
  }

  get context() { return this.ctx; }
  get enabled() { return this._enabled; }

  async init() {
    try {
      const res = await fetch(`${this.basePath}manifest.json`, { cache: 'no-cache' });
      this.manifest = res.ok ? await res.json() : {};
      this.music.tracks = (this.manifest._content?.music || ['music_01', 'music_02', 'music_03'])
        .map((id, i) => ({ id, title: this.manifest[id]?.title || this._musicTitles[i] || id }));
    } catch (err) {
      console.warn('Audio manifest unavailable', err);
      this.manifest = {};
    }
    return this;
  }

  async unlock() {
    if (!this.ctx) this._createContext();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const groups = ['sfx', 'amb', 'tv'];
    const entries = Object.entries(this.manifest).filter(([k, v]) => !k.startsWith('_') && groups.includes(v.group));
    const sfx = entries.filter(([, v]) => v.group === 'sfx');
    const rest = entries.filter(([, v]) => v.group !== 'sfx');
    await this._decodeList(sfx);
    await this._decodeList(rest);
    this.setEnabled(this._enabled);
    return this;
  }

  setEnabled(on) {
    this._enabled = !!on;
    localStorage.setItem(STORAGE_KEY, this._enabled ? 'on' : 'off');
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this._enabled ? 1 : 0, now + 0.4);
    if (!this._enabled) this.music.pause();
  }

  play(name, opts = {}) {
    if (!this.ctx || !this._enabled) return noopHandle();
    const chosen = this._resolveVariant(name, opts.variant);
    const buffer = this.buffers.get(chosen);
    const meta = this.manifest[chosen] || this.manifest[name];
    if (!buffer || !meta) return noopHandle();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = (opts.rate ?? 1) * (this.manifest[name]?.variants ? 0.98 + Math.random() * 0.04 : 1);
    if (opts.detune) src.detune.value = opts.detune;
    const gain = this.ctx.createGain();
    gain.gain.value = (opts.volume ?? 1) * dbToGain(meta.gain || 0);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(gain).connect(pan).connect(this._bus(opts.bus || meta.group || 'sfx'));
    const start = this.ctx.currentTime + (opts.delay || 0);
    try { src.start(start); } catch {}
    return { stop: (fade = 0.05) => this._stopSource(src, gain, fade) };
  }

  loop(name, opts = {}) {
    if (!this.ctx || !this._enabled) return noopHandle();
    const buffer = this.buffers.get(name);
    const meta = this.manifest[name];
    if (!buffer || !meta) return noopHandle();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this._bus(opts.bus || meta.group || 'sfx'));
    const t0 = this.ctx.currentTime + (opts.delay || 0);
    src.start(t0);
    const target = (opts.volume ?? 1) * dbToGain(meta.gain || 0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(target, t0 + (opts.fade ?? 0.3));
    const handle = {
      setVolume: (v, t = 0.2) => {
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(v * dbToGain(meta.gain || 0), now + t);
      },
      stop: (fade = 0.3) => this._stopSource(src, gain, fade),
    };
    this.activeLoops.set(name, handle);
    return handle;
  }

  setScene(scene = {}) {
    if (!this.ctx || !this._enabled) return;
    const mapping = {
      rain: 'amb_rain_window',
      city: 'amb_city',
      room: 'amb_room',
      pcFan: 'pc_fan_loop',
      cdSpin: 'cd_spin_loop',
    };
    for (const [key, name] of Object.entries(mapping)) this._setSceneLoop(name, scene[key] || 0);
    this._setWhine(!!scene.tvOn && scene.crtWhine !== 0, scene.crtWhine ?? 1);
    this._setHum(scene.room || 0);
  }

  setListener(view = 'home') {
    if (!this.ctx) return;
    const presets = {
      home: { tv: 0.75, music: 0.85, sfx: 1, amb: 1 },
      tv: { tv: 1.25, music: 0.6, sfx: .9, amb: .8 },
      posts: { tv: 1.1, music: .65, sfx: .9, amb: .8 },
      pc: { tv: .45, music: .55, sfx: 1.2, amb: 1.15 },
      cd: { tv: .45, music: 1.1, sfx: .95, amb: .9 },
      work: { tv: .9, music: .7, sfx: 1, amb: .9 },
      tape: { tv: 1.25, music: .55, sfx: .9, amb: .8 },
      credits: { tv: .7, music: .75, sfx: .8, amb: .75 },
      window: { tv: .35, music: .55, sfx: 1, amb: 1.35 },
    }[view] || {};
    for (const [bus, value] of Object.entries(presets)) {
      const gain = bus === 'music' ? this._musicGain : this.buses[bus];
      if (!gain) continue;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(value, now + 0.8);
    }
  }

  thunder(delay = 0) { return this.play('thunder_far', { delay, bus: 'amb', volume: 1 }); }

  vcrMotor(on, { fade = 0.45, volume = 1 } = {}) {
    if (!this.ctx || !this._enabled) return noopHandle();
    if (on) {
      if (!this.vcrMotorLoop) this.vcrMotorLoop = this.loop('vcr_motor_loop', { bus: 'amb', fade, volume });
      else this.vcrMotorLoop.setVolume(volume, fade);
      return this.vcrMotorLoop;
    }
    if (this.vcrMotorLoop) {
      this.vcrMotorLoop.stop(fade);
      this.vcrMotorLoop = null;
    }
    return noopHandle();
  }

  _createContext() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.master = this.ctx.createGain();
    this.master.gain.value = this._enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);
    this.buses.sfx = this.ctx.createGain();
    this.buses.amb = this.ctx.createGain();
    this.buses.music = this.ctx.createGain();
    this.buses.tv = this._makeTvBus();
    this.buses.sfx.connect(this.master);
    this.buses.amb.connect(this.master);
    this.buses.music.connect(this.master);
    this._musicGain = this.buses.music;
    this.pcSpeaker = { context: this.ctx, destination: this._makePcBus() };
  }

  _makeTvBus() {
    const input = this.ctx.createGain();
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = Float32Array.from({ length: 2048 }, (_, i) => {
      const x = i / 1024 - 1;
      return Math.tanh(x * 1.8);
    });
    const out = this.ctx.createGain(); out.gain.value = .85;
    input.connect(hp).connect(lp).connect(shaper).connect(out);
    out.connect(this.master);
    this._tvOutput = out;
    return input;
  }

  _makePcBus() {
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const gain = this.ctx.createGain(); gain.gain.value = .65;
    hp.connect(lp).connect(gain).connect(this.buses.sfx);
    return hp;
  }

  _bus(bus) { return this.buses[bus] || this.buses.sfx || this.master; }

  async _decodeList(entries) {
    await Promise.all(entries.map(async ([name, meta]) => {
      if (this.buffers.has(name) || !meta?.file) return;
      try {
        const res = await fetch(`${this.basePath}${meta.file}`);
        if (!res.ok) throw new Error(`${res.status} ${meta.file}`);
        const arr = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx.decodeAudioData(arr));
      } catch (err) {
        console.warn('Audio decode failed', name, err);
      }
    }));
  }

  _resolveVariant(name, variant) {
    if (variant) return variant === true ? this._randomVariant(name) : variant;
    return this.manifest[name]?.variants ? this._randomVariant(name) : name;
  }

  _randomVariant(name) {
    const v = this.manifest[name]?.variants || [name];
    return v[Math.floor(Math.random() * v.length)] || name;
  }

  _stopSource(src, gain, fade = 0.2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fade);
    try { src.stop(now + fade + 0.03); } catch {}
  }

  _setSceneLoop(name, value) {
    value = clamp(Number(value) || 0);
    let h = this.sceneLoops.get(name);
    if (value > 0 && !h) {
      h = this.loop(name, { volume: 0, bus: 'amb', fade: .8 });
      this.sceneLoops.set(name, h);
    }
    if (h) h.setVolume(value, .8);
    if (h && value <= 0.001) {
      h.stop(.8);
      this.sceneLoops.delete(name);
    }
  }

  _setWhine(on, level = 1) {
    if (on && !this.whine) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = 15680;
      g.gain.value = 0;
      osc.connect(g).connect(this.buses.amb);
      osc.start();
      this.whine = { osc, g };
    }
    if (this.whine) {
      this.whine.g.gain.linearRampToValueAtTime(on ? 0.0025 * clamp(level) : 0, this.ctx.currentTime + .5);
      if (!on) setTimeout(() => {
        if (this.whine && this.whine.g.gain.value < 0.0001) {
          try { this.whine.osc.stop(); } catch {}
          this.whine = null;
        }
      }, 700);
    }
  }

  _setHum(level = 0) {
    if (level > 0 && !this.hum) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = 50;
      g.gain.value = 0;
      osc.connect(g).connect(this.buses.amb);
      osc.start();
      this.hum = { osc, g };
    }
    if (this.hum) this.hum.g.gain.linearRampToValueAtTime(0.006 * clamp(level), this.ctx.currentTime + .8);
  }

  _makeTvApi() {
    const engine = this;
    return {
      // intro: a one-shot (station jingle) that plays first; the loop fades in as it ends
      playLoop: (name, { fade = .4, intro = null } = {}) => {
        const introOn = !!this._tvIntro && this.ctx && this.ctx.currentTime < this._tvIntroEnd;
        // same loop: keep it, unless its intro is still running and the new programme has none (cut the sting)
        if (name && this.tvLoopName === name && this.tvLoop && (intro || !introOn)) return this.tvLoop;
        if (this.tvLoop) this.tvLoop.stop(fade);
        this._tvIntro?.stop(fade);
        this._tvIntro = null;
        let delay = 0;
        if (name && intro && this.manifest[intro] && this.ctx) {
          this._tvIntro = this.play(intro, { bus: 'tv' });
          delay = Math.max(0, (this.manifest[intro].duration || 0) - 0.6);
          this._tvIntroEnd = this.ctx.currentTime + delay;
        }
        this.tvLoop = name ? this.loop(name, { bus: 'tv', fade: delay ? 1.2 : fade, delay }) : null;
        this.tvLoopName = name || null;
        return this.tvLoop;
      },
      stop: (fade = .4) => {
        if (this.tvLoop) this.tvLoop.stop(fade);
        this._tvIntro?.stop(fade);
        this._tvIntro = null;
        this.tvLoop = null;
        this.tvLoopName = null;
      },
      get current() { return engine.tvLoopName; },
      playOnce: (name) => this.play(name, { bus: 'tv' }),
      setVolume: (v) => { if (this._tvOutput) this._tvOutput.gain.value = clamp(v, 0, 2); },
    };
  }

  _makeMusicApi() {
    const engine = this;
    const api = {
      tracks: [],
      load: async (i = 0) => {
        if (!this.ctx) await this.unlock();
        this._musicIndex = (i + api.tracks.length) % Math.max(1, api.tracks.length);
        const id = api.tracks[this._musicIndex]?.id;
        if (!id || !this.manifest[id]) return;
        if (!this._musicAudio) this._setupMusicElement();
        this._musicAudio.src = `${this.basePath}${this.manifest[id].file}`;
        this._musicAudio.load();
        this._notifyMusic();
      },
      play: async () => {
        if (!this._enabled) return;
        if (!this._musicAudio?.src) await api.load(this._musicIndex);
        try { await this._musicAudio.play(); } catch {}
        this._notifyMusic();
      },
      pause: () => { if (this._musicAudio) this._musicAudio.pause(); this._notifyMusic(); },
      toggle: () => api.playing ? api.pause() : api.play(),
      next: async () => { await api.load(this._musicIndex + 1); return api.play(); },
      prev: async () => { await api.load(this._musicIndex - 1); return api.play(); },
      seek: (s) => { if (this._musicAudio) this._musicAudio.currentTime = s; },
      onchange: (cb) => { this._musicCallbacks.add(cb); return () => this._musicCallbacks.delete(cb); },
      get currentTime() { return engine._musicAudio?.currentTime || 0; },
      get duration() {
        const d = engine._musicAudio?.duration;
        if (Number.isFinite(d) && d > 0) return d;
        return engine.manifest?.[api.tracks[engine._musicIndex || 0]?.id]?.duration || 0;   // before metadata loads
      },
      get index() { return engine._musicIndex; },
      get playing() { return !!engine._musicAudio && !engine._musicAudio.paused; },
      get volume() { return engine._musicVolume; },
      set volume(v) {
        engine._musicVolume = clamp(v, 0, 1);
        if (engine._musicAudio) engine._musicAudio.volume = engine._musicVolume;
      },
    };
    return api;
  }

  _setupMusicElement() {
    this._musicAudio = new Audio();
    this._musicAudio.preload = 'metadata';
    this._musicAudio.crossOrigin = 'anonymous';
    this._musicAudio.volume = this._musicVolume;
    this._musicAudio.addEventListener('ended', () => this.music.next());
    this._musicAudio.addEventListener('timeupdate', () => this._notifyMusic());
    this._mediaSource = this.ctx.createMediaElementSource(this._musicAudio);
    this._mediaSource.connect(this.buses.music);
  }

  _notifyMusic() {
    const state = {
      index: this.music.index,
      track: this.music.tracks[this.music.index],
      currentTime: this.music.currentTime,
      duration: this.music.duration,
      playing: this.music.playing,
    };
    this._musicCallbacks.forEach((cb) => cb(state));
  }
}

export const audioEngine = new AudioEngine();
export async function initAudio(options) {
  const engine = options ? new AudioEngine(options) : audioEngine;
  await engine.init();
  return engine;
}
