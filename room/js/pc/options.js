export class Options {
  constructor(term, emit, speaker, exit) {
    this.term = term;
    this.emit = emit;
    this.speaker = speaker;
    this.exit = exit;
    this.selected = 0;
    this.options = [
      ['sound', ['ON', 'OFF'], 0],
      ['crt', ['FULL', 'LIGHT'], 0],
      ['motion', ['FULL', 'REDUCED'], 0],
      ['quality', ['HIGH', 'LOW'], 0],
    ];
  }
  enter() { this.render(); }
  render() {
    this.term.cls();
    this.term.writeAt(28, 4, 'VANTEC OPTIONS', { bright: true });
    this.term.writeAt(20, 6, 'Use arrows and Enter. Esc quits.');
    this.options.forEach((o, i) => {
      const line = `${o[0].toUpperCase().padEnd(10)} ${o[1][o[2]]}`;
      this.term.writeAt(25, 9 + i * 2, line.padEnd(30), { inverse: i === this.selected, bright: i === this.selected });
    });
  }
  input(ev) {
    if (ev.type !== 'key' || !ev.down) return;
    if (ev.key === 'Escape' || /^q$/i.test(ev.key)) return this.exit();
    if (ev.key === 'ArrowDown') this.selected = (this.selected + 1) % this.options.length;
    if (ev.key === 'ArrowUp') this.selected = (this.selected + this.options.length - 1) % this.options.length;
    if (ev.key === 'Enter' || ev.key === ' ') {
      const o = this.options[this.selected];
      o[2] = (o[2] + 1) % o[1].length;
      if (o[0] === 'sound') this.speaker?.setEnabled(o[1][o[2]] === 'ON');
      this.emit({ type: 'option', key: o[0], value: o[1][o[2]].toLowerCase() });
    }
    this.render();
  }
}
