// ---------------------------------------------------------------------------------------------------------------
// Reachy's speech bubble. It hangs over the robot's head (the tail points at it) and the words appear as they are
// spoken. The whole line is in the DOM from the start (screen readers get it at once through role="status"); only
// its words fade in. *stars* in a line mark the words set in bold.
// ---------------------------------------------------------------------------------------------------------------
const TAIL = 27;       // px from the bubble's edge to the tail tip (see bubble.css)
const LIFT = 9;        // tail tip below the bubble box
const MARGIN = 12;

export class SpeechBubble {
  constructor(parent = document.body) {
    const el = document.createElement('div');
    el.className = 'reachy-bubble';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const p = document.createElement('p');
    p.className = 'reachy-bubble-text';
    el.append(p);
    parent.append(el);
    this.el = el;
    this.p = p;
    this.visible = false;
    this.size = { w: 0, h: 0 };
    this._timer = 0;
    this._reduced = matchMedia('(prefers-reduced-motion: reduce)');
  }

  // start/end: seconds into the line where speech starts and stops (the word reveal spans them)
  say(text, { start = 0.08, end = 2.4, hold = 2.0, lang = 'en' } = {}) {
    clearTimeout(this._timer);
    const p = this.p;
    p.textContent = '';
    p.lang = lang;
    const words = [];                    // glue: no space before it (punctuation right after a bold phrase)
    let spaced = true;                   // did the text so far end with a space?
    for (const part of text.split(/(\*[^*]+\*)/)) {
      if (!part) continue;
      const strong = part.startsWith('*') && part.endsWith('*');
      const body = strong ? part.slice(1, -1) : part;
      body.split(/(\s+)/).forEach((w, k) => {
        if (!w || /^\s+$/.test(w)) return;
        words.push({ w, strong, glue: k === 0 && !spaced && !/^\s/.test(body) });
      });
      spaced = /\s$/.test(part);
    }
    const total = words.reduce((n, x) => n + x.w.length + 1, 0) || 1;
    const instant = this._reduced.matches;
    let chars = 0;
    words.forEach((x, i) => {
      const s = document.createElement(x.strong ? 'strong' : 'span');
      s.className = 'w';
      s.textContent = x.w;
      s.style.transitionDelay = instant ? '0s' : `${(start + (end - start) * (chars / total)).toFixed(3)}s`;
      chars += x.w.length + 1;
      if (i > 0 && !x.glue) p.append(' ');
      p.append(s);
    });
    this.el.classList.remove('is-speaking', 'is-visible');
    this.el.style.visibility = 'hidden';
    this.el.classList.add('is-measuring');
    this.size = { w: this.el.offsetWidth, h: this.el.offsetHeight };
    this.el.classList.remove('is-measuring');
    this.el.style.visibility = '';
    void this.el.offsetWidth;            // restart the transitions
    this.el.classList.add('is-visible', 'is-speaking');
    this.visible = true;
    this._timer = setTimeout(() => this.hide(), (end + hold) * 1000);
  }

  hide() {
    clearTimeout(this._timer);
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('is-visible');
    this._timer = setTimeout(() => this.el.classList.remove('is-speaking'), 260);
  }

  // x, y: the head in CSS pixels. Prefers the space up and to the right; flips left near the right edge.
  place(x, y) {
    if (!this.visible) return;
    const { w, h } = this.size;
    const vw = innerWidth;
    let flip = x + w - TAIL + MARGIN > vw;
    if (flip && x - w + TAIL < MARGIN) flip = x < vw / 2 ? false : flip;
    let left = flip ? x - w + TAIL : x - TAIL;
    left = Math.min(Math.max(left, MARGIN), vw - w - MARGIN);
    const top = Math.max(MARGIN + 44, y - LIFT - h);
    this.el.classList.toggle('is-flipped', flip);
    this.el.style.setProperty('--x', `${left.toFixed(1)}px`);
    this.el.style.setProperty('--y', `${top.toFixed(1)}px`);
    this.el.style.setProperty('--tail', `${Math.min(Math.max(flip ? left + w - x : x - left, 18), w - 18).toFixed(1)}px`);
  }
}
