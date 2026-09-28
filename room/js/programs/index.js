import tv_loader from './tv_loader.js';
import tv_ident from './tv_ident.js';
import tv_forecast from './tv_forecast.js';
import tv_work from './tv_work.js';
import tv_teletext from './tv_teletext.js';
import tv_tape from './tv_tape.js';
import tv_nosignal from './tv_nosignal.js';
import tv_static from './tv_static.js';
import vcr_vfd from './vcr_vfd.js';
import cdp_lcd from './cdp_lcd.js';
import { createInstance } from './util.js';

export const programs = {
  tv_loader,
  tv_ident,
  tv_forecast,
  tv_work,
  tv_teletext,
  tv_tape,
  tv_nosignal,
  tv_static,
  vcr_vfd,
  cdp_lcd,
};

export function mountProgram(id, opts = {}) {
  const program = programs[id];
  if (!program) throw new Error(`Unknown programme: ${id}`);
  return createInstance(program, opts);
}

export default programs;
