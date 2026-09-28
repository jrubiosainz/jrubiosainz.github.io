import { BasicRuntime, programToText } from './basic/interpreter.js';
import { fileListRows, fileText, normalizeBasName, saveUserFile, deleteUserFile } from './disk.js';
import { Pager } from './pager.js';
import { Bbs } from './bbs.js';
import { Demo } from './demo.js';
import { Options } from './options.js';
import { SnakeGame, BlocksGame, LanderGame } from './games/index.js';

const BAR = [
  ['1', 'ABOUT'], ['2', 'ONLINE'], ['3', 'HELP'], ['4', 'FILES'], ['5', 'RUN'],
  ['6', 'LIST'], ['7', 'TRON'], ['8', 'TROFF'], ['9', 'KEY'], ['0', 'SCREEN'],
].map(([num, label]) => ({ num, label, width: 8 }));

export function codeForKey(key) {
  if (!key) return 'Unidentified';
  if (key === ' ') return 'Space';
  if (key === '\n' || key === 'Enter') return 'Enter';
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  const punctuation = {
    '"': 'Quote', "'": 'Quote', ':': 'Semicolon', ';': 'Semicolon', ',': 'Comma', '.': 'Period',
    '/': 'Slash', '?': 'Slash', '\\': 'Backslash', '|': 'Backslash', '-': 'Minus', '_': 'Minus',
    '=': 'Equal', '+': 'Equal', '[': 'BracketLeft', '{': 'BracketLeft', ']': 'BracketRight',
    '}': 'BracketRight', '`': 'Backquote', '~': 'Backquote',
  };
  return punctuation[key] || key;
}

export class PcShell {
  constructor(term, content, emit, speaker) {
    this.term = term;
    this.content = content;
    this.emit = emit;
    this.speaker = speaker;
    this.line = '';
    this.cursor = 0;
    this.history = [];
    this.historyIndex = 0;
    this.keyBar = true;
    this.mode = 'shell';
    this.app = null;
    this.appKind = null;
    this.appCommand = null;
    this.inputKeys = [];
    this.auto = [];
    this.runAuto = null;
    this.program = new Map();
    this.autoLine = null;
    this.tron = false;
    this.rt = new BasicRuntime(this.basicIo());
  }

  basicIo() {
    return {
      print: (s) => this.term.write(s),
      cls: () => this.term.cls(),
      locate: (r, c) => this.term.setCursor(Math.max(0, (c | 0) - 1), Math.max(0, (r | 0) - 1)),
      color: (n) => { this.color = n; },
      beep: () => this.speaker?.beep(),
      sound: (f, d) => this.speaker?.sound(f, d),
      play: (m) => this.speaker?.play(m),
      keyBar: (v) => { this.keyBar = v; this.term.drawBar(BAR, this.keyBar); },
      width: (w) => this.setWidth(w),
      system: () => this.emit({ type: 'exit' }),
      inkey: () => this.inputKeys.shift() || '',
      pos: () => this.term.cursorX + 1,
      csrlin: () => this.term.cursorY + 1,
      tab: (n) => {
        const target = Math.max(1, n | 0) - 1;
        while (this.term.cursorX < target) this.term.write(' ');
      },
    };
  }

  ready() {
    this.mode = 'shell';
    this.app = null;
    this.appKind = null;
    this.appCommand = null;
    this.term.visibleCursor = true;
    this.term.println('');
    this.term.println('READY');
    this.prompt();
  }

  prompt() {
    this.line = '';
    this.cursor = 0;
    this.promptY = this.term.cursorY;
    this.term.write('');
    this.renderInput();
  }

  renderInput() {
    this.term.clearRow(this.promptY);
    this.term.writeAt(0, this.promptY, this.line);
    this.term.setCursor(this.cursor, this.promptY);
    this.term.drawBar(BAR, this.keyBar);
  }

  startPager() {
    this.mode = 'app';
    this.appKind = 'pager';
    this.appCommand = 'ABOUT';
    this.app = new Pager(this.term, this.content, this.emit, () => this.ready());
    this.app.enter();
  }

  startBbs(t = 0) {
    this.mode = 'app';
    this.appKind = 'bbs';
    this.appCommand = 'ONLINE';
    this.app = new Bbs(this.term, this.content, this.emit, () => this.ready());
    this.app.enter(t);
  }

  startDemo() {
    this.mode = 'app';
    this.appKind = 'app';
    this.appCommand = 'DEMO';
    this.app = new Demo(this.term, () => this.ready());
    this.app.enter();
  }

  startOptions() {
    this.mode = 'app';
    this.appKind = 'app';
    this.appCommand = 'OPTIONS';
    this.app = new Options(this.term, this.emit, this.speaker, () => this.ready());
    this.app.enter();
  }

  startGame(name) {
    const done = (line) => { this.term.println(''); if (line) this.term.println(line); this.ready(); };
    this.mode = 'app';
    this.appKind = 'app';
    this.appCommand = name;
    this.app = name === 'SNAKE' ? new SnakeGame(this.term, this.speaker, done) : name === 'BLOCKS' ? new BlocksGame(this.term, this.speaker, done) : new LanderGame(this.term, this.speaker, done);
    this.app.enter();
  }

  frame(t, dt) {
    if (this.runAuto) this.tickRunAuto(t);
    if (this.auto.length && this.mode === 'shell') this.tickAuto(dt);
    if (this.mode === 'basic') this.tickBasic();
    if (this.app?.frame) this.app.frame(t, dt);
  }

  metaMode() {
    if (this.mode === 'app') return this.appKind === 'pager' || this.appKind === 'bbs' ? this.appKind : 'app';
    if (this.mode === 'basic-input') return 'basic';
    return this.mode;
  }

  tickAuto(dt) {
    this.autoAcc = (this.autoAcc || 0) + dt;
    const delay = 1 / 25;
    while (this.auto.length && this.autoAcc >= delay) {
      this.autoAcc -= delay;
      const ch = this.auto.shift();
      if (ch === '\n') this.submit();
      else this.insert(ch);
    }
  }

  tickBasic() {
    try {
      const r = this.rt.step(2000, 4);
      if (r.state === 'done') this.ready();
      if (this.rt.waitingInput) {
        this.mode = 'basic-input';
        this.line = '';
        this.cursor = 0;
        this.promptY = this.term.cursorY;
      }
    } catch (e) {
      this.term.println(e.message || String(e));
      this.ready();
    }
  }

  input(ev) {
    if (ev.type === 'run') {
      this.runCommand(ev.command);
      return;
    }
    if (ev.type === 'command') {
      this.auto = [...String(ev.text || ''), '\n'];
      return;
    }
    if (ev.type === 'paste') {
      for (const ch of String(ev.text || '')) this.insert(ch);
      return;
    }
    if (ev.type !== 'key') return;
    this.emitKey(ev.key, ev.down, ev.code);
    if (!ev.down) return;
    if (ev.ctrl && /^c$/i.test(ev.key) && (this.mode === 'basic' || this.mode === 'basic-input')) {
      this.term.println('');
      this.term.println(this.rt.breakNow());
      this.ready();
      return;
    }
    if (this.mode === 'app') return this.app?.input(ev);
    if (this.mode === 'basic-input') return this.editInput(ev, true);
    if (/^F(?:[1-9]|10)$/.test(ev.key || '')) return this.functionKey(ev.key);
    this.editInput(ev, false);
  }

  emitKey(key, down, code = null) {
    this.emit({ type: 'key-sound', code: code || codeForKey(key), down: !!down });
  }

  runCommand(command) {
    const text = String(command || '').trim();
    if (!text) return;
    if (this.mode === 'app' && this.appCommand === text.toUpperCase()) return;
    this.quitToReadyForRun();
    this.runAuto = {
      text,
      index: 0,
      enter: false,
      nextAt: 0,
      seed: text.length * 17 + 11,
    };
  }

  quitToReadyForRun() {
    this.auto = [];
    this.rt.running = false;
    this.rt.waitingInput = null;
    this.mode = 'shell';
    this.app = null;
    this.appKind = null;
    this.appCommand = null;
    this.line = '';
    this.cursor = 0;
    this.term.visibleCursor = true;
    this.term.cls();
    this.term.println('READY');
    this.prompt();
  }

  tickRunAuto(t) {
    if (this.mode !== 'shell') return;
    const job = this.runAuto;
    if (!job || t < job.nextAt) return;
    if (job.index < job.text.length) {
      const ch = job.text[job.index];
      this.emitKey(ch, true);
      this.insert(ch);
      this.emitKey(ch, false);
      job.index += 1;
      job.seed = (job.seed * 1664525 + 1013904223) >>> 0;
      job.nextAt = t + (0.045 + (job.seed % 26) / 1000);
      return;
    }
    this.emitKey('Enter', true, 'Enter');
    this.submit();
    this.emitKey('Enter', false, 'Enter');
    this.runAuto = null;
  }

  functionKey(key) {
    const map = { F1: 'ABOUT', F2: 'ONLINE', F3: 'HELP', F4: 'FILES', F5: 'RUN', F6: 'LIST', F7: 'TRON', F8: 'TROFF', F9: 'KEY', F10: 'SCREEN' };
    if (map[key]) { this.line = map[key]; this.cursor = this.line.length; this.renderInput(); this.submit(); }
  }

  editInput(ev, basicInput) {
    const k = ev.key;
    if (k === 'Enter') return basicInput ? this.submitBasicInput() : this.submit();
    if (k === 'Escape' && !this.line && !basicInput) return this.emit({ type: 'exit' });
    if (k === 'Backspace') { if (this.cursor > 0) { this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor); this.cursor -= 1; } }
    else if (k === 'Delete') this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
    else if (k === 'ArrowLeft') this.cursor = Math.max(0, this.cursor - 1);
    else if (k === 'ArrowRight') this.cursor = Math.min(this.line.length, this.cursor + 1);
    else if (k === 'Home') this.cursor = 0;
    else if (k === 'End') this.cursor = this.line.length;
    else if (!basicInput && k === 'ArrowUp') { this.historyIndex = Math.max(0, this.historyIndex - 1); this.line = this.history[this.historyIndex] || this.line; this.cursor = this.line.length; }
    else if (!basicInput && k === 'ArrowDown') { this.historyIndex = Math.min(this.history.length, this.historyIndex + 1); this.line = this.history[this.historyIndex] || ''; this.cursor = this.line.length; }
    else if (k.length === 1 && !ev.alt) this.insert(k);
    this.renderInput();
  }

  insert(ch) {
    this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor);
    this.cursor += ch.length;
    this.renderInput();
  }

  submitBasicInput() {
    const v = this.line;
    this.term.newline();
    this.mode = 'basic';
    this.rt.continueInput(v);
  }

  submit() {
    const cmd = this.line.trimEnd();
    this.term.newline();
    if (cmd) { this.history.push(cmd); this.historyIndex = this.history.length; }
    this.execute(cmd);
  }

  execute(raw) {
    const lineMatch = raw.match(/^\s*(\d+)\s*(.*)$/);
    if (lineMatch) {
      const n = Number(lineMatch[1]);
      if (lineMatch[2].trim()) this.program.set(n, lineMatch[2]);
      else this.program.delete(n);
      if (this.autoLine != null) { this.autoLine += 10; this.line = String(this.autoLine); this.cursor = this.line.length; }
      this.prompt();
      return;
    }
    const cmd = raw.trim();
    if (!cmd) { this.prompt(); return; }
    try {
      const keepPrompt = this.command(cmd);
      if (keepPrompt !== false && this.mode === 'shell') this.prompt();
    } catch (e) {
      this.term.println(e.message || String(e));
      this.prompt();
    }
  }

  command(cmd) {
    const up = cmd.toUpperCase();
    if (up === 'HELP') return this.help();
    if (up === 'ABOUT') { this.startPager(); return false; }
    if (up === 'ONLINE') { this.startBbs(performance.now() / 1000); return false; }
    if (['SNAKE', 'BLOCKS', 'LANDER'].includes(up)) { this.startGame(up); return false; }
    if (up === 'DEMO') { this.startDemo(); return false; }
    if (up === 'OPTIONS') { this.startOptions(); return false; }
    if (up === 'DEBUG') { this.emit({ type: 'debug-fly' }); this.term.println('Debug flight requested.'); return; }
    if (up === 'FILES' || up === 'DIR') return this.files();
    if (up.startsWith('LOAD')) return this.loadCmd(cmd);
    if (up.startsWith('SAVE')) return this.saveCmd(cmd);
    if (up.startsWith('RUN')) return this.runCmd(cmd);
    if (up.startsWith('LIST')) return this.listCmd(cmd);
    if (up === 'NEW') { this.program.clear(); this.term.println('New program.'); return; }
    if (up.startsWith('EDIT')) { this.term.println('Use LIST, then retype any numbered line to edit it.'); return; }
    if (up.startsWith('AUTO')) { this.autoLine = Number(cmd.match(/\d+/)?.[0] || 10); this.line = String(this.autoLine); this.cursor = this.line.length; return; }
    if (up === 'RENUM') return this.renum();
    if (up.startsWith('DELETE')) return this.deleteLines(cmd);
    if (up === 'TRON') { this.tron = true; this.rt.trace = true; this.term.println('Trace on.'); return; }
    if (up === 'TROFF') { this.tron = false; this.rt.trace = false; this.term.println('Trace off.'); return; }
    if (up === 'CONT') { this.mode = 'basic'; return false; }
    if (up === 'CLS') { this.term.cls(); return; }
    if (up === 'REBOOT' || up === 'RESET') { this.term.println('Rebooting...'); this.emit({ type: 'reboot' }); return false; }
    if (up === 'KEY ON') { this.keyBar = true; this.term.drawBar(BAR, true); return; }
    if (up === 'KEY OFF') { this.keyBar = false; this.term.drawBar(BAR, false); return; }
    if (up.startsWith('WIDTH')) return this.setWidth(Number(up.match(/\d+/)?.[0] || 80));
    if (['SYSTEM', 'EXIT', 'QUIT'].includes(up)) { this.emit({ type: 'exit' }); return; }
    if (up === 'VER') { this.term.println('vantec Personal BASIC 2.03 / LINKTERM 4.0'); return; }
    if (up === 'DATE') { this.term.println(new Date().toLocaleDateString('en-GB')); return; }
    if (up === 'TIME') { this.term.println(new Date().toLocaleTimeString('en-GB', { hour12: false })); return; }
    if (up === 'COFFEE') { this.term.println('The mug is empty but still warm.'); return; }
    if (up === 'LAMP') { this.emit({ type: 'lamp' }); this.term.println('Lamp relay toggled.'); return; }
    if (up.startsWith('RAIN')) { const v = Math.max(0, Math.min(3, Number(up.match(/\d+/)?.[0] || 1))); this.emit({ type: 'rain', value: v }); this.term.println(`Rain set to ${v}.`); return; }
    if (up === 'HELLO') { this.term.println(`Hello, ${this.content.site?.shortName || 'friend'}.`); return; }
    if (up === 'XYZZY') { this.term.println('A hollow voice says: try the left drawer.'); return; }
    if (up === 'MOON') { this.term.println('The landing pad lights blink once.'); return; }
    if (up === 'SCREEN') { this.term.println('80x25 monochrome phosphor ready.'); return; }
    this.rt.exec(cmd, null);
  }

  help() {
    this.term.cls();
    const lines = [
      'ABOUT     who I am (F1)        ONLINE    where else to find me (F2)',
      'SNAKE  BLOCKS  LANDER games    DEMO      the screensaver',
      'OPTIONS   settings             DEBUG     fly around the room',
      '',
      'Programs: FILES, DIR, LOAD "x", RUN "x", LIST, NEW, EDIT n, AUTO',
      '          TRON/TROFF, SAVE "x", RENUM, DELETE a-b, CONT',
      '',
      'BASIC: PRINT INPUT LET IF THEN ELSE GOTO GOSUB RETURN ON FOR NEXT',
      '       WHILE WEND DATA READ RESTORE DIM END STOP REM CLS LOCATE',
      '       COLOR BEEP SOUND PLAY RANDOMIZE SWAP ERASE CLEAR KEY WIDTH',
      '',
      'WIDTH 40/80       Ctrl+C stops a program',
      '',
      'Some things here are not in HELP.',
    ];
    lines.forEach((l) => this.term.println(l));
  }

  files() {
    this.emit({ type: 'drive', drive: 'C', busy: true });
    this.term.println(' Volume in drive C is NIGHTROOM');
    this.term.println(' Directory of C:\\');
    for (const r of fileListRows()) this.term.println(`${r.name.padEnd(14)} ${String(r.size).padStart(6)}  ${r.type.toUpperCase()}`);
    this.term.println('        60412 Bytes free');
    this.emit({ type: 'drive', drive: 'C', busy: false });
  }

  quoted(cmd) { return cmd.match(/"([^"]+)"/)?.[1] || cmd.split(/\s+/)[1] || ''; }
  loadCmd(cmd) {
    const txt = fileText(this.quoted(cmd));
    if (txt == null) { this.term.println('File not found'); return; }
    this.program = this.rt.load(txt);
    this.emit({ type: 'sfx', name: 'hdd_seek' });
    this.term.println('Ok');
  }
  saveCmd(cmd) {
    const name = this.quoted(cmd);
    if (!name) { this.term.println('Syntax error'); return; }
    saveUserFile(name, programToText(this.program));
    this.emit({ type: 'sfx', name: 'hdd_seek' });
    this.term.println('Ok');
  }
  runCmd(cmd) {
    const name = this.quoted(cmd);
    if (name) {
      const n = normalizeBasName(name);
      if (n === 'SNAKE.EXE') return this.startGame('SNAKE');
      if (n === 'BLOCKS.EXE') return this.startGame('BLOCKS');
      if (n === 'LANDER.EXE') return this.startGame('LANDER');
      if (n === 'DEMO.EXE') return this.startDemo();
      const txt = fileText(name);
      if (txt == null) { this.term.println('File not found'); return; }
      this.program = this.rt.load(txt);
    } else {
      this.rt.lines = this.program;
    }
    this.rt.trace = this.tron;
    this.mode = 'basic';
    this.rt.prepareRun();
    return false;
  }
  listCmd(cmd) {
    const m = cmd.match(/(\d+)?\s*-?\s*(\d+)?$/);
    const a = Number(m?.[1] || 0), b = Number(m?.[2] || 99999);
    for (const [n, s] of [...this.program.entries()].sort((x, y) => x[0] - y[0])) if (n >= a && n <= b) this.term.println(`${n} ${s}`);
  }
  renum() {
    const next = new Map();
    let n = 10;
    for (const [, s] of [...this.program.entries()].sort((a, b) => a[0] - b[0])) { next.set(n, s); n += 10; }
    this.program = next;
    this.term.println('Ok');
  }
  deleteLines(cmd) {
    const m = cmd.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (!m) { this.term.println('Syntax error'); return; }
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (const n of [...this.program.keys()]) if (n >= a && n <= b) this.program.delete(n);
    if (/FILE/i.test(cmd)) deleteUserFile(this.quoted(cmd));
  }
  setWidth(w) {
    this.term.setWidth(w === 40 ? 40 : 80);
    this.term.cls();
    this.emit({ type: 'option', key: 'width', value: this.term.cols });
    this.term.println(`Width ${this.term.cols}`);
  }
}
