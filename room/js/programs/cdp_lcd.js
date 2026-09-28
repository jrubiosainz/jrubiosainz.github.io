import { clamp, drawSeven, loadFonts } from './util.js';

export default {
  id: 'cdp_lcd',
  title: 'CD LCD',
  size: [160, 48],
  mount({ ctx, width, height }) {
    const meta = { vhs: 0, noise: 0, music: null, selection: -1 };
    // stopped: shows the disc (track count + total time) like a real player; playing/paused: track + elapsed
    let state = { track: 1, time: 0, playing: false, paused: false, volume: .72, tracks: 3, total: 0 };
    let volumeUntil = 0;
    let volPending = false;
    let lastVol = null;              // first volume report sets the level silently
    let spin = 0;
    let lastT = 0;
    loadFonts(['10px VT323']).then(() => null);
    function mmss(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    }
    return {
      meta,
      frame(t) {
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, '#c4ceb0');
        g.addColorStop(.52, '#9aa58a');
        g.addColorStop(1, '#77806e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(35,45,31,.12)';
        ctx.fillRect(0, 0, width, 8);
        const dark = '#243321';
        const stopped = !state.playing && !state.paused;
        const blinkOff = state.paused && Math.floor(t * 2) % 2 === 1;
        drawSeven(ctx, String((stopped ? state.tracks : state.track) || 1).padStart(2, '0'), 10, 9, .36, dark, 'rgba(36,51,33,.12)', -.05);
        if (!blinkOff) drawSeven(ctx, mmss(stopped ? state.total : state.time), 72, 9, .33, dark, 'rgba(36,51,33,.12)', -.04);
        ctx.fillStyle = dark;
        ctx.font = '10px VT323, monospace';
        ctx.fillText(state.paused ? 'II' : state.playing ? '▶' : '■', 9, 42);
        ctx.fillText('ANTI-SKIP', 36, 42);
        ctx.strokeStyle = dark;
        ctx.strokeRect(129.5, 34.5, 20, 8);
        ctx.fillRect(150, 37, 3, 3);
        ctx.beginPath();
        ctx.arc(125, 15, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(125, 15);
        spin += state.playing ? Math.min(0.1, Math.max(0, t - lastT)) * 4 : 0;
        lastT = t;
        ctx.lineTo(125 + Math.cos(spin) * 8, 15 + Math.sin(spin) * 8);
        ctx.stroke();
        if (volPending) { volumeUntil = t + 1.5; volPending = false; }
        if (t < volumeUntil) {
          ctx.fillText('VOL', 10, 8);
          for (let i = 0; i < 8; i += 1) {
            ctx.fillStyle = i / 8 < state.volume ? dark : 'rgba(36,51,33,.13)';
            ctx.fillRect(35 + i * 7, 2, 5, 5);
          }
        }
      },
      input(ev) {
        if (ev?.type === 'state') {
          state = { ...state, ...ev };
          if (ev.volume != null && lastVol == null) lastVol = ev.volume;
          if (state.volume !== lastVol) {
            volPending = true;
            lastVol = clamp(state.volume);
          }
        }
      },
      stop() {},
    };
  },
};
