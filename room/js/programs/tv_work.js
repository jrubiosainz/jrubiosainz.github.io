import { AMBER, fitLines, loadFonts, osd, wrapText } from './util.js';
import { workItems } from '../content.js';

export default {
  id: 'tv_work',
  title: 'CH 02 WORK',
  size: [640, 480],
  mount({ ctx, width, height, content }) {
    const items = workItems(content || undefined);
    const meta = { vhs: 0, noise: .04, music: 'tv_ident_loop', selection: -1 };
    let forced = -1;
    let scroll = 0;
    loadFonts(['900 40px Archivo', '28px VT323']).then(() => null);
    function draw(t) {
      ctx.fillStyle = '#141008';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#2b1a06';
      ctx.fillRect(28, 26, width - 56, height - 52);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 3;
      ctx.strokeRect(28.5, 26.5, width - 57, height - 53);
      osd(ctx, 'CH 02', width - 42, 60, 27, 'right', AMBER);
      ctx.font = '900 34px Archivo, sans-serif';
      ctx.fontStretch = 'semi-expanded';
      ctx.fillStyle = '#ffd39a';
      ctx.fillText('TONIGHT ON CH 02', 48, 76);
      const selected = forced >= 0 ? forced % Math.max(1, items.length) : Math.floor(t / 4) % Math.max(1, items.length);
      meta.selection = selected;
      const visible = 7;
      const targetScroll = Math.min(Math.max(0, selected - Math.floor(visible / 2)), Math.max(0, items.length - visible));
      scroll += (targetScroll - scroll) * 0.18;
      const y0 = 116;
      ctx.font = '26px VT323, monospace';
      ctx.save();
      ctx.beginPath();
      ctx.rect(42, 88, 554, 226);
      ctx.clip();
      items.forEach((it, i) => {
        const y = y0 + (i - scroll) * 31;
        if (y < 95 || y > 322) return;
        if (i === selected) {
          ctx.fillStyle = AMBER;
          ctx.fillRect(45, y - 23, 548, 28);
          ctx.fillStyle = '#141008';
        } else ctx.fillStyle = '#ffd39a';
        const hh = (23 + Math.floor(i / 2)) % 24;
        const mm = i % 2 ? '30' : '00';
        ctx.fillText(`${String(hh).padStart(2, '0')}:${mm}`, 58, y);
        ctx.fillText(`${(it.title || 'UNTITLED').toUpperCase()}  ${it.years || ''}`, 145, y);
      });
      ctx.restore();
      if (items.length > visible) {
        ctx.fillStyle = 'rgba(255,189,101,.22)';
        ctx.fillRect(582, 105, 5, 195);
        ctx.fillStyle = AMBER;
        ctx.fillRect(582, 105 + (targetScroll / Math.max(1, items.length - visible)) * 150, 5, 45);
      }
      const it = items[selected] || {};
      ctx.fillStyle = '#080603';
      ctx.fillRect(48, 410 - 70, 544, 68);
      ctx.fillStyle = '#fff0cc';
      ctx.font = '24px VT323, monospace';
      wrapText(ctx, it.description || 'Insert a tape to watch the feature programme.', 62, 368, 510, 25, 2);
      if (Math.floor(t * 2) % 2 === 0) osd(ctx, 'INSERT A TAPE TO WATCH', width / 2, 448, 28, 'center', '#fff0cc');
    }
    return {
      meta,
      frame: draw,
      input(ev) {
        if (ev?.type === 'highlight' && Number.isFinite(ev.index)) forced = Math.max(0, ev.index);
      },
      stop() {},
    };
  },
};
