import defaultContent from '../content.js';
import { TextMode } from './text.js';
import { PcSpeaker } from './speaker.js';
import { PcShell, codeForKey } from './shell.js';

const programme = {
  id: 'pc',
  title: 'vantec PC 286',
  size: [640, 400],
  mount({ canvas, ctx, width = 640, height = 400, audio = null, content = defaultContent, emit = () => {} }) {
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;
    const term = new TextMode(ctx, width, height);
    const speaker = new PcSpeaker(audio);
    const shell = new PcShell(term, content, emit, speaker);
    let booting = true;
    let bootStart = 0;
    let bootStep = -1;
    let stopped = false;
    let queuedRun = null;
    const meta = { vhs: false, noise: 0.08, brightness: 1, phase: 'boot', mode: 'boot' };

    function boot(t) {
      const elapsed = t - bootStart;
      const steps = [
        [0.00, () => { term.cls(); term.println('vantec BIOS v2.1  (C) 1987 vantec Systems', { bright: true }); }],
        [0.25, () => term.println('CPU: 80286 compatible core')],
        [0.55, () => term.println('Memory test: 640K OK')],
        [0.95, () => term.println('Extended memory 1024K OK')],
        [1.25, () => { term.println('Fixed disk C: 20MB ... OK'); emit({ type: 'drive', drive: 'C', busy: true }); emit({ type: 'sfx', name: 'hdd_seek' }); }],
        [1.55, () => { term.println('Floppy drive A: ready'); emit({ type: 'sfx', name: 'floppy_seek' }); }],
        [1.85, () => { term.println('Keyboard ... OK'); speaker.beep(800, .25); emit({ type: 'sfx', name: 'pc_beep' }); }],
        [2.25, () => finishBoot()],
      ];
      for (let i = bootStep + 1; i < steps.length && elapsed >= steps[i][0]; i += 1) {
        bootStep = i;
        steps[i][1]();
      }
    }

    function finishBoot() {
      if (!booting) return;
      booting = false;
      meta.phase = 'ready';
      meta.mode = 'shell';
      emit({ type: 'drive', drive: 'C', busy: false });
      term.cls();
      term.println('vantec Personal BASIC  Version 2.03');
      term.println('(C) Copyright vantec Systems 1987');
      term.println('60412 Bytes free');
      term.println('');
      term.println('Hi! Type ABOUT to start, or HELP.');
      term.println('READY');
      shell.prompt();
      if (queuedRun) {
        const command = queuedRun;
        queuedRun = null;
        shell.input({ type: 'run', command });
      }
    }

    bootStart = performance.now() / 1000;
    boot(bootStart);

    return {
      meta,
      frame(t, dt) {
        if (stopped) return;
        const seconds = t > 1000 ? t / 1000 : t;
        if (booting) boot(seconds);
        else shell.frame(seconds, dt > 1 ? dt / 1000 : dt);
        meta.mode = booting ? 'boot' : shell.metaMode();
        term.render(false, seconds);
      },
      input(ev) {
        if (stopped) return;
        if (ev.type === 'audio') {
          speaker.setAudio(ev.audio || null);
          return;
        }
        if (booting && ev.type === 'run') {
          queuedRun = ev.command;
          return;
        }
        if (booting && ev.type === 'key' && ev.down) {
          emit({ type: 'key-sound', code: ev.code || codeForKey(ev.key), down: true });
          finishBoot();
          return;
        }
        if (booting && ev.type === 'command') finishBoot();
        shell.input(ev);
      },
      stop() { stopped = true; },
    };
  },
};

export default programme;
