import * as THREE from 'three';
import { loadRoom } from '../scene/room.js';
import { createWindowView } from '../scene/window.js';
import { TvSet, PcScreen, SmallDisplay } from '../scene/screens.js';
import { TapeDeck } from '../scene/tapes.js';
import { Props } from '../scene/props.js';
import { HeldNotepad } from '../scene/notepad.js';
import { Picker } from '../scene/picker.js';
import { mergeStatic } from '../scene/merge.js';
import { loadReachy } from '../scene/reachy.js';
import { loadStackchan } from '../scene/stackchan.js';
import { LampLight } from '../scene/lamplight.js';
import { FineToy } from '../scene/finetoy.js';
import { LAMP_HEAD } from '../scene/room.js';
import { ownMaterial } from '../scene/materials.js';
import { uploadTextures } from '../scene/texload.js';
import { asset } from '../base.js';
import { paintNotepad, paintPhoto, paintDiscLabel } from '../paint/index.js';
import { workItems } from '../content.js';

const meshOf = (node) => {
  let m = null;
  node?.traverse((o) => { if (!m && o.isMesh) m = o; });
  return m;
};

function runtimeTexture(canvas, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';             // painted into canvases that become WebGL textures
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = asset(src);
  });
}

// Everything in the room that has behaviour. Hover-able things get their own material instances and are kept out
// of the static batches; the rest of the room collapses into a few draw calls.
export async function buildWorld({ stage, content, audio, onProgress = () => {}, emitTv, emitPc }) {
  const { renderer, camera } = stage;
  const reachyP = loadReachy().catch((err) => { console.warn('Reachy Mini unavailable', err); return null; });
  const stackP = loadStackchan().catch((err) => { console.warn('Stack-chan unavailable', err); return null; });
  // the photo is fetched alongside the room; the poster is painted when it arrives (it never holds up the first frame)
  const photoP = loadImage(content.site?.photo);
  const posterP = loadImage(content.site?.poster);
  // the city behind the window downloads and decodes alongside the room
  const winP = createWindowView({
    renderer, basePath: asset('assets/window/'), quality: stage.textures,
    onLightning: (delay) => audio.thunder(delay),
  });
  winP.catch(() => {});                      // (awaited below; this only keeps an early failure from going "unhandled")
  const room = await loadRoom({ renderer, quality: stage.textures, onProgress: (p) => onProgress(p * 0.85) });
  const scene = new THREE.Scene();
  scene.add(room.scene);
  scene.add(camera);
  const get = (n) => room.byName.get(n);

  // city + rain
  const win = await winP;
  get('Window_View')?.traverse((o) => { if (o.isMesh) { o.material = win.material; o.visible = true; o.renderOrder = -1; } });
  onProgress(0.9);

  // screens
  const tv = new TvSet({ renderer, mesh: meshOf(get('TV_Screen')), content, audio, emit: emitTv });
  const pc = new PcScreen({ renderer, mesh: meshOf(get('PC_Screen')), content, emit: emitPc });
  const vfd = new SmallDisplay({ mesh: meshOf(get('VCR_Display')), programId: 'vcr_vfd', content, strength: 2.4, fps: 20 });
  const lcd = new SmallDisplay({ mesh: meshOf(get('CDP_LCD')), programId: 'cdp_lcd', content, strength: 1.0, reflective: true, fps: 12 });
  // the baked print that stands in for the LCD in offline renders would cover the live one
  get('CDP_LCD_Print')?.traverse((o) => { o.visible = false; });

  // desk notepad sheet + the photo taped to the PC monitor
  const deskPad = document.createElement('canvas');
  deskPad.width = 1024;
  deskPad.height = 1700;
  const photo = document.createElement('canvas');
  photo.width = 512;
  photo.height = 630;
  const setRuntime = (slot, canvas) => {
    const tex = runtimeTexture(canvas, renderer);
    for (const s of room.specials) {
      if (s.slot !== slot) continue;
      s.mesh.material.uniforms.tRuntime.value = tex;
      s.mesh.material.uniforms.uRuntime.value = 1;
    }
    return tex;
  };
  const [img] = await Promise.all([photoP, paintNotepad(deskPad, content)]);
  await paintPhoto(photo, img);
  const deskPadTex = setRuntime('notepad', deskPad);
  setRuntime('photo', photo);
  posterP.then((posterImg) => { if (posterImg) setRuntime('poster', posterImg); });
  // printed side of the CD
  const discMesh = meshOf(get('CDP_Disc'));
  if (discMesh?.material?.uniforms?.tLabel) {
    const lab = document.createElement('canvas');
    lab.width = 512;
    lab.height = 512;
    await paintDiscLabel(lab, content.music);
    const t = new THREE.CanvasTexture(lab);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    discMesh.material.uniforms.tLabel.value = t;
    discMesh.material.uniforms.uLabel.value = 1;
  }

  const tapes = new TapeDeck({ room, items: workItems(content), groups: content.work.groups.length, renderer, audio });
  await tapes.paint();
  const props = new Props({ room, audio });
  const held = new HeldNotepad({ camera, content, renderer, audio });
  await held.paint(-1);

  // Reachy Mini (lit live, never merged): it stands where the pencil cup was
  const reachy = await reachyP;
  if (reachy) scene.add(reachy.root);
  // Stack-chan (lit live too): where the VCR remote was
  const stack = await stackP;
  if (stack) scene.add(stack.root);
  // the diorama on the dresser and the aimable desk lamp
  const fine = new FineToy({ room, audio });
  const lamp = new LampLight({ room, quality: stage.textures });

  // picking --------------------------------------------------------------------------------------------------
  const picker = new Picker(camera);
  // Reachy: a body cylinder and a head box (awake height), tight enough to leave the lamp switch next to it alone
  if (reachy) {
    const info = { label: 'REACHY', action: 'reachy' };
    picker.addProxy('reachy', reachy.root, new THREE.CylinderGeometry(0.08, 0.08, 0.19, 20), info, new THREE.Vector3(0, 0.095, 0));
    picker.addProxy('reachy', reachy.root, new THREE.BoxGeometry(0.2, 0.17, 0.19), info, new THREE.Vector3(0.011, 0.23, 0));
  }
  // Stack-chan: its base, and its head (the head's proxy rides on the tilt servo, so it follows the head)
  if (stack) {
    const info = { label: 'STACK-CHAN', action: 'stackchan' };
    const bb = stack.rig.base_box || { center: [0, 0, 0.015], size: [0.056, 0.046, 0.03] };
    picker.addProxy('stackchan', stack.root, new THREE.BoxGeometry(bb.size[0], bb.size[2], bb.size[1]), info,
      new THREE.Vector3(bb.center[0], bb.center[2], -bb.center[1]));
    const hb = stack.rig.head_box;
    const hc = new THREE.Vector3(hb.center[0], hb.center[2], -hb.center[1]);
    const tp = new THREE.Vector3(stack.rig.tilt_pivot[0], stack.rig.tilt_pivot[2], -stack.rig.tilt_pivot[1]);
    picker.addProxy('stackchan', stack.tiltPivot, new THREE.BoxGeometry(hb.size[0] + 0.008, hb.size[2] + 0.008, hb.size[1] + 0.01),
      { ...info, part: 'head' }, hc.sub(tp));
  }
  const G = (name, node, info, opts) => picker.addGroup(name, get(node), info, opts);
  G('tv', 'TV_Root', { label: 'ZOOM TV', action: 'tv' });
  G('vcr', 'VCR_Root', { label: 'VCR', action: 'vcr' });
  G('pc', 'PC_Monitor_Root', { label: 'USE COMPUTER', action: 'pc' });
  G('pccase', 'PC_Case_Root', { label: 'USE COMPUTER', action: 'pc' });
  G('keyboard', 'PC_Keyboard_Root', { label: 'USE COMPUTER', action: 'pc' });
  G('cdp', 'CDP_Root', { label: 'CD PLAYER', action: 'cd' });
  G('lamp', 'Lamp_Root', { label: 'LAMP', action: 'lamp' });
  G('phone', 'Phone_Root', { label: 'PHONE', action: 'phone' });
  G('notepad', 'Notepad_Root', { label: 'WORK · NOTEPAD', action: 'work' });
  G('tapes', 'Tapes_Root', { label: 'TAPES', action: 'tapes' });
  G('window', 'Window_View', { label: 'LOOK OUTSIDE', action: 'window' }, { pad: 0.002 });
  if (fine.ok) G('fine', 'Fine_Root', { label: 'THIS IS FINE', action: 'fine' }, { pad: 0.004 });
  // the curtains hang in front of the glass: they catch the pointer instead of the window behind them
  G('curtainL', 'Curtain_L', { action: 'none' }, { pad: 0 });
  G('curtainR', 'Curtain_R', { action: 'none' }, { pad: 0 });
  for (let i = 0; i <= 6; i += 1) {
    const labels = ['POWER', 'CH 1 · ABOUT', 'CH 2 · WORK', 'CH 3 · POSTS', 'UNDERSCAN', 'H/V DELAY', 'BLUE ONLY'];
    picker.addFine(get(i === 0 ? 'TV_Btn_Power' : `TV_Btn_${i}`), { group: 'tv', action: 'tvbtn', index: i, label: labels[i] });
  }
  ['VOLUME', 'CONTRAST', 'BRIGHT'].forEach((l, i) => picker.addFine(get(`TV_Knob_${i + 1}`), { group: 'tv', action: 'knob', index: i + 1, label: l }));
  for (const [n, l] of [['Eject', 'EJECT'], ['FF', 'FAST FORWARD'], ['Play', 'PLAY'], ['Power', 'POWER'], ['Rec', 'REC'], ['Rew', 'REWIND'], ['Stop', 'STOP']]) {
    picker.addFine(get(`VCR_Btn_${n}`), { group: 'vcr', action: 'vcrbtn', button: n.toLowerCase(), label: `VCR · ${l}` });
  }
  for (const [n, l] of [['Next', 'NEXT'], ['Play', 'PLAY / PAUSE'], ['Prev', 'PREVIOUS'], ['Stop', 'STOP']]) {
    picker.addFine(get(`CDP_Btn_${n}`), { group: 'cdp', action: 'cdbtn', button: n.toLowerCase(), label: `CD · ${l}` });
  }
  picker.addFine(get('Lamp_Switch'), { group: 'lamp', action: 'lamp', label: 'LAMP' });
  for (const t of tapes.tapes) {
    const title = (t.item.title || '').toUpperCase();
    picker.addFine(t.anchor, { group: 'tapes', action: 'tape', tape: t, label: `TAPE · ${title}` });
  }
  for (const [name, o] of room.byName) {
    if (name.startsWith('Key_') && o.userData?.code) picker.addFine(o, { group: 'keyboard', action: 'key', code: o.userData.code, label: 'KEYBOARD' });
  }

  // hover glow targets: own material instances (shared textures) for each hover-able prop
  const hoverSets = new Map();
  const own = (key, node) => {
    if (!node) return;
    const mats = hoverSets.get(key) || [];
    node.traverse((o) => {
      if (!o.isMesh || o.userData.pickProxy || !o.material?.uniforms?.uHover) return;
      if (!o.userData.ownedHover) {
        o.material = ownMaterial(o.material);
        o.userData.ownedHover = true;
      }
      mats.push(o.material);
    });
    hoverSets.set(key, mats);
  };
  for (const t of tapes.tapes) own(`tape:${t.index}`, t.anchor);
  for (let i = 0; i <= 6; i += 1) own(`tvbtn:${i}`, get(i === 0 ? 'TV_Btn_Power' : `TV_Btn_${i}`));
  for (let i = 1; i <= 3; i += 1) own(`knob:${i}`, get(`TV_Knob_${i}`));
  for (const n of ['Eject', 'FF', 'Play', 'Power', 'Rec', 'Rew', 'Stop']) own(`vcrbtn:${n.toLowerCase()}`, get(`VCR_Btn_${n}`));
  for (const n of ['Next', 'Play', 'Prev', 'Stop']) own(`cdbtn:${n.toLowerCase()}`, get(`CDP_Btn_${n}`));
  own('group:cdp', get('CDP_Root'));
  own('group:lamp', get('Lamp_Root'));
  own('group:phone', get('Phone_Root'));
  own('group:notepad', get('Notepad_Root'));
  if (reachy) hoverSets.set('group:reachy', reachy.materials);
  if (stack) hoverSets.set('group:stackchan', stack.materials);
  own('group:fine', get('Fine_Root'));

  // occluders: the plant sits between the desk and the PC; it dissolves while the camera is inside it.
  // Its meshes get their own materials (one per source material), so they merge into their own batches.
  const occluders = [];
  const plant = get('Plant_Root');
  if (plant) {
    plant.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(plant);
    const cache = new Map();
    plant.traverse((o) => {
      if (!o.isMesh || !o.material?.uniforms?.uFade) return;
      if (!cache.has(o.material)) cache.set(o.material, ownMaterial(o.material));
      o.material = cache.get(o.material);
    });
    occluders.push({ name: 'plant', box, materials: [...cache.values()], fade: 1 });
  }

  // static batching: everything else
  const keep = new Set();
  const keepTree = (node) => node?.traverse((o) => { if (o.isMesh) keep.add(o); });
  for (const t of tapes.tapes) keepTree(t.anchor);
  ['CDP_Root', 'Lamp_Root', 'Phone_Root', 'Notepad_Root', 'PC_PowerSwitch', 'Fine_Root'].forEach((n) => keepTree(get(n)));
  for (const p of props.presses.values()) keepTree(p.obj);
  for (const k of props.knobs) keepTree(k?.obj);
  const batch = mergeStatic(room.scene, keep);

  // pointer -> TV picture coordinates (programme space, y down), honouring the monitor's over/underscan
  const tvMesh = meshOf(get('TV_Screen'));
  const ray = new THREE.Raycaster();
  const tvScreenHit = (ndc) => {
    if (!tvMesh) return null;
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(tvMesh, false)[0];
    if (!h?.uv) return null;
    const sc = tv.material.uniforms.uScale.value;
    const x = (h.uv.x - 0.5) / sc + 0.5;
    const y = (h.uv.y - 0.5) / sc + 0.5;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x, y] : null;
  };
  picker.addFine(tvMesh, { group: 'tv', action: 'tv', label: 'ZOOM TV' });

  // the aimed lamp's shadows: not from its own head, the window or anything see-through (glass, acrylic flames)
  lamp.exclude(get('Window_View'), get('Lamp_Joint'), ...LAMP_HEAD.map(get));
  scene.traverse((o) => { if (o.isMesh && (o.material?.transparent || o.material?.blending === THREE.AdditiveBlending)) lamp.exclude(o); });

  // behind the loader: the textures go up to the GPU a few per frame, then every material compiles (on the driver's
  // threads), so the first visible frame has nothing left to do. (Uploading while the shaders compile is slower:
  // both queue on the same GPU process.)
  onProgress(0.92);
  await uploadTextures(renderer, scene, (f) => onProgress(0.92 + 0.07 * f));
  await renderer.compileAsync(scene, camera);
  onProgress(1);
  // after the first frame: what the room can do without for a moment
  const loadDeferred = () => room.deferred();
  return { room, scene, win, tv, pc, vfd, lcd, tapes, props, held, picker, hoverSets, batch, deskPad, deskPadTex, get, tvScreenHit, occluders, reachy, stack, fine, lamp, loadDeferred };
}
