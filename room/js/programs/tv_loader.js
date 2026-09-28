import { BLUE, WHITE, clear, drawBlockProgress, loadFonts, osd } from './util.js';

export default {
  id: 'tv_loader',
  title: 'LOADING',
  size: [640, 480],
  mount({ ctx, width, height }) {
    const meta = { vhs: 0, noise: .05, music: null, selection: -1 };
    let progress = 0;
    let label = 'WARMING TUBE';
    loadFonts(['32px VT323']).then(() => draw());
    function draw() {
      clear(ctx, BLUE, width, height);
      ctx.fillStyle = 'rgba(8,18,120,.28)';
      ctx.fillRect(0, 0, width, height);
      osd(ctx, '▶▶ LOADING', 34, 54, 38);
      osd(ctx, 'CH 00', width - 34, 54, 34, 'right');
      drawBlockProgress(ctx, 92, 230, 345, 28, progress, 15);
      ctx.font = '26px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = WHITE;
      ctx.fillText(label.toUpperCase(), width / 2, 298);
    }
    return {
      meta,
      frame() { draw(); },
      input(ev) {
        if (ev?.type === 'progress') {
          progress = Number.isFinite(ev.value) ? ev.value : progress;
          label = ev.label || label;
          draw();
        }
      },
      stop() {},
    };
  },
};
