import { loadPaintFonts, rngFor, fillNoise } from './util.js';

// The printed side of the CD in the player: an original label for the album on content.music.
export async function paintDiscLabel(canvas, music = {}) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  const c = s / 2;
  const rng = rngFor(`disc:${music.album || ''}`);
  ctx.clearRect(0, 0, s, s);
  // outside the print: transparent (the shader shows the metal/clear disc there)
  const R = s / 2;
  const rOut = R * 0.965;          // 58 mm of 60
  const rIn = R * 0.385;           // 23 mm (clear hub ring inside)
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, rOut, 0, Math.PI * 2);
  ctx.arc(c, c, rIn, 0, Math.PI * 2, true);
  ctx.clip('evenodd');
  // night-sky gradient with a rain-streaked city skyline
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#10183a');
  g.addColorStop(0.55, '#2b2a63');
  g.addColorStop(0.78, '#c2536a');
  g.addColorStop(1, '#f0a35c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(8,10,24,.92)';
  let x = 0;
  while (x < s) {
    const w = s * (0.03 + rng() * 0.06);
    const h = s * (0.08 + rng() * 0.22);
    ctx.fillRect(x, s * 0.78 - h, w, h + s);
    for (let yy = s * 0.78 - h + 8; yy < s * 0.78; yy += 10) {
      for (let xx = x + 4; xx < x + w - 4; xx += 8) if (rng() < 0.28) {
        ctx.fillStyle = rng() < 0.8 ? 'rgba(255,196,110,.85)' : 'rgba(150,210,255,.8)';
        ctx.fillRect(xx, yy, 3, 4);
        ctx.fillStyle = 'rgba(8,10,24,.92)';
      }
    }
    x += w + s * 0.004;
  }
  ctx.strokeStyle = 'rgba(210,225,255,.16)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 90; i += 1) {
    const px = rng() * s;
    const py = rng() * s * 0.8;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 6, py + 26 + rng() * 20);
    ctx.stroke();
  }
  fillNoise(ctx, s, s, rng, 0.05, 2);
  ctx.restore();
  // titles follow the arc near the top, the artist below the hole
  ctx.fillStyle = '#fff4e2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(s * 0.082)}px Archivo, sans-serif`;
  ctx.fillText(String(music.album || 'Late Edition').toUpperCase(), c, c - R * 0.62);
  ctx.font = `${Math.round(s * 0.05)}px VT323, monospace`;
  ctx.fillStyle = 'rgba(255,244,226,.85)';
  ctx.fillText(String(music.artist || '').toUpperCase(), c, c + R * 0.53);
  ctx.font = `${Math.round(s * 0.034)}px VT323, monospace`;
  ctx.fillStyle = 'rgba(255,244,226,.7)';
  ctx.fillText('DIGITAL AUDIO · 1996', c, c + R * 0.66);
  // thin printed ring at the inner edge of the label
  ctx.strokeStyle = 'rgba(255,244,226,.55)';
  ctx.lineWidth = s * 0.004;
  ctx.beginPath();
  ctx.arc(c, c, rIn + s * 0.012, 0, Math.PI * 2);
  ctx.stroke();
}
