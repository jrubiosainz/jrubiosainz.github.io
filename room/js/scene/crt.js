import * as THREE from 'three';
import { LIGHTS } from './materials.js';

// ---------------------------------------------------------------------------------------------------------------
// Phosphor persistence: the programme canvas is uploaded every frame and blended with the previous frame
// into a small render target (ping-pong). Mipmaps of the result give the halation / glow blur for free.
// ---------------------------------------------------------------------------------------------------------------
const quadGeo = new THREE.PlaneGeometry(2, 2);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class Phosphor {
  constructor(renderer, canvas, { decay = 0.35, mono = false } = {}) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.flipY = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    const opts = {
      type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    };
    this.a = new THREE.WebGLRenderTarget(canvas.width, canvas.height, opts);
    this.b = new THREE.WebGLRenderTarget(canvas.width, canvas.height, opts);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tCur: { value: this.tex }, tPrev: { value: this.b.texture }, uDecay: { value: decay }, uMono: { value: mono ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tCur; uniform sampler2D tPrev; uniform float uDecay; uniform float uMono;
        varying vec2 vUv;
        void main(){
          vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
          vec3 c = texture2D(tCur, uv).rgb;
          vec3 p = texture2D(tPrev, vUv).rgb * uDecay;
          gl_FragColor = vec4(max(c, p), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const q = new THREE.Mesh(quadGeo, this.mat);
    q.frustumCulled = false;
    this.scene.add(q);
  }

  get texture() { return this.b.texture; }

  update() {
    this.tex.needsUpdate = true;
    this.mat.uniforms.tPrev.value = this.b.texture;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.a);
    r.render(this.scene, quadCam);
    r.setRenderTarget(prev);
    [this.a, this.b] = [this.b, this.a];
  }

  dispose() { this.a.dispose(); this.b.dispose(); this.tex.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------
// CRT surface. The raster is a curved mesh (UV 0..1); this shader adds overscan, H/V delay, blue-only,
// scanlines + aperture grille (faded by screen-space frequency to avoid moire), VHS artefacts, snow, power
// on/off, degauss wobble, halation and a lit glass faceplate.
// ---------------------------------------------------------------------------------------------------------------
const crtVertex = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const crtFragment = /* glsl */`
uniform sampler2D tScreen;
uniform vec2 uRes;            // programme resolution
uniform float uTime;
uniform float uPower;         // 0 off .. 1 on (animated by the owner)
uniform float uBright;
uniform float uScale;         // >1 overscan, <1 underscan
uniform float uHV;            // 0/1 H/V delay
uniform float uBlue;          // 0/1 blue only
uniform float uVhs;           // 0..1
uniform float uNoise;         // 0..1 snow
uniform float uDegauss;       // 1 -> 0 after the thunk
uniform float uMono;          // monochrome green tube (no mask, P39)
uniform float uLines;         // visible scanlines (e.g. 240 / 200)
uniform float uMask;          // aperture grille strength
uniform vec3 uTint;           // phosphor tint for mono tubes
uniform float uAmbK;
uniform float uLampK;
uniform vec3 uLampPos;
uniform vec3 uLampCol;
uniform vec3 uLampDir;
uniform vec3 uWinPos;
uniform float uHover;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }

// uv: image convention (y = 0 at the top). The phosphor target is stored upright (GL t = 1 at the top).
vec3 fetch(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  return textureLod(tScreen, vec2(uv.x, 1.0 - uv.y), lod).rgb;
}

void main() {
  vec2 uv = vUv;                          // glTF UV: v = 0 at the top of the raster
  // power-on / off: the raster collapses to a line, then to a dot
  float pw = clamp(uPower, 0.0, 1.0);
  float vOpen = smoothstep(0.0, 0.55, pw);
  float hOpen = smoothstep(0.0, 0.18, pw);
  vec2 c = uv - 0.5;
  c.y /= max(vOpen, 0.004);
  c.x /= max(hOpen, 0.02);
  // degauss wobble
  float dg = uDegauss;
  c += dg * 0.03 * vec2(sin(uv.y * 9.0 + uTime * 23.0), sin(uv.x * 7.0 + uTime * 19.0));
  vec2 p = c / uScale + 0.5;
  // VHS: per-line horizontal jitter + head-switching skew at the bottom + tracking band
  float line = floor(p.y * uLines);
  float vhs = uVhs;
  float jitter = (h21(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.0025 * vhs;
  float headSw = smoothstep(0.955, 1.0, p.y) * vhs;
  jitter += headSw * (0.03 + 0.02 * sin(uTime * 13.0 + p.y * 90.0));
  float bandY = fract(uTime * 0.071);
  float band = exp(-pow((p.y - bandY) * 38.0, 2.0)) * vhs * step(0.6, sin(uTime * 0.37) * 0.5 + 0.5);
  jitter += band * (h21(vec2(line, uTime)) - 0.5) * 0.04;
  p.x += jitter;
  // H/V delay: blanking intervals shifted into view
  vec2 q = p;
  float blank = 0.0, sync = 0.0, burst = 0.0;
  if (uHV > 0.5) {
    q = fract(p + vec2(0.5, 0.5));
    float hb = 0.16, vb = 0.075;
    float hx = fract(p.x + 0.5);               // horizontal blanking centred at p.x = 0.5
    float hcen = abs(p.x - 0.5);
    float vcen = abs(p.y - 0.5);
    blank = max(step(hcen, hb * 0.5), step(vcen, vb * 0.5));
    sync = step(hcen, hb * 0.2) * step(0.0, 1.0) * (1.0 - step(vcen, vb * 0.5));
    burst = step(hb * 0.24, hcen) * step(hcen, hb * 0.36) * step(0.0, p.x - 0.5) * (1.0 - step(vcen, vb * 0.5));
    q = (q - 0.5) * (1.0 + hb) + 0.5;
  }
  // sample (luma sharp, chroma smeared for VHS)
  float px = 1.0 / uRes.x;
  vec3 col = fetch(q, 0.0);
  if (vhs > 0.01) {
    vec3 cs = (fetch(q + vec2(px * 2.5, 0.0), 1.5) + fetch(q + vec2(px * 5.0, 0.0), 2.0)) * 0.5;
    float Y = dot(col, vec3(0.299, 0.587, 0.114));
    float Yc = dot(cs, vec3(0.299, 0.587, 0.114));
    col = mix(col, Y + (cs - Yc) * 0.9, vhs);
    col = mix(col, vec3(dot(col, vec3(0.333))), 0.12 * vhs);
    col += band * vec3(0.5) * h21(vec2(floor(q.x * 200.0), line + floor(uTime * 60.0)));
  }
  if (uHV > 0.5) {
    col *= 1.0 - blank;
    col = mix(col, vec3(0.0), sync);
    col += vec3(0.08, 0.07, 0.02) * burst * (0.6 + 0.4 * sin(q.y * 400.0));
  }
  // snow
  float n = h21(vec2(floor(uv.x * uRes.x * 0.5), floor(uv.y * uLines)) + fract(uTime * 7.13) * 100.0);
  float snow = uNoise;
  col = mix(col, vec3(n * n * 1.25), snow);
  // halation / phosphor glow
  vec3 glow = fetch(q, 4.0) * 0.55 + fetch(q, 6.0) * 0.35;
  // blue only
  if (uBlue > 0.5) { float b = col.b; col = vec3(0.0, 0.0, b); glow = vec3(0.0, 0.0, glow.b); }
  if (uMono > 0.5) { float m = max(col.g, dot(col, vec3(0.3, 0.59, 0.11))); col = uTint * m; glow = uTint * max(glow.g, 0.0); }
  // scanlines: beam width grows with brightness; fade with screen-space line density
  float lp = uv.y * uLines;
  float dens = fwidth(lp);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float beam = mix(0.28, 0.55, clamp(lum, 0.0, 1.0));
  float s = exp(-pow((fract(lp) - 0.5) / beam, 2.0) * 1.3);
  float scanK = 1.0 - smoothstep(0.35, 0.8, dens);
  col *= mix(1.0, s * 1.55, scanK * 0.75);
  // aperture grille (vertical RGB stripes)
  if (uMono < 0.5) {
    float mx = uv.x * uRes.x * 2.0;
    float md = fwidth(mx);
    float k = uMask * (1.0 - smoothstep(0.4, 0.9, md));
    float f = fract(mx);
    vec3 m = vec3(smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.23, 0.33, f)),
                  smoothstep(0.33, 0.43, f) * (1.0 - smoothstep(0.56, 0.66, f)),
                  smoothstep(0.66, 0.76, f) * (1.0 - smoothstep(0.9, 1.0, f)));
    col *= mix(vec3(1.0), m * 2.6, k);
  }
  // tube edge falloff + rounded raster corners
  vec2 e = abs(uv - 0.5) * 2.0;
  float corner = 1.0 - smoothstep(0.9, 1.0, length(max(e - vec2(0.86, 0.84), 0.0)) / 0.15 + max(e.x, e.y) * 0.0);
  float falloff = 1.0 - 0.22 * pow(max(e.x, e.y), 3.0) - 0.12 * dot(e, e) * 0.5;
  float onK = smoothstep(0.02, 0.2, pw);
  vec3 beamCol = (col * uBright + glow * 0.18 * uBright) * falloff * corner * onK;
  // the collapsing dot on power-off is extra bright
  beamCol += vec3(1.0) * (1.0 - smoothstep(0.0, 0.2, pw)) * step(0.001, pw) * exp(-dot(c * vec2(0.6, 0.02), c * vec2(0.6, 0.02)) * 4000.0) * 6.0;
  // degauss colour purity blotches
  if (dg > 0.001) {
    vec3 rb = 0.5 + 0.5 * cos(6.2831 * (vnoise(uv * 3.0 + uTime) + vec3(0.0, 0.33, 0.67)));
    beamCol = mix(beamCol, beamCol * rb * 1.6, dg * 0.8);
  }
  // glass faceplate: dark grey phosphor lit by the room + reflections
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  float ndv = max(dot(N, V), 0.0);
  float fr = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 Ll = normalize(uLampPos - vP);
  vec3 H = normalize(Ll + V);
  float dl = length(uLampPos - vP);
  // the bulb sits inside a shade: only surfaces in front of its opening can see (and mirror) it
  float coneDot = dot(-Ll, uLampDir);
  float cone = smoothstep(0.30, 0.70, coneDot);
  float coneD = smoothstep(-0.25, 0.60, coneDot);
  vec3 lampSpec = uLampCol * uLampK * pow(max(dot(N, H), 0.0), 900.0) * 7.0 / (dl * dl * 4.0 + 0.5) * cone;
  vec3 lampSheen = uLampCol * uLampK * pow(max(dot(N, H), 0.0), 18.0) * 0.012 * (0.12 + 0.88 * cone);
  vec3 Lw = normalize(uWinPos - vP);
  vec3 Hw = normalize(Lw + V);
  vec3 winSheen = vec3(0.35, 0.42, 0.6) * uAmbK * pow(max(dot(N, Hw), 0.0), 60.0) * 0.05;
  vec3 phosphorBase = vec3(0.020, 0.022, 0.021) * (0.3 * uAmbK + 0.9 * uLampK * coneD * max(dot(N, Ll), 0.0) / (dl * dl + 0.2));
  vec3 outc = beamCol + phosphorBase + (lampSpec + lampSheen + winSheen) * (0.3 + fr);
  outc *= 1.0 + uHover * 0.15;
  gl_FragColor = vec4(outc, 1.0);
}
`;

export function crtMaterial(texture, { res = [640, 480], mono = false, lines = 240, mask = 0.55, tint = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScreen: { value: texture },
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uTime: { value: 0 },
      uPower: { value: 1 },
      uBright: { value: 1.6 },
      uScale: { value: 1.035 },
      uHV: { value: 0 },
      uBlue: { value: 0 },
      uVhs: { value: 0 },
      uNoise: { value: 0 },
      uDegauss: { value: 0 },
      uMono: { value: mono ? 1 : 0 },
      uLines: { value: lines },
      uMask: { value: mask },
      uTint: { value: tint || new THREE.Color(0.25, 1.0, 0.45) },
      uHover: { value: 0 },
      uAmbK: LIGHTS.ambK,
      uLampK: LIGHTS.lampK,
      uLampPos: LIGHTS.lampPos,
      uLampCol: LIGHTS.lampCol,
      uLampDir: LIGHTS.lampDir,
      uWinPos: LIGHTS.winPos,
    },
    vertexShader: crtVertex,
    fragmentShader: crtFragment,
    toneMapped: false,
  });
}

// Average linear colour of a canvas (for the TV's light on the room), sampled on a tiny 2D canvas.
export class CanvasAverager {
  constructor(w = 8, h = 6) {
    this.c = document.createElement('canvas');
    this.c.width = w;
    this.c.height = h;
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
    this.value = new THREE.Color(0, 0, 0);
    this.frame = 0;
  }

  sample(src, every = 3) {
    this.frame += 1;
    if (this.frame % every) return this.value;
    const { ctx, c } = this;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0; let g = 0; let b = 0;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
    const n = d.length / 4;
    this.value.setRGB(r / n, g / n, b / n);
    return this.value;
  }
}
