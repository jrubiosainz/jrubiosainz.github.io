import content from './content.js';
import { Stage, webglAvailable } from './app/stage.js';
import { buildWorld } from './app/world.js';
import { App } from './app/app_toys.js';
import { Input } from './app/input.js';
import { createHud } from './ui/hud.js';
import { createLoader } from './ui/loader.js';
import { AudioEngine } from './audio/engine.js';

// ---------------------------------------------------------------------------------------------------------------
// Boot: loader → assets → world → app. No WebGL2 (or a failure while loading) sends you to the lite page.
// ---------------------------------------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);

function fallback(reason) {
  console.warn('Falling back to the lite page:', reason);
  if (params.has('nofallback')) return;
  location.replace(`fallback/${location.hash}`);
}

async function boot() {
  if (!webglAvailable()) { fallback('no webgl2'); return; }
  document.title = `${content.site?.name || 'Home'} — ${content.site?.tagline || ''}`.replace(/ — $/, '');
  const loader = createLoader(document.body);
  loader.setStatus('WARMING TUBE');
  const stageEl = document.getElementById('stage');
  const stage = new Stage(stageEl);
  const audio = new AudioEngine({ basePath: 'assets/audio/' });
  const audioReady = audio.init();

  let app = null;
  const onPcEvent = (ev) => app?.pcEvent(ev);
  const onTvEvent = (ev) => app?.tvEvent(ev);
  const status = [[0.05, 'THREADING TAPE'], [0.35, 'DEVELOPING LIGHTMAPS'], [0.7, 'TUNING CITY'], [0.9, 'DEGAUSSING']];
  const world = await buildWorld({
    stage, content, audio,
    emitTv: onTvEvent, emitPc: onPcEvent,
    onProgress: (p) => {
      loader.setProgress(p * 0.98);
      const s = status.filter(([k]) => p >= k).pop();
      if (s) loader.setStatus(s[1]);
    },
  });
  await audioReady;
  stage.scene = world.scene;

  const hudRoot = document.getElementById('hud');
  let hud = null;
  hud = createHud(hudRoot, {
    content,
    onNavigate: (route) => app.navigate(route),
    onAction: (action, data) => app.hudAction(action, data),
  });
  app = new App({ stage, world, hud, audio, content });
  const input = new Input(app, stage.renderer.domElement);
  app.input = input;
  stage.onResize = () => world.held.layout();
  world.held.layout();

  // warm up: render a couple of frames behind the loader so the first visible frame is not a hitch
  app.start();
  let last = performance.now() / 1000;
  const t0 = last;
  const now0 = () => performance.now() / 1000 - t0;
  for (let i = 0; i < 2; i += 1) { app.update(1 / 60, 0.016 * i); stage.render(0); }
  loader.setProgress(1);
  await loader.done();
  document.documentElement.classList.add('is-ready');
  if (localStorage.getItem('sound') === 'on') hud.setSound(false);   // browsers need a gesture: start muted

  // first gesture unlocks audio if the visitor had sound on last time
  const firstGesture = async () => {
    removeEventListener('pointerdown', firstGesture, true);
    removeEventListener('keydown', firstGesture, true);
    if (localStorage.getItem('sound') === 'on') await app.setSound(true);
  };
  addEventListener('pointerdown', firstGesture, true);
  addEventListener('keydown', firstGesture, true);

  let simTime = now0();
  let fps = 0;
  let fpsT = 0;
  let frames = 0;
  const loop = () => {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - last) * (window.__timeScale ?? 1);
    last = now;
    simTime += dt;
    const time = simTime;
    input.updateHover(dt);
    app.update(dt, time);
    stage.render(time);
    stage.adapt(dt, time);
    frames += 1;
    if (now - fpsT > 1) { fps = frames / (now - fpsT); frames = 0; fpsT = now; window.__fps = fps; }
  };
  stage.renderer.setAnimationLoop(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stage.renderer.setAnimationLoop(null); audio.context?.suspend(); }
    else { last = performance.now() / 1000; stage.renderer.setAnimationLoop(loop); if (audio.enabled) audio.context?.resume(); }
  });
  window.__app = app;
  window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  fallback(err?.message || String(err));
});
