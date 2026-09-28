import { BLUE, clear, loadFonts, osd } from './util.js';

export default {
  id: 'tv_nosignal',
  title: 'LINE A',
  size: [640, 480],
  mount({ ctx, width, height }) {
    const meta = { vhs: 0, noise: .08, music: null, selection: -1 };
    loadFonts(['42px VT323']).then(() => null);
    return {
      meta,
      frame(t) {
        clear(ctx, BLUE, width, height);
        osd(ctx, 'LINE A', 32, 52, 34);
        const blink = Math.floor(t * 2) % 2;
        osd(ctx, blink ? 'NO SIGNAL' : 'NO  SIGNAL', width / 2, height / 2 + 18, 62, 'center');
        osd(ctx, '--:--:--', width - 34, height - 34, 30, 'right');
      },
      input() {},
      stop() {},
    };
  },
};
