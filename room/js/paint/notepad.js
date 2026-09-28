import { drawHandText, fillNoise, loadPaintFonts, rngFor } from './util.js';
import { workItems } from '../content.js';

export async function paintNotepad(canvas, content, { highlight = -1 } = {}) {
  await loadPaintFonts();
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const rng = rngFor(`notepad:${content?.site?.name || ''}:${highlight}`);
  const rows = [];
  const paper = ctx.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#f8e79f');
  paper.addColorStop(.55, '#f3dd8a');
  paper.addColorStop(1, '#e8cc72');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  fillNoise(ctx, w, h, rng, .055, 3);
  ctx.fillStyle = 'rgba(106,73,22,.12)';
  ctx.fillRect(0, 0, w, 74);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(0, 74, w, 12);
  const mm = w / 216;
  const rule = 7.1 * mm;
  ctx.strokeStyle = 'rgba(75,128,184,.34)';
  ctx.lineWidth = 2;
  for (let y = 130; y < h; y += rule) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + .5);
    ctx.lineTo(w, Math.round(y) + .5);
    ctx.stroke();
  }
  const marginX = 32 * mm;
  ctx.strokeStyle = 'rgba(190,57,54,.45)';
  ctx.lineWidth = 3;
  [marginX, marginX + 13].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 86);
    ctx.lineTo(x, h);
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(80,53,15,.12)';
  ctx.fillRect(0, h - 18, w, 18);
  drawHandText(ctx, content?.work?.title || 'Work', 118, 150, rng, { size: 112, color: '#17253f', weight: 700, jitterY: 5 });
  const groups = content?.work?.groups || [];
  const all = workItems(content);
  let y = 245;
  let index = 0;
  for (const group of groups) {
    ctx.save();
    ctx.font = '700 58px Caveat, cursive';
    ctx.fillStyle = '#233150';
    ctx.rotate((rng() - .5) * .01);
    ctx.fillText(group.heading || 'Group', 118, y);
    ctx.restore();
    ctx.strokeStyle = 'rgba(178,38,38,.78)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(116, y + 14);
    ctx.quadraticCurveTo(225, y + 24 + (rng() - .5) * 6, 330, y + 13);
    ctx.stroke();
    y += 66;
    for (const item of group.items || []) {
      const rect = { index, x: 106, y: y - 42, w: 832, h: 54 };
      if (index === highlight) {
        ctx.save();
        ctx.globalAlpha = .52;
        ctx.strokeStyle = '#f5c822';
        ctx.lineWidth = 31;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rect.x + 7, rect.y + 24 + (rng() - .5) * 5);
        ctx.bezierCurveTo(rect.x + 250, rect.y + 10, rect.x + 560, rect.y + 48, rect.x + rect.w - 8, rect.y + 25);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#1f2b45';
      ctx.font = '600 42px Caveat, cursive';
      ctx.fillText(String(index + 1).padStart(2, '0'), 118 + (rng() - .5) * 2, y);
      drawHandText(ctx, item.title, 188, y + (rng() - .5) * 2, rng, { size: 44, color: '#182642', weight: 600, jitterY: 3, rotate: .02 });
      ctx.strokeStyle = 'rgba(31,43,69,.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.moveTo(510, y - 12);
      ctx.lineTo(760, y - 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1f2b45';
      ctx.font = '600 38px Caveat, cursive';
      ctx.fillText(item.years || '', 924, y + (rng() - .5) * 2);
      ctx.textAlign = 'left';
      rows.push(rect);
      y += 54;
      index += 1;
    }
    y += 30;
  }
  ctx.save();
  ctx.translate(760, 1430);
  ctx.rotate(-0.08);
  ctx.strokeStyle = '#233150';
  ctx.lineWidth = 7;
  ctx.strokeRect(0, 28, 88, 58);
  ctx.beginPath();
  ctx.moveTo(18, 86); ctx.lineTo(5, 106); ctx.moveTo(70, 86); ctx.lineTo(86, 106);
  ctx.stroke();
  ctx.fillStyle = '#233150';
  ctx.font = '700 38px Caveat, cursive';
  const initials = (content?.site?.name || 'J R').split(/\s+/).map((p) => p[0]).join('.').slice(0, 5) + '.';
  ctx.fillText(initials, 110, 88);
  ctx.restore();
  return rows;
}
