import { clamp, fitLines, loadFonts, lerp, mod, rnd, wrapText } from './util.js';
import { asset } from '../base.js';

const visuals = ['terminal', 'wireframe', 'map', 'charts', 'starfield', 'screens', 'oscilloscope', 'photos'];

export default {
  id: 'tv_tape',
  title: 'TAPE',
  size: [640, 480],
  mount({ ctx, width, height, content, params }) {
    const item = params?.item || {};
    const index = params?.index || 0;
    const tape = item.tape || {};
    const color = tape.color || '#2d5bd7';
    const ink = tape.ink || '#ffffff';
    const visual = item.visual || visuals[index % visuals.length];
    const meta = { vhs: 1, noise: .16, music: ['tape_loop_a', 'tape_loop_b', 'tape_loop_c', 'tape_loop_d'][index % 4], selection: index };
    const sentences = `${item.description || ''} ${item.body || ''}`.split(/(?<=[.!?])\s+/).filter(Boolean);
    const photos = visual === 'photos' ? (item.images || []).map((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';           // drawn into the TV's canvas, which becomes a WebGL texture
      img.src = asset(src);
      return img;
    }) : [];
    let video = null;
    if (visual === 'video' && item.video) {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = asset(item.video);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.play().catch(() => null);
    }
    // subtitle cards: each sentence, split into chunks of at most two lines (recomputed once the fonts are in)
    let cards = null;
    loadFonts(['900 52px Archivo', '26px VT323', '27px VT323', '22px Courier Prime']).then(() => { cards = null; });
    function subtitleCards() {
      ctx.font = '27px VT323, monospace';
      const out = [];
      for (const sentence of sentences) {
        let cur = [];
        for (const word of sentence.split(/\s+/)) {
          if (cur.length && fitLines(ctx, [...cur, word].join(' '), 520, 3).length > 2) {
            out.push(cur.join(' '));
            cur = [word];
          } else cur.push(word);
        }
        if (cur.length) out.push(cur.join(' '));
      }
      return out;
    }
    function blueOsd(text) {
      ctx.fillStyle = '#1734ca';
      ctx.fillRect(0, 0, width, height);
      ctx.font = '48px VT323, monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(text, 50, 78);
    }
    function notice() {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.strokeRect(50, 50, 540, 380);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '900 42px Archivo, sans-serif';
      ctx.fillText('PLEASE BE KIND', width / 2, 150);
      ctx.fillText('REWIND', width / 2, 202);
      ctx.font = '24px Courier Prime, monospace';
      fitLines(ctx, `This tape is the property of ${content?.site?.name || 'the Night Desk'}. Unauthorised viewing is warmly encouraged.`, 460, 4)
        .forEach((line, i) => ctx.fillText(line, width / 2, 284 + i * 28));
      ctx.textAlign = 'left';
    }
    function titleCard(t) {
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, width, height);
      if (tape.style === 'stripe') {
        for (let i = 0; i < 16; i += 1) {
          ctx.fillStyle = i % 2 ? color : '#111';
          ctx.fillRect(i * 48 - 40, 0, 24, height);
        }
      } else if (tape.style === 'split') {
        ctx.fillStyle = color; ctx.fillRect(0, 0, width / 2, height);
        ctx.fillStyle = '#101010'; ctx.fillRect(width / 2, 0, width / 2, height);
      } else if (tape.style === 'solid') {
        ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = color; ctx.fillRect(0, 136, width, 156);
      }
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.font = '900 55px Archivo, sans-serif';
      ctx.fontStretch = 'semi-expanded';
      fitLines(ctx, (item.title || 'UNTITLED').toUpperCase(), 540, 2).forEach((line, i) => ctx.fillText(line, width / 2, 202 + i * 58));
      ctx.font = '28px VT323, monospace';
      ctx.fillText([item.years, (item.group || 'TAPE PROGRAMME').toUpperCase()].filter(Boolean).join('  ·  '), width / 2, 326);
      ctx.textAlign = 'left';
    }
    function drawVisual(t) {
      ctx.fillStyle = '#080a12';
      ctx.fillRect(0, 0, width, height);
      if (visual === 'terminal') {
        ctx.fillStyle = '#051405'; ctx.fillRect(44, 42, 552, 350);
        ctx.font = '22px Courier Prime, monospace'; ctx.fillStyle = '#7cff92';
        const lines = ['BOOT /NIGHTDESK', 'LOAD PROFILE', `RUN ${item.id || 'PROJECT'}.EXE`, 'CONNECT CLOUD-LAB', 'STATUS: GREEN', 'WRITE DOCS --CLEAR'];
        lines.forEach((l, i) => ctx.fillText(`>${l.slice(0, Math.floor((t * 12 - i * 6) % 44))}`, 70, 82 + i * 38));
      } else if (visual === 'wireframe') {
        ctx.strokeStyle = '#82f7ff'; ctx.lineWidth = 2;
        const cx = 320, cy = 220, s = 110;
        for (let i = 0; i < 3; i += 1) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .35 + i * Math.PI / 3);
          ctx.strokeRect(-s + i * 24, -s + i * 18, s * 2 - i * 48, s * 2 - i * 36);
          ctx.restore();
        }
        for (let i = 0; i < 28; i += 1) {
          ctx.beginPath(); ctx.moveTo(40 + i * 24, 400); ctx.lineTo(320 + Math.sin(t + i) * 50, 80 + (i % 6) * 26); ctx.stroke();
        }
      } else if (visual === 'map') {
        ctx.strokeStyle = '#ffda7a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(80, 360); ctx.bezierCurveTo(190, 190, 305, 330, 430, 136); ctx.bezierCurveTo(470, 80, 530, 120, 560, 90); ctx.stroke();
        ctx.fillStyle = '#5df7ff';
        for (let i = 0; i < 9; i += 1) ctx.fillRect(90 + rnd(i) * 440, 90 + rnd(i + 9) * 260, 36, 22);
        ctx.fillStyle = '#fff'; ctx.beginPath(); const p = clamp((t % 9) / 9); ctx.arc(lerp(80, 560, p), 360 - Math.sin(p * Math.PI) * 250, 10, 0, Math.PI * 2); ctx.fill();
      } else if (visual === 'charts') {
        for (let i = 0; i < 12; i += 1) {
          const h = 50 + rnd(i) * 190 * clamp((t % 4) / 2);
          ctx.fillStyle = ['#ffda7a', '#5df7ff', '#ff77c8'][i % 3];
          ctx.fillRect(70 + i * 42, 390 - h, 24, h);
        }
        ctx.strokeStyle = '#fff'; ctx.beginPath();
        for (let i = 0; i < 90; i += 1) {
          const x = 70 + i * 5.3, y = 220 + Math.sin(i * .24 + t) * 54 + Math.sin(i * .09) * 34;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      } else if (visual === 'oscilloscope') {
        ctx.strokeStyle = '#62ff9e'; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i < 500; i += 1) {
          const a = i / 500 * Math.PI * 2;
          const x = 320 + Math.sin(a * 3 + t) * 210;
          const y = 230 + Math.sin(a * 4 + t * .72) * 130;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      } else if (visual === 'screens') {
        for (let i = 0; i < 6; i += 1) {
          const x = 80 + ((i * 77 + t * 18) % 420);
          const y = 70 + (i % 3) * 76;
          ctx.fillStyle = '#d7e8ff'; ctx.fillRect(x, y, 180, 108);
          ctx.fillStyle = color; ctx.fillRect(x, y, 180, 20);
          ctx.fillStyle = '#1a2540'; ctx.fillRect(x + 15, y + 38, 120, 10); ctx.fillRect(x + 15, y + 58, 92, 10);
        }
      } else if (visual === 'photos' && photos.some((img) => img.complete && img.naturalWidth)) {
        const ready = photos.filter((img) => img.complete && img.naturalWidth);
        const hold = 7;
        const k = Math.floor(t / hold);
        const img = ready[k % ready.length];
        const p = (t % hold) / hold;
        // Ken Burns: cover the frame, drift and push in a little, fade through black between stills
        const s = Math.max(width / img.naturalWidth, height / img.naturalHeight) * (1.06 + p * 0.08);
        const dw = img.naturalWidth * s;
        const dh = img.naturalHeight * s;
        const dir = k % 2 ? 1 : -1;
        const x = (width - dw) / 2 + dir * (p - 0.5) * (dw - width) * 0.8;
        const y = (height - dh) / 2 + (0.5 - p) * (dh - height) * 0.5;
        ctx.globalAlpha = clamp(Math.min(p * hold / 0.6, (1 - p) * hold / 0.6));
        ctx.drawImage(img, x, y, dw, dh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 160; i += 1) {
          const x = (rnd(i) * width + t * (18 + rnd(i + 1) * 70)) % width;
          const y = rnd(i + 2) * height;
          ctx.globalAlpha = .3 + rnd(i + 3) * .7; ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      if (video?.readyState >= 2) ctx.drawImage(video, 0, 0, width, height);
    }
    function subtitles(t) {
      if (!sentences.length) return;
      cards ||= subtitleCards();
      const s = cards[Math.floor(t / 4.2) % cards.length];
      ctx.font = '27px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      const lines = fitLines(ctx, s, 520, 2);
      lines.forEach((line, i) => {
        const y = 394 + i * 31;
        ctx.strokeStyle = '#000'; ctx.strokeText(line, width / 2, y);
        ctx.fillStyle = '#fff7c9'; ctx.fillText(line, width / 2, y);
      });
      ctx.textAlign = 'left';
    }
    function endCard() {
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff'; ctx.font = '900 42px Archivo, sans-serif'; ctx.fillText('LINKS', 70, 100);
      ctx.font = '28px VT323, monospace';
      const short = (url = '') => {
        const u = url.replace(/^[a-z]+:\/\//i, '').replace(/^www\./, '').replace(/\/$/, '');
        return u.length > 30 ? `${u.slice(0, 29)}…` : u;
      };
      (item.links?.length ? item.links : [{ label: 'No printed links on this cassette', url: '' }]).slice(0, 4).forEach((l, i) => {
        const y = 156 + i * 56;
        ctx.font = '30px VT323, monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${i + 1}. ${l.label}`, 86, y);
        ctx.font = '22px VT323, monospace';
        ctx.fillStyle = '#9fb3c8';
        ctx.fillText(short(l.url), 118, y + 22);
      });
      ctx.font = '28px VT323, monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('◀◀ REWIND', 70, 400);
    }
    return {
      meta,
      frame(t) {
        const c = mod(t, 44);
        if (c < 2.5) blueOsd('PLAY ▶');
        else if (c < 5.5) notice();
        else if (c < 9) titleCard(c - 5.5);
        else if (c < 38) { drawVisual(c - 9); subtitles(c - 9); }
        else endCard();
      },
      input() {},
      stop() { if (video) { video.pause(); video.removeAttribute('src'); video.load(); } },
    };
  },
};
