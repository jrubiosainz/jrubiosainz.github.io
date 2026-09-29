import * as THREE from 'three';

// Big images are decoded off the main thread: fetch → createImageBitmap runs in the background, in parallel, as the
// files arrive. A plain <img> is decoded synchronously inside the GPU upload instead (≈2 s for an 8192² WebP, with
// the page frozen). ImageBitmaps ignore texture.flipY, so any flip happens while decoding. Once the GPU has its copy
// the decoded pixels are released: nothing in the room re-uploads these textures.
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const safari = /^((?!chrome|android).)*safari/i.test(ua) ? Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0) : 0;
const firefox = Number(ua.match(/Firefox\/(\d+)/)?.[1] ?? 0);
const BITMAPS = typeof createImageBitmap === 'function' && typeof fetch === 'function'
  && !(safari && safari < 17) && !(firefox && firefox < 98);

// fetched with CORS: a bitmap from the CDN can be read back (canvas getImageData) as well as uploaded
export async function decodeImage(url, { flipY = false } = {}) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const opts = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  if (flipY) opts.imageOrientation = 'flipY';
  return createImageBitmap(await res.blob(), opts);
}

function imageTexture(url, flipY) {
  return new THREE.TextureLoader().setCrossOrigin('anonymous').loadAsync(url).then((tex) => {
    tex.flipY = flipY;
    return tex;
  });
}

// Chrome has no fast path from an ImageBitmap into an sRGB texture (SRGB8_ALPHA8): 1.7 s for an 8192² atlas against
// 0.2 s into plain RGBA8. So sRGB images go up as raw RGBA8 bytes and one full-screen pass copies them into an sRGB
// render target: the shader decodes each texel to linear and the hardware encodes it back on write (the same bytes),
// then the mipmaps are built from linear values as they should be. The render target's texture is what materials
// get; it's filled by uploadTextures(), before the first frame.
const pending = [];

function srgbTarget(bitmap) {
  const rt = new THREE.WebGLRenderTarget(bitmap.width, bitmap.height, {
    depthBuffer: false, stencilBuffer: false, colorSpace: THREE.SRGBColorSpace,
  });
  const src = new THREE.Texture(bitmap);
  src.flipY = false;
  src.colorSpace = THREE.NoColorSpace;
  src.generateMipmaps = false;
  src.minFilter = THREE.NearestFilter;
  src.magFilter = THREE.NearestFilter;
  src.needsUpdate = true;
  pending.push({ rt, src, bitmap });
  return rt.texture;
}

let copier = null;
function copyPass() {
  if (copier) return copier;
  const material = new THREE.RawShaderMaterial({
    name: 'SrgbCopy',
    glslVersion: THREE.GLSL3,
    uniforms: { tSrc: { value: null } },
    vertexShader: 'in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float;
precision highp sampler2D;
uniform sampler2D tSrc;
out vec4 outColor;
void main() {
  vec4 s = texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0);
  vec3 lin = mix(s.rgb / 12.92, pow((s.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s.rgb));
  outColor = vec4(lin, s.a);
}`,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  copier = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
  return copier;
}

function runCopy(renderer, job) {
  const { scene, camera, material } = copyPass();
  material.uniforms.tSrc.value = job.src;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(job.rt);
  renderer.render(scene, camera);          // (the render target builds its mipmaps right after)
  renderer.setRenderTarget(prev);
  material.uniforms.tSrc.value = null;
  job.src.dispose();
  job.bitmap.close?.();
}

export async function loadTexture(url, { flipY = false, srgb = false } = {}) {
  if (BITMAPS) {
    try {
      const bitmap = await decodeImage(url, { flipY });
      if (srgb) return srgbTarget(bitmap);
      const tex = new THREE.Texture(bitmap);
      tex.flipY = false;
      tex.onUpdate = () => bitmap.close?.();
      tex.needsUpdate = true;
      return tex;
    } catch (err) {
      console.warn('texture: decoding with <img> instead', url, err);
    }
  }
  return imageTexture(url, flipY);
}

// Pixels for the CPU (a canvas read-back), `width` wide.
export async function loadPixels(url, width) {
  let src;
  if (BITMAPS) src = await decodeImage(url).catch(() => null);
  if (!src) {
    src = new Image();
    src.crossOrigin = 'anonymous';
    src.decoding = 'async';
    src.src = url;
    await src.decode();
  }
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  const h = Math.max(1, Math.round((width * h0) / w0));
  const c = document.createElement('canvas');
  c.width = width;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, width, h);
  src.close?.();
  return { w: width, h, data: ctx.getImageData(0, 0, width, h).data };
}

const nextFrame = () => new Promise((resolve) => {
  requestAnimationFrame(() => resolve());
  setTimeout(resolve, 60);                       // a background tab has no frames: keep going, slowly
});

// Hand every texture the scene samples to the GPU before the first frame (the sRGB copies first), yielding whenever
// a batch took about a frame's worth of time, so the loader keeps animating while the (large) atlases go up.
export async function uploadTextures(renderer, root, onProgress = () => {}) {
  const found = new Set();
  const add = (v) => { if (v?.isTexture) found.add(v); };
  root.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const k of Object.keys(m)) add(m[k]);
      for (const u of Object.values(m.uniforms || {})) {
        if (Array.isArray(u?.value)) u.value.forEach(add);
        else add(u?.value);
      }
    }
  });
  const list = [...found].filter((t) => t.version > 0 && t.image && !t.isRenderTargetTexture && !t.isVideoTexture
    && !t.isDepthTexture && !t.isCubeTexture);
  const jobs = pending.splice(0);
  const total = jobs.length + list.length;
  let done = 0;
  let t0 = performance.now();
  const step = async () => {
    done += 1;
    onProgress(done / total);
    if (performance.now() - t0 > 12) {
      await nextFrame();
      t0 = performance.now();
    }
  };
  for (const job of jobs) { runCopy(renderer, job); await step(); }
  for (const t of list) { renderer.initTexture(t); await step(); }
  return total;
}

// textures that arrive after the first frame (the lamp's bounce light): their sRGB copies, if any, right away
export function flushTextures(renderer) {
  for (const job of pending.splice(0)) runCopy(renderer, job);
}
