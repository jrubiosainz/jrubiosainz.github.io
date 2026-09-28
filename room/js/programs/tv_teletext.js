import { TELE, clamp, dateStamp, loadFonts, teletextDate, timeStamp } from './util.js';

const COLS = 40;
const ROWS = 25;
const CW = 16;
const CH = 19.2;
// the tube's bezel hides the outermost pixels, so the 40x25 grid is drawn inside a small safe area
const SAFE_X = 20;
const SAFE_Y = 6;

function toGrid(ev) {
  return { x: (ev.x * 640 - SAFE_X) / (640 - SAFE_X * 2), y: (ev.y * 480 - SAFE_Y) / (480 - SAFE_Y * 2) };
}

function trunc(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function wrapWords(text, max) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const FONT_PX = 26;
// teletext glyphs fill their cells: VT323 is stretched sideways so each character advances exactly one cell
const advances = new Map();
function cellStretch(ctx) {
  let adv = advances.get(ctx.font);
  if (!adv) {
    adv = ctx.measureText('0000000000').width / 10;
    if (document.fonts?.check?.(ctx.font)) advances.set(ctx.font, adv);
  }
  return CW / adv;
}

function write(ctx, text, col, row, color = 7, opts = {}) {
  ctx.save();
  ctx.font = `${opts.bold ? '700 ' : ''}${FONT_PX}px VT323, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = TELE[color] || TELE[7];
  if (opts.bg !== undefined) {
    ctx.fillStyle = TELE[opts.bg];
    ctx.fillRect(col * CW, row * CH, String(text).length * CW, opts.double ? CH * 2 : CH);
    ctx.fillStyle = TELE[color] || TELE[7];
  }
  const sx = cellStretch(ctx);
  if (opts.double) {
    ctx.translate(col * CW, row * CH - 5);
    ctx.scale(sx, 1.9);
  } else {
    ctx.translate(col * CW, row * CH - 3);
    ctx.scale(sx, 1);
  }
  ctx.fillText(String(text), 0, 0);
  ctx.restore();
}

function fillRow(ctx, row, color, rows = 1, col = 0, cols = COLS) {
  ctx.fillStyle = TELE[color];
  ctx.fillRect(col * CW, row * CH, cols * CW, rows * CH);
}

function mosaic(ctx, col, row, color, pattern) {
  const x = col * CW;
  const y = row * CH;
  ctx.fillStyle = TELE[color];
  const bw = CW / 2 - 1;
  const bh = CH / 3 - 1;
  for (let i = 0; i < 6; i += 1) {
    if (pattern & (1 << i)) {
      ctx.fillRect(x + (i % 2) * (CW / 2), y + Math.floor(i / 2) * (CH / 3), bw, bh);
    }
  }
}

export default {
  id: 'tv_teletext',
  title: 'CH 03 POSTS',
  size: [640, 480],
  mount({ ctx, content, emit }) {
    const tt = content?.tv?.teletext || {};
    const service = (tt.service || 'LATETEXT').toUpperCase();
    const indexPage = tt.indexPage || 100;
    const perPage = clamp(tt.perPage || 7, 1, 7); // 7 two-row entries fit between the header and FASTEXT
    const posts = content?.posts || [];
    const meta = { vhs: 0, noise: .02, music: 'tv_teletext_loop', selection: 0, fit: true };
    let page = indexPage + 1;
    let indexOffset = 0;
    let selected = 0;
    let postPage = false;
    let typed = '';
    let rollingUntil = 0;
    let pendingPage = null;
    loadFonts(['24px VT323']).then(() => null);

    function pageForPost(i) { return indexPage + 1 + i; }
    function isIndex() { return page === indexPage || (page >= indexPage + 1 && !postPage); }
    function setIndexPage(offset) {
      indexOffset = clamp(offset, 0, Math.max(0, Math.ceil(posts.length / perPage) - 1));
      page = indexPage + 1 + indexOffset;
      postPage = false;
      selected = Math.min(selected, posts.slice(indexOffset * perPage, indexOffset * perPage + perPage).length - 1);
      meta.selection = indexOffset * perPage + selected;
      rollingUntil = performance.now() / 1000 + .6;
    }
    function gotoPage(n) {
      if (n === indexPage) return setIndexPage(0);
      const post = n - indexPage - 1;
      if (post >= 0 && post < posts.length) {
        page = n;
        selected = post % perPage;
        indexOffset = Math.floor(post / perPage);
        postPage = true;
        meta.selection = post;
        rollingUntil = performance.now() / 1000 + .6;
      }
    }
    function header() {
      ctx.fillStyle = TELE[0];
      ctx.fillRect(0, 0, 640, 480);
      const now = new Date();
      const pageText = typed ? `P${typed.padEnd(3, '_')}` : `P${String(page).padStart(3, '0')}`;
      write(ctx, pageText, 0, 0, 7);
      write(ctx, service.padEnd(8), 6, 0, 3);
      write(ctx, String(page).padStart(3, '0'), 16, 0, 7);
      write(ctx, teletextDate(now), 20, 0, 7);
      write(ctx, timeStamp(now), 31, 0, 3);
    }
    function banner() {
      fillRow(ctx, 2, 4, 5);
      for (let c = 0; c < COLS; c += 1) mosaic(ctx, c, 2, c % 7 === 0 ? 7 : 6, c % 5 === 0 ? 63 : c % 3 === 0 ? 54 : 9);
      for (let c = 1; c < 39; c += 3) {
        mosaic(ctx, c, 5, 6, 56);
        mosaic(ctx, c + 1, 4, 7, 60);
        mosaic(ctx, c + 2, 5, 3, 48);
      }
      fillRow(ctx, 3, 4, 3, 3, 34);
      for (let c = 4; c < 14; c += 1) mosaic(ctx, c, 5, c % 2 ? 3 : 7, 7);
      for (let c = 22; c < 34; c += 1) mosaic(ctx, c, 5, c % 2 ? 6 : 7, 56);
      write(ctx, service, 3, 3, 3, { double: true, bold: true });
      write(ctx, 'POSTS & NOTES', 20, 3, 7, { double: true });
    }
    function fastext() {
      fillRow(ctx, 24, 0);
      write(ctx, 'ABOUT', 1, 24, 1);
      write(ctx, 'WORK', 11, 24, 2);
      write(ctx, 'HOME', 21, 24, 3);
      write(ctx, 'ONLINE', 31, 24, 6);
    }
    function drawIndex() {
      header(); banner();
      const pages = Math.max(1, Math.ceil(posts.length / perPage));
      write(ctx, 'POSTS', 2, 8, 6);
      write(ctx, `PAGE ${indexOffset + 1}/${pages}`, 25, 8, 6);
      const start = indexOffset * perPage;
      posts.slice(start, start + perPage).forEach((post, i) => {
        const row = 10 + i * 2;
        const highlighted = i === selected;
        if (highlighted) fillRow(ctx, row, 6, 2, 1, 38);
        write(ctx, String(pageForPost(start + i)), 2, row, highlighted ? 0 : 7);
        write(ctx, trunc(post.title, 31), 7, row, highlighted ? 0 : 7);
        write(ctx, dateStamp(new Date(post.date || Date.now())), 7, row + 1, highlighted ? 0 : 2);
      });
      fastext();
    }
    function drawPost() {
      header();
      const post = posts[meta.selection] || posts[0] || {};
      const title = wrapWords(String(post.title || 'UNTITLED').toUpperCase(), 30);
      if (title.length > 2) title.splice(1, title.length - 1, trunc(title.slice(1).join(' '), 30));
      title.forEach((text, i) => write(ctx, text, 2, 3 + i * 2, 3, { double: true, bold: true }));
      const dateRow = 3 + title.length * 2 + 1;
      write(ctx, dateStamp(new Date(post.date || Date.now())), 2, dateRow, 2);
      const lastRow = 19;
      const body = wrapWords(post.excerpt, 35);
      body.slice(0, lastRow - dateRow - 2).forEach((text, i) => write(ctx, text, 3, dateRow + 3 + i, 7));
      const where = /linkedin\.com/i.test(post.url || '') ? 'OPENS ON LINKEDIN' : /^[a-z]+:/i.test(post.url || '') ? 'OPENS THE LINK' : 'OPENS THE ARTICLE';
      write(ctx, `ENTER ${where} · ← BACK`, 3, 21, 6);
      fastext();
    }
    function drawRoll(t) {
      header();
      write(ctx, 'SEARCHING', 13, 11, 3, { double: true, bold: true });
      const roll = indexPage + 1 + Math.floor((t * 32) % Math.max(1, posts.length));
      write(ctx, `P${roll}`, 16, 14, 7);
      fastext();
    }
    function activateSelection(openArticle = false) {
      if (postPage && openArticle) {
        const post = posts[meta.selection];
        if (post?.url) emit?.({ type: 'open', url: post.url });
      } else if (isIndex()) {
        gotoPage(pageForPost(indexOffset * perPage + selected));
      }
    }
    function fastextAt(x, y) {
      if (y < .94) return false;
      if (x < .25) emit?.({ type: 'navigate', to: '#about' });
      else if (x < .5) emit?.({ type: 'navigate', to: '#work' });
      else if (x < .75) emit?.({ type: 'navigate', to: '#home' });
      else emit?.({ type: 'navigate', to: '#online' });
      return true;
    }
    return {
      meta,
      frame(t) {
        ctx.fillStyle = TELE[0];
        ctx.fillRect(0, 0, 640, 480);
        ctx.save();
        ctx.translate(SAFE_X, SAFE_Y);
        ctx.scale((640 - SAFE_X * 2) / 640, (480 - SAFE_Y * 2) / 480);
        if ((performance.now() / 1000) < rollingUntil) drawRoll(t);
        else if (postPage) drawPost();
        else drawIndex();
        ctx.restore();
      },
      input(ev) {
        if (!ev) return;
        if (ev.type === 'key' && ev.down !== false) {
          const k = ev.key;
          if (/^\d$/.test(k)) {
            typed = (typed + k).slice(-3);
            if (typed.length === 3) {
              pendingPage = Number(typed);
              typed = '';
              gotoPage(pendingPage);
            }
          } else if (k === 'ArrowDown') {
            selected = Math.min(perPage - 1, selected + 1, posts.length - 1 - indexOffset * perPage);
            meta.selection = indexOffset * perPage + selected;
          } else if (k === 'ArrowUp') {
            selected = Math.max(0, selected - 1);
            meta.selection = indexOffset * perPage + selected;
          } else if (k === 'ArrowRight') setIndexPage(indexOffset + 1);
          else if (k === 'ArrowLeft') postPage ? setIndexPage(indexOffset) : setIndexPage(indexOffset - 1);
          else if (k === 'Enter') activateSelection(true);
          else if (/[rR]/.test(k)) emit?.({ type: 'navigate', to: '#about' });
          else if (/[gG]/.test(k)) emit?.({ type: 'navigate', to: '#work' });
          else if (/[yY]/.test(k)) emit?.({ type: 'navigate', to: '#home' });
          else if (/[cC]/.test(k)) emit?.({ type: 'navigate', to: '#online' });
        } else if (ev.type === 'pointer' && ev.kind === 'down') {
          const g = toGrid(ev);
          if (fastextAt(g.x, g.y)) return;
          if (isIndex()) {
            const row = Math.floor((g.y * 480) / CH);
            const hit = Math.floor((row - 10) / 2);
            if (hit >= 0 && hit < perPage && posts[indexOffset * perPage + hit]) {
              selected = hit;
              meta.selection = indexOffset * perPage + selected;
              activateSelection(false);
            }
          } else activateSelection(true);
        }
      },
      stop() {},
    };
  },
};
