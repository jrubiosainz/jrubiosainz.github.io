export class Bbs {
  constructor(term, content, emit, exit) {
    this.term = term;
    this.content = content;
    this.emit = emit;
    this.exit = exit;
    this.started = 0;
    this.state = 'dial';
    this.step = 0;
    this.selected = 0;
    this.lines = [
      `LINKTERM 4.0  (C) 1995 Rain City Software`,
      `Dialing directory entry 1 of 1: ${content.online?.bbsName || 'RAIN CITY BBS'}, ${content.online?.phone || '555-0142'}.`,
      'ATZ',
      'OK',
      `ATDT${String(content.online?.phone || '555-0142').replace(/\D/g, '')}`,
      'RINGING',
      'RINGING',
      'CONNECT 28800/ARQ/V34/LAPM/V42BIS',
    ];
  }

  enter(now = 0) {
    this.started = now;
    this.term.cls();
    this.term.println(this.lines[0], { bright: true });
    this.term.println('');
    this.term.println(this.lines[1]);
    this.emit({ type: 'sfx', name: 'modem_dial' });
    this.renderStatus(now, 'Any key skips');
  }

  frame(t) {
    if (this.state !== 'dial') { this.renderStatus(t, this.state === 'menu' ? 'Q logoff' : ''); return; }
    const schedule = [0.7, 1.4, 2.2, 3.4, 4.8, 6.2];
    while (this.step < schedule.length && t - this.started > schedule[this.step]) {
      this.term.println(this.lines[this.step + 2]);
      this.step += 1;
    }
    if (this.step >= schedule.length && t - this.started > 7.0) this.showMenu(t);
    this.renderStatus(t, 'Any key skips');
  }

  showMenu(t = 0) {
    this.state = 'menu';
    const term = this.term;
    term.cls();
    const name = this.content.online?.bbsName || 'RAIN CITY BBS';
    term.println('               ░░▒▒▓▓ RAIN CITY NIGHT LINK ▓▓▒▒░░', { bright: true });
    term.println('          ▄▄▄      ▄▄▄      ▄▄▄      ▄▄▄      ▄▄▄');
    term.println('       ▄█▀░░▀█▄  ▄█▀░░▀█▄  ▄█▀░░▀█▄  ▄█▀░░▀█▄  ▄█');
    term.println('       ██ ░░ ██  ██ ▒▒ ██  ██ ▓▓ ██  ██ ▒▒ ██  ██');
    term.println('       ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█');
    term.println('');
    term.println(`                      ${name}`, { bright: true });
    term.println('                  caller 001  node 01  ansi');
    term.println('');
    this.drawChoices();
    this.renderStatus(t, 'Q logoff');
  }

  drawChoices() {
    const links = this.content.online?.links || [];
    const used = new Set(['Q']);
    this.hotkeys = links.map((l) => {
      const key = [...l.label.toUpperCase()].find((c) => /[A-Z0-9]/.test(c) && !used.has(c)) || String(used.size);
      used.add(key);
      return key;
    });
    links.forEach((l, i) => {
      const key = this.hotkeys[i];
      const y = 11 + i;
      this.term.writeAt(18, y, `[${key}] ${l.label.padEnd(12)} ${l.handle || ''}`.padEnd(44), { inverse: i === this.selected, bright: i === this.selected });
    });
    this.term.writeAt(18, 12 + links.length, '[Q] Logoff'.padEnd(44));
  }

  renderStatus(t, hint) {
    const elapsed = Math.max(0, Math.floor(t - this.started));
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor(elapsed / 60) % 60).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    this.term.writeAt(0, 24, ` LINKTERM 4.0 │ 28800 8N1 │ ANSI │ Online ${h}:${m}:${s} │ ${hint} `.padEnd(80), { inverse: true });
  }

  input(ev) {
    if (ev.type !== 'key' || !ev.down) return;
    if (this.state === 'dial') { this.showMenu(performance.now() / 1000); return; }
    const links = this.content.online?.links || [];
    if (ev.key === 'ArrowDown') this.selected = (this.selected + 1) % links.length;
    else if (ev.key === 'ArrowUp') this.selected = (this.selected + links.length - 1) % links.length;
    else if (ev.key === 'Enter') return this.open(this.selected);
    else if (/^q$/i.test(ev.key) || ev.key === 'Escape') {
      this.term.println('');
      this.term.println('NO CARRIER');
      this.emit({ type: 'sfx', name: 'modem_hangup' });
      this.exit();
      return;
    } else {
      const i = this.hotkeys?.indexOf(ev.key.toUpperCase());
      if (i >= 0) return this.open(i);
    }
    this.drawChoices();
  }

  open(i) {
    const link = this.content.online?.links?.[i];
    if (!link) return;
    this.term.println('');
    this.term.println(`Connecting you to ${link.url} ...`);
    this.emit({ type: 'open', url: link.url });
  }
}
