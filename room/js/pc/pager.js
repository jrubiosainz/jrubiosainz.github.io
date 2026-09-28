import { wrapPlain } from './text.js';

const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;

export class Pager {
  constructor(term, content, emit, exit) {
    this.term = term;
    this.content = content;
    this.emit = emit;
    this.exit = exit;
    this.top = 0;
    this.linkIndex = -1;
    this.lines = [];
    this.links = [];
    this.build();
  }

  build() {
    this.lines = [];
    this.links = [];
    for (const raw of String(this.content.about?.text || '').split('\n')) {
      if (!raw.trim()) { this.lines.push({ text: '', heading: false, links: [] }); continue; }
      const heading = raw.startsWith('# ');
      const source = heading ? raw.slice(2) : raw;
      const wrapped = wrapPlain(source, 78);
      for (const w of wrapped) {
        const links = [];
        let text = '';
        let last = 0;
        linkRe.lastIndex = 0;
        for (const m of w.matchAll(linkRe)) {
          text += w.slice(last, m.index) + m[1];
          links.push({ start: text.length - m[1].length, end: text.length, label: m[1], url: m[2], line: this.lines.length });
          this.links.push(links[links.length - 1]);
          last = m.index + m[0].length;
        }
        text += w.slice(last);
        this.lines.push({ text, heading, links });
      }
    }
  }

  enter() { this.render(); }

  render() {
    const t = this.term;
    t.cls();
    const total = Math.max(1, this.lines.length);
    const pct = Math.round((this.top / Math.max(1, total - 23)) * 100);
    const range = `${this.top + 1}-${Math.min(this.top + 23, total)}/${total}`;
    t.writeAt(0, 0, ` ${this.content.about?.title || 'About me'}`.padEnd(61) + `${String(pct).padStart(3)}% ${range.padStart(12)} `, { inverse: true });
    for (let i = 0; i < 23; i += 1) {
      const line = this.lines[this.top + i];
      if (!line) break;
      const y = i + 1;
      t.writeAt(1, y, line.text.slice(0, 78), line.heading ? { bright: true } : {});
      for (const link of line.links) {
        const selected = this.links[this.linkIndex] === link;
        t.writeAt(1 + link.start, y, line.text.slice(link.start, link.end), { underline: true, bright: true, inverse: selected });
      }
    }
    t.writeAt(0, 24, ' ↑↓ Space  L link  Enter open  Q quit'.padEnd(80), { inverse: true });
    t.setCursor(79, 24);
  }

  input(ev) {
    if (ev.type !== 'key' || !ev.down) return;
    const k = ev.key;
    if (k === 'Escape' || /^q$/i.test(k)) return this.exit();
    if (k === 'ArrowDown') this.top = Math.min(Math.max(0, this.lines.length - 23), this.top + 1);
    else if (k === 'ArrowUp') this.top = Math.max(0, this.top - 1);
    else if (k === ' ' || k === 'PageDown') this.top = Math.min(Math.max(0, this.lines.length - 23), this.top + 20);
    else if (/^b$/i.test(k) || k === 'PageUp') this.top = Math.max(0, this.top - 20);
    else if (k === 'Home') this.top = 0;
    else if (k === 'End') this.top = Math.max(0, this.lines.length - 23);
    else if (/^l$/i.test(k)) {
      if (this.links.length) {
        this.linkIndex = (this.linkIndex + 1) % this.links.length;
        this.top = Math.max(0, Math.min(this.links[this.linkIndex].line - 8, Math.max(0, this.lines.length - 23)));
      }
    } else if (k === 'Enter' && this.links[this.linkIndex]) {
      const url = this.links[this.linkIndex].url;
      this.emit(url.startsWith('#') ? { type: 'navigate', to: url.slice(1) } : { type: 'open', url });
    }
    this.render();
  }
}
