import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import { asset } from '../base.js';

// One Draco decoder for every glTF in the room (the room, Reachy, Stack-chan): one wasm download, one worker pool.
let shared = null;

export function dracoLoader() {
  if (!shared) {
    shared = new DRACOLoader();
    shared.setDecoderPath(asset('vendor/three/draco/'));
  }
  return shared;
}
