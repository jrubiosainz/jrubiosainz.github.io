const NAV = [
  ['about', 'ABOUT'],
  ['work', 'WORK'],
  ['posts', 'POSTS'],
  ['online', 'ONLINE'],
];

const ROUTE_MAP = {
  'about-tv': 'about',
  pc: 'about',
  online: 'online',
  work: 'work',
  posts: 'posts',
};

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null) return;
    if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value);
  });
  return node;
}

function safeUrl(url) {
  return String(url || '#');
}

function formatTime(seconds = 0) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function actionLabel(name) {
  return {
    hide: 'HIDE',
    home: 'HOME',
    eject: 'EJECT',
    open: 'OPEN ↗',
  }[name] || String(name).toUpperCase();
}

function focusable(container) {
  return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hidden && node.offsetParent !== null);
}

export function createHud(root, { content, onNavigate = () => {}, onAction = () => {} } = {}) {
  if (!root) throw new Error('createHud requires a root element');
  root.classList.add('hud-root');
  root.setAttribute('data-hud', '');
  root.replaceChildren();

  const state = {
    route: 'home',
    sound: false,
    cardKind: null,
    cardData: null,
    toastTimer: 0,
    previousFocus: null,
  };

  const top = el('div', 'hud-top');
  const home = el('button', 'hud-home', { type: 'button', text: content?.site?.name || 'Home', 'aria-label': 'Go home' });
  const nav = el('nav', 'hud-nav', { 'aria-label': 'Main sections' });
  const navLinks = new Map();
  NAV.forEach(([route, label]) => {
    const link = el('a', 'hud-nav-link', { href: `#${route}`, text: label });
    link.addEventListener('click', (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate(route);
    });
    navLinks.set(route, link);
    nav.append(link);
  });
  top.append(home, nav);

  const bottom = el('div', 'hud-bottom');
  const hint = el('div', 'hud-hint');
  const pills = el('div', 'hud-pill-row');
  const back = el('button', 'hud-pill hud-back', { type: 'button' });
  const credits = el('button', 'hud-pill hud-credits-trigger', { type: 'button', text: 'CREDITS' });
  const sound = el('button', 'hud-pill hud-sound', { type: 'button' });
  // touch screens have no R key, and portrait framing can leave the robot just out of shot
  const reachy = el('button', 'hud-pill hud-reachy', { type: 'button', text: 'REACHY' });
  back.hidden = true;
  reachy.hidden = true;
  pills.append(back, reachy, credits, sound);
  bottom.append(hint, pills);

  const tooltip = el('div', 'hud-tooltip', { role: 'tooltip' });
  const card = el('section', 'hud-card', { 'aria-live': 'polite' });
  card.hidden = true;
  const toast = el('div', 'hud-toast', { role: 'status', 'aria-live': 'polite' });
  const live = el('div', 'hud-live', { 'aria-live': 'polite' });
  const modal = el('div', 'hud-modal-backdrop', { role: 'presentation' });
  modal.hidden = true;

  root.append(top, bottom, tooltip, card, modal, toast, live);

  home.addEventListener('click', () => onNavigate('home'));
  back.addEventListener('click', () => onAction('back'));
  credits.addEventListener('click', () => {
    onAction('credits');
    hud.showCredits(true);
  });
  sound.addEventListener('click', () => onAction('sound'));
  reachy.addEventListener('click', () => onAction('reachy'));

  function setActive(route) {
    const active = ROUTE_MAP[route] || route;
    navLinks.forEach((link, key) => {
      const isActive = key === active;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderActions(actions = [], data = {}) {
    if (!actions?.length) return null;
    const row = el('div', 'hud-actions');
    actions.forEach((action) => {
      const button = el('button', 'hud-pill', { type: 'button', text: actionLabel(action) });
      button.addEventListener('click', () => {
        if (action === 'hide') {
          onAction('card-hide', { kind: state.cardKind });
          hud.hideCard(state.cardKind);
        }
        else if (action === 'home') onAction('home');
        else if (action === 'eject') onAction('eject', data);
        else if (action === 'open') onAction('open', data.url);
        else onAction(action, data);
      });
      row.append(button);
    });
    return row;
  }

  function renderCard(kind, data) {
    state.cardKind = kind;
    state.cardData = { ...data };
    card.hidden = false;
    card.replaceChildren();

    if (kind === 'tv') {
      card.append(
        el('p', 'hud-card-label', { text: `${data.channel || 'CH 00'} · TV` }),
        el('h2', 'hud-card-title', { text: data.title || 'Untitled channel' }),
      );
      if (data.subtitle) card.append(el('p', 'hud-card-subtitle', { text: data.subtitle }));
      const body = el('div', 'hud-card-body');
      (data.lines || []).forEach((line) => body.append(el('p', '', { text: line })));
      card.append(body);
      const actions = renderActions(data.actions || ['hide', 'home'], data);
      if (actions) card.append(actions);
    } else if (kind === 'tape') {
      const item = data.item || {};
      card.append(
        el('p', 'hud-card-label', { text: `TAPE ${String(data.index ?? 1).padStart(2, '0')}${item.years ? ` · ${item.years}` : ''}` }),
        el('h2', 'hud-card-title', { text: item.title || 'Untitled tape' }),
        el('p', 'hud-card-subtitle', { text: item.group || 'Archive tape' }),
      );
      const body = el('div', 'hud-card-body');
      body.append(el('p', '', { text: item.description || '' }), el('p', '', { text: item.body || '' }));
      if (item.links?.length) {
        const ul = el('ul');
        item.links.forEach((link) => {
          const li = el('li');
          li.append(el('a', '', { href: safeUrl(link.url), text: link.label || link.url }));
          ul.append(li);
        });
        body.append(ul);
      }
      card.append(body);
      if (!data.loaded) {
        const play = el('button', 'hud-pill', { type: 'button', text: 'PLAY TAPE' });
        play.addEventListener('click', () => onAction('tape', data.index));
        const playRow = el('div', 'hud-actions');
        playRow.append(play);
        card.append(playRow);
      }
      const actions = renderActions(data.actions || ['eject', 'home'], { ...data, index: data.index });
      if (actions) card.append(actions);
    } else if (kind === 'cd') {
      renderCdCard(data);
    } else if (kind === 'post') {
      card.append(
        el('p', 'hud-card-label', { text: data.date || 'POST' }),
        el('h2', 'hud-card-title', { text: data.title || 'Untitled post' }),
      );
      const body = el('div', 'hud-card-body');
      body.append(el('p', '', { text: data.excerpt || '' }));
      card.append(body);
      const actions = renderActions(['open', 'hide'], data);
      if (actions) card.append(actions);
    } else {
      card.append(
        el('p', 'hud-card-label', { text: 'MESSAGE' }),
        el('h2', 'hud-card-title', { text: data.title || 'Message' }),
      );
      const body = el('div', 'hud-card-body');
      body.append(el('p', '', { text: data.text || '' }));
      card.append(body);
      const actions = renderActions(data.actions || ['hide'], data);
      if (actions) card.append(actions);
    }
  }

  function cdState(data) {
    return data.playing ? 'PLAY' : (data.time || 0) > 0.5 ? 'PAUSE' : 'STOP';
  }

  function renderCdCard(data) {
    const current = data.tracks?.[data.index || 0] || {};
    card.append(
      el('p', 'hud-card-label', { text: 'CD · PLAYER' }),
      el('h2', 'hud-card-title', { text: data.album || 'Untitled album' }),
      el('p', 'hud-card-subtitle', { text: data.artist || 'Unknown artist' }),
    );
    const body = el('div', 'hud-card-body');
    const trackList = el('ul');
    (data.tracks || []).forEach((track, i) => {
      const li = el('li', i === (data.index || 0) ? 'is-active' : '', { text: `${i + 1}. ${track.title}` });
      li.dataset.trackIndex = String(i);
      trackList.append(li);
    });
    body.append(trackList);
    const status = el('div', 'hud-cd-status');
    status.append(
      el('span', 'hud-cd-track', { text: `${cdState(data)} · ${current.title || 'No track'}` }),
      el('span', 'hud-cd-time', { text: `${formatTime(data.time)} / ${formatTime(data.duration)}` }),
      el('div', 'hud-cd-meter', { html: '<span></span>' }),
    );
    const controls = el('div', 'hud-cd-controls');
    [
      ['prev', '⏮', 'Previous track'],
      ['toggle', data.playing ? '⏸' : '⏯', 'Toggle play'],
      ['stop', '⏹', 'Stop'],
      ['next', '⏭', 'Next track'],
    ].forEach(([cmd, label, aria]) => {
      const button = el('button', 'hud-pill hud-cd-control', { type: 'button', text: label, 'aria-label': aria });
      button.addEventListener('click', () => onAction('cd', { cmd }));
      controls.append(button);
    });
    const volume = el('input', 'hud-volume', { type: 'range', min: '0', max: '1', step: '0.01', value: String(data.volume ?? 1), 'aria-label': 'CD volume' });
    volume.addEventListener('input', () => onAction('cd', { cmd: 'volume', value: Number(volume.value) }));
    controls.append(volume);
    body.append(status, controls);
    card.append(body);
    updateCd(data);
  }

  function updateCd(patch) {
    state.cardData = { ...(state.cardData || {}), ...patch };
    const data = state.cardData;
    const track = data.tracks?.[data.index || 0] || {};
    const trackEl = card.querySelector('.hud-cd-track');
    const timeEl = card.querySelector('.hud-cd-time');
    const meter = card.querySelector('.hud-cd-meter span');
    const toggle = card.querySelectorAll('.hud-cd-control')[1];
    const volume = card.querySelector('.hud-volume');
    if (trackEl) trackEl.textContent = `${cdState(data)} · ${track.title || 'No track'}`;
    if (timeEl) timeEl.textContent = `${formatTime(data.time)} / ${formatTime(data.duration)}`;
    if (meter) meter.style.width = `${Math.min(100, Math.max(0, ((data.time || 0) / Math.max(1, data.duration || 1)) * 100))}%`;
    if (toggle) toggle.textContent = data.playing ? '⏸' : '⏯';
    if (volume && patch.volume != null) volume.value = String(patch.volume);
    card.querySelectorAll('[data-track-index]').forEach((li) => li.classList.toggle('is-active', Number(li.dataset.trackIndex) === (data.index || 0)));
  }

  function closeCredits() {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.replaceChildren();
    document.removeEventListener('keydown', onModalKeydown, true);
    state.previousFocus?.focus?.();
    onAction('credits-close');
  }

  function onModalKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCredits();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusable(modal);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const hud = {
    setRoute(route) {
      state.route = route;
      setActive(route);
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    setBack(label) {
      // "… · ESC": the key hint is wrapped so touch screens can hide it
      const [text, key] = String(label || '').split(/\s+·\s+(?=ESC$)/);
      back.replaceChildren(text || '');
      // non-breaking: inside the inline-flex pill a leading plain space would be trimmed
      if (key) back.append(el('span', 'hud-kbd', { text: `\u00a0· ${key}` }));
      back.hidden = !label;
    },
    announce(text) {
      live.textContent = '';
      window.setTimeout(() => { live.textContent = text || ''; }, 30);
    },
    setReachy(awake) {
      reachy.hidden = false;
      reachy.classList.toggle('is-sound-on', !!awake);
      reachy.setAttribute('aria-pressed', awake ? 'true' : 'false');
      reachy.setAttribute('aria-label', awake ? 'Reachy is awake. Put it to sleep.' : 'Wake Reachy up.');
    },
    setSound(on) {
      state.sound = !!on;
      sound.textContent = `SOUND ${on ? 'ON' : 'OFF'}`;
      sound.classList.toggle('is-sound-on', !!on);
      sound.setAttribute('aria-label', `Sound is ${on ? 'on' : 'off'}. Toggle sound.`);
    },
    showTooltip(text, clientX, clientY) {
      tooltip.textContent = text || '';
      tooltip.classList.add('is-visible');
      tooltip.style.left = '0px';
      tooltip.style.top = '0px';
      const rect = tooltip.getBoundingClientRect();
      let x = clientX + 14;
      let y = clientY + 14;
      if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - 14;
      if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - 14;
      tooltip.style.left = `${Math.max(8, x)}px`;
      tooltip.style.top = `${Math.max(8, y)}px`;
    },
    hideTooltip() {
      tooltip.classList.remove('is-visible');
    },
    showCard(kind, data = {}) {
      renderCard(kind, data);
    },
    updateCard(kind, patch = {}) {
      if (state.cardKind !== kind) return;
      if (kind === 'cd') updateCd(patch);
      else renderCard(kind, { ...(state.cardData || {}), ...patch });
    },
    cardVisible() {
      return !card.hidden;
    },
    hideCard(kind) {
      if (kind && state.cardKind !== kind) return;
      state.cardKind = null;
      state.cardData = null;
      card.hidden = true;
      card.replaceChildren();
    },
    showCredits(open) {
      if (!open) {
        closeCredits();
        return;
      }
      state.previousFocus = document.activeElement;
      const paper = el('section', 'hud-credits-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hud-credits-title' });
      paper.append(el('h2', '', { id: 'hud-credits-title', text: content?.credits?.title || 'Credits' }));
      const dl = el('dl');
      (content?.credits?.lines || []).forEach((line) => {
        dl.append(el('dt', '', { text: line.what }), el('dd', '', { text: line.who }));
      });
      paper.append(dl);
      if (content?.credits?.extra) paper.append(el('p', '', { text: content.credits.extra }));
      paper.append(el('p', '', { text: 'Made with Blender, Python, lightmaps, shaders, canvas programs and too much late-night coffee.' }));
      const close = el('button', 'hud-pill', { type: 'button', text: 'CLOSE' });
      close.addEventListener('click', closeCredits);
      paper.append(close);
      modal.replaceChildren(paper);
      modal.hidden = false;
      document.addEventListener('keydown', onModalKeydown, true);
      close.focus();
    },
    showToast(text, ms = 2600) {
      window.clearTimeout(state.toastTimer);
      toast.textContent = text || '';
      toast.classList.toggle('is-visible', !!text);
      if (text) state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), ms);
    },
    setVisible(bool) {
      root.hidden = !bool;
    },
    destroy() {
      window.clearTimeout(state.toastTimer);
      document.removeEventListener('keydown', onModalKeydown, true);
      root.replaceChildren();
      root.classList.remove('hud-root');
    },
  };

  hud.setHint('C use computer · M use CD player · Z zoom TV · W look outside · 1–6 monitor buttons');
  hud.setSound(false);
  hud.setRoute('home');
  return hud;
}
