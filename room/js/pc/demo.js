export class Demo {
  constructor(term, exit) {
    this.term = term;
    this.exit = exit;
    this.t = 0;
  }
  enter() { this.term.cls(); }
  frame(t) {
    if (t - this.t < 0.08) return;
    this.t = t;
    const term = this.term;
    term.cls();
    term.writeAt(23, 1, 'VANTEC NIGHT DEMO - PRESS ANY KEY', { bright: true });
    const cx = 40, cy = 13;
    const a = t * 0.7;
    const pts = [];
    for (const [x, y, z] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]) {
      const xr = x * Math.cos(a) - z * Math.sin(a);
      const zr = x * Math.sin(a) + z * Math.cos(a);
      const yr = y * Math.cos(a * .63) - zr * Math.sin(a * .63);
      const zz = y * Math.sin(a * .63) + zr * Math.cos(a * .63) + 4;
      pts.push([Math.round(cx + xr / zz * 46), Math.round(cy + yr / zz * 18)]);
    }
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    for (const [i, j] of edges) drawLine(term, pts[i][0], pts[i][1], pts[j][0], pts[j][1], '░');
    for (let i = 0; i < 40; i += 1) {
      const x = (Math.sin(i * 45.1 + t) * 10000) % 80;
      const y = (Math.sin(i * 12.7 + t * .4) * 10000) % 23;
      term.putCell(Math.abs(x)|0, Math.abs(y)|0, i % 3 ? '.' : '*', { dim: i % 2 === 0 });
    }
  }
  input(ev) { if (ev.type === 'key' && ev.down) this.exit(); }
}

function drawLine(term, x0, y0, x1, y1, ch) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    term.putCell(x0, y0, ch, { bright: true });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
