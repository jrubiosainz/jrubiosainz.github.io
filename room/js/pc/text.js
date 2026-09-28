export const COLS = 80;
export const ROWS = 25;
export const CELL_W = 8;
export const CELL_H = 16;

const PALETTE = {
  normal: '#22cc55',
  bright: '#66ff88',
  dim: '#137a34',
  black: '#001406',
};

export class TextMode {
  constructor(ctx, width = 640, height = 400) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.cols = COLS;
    this.rows = ROWS;
    this.cellW = CELL_W;
    this.cellH = CELL_H;
    this.cursorX = 0;
    this.cursorY = 0;
    this.visibleCursor = true;
    this.blinkOn = true;
    this.frameCount = 0;
    this.defaultAttr = { fg: 'normal', bg: 'black', bright: false, dim: false, inverse: false, underline: false, blink: false };
    this.cells = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ ch: ' ', attr: { ...this.defaultAttr }, dirty: true })));
    this.dirtyAll = true;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.textBaseline = 'top';
    this.ctx.font = '20px VT323, monospace';
  }

  reset() {
    this.cursorX = 0;
    this.cursorY = 0;
    this.setWidth(80);
    this.cls();
  }

  setWidth(width) {
    this.cols = Number(width) === 40 ? 40 : 80;
    this.cellW = this.cols === 40 ? 16 : 8;
    this.dirtyAll = true;
  }

  setCursor(x, y) {
    this.cursorX = Math.max(0, Math.min(this.cols - 1, x | 0));
    this.cursorY = Math.max(0, Math.min(this.rows - 1, y | 0));
  }

  cls(attr = this.defaultAttr) {
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        this.cells[y][x].ch = ' ';
        this.cells[y][x].attr = { ...attr };
        this.cells[y][x].dirty = true;
      }
    }
    this.cursorX = 0;
    this.cursorY = 0;
    this.dirtyAll = true;
  }

  clearRow(y, attr = this.defaultAttr) {
    if (y < 0 || y >= this.rows) return;
    for (let x = 0; x < this.cols; x += 1) this.putCell(x, y, ' ', attr);
  }

  scroll(top = 0, bottom = this.rows - 1) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const src = this.cells[y + 1][x];
        this.cells[y][x].ch = src.ch;
        this.cells[y][x].attr = { ...src.attr };
        this.cells[y][x].dirty = true;
      }
    }
    this.clearRow(bottom);
  }

  putCell(x, y, ch = ' ', attr = this.defaultAttr) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const cell = this.cells[y][x];
    const next = ch ? String(ch)[0] : ' ';
    const nextAttr = { ...this.defaultAttr, ...attr };
    if (cell.ch !== next || JSON.stringify(cell.attr) !== JSON.stringify(nextAttr)) {
      cell.ch = next;
      cell.attr = nextAttr;
      cell.dirty = true;
    }
  }

  writeAt(x, y, text, attr = this.defaultAttr) {
    let cx = x;
    for (const ch of String(text)) {
      if (cx >= this.cols) break;
      this.putCell(cx, y, ch, attr);
      cx += 1;
    }
  }

  write(text, attr = this.defaultAttr) {
    for (const ch of String(text)) {
      if (ch === '\n') {
        this.newline();
      } else if (ch === '\r') {
        this.cursorX = 0;
      } else if (ch === '\t') {
        const n = 8 - (this.cursorX % 8);
        for (let i = 0; i < n; i += 1) this.write(' ', attr);
      } else {
        this.putCell(this.cursorX, this.cursorY, ch, attr);
        this.cursorX += 1;
        if (this.cursorX >= this.cols) this.newline();
      }
    }
  }

  newline() {
    this.cursorX = 0;
    this.cursorY += 1;
    if (this.cursorY >= this.rows - 1) {
      this.scroll(0, this.rows - 2);
      this.cursorY = this.rows - 2;
    }
  }

  println(text = '', attr = this.defaultAttr) {
    this.write(text, attr);
    this.newline();
  }

  drawBar(items, on = true) {
    const y = this.rows - 1;
    this.clearRow(y);
    if (!on) return;
    let x = 0;
    for (const item of items) {
      this.writeAt(x, y, item.num, { fg: 'bright', bg: 'black' });
      this.writeAt(x + item.num.length, y, item.label, { fg: 'black', bg: 'normal', inverse: true });
      x += item.width || 8;
    }
  }

  attrColors(attr) {
    const a = { ...this.defaultAttr, ...attr };
    let fg = a.bright ? PALETTE.bright : a.dim ? PALETTE.dim : PALETTE[a.fg] || a.fg || PALETTE.normal;
    let bg = PALETTE[a.bg] || a.bg || PALETTE.black;
    if (a.inverse) [fg, bg] = [bg, fg];
    return [fg, bg];
  }

  render(force = false, t = 0) {
    const blink = Math.floor(t * 2) % 2 === 0;
    if (blink !== this.blinkOn) {
      this.blinkOn = blink;
      force = true;
    }
    const ctx = this.ctx;
    ctx.font = '20px VT323, monospace';
    ctx.textBaseline = 'top';
    if (this.dirtyAll || force) {
      ctx.fillStyle = PALETTE.black;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const cell = this.cells[y][x];
        if (!force && !this.dirtyAll && !cell.dirty) continue;
        const [fg, bg] = this.attrColors(cell.attr);
        ctx.fillStyle = bg;
        ctx.fillRect(x * this.cellW, y * this.cellH, this.cellW, this.cellH);
        if (!(cell.attr.blink && !this.blinkOn) && cell.ch !== ' ') {
          ctx.fillStyle = fg;
          ctx.fillText(cell.ch, x * this.cellW, y * this.cellH - 2);
          if (cell.attr.underline) ctx.fillRect(x * this.cellW, y * this.cellH + 13, this.cellW, 1);
        }
        cell.dirty = false;
      }
    }
    if (this.visibleCursor && this.cursorY < this.rows - 1 && blink) {
      ctx.fillStyle = PALETTE.bright;
      ctx.fillRect(this.cursorX * this.cellW, this.cursorY * this.cellH + 14, this.cellW, 2);
    }
    this.dirtyAll = false;
  }
}

export function wrapPlain(text, cols = 78) {
  const out = [];
  for (const para of String(text || '').split(/\n/)) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.trim().split(/\s+/)) {
      if (line && `${line} ${word}`.length > cols) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}
