export function createLoader(container = document.body) {
  const root = document.createElement('div');
  root.className = 'site-loader';
  root.innerHTML = `
    <div class="site-loader__noise" aria-hidden="true"></div>
    <div class="site-loader__panel" role="status" aria-live="polite">
      <div class="site-loader__top"><span>▶▶ LOADING</span><span>CH 00</span></div>
      <div class="site-loader__bar" aria-hidden="true"></div>
      <div class="site-loader__bottom"><span class="site-loader__status">WARMING TUBE</span><span class="site-loader__percent">000%</span></div>
    </div>`;
  container.appendChild(root);
  const bar = root.querySelector('.site-loader__bar');
  const status = root.querySelector('.site-loader__status');
  const percent = root.querySelector('.site-loader__percent');
  let progress = 0;
  function render() {
    const blocks = 15;
    const filled = Math.round(progress * blocks);
    bar.innerHTML = Array.from({ length: blocks }, (_, i) => `<i class="${i < filled ? 'is-on' : ''}"></i>`).join('');
    percent.textContent = `${String(Math.round(progress * 100)).padStart(3, '0')}%`;
  }
  render();
  return {
    setProgress(v) {
      progress = Math.max(0, Math.min(1, Number(v) || 0));
      render();
    },
    setStatus(text) {
      status.textContent = String(text || '').toUpperCase();
    },
    done() {
      progress = 1;
      render();
      root.classList.add('is-done');
      return new Promise((resolve) => {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.setTimeout(() => {
          root.remove();
          resolve();
        }, reduced ? 0 : 620);
      });
    },
  };
}
