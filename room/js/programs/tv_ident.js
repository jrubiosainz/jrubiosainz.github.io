import { blueField, loadFonts, osd, safeBox } from './util.js';

export default {
  id: 'tv_ident',
  title: 'CH 00',
  size: [640, 480],
  mount({ ctx, width, height, content }) {
    const meta = { vhs: 0, noise: .04, music: 'tv_ident_loop', intro: 'tv_ident_jingle', selection: -1 };
    const site = content?.site || {};
    const name = site.name || 'NIGHT DESK';
    const tagline = site.tagline || 'AFTER HOURS BROADCAST';
    loadFonts(['900 104px Archivo', '30px VT323']).then(() => null);

    function drawGlobe(t) {
      const cx = 320;
      const cy = 176;
      const r = 78;
      const rot = t * .36;
      const tilt = .34;
      function project(x, y, z) {
        const xr = x * Math.cos(rot) + z * Math.sin(rot);
        const zr = z * Math.cos(rot) - x * Math.sin(rot);
        const yr = y * Math.cos(tilt) - zr * Math.sin(tilt);
        const depth = (zr + r) / (2 * r);
        return { x: cx + xr, y: cy + yr, z: zr, depth };
      }
      ctx.save();
      const glow = ctx.createRadialGradient(cx, cy, r * .35, cx, cy, r * 1.25);
      glow.addColorStop(0, 'rgba(255,255,255,.10)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      function orbitDot(a, front) {
        const ox = Math.cos(a) * 172;
        const oz = Math.sin(a) * 54;
        const x = cx + ox;
        const y = cy + 7 + Math.sin(a) * 19;
        ctx.globalAlpha = front ? .72 : .18;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, front ? 1.5 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 64; i += 1) {
        const a = i / 64 * Math.PI * 2;
        if (Math.sin(a) < 0) orbitDot(a, false);
      }
      ctx.fillStyle = '#fff';
      for (let lat = -4; lat <= 4; lat += 1) {
        const phi = lat / 5 * Math.PI / 2;
        const rr = Math.cos(phi) * r;
        const yy = Math.sin(phi) * r;
        for (let i = 0; i < 54; i += 1) {
          const a = i / 54 * Math.PI * 2;
          const p = project(Math.cos(a) * rr, yy, Math.sin(a) * rr);
          const front = p.z > -r * .18;
          ctx.globalAlpha = front ? .3 + p.depth * .62 : .08 + p.depth * .12;
          ctx.beginPath();
          ctx.arc(p.x, p.y, front ? 1.35 + p.depth * .65 : .75, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (let lon = 0; lon < 10; lon += 1) {
        const lambda = lon / 10 * Math.PI * 2;
        for (let j = -32; j <= 32; j += 2) {
          const phi = j / 32 * Math.PI / 2;
          const p = project(Math.cos(lambda) * Math.cos(phi) * r, Math.sin(phi) * r, Math.sin(lambda) * Math.cos(phi) * r);
          const front = p.z > -r * .18;
          ctx.globalAlpha = front ? .28 + p.depth * .5 : .06 + p.depth * .1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, front ? 1.15 + p.depth * .55 : .65, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (let i = 0; i < 64; i += 1) {
        const a = i / 64 * Math.PI * 2;
        if (Math.sin(a) >= 0) orbitDot(a, true);
      }
      ctx.globalAlpha = 1;
      const a = t * .9;
      const sx = cx + Math.cos(a) * 162;
      const sy = cy + 7 + Math.sin(a) * 19;
      ctx.font = '32px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(255,255,255,.7)';
      ctx.shadowBlur = 10;
      ctx.fillText('✧', sx, sy);
      ctx.restore();
    }

    function drawName() {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;
      const words = name.toUpperCase().split(' ');
      let size = words.length > 1 ? 96 : 104;
      ctx.fontStretch = 'expanded';
      do {
        ctx.font = `900 ${size}px Archivo, sans-serif`;
        size -= 4;
      } while (ctx.measureText(words.join(' ')).width > 560 && size > 72);
      ctx.font = `900 ${size + 4}px Archivo, sans-serif`;
      ctx.fontStretch = 'expanded';
      if (ctx.measureText(words.join(' ')).width <= 570) {
        ctx.fillText(words.join(' '), width / 2, 350);
      } else {
        ctx.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), width / 2, 326);
        ctx.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), width / 2, 402);
      }
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.font = '30px VT323, monospace';
      ctx.fillText(`${tagline.toUpperCase()}  ·  CH 00`, width / 2, 432);
      ctx.restore();
    }

    return {
      meta,
      frame(t) {
        blueField(ctx, width, height);
        safeBox(ctx, 'rgba(255,255,255,.07)');
        osd(ctx, 'CH 00', width - 32, 48, 32, 'right');
        if (Math.floor(t * 2) % 2 === 0) osd(ctx, 'PRESS PLAY', 48, 48, 32);
        else osd(ctx, 'PRESS PLAY', 48, 48, 32, 'left', 'rgba(248,251,255,.38)');
        drawGlobe(t);
        drawName();
      },
      input() {},
      stop() {},
    };
  },
};
