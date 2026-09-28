import { CYAN, drawSeven, loadFonts, timeStamp } from './util.js';

export default {
  id: 'vcr_vfd',
  title: 'VCR VFD',
  size: [256, 64],
  mount({ ctx, width, height }) {
    const meta = { vhs: 0, noise: 0, music: null, selection: -1 };
    let state = { state: 'empty', counter: 0, title: '' };
    loadFonts(['12px VT323']).then(() => null);
    function glow(fn) {
      ctx.save();
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 12;
      fn();
      ctx.restore();
    }
    function counterText(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      return `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }
    function indicator(label, x, lit = false) {
      ctx.save();
      ctx.font = '10px VT323, monospace';
      ctx.fillStyle = lit ? CYAN : 'rgba(111,244,255,.13)';
      ctx.fillText(label, x, 10);
      if (lit) {
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 9;
        ctx.fillText(label, x, 10);
      }
      ctx.restore();
    }
    return {
      meta,
      frame(t) {
        ctx.fillStyle = '#000504';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(79,231,255,.055)';
        ctx.fillRect(0, 0, width, height);
        const s = state.state || 'empty';
        const loaded = s !== 'empty' && s !== 'eject';
        indicator('▶ PLAY', 8, s === 'play');
        indicator('■ STOP', 52, s === 'stop');
        indicator('◀◀', 94, s === 'rew');
        indicator('▶▶', 118, s === 'ff');
        indicator('REC', 144, false);
        indicator('HQ', 168, loaded || s === 'empty');
        indicator('VCR', 190, true);
        ctx.save();
        ctx.strokeStyle = loaded ? CYAN : 'rgba(111,244,255,.13)';
        ctx.fillStyle = loaded ? CYAN : 'rgba(111,244,255,.08)';
        if (loaded) {
          ctx.shadowColor = CYAN;
          ctx.shadowBlur = 8;
        }
        ctx.strokeRect(224.5, 3.5, 22, 10);
        ctx.fillRect(228, 7, 14, 3);
        ctx.restore();
        glow(() => {
          ctx.fillStyle = CYAN;
          ctx.font = '12px VT323, monospace';
          if (s === 'loading') ctx.fillText('LOADING', 194, 60);
          if (s === 'eject') ctx.fillText('EJECT', 206, 60);
        });
        const now = timeStamp(new Date(), false);
        const transport = s === 'play' || s === 'ff' || s === 'rew';
        const text = transport ? counterText(state.counter || t) : now;
        const colonOn = s !== 'empty' || Math.floor(t * 2) % 2 === 0;
        const display = colonOn ? text : text.replace(':', ';');
        glow(() => drawSeven(ctx, display, transport ? 15 : 46, 15, transport ? .45 : .72, CYAN, 'rgba(111,244,255,.075)', -.08));
        if (s === 'loading') {
          glow(() => {
            ctx.fillStyle = CYAN;
            const x = 18 + ((t * 78) % 154);
            ctx.fillRect(x, 53, 25, 4);
          });
        }
      },
      input(ev) {
        if (ev?.type === 'state') state = { ...state, ...ev };
      },
      stop() {},
    };
  },
};
