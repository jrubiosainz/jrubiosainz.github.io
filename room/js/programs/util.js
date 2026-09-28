export const TV_SIZE = [640, 480];
export const BLUE = '#1d34c9';
export const WHITE = '#f8fbff';
export const AMBER = '#ffbd65';
export const CYAN = '#6ff4ff';
export const TELE = ['#000000', '#f20b2f', '#00d14a', '#ffdf00', '#006eff', '#d100d1', '#00d6d6', '#ffffff'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const mod = (v, m) => ((v % m) + m) % m;
export const rnd = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export async function loadFonts(list = ['28px VT323']) {
  if (!document?.fonts) return;
  await Promise.all(list.map((font) => document.fonts.load(font).catch(() => null)));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function setupCanvas(canvas, size) {
  const [width, height] = size;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = 'alphabetic';
  return { ctx, width, height };
}

export function clear(ctx, color, w = ctx.canvas.width, h = ctx.canvas.height) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function blueField(ctx, w, h, top = '#223fd8', bottom = '#1629b2') {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(0.56, BLUE);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function osd(ctx, text, x, y, size = 30, align = 'left', color = WHITE) {
  ctx.save();
  ctx.font = `${size}px VT323, monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillText(text, Math.round(x) + 3, Math.round(y) + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}

export function safeBox(ctx, color = 'rgba(255,255,255,.10)') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(38.5, 30.5, 563, 420);
  ctx.restore();
}

export function drawBlockProgress(ctx, x, y, w, h, value, blocks = 14) {
  const gap = 4;
  const bw = Math.floor((w - gap * (blocks - 1)) / blocks);
  const filled = Math.round(clamp(value) * blocks);
  for (let i = 0; i < blocks; i += 1) {
    ctx.fillStyle = i < filled ? WHITE : 'rgba(255,255,255,.22)';
    ctx.fillRect(Math.round(x + i * (bw + gap)), Math.round(y), bw, h);
  }
  ctx.font = '30px VT323, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  ctx.fillText(`${Math.round(clamp(value) * 100).toString().padStart(3, ' ')}%`, Math.round(x + w + 18), Math.round(y + h - 2));
}

export function fitLines(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  let cut = false;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else if (lines.length === maxLines - 1) {
      cut = true;                     // the last line is full and there is more text
      break;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (cut) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const lines = fitLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => ctx.fillText(line, Math.round(x), Math.round(y + i * lineHeight)));
  return lines.length;
}

export function dateStamp(date = new Date(), upper = true) {
  const d = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
  const text = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return upper ? text.toUpperCase() : text;
}

export function teletextDate(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function timeStamp(date = new Date(), seconds = true) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, hour12: false });
}

export function drawSeven(ctx, text, x, y, scale, color, ghost = 'rgba(111,244,255,.10)', skew = 0) {
  const map = {
    '0': 'abcedf', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
    '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd', '-': 'g', ' ': '', ':': ':',
  };
  const segs = {
    a: [4, 0, 22, 4], b: [28, 4, 4, 22], c: [28, 32, 4, 22], d: [4, 56, 22, 4],
    e: [0, 32, 4, 22], f: [0, 4, 4, 22], g: [4, 28, 22, 4],
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, skew, 1, 0, 0);
  for (const ch of String(text)) {
    if (ch === ':') {
      ctx.fillStyle = color;
      ctx.fillRect(8 * scale, 18 * scale, 4 * scale, 4 * scale);
      ctx.fillRect(8 * scale, 38 * scale, 4 * scale, 4 * scale);
      ctx.translate(18 * scale, 0);
      continue;
    }
    const on = map[ch] || '';
    Object.entries(segs).forEach(([id, r]) => {
      ctx.fillStyle = on.includes(id) ? color : ghost;
      ctx.fillRect(r[0] * scale, r[1] * scale, r[2] * scale, r[3] * scale);
    });
    ctx.translate(38 * scale, 0);
  }
  ctx.restore();
}

export function spriteIcon(ctx, icon, x, y, s, color = '#ffe56d') {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s / 8);
  if (icon === 'sun') {
    ctx.beginPath();
    ctx.arc(0, 0, s * .45, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * .7, Math.sin(a) * s * .7);
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      ctx.stroke();
    }
  } else if (icon === 'rain' || icon === 'storm' || icon === 'cloud') {
    ctx.beginPath();
    ctx.arc(-s * .3, 0, s * .34, Math.PI, 0);
    ctx.arc(s * .02, -s * .16, s * .43, Math.PI, 0);
    ctx.arc(s * .38, 0, s * .31, Math.PI, 0);
    ctx.rect(-s * .62, 0, s * 1.25, s * .28);
    ctx.fill();
    if (icon !== 'cloud') {
      ctx.strokeStyle = icon === 'storm' ? '#fff375' : '#88e4ff';
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * s * .34, s * .45);
        ctx.lineTo(i * s * .22 - s * .12, s * .85);
        ctx.stroke();
      }
    }
    if (icon === 'storm') {
      ctx.fillStyle = '#fff375';
      ctx.beginPath();
      ctx.moveTo(s * .08, s * .2);
      ctx.lineTo(-s * .08, s * .72);
      ctx.lineTo(s * .14, s * .62);
      ctx.lineTo(-s * .03, s * 1.05);
      ctx.lineTo(s * .38, s * .47);
      ctx.lineTo(s * .16, s * .55);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function createInstance(program, opts) {
  const canvas = opts.canvas || document.createElement('canvas');
  const [width, height] = program.size || TV_SIZE;
  canvas.width = width;
  canvas.height = height;
  const ctx = opts.ctx || canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  return program.mount({ ...opts, canvas, ctx, width, height });
}
