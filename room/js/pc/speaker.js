export class PcSpeaker {
  constructor(audio) {
    this.enabled = true;
    this.master = null;
    this.setAudio(audio || null);
  }

  setAudio(audio) {
    try { this.master?.disconnect(); } catch {}
    this.audio = audio || null;
    this.ctx = audio?.context || null;
    this.destination = audio?.destination || this.ctx?.destination || null;
    this.master = null;
    if (this.ctx && this.destination) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.04;
      this.master.connect(this.destination);
    }
  }

  setEnabled(v) {
    this.enabled = !!v;
  }

  beep(freq = 800, seconds = 0.25) {
    const ctx = this.ctx;
    const master = this.master;
    if (!this.enabled || !ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const low = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(Math.max(40, Math.min(6000, freq)), now);
    low.type = 'lowpass';
    low.frequency.value = 4200;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.75, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.02, seconds));
    osc.connect(low);
    low.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  sound(freq, ticks = 5) {
    this.beep(Number(freq) || 440, Math.max(0.02, (Number(ticks) || 5) / 18.2));
  }

  play(mml = '') {
    const ctx = this.ctx;
    const master = this.master;
    if (!this.enabled || !ctx || !master) return;
    let octave = 4;
    let length = 4;
    let tempo = 120;
    let time = ctx.currentTime;
    const notes = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    const s = String(mml).toLowerCase();
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (/\s|,/.test(ch)) continue;
      const readNum = () => {
        let n = '';
        while (/\d/.test(s[i + 1])) { i += 1; n += s[i]; }
        return n ? Number(n) : null;
      };
      if (ch === 'o') octave = readNum() ?? octave;
      else if (ch === 'l') length = readNum() ?? length;
      else if (ch === 't') tempo = readNum() ?? tempo;
      else if (ch === '<') octave -= 1;
      else if (ch === '>') octave += 1;
      else if (ch === 'p') {
        const len = readNum() || length;
        time += (60 / tempo) * (4 / len);
      } else if (notes[ch] !== undefined) {
        let semi = notes[ch];
        if (s[i + 1] === '#' || s[i + 1] === '+') { semi += 1; i += 1; }
        else if (s[i + 1] === '-') { semi -= 1; i += 1; }
        const len = readNum() || length;
        let dur = (60 / tempo) * (4 / len);
        if (s[i + 1] === '.') { dur *= 1.5; i += 1; }
        const freq = 440 * 2 ** (((octave - 4) * 12 + semi - 9) / 12);
        this.toneAt(freq, time, dur * 0.85, ctx, master);
        time += dur;
      }
    }
  }

  toneAt(freq, time, seconds, ctx = this.ctx, master = this.master) {
    if (!this.enabled || !ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.45, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.01, seconds));
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + seconds + 0.02);
  }
}
