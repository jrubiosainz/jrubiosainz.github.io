import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Shared lighting state (one object, referenced by every material so a single update drives the whole room).
// ---------------------------------------------------------------------------------------------------------------
export const LIGHTS = {
  ambK: { value: 1.0 },                       // window night light (always on)
  lampK: { value: 1.0 },                      // desk lamp (0 = off)
  tvK: { value: new THREE.Color(0.1, 0.12, 0.3) },  // live TV colour * brightness / bake strength
  tvRoom: { value: new THREE.Color(0.9, 1.08, 2.7) }, // tvK with the artistic boost used for the room (lightmap + props)
  lampPos: { value: new THREE.Vector3() },
  lampCol: { value: new THREE.Color(1.0, 0.72, 0.45) },
  lampDir: { value: new THREE.Vector3(0, -1, 0) },
  tvPos: { value: new THREE.Vector3() },
  tvNormal: { value: new THREE.Vector3(0, 0, 1) },
  winPos: { value: new THREE.Vector3() },
  time: { value: 0 },
  exposure: { value: 1 },
};

const COMMON = /* glsl */`
#define PI 3.141592653589793
uniform float uAmbK;
uniform float uLampK;
uniform vec3 uTvK;
uniform vec3 uLampPos;
uniform vec3 uLampCol;
uniform vec3 uLampDir;
uniform vec3 uTvPos;
uniform vec3 uWinPos;

// the shade only lets light out of its mouth: soft cone around the aim direction
float lampCone(vec3 P) { return smoothstep(0.30, 0.62, dot(normalize(P - uLampPos), uLampDir)); }

float D_GGX(float NdH, float a) {
  float a2 = a * a;
  float d = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-5);
}
float V_Smith(float NdV, float NdL, float a) {
  float k = a * 0.5;
  return 0.25 / ((NdV * (1.0 - k) + k) * (NdL * (1.0 - k) + k) + 1e-5);
}
// Specular for a light whose (shadowed) irradiance E we already know from the lightmap: radiance = f_s * E * PI
vec3 specFrom(vec3 N, vec3 V, vec3 P, vec3 lightPos, float size, vec3 E, float rough, vec3 F0) {
  vec3 Lv = lightPos - P;
  float d = length(Lv);
  vec3 L = Lv / max(d, 1e-4);
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float NdV = max(dot(N, V), 1e-3);
  float NdH = max(dot(N, H), 0.0);
  float VdH = max(dot(V, H), 0.0);
  float a = clamp(rough * rough + size / (2.0 * max(d, 0.05)), 0.02, 1.0);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
  return D_GGX(NdH, a) * V_Smith(NdV, NdL, a) * F * E * PI * step(0.0, NdL);
}
`;

const lmVertex = /* glsl */`
attribute vec2 uv1;
attribute vec4 aMat;
attribute vec4 aAlb;
varying vec2 vUv;
varying vec2 vLm;
varying vec3 vN;
varying vec3 vP;
varying vec4 vMat;
varying vec4 vAlb;
void main() {
  vUv = uv;
  vLm = uv1;
  vMat = aMat;
  vAlb = aAlb;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const lmFragment = /* glsl */`
${COMMON}
uniform sampler2D tAlb;
uniform sampler2D tAmb;
uniform sampler2D tLamp;
uniform sampler2D tTv;
uniform vec3 uScales;
uniform float uCombined;
uniform sampler2D tRuntime;
uniform float uRuntime;
uniform vec3 uTint;
uniform float uHover;
uniform float uGloss;
uniform float uFade;
varying vec2 vUv;
varying vec2 vLm;
varying vec3 vN;
varying vec3 vP;
varying vec4 vMat;
varying vec4 vAlb;

vec3 dec(sampler2D t, float s) { vec3 c = texture2D(t, vLm).rgb; return c * c * c * s; }

void main() {
  // occluder dissolve (camera inside a plant…): dithered discard keeps depth and needs no sorting
  if (uFade < 0.999) {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign >= uFade) discard;
  }
  vec3 amb = dec(tAmb, uScales.x);
  vec3 lamp = dec(tLamp, uScales.y);
  vec3 tv = dec(tTv, uScales.z);
  vec3 albedo = vAlb.w > 1.5 ? vAlb.rgb : texture2D(tAlb, vLm).rgb;
  if (uRuntime > 0.5) albedo = texture2D(tRuntime, vUv).rgb * uTint;
  else if (uRuntime > 0.25) albedo = uTint;
  if (uCombined > 0.5) albedo = vec3(1.0);
  vec3 Eamb = amb * uAmbK;
  vec3 Elamp = lamp * uLampK * (vMat.w > 0.0 ? vMat.w : 1.0);
  vec3 Etv = tv * uTvK;
  vec3 col = albedo * (Eamb + Elamp + Etv);
  // shadow-aware analytic gloss from the three baked groups
  float rough = vMat.x;
  float specK = vMat.y * uGloss;
  if (specK > 0.001 && uCombined < 0.5) {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vP);
    vec3 F0 = mix(vec3(0.04), albedo, vMat.z);
    vec3 s = specFrom(N, V, vP, uLampPos, 0.03, Elamp, rough, F0)
           + specFrom(N, V, vP, uTvPos, 0.30, Etv, rough, F0)
           + specFrom(N, V, vP, uWinPos, 1.40, Eamb * 0.6, rough, F0);
    col += min(s * specK, vec3(24.0));
  }
  col *= 1.0 + uHover * 0.35;
  col += uHover * 0.012 * vec3(1.0, 0.85, 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function lightmapMaterial({ atlas, runtime = null, tint = null, combined = false, hover = false, gloss = 1 }) {
  const uniforms = {
    tAlb: { value: atlas.albedo },
    tAmb: { value: atlas.amb },
    tLamp: { value: atlas.lamp },
    tTv: { value: atlas.tv },
    uScales: { value: atlas.scales },
    uCombined: { value: combined ? 1 : 0 },
    tRuntime: { value: runtime },
    uRuntime: { value: runtime ? 1 : (tint ? 0.5 : 0) },
    uTint: { value: tint ? tint.clone() : new THREE.Color(1, 1, 1) },
    uHover: { value: 0 },
    uGloss: { value: gloss },
    uFade: { value: 1 },
    uAmbK: LIGHTS.ambK,
    uLampK: LIGHTS.lampK,
    uTvK: LIGHTS.tvRoom,
    uLampPos: LIGHTS.lampPos,
    uLampCol: LIGHTS.lampCol,
    uLampDir: LIGHTS.lampDir,
    uTvPos: LIGHTS.tvPos,
    uWinPos: LIGHTS.winPos,
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: lmVertex,
    fragmentShader: lmFragment,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  m.userData.hoverable = hover;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Moving objects: albedo atlas (DynUV) + analytic lights calibrated to the bake.
// ---------------------------------------------------------------------------------------------------------------
const dynVertex = /* glsl */`
attribute vec2 uv2;
varying vec2 vUv;
varying vec2 vDyn;
varying vec3 vN;
varying vec3 vP;
void main() {
  vUv = uv;
  vDyn = uv2;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const dynFragment = /* glsl */`
${COMMON}
uniform sampler2D tDyn;
uniform sampler2D tRuntime;
uniform float uRuntime;
uniform vec3 uColor;
uniform vec4 uMat;       // rough, spec, metal, useAtlas
uniform vec3 uAmbient;   // local ambient irradiance (from nearby bake)
uniform float uLampPower;
uniform float uTvPower;
uniform float uHover;
uniform float uOcclusion;
uniform vec3 uRim;       // window back-light on silhouettes (0 = off)
uniform float uSpill;    // lamp light outside the beam: the glowing shade and its bounce off the desk (0 = off)
varying vec2 vUv;
varying vec2 vDyn;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 albedo = uMat.w > 0.5 ? texture2D(tDyn, vDyn).rgb : uColor;
  if (uRuntime > 0.5) albedo = texture2D(tRuntime, vUv).rgb;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vP);
  vec3 Ll = uLampPos - vP; float dl = length(Ll); Ll /= dl;
  vec3 Lt = uTvPos - vP; float dt = length(Lt); Lt /= dt;
  vec3 Elamp = uLampCol * uLampK * uLampPower * max(dot(N, Ll), 0.0) * lampCone(vP) / (dl * dl + 0.01);
  vec3 Etv = uTvK * uTvPower * max(dot(N, Lt), 0.0) / (dt * dt + 0.02);
  vec3 Eamb = uAmbient * uAmbK * (0.65 + 0.35 * N.y) * uOcclusion;
  vec3 Espill = uLampCol * uLampK * uSpill * (0.3 + 0.7 * max(dot(N, Ll), 0.0)) / (dl * dl + 0.02);
  vec3 col = albedo * (Eamb + Elamp + Etv + Espill);
  vec3 F0 = mix(vec3(0.04), albedo, uMat.z);
  col += min((specFrom(N, V, vP, uLampPos, 0.03, Elamp, uMat.x, F0)
            + specFrom(N, V, vP, uTvPos, 0.3, Etv, uMat.x, F0)) * uMat.y, vec3(24.0));
  col += uRim * uAmbK * pow(1.0 - max(dot(N, V), 0.0), 3.0) * max(dot(N, normalize(uWinPos - vP)), 0.0);
  col *= 1.0 + uHover * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function dynamicMaterial({ dynTex, color = new THREE.Color(0.5, 0.5, 0.5), rough = 0.5, spec = 0.5, metal = 0,
  useAtlas = true, runtime = null, ambient = new THREE.Color(0.02, 0.022, 0.03) }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDyn: { value: dynTex },
      tRuntime: { value: runtime },
      uRuntime: { value: runtime ? 1 : 0 },
      uColor: { value: color.clone() },
      uMat: { value: new THREE.Vector4(rough, spec, metal, useAtlas ? 1 : 0) },
      uAmbient: { value: ambient.clone() },
      uLampPower: { value: 0.3 },
      uTvPower: { value: 0.05 },
      uHover: { value: 0 },
      uOcclusion: { value: 1 },
      uRim: { value: new THREE.Color(0, 0, 0) },
      uSpill: { value: 0 },
      uAmbK: LIGHTS.ambK,
      uLampK: LIGHTS.lampK,
      uTvK: LIGHTS.tvRoom,
      uLampPos: LIGHTS.lampPos,
      uLampCol: LIGHTS.lampCol,
      uLampDir: LIGHTS.lampDir,
      uTvPos: LIGHTS.tvPos,
      uWinPos: LIGHTS.winPos,
    },
    vertexShader: dynVertex,
    fragmentShader: dynFragment,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Small glowing parts: LEDs, bulb, VFD / LCD canvases.
// ---------------------------------------------------------------------------------------------------------------
export function glowMaterial(color, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uStrength: { value: strength }, uOn: { value: 1 } },
    vertexShader: /* glsl */`void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength; uniform float uOn;
      void main(){ gl_FragColor = vec4(uColor * uStrength * uOn, 1.0); }`,
    toneMapped: false,
  });
}

// Canvas display (VFD glass, reflective LCD): canvas colour as emission (+ lit by the lamp for the LCD).
export function canvasDisplayMaterial(texture, { strength = 1, reflective = false, glass = 0.04 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      uStrength: { value: strength },
      uReflective: { value: reflective ? 1 : 0 },
      uGlass: { value: glass },
      uLampK: LIGHTS.lampK,
      uAmbK: LIGHTS.ambK,
      uTvK: LIGHTS.tvK,
      uBacklight: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap; uniform float uStrength; uniform float uReflective; uniform float uGlass;
      uniform float uLampK; uniform float uAmbK; uniform vec3 uTvK; uniform float uBacklight;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 c = texture2D(tMap, vUv).rgb;
        vec3 V = normalize(cameraPosition - vP);
        float fr = pow(1.0 - max(dot(normalize(vN), V), 0.0), 5.0);
        vec3 col;
        if (uReflective > 0.5) {
          // reflective LCD: the CD player sits beside (not under) the lamp's shade, so it only gets spill light
          float light = 0.06 * uAmbK + 0.24 * uLampK + dot(uTvK, vec3(0.3)) * 0.2 + uBacklight;
          col = c * light * uStrength;
        } else {
          col = c * uStrength;
        }
        col += vec3(0.6, 0.62, 0.7) * fr * uGlass;
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Compact disc: thin-film / diffraction rainbow + grooves.
// ---------------------------------------------------------------------------------------------------------------
export function discMaterial(label = null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLampPos: LIGHTS.lampPos, uLampK: LIGHTS.lampK, uLampCol: LIGHTS.lampCol, uAmbK: LIGHTS.ambK,
      uTvPos: LIGHTS.tvPos, uTvK: LIGHTS.tvK, uWinPos: LIGHTS.winPos, uHover: { value: 0 },
      tLabel: { value: label }, uLabel: { value: label ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP; varying vec2 vLoc; varying vec3 vT; varying vec3 vB;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        vLoc = position.xz;
        // radial (grating) and tangential (groove) directions in world space
        vec2 r = normalize(position.xz + vec2(1e-6));
        vT = normalize(mat3(modelMatrix) * vec3(r.x, 0.0, r.y));
        vB = normalize(cross(vN, vT));
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLampPos; uniform float uLampK; uniform vec3 uLampCol; uniform float uAmbK;
      uniform vec3 uTvPos; uniform vec3 uTvK; uniform vec3 uWinPos; uniform float uHover;
      uniform sampler2D tLabel; uniform float uLabel;
      varying vec3 vN; varying vec3 vP; varying vec2 vLoc; varying vec3 vT; varying vec3 vB;
      vec3 spectral(float w) {                       // wavelength (nm) -> rgb, rough CIE-ish bumps
        float x = (w - 400.0) / 300.0;
        vec3 c = vec3(smoothstep(0.42, 0.66, x) * (1.0 - smoothstep(0.88, 1.02, x)) + 0.3 * (1.0 - smoothstep(0.0, 0.14, x)),
                      smoothstep(0.14, 0.42, x) * (1.0 - smoothstep(0.58, 0.8, x)),
                      smoothstep(-0.04, 0.08, x) * (1.0 - smoothstep(0.28, 0.46, x)));
        return c * step(0.0, x) * step(x, 1.0);
      }
      // first/second order diffraction of a circular 1.6 um grating for light from L seen from V
      vec3 grating(vec3 L, vec3 V, float spread) {
        vec3 S = L + V;
        float along = abs(dot(S, vT));
        float cross = dot(S, vB);
        float k = exp(-cross * cross / spread);
        return (spectral(1600.0 * along) + 0.6 * spectral(800.0 * along)) * k;
      }
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        if (dot(N, V) < 0.0) N = -N;
        float rad = length(vLoc);
        vec3 Ll = normalize(uLampPos - vP);
        vec3 Lw = normalize(uWinPos - vP);
        vec3 Lt = normalize(uTvPos - vP);
        vec3 R = reflect(-V, N);
        // mirror-like aluminium layer
        vec3 env = vec3(0.012, 0.012, 0.016) * uAmbK
                 + vec3(0.25, 0.3, 0.45) * 0.05 * uAmbK * smoothstep(0.2, 0.9, dot(R, Lw))
                 + uLampCol * uLampK * pow(max(dot(R, Ll), 0.0), 60.0) * 1.8;
        vec3 rainbow = grating(Ll, V, 0.03) * uLampCol * uLampK * 0.9
                     + grating(Lw, V, 0.25) * vec3(0.35, 0.42, 0.6) * uAmbK * 0.08
                     + grating(Lt, V, 0.12) * uTvK * 1.2;
        float data = smoothstep(0.022, 0.024, rad) * (1.0 - smoothstep(0.0585, 0.0595, rad));
        float hub = 1.0 - smoothstep(0.0165, 0.0175, rad);
        vec3 metal = env + rainbow * data;
        vec3 clear = vec3(0.02, 0.022, 0.025) * (0.3 + uLampK * 0.4) + uLampCol * uLampK * pow(max(dot(R, Ll), 0.0), 200.0) * 0.4;
        vec3 col = mix(metal, clear, hub);
        if (uLabel > 0.5) {
          vec4 lab = texture2D(tLabel, vec2(vLoc.x, -vLoc.y) / 0.12 + 0.5);
          float diffuse = 0.05 * uAmbK + 0.45 * uLampK * max(dot(N, Ll), 0.0) + dot(uTvK, vec3(0.3));
          vec3 print = lab.rgb * lab.rgb * diffuse + uLampCol * uLampK * pow(max(dot(R, Ll), 0.0), 40.0) * 0.25;
          col = mix(col, print, lab.a);
        }
        col *= 1.0 + uHover * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// Transparent glass (lenses, tube glass): fresnel sheen only, additive.
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uLampPos: LIGHTS.lampPos, uLampK: LIGHTS.lampK, uAmbK: LIGHTS.ambK },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLampPos; uniform float uLampK; uniform float uAmbK;
      varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        if (dot(N, V) < 0.0) N = -N;
        float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 L = normalize(uLampPos - vP); vec3 H = normalize(L + V);
        float s = pow(max(dot(N, H), 0.0), 300.0) * 6.0 * uLampK;
        vec3 col = vec3(0.10, 0.11, 0.13) * fr * (0.3 + uAmbK * 0.2 + uLampK * 0.5) + vec3(1.0, 0.8, 0.6) * s;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// Same shader + shared uniform objects (textures, lights) but private hover/fade uniforms, so a single object can glow
// on hover (or dissolve) without cloning (ShaderMaterial.clone() would clone every texture and re-upload the atlases).
export function ownMaterial(m) {
  if (!m?.isShaderMaterial || m.userData.owned) return m;
  const own = { uHover: { value: 0 } };
  if (m.uniforms.uFade) own.uFade = { value: 1 };
  const n = new THREE.ShaderMaterial({
    uniforms: { ...m.uniforms, ...own },
    vertexShader: m.vertexShader,
    fragmentShader: m.fragmentShader,
    side: m.side,
    transparent: m.transparent,
    blending: m.blending,
    depthWrite: m.depthWrite,
    toneMapped: false,
  });
  n.userData = { ...m.userData, owned: true };
  return n;
}

// Paper held in front of the camera (the work notepad): canvas albedo lit by the desk lamp from below-left,
// with a soft falloff towards the edges and a faint sheen.
export function paperMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      uLampK: LIGHTS.lampK,
      uAmbK: LIGHTS.ambK,
      uTvK: LIGHTS.tvK,
      uLight: { value: 1.0 },
      uHover: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap; uniform float uLampK; uniform float uAmbK; uniform vec3 uTvK; uniform float uLight;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 alb = texture2D(tMap, vUv).rgb;
        // warm key from the lamp (lower left), cool fill from the window, TV bounce
        float key = mix(0.55, 1.0, smoothstep(1.1, 0.0, distance(vUv, vec2(0.05, 0.95))));
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.9, vUv.x) * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        vec3 E = vec3(1.0, 0.78, 0.55) * (0.10 + 0.55 * uLampK) * key
               + vec3(0.30, 0.36, 0.55) * 0.07 * uAmbK
               + uTvK * 0.9;
        vec3 col = alb * E * uLight * mix(0.82, 1.0, edge);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
