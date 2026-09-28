import * as THREE from 'three';
import { Post } from '../scene/post.js';

// ---------------------------------------------------------------------------------------------------------------
// Renderer, camera, post chain, quality tier and adaptive resolution.
// ---------------------------------------------------------------------------------------------------------------
export function detectQuality(renderer) {
  const q = new URLSearchParams(location.search).get('q');
  if (q) return q;
  const gl = renderer.getContext();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const mem = navigator.deviceMemory || 8;
  // 'high' uploads ~1 GB of textures (8192² albedo + six 4096² lightmaps with mips): keep it for GPUs that cope.
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  const weak = /swiftshader|llvmpipe|software|basic render|mali|adreno|powervr|(intel(?!.*\barc\b))/i.test(gpu);
  if (coarse && small) return 'mobile';
  if (maxTex < 8192 || mem < 6 || coarse || weak) return 'medium';
  return 'high';
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export class Stage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x07080d, 1);
    r.domElement.className = 'stage-canvas';
    r.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(r.domElement);
    this.quality = detectQuality(r);
    this.textures = this.quality === 'high' ? 'high' : 'mobile';
    this.maxPR = { high: 2, medium: 1.5, mobile: 1.25, low: 1 }[this.quality] ?? 1.5;
    this.pr = Math.min(devicePixelRatio || 1, this.maxPR);
    this.minPR = Math.min(this.pr, 0.75);
    this.camera = new THREE.PerspectiveCamera(26.4, 1.6, 0.02, 60);
    this.post = new Post(r, { quality: this.quality === 'mobile' || this.quality === 'low' ? 'low' : 'high' });
    this.scene = null;
    this.frameTimes = [];
    this.lastAdapt = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // Authored views use a vertical fov for 16:10. Keep the horizontal framing on narrower screens (up to a limit),
  // so the desk still fits on a laptop or a phone held sideways; portrait crops the sides instead.
  adaptFov(vfov) {
    const aspect = this.camera.aspect;
    if (aspect >= 1.6) return vfov;
    const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * 1.6);
    const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 1.0)));
    return Math.min(v, vfov * 1.75);
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.pr);
    this.onResize?.(w, h);
  }

  // Drop resolution when the GPU cannot keep up (median over ~1.5 s), raise it again when there is headroom.
  adapt(dt, now) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.lastAdapt < 2.5 || this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const top = Math.min(devicePixelRatio || 1, this.maxPR);
    let next = this.pr;
    if (p50 > 1 / 42 && this.pr > this.minPR) next = Math.max(this.minPR, this.pr - 0.25);
    else if (p50 < 1 / 58 && this.pr < top) next = Math.min(top, this.pr + 0.25);
    if (next !== this.pr) {
      this.pr = next;
      this.resize();
      this.frameTimes.length = 0;
    }
    this.lastAdapt = now;
  }

  render(time) {
    if (this.scene) this.post.render(this.scene, this.camera, time);
  }
}
