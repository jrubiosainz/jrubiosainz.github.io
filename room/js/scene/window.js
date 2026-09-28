import * as THREE from 'three';

const OPENING = new THREE.Vector2(1.32, 1.40);
const DEFAULT_BASE = 'assets/window/';

const vertexShader = /* glsl */`
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */`
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uLights;
uniform sampler2D uBlur;
uniform sampler2D uWater;
uniform float uTime;
uniform float uRain;
uniform float uExposure;
uniform float uLightBoost;
uniform float uQuality;
uniform float uLightning;
uniform vec3 uReflectLamp;
uniform vec3 uReflectTV;
uniform vec2 uReflectLampUv;
uniform vec2 uReflectTVUv;
uniform vec2 uOpeningMeters;
uniform vec2 uAzRange;
uniform vec2 uElRange;
uniform vec2 uPanoOffset;
uniform vec2 uViewRotate;
uniform vec4 uCarPaths[4];
uniform float uCarSpeeds[4];
uniform int uCarCount;
// small boats on the ría: boxes on straight tracks on a water plane, uRiverH metres below the window
uniform float uRiverH;
uniform vec4 uBoatGeo[3];     // track origin (x, z) and unit direction (x, z), river coordinates
uniform vec4 uBoatSpan[3];    // sMin, sMax along the track, dir (+1 bow at sMax), visible (0/1)
uniform vec4 uBoatLook[3];    // length, width, kind, light intensity
uniform int uBoatCount;
varying vec2 vUv;
varying vec3 vWorldPos;

const float PI = 3.141592653589793;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + n + 19.19));
}

vec2 panoUvFromDir(vec3 d) {
  float az = degrees(atan(d.x, -d.z));
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  vec2 ae = vec2(az, el) + uPanoOffset;
  return vec2((ae.x - uAzRange.x) / (uAzRange.y - uAzRange.x), (ae.y - uElRange.x) / (uElRange.y - uElRange.x));
}


vec3 rotateSceneDir(vec3 d) {
  float yaw = radians(uViewRotate.x);
  float lift = radians(-uViewRotate.y);
  float cy = cos(yaw);
  float sy = sin(yaw);
  d = vec3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float cx = cos(lift);
  float sx = sin(lift);
  return normalize(vec3(d.x, cx * d.y - sx * d.z, sx * d.y + cx * d.z));
}

vec2 uvFromAzEl(vec2 ae) {
  return vec2((ae.x - uAzRange.x) / (uAzRange.y - uAzRange.x), (ae.y - uElRange.x) / (uElRange.y - uElRange.x));
}

vec3 sampleCity(vec2 uv) {
  return texture2D(uColor, clamp(uv, 0.001, 0.999)).rgb;
}

vec3 sampleBlur(vec2 uv) {
  return texture2D(uBlur, clamp(uv, 0.001, 0.999)).rgb;
}

float softCircle(vec2 p, float r, float edge) {
  return 1.0 - smoothstep(r - edge, r + edge, length(p));
}

float blink(float rate, float phase, float duty) {
  float t = fract(uTime * rate + phase);
  return smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(duty, duty + 0.10, t));
}

// city_lights: R lamps and lit windows, G the footbridge LEDs, B a smooth random field (flicker phase). Plain
// intensities, so texture filtering at their edges can never turn one kind of light into another.
vec3 animatedLights(vec2 uv, vec3 base) {
  vec3 m = texture2D(uLights, clamp(uv, 0.001, 0.999)).rgb;
  // lamps seen through rain: a faint, slow shimmer, a little warmth added to the cores
  float ph = m.b * 6.2831;
  float shimmer = 0.6 * sin(uTime * (0.9 + m.b * 1.7) + ph * 7.0) + 0.4 * sin(uTime * (2.3 + m.b) + ph * 13.0);
  base *= 1.0 + m.r * shimmer * 0.07;
  base += vec3(1.0, 0.70, 0.38) * m.r * m.r * 0.018 * uLightBoost;
  // footbridge LEDs: a slow colour wave travels along the arch (pink -> violet -> soft blue), tinting their own pixels
  if (m.g > 0.004) {
    float wv = uTime * 0.16 - uv.x * 60.0;
    float w1 = 0.5 + 0.5 * sin(wv);
    float w2 = 0.5 + 0.5 * sin(wv * 0.61 + 1.7);
    vec3 tint = mix(vec3(1.12, 0.84, 1.02), vec3(0.84, 0.82, 1.24), w1);
    tint = mix(tint, vec3(0.78, 0.95, 1.22), w2 * 0.35);
    base = mix(base, base * tint * (0.9 + 0.2 * w2), clamp(m.g, 0.0, 1.0));
  }
  return base;
}

float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 movingTraffic(vec2 uv, vec3 col) {
  for (int i = 0; i < 4; i++) {
    if (i < uCarCount) {
      vec4 path = uCarPaths[i];
      vec2 a = uvFromAzEl(path.xy);
      vec2 b = uvFromAzEl(path.zw);
      float t = fract(uTime * uCarSpeeds[i] + float(i) * 0.37);
      vec2 p = mix(a, b, t);
      float head = exp(-pow(length((uv - p) * vec2(7.0, 130.0)), 2.0) * 320.0);
      vec2 p2 = mix(b, a, fract(uTime * (uCarSpeeds[i] * 0.82) + 0.43 + float(i) * 0.19));
      float tail = exp(-pow(length((uv - p2) * vec2(7.0, 130.0)), 2.0) * 360.0);
      col += vec3(1.0, 0.50, 0.18) * head * 0.45 + vec3(1.0, 0.06, 0.025) * tail * 0.36;
    }
  }
  return col;
}

const float BOAT_Y0 = 0.03;
const float BOAT_Y1 = 1.85;

float band1(float x, float a, float b, float aa) {
  return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x));
}

vec3 boatSurface(vec3 p, int face, vec4 span, vec4 look) {
  float len = look.x;
  float width = look.y;
  float kind = look.z;
  float lit = look.w;
  float bow = span.z > 0.0 ? span.y : span.x;
  float fromBow = abs(bow - p.x);
  float u = clamp(fromBow / max(len, 0.1), 0.0, 1.0);
  float aaX = max(fwidth(p.x), 0.015);
  float aaY = max(fwidth(p.y), 0.015);
  float aaZ = max(fwidth(p.z), 0.015);
  vec3 hull = mix(vec3(0.020, 0.024, 0.026), vec3(0.055, 0.045, 0.034), step(1.5, kind));
  vec3 deck = vec3(0.36, 0.33, 0.27) * 0.12;
  vec3 col = hull * (0.75 + uLightning * 2.2);
  float cabinX = band1(u, 0.34, 0.68, aaX / len);
  float cabinY = band1(p.y, 0.72, 1.45, aaY);
  float cabinZ = band1(abs(p.z), 0.0, width * 0.30, aaZ);
  float cabin = cabinX * cabinY * cabinZ;
  float win = cabin * band1(p.y, 0.88, 1.28, aaY) * (0.35 + 0.65 * band1(fract(u * 5.0), 0.12, 0.78, aaX / len * 4.0));
  col = mix(col, deck, cabin * 0.52);
  col += vec3(1.0, 0.72, 0.34) * win * lit * 1.9;
  float rail = band1(p.y, 0.42, 0.52, aaY) * (1.0 - cabin * 0.5);
  col += vec3(0.42, 0.38, 0.30) * rail * 0.20;
  float waterline = band1(p.y, 0.12, 0.22, aaY);
  col += vec3(0.62, 0.68, 0.64) * waterline * 0.16;
  if (face == 0) {
    bool isBow = abs(p.x - bow) < 0.42;
    float side = smoothstep(0.18, width * 0.48, abs(p.z));
    float nav = band1(p.y, 0.48, 0.72, aaY) * side;
    vec3 navCol = p.z < 0.0 ? vec3(1.0, 0.05, 0.025) : vec3(0.06, 1.0, 0.18);
    col += (isBow ? navCol * 2.8 : vec3(1.0, 0.92, 0.76) * 1.1) * nav * lit;
  }
  return col;
}

float waterAtDir(vec3 dir) {
  return texture2D(uWater, clamp(panoUvFromDir(dir), 0.001, 0.999)).r;
}

vec3 waterShimmer(vec2 uv, vec3 col) {
  float w = texture2D(uWater, clamp(uv, 0.001, 0.999)).r;
  if (w <= 0.01) return col;
  vec3 lm = texture2D(uLights, clamp(uv + vec2(sin(uTime * 0.31 + uv.y * 80.0) * 0.0006, 0.0), 0.001, 0.999)).rgb;
  float ripple = 0.5 + 0.5 * sin((uv.y * 190.0 + uv.x * 37.0) + uTime * 1.7);
  float fine = hash12(floor(uv * vec2(900.0, 420.0)) + floor(uTime * 6.0));
  col += vec3(1.0, 0.58, 0.25) * lm.r * w * (0.020 + 0.035 * ripple);
  col += vec3(0.20, 0.28, 0.34) * w * (fine - 0.5) * 0.010 * uRain;
  return col;
}

vec4 riverTraffic(vec3 d, vec3 bg, inout vec3 glow) {
  vec4 hit = vec4(0.0);
  float best = 1e9;
  vec3 O = vec3(0.0, uRiverH, 0.0);
  float tg = d.y < -1e-4 ? uRiverH / -d.y : -1.0;
  vec3 g = O + d * max(tg, 0.0);
  float waterHere = tg > 0.0 ? texture2D(uWater, clamp(panoUvFromDir(d), 0.001, 0.999)).r : 0.0;
  for (int i = 0; i < 3; i++) {
    if (i >= uBoatCount) break;
    vec4 span = uBoatSpan[i];
    if (span.w < 0.5) continue;
    vec4 geo = uBoatGeo[i];
    vec4 look = uBoatLook[i];
    vec2 u = geo.zw;
    vec2 n = vec2(-u.y, u.x);
    float bw = max(look.y, 0.8);
    vec2 rel = O.xz - geo.xy;
    vec3 o = vec3(dot(rel, u), O.y, dot(rel, n));
    vec3 dl = vec3(dot(d.xz, u), d.y, dot(d.xz, n));
    vec3 dd = mix(dl, vec3(1e-6), step(abs(dl), vec3(1e-6)));
    vec3 inv = 1.0 / dd;
    vec3 t0 = (vec3(span.x, BOAT_Y0, -bw * 0.5) - o) * inv;
    vec3 t1 = (vec3(span.y, BOAT_Y1, bw * 0.5) - o) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(tmin.x, tmin.y), tmin.z);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    float bow = span.z > 0.0 ? span.y : span.x;
    if (tn < tf && tn > 0.0 && tn < best) {
      vec3 p = o + dl * tn;
      vec2 wxz = geo.xy + u * p.x + n * p.z;
      vec3 waterDir = normalize(vec3(wxz.x, -uRiverH, wxz.y));
      float wm = waterAtDir(waterDir);
      if (wm > 0.22) {
        int face = tn == tmin.y ? 1 : (tn == tmin.x ? 0 : 2);
        vec3 col = boatSurface(p, face, span, look);
        float distFade = exp(-tn / 420.0) * (1.0 - smoothstep(520.0, 760.0, tn));
        best = tn;
        hit = vec4(mix(bg, col, distFade), smoothstep(0.18, 0.42, wm) * distFade);
      }
    }
    if (tg > 0.0 && tg < best && waterHere > 0.15) {
      vec2 gr = g.xz - geo.xy;
      float sg = dot(gr, u);
      float cg = dot(gr, n);
      float ds = max(max(span.x - sg, sg - span.y), 0.0);
      float dc = max(abs(cg) - bw * 0.5, 0.0);
      float wakeBehind = max(0.0, (bow - sg) * span.z);
      float wake = exp(-abs(cg) / (0.55 + wakeBehind * 0.018)) * exp(-wakeBehind / 34.0) * step(0.0, wakeBehind) * smoothstep(28.0, 4.0, wakeBehind);
      float pool = exp(-(ds * ds + dc * dc) / 5.5) * step(ds + dc, 9.0);
      float streak = exp(-abs(cg) / 0.7) * exp(-ds / 5.0) * step(ds, 8.0);
      vec3 add = vec3(1.0, 0.72, 0.38) * pool * 0.055 + vec3(0.68, 0.78, 0.88) * wake * 0.035 + vec3(0.8, 0.5, 1.0) * streak * 0.020;
      glow += add * look.w * waterHere * exp(-tg / 420.0);
    }
    for (int k = 0; k < 4; k++) {
      float endS = k == 3 ? (span.z > 0.0 ? span.x : span.y) : bow;
      float side = k == 0 ? -bw * 0.34 : (k == 1 ? bw * 0.34 : 0.0);
      vec3 lcol = k == 0 ? vec3(1.0, 0.05, 0.025) : (k == 1 ? vec3(0.05, 1.0, 0.18) : vec3(1.0, 0.88, 0.68));
      float ly = k == 2 ? 1.75 : (k == 3 ? 0.82 : 0.62);
      vec2 xz = geo.xy + u * endS + n * side;
      vec3 L = vec3(xz.x, ly - uRiverH, xz.y);
      float dist = length(L);
      vec3 Ld = L / dist;
      float a = sqrt(max(0.0, 2.0 - 2.0 * dot(d, Ld)));
      float core = exp(-pow(a / 0.0020, 2.0)) * 0.8 + exp(-pow(a / 0.010, 2.0)) * 0.08;
      glow += lcol * core * look.w * exp(-dist / 520.0);
    }
  }
  return hit;
}

vec4 beadLayer(vec2 uv, vec2 meters, vec2 cellMm, float scale, vec2 panoUv, vec3 city, inout vec2 refractOffset) {
  vec2 grid = meters / (cellMm * 0.001);
  vec2 id = floor(grid);
  vec2 f = fract(grid) - 0.5;
  vec2 jitter = hash22(id) - 0.5;
  vec2 c = jitter * 0.48;
  float rnd = hash12(id + 3.7);
  float radius = mix(0.11, 0.30, rnd) * scale;
  float m = softCircle(f - c, radius, 0.035);
  float keep = step(0.68, rnd) * smoothstep(0.08, 0.70, uRain);
  m *= keep;
  vec2 n = normalize(f - c + 1e-4);
  float lens = m * (0.0020 + 0.0032 * rnd) * uRain;
  refractOffset += n * lens;
  float rim = smoothstep(radius * 0.45, radius, length(f - c)) * m;
  // a bead is a tiny fisheye lens: a wide, upside-down and mirrored view of the city, lights in focus,
  // with a dark rim where the light is reflected back inside the water
  vec2 q = (f - c) / max(radius, 1e-4);
  vec2 suv = panoUv - q * vec2(0.075, 0.13) * (0.7 + 0.3 * rnd);
  vec3 drop = mix(sampleBlur(suv).rgb, sampleCity(suv), 0.55) * (0.95 + rnd * 0.2);
  float lightCatch = dot(sampleCity(suv), vec3(0.30, 0.50, 0.20));
  float glint = pow(max(0.0, 1.0 - length(q - vec2(-0.38, 0.42)) * 2.2), 5.0) * m;
  // the brighter sky above lands, upside down, in the lower part of each bead
  vec3 sky = sampleBlur(vec2(panoUv.x - q.x * 0.05, 0.63)).rgb;
  float crescent = smoothstep(0.1, 0.85, -q.y) * (1.0 - smoothstep(0.78, 1.0, length(q)));
  drop += sky * crescent * 0.9;
  drop += vec3(1.0, 0.78, 0.5) * (glint * 0.5 + smoothstep(0.45, 1.0, lightCatch) * m * 0.12);
  drop *= 1.0 - rim * 0.5;
  return vec4(mix(city, drop, m * 0.86), m * 0.55);
}

float runDrop(vec2 uv, vec2 meters, float column, float speed, float phase, out vec2 offset) {
  float x = column + sin(uTime * 0.13 + phase * 6.0) * 0.016;
  float cycle = fract(uTime * speed + phase);
  float stick = smoothstep(0.08, 0.55, cycle) * (1.0 - smoothstep(0.82, 1.0, cycle));
  float y = 1.08 - cycle * 1.48 + sin(cycle * PI * 8.0 + phase) * 0.012 * stick;
  vec2 p = vec2(x, y);
  vec2 q = meters - p;
  float head = exp(-dot(q / vec2(0.0055, 0.012), q / vec2(0.0055, 0.012)));
  float trail = smoothstep(0.020, 0.0, abs(q.x + sin(q.y * 38.0 + phase) * 0.0018)) *
                smoothstep(0.0, 0.06, q.y) * smoothstep(0.42, 0.0, q.y);
  offset = vec2(q.x * -0.020, -0.009) * (head + trail * 0.45);
  return (head + trail * 0.38) * smoothstep(0.35, 0.95, uRain);
}

vec3 rainOnGlass(vec2 uv, vec2 panoUv, vec3 city) {
  vec2 meters = uv * uOpeningMeters;
  vec2 off = vec2(0.0);
  vec4 b0 = beadLayer(uv, meters, vec2(16.0, 14.0), 1.0, panoUv, city, off);
  vec4 b1 = beadLayer(uv + vec2(0.13, 0.07), meters + vec2(0.017, 0.0), vec2(8.5, 10.5), 0.72, panoUv, b0.rgb, off);
  vec4 b2 = vec4(b1.rgb, b1.a);
  if (uQuality > 0.5) {
    b2 = beadLayer(uv + vec2(0.41, 0.29), meters + vec2(0.0, 0.023), vec2(5.5, 6.2), 0.48, panoUv, b1.rgb, off);
  }
  vec3 col = b2.rgb;
  float total = b0.a + b1.a + b2.a;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float column = hash12(vec2(fi, 7.1)) * uOpeningMeters.x;
    vec2 ro;
    float m = runDrop(uv, meters, column, mix(0.020, 0.052, hash12(vec2(fi, 3.1))), hash12(vec2(fi, 9.4)), ro);
    vec3 rcol = sampleBlur(panoUv + ro * vec2(0.7, -0.9)).rgb * 0.9;
    rcol += vec3(1.0, 0.70, 0.35) * pow(m, 5.0) * 0.45;
    col = mix(col, rcol, clamp(m, 0.0, 0.88));
    off += ro * m;
    total += m;
  }
  float mist = 0.045 * smoothstep(0.05, 1.0, uRain);
  col = mix(col, sampleBlur(panoUv), mist);
  // Outside rain streaks, only visible against light.
  vec2 su = uv * vec2(72.0, 28.0) + vec2(uTime * -0.8, uTime * 5.0);
  vec2 sid = floor(su);
  vec2 sf = fract(su);
  float sr = step(0.982, hash12(sid)) * smoothstep(0.014, 0.0, abs(sf.x - 0.5)) * smoothstep(0.0, 0.62, sf.y) * smoothstep(1.0, 0.62, sf.y);
  col += vec3(0.26, 0.33, 0.43) * sr * smoothstep(0.45, 1.6, uRain);
  return mix(city, col, clamp(total, 0.0, 0.92));
}

void main() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec3 dirScene = rotateSceneDir(dir);
  vec2 panoUv = panoUvFromDir(dirScene);
  vec3 city = sampleCity(panoUv);
  city = animatedLights(panoUv, city);
  city = movingTraffic(panoUv, city);
  city = waterShimmer(panoUv, city);
  vec3 glare = vec3(0.0);
  vec4 boat = riverTraffic(dirScene, city, glare);
  city = mix(city, boat.rgb, boat.a) + glare;
  vec3 wet = rainOnGlass(vUv, panoUv, city);
  float lamp = exp(-dot((vUv - uReflectLampUv) * vec2(1.1, 1.8), (vUv - uReflectLampUv) * vec2(1.1, 1.8)) * 8.0);
  float tv = exp(-dot((vUv - uReflectTVUv) * vec2(1.5, 2.0), (vUv - uReflectTVUv) * vec2(1.5, 2.0)) * 13.0);
  wet += uReflectLamp * lamp * 0.12 + uReflectTV * tv * 0.055;
  float sky = smoothstep(0.58, 0.92, panoUv.y);
  wet += vec3(0.50, 0.58, 0.68) * uLightning * sky;
  wet *= uExposure;
  gl_FragColor = vec4(wet, 1.0);
}
`;

const fallbackFragmentShader = /* glsl */`
precision highp float;
uniform sampler2D uColor;
uniform float uExposure;
uniform vec2 uAzRange;
uniform vec2 uElRange;
uniform vec2 uPanoOffset;
uniform vec2 uViewRotate;
varying vec2 vUv;
varying vec3 vWorldPos;
vec2 panoUvFromDir(vec3 d) {
  float az = degrees(atan(d.x, -d.z));
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  vec2 ae = vec2(az, el) + uPanoOffset;
  return vec2((ae.x - uAzRange.x) / (uAzRange.y - uAzRange.x), (ae.y - uElRange.x) / (uElRange.y - uElRange.x));
}
vec3 rotateSceneDir(vec3 d) {
  float yaw = radians(uViewRotate.x);
  float lift = radians(-uViewRotate.y);
  float cy = cos(yaw);
  float sy = sin(yaw);
  d = vec3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float cx = cos(lift);
  float sx = sin(lift);
  return normalize(vec3(d.x, cx * d.y - sx * d.z, sx * d.y + cx * d.z));
}
void main() {
  vec3 dir = rotateSceneDir(normalize(vWorldPos - cameraPosition));
  gl_FragColor = vec4(texture2D(uColor, clamp(panoUvFromDir(dir), 0.001, 0.999)).rgb * uExposure, 1.0);
}
`;

function configureTexture(tex, renderer) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
  return tex;
}

async function loadTexture(loader, url, renderer) {
  return configureTexture(await loader.loadAsync(url), renderer);
}

function resolveBase(basePath) {
  return new URL(basePath, document.baseURI);
}

function assetUrl(baseUrl, name) {
  return new URL(name, baseUrl).href;
}

async function loadMeta(baseUrl) {
  const res = await fetch(assetUrl(baseUrl, 'city_meta.json'), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load city_meta.json: ${res.status}`);
  return res.json();
}

function fixedArray(length, make) {
  return Array.from({ length }, (_, i) => make(i));
}

function pathUniforms(items = [], max = 4) {
  const paths = fixedArray(max, () => new THREE.Vector4());
  const speeds = fixedArray(max, () => 0);
  items.slice(0, max).forEach((item, i) => {
    const a = item.path?.[0] ?? [0, 0];
    const b = item.path?.[1] ?? [0, 0];
    paths[i].set(a[0], a[1], b[0], b[1]);
    speeds[i] = item.speed ?? 0;
  });
  return { paths, speeds, count: Math.min(items.length, max) };
}

async function loadRiver(baseUrl) {
  try {
    const res = await fetch(assetUrl(baseUrl, 'river.json'), { cache: 'no-cache' });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// A track is given by two points picked on visible water in the panorama (azimuth, elevation in degrees);
// both are dropped onto the water plane `height` metres below the window, which fixes the boat in 3D.
function waterPoint([az, el], height) {
  const r = height / Math.tan(THREE.MathUtils.degToRad(Math.max(0.5, -el)));
  const a = THREE.MathUtils.degToRad(az);
  return new THREE.Vector2(r * Math.sin(a), -r * Math.cos(a));
}

function buildBoats(river) {
  const height = river?.height ?? 36;
  return (river?.tracks || []).slice(0, 3).map((t, i) => {
    const near = waterPoint(t.near, height);
    const far = waterPoint(t.far, height);
    const dir = far.clone().sub(near);
    const length = dir.length();
    dir.normalize();
    return {
      index: i,
      origin: near,
      dir,
      length,
      end: length + (t.beyond ?? 90),
      start: -(t.before ?? 28),
      boatLength: t.length ?? 8,
      boatWidth: t.width ?? 2.3,
      speed: t.speed ?? 3,
      every: t.every ?? [35, 80],
      kind: t.kind === 'cabin' ? 1 : t.kind === 'pilot' ? 2 : 0,
      directions: t.directions ?? [1, -1],
      boat: null,
      nextAt: t.first ?? 5 + i * 12,
    };
  });
}

export async function createWindowView({
  renderer,
  basePath = DEFAULT_BASE,
  quality = 'high',
  onLightning = null,
} = {}) {
  const loader = new THREE.TextureLoader();
  const baseUrl = resolveBase(basePath);
  const meta = await loadMeta(baseUrl);
  const suffix = quality === 'mobile' || quality === 'low' ? '_m' : '';
  const cars = pathUniforms(meta.cars ?? [], 4);
  const [river, color, lights, water, blur] = await Promise.all([
    loadRiver(baseUrl),
    loadTexture(loader, assetUrl(baseUrl, `city_color${suffix}.webp`), renderer),
    loadTexture(loader, assetUrl(baseUrl, `city_lights${suffix}.webp`), renderer),
    loadTexture(loader, assetUrl(baseUrl, `city_water${suffix}.webp`), renderer),
    loadTexture(loader, assetUrl(baseUrl, 'city_blur.webp'), renderer),
  ]);
  lights.colorSpace = THREE.NoColorSpace;
  water.colorSpace = THREE.NoColorSpace;
  const uniforms = {
    uColor: { value: color },
    uLights: { value: lights },
    uBlur: { value: blur },
    uWater: { value: water },
    uTime: { value: 0 },
    uRain: { value: 1 },
    uExposure: { value: 0.86 },
    uLightBoost: { value: 1.25 },
    uQuality: { value: quality === 'low' ? 0 : 1 },
    uLightning: { value: 0 },
    uReflectLamp: { value: new THREE.Color(1.0, 0.56, 0.23) },
    uReflectTV: { value: new THREE.Color(0.28, 0.55, 1.0) },
    uReflectLampUv: { value: new THREE.Vector2(0.13, 0.40) },
    uReflectTVUv: { value: new THREE.Vector2(0.42, 0.50) },
    uOpeningMeters: { value: OPENING.clone() },
    uAzRange: { value: new THREE.Vector2(meta.azimuth?.[0] ?? -55, meta.azimuth?.[1] ?? 35) },
    uElRange: { value: new THREE.Vector2(meta.elevation?.[0] ?? -50, meta.elevation?.[1] ?? 45) },
    uPanoOffset: { value: new THREE.Vector2(0, 0) },
    uViewRotate: { value: new THREE.Vector2(meta.view?.yaw ?? 0, meta.view?.lift ?? 0) },
    uCarPaths: { value: cars.paths },
    uCarSpeeds: { value: cars.speeds },
    uCarCount: { value: cars.count },
    uRiverH: { value: river?.height ?? 36 },
    uBoatGeo: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatSpan: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatLook: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatCount: { value: 0 },
  };
  const tracks = buildBoats(river);
  uniforms.uBoatCount.value = tracks.length;
  tracks.forEach((t, i) => uniforms.uBoatGeo.value[i].set(t.origin.x, t.origin.y, t.dir.x, t.dir.y));
  const observer = new THREE.Vector3(0, uniforms.uRiverH.value, 0);
  const pick = (range) => range[0] + Math.random() * (range[1] - range[0]);
  const launch = (track, time, { dir = null, at = null } = {}) => {
    const d = dir ?? track.directions[Math.floor(Math.random() * track.directions.length)];
    const len = track.boatLength;
    const speed = track.speed * (0.82 + Math.random() * 0.28);
    const s0 = at ?? (d > 0 ? track.start : track.end + len);
    track.boat = { dir: d, len, speed, front: s0, lights: 0.82 + Math.random() * 0.28, startedAt: time };
  };
  const boatSpan = (b) => (b.dir > 0 ? [b.front - b.len, b.front] : [b.front, b.front + b.len]);
  // distance from the window to the nearest point of a boat (for its sound)
  const boatDistance = (track) => {
    const b = track.boat;
    if (!b) return Infinity;
    const [a, c] = boatSpan(b);
    const sx = THREE.MathUtils.clamp(-(track.origin.x * track.dir.x + track.origin.y * track.dir.y), a, c);
    const p = new THREE.Vector3(track.origin.x + track.dir.x * sx, 0.7, track.origin.y + track.dir.y * sx);
    return observer.distanceTo(p);
  };
  const material = new THREE.ShaderMaterial({
    name: 'WindowRainRiaMaterial',
    vertexShader,
    fragmentShader,
    uniforms,
    toneMapped: false,
    depthWrite: false,
  });
  let rain = 1;
  let lightning = 0;
  let lightningAt = 42 + Math.random() * 60;
  let thunderQueued = false;
  return {
    material,
    uniforms,
    meta,
    tracks,
    update(time, dt = 0, camera = null) {
      uniforms.uTime.value = time;
      for (const track of tracks) {
        const u = uniforms.uBoatSpan.value[track.index];
        if (!track.boat && time >= track.nextAt) launch(track, time);
        const b = track.boat;
        if (!b) { u.w = 0; continue; }
        b.front += b.dir * b.speed * Math.min(dt, 0.1);
        const [a, c] = boatSpan(b);
        if ((b.dir > 0 && a > track.end + 8) || (b.dir < 0 && c < track.start)) {
          track.boat = null;
          track.nextAt = time + pick(track.every);
          u.w = 0;
          continue;
        }
        u.set(a, c, b.dir, 1);
        uniforms.uBoatLook.value[track.index].set(track.boatLength, track.boatWidth, track.kind, b.lights);
      }
      if (rain >= 1 && time > lightningAt) {
        lightning = 1.0;
        lightningAt = time + 40 + Math.random() * 80;
        thunderQueued = false;
      }
      if (lightning > 0) {
        if (!thunderQueued && onLightning) {
          thunderQueued = true;
          onLightning(1.7 + Math.random() * 4.0);
        }
        lightning = Math.max(0, lightning - Math.max(dt, 1 / 120) * 4.6);
      }
      uniforms.uLightning.value = lightning * (0.65 + 0.35 * Math.sin(time * 74.0));
      if (camera) material.uniformsNeedUpdate = false;
    },
    // someone is looking out: make sure something happens soon (a boat, and now and then a flash)
    lookingOut(on, time) {
      if (!on) return;
      if (!tracks.some((t) => t.boat)) {
        const soonest = tracks.reduce((m, t) => (!m || t.nextAt < m.nextAt ? t : m), null);
        if (soonest) soonest.nextAt = Math.min(soonest.nextAt, time + 0.8 + Math.random() * 1.6);
      }
      if (rain >= 1 && lightningAt - time > 25 && Math.random() < 0.6) lightningAt = time + 9 + Math.random() * 10;
    },
    // 0..1: how loud the nearest boat should be, heard through the glass
    boatLoudness() {
      let best = 0;
      for (const t of tracks) {
        const d = boatDistance(t);
        if (Number.isFinite(d)) best = Math.max(best, THREE.MathUtils.clamp(34 / d, 0, 1) * (1 - THREE.MathUtils.smoothstep(d, 240, 520)));
      }
      return best;
    },
    // QA / debugging: put a boat somewhere on a track right now
    placeBoat(index, front, dir = 1) {
      const t = tracks[index];
      if (t) launch(t, uniforms.uTime.value, { dir, at: front });
      return t?.boat || null;
    },
    setRain(intensity) {
      rain = Math.max(0, Math.min(2, intensity));
      uniforms.uRain.value = rain;
    },
    flash() {
      lightning = 1.0;
      thunderQueued = false;
    },
    dispose() {
      color.dispose();
      lights.dispose();
      water.dispose();
      blur.dispose();
      material.dispose();
    },
  };
}

export async function createWindowViewFallback({ basePath = DEFAULT_BASE, renderer } = {}) {
  const loader = new THREE.TextureLoader();
  const baseUrl = resolveBase(basePath);
  const meta = await loadMeta(baseUrl);
  const color = await loadTexture(loader, assetUrl(baseUrl, 'city_color_m.webp'), renderer);
  const material = new THREE.ShaderMaterial({
    name: 'WindowCityFallbackMaterial',
    vertexShader,
    fragmentShader: fallbackFragmentShader,
    uniforms: {
      uColor: { value: color },
      uExposure: { value: 1 },
      uAzRange: { value: new THREE.Vector2(meta.azimuth?.[0] ?? -55, meta.azimuth?.[1] ?? 35) },
      uElRange: { value: new THREE.Vector2(meta.elevation?.[0] ?? -50, meta.elevation?.[1] ?? 45) },
      uPanoOffset: { value: new THREE.Vector2(0, 0) },
    uViewRotate: { value: new THREE.Vector2(meta.view?.yaw ?? 0, meta.view?.lift ?? 0) },
    },
    toneMapped: false,
    depthWrite: false,
  });
  return {
    material,
    meta,
    update() {},
    setRain() {},
    flash() {},
    dispose() {
      color.dispose();
      material.dispose();
    },
  };
}
