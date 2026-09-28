import * as THREE from 'three';
import { paintNotepad } from '../paint/index.js';
import { paperMaterial } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// The legal pad you pick up for WORK: a camera-attached, slightly curled sheet on a cardboard back that rises from
// below the frame. Rows are hit-tested in canvas pixels (paintNotepad returns their rects).
// ---------------------------------------------------------------------------------------------------------------
const W = 0.216;
const H = 0.356;
const CW = 1024;
const CH = 1700;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function curledPlane(w, h, curl) {
  const g = new THREE.PlaneGeometry(w, h, 6, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i);
    const x = p.getX(i);
    const v = (h / 2 - y) / h;                 // 0 at the binding, 1 at the bottom edge
    p.setZ(i, curl * v * v + 0.004 * Math.sin(x / w * Math.PI) * v);
  }
  g.computeVertexNormals();
  return g;
}

export class HeldNotepad {
  constructor({ camera, content, renderer, audio }) {
    this.camera = camera;
    this.content = content;
    this.audio = audio;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.rows = [];
    this.highlight = -1;
    this.group = new THREE.Group();
    this.group.name = 'HeldNotepad';
    this.group.visible = false;
    this.sheet = new THREE.Mesh(curledPlane(W, H, 0.012), paperMaterial(this.texture));
    const back = new THREE.Mesh(curledPlane(W + 0.004, H + 0.004, 0.010), new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0.075, 0.052, 0.03) } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol, 1.0); }',
      side: THREE.DoubleSide,
    }));
    back.position.set(0.001, -0.002, -0.003);
    const bind = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, 0.026, 0.006), new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0.16, 0.03, 0.025) } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uCol; varying vec3 vN; void main(){ gl_FragColor = vec4(uCol * (0.55 + 0.45 * max(vN.y, 0.0) + 0.25 * max(-vN.x, 0.0)), 1.0); }',
    }));
    bind.position.set(0, H / 2 + 0.006, 0.0015);
    this.pivot = new THREE.Group();
    this.pivot.add(back, this.sheet, bind);
    // the pad hangs from its binding: pivot at the top edge
    this.pivot.children.forEach((c) => { c.position.y -= H / 2; });
    this.group.add(this.pivot);
    // drawn over the room, but it must still write depth: depth of field reads it to keep the pad in focus
    // (with the depth test disabled, GL writes no depth at all)
    [back, this.sheet, bind].forEach((m, i) => {
      m.renderOrder = 900 + i;
      m.material.depthTest = true;
      m.material.depthFunc = THREE.AlwaysDepth;
      m.material.depthWrite = true;
      m.frustumCulled = false;
    });
    camera.add(this.group);
    this.t = 0;
    this.target = 0;
    this.dist = 0.75;
    this.ray = new THREE.Raycaster();
    this.layout();
  }

  async paint(highlight = this.highlight) {
    this.highlight = highlight;
    const token = (this._token = (this._token || 0) + 1);
    const rows = await paintNotepad(this.canvas, this.content, { highlight });
    if (token !== this._token) return;
    this.rows = rows;
    this.texture.needsUpdate = true;
  }

  get shown() { return this.target > 0; }
  get visibleAmount() { return this.t; }

  show(on) {
    if ((this.target > 0) === on) return;
    this.target = on ? 1 : 0;
    this.audio?.play(on ? 'notepad_pick' : 'notepad_put');
    if (on) this.group.visible = true;
  }

  layout() {
    const cam = this.camera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const aspect = cam.aspect || 1.6;
    const narrow = aspect < 0.9;
    const fill = narrow ? 0.72 : 0.9;
    this.dist = H / (fill * 2 * tan);
    const halfH = this.dist * tan;
    const halfW = halfH * aspect;
    const x = narrow ? 0 : halfW - W / 2 - halfW * 0.07;
    this.rest = new THREE.Vector3(Math.max(x, 0), halfH - (2 * halfH - H) * (narrow ? 0.12 : 0.45), -this.dist);
    this.low = new THREE.Vector3(this.rest.x + 0.02, -halfH - 0.02, -this.dist * 0.92);
  }

  // Pointer in NDC -> row index or -1.
  pick(ndc) {
    if (this.t < 0.95 || !this.group.visible) return -1;
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.sheet, false)[0];
    if (!hit?.uv) return -1;
    const px = hit.uv.x * CW;
    const py = (1 - hit.uv.y) * CH;
    const row = this.rows.find((r) => px >= r.x - 30 && px <= r.x + r.w + 30 && py >= r.y - 6 && py <= r.y + r.h + 6);
    return row ? row.index : -2;         // -2: on the pad but not on a row
  }

  update(dt, time) {
    const speed = this.target > this.t ? 1.35 : 1.9;
    this.t = THREE.MathUtils.clamp(this.t + Math.sign(this.target - this.t) * dt * speed, 0, 1);
    if (this.t <= 0 && this.target === 0) { this.group.visible = false; return; }
    const k = ease(this.t);
    this.group.position.lerpVectors(this.low, this.rest, k);
    // hand-held: tiny breathing sway, tilt settles as it rises
    const sway = Math.sin(time * 0.9) * 0.004 + Math.sin(time * 1.7 + 1.1) * 0.002;
    this.group.position.x += sway * 0.4;
    this.group.position.y += Math.sin(time * 1.3) * 0.0015;
    this.pivot.rotation.set(THREE.MathUtils.lerp(-0.62, -0.05, k), THREE.MathUtils.lerp(-0.25, -0.06, k), THREE.MathUtils.lerp(0.16, 0.03, k) + sway * 0.8);
  }
}
