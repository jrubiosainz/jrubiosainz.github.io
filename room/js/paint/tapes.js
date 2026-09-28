import { cssColor, drawHandText, fillNoise, fitText, loadPaintFonts, mix, rngFor, roundedRect, shade, wearEdges } from './util.js';

function tapeData(item = {}) {
  const tape = item.tape || {};
  const color = cssColor(tape.color, '#2d5bd7');
  return {
    tape,
    color,
    ink: cssColor(tape.ink, '#ffffff'),
    style: tape.style || 'band',
    mark: tape.mark || '■',
    title: item.title || 'Untitled Tape',
    years: item.years || '',
  };
}

function baseTexture(ctx, w, h, color, rng) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  fillNoise(ctx, w, h, rng, .07, 2);
  const light = ctx.createLinearGradient(0, 0, 0, h);
  light.addColorStop(0, 'rgba(255,255,255,.16)');
  light.addColorStop(.45, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(0,0,0,.12)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
}

function drawBrand(ctx, x, y, color = '#1b1b1b', size = 22) {
  ctx.save();
  ctx.font = `800 ${size}px Archivo, sans-serif`;
  ctx.fontStretch = 'condensed';
  ctx.letterSpacing = '1px';
  ctx.fillStyle = color;
  ctx.fillText('MERIDIAN · E-180', x, y);
  ctx.restore();
}

function fitTitle(ctx, title, maxWidth, start = 58, min = 28) {
  const upper = String(title || '').toUpperCase();
  let size = start;
  while (size > min) {
    ctx.font = `800 ${size}px Archivo, sans-serif`;
    if (ctx.measureText(upper).width <= maxWidth) return upper;
    size -= 2;
  }
  ctx.font = `800 ${min}px Archivo, sans-serif`;
  let text = upper;
  while (text.length > 3 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

function designSpine(ctx, w, h, d, rng) {
  if (d.style === 'band') {
    baseTexture(ctx, w, h, '#efe7d7', rng);
    ctx.fillStyle = d.color;
    ctx.fillRect(72, 24, w - 250, 86);
  } else if (d.style === 'stripe') {
    baseTexture(ctx, w, h, d.color, rng);
    ctx.fillStyle = shade(d.color, -.2);
    for (let x = -80; x < 270; x += 34) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(-0.42);
      ctx.fillRect(0, -100, 14, 380);
      ctx.restore();
    }
  } else if (d.style === 'split') {
    baseTexture(ctx, w, h, '#eee7d8', rng);
    ctx.fillStyle = d.color;
    ctx.fillRect(0, 0, 118, h);
    ctx.fillStyle = '#f7f2e8';
    ctx.fillRect(118, 24, 184, 72);
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(118.5, 24.5, 183, 71);
    ctx.fillStyle = '#f7f2e8';
    ctx.fillRect(302, 0, 92, h);
    drawBrand(ctx, 130, 65, '#1b1b1b', 17);
  } else {
    baseTexture(ctx, w, h, d.color, rng);
  }
}

export async function paintSpine(canvas, item, index = 0) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const d = tapeData(item);
  const rng = rngFor(`${item?.id || d.title}:spine:${index}`);
  designSpine(ctx, w, h, d, rng);
  ctx.fillStyle = d.style === 'solid' || d.style === 'split' ? d.ink : '#1d2430';
  ctx.textBaseline = 'middle';
  ctx.font = '800 58px Archivo, sans-serif';
  ctx.fontStretch = 'condensed';
  if (d.style === 'split') {
    const titleX = 420;
    const yearsW = Math.max(120, ctx.measureText(d.years).width + 70);
    const titleMax = w - titleX - yearsW - 34;
    ctx.fillStyle = '#1b1f2a';
    const title = fitTitle(ctx, d.title, titleMax, 56, 28);
    ctx.fillText(title, titleX, h / 2 + 2);
  } else if (d.style === 'solid') {
    const yearsW = Math.max(120, ctx.measureText(d.years).width + 70);
    const title = fitTitle(ctx, d.title, w - 210 - yearsW - 34, 62, 30);
    ctx.fillText(title, 210, h / 2 + 2);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    roundedRect(ctx, 220, 23, 520, 92, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    drawHandText(ctx, d.title, 245, 88, rng, { size: 56, color: '#191d24', weight: 700 });
  }
  ctx.save();
  ctx.translate(40, h / 2);
  ctx.rotate((rng() - .5) * .08);
  ctx.font = '800 54px Archivo, sans-serif';
  ctx.fillStyle = d.style === 'band' ? d.color : d.ink;
  ctx.fillText(d.mark, -2, 0);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.font = '700 28px Courier Prime, monospace';
  ctx.fillStyle = d.style === 'band' || d.style === 'split' ? '#253044' : d.ink;
  ctx.fillText(d.years, w - 34, h / 2 + 8);
  ctx.textAlign = 'left';
  if (d.style !== 'split') drawBrand(ctx, w - 225, 34, d.style === 'solid' ? mix(d.ink, d.color, .25) : '#2b3140', 18);
  wearEdges(ctx, w, h, rng, 1);
}

export async function paintCover(canvas, item, index = 0) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const d = tapeData(item);
  const rng = rngFor(`${item?.id || d.title}:cover:${index}`);
  if (d.style === 'band') {
    baseTexture(ctx, w, h, '#efe7d7', rng);
    ctx.fillStyle = d.color;
    ctx.fillRect(0, 0, w, 190);
  } else if (d.style === 'stripe') {
    baseTexture(ctx, w, h, d.color, rng);
    ctx.fillStyle = shade(d.color, -.16);
    for (let x = -120; x < w + 120; x += 54) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(-0.45);
      ctx.fillRect(0, -250, 22, 950);
      ctx.restore();
    }
  } else if (d.style === 'split') {
    baseTexture(ctx, w, h, '#efe7d7', rng);
    ctx.fillStyle = d.color;
    ctx.fillRect(0, 0, w * .43, h);
    ctx.fillStyle = shade(d.color, -.2);
    ctx.fillRect(w * .43, 0, 92, h);
  } else {
    baseTexture(ctx, w, h, d.color, rng);
  }
  ctx.fillStyle = d.style === 'band' || d.style === 'split' ? '#151922' : d.ink;
  ctx.font = '900 104px Archivo, sans-serif';
  ctx.fontStretch = 'semi-expanded';
  ctx.fillText('MERIDIAN', 58, 130);
  ctx.font = '800 36px Archivo, sans-serif';
  ctx.fontStretch = 'condensed';
  ctx.fillText('E-180 · HIGH GRADE', 64, 196);
  ctx.fillText('VIDEO CASSETTE', 64, 244);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  roundedRect(ctx, 78, 315, 650, 150, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 4;
  ctx.stroke();
  drawHandText(ctx, d.title, 120, 410, rng, { size: 86, color: '#151922', weight: 700, jitterY: 7 });
  ctx.fillStyle = d.color;
  ctx.fillRect(760, 320, 190, 58);
  ctx.fillStyle = d.ink;
  ctx.font = '800 36px Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d.mark, 855, 360);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1d2430';
  ctx.font = '700 24px Courier Prime, monospace';
  for (let i = 0; i < 13; i += 1) {
    const x = 80 + i * 64;
    ctx.fillRect(x, 520, 3, i % 3 === 0 ? 38 : 24);
    if (i % 3 === 0) ctx.fillText(`${i * 15}`, x - 10, 578);
  }
  ctx.fillRect(80, 540, 820, 4);
  wearEdges(ctx, w, h, rng, 1.2);
}

export function paintSleeveTint(item) {
  const d = tapeData(item);
  if (d.style === 'band' || d.style === 'split') return mix('#efe7d7', d.color, d.style === 'split' ? .18 : .08);
  return shade(d.color, .12);
}

export async function paintCassetteLabel(canvas, item, index = 0) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const d = tapeData(item);
  const rng = rngFor(`${item?.id || d.title}:cassette:${index}`);
  baseTexture(ctx, w, h, '#f1eadb', rng);
  ctx.fillStyle = d.color;
  ctx.fillRect(0, 0, w, 15);
  ctx.fillStyle = 'rgba(28,45,72,.28)';
  for (let y = 34; y < h - 8; y += 20) ctx.fillRect(20, y, w - 40, 2);
  ctx.fillStyle = 'rgba(188,40,34,.5)';
  ctx.fillRect(92, 18, 2, h - 28);
  drawHandText(ctx, d.title, 112, 66, rng, { size: 47, color: '#172033', weight: 700, jitterY: 3 });
  ctx.font = '700 22px Courier Prime, monospace';
  ctx.fillStyle = '#39445a';
  ctx.fillText(d.years, w - 148, 78);
  wearEdges(ctx, w, h, rng, .55);
}
