import { coverFit, fillNoise, loadPaintFonts, rngFor, roundedRect } from './util.js';

export async function paintPhoto(canvas, img = null) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const rng = rngFor(`photo:${img?.src || 'placeholder'}`);
  ctx.fillStyle = '#f3efe5';
  ctx.fillRect(0, 0, w, h);
  fillNoise(ctx, w, h, rng, .06, 2);
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.fillRect(0, h - 128, w, 128);
  const ix = Math.round(w * .06);
  const iy = Math.round(w * .06);
  const iw = Math.round(w * .88);
  const ih = Math.round(w * .88);
  ctx.save();
  roundedRect(ctx, ix, iy, iw, ih, 6);
  ctx.clip();
  ctx.fillStyle = '#1b2430';
  ctx.fillRect(ix, iy, iw, ih);
  if (img) {
    coverFit(ctx, img, ix, iy, iw, ih);
    ctx.fillStyle = 'rgba(255,214,148,.12)';
    ctx.fillRect(ix, iy, iw, ih);
    const lift = ctx.createLinearGradient(0, iy, 0, iy + ih);
    lift.addColorStop(0, 'rgba(255,255,255,.08)');
    lift.addColorStop(.7, 'rgba(0,0,0,0)');
    lift.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = lift;
    ctx.fillRect(ix, iy, iw, ih);
  } else {
    const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    g.addColorStop(0, '#263a55');
    g.addColorStop(1, '#a8675d');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = '#f0c19c';
    ctx.beginPath();
    ctx.arc(ix + iw * .5, iy + ih * .37, iw * .13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#273048';
    ctx.beginPath();
    ctx.ellipse(ix + iw * .5, iy + ih * .72, iw * .25, ih * .22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const sheen = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(.42, 'rgba(255,255,255,.13)');
  sheen.addColorStop(.52, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.strokeStyle = 'rgba(118,101,75,.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}
