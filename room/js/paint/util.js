export function hashString(input = '') {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(key) {
  return mulberry32(hashString(String(key)));
}

// the handwriting and print on the paper props; a slow network never holds the room back more than a few seconds
export async function loadPaintFonts(timeoutMs = 6000) {
  if (!document?.fonts) return;
  const all = Promise.all([
    document.fonts.load('700 96px Caveat'),
    document.fonts.load('600 64px Caveat'),
    document.fonts.load('800 72px Archivo'),
    document.fonts.load('700 34px Courier Prime'),
  ].map((p) => p.catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}

export function cssColor(color, fallback = '#777') {
  return /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : fallback;
}

export function hexToRgb(hex) {
  hex = cssColor(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}

export function shade(color, amount) {
  return mix(color, amount > 0 ? '#ffffff' : '#000000', Math.abs(amount));
}

export function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function fillNoise(ctx, w, h, rng, alpha = 0.06, step = 3) {
  const img = ctx.createImageData(Math.ceil(w / step), Math.ceil(h / step));
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + rng() * 120;
    img.data[i] = v;
    img.data[i + 1] = v * 0.96;
    img.data[i + 2] = v * 0.82;
    img.data[i + 3] = alpha * 255;
  }
  const tmp = new OffscreenCanvas(img.width, img.height);
  tmp.width = img.width;
  tmp.height = img.height;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
}

export function wearEdges(ctx, w, h, rng, strength = 1) {
  const edge = ctx.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, `rgba(0,0,0,${0.18 * strength})`);
  edge.addColorStop(0.08, 'rgba(0,0,0,0)');
  edge.addColorStop(0.92, 'rgba(0,0,0,0)');
  edge.addColorStop(1, `rgba(0,0,0,${0.18 * strength})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(255,255,255,${0.16 * strength})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
  ctx.strokeStyle = `rgba(0,0,0,${0.25 * strength})`;
  for (let i = 0; i < 24 * strength; i += 1) {
    const x = rng() * w;
    const y = rng() < .5 ? rng() * 12 : h - rng() * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + rng() * 34, y + (rng() - .5) * 5);
    ctx.stroke();
  }
}

export function fitText(ctx, text, maxWidth, start, min = 18) {
  let size = start;
  do {
    ctx.font = ctx.font.replace(/\d+(?:\.\d+)?px/, `${size}px`);
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size >= min);
  return size + 2;
}

export function drawHandText(ctx, text, x, y, rng, opts = {}) {
  const words = String(text || '').split(/(\s+)/);
  let cx = x;
  ctx.save();
  ctx.fillStyle = opts.color || '#172033';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${opts.weight || 700} ${opts.size || 62}px Caveat, cursive`;
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      cx += ctx.measureText(word).width;
      continue;
    }
    ctx.save();
    ctx.translate(cx, y + (rng() - .5) * (opts.jitterY || 5));
    ctx.rotate((rng() - .5) * (opts.rotate || 0.035));
    ctx.fillText(word, 0, 0);
    ctx.restore();
    cx += ctx.measureText(word).width + (rng() - .5) * 4;
  }
  ctx.restore();
}

export function coverFit(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
