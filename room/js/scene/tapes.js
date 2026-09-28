import * as THREE from 'three';
import { paintSpine, paintCover, paintSleeveTint, paintCassetteLabel } from '../paint/index.js';

// ---------------------------------------------------------------------------------------------------------------
// The tape stacks and the VCR. Each Tape_i_Anchor holds a (lightmapped) sleeve and a (dynamic) cassette. Hover pulls
// the tape a little out of its stack; a click slides it out, the cassette leaves its sleeve and flies into the VCR
// slot (the flap swings in, motor sound), the sleeve goes back. Eject reverses it all.
// ---------------------------------------------------------------------------------------------------------------
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

function canvasTexture(canvas, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const FILLERS = [
  { id: 'blank-1', title: 'Do Not Tape Over', years: '1996', visual: 'starfield', tape: { color: '#d8d0bf', ink: '#1b1b1b', style: 'band', mark: '!' },
    description: 'An unlabelled recording found at the bottom of the stack.', body: 'Late-night television, recorded by accident. Somebody pressed REC and went to bed.' },
  { id: 'blank-2', title: 'Rain, Vol. 2', years: '1995', visual: 'oscilloscope', tape: { color: '#58708f', ink: '#ffffff', style: 'stripe', mark: '~' },
    description: 'Forty minutes of rain on the window, recorded for no reason at all.', body: 'Useful for sleeping. Less useful for anything else.' },
  { id: 'blank-3', title: 'Blank E-180', years: '—', visual: 'terminal', tape: { color: '#efe7d7', ink: '#20242c', style: 'band', mark: '·' },
    description: 'A blank tape, still waiting for something worth recording.', body: 'Add another item to work.groups in content.js and it will appear on this tape.' },
];

export class TapeDeck {
  // Blender builds the stacks six tapes high: tapes 1–6 on the left (1 on top), 7–12 on the right. With as many work
  // groups as stacks, each group gets its own stack (career on the left, projects on the right); blank tapes fill
  // the rest. Otherwise the items simply run from tape 1.
  constructor({ room, items, groups = 1, renderer, audio, onInsert, onEject }) {
    this.room = room;
    this.audio = audio;
    this.renderer = renderer;
    this.onInsert = onInsert;
    this.onEject = onEject;
    this.tapes = [];
    this.inserted = null;     // tape object
    this.busy = null;         // running animation
    this.hovered = null;
    const get = (n) => room.byName.get(n);
    const vcr = get('VCR_Root');
    this.vcr = vcr;
    this.door = get('VCR_Door');
    this.doorQ = this.door ? this.door.quaternion.clone() : null;
    this.doorAngle = 0;
    this.entry = get('VCR_TapeEntry');
    this.inside = get('VCR_TapeInside');
    let slots = 0;
    while (get(`Tape_${slots + 1}_Anchor`)) slots += 1;
    const PER_STACK = 6;
    const stacks = Math.ceil(slots / PER_STACK);
    const assign = new Array(slots).fill(-1);            // tape slot -> index in items
    const byGroup = [];
    items.forEach((it, idx) => {
      let g = byGroup.find((x) => x.name === it.group);
      if (!g) byGroup.push(g = { name: it.group, list: [] });
      g.list.push(idx);
    });
    if (groups > 1 && byGroup.length === stacks) {
      byGroup.forEach((g, st) => g.list.slice(0, PER_STACK).forEach((idx, k) => { assign[st * PER_STACK + k] = idx; }));
    } else items.slice(0, slots).forEach((_, idx) => { assign[idx] = idx; });
    let blank = 0;
    let i = 1;
    for (;;) {
      const anchor = get(`Tape_${i}_Anchor`);
      if (!anchor) break;
      const cassette = get(`Tape_${i}_Cassette`);
      const itemIndex = assign[i - 1];
      const item = itemIndex >= 0 ? items[itemIndex] : { ...FILLERS[blank++ % FILLERS.length], filler: true };
      const parts = [];
      anchor.traverse((o) => { if (o.isMesh) parts.push(o); });
      // the exported cassette sits 2 mm high in its sleeve (its reel windows show through the cover)
      cassette.position.y -= 0.0025;
      cassette.updateMatrix();
      const tape = {
        index: i, item, itemIndex, stack: Math.floor((i - 1) / PER_STACK), anchor, cassette, parts,
        home: anchor.position.clone(),
        cassetteHome: { pos: cassette.position.clone(), quat: cassette.quaternion.clone() },
        pull: 0, pullTarget: 0,
        reach: anchor.parent.position.z + anchor.position.z < -0.2 ? 0.25 : 0.12,
        state: 'shelf',
      };
      parts.forEach((m) => { m.userData.tape = tape; m.userData.interactive = 'tape'; });
      this.tapes.push(tape);
      i += 1;
    }
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  get count() { return this.tapes.length; }

  // the tape that carries items[i] (work notepad rows and the TV listing count items, not tapes)
  forItem(i) { return this.tapes.find((t) => t.itemIndex === i) || null; }

  async paint() {
    const r = this.renderer;
    await Promise.all(this.tapes.map(async (tape) => {
      const find = (suffix) => this.room.byName.get(`Tape_${tape.index}_${suffix}`);
      const setRuntime = (node, canvas) => {
        if (!node) return;
        const tex = canvasTexture(canvas, r);
        node.traverse((o) => {
          if (!o.isMesh || !o.material?.uniforms?.tRuntime) return;
          o.material.uniforms.tRuntime.value = tex;
          o.material.uniforms.uRuntime.value = 1;
          if (o.material.uniforms.uTint) o.material.uniforms.uTint.value.setRGB(1, 1, 1);
        });
      };
      const spine = makeCanvas(1024, 144);
      await paintSpine(spine, tape.item, tape.index - 1);
      setRuntime(find('Spine'), spine);
      const cover = makeCanvas(1024, 600);
      await paintCover(cover, tape.item, tape.index - 1);
      setRuntime(find('Cover'), cover);
      const label = makeCanvas(768, 96);
      await paintCassetteLabel(label, tape.item, tape.index - 1);
      setRuntime(find('CassetteLabel'), label);
      const sleeve = find('Sleeve');
      const tint = new THREE.Color(paintSleeveTint(tape.item));
      sleeve?.traverse((o) => {
        if (!o.isMesh || !o.material?.uniforms?.uTint) return;
        o.material.uniforms.uTint.value.copy(tint);
        o.material.uniforms.uRuntime.value = 0.5;
      });
    }));
  }

  setHover(tape) {
    if (this.hovered === tape) return;
    if (this.hovered) this.hovered.pullTarget = 0;
    this.hovered = tape;
    if (tape && tape.state === 'shelf' && !this.busy) {
      tape.pullTarget = 1;
      this.audio?.play('tape_pick', { volume: 0.18, rate: 1.25 });
    }
  }

  // world pose helpers --------------------------------------------------------------------------------------------
  _worldPose(obj) {
    obj.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    obj.matrixWorld.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }

  // Put a child at a world pose without reparenting.
  _setWorld(obj, pos, quat) {
    const parent = obj.parent;
    parent.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const m = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1)).premultiply(inv);
    m.decompose(obj.position, obj.quaternion, new THREE.Vector3());
  }

  _anchorOffset(tape, pull) { return pull < 0.5 ? pull * 0.045 : 0.0225 + (pull - 0.5) * 2 * (tape.reach - 0.0225); }

  _cassetteAt(tape, pull) {
    const savedPos = tape.cassette.position.clone();
    const savedQuat = tape.cassette.quaternion.clone();
    tape.cassette.position.copy(tape.cassetteHome.pos);
    tape.cassette.quaternion.copy(tape.cassetteHome.quat);
    tape.anchor.position.copy(tape.home);
    tape.anchor.position.z += this._anchorOffset(tape, pull);
    const pose = this._worldPose(tape.cassette);
    tape.cassette.position.copy(savedPos);
    tape.cassette.quaternion.copy(savedQuat);
    tape.anchor.position.copy(tape.home);
    tape.anchor.position.z += this._anchorOffset(tape, tape.pull);
    return pose;
  }

  _outOfSleeve(pose) {
    return {
      pos: pose.pos.clone().add(new THREE.Vector3(-0.215, 0, 0).applyQuaternion(pose.quat)).add(new THREE.Vector3(0, 0.055, 0.03)),
      quat: pose.quat.clone(),
    };
  }

  _vcrPose(which) {
    const node = which === 'inside' ? this.inside : this.entry;
    const p = this._worldPose(node || this.vcr);
    const vq = this._worldPose(this.vcr).quat;
    return { pos: p.pos, quat: vq };
  }

  insert(tape) {
    if (!tape || this.busy) return false;
    if (this.inserted === tape) { this.onInsert?.(tape, { already: true }); return true; }
    if (this.inserted) {
      const next = tape;
      this.eject(() => this.insert(next));
      return true;
    }
    const a = this.audio;
    tape.state = 'flying';
    tape.pullTarget = 0;
    const start = this._cassetteAt(tape, 1);
    const lift = this._outOfSleeve(start);          // the sleeve opening is on the cassette's local -X side
    const entry = this._vcrPose('entry');
    const inside = this._vcrPose('inside');
    const pre = { pos: entry.pos.clone().add(new THREE.Vector3(0, 0.035, 0.16)), quat: entry.quat.clone() };
    a?.play('tape_pick');
    this.busy = {
      t: 0,
      tape,
      steps: [
        { d: 0.34, f: (k) => { tape.pull = Math.max(tape.pull, easeOut(k)); this._applyPull(tape); } },
        { d: 0.42, f: (k) => this._lerpPose(tape.cassette, start, lift, ease(k), 0.0) },
        { d: 0.74, f: (k) => {
          tape.pull = 1 - ease(Math.min(1, k * 1.4));
          this._applyPull(tape);
          this._lerpPose(tape.cassette, lift, pre, ease(k), 0.07);
          if (k >= 1) a?.play('tape_place', { volume: 0.35 });
        } },
        { d: 0.08, f: (k) => { if (k >= 1) a?.play('vcr_insert'); } },
        { d: 0.62, f: (k) => { this._lerpPose(tape.cassette, pre, inside, ease(k), 0); this.doorAngle = Math.min(1, k * 2.5); } },
        { d: 0.36, f: (k) => { this.doorAngle = 1 - easeOut(k); if (k >= 1) tape.cassette.visible = false; } },
        { d: 0.01, f: () => {
          tape.state = 'inside';
          this.inserted = tape;
          a?.vcrMotor(true, { volume: 0.8 });
          a?.play('vcr_play', { delay: 0.05 });
          this.onInsert?.(tape, {});
        } },
      ],
    };
    return true;
  }

  eject(then) {
    const tape = this.inserted;
    if (!tape || this.busy) return false;
    const a = this.audio;
    a?.vcrMotor(false);
    a?.play('vcr_eject');
    tape.cassette.visible = true;
    const inside = this._vcrPose('inside');
    const entry = this._vcrPose('entry');
    const pre = { pos: entry.pos.clone().add(new THREE.Vector3(0, 0.035, 0.16)), quat: entry.quat.clone() };
    const home = this._cassetteAt(tape, 1);
    const lift = this._outOfSleeve(home);
    this.inserted = null;
    this.onEject?.(tape);
    this.busy = {
      t: 0,
      tape,
      steps: [
        { d: 0.5, f: (k) => { this.doorAngle = Math.min(1, k * 3); } },
        { d: 0.55, f: (k) => this._lerpPose(tape.cassette, inside, pre, ease(k), 0) },
        { d: 0.2, f: (k) => { this.doorAngle = 1 - easeOut(k); } },
        { d: 0.74, f: (k) => {
          tape.pull = ease(Math.min(1, k * 1.5));
          this._applyPull(tape);
          this._lerpPose(tape.cassette, pre, lift, ease(k), 0.07);
        } },
        { d: 0.42, f: (k) => this._lerpPose(tape.cassette, lift, home, ease(k), 0) },
        { d: 0.34, f: (k) => {
          tape.cassette.position.copy(tape.cassetteHome.pos);
          tape.cassette.quaternion.copy(tape.cassetteHome.quat);
          tape.pull = 1 - ease(k);
          this._applyPull(tape);
          if (k >= 1) a?.play('tape_place');
        } },
        { d: 0.01, f: () => {
          tape.state = 'shelf';
          tape.pull = 0;
          this._applyPull(tape);
        } },
      ],
      then,
    };
    return true;
  }

  _applyPull(t) {
    t.anchor.position.copy(t.home);
    t.anchor.position.z += this._anchorOffset(t, t.pull);
    t.anchor.updateMatrixWorld(true);
  }

  _lerpPose(obj, a, b, k, arc) {
    this._v.lerpVectors(a.pos, b.pos, k);
    this._v.y += Math.sin(Math.PI * k) * arc;
    this._q.slerpQuaternions(a.quat, b.quat, k);
    // a small, natural wobble mid-flight
    if (arc > 0) this._q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(Math.PI * k) * 0.12, 0, Math.sin(Math.PI * k * 2) * 0.05)));
    this._setWorld(obj, this._v, this._q);
  }

  update(dt) {
    // hover pull-out (spring), except for the tape being animated
    for (const t of this.tapes) {
      if (this.busy?.tape === t) continue;
      t.pull += (t.pullTarget * 0.5 - t.pull) * (1 - Math.exp(-dt * 14));
      this._applyPull(t);
    }
    if (this.busy) {
      const b = this.busy;
      b.t += dt;
      let acc = 0;
      let done = true;
      for (const s of b.steps) {
        const k = clamp01((b.t - acc) / s.d);
        if (b.t >= acc && !s.done) {
          s.f(k);
          if (k >= 1) s.done = true;
        }
        acc += s.d;
        if (!s.done) { done = false; break; }
      }
      if (done) {
        const cb = b.then;
        this.busy = null;
        cb?.();
      }
    }
    if (this.door && this.doorQ) {
      this.door.quaternion.copy(this.doorQ).multiply(this._q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.doorAngle * 1.35));
    }
  }
}
