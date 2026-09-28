import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Post: HDR scene -> (DOF) -> bloom pyramid -> composite (bloom, lens halation, vignette, CA, grain, AgX, dither).
// Everything is plain fullscreen passes on half-float targets; no EffectComposer dependency.
// ---------------------------------------------------------------------------------------------------------------
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function pass(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { m, scene, u: uniforms };
}

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPrefilter; uniform float uThreshold; uniform float uKnee;
varying vec2 vUv;
vec3 pre(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * w;
}
void main(){
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2, 2)).rgb, b = texture2D(tSrc, vUv + t * vec2(0, 2)).rgb, c = texture2D(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2, -2)).rgb, h = texture2D(tSrc, vUv + t * vec2(0, -2)).rgb, i = texture2D(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1, 1)).rgb, k = texture2D(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1, -1)).rgb, m = texture2D(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (uPrefilter > 0.5) o = pre(min(o, vec3(64.0)));
  gl_FragColor = vec4(o, 1.0);
}`;

const UP = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(0, t.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb
         + texture2D(tSrc, vUv + vec2(-t.x, 0)).rgb * 2.0 + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(t.x, 0)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0, -t.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0, 1.0);
}`;

// Depth of field: gather with a golden-angle spiral, weight by circle-of-confusion from linear depth.
const DOF = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uFocus; uniform float uAperture;
uniform float uMaxBlur; uniform float uNear; uniform float uFar; uniform float uAmount;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float coc(float z) { return clamp(abs(1.0 / uFocus - 1.0 / z) * uAperture, 0.0, uMaxBlur); }
void main(){
  float z = lin(texture2D(tDepth, vUv).r);
  float c0 = coc(z) * uAmount;
  vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.0;
  if (c0 > 0.5) {
    const float GA = 2.39996323;
    float r = 1.0;
    for (int i = 0; i < 40; i++) {
      float fi = float(i);
      r = sqrt(fi + 0.5) / sqrt(40.0) * c0;
      vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * r * uTexel;
      vec2 suv = vUv + o;
      float zs = lin(texture2D(tDepth, suv).r);
      float cs = coc(zs) * uAmount;
      // foreground may bleed over focus; background only where its own CoC reaches us
      float w = zs < z ? smoothstep(r - 1.0, r + 1.0, cs + 1.0) : smoothstep(r - 1.0, r + 1.0, min(cs, c0) + 1.0);
      acc += texture2D(tColor, suv).rgb * w; wsum += w;
    }
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;

const COMPOSITE = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure; uniform float uTime;
uniform float uGrain; uniform float uVignette; uniform float uCA; uniform vec2 uRes; uniform float uFade; uniform float uFlash;
uniform float uSat; uniform vec3 uLift; uniform vec3 uGain;
varying vec2 vUv;
// AgX (Troy Sobotka) — minimal fit (Benjamin Wrensch)
vec3 agxContrast(vec3 x) { vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 agx(vec3 v) {
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const float mn = -12.47393, mx = 4.026069;
  v = m * v; v = clamp(log2(max(v, 1e-10)), mn, mx); v = (v - mn) / (mx - mn);
  return agxContrast(v);
}
vec3 agxEotf(vec3 v) {
  const mat3 im = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  return im * v;
}
vec3 agxLook(vec3 v) { // "punchy"-ish
  float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
  vec3 off = vec3(0.0), sl = vec3(1.0), pw = vec3(1.28);
  v = pow(max(vec3(0.0), v * sl + off), pw);
  return l + uSat * (v - l);
}
float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 ca = d * uCA * r2;
  vec3 col;
  col.r = texture2D(tColor, vUv - ca).r;
  col.g = texture2D(tColor, vUv).g;
  col.b = texture2D(tColor, vUv + ca).b;
  vec3 bl = texture2D(tBloom, vUv).rgb;
  col += bl * uBloom;
  col *= uExposure;
  col = col * uGain + uLift;
  col += uFlash;
  vec3 c = agxEotf(agxLook(agx(col)));
  // vignette (optical, before grain)
  float vig = 1.0 - uVignette * smoothstep(0.1, 0.75, r2 * 1.6);
  c *= vig;
  // film grain in display space, luminance-weighted
  float t = fract(uTime * 0.37);
  vec2 gp = vUv * uRes;
  float g = (h(gp + t * 931.0) + h(gp * 1.37 - t * 417.0) - 1.0);
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c += g * uGrain * (0.35 + 0.65 * (1.0 - lum)) * 0.09;
  // dither
  c += (h(gp + 17.0 * t) - 0.5) / 255.0;
  c *= uFade;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    this.levels = quality === 'low' ? 5 : 7;
    const hf = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples: quality === 'low' ? 0 : 4, depthBuffer: true,
    });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.resolveRT = new THREE.WebGLRenderTarget(1, 1, { ...hf });
    this.dofRT = new THREE.WebGLRenderTarget(1, 1, { ...hf });
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.levels; i += 1) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, { ...hf }));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, { ...hf }));
    }
    this.pDown = pass(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: 1.0 }, uKnee: { value: 0.6 } });
    this.pUp = pass(UP, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } });
    this.pDof = pass(DOF, {
      tColor: { value: null }, tDepth: { value: this.sceneRT.depthTexture }, uTexel: { value: new THREE.Vector2() },
      uFocus: { value: 2.0 }, uAperture: { value: 14.0 }, uMaxBlur: { value: 12.0 }, uNear: { value: 0.02 }, uFar: { value: 60 }, uAmount: { value: 1 },
    });
    this.pComp = pass(COMPOSITE, {
      tColor: { value: null }, tBloom: { value: null }, uBloom: { value: 0.09 }, uExposure: { value: 1.0 }, uTime: { value: 0 },
      uGrain: { value: 0.55 }, uVignette: { value: 0.42 }, uCA: { value: 0.006 }, uRes: { value: new THREE.Vector2() },
      uFade: { value: 1 }, uFlash: { value: 0 }, uSat: { value: 1.1 }, uLift: { value: new THREE.Vector3(0.0006, 0.0008, 0.0014) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
    });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.dof = { enabled: quality !== 'low', focus: 2.0, aperture: 14, amount: 1 };
    this.params = this.pComp.u;
  }

  setSize(w, h, pr) {
    const W = Math.max(1, Math.floor(w * pr));
    const H = Math.max(1, Math.floor(h * pr));
    this.sceneRT.setSize(W, H);
    this.sceneRT.depthTexture.image.width = W;
    this.sceneRT.depthTexture.image.height = H;
    this.resolveRT.setSize(W, H);
    this.dofRT.setSize(W, H);
    let bw = Math.max(1, W >> 1);
    let bh = Math.max(1, H >> 1);
    for (let i = 0; i < this.levels; i += 1) {
      this.down[i].setSize(bw, bh);
      this.up[i].setSize(bw, bh);
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }
    this.pComp.u.uRes.value.set(W, H);
    this.pDof.u.uTexel.value.set(1 / W, 1 / H);
  }

  _run(p, target) {
    this.renderer.setRenderTarget(target);
    this.renderer.render(p.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    let src = this.sceneRT.texture;
    if (this.dof.enabled && this.dof.amount > 0.01) {
      const u = this.pDof.u;
      u.tColor.value = src;
      u.uFocus.value = this.dof.focus;
      u.uAperture.value = this.dof.aperture;
      u.uAmount.value = this.dof.amount;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      this._run(this.pDof, this.dofRT);
      src = this.dofRT.texture;
    }
    // bloom pyramid
    let prev = src;
    let prevW = this.sceneRT.width;
    let prevH = this.sceneRT.height;
    for (let i = 0; i < this.levels; i += 1) {
      const d = this.pDown.u;
      d.tSrc.value = prev;
      d.uTexel.value.set(1 / prevW, 1 / prevH);
      d.uPrefilter.value = i === 0 ? 1 : 0;
      this._run(this.pDown, this.down[i]);
      prev = this.down[i].texture;
      prevW = this.down[i].width;
      prevH = this.down[i].height;
    }
    let up = this.down[this.levels - 1].texture;
    for (let i = this.levels - 2; i >= 0; i -= 1) {
      const u = this.pUp.u;
      u.tSrc.value = up;
      u.tBase.value = this.down[i].texture;
      u.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
      this._run(this.pUp, this.up[i]);
      up = this.up[i].texture;
    }
    const c = this.pComp.u;
    c.tColor.value = src;
    c.tBloom.value = up;
    c.uTime.value = time;
    this._run(this.pComp, null);
  }
}
