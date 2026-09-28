export class BasicError extends Error {
  constructor(message, line = null) {
    super(line ? `${message} in ${line}` : message);
    this.basicMessage = message;
    this.line = line;
  }
}

const ERR = {
  syntax: 'Syntax error',
  next: 'NEXT without FOR',
  ret: 'RETURN without GOSUB',
  data: 'Out of DATA',
  type: 'Type mismatch',
  undef: 'Undefined line number',
  div0: 'Division by zero',
  sub: 'Subscript out of range',
  func: 'Illegal function call',
  over: 'Overflow',
};

export function parseProgram(text) {
  const lines = new Map();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(/^\s*(\d+)\s*(.*)$/);
    if (m) lines.set(Number(m[1]), m[2]);
  }
  return lines;
}

export function programToText(lines) {
  return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([n, s]) => `${n} ${s}`).join('\n');
}

function stripComment(s) {
  let q = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '"') q = !q;
    if (!q && ch === "'") return s.slice(0, i);
    if (!q && /^\s*REM(\s|$)/i.test(s.slice(i))) return s.slice(0, i);
  }
  return s;
}

function splitStatements(s) {
  const out = [];
  let q = false;
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '"') q = !q;
    if (!q && ch === ':') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() || !out.length) out.push(cur.trim());
  return out.filter(Boolean);
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '"') {
      let v = '';
      i += 1;
      while (i < src.length && src[i] !== '"') { v += src[i]; i += 1; }
      if (src[i] !== '"') throw new BasicError(ERR.syntax);
      i += 1;
      tokens.push({ t: 'str', v });
    } else if (/\d|\./.test(ch)) {
      const m = src.slice(i).match(/^(\d+(\.\d*)?|\.\d+)(E[+-]?\d+)?/i);
      if (!m) throw new BasicError(ERR.syntax);
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*(\$|%|!)?/);
      tokens.push({ t: 'id', v: m[0].toUpperCase() });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; }
      else { tokens.push({ t: 'op', v: ch }); i += 1; }
    }
  }
  tokens.push({ t: 'eof', v: '' });
  return tokens;
}

class Expr {
  constructor(rt, src) {
    this.rt = rt;
    this.tokens = tokenize(src);
    this.i = 0;
  }
  peek() { return this.tokens[this.i]; }
  take(v = null) {
    const p = this.peek();
    if (v && p.v !== v) return null;
    this.i += 1;
    return p;
  }
  parse() {
    const v = this.or();
    if (this.peek().t !== 'eof' && this.peek().v !== ',' && this.peek().v !== ';') throw new BasicError(ERR.syntax);
    return v;
  }
  or() {
    let a = this.and();
    while (this.peek().t === 'id' && ['OR', 'XOR'].includes(this.peek().v)) {
      const op = this.take().v;
      const b = this.and();
      a = op === 'OR' ? (num(a) | num(b)) : (num(a) ^ num(b));
    }
    return a;
  }
  and() {
    let a = this.not();
    while (this.peek().t === 'id' && this.peek().v === 'AND') {
      this.take();
      a = num(a) & num(this.not());
    }
    return a;
  }
  not() {
    if (this.peek().t === 'id' && this.peek().v === 'NOT') { this.take(); return ~num(this.not()); }
    return this.compare();
  }
  compare() {
    let a = this.add();
    while (['=', '<', '>', '<=', '>=', '<>'].includes(this.peek().v)) {
      const op = this.take().v;
      const b = this.add();
      const r = op === '=' ? a === b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : op === '>=' ? a >= b : a !== b;
      a = r ? -1 : 0;
    }
    return a;
  }
  add() {
    let a = this.mul();
    while (this.peek().v === '+' || this.peek().v === '-') {
      const op = this.take().v;
      const b = this.mul();
      a = op === '+' ? (typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b)) : num(a) - num(b);
    }
    return a;
  }
  mul() {
    let a = this.pow();
    while (['*', '/', '\\', 'MOD'].includes(this.peek().v)) {
      const op = this.take().v;
      const b = this.pow();
      if ((op === '/' || op === '\\' || op === 'MOD') && num(b) === 0) throw new BasicError(ERR.div0);
      a = op === '*' ? num(a) * num(b) : op === '/' ? num(a) / num(b) : op === '\\' ? Math.trunc(num(a) / num(b)) : Math.trunc(num(a)) % Math.trunc(num(b));
    }
    return a;
  }
  pow() {
    let a = this.unary();
    if (this.peek().v === '^') { this.take(); a = num(a) ** num(this.pow()); }
    if (!Number.isFinite(Number(a)) && typeof a !== 'string') throw new BasicError(ERR.over);
    return a;
  }
  unary() {
    if (this.peek().v === '-') { this.take(); return -num(this.unary()); }
    if (this.peek().v === '+') { this.take(); return num(this.unary()); }
    return this.primary();
  }
  primary() {
    const p = this.peek();
    if (p.t === 'num') { this.take(); return p.v; }
    if (p.t === 'str') { this.take(); return p.v; }
    if (p.v === '(') { this.take(); const v = this.or(); if (!this.take(')')) throw new BasicError(ERR.syntax); return v; }
    if (p.t === 'id') {
      const id = this.take().v;
      if (this.peek().v === '(') {
        this.take('(');
        const args = [];
        if (this.peek().v !== ')') {
          do { args.push(this.or()); } while (this.take(','));
        }
        if (!this.take(')')) throw new BasicError(ERR.syntax);
        return this.rt.callOrArray(id, args);
      }
      return this.rt.getVar(id);
    }
    throw new BasicError(ERR.syntax);
  }
}

function num(v) {
  const n = Number(v);
  if (Number.isNaN(n)) throw new BasicError(ERR.type);
  return n;
}
function str(v) { return String(v); }
function isStringVar(name) { return /\$$/.test(name); }

export class BasicRuntime {
  constructor(io = {}) {
    this.io = io;
    this.lines = new Map();
    this.reset();
  }

  reset(keepProgram = true) {
    const old = this.lines;
    this.vars = new Map();
    this.arrays = new Map();
    this.fors = [];
    this.gosubs = [];
    this.data = [];
    this.dataPtr = 0;
    this.lineNums = [];
    this.lineIndex = 0;
    this.stmtIndex = 0;
    this.statements = [];
    this.running = false;
    this.waitingInput = null;
    this.stopped = false;
    this.trace = false;
    if (keepProgram) this.lines = old;
    else this.lines = new Map();
  }

  load(text) {
    this.lines = parseProgram(text);
    return this.lines;
  }

  eval(src) {
    return new Expr(this, src).parse();
  }

  printNumber(n) {
    return `${n >= 0 ? ' ' : ''}${Number.isInteger(n) ? n : Number(n.toPrecision(10))} `;
  }

  getVar(name) {
    const n = name.toUpperCase();
    if (isStringVar(n)) return this.vars.get(n) ?? '';
    return this.vars.get(n) ?? 0;
  }

  setVar(name, value) {
    const n = name.toUpperCase();
    if (isStringVar(n)) this.vars.set(n, str(value));
    else this.vars.set(n, num(value));
  }

  callOrArray(name, args) {
    const id = name.toUpperCase();
    const f = {
      ABS: () => Math.abs(num(args[0])), ATN: () => Math.atan(num(args[0])), COS: () => Math.cos(num(args[0])),
      EXP: () => Math.exp(num(args[0])), FIX: () => Math.trunc(num(args[0])), INT: () => Math.floor(num(args[0])),
      LOG: () => Math.log(num(args[0])), RND: () => Math.random(), SGN: () => Math.sign(num(args[0])),
      SIN: () => Math.sin(num(args[0])), SQR: () => { if (num(args[0]) < 0) throw new BasicError(ERR.func); return Math.sqrt(num(args[0])); },
      TAN: () => Math.tan(num(args[0])), LEN: () => str(args[0]).length, ASC: () => str(args[0]).charCodeAt(0) || 0,
      'CHR$': () => String.fromCharCode(num(args[0]) & 255), 'LEFT$': () => str(args[0]).slice(0, num(args[1])),
      'RIGHT$': () => str(args[0]).slice(-num(args[1])), 'MID$': () => str(args[0]).slice(num(args[1]) - 1, args[2] == null ? undefined : num(args[1]) - 1 + num(args[2])),
      'STR$': () => this.printNumber(num(args[0])).trimEnd(), VAL: () => Number.parseFloat(str(args[0])) || 0,
      INSTR: () => str(args.length === 3 ? args[1] : args[0]).indexOf(str(args.length === 3 ? args[2] : args[1]), args.length === 3 ? num(args[0]) - 1 : 0) + 1,
      'SPACE$': () => ' '.repeat(Math.max(0, num(args[0]) | 0)), 'STRING$': () => String.fromCharCode(typeof args[1] === 'number' ? args[1] : str(args[1]).charCodeAt(0)).repeat(Math.max(0, num(args[0]) | 0)),
      TIMER: () => (Date.now() / 1000) % 86400, 'INKEY$': () => this.io.inkey?.() || '',
      'HEX$': () => (num(args[0]) | 0).toString(16).toUpperCase(), 'OCT$': () => (num(args[0]) | 0).toString(8),
      POS: () => this.io.pos?.() ?? 1, CSRLIN: () => this.io.csrlin?.() ?? 1,
      'TIME$': () => new Date().toLocaleTimeString('en-GB', { hour12: false }),
      'DATE$': () => new Date().toLocaleDateString('en-GB'),
    }[id];
    if (f) return f();
    const arr = this.arrays.get(id);
    if (!arr) return this.getVar(id);
    const key = args.map((a) => num(a) | 0).join(',');
    if (!arr.values.has(key)) return isStringVar(id) ? '' : 0;
    return arr.values.get(key);
  }

  assignTarget(target, value) {
    const m = target.trim().match(/^([A-Z][A-Z0-9_]*(?:\$|%|!)?)(?:\((.*)\))?$/i);
    if (!m) throw new BasicError(ERR.syntax);
    const name = m[1].toUpperCase();
    if (!m[2]) { this.setVar(name, value); return; }
    const args = this.splitArgs(m[2]).map((a) => num(this.eval(a)) | 0);
    const arr = this.arrays.get(name);
    if (!arr) throw new BasicError(ERR.sub);
    if (args.length !== arr.dims.length || args.some((v, i) => v < 0 || v > arr.dims[i])) throw new BasicError(ERR.sub);
    arr.values.set(args.join(','), isStringVar(name) ? str(value) : num(value));
  }

  splitArgs(src) {
    const out = [];
    let q = false, depth = 0, cur = '';
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '"') q = !q;
      if (!q && ch === '(') depth += 1;
      if (!q && ch === ')') depth -= 1;
      if (!q && depth === 0 && ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  prepareRun() {
    this.reset(true);
    this.lineNums = [...this.lines.keys()].sort((a, b) => a - b);
    this.statements = [];
    for (const n of this.lineNums) {
      const raw = this.lines.get(n);
      for (const st of splitStatements(raw)) {
        this.statements.push({ line: n, text: st });
        const d = st.match(/^DATA\s+(.+)$/i);
        if (d) this.data.push(...this.splitArgs(d[1]).map((x) => {
          const t = x.trim();
          return /^".*"$/.test(t) ? t.slice(1, -1) : Number(t);
        }));
      }
    }
    this.stmtIndex = 0;
    this.running = true;
    this.stopped = false;
  }

  run(text = null) {
    if (text != null) this.load(text);
    this.prepareRun();
  }

  lineToIndex(line) {
    const i = this.statements.findIndex((s) => s.line === Number(line));
    if (i < 0) throw new BasicError(ERR.undef, this.currentLine());
    return i;
  }

  currentLine() { return this.statements[this.stmtIndex]?.line || null; }

  goto(line) { this.stmtIndex = this.lineToIndex(line); }

  step(maxStatements = 2000, maxMs = 4) {
    if (!this.running || this.waitingInput) return { state: this.waitingInput ? 'input' : 'idle' };
    const start = performance.now?.() ?? Date.now();
    let count = 0;
    try {
      while (this.running && !this.waitingInput && count < maxStatements && ((performance.now?.() ?? Date.now()) - start) < maxMs) {
        if (this.stmtIndex >= this.statements.length) { this.running = false; break; }
        const st = this.statements[this.stmtIndex];
        if (this.trace && !/^DATA\b|REM\b|'/i.test(st.text)) this.io.print?.(`[${st.line}]\n`);
        this.stmtIndex += 1;
        this.exec(st.text, st.line);
        count += 1;
      }
      return { state: this.running ? (this.waitingInput ? 'input' : 'running') : 'done', count };
    } catch (e) {
      this.running = false;
      if (e instanceof BasicError) throw new BasicError(e.basicMessage, e.line || this.currentLine() || this.statements[this.stmtIndex - 1]?.line);
      throw e;
    }
  }

  continueInput(line) {
    if (!this.waitingInput) return;
    const w = this.waitingInput;
    this.waitingInput = null;
    if (w.lineInput) {
      this.assignTarget(w.vars[0], line);
    } else {
      const vals = this.splitArgs(line);
      for (let i = 0; i < w.vars.length; i += 1) this.assignTarget(w.vars[i], vals[i] ?? '');
    }
  }

  breakNow() {
    this.running = false;
    const line = this.statements[Math.max(0, this.stmtIndex - 1)]?.line;
    return line ? `Break in ${line}` : 'Break';
  }

  exec(src, line) {
    let s = stripComment(src).trim();
    if (!s || /^REM\b|^'/i.test(s) || /^DATA\b/i.test(s)) return;
    const word = (s.match(/^[A-Z?]+/i)?.[0] || '').toUpperCase();
    if (word === '?') s = `PRINT${s.slice(1)}`;
    if (word === 'PRINT') return this.stPrint(s.slice(5));
    if (word === 'INPUT') return this.stInput(s.slice(5), false);
    if (word === 'LINE' && /^LINE\s+INPUT/i.test(s)) return this.stInput(s.replace(/^LINE\s+INPUT/i, ''), true);
    if (word === 'LET') return this.stLet(s.slice(3));
    if (word === 'IF') return this.stIf(s.slice(2), line);
    if (word === 'GOTO') return this.goto(this.eval(s.slice(4)));
    if (word === 'GOSUB') { this.gosubs.push(this.stmtIndex); return this.goto(this.eval(s.slice(5))); }
    if (word === 'RETURN') { if (!this.gosubs.length) throw new BasicError(ERR.ret, line); this.stmtIndex = this.gosubs.pop(); return; }
    if (word === 'ON') return this.stOn(s.slice(2));
    if (word === 'FOR') return this.stFor(s.slice(3), line);
    if (word === 'NEXT') return this.stNext(s.slice(4), line);
    if (word === 'WHILE') { if (!this.eval(s.slice(5))) this.seekAfterWend(); return; }
    if (word === 'WEND') { this.seekBackWhile(); return; }
    if (word === 'READ') return this.stRead(s.slice(4), line);
    if (word === 'RESTORE') { this.dataPtr = 0; return; }
    if (word === 'DIM') return this.stDim(s.slice(3));
    if (word === 'END') { this.running = false; return; }
    if (word === 'STOP') { this.running = false; this.io.print?.(`Break in ${line}\n`); return; }
    if (word === 'CLS') { this.io.cls?.(); return; }
    if (word === 'LOCATE') { const a = this.splitArgs(s.slice(6)).map((x) => this.eval(x)); this.io.locate?.(a[0], a[1]); return; }
    if (word === 'COLOR') { this.io.color?.(this.eval(s.slice(5))); return; }
    if (word === 'BEEP') { this.io.beep?.(); return; }
    if (word === 'SOUND') { const a = this.splitArgs(s.slice(5)); this.io.sound?.(this.eval(a[0]), this.eval(a[1] || '5')); return; }
    if (word === 'PLAY') { this.io.play?.(this.eval(s.slice(4))); return; }
    if (word === 'RANDOMIZE') { Math.random(); return; }
    if (word === 'SWAP') { const a = this.splitArgs(s.slice(4)); const av = this.eval(a[0]); const bv = this.eval(a[1]); this.assignTarget(a[0], bv); this.assignTarget(a[1], av); return; }
    if (word === 'ERASE') { for (const n of this.splitArgs(s.slice(5))) this.arrays.delete(n.trim().toUpperCase()); return; }
    if (word === 'CLEAR') { this.vars.clear(); this.arrays.clear(); return; }
    if (word === 'KEY') { this.io.keyBar?.(!/OFF/i.test(s)); return; }
    if (word === 'WIDTH') { this.io.width?.(this.eval(s.slice(5))); return; }
    if (word === 'SYSTEM') { this.io.system?.(); this.running = false; return; }
    if (/^[A-Z][A-Z0-9_]*(?:\$|%|!)?(?:\(.*\))?\s*=/.test(s)) return this.stLet(s);
    throw new BasicError(ERR.syntax, line);
  }

  stPrint(rest) {
    let src = rest.trim();
    if (!src) { this.io.print?.('\n'); return; }
    let q = false, depth = 0, cur = '', parts = [];
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '"') q = !q;
      if (!q && ch === '(') depth += 1;
      if (!q && ch === ')') depth -= 1;
      if (!q && depth === 0 && (ch === ';' || ch === ',')) { parts.push([cur.trim(), ch]); cur = ''; } else cur += ch;
    }
    parts.push([cur.trim(), '']);
    for (const [expr, sep] of parts) {
      if (/^TAB\(/i.test(expr)) {
        const n = this.eval(expr.slice(4, -1));
        this.io.tab?.(n);
      } else if (/^SPC\(/i.test(expr)) {
        this.io.print?.(' '.repeat(this.eval(expr.slice(4, -1))));
      } else if (expr) {
        const v = this.eval(expr);
        this.io.print?.(typeof v === 'number' ? this.printNumber(v) : v);
      }
      if (sep === ',') this.io.tab?.(Math.floor(((this.io.pos?.() ?? 1) + 13) / 14) * 14 + 1);
    }
    if (![';', ','].includes(src.trim().slice(-1))) this.io.print?.('\n');
  }

  stInput(rest, lineInput) {
    let src = rest.trim();
    let prompt = '? ';
    const pm = src.match(/^"([^"]*)"\s*;?\s*(.*)$/);
    if (pm) { prompt = pm[1]; src = pm[2]; }
    const vars = this.splitArgs(src);
    this.io.print?.(prompt);
    this.waitingInput = { vars, lineInput };
  }

  stLet(rest) {
    const p = rest.indexOf('=');
    if (p < 0) throw new BasicError(ERR.syntax);
    this.assignTarget(rest.slice(0, p), this.eval(rest.slice(p + 1)));
  }

  stIf(rest, line) {
    const m = rest.match(/^(.*?)\s+THEN\s+(.*)$/i);
    if (!m) throw new BasicError(ERR.syntax, line);
    let thenPart = m[2], elsePart = '';
    const em = m[2].match(/^(.*?)\s+ELSE\s+(.*)$/i);
    if (em) { thenPart = em[1]; elsePart = em[2]; }
    const chosen = this.eval(m[1]) ? thenPart.trim() : elsePart.trim();
    if (!chosen) return;
    if (/^\d+$/.test(chosen)) this.goto(Number(chosen));
    else this.exec(chosen, line);
  }

  stOn(rest) {
    const m = rest.match(/^(.*?)\s+(GOTO|GOSUB)\s+(.*)$/i);
    if (!m) throw new BasicError(ERR.syntax);
    const n = this.eval(m[1]) | 0;
    const targets = this.splitArgs(m[3]).map(Number);
    if (n >= 1 && n <= targets.length) {
      if (m[2].toUpperCase() === 'GOSUB') this.gosubs.push(this.stmtIndex);
      this.goto(targets[n - 1]);
    }
  }

  stFor(rest, line) {
    rest = rest.trim();
    const m = rest.match(/^([A-Z][A-Z0-9_]*(?:%|!)?)\s*=\s*(.*?)\s+TO\s+(.+)$/i);
    if (!m) throw new BasicError(ERR.syntax, line);
    const name = m[1].toUpperCase();
    const sm = m[3].match(/^(.*?)\s+STEP\s+(.+)$/i);
    const end = this.eval(sm ? sm[1] : m[3]);
    const step = sm ? this.eval(sm[2]) : 1;
    this.setVar(name, this.eval(m[2]));
    this.fors.push({ name, end, step, index: this.stmtIndex });
  }

  stNext(rest, line) {
    const name = rest.trim().toUpperCase();
    const f = [...this.fors].reverse().find((x) => !name || x.name === name);
    if (!f) throw new BasicError(ERR.next, line);
    const v = this.getVar(f.name) + f.step;
    this.setVar(f.name, v);
    if (f.step >= 0 ? v <= f.end : v >= f.end) this.stmtIndex = f.index;
    else this.fors.splice(this.fors.lastIndexOf(f), 1);
  }

  stRead(rest, line) {
    for (const v of this.splitArgs(rest)) {
      if (this.dataPtr >= this.data.length) throw new BasicError(ERR.data, line);
      this.assignTarget(v, this.data[this.dataPtr]);
      this.dataPtr += 1;
    }
  }

  stDim(rest) {
    for (const item of this.splitArgs(rest)) {
      const m = item.match(/^([A-Z][A-Z0-9_]*(?:\$|%|!)?)\((.*)\)$/i);
      if (!m) throw new BasicError(ERR.syntax);
      this.arrays.set(m[1].toUpperCase(), { dims: this.splitArgs(m[2]).map((x) => this.eval(x) | 0), values: new Map() });
    }
  }

  seekAfterWend() {
    let depth = 1;
    while (this.stmtIndex < this.statements.length) {
      const t = this.statements[this.stmtIndex].text;
      this.stmtIndex += 1;
      if (/^WHILE\b/i.test(t)) depth += 1;
      if (/^WEND\b/i.test(t)) depth -= 1;
      if (!depth) return;
    }
    throw new BasicError(ERR.syntax);
  }

  seekBackWhile() {
    let depth = 1;
    for (let i = this.stmtIndex - 2; i >= 0; i -= 1) {
      const t = this.statements[i].text;
      if (/^WEND\b/i.test(t)) depth += 1;
      if (/^WHILE\b/i.test(t)) {
        depth -= 1;
        if (!depth) { this.stmtIndex = i; return; }
      }
    }
    throw new BasicError(ERR.syntax);
  }
}

export { ERR as BasicErrors };
