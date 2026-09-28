class NativeGame {
  constructor(term, speaker, exit, name) {
    this.term = term; this.speaker = speaker; this.exit = exit; this.name = name;
    this.last = 0; this.score = 0; this.over = false;
  }
  high(v = null) {
    const k = `vantec286.${this.name}.high`;
    if (v != null && v > Number(localStorage.getItem(k) || 0)) localStorage.setItem(k, String(v));
    return Number(localStorage.getItem(k) || 0);
  }
  finish(msg) {
    this.high(this.score);
    this.over = true;
    this.term.writeAt(22, 22, `${msg}  SCORE ${this.score}  HIGH ${this.high()}  Q quits`, { bright: true });
    this.speaker?.beep(180, .25);
  }
  input(ev) {
    if (ev.type === 'key' && ev.down && (/^q$/i.test(ev.key) || ev.key === 'Escape')) this.exit(`${this.name.toUpperCase()} score ${this.score}`);
  }
}

export class SnakeGame extends NativeGame {
  constructor(term, speaker, exit) { super(term, speaker, exit, 'snake'); }
  enter() {
    this.dir = [1, 0]; this.next = [1, 0]; this.snake = [[20, 12], [19, 12], [18, 12]]; this.food = [45, 12]; this.score = 0; this.last = 0; this.over = false; this.draw();
  }
  frame(t) {
    if (this.over || t - this.last < Math.max(.06, .16 - this.score * .004)) return;
    this.last = t; this.dir = this.next;
    const head = [this.snake[0][0] + this.dir[0], this.snake[0][1] + this.dir[1]];
    if (head[0] < 1 || head[0] > 78 || head[1] < 2 || head[1] > 22 || this.snake.some((p) => p[0] === head[0] && p[1] === head[1])) return this.finish('CRASH');
    this.snake.unshift(head);
    if (head[0] === this.food[0] && head[1] === this.food[1]) {
      this.score += 10; this.speaker?.beep(900, .04);
      do this.food = [2 + Math.floor(Math.random() * 76), 3 + Math.floor(Math.random() * 19)]; while (this.snake.some((p) => p[0] === this.food[0] && p[1] === this.food[1]));
    } else this.snake.pop();
    this.draw();
  }
  draw() {
    this.term.cls();
    this.term.writeAt(1, 0, `SNAKE  SCORE ${this.score}  HIGH ${this.high()}  ARROWS/WASD  Q QUIT`, { bright: true });
    for (let x = 0; x < 80; x += 1) { this.term.putCell(x, 1, '═'); this.term.putCell(x, 23, '═'); }
    for (let y = 1; y <= 23; y += 1) { this.term.putCell(0, y, '║'); this.term.putCell(79, y, '║'); }
    this.term.putCell(this.food[0], this.food[1], '◆', { bright: true });
    this.snake.forEach((p, i) => this.term.putCell(p[0], p[1], i ? '▓' : '█', { bright: i === 0 }));
  }
  input(ev) {
    super.input(ev); if (ev.type !== 'key' || !ev.down) return;
    const map = { ArrowUp: [0,-1], w: [0,-1], W: [0,-1], ArrowDown: [0,1], s: [0,1], S: [0,1], ArrowLeft: [-1,0], a: [-1,0], A: [-1,0], ArrowRight: [1,0], d: [1,0], D: [1,0] };
    const d = map[ev.key]; if (d && (d[0] !== -this.dir[0] || d[1] !== -this.dir[1])) this.next = d;
  }
}

export class BlocksGame extends NativeGame {
  constructor(term, speaker, exit) { super(term, speaker, exit, 'blocks'); this.pieces = 'IJLOSTZ'; }
  enter() { this.grid = Array.from({ length: 20 }, () => Array(10).fill(0)); this.score = 0; this.level = 1; this.spawn(); this.last = 0; this.over = false; this.draw(); }
  spawn() {
    const shapes = {
      I: [[0,1],[1,1],[2,1],[3,1]], J: [[0,0],[0,1],[1,1],[2,1]], L: [[2,0],[0,1],[1,1],[2,1]],
      O: [[1,0],[2,0],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]], T: [[1,0],[0,1],[1,1],[2,1]], Z: [[0,0],[1,0],[1,1],[2,1]],
    };
    const id = this.pieces[Math.floor(Math.random() * this.pieces.length)];
    this.cur = { id, cells: shapes[id].map((p) => [...p]), x: 3, y: 0 };
    if (this.hit(0, 0, this.cur.cells)) this.finish('STACK FULL');
  }
  hit(dx, dy, cells) { return cells.some(([x,y]) => { const X = this.cur.x + x + dx, Y = this.cur.y + y + dy; return X < 0 || X >= 10 || Y >= 20 || (Y >= 0 && this.grid[Y][X]); }); }
  lock() {
    for (const [x, y] of this.cur.cells) if (this.cur.y + y >= 0) this.grid[this.cur.y + y][this.cur.x + x] = 1;
    let lines = 0; this.grid = this.grid.filter((r) => r.some((v) => !v) || (lines += 1, false));
    while (this.grid.length < 20) this.grid.unshift(Array(10).fill(0));
    if (lines) { this.score += [0, 40, 100, 300, 1200][lines] * this.level; this.level = 1 + Math.floor(this.score / 800); this.speaker?.beep(700 + lines * 80, .08); }
    this.spawn();
  }
  frame(t) { if (!this.over && t - this.last > Math.max(.1, .6 - this.level * .04)) { this.last = t; if (this.hit(0, 1, this.cur.cells)) this.lock(); else this.cur.y += 1; this.draw(); } }
  rotate() {
    const r = this.cur.cells.map(([x, y]) => [2 - y, x]);
    if (!this.hit(0, 0, r)) this.cur.cells = r;
  }
  draw() {
    this.term.cls(); this.term.writeAt(24, 1, `BLOCKS  SCORE ${this.score}  LEVEL ${this.level}`, { bright: true });
    const ox = 32, oy = 3;
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 10; x += 1) this.term.writeAt(ox + x * 2, oy + y, this.grid[y][x] ? '██' : '░░', this.grid[y][x] ? { bright: true } : { dim: true });
    for (const [x, y] of this.cur.cells) if (this.cur.y + y >= 0) this.term.writeAt(ox + (this.cur.x + x) * 2, oy + this.cur.y + y, '██', { bright: true });
    this.term.writeAt(20, 24, '←→ MOVE  ↑ ROTATE  ↓ DROP  SPACE HARD DROP  Q QUIT', { inverse: true });
  }
  input(ev) {
    super.input(ev); if (this.over || ev.type !== 'key' || !ev.down) return;
    if (ev.key === 'ArrowLeft' && !this.hit(-1, 0, this.cur.cells)) this.cur.x -= 1;
    if (ev.key === 'ArrowRight' && !this.hit(1, 0, this.cur.cells)) this.cur.x += 1;
    if (ev.key === 'ArrowDown') { if (this.hit(0, 1, this.cur.cells)) this.lock(); else this.cur.y += 1; }
    if (ev.key === 'ArrowUp') this.rotate();
    if (ev.key === ' ') { while (!this.hit(0, 1, this.cur.cells)) { this.cur.y += 1; this.score += 1; } this.lock(); }
    this.draw();
  }
}

export class LanderGame extends NativeGame {
  constructor(term, speaker, exit) { super(term, speaker, exit, 'lander'); }
  enter() { this.x = 10; this.y = 4; this.vx = .25; this.vy = 0; this.ang = 0; this.fuel = 120; this.score = 0; this.last = 0; this.over = false; this.draw(); }
  frame(t) {
    if (this.over || t - this.last < .08) return; const dt = t - this.last || .08; this.last = t;
    this.vy += 5 * dt; this.x += this.vx * dt * 8; this.y += this.vy * dt;
    if (this.y >= 21) {
      this.y = 21;
      if (Math.abs(this.x - 58) < 6 && Math.abs(this.vy) < 5 && Math.abs(this.vx) < 1.2) { this.score = Math.max(0, Math.round(this.fuel * 10 - Math.abs(this.vy) * 20)); this.finish('LANDED'); }
      else this.finish('CRASHED');
    }
    this.draw();
  }
  draw() {
    this.term.cls(); this.term.writeAt(1, 0, `LANDER  FUEL ${Math.round(this.fuel)}  VSPD ${this.vy.toFixed(1)}  HSPD ${this.vx.toFixed(1)}  SCORE ${this.score}`, { bright: true });
    for (let x = 0; x < 80; x += 1) this.term.putCell(x, 22, x >= 53 && x <= 64 ? '═' : '▄', { bright: x >= 53 && x <= 64 });
    this.term.writeAt(54, 23, 'LANDING PAD', { bright: true });
    this.term.putCell(Math.max(1, Math.min(78, Math.round(this.x))), Math.max(2, Math.min(21, Math.round(this.y))), this.ang < 0 ? '◢' : this.ang > 0 ? '◣' : '▲', { bright: true });
    this.term.writeAt(18, 24, '←→ ROTATE  ↑ THRUST  Q QUIT', { inverse: true });
  }
  input(ev) {
    super.input(ev); if (this.over || ev.type !== 'key' || !ev.down) return;
    if (ev.key === 'ArrowLeft') this.ang = Math.max(-1, this.ang - .25);
    if (ev.key === 'ArrowRight') this.ang = Math.min(1, this.ang + .25);
    if (ev.key === 'ArrowUp' && this.fuel > 0) { this.vy -= 1.6; this.vx += this.ang * .5; this.fuel -= 4; this.speaker?.beep(220, .03); }
    this.draw();
  }
}
