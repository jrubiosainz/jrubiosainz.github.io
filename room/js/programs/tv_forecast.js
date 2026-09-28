import { BLUE, clamp, dateStamp, ease, fitLines, loadFonts, osd, spriteIcon, timeStamp, wrapText } from './util.js';

const districts = ['DOWNTOWN', 'OLD PORT', 'THE YARDS', 'NORTH HILL', 'RIVER GATE'];

export default {
  id: 'tv_forecast',
  title: 'CH 01 ABOUT',
  size: [640, 480],
  mount({ ctx, width, height, content }) {
    const site = content?.site || {};
    const cards = content?.about?.forecast?.length ? content.about.forecast : [
      { region: 'CODE', icon: 'sun', temp: 21, text: 'Clear skies over the editor.' },
    ];
    const meta = { vhs: 0, noise: .05, music: 'tv_weather_loop', selection: -1 };
    loadFonts(['900 54px Archivo', '28px VT323']).then(() => null);

    function bg() {
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#08114d');
      g.addColorStop(.5, BLUE);
      g.addColorStop(1, '#081a5d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    function drawTitle(t) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '900 55px Archivo, sans-serif';
      ctx.fontStretch = 'semi-expanded';
      ctx.fillText('THE LATE', width / 2, 172);
      ctx.fillText('FORECAST', width / 2, 232);
      ctx.font = '29px VT323, monospace';
      ctx.fillText(`${(site.city || 'PORT MERIDIAN').toUpperCase()} · ${dateStamp()}`, width / 2, 282);
      ctx.translate(width / 2, 84);
      ctx.rotate(t * .9);
      spriteIcon(ctx, 'sun', 0, 0, 34, '#ffe871');
      ctx.rotate(-t * 1.4);
      spriteIcon(ctx, 'cloud', 20, 12, 32, '#fff');
      ctx.restore();
    }

    function drawMap(t) {
      bg();
      osd(ctx, 'CH 01', width - 32, 46, 30, 'right');
      ctx.font = '900 28px Archivo, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText((site.city || 'PORT MERIDIAN').toUpperCase(), 46, 70);
      ctx.strokeStyle = '#f5edb4';
      ctx.lineWidth = 4;
      ctx.fillStyle = '#183975';
      ctx.beginPath();
      ctx.moveTo(100, 136); ctx.bezierCurveTo(160, 96, 260, 96, 324, 134);
      ctx.bezierCurveTo(420, 190, 390, 302, 508, 356);
      ctx.lineTo(548, 420); ctx.lineTo(78, 420); ctx.bezierCurveTo(116, 330, 42, 250, 100, 136);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#75d9ff';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(120, 392); ctx.bezierCurveTo(220, 318, 230, 258, 320, 238); ctx.bezierCurveTo(406, 218, 420, 154, 506, 126); ctx.stroke();
      const blobX = 190 + Math.sin(t * .18) * 80;
      const blobY = 190 + Math.cos(t * .13) * 38;
      const rg = ctx.createRadialGradient(blobX, blobY, 10, blobX, blobY, 130);
      rg.addColorStop(0, 'rgba(255,242,90,.72)');
      rg.addColorStop(.36, 'rgba(76,255,129,.54)');
      rg.addColorStop(.7, 'rgba(76,181,255,.36)');
      rg.addColorStop(1, 'rgba(76,181,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(blobX, blobY, 136, 78, .35, 0, Math.PI * 2); ctx.fill();
      ctx.font = '22px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      districts.forEach((d, i) => {
        const x = 145 + (i % 3) * 150 + Math.sin(i) * 18;
        const y = 155 + Math.floor(i / 3) * 108 + Math.cos(i) * 18;
        ctx.fillText(d, x, y);
        ctx.fillStyle = '#ffe871';
        ctx.fillRect(x - 22, y + 10, 44, 24);
        ctx.fillStyle = '#10276b';
        ctx.fillText(`${12 + i * 2}°`, x, y + 30);
        ctx.fillStyle = '#fff';
      });
    }

    function drawCard(card, p) {
      bg();
      ctx.globalAlpha = ease(p);
      ctx.fillStyle = '#fff';
      ctx.font = '900 36px Archivo, sans-serif';
      ctx.fontStretch = 'semi-expanded';
      ctx.fillText(String(card.region || 'REGION').toUpperCase(), 56, 92);
      spriteIcon(ctx, card.icon || 'cloud', 154, 214, 68, card.icon === 'rain' ? '#d9f4ff' : '#ffe871');
      ctx.font = '900 104px Archivo, sans-serif';
      ctx.fillText(`${card.temp ?? 21}°`, 274, 244);
      ctx.font = '30px VT323, monospace';
      ctx.fillStyle = '#fff7be';
      fitLines(ctx, card.text || '', 500, 3).forEach((line, i) => ctx.fillText(line, 70, 330 + i * 34));
      ctx.globalAlpha = 1;
    }

    function crawl(t) {
      ctx.save();
      ctx.fillStyle = '#061038';
      ctx.fillRect(0, 430, width, 50);
      ctx.font = '27px VT323, monospace';
      ctx.fillStyle = '#fff';
      const msg = ` ${content?.site?.intro || ''}   ·   LOCAL TIME ${timeStamp(new Date(), false)}   ·   `;
      const tw = ctx.measureText(msg).width;
      const x = -((t * 54) % tw);
      for (let i = -1; i < 5; i += 1) ctx.fillText(msg, Math.round(x + i * tw), 462);
      ctx.restore();
    }

    return {
      meta,
      frame(t) {
        const cycle = 7 + cards.length * 5;
        const tt = t % cycle;
        if (tt < 3.2) { bg(); drawTitle(t); }
        else if (tt < 7) drawMap(t);
        else {
          const idx = Math.floor((tt - 7) / 5) % cards.length;
          drawCard(cards[idx], clamp(((tt - 7) % 5) / .7));
        }
        osd(ctx, timeStamp(new Date(), false), width - 34, height - 72, 26, 'right');
        crawl(t);
      },
      input() {},
      stop() {},
    };
  },
};
