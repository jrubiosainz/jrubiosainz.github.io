import * as THREE from 'three';
import { asset } from '../base.js';
import { loadTexture as decodeTexture, loadPixels, flushTextures } from './texload.js';

const OPENING = new THREE.Vector2(1.32, 1.40);
const DEFAULT_BASE = asset('assets/window/');

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
uniform float uViewShift;
uniform vec4 uCarPaths[4];
uniform float uCarSpeeds[4];
uniform int uCarCount;
// small boats on the ría: boxes on straight tracks on a water plane, uRiverH metres below the window
uniform float uRiverH;
uniform vec4 uBoatGeo[3];     // track origin (x, z) and unit direction (x, z), river coordinates
uniform vec4 uBoatSpan[3];    // sMin, sMax along the track, dir (+1 bow at sMax), visible (0/1)
uniform vec4 uBoatLook[3];    // length, width, kind, light intensity
uniform int uBoatCount;
// boat lights, worked out per frame on the CPU: direction from the eye, colour (0 when hidden), and where their
// reflection starts on the water (azimuth, elevation in radians, strength, width)
uniform vec3 uLightDir[15];
uniform vec3 uLightCol[15];
uniform vec4 uReflAE[15];
uniform vec3 uReflCol[15];
uniform int uLightCount;
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


// From a room ray to the panorama. The view is SHIFTED, not tilted: like a shift lens (or a film set's backdrop), the
// city is moved down behind the window so that the ría shows from the desk, while its verticals stay vertical and
// parallel to the window frame (a tilt made them converge: two perspectives in one frame). uViewShift = tan(shift);
// the shear is relative to the window plane (outside is -z). uViewRotate: yaw, and an optional tilt (0).
vec3 rotateSceneDir(vec3 d) {
  d = vec3(d.x, d.y + uViewShift * d.z, d.z);
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
  // footbridge LEDs: a slow shimmer runs along the arch, warm white to cool white, on their own pixels
  if (m.g > 0.004) {
    float wv = uTime * 0.16 - uv.x * 60.0;
    float w1 = 0.5 + 0.5 * sin(wv);
    float w2 = 0.5 + 0.5 * sin(wv * 0.61 + 1.7);
    vec3 tint = mix(vec3(1.03, 1.0, 0.96), vec3(0.96, 0.99, 1.05), w1);
    base = mix(base, base * tint * (0.93 + 0.1 * w2), clamp(m.g, 0.0, 1.0));
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

float sdBox3(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// A small boat in its own frame: x from the bow (0) back to the stern (length), y up from the waterline, z to
// starboard. look = (length, beam, kind, lights); kind 0 an open launch, 1 a cabin cruiser, 2 a pilot boat.
// part: 0 hull, 1 cabin, 2 mast. The window side mirrors these numbers in boatLightsFor() (JS).
float boatSdf(vec3 p, vec4 look, out float part) {
  float len = look.x;
  float hw = look.y * 0.5;
  float kind = look.z;
  float rake = 0.38 * max(p.y, 0.0);                       // the stem leans forward
  float u = clamp((p.x + rake) / (len * 0.36), 0.0, 1.0);
  float fb = mix(1.3, 0.85, u);                            // the sheer rises towards the bow
  float halfW = hw * sqrt(u) * (0.86 + 0.14 * clamp(p.y / fb, 0.0, 1.0));   // pointed bow, flared topsides
  float hull = max(max((abs(p.z) - halfW) * 0.7, max((-p.x - rake) * 0.93, p.x - len)), max(p.y - fb, -p.y - 0.3));
  float c0 = len * (kind > 1.5 ? 0.40 : (kind > 0.5 ? 0.28 : 0.42));
  float c1 = len * (kind > 1.5 ? 0.74 : (kind > 0.5 ? 0.72 : 0.66));
  float ch = kind > 0.5 ? 1.45 : 1.0;
  float cabin = sdBox3(p - vec3((c0 + c1) * 0.5, 0.85 + ch * 0.5, 0.0), vec3((c1 - c0) * 0.5, ch * 0.5, hw * 0.64));
  float mast = max(length(p.xz - vec2(c0 + 0.45, 0.0)) - 0.05, abs(p.y - (0.85 + ch + 0.55)) - 0.55);
  float d = min(hull, min(cabin, mast));
  part = d == cabin ? 1.0 : (d == mast ? 2.0 : 0.0);
  return d;
}

vec3 boatNormal(vec3 p, vec4 look) {
  float q;
  const vec2 e = vec2(0.03, 0.0);
  return normalize(vec3(boatSdf(p + e.xyy, look, q) - boatSdf(p - e.xyy, look, q),
                        boatSdf(p + e.yxy, look, q) - boatSdf(p - e.yxy, look, q),
                        boatSdf(p + e.yyx, look, q) - boatSdf(p - e.yyx, look, q)));
}

// night light on a hull: the city's warm glow from above, a lamp on the bank, a wet sheen at grazing angles
vec3 boatShade(vec3 p, vec3 nrm, float part, vec4 look, vec3 view) {
  float kind = look.z;
  float ch = kind > 0.5 ? 1.45 : 1.0;
  vec3 hullCol = kind > 1.5 ? vec3(0.09, 0.07, 0.06) : (kind > 0.5 ? vec3(0.62, 0.62, 0.6) : vec3(0.07, 0.09, 0.12));
  vec3 alb = part > 0.5 ? (kind > 1.5 ? vec3(0.55, 0.3, 0.12) : vec3(0.66, 0.65, 0.62)) : hullCol;
  if (part < 0.5 && nrm.y > 0.6) alb = vec3(0.16, 0.14, 0.12);
  if (part > 1.5) alb = vec3(0.2);
  if (part < 0.5 && abs(nrm.y) < 0.6) {                   // topsides: a pale rub rail and waterline stripe
    float fb = mix(1.3, 0.85, clamp((p.x + 0.38 * max(p.y, 0.0)) / (look.x * 0.36), 0.0, 1.0));
    float rail = smoothstep(fb - 0.16, fb - 0.12, p.y) * (1.0 - smoothstep(fb - 0.05, fb - 0.02, p.y));
    float boot = smoothstep(0.04, 0.07, p.y) * (1.0 - smoothstep(0.13, 0.16, p.y));
    alb = mix(alb, vec3(0.72, 0.7, 0.66), max(rail, boot * 0.8));
  }
  float amb = 0.012 * (0.55 + 0.45 * nrm.y);
  float key = 0.022 * max(dot(nrm, normalize(vec3(-0.35, 0.75, 0.45))), 0.0);
  vec3 col = alb * (amb + key) * vec3(1.0, 0.74, 0.52);
  col += vec3(1.0, 0.7, 0.45) * pow(1.0 - abs(dot(nrm, -view)), 4.0) * 0.012;
  col *= mix(0.55, 1.0, smoothstep(0.02, 0.25, p.y));
  if (part > 0.5 && part < 1.5 && abs(nrm.y) < 0.5) {    // cabin windows, lit from inside
    float y0 = 0.85 + ch * 0.42;
    float y1 = 0.85 + ch * 0.8;
    float band = smoothstep(y0, y0 + 0.04, p.y) * (1.0 - smoothstep(y1 - 0.04, y1, p.y));
    float along = abs(nrm.z) > abs(nrm.x) ? p.x : p.z * 2.0;
    float f = fract(along / 0.8);
    col += vec3(1.0, 0.72, 0.4) * band * smoothstep(0.08, 0.14, f) * (1.0 - smoothstep(0.84, 0.9, f)) * 0.26 * look.w;
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

// Boats: ray-marched hulls, opaque and hidden where the footbridge stands between us and the water under them; a
// faint wake; their navigation lights (points with a rainy halo) and the lights' long broken reflections.
vec4 riverTraffic(vec3 d, vec3 haze, float pixA, float waterHere, inout vec3 glow, inout vec3 onWater) {
  vec4 hit = vec4(0.0);
  float best = 1e9;
  float tg = d.y < -1e-4 ? uRiverH / -d.y : -1.0;
  vec2 gxz = d.xz * max(tg, 0.0);                          // where this pixel's ray meets the water
  for (int i = 0; i < 3; i++) {
    if (i >= uBoatCount) break;
    vec4 span = uBoatSpan[i];
    if (span.w < 0.5) continue;
    vec4 geo = uBoatGeo[i];
    vec4 look = uBoatLook[i];
    float dir = span.z;
    vec2 u = geo.zw;
    vec2 n = vec2(-u.y, u.x);
    float bow = dir > 0.0 ? span.y : span.x;
    float len = look.x;
    float hw = look.y * 0.5;
    // the eye and this pixel's ray in the boat's frame
    vec3 ob = vec3(dir * (bow + dot(geo.xy, u)), uRiverH, -dir * dot(geo.xy, n));
    vec3 db = vec3(-dir * dot(d.xz, u), d.y, dir * dot(d.xz, n));
    vec3 dd = mix(db, vec3(1e-6), step(abs(db), vec3(1e-6)));
    vec3 inv = 1.0 / dd;
    vec3 t0 = (vec3(-0.05, -0.3, -hw - 0.05) - ob) * inv;
    vec3 t1 = (vec3(len + 0.05, 3.6, hw + 0.05) - ob) * inv;
    vec3 tmn = min(t0, t1);
    vec3 tmx = max(t0, t1);
    float tn = max(max(tmn.x, tmn.y), tmn.z);
    float tf = min(min(tmx.x, tmx.y), tmx.z);
    if (tn < tf && tf > 0.0 && tn < best) {
      float t = max(tn, 0.0);
      float closest = 1e9;
      float tc = t;
      float part = 0.0;
      bool found = false;
      for (int k = 0; k < 40; k++) {
        float pr;
        float ds = boatSdf(ob + db * t, look, pr);
        float eps = t * pixA;
        if (ds / eps < closest) { closest = ds / eps; tc = t; part = pr; }
        if (ds < eps * 0.35) { found = true; break; }
        t += max(ds * 0.75, eps * 0.4);
        if (t > tf) break;
      }
      float cover = found ? 1.0 : 1.0 - smoothstep(0.0, 1.0, closest);    // anti-aliased silhouette
      if (cover > 0.001) {
        vec3 p = ob + db * tc;
        vec2 wxz = geo.xy + u * (bow - dir * p.x) + n * (dir * p.z);
        float wm = texture2D(uWater, clamp(panoUvFromDir(normalize(vec3(wxz.x, -uRiverH, wxz.y))), 0.001, 0.999)).r;
        cover *= smoothstep(0.25, 0.55, wm);
        if (cover > 0.001) {
          vec3 col = boatShade(p, boatNormal(p, look), part, look, normalize(db));
          best = tn;
          hit = vec4(mix(col, haze, 1.0 - exp(-tc / 420.0)), cover);
        }
      }
    }
    // wake: two thin arms opening at about 19.5 degrees from the bow, and a wash behind the stern
    if (waterHere > 0.15 && tg > 0.0) {
      vec2 r = gxz - geo.xy;
      float bx = dir * (bow - dot(r, u));
      float bz = dir * dot(r, n);
      if (bx > 0.0 && bx < 90.0) {
        float arm = (abs(bz) - bx * 0.354) / (0.2 + bx * 0.03);
        float wash = bx > len ? exp(-bz * bz / (hw * hw * 0.8)) * exp(-(bx - len) / 9.0) : 0.0;
        float wake = (exp(-arm * arm) * exp(-bx / 32.0) * 0.6 + wash) * look.w;
        onWater += vec3(0.62, 0.62, 0.6) * wake * 0.01 * waterHere * exp(-tg / 500.0);
      }
    }
  }
  vec2 ae = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0)));
  float sc = max(pixA * 0.85, 0.00025);
  for (int k = 0; k < 15; k++) {
    if (k >= uLightCount) break;
    vec3 lc = uLightCol[k];
    if (lc.r + lc.g + lc.b > 0.0) {
      float a = sqrt(max(0.0, 2.0 - 2.0 * dot(d, uLightDir[k])));
      glow += lc * (exp(-pow(a / sc, 2.0)) * 1.4 + exp(-pow(a / 0.0035, 2.0)) * 0.09 + exp(-pow(a / 0.012, 2.0)) * 0.015);
    }
    vec4 rf = uReflAE[k];
    if (rf.z > 0.0 && waterHere > 0.05) {
      float da = ae.x - rf.x;
      da -= 6.2831853 * floor((da + 3.1415927) / 6.2831853);
      float de = ae.y - rf.y;
      float along = de < 0.0 ? exp(de / 0.03) : exp(-pow(de / 0.003, 2.0));
      // broken by the ripples: uneven dashes, each nudged sideways, flickering as the water moves
      float band = ae.y * 900.0 + uTime * 1.3;
      float bi = floor(band);
      float rr = hash12(vec2(bi, float(k) * 7.3));
      float ripple = 0.2 + 0.8 * rr * rr * smoothstep(0.0, 0.3, fract(band)) * smoothstep(1.0, 0.7, fract(band));
      float wa = da / rf.w + (hash12(vec2(bi, float(k) + 3.1)) - 0.5) * 1.6;
      onWater += uReflCol[k] * rf.z * exp(-wa * wa) * along * ripple * waterHere;
    }
  }
  return hit;
}

// Glass coordinates are metres on the pane, x to the right and y UP (vUv runs top to bottom on this plane).
// Small beads: every cell may hold one. Now and then one lands (it grows in a blink), sits, and is carried away,
// and the runners sweep them off their path (wipe).
vec4 beadLayer(vec2 meters, vec2 cellMm, float scale, float seed, vec2 panoUv, vec3 city, float wipe, inout vec2 refractOffset) {
  vec2 grid = meters / (cellMm * 0.001);
  vec2 id = floor(grid);
  vec2 f = fract(grid) - 0.5;
  float lt = uTime * (0.012 + 0.03 * hash12(id + 11.3 + seed)) + hash12(id + 5.1 + seed);
  float gen = floor(lt);                                  // every landing in a new spot, with a new size
  float life = fract(lt);
  vec2 c = (hash22(id + seed + gen * 1.37) - 0.5) * 0.48;
  float rnd = hash12(id + 3.7 + seed + gen * 2.11);
  float landed = smoothstep(0.0, 0.006, life) * (1.0 - smoothstep(0.9, 0.915, life));
  float radius = mix(0.11, 0.30, rnd) * scale * (0.6 + 0.4 * smoothstep(0.0, 0.02, life));
  float m = softCircle(f - c, radius, 0.035);
  m *= step(0.55, rnd) * landed * smoothstep(0.08, 0.70, uRain) * (1.0 - wipe);
  vec2 n = normalize(f - c + 1e-4);
  refractOffset += n * m * (0.0020 + 0.0032 * rnd) * uRain;
  float rim = smoothstep(radius * 0.45, radius, length(f - c)) * m;
  // a bead is a tiny fisheye lens: a wide, upside-down view of the city, lights in focus, and a dark rim where the
  // light is reflected back inside the water
  vec2 q = (f - c) / max(radius, 1e-4);
  vec2 suv = panoUv - q * vec2(0.075, 0.13) * (0.7 + 0.3 * rnd);
  vec3 drop = mix(sampleBlur(suv).rgb, sampleCity(suv), 0.55) * (0.95 + rnd * 0.2);
  float lightCatch = dot(sampleCity(suv), vec3(0.30, 0.50, 0.20));
  float glint = pow(max(0.0, 1.0 - length(q - vec2(-0.38, 0.42)) * 2.2), 5.0) * m;
  // the brighter sky above lands, upside down, in the lower part of each bead
  vec3 sky = sampleBlur(vec2(panoUv.x - q.x * 0.05, 0.63)).rgb;
  drop += sky * smoothstep(0.1, 0.85, -q.y) * (1.0 - smoothstep(0.78, 1.0, length(q))) * 0.9;
  drop += vec3(1.0, 0.78, 0.5) * (glint * 0.5 + smoothstep(0.45, 1.0, lightCatch) * m * 0.12);
  drop *= 1.0 - rim * 0.5;
  return vec4(mix(city, drop, m * 0.86), m * 0.55);
}

float runnerPath(float y, float x0, float g1, float g2) {
  return x0 + 0.004 * sin(y * 11.0 + g1 * 6.2832) + 0.0025 * sin(y * 29.0 + g2 * 6.2832);
}

// Runners: a drop grows heavy where it formed, then slips down the pane in jerks, wandering a few millimetres from
// side to side, and leaves a thin wet trail with a few beads in it. One per column at a time; many columns stay dry.
// Returns the drop's colour (a tiny lens: a wide, upside-down view of what is behind it) and its coverage.
vec4 runner(vec2 m, float colW, float seed, vec2 panoUv, inout float wipe) {
  float cid = floor(m.x / colW);
  if (hash12(vec2(cid, seed)) > 0.75 * smoothstep(0.35, 1.2, uRain)) return vec4(0.0);
  float period = mix(18.0, 40.0, hash12(vec2(cid, seed + 4.3)));
  float T = uTime / period + hash12(vec2(cid, seed + 9.1));
  float gen = floor(T);
  float g1 = hash12(vec2(cid, gen + seed));
  float g2 = hash12(vec2(cid + 7.0, gen + seed));
  float k = clamp(fract(T) / mix(0.6, 0.85, g1), 0.0, 1.0);      // then the column rests until the next one
  float fadeOut = 1.0 - smoothstep(0.86, 1.0, fract(T));         // its trail dries before a new drop starts
  float grow = smoothstep(0.0, 0.12, k);                         // it swells in place before it lets go
  float kk = clamp((k - 0.12) / 0.88, 0.0, 1.0);
  float nSteps = 8.0;
  float si = floor(kk * nSteps);
  float hold = mix(0.1, 0.5, hash12(vec2(si + gen * 13.0, cid + seed)));
  float s = kk >= 1.0 ? 1.0 : (si + smoothstep(hold, 1.0, fract(kk * nSteps))) / nSteps;
  float yStart = uOpeningMeters.y * mix(0.45, 1.0, g1);
  float yHead = mix(yStart, -0.06, s);
  float x0 = (cid + 0.5 + (g2 - 0.5) * 0.4) * colW;
  float r = mix(0.004, 0.0065, g2) * mix(0.45, 1.0, grow);
  vec2 q = m - vec2(runnerPath(yHead, x0, g1, g2), yHead);
  vec2 e = q / vec2(r, r * (q.y > 0.0 ? 1.3 : 0.95));            // a round front, a short tail above
  float head = smoothstep(1.0, 0.8, length(e)) * (1.0 - step(1.0, kk));
  float up = m.y - yHead;
  float trailLen = min(yStart - yHead, 0.35);
  float dx = m.x - runnerPath(m.y, x0, g1, g2);
  float wT = r * mix(0.45, 0.1, clamp(up / max(trailLen, 1e-3), 0.0, 1.0));
  float trail = smoothstep(wT, wT * 0.25, abs(dx)) * step(0.0, up) * (1.0 - smoothstep(trailLen * 0.4, trailLen, up)) * fadeOut;
  float sp = 0.018;                                              // beads left behind in the trail
  float bi = floor(m.y / sp);
  float bh = hash12(vec2(bi, cid + gen * 3.1 + seed));
  float by = (bi + 0.5) * sp;
  vec2 bc = vec2(runnerPath(by, x0, g1, g2) + (bh - 0.5) * 0.0015, by);
  float br = r * mix(0.25, 0.45, bh) * step(0.35, bh);
  vec2 bq = (m - bc) / max(br, 1e-5);
  float bead = smoothstep(1.0, 0.6, length(bq)) * step(yHead + r * 2.0, by) * step(by, yHead + trailLen) * fadeOut;
  wipe = max(wipe, smoothstep(r * 1.6, r * 0.8, abs(dx)) * step(0.0, up + r) * (1.0 - smoothstep(trailLen * 0.6, trailLen * 1.3, up)) * fadeOut);
  float cover = max(max(head, trail * 0.6), bead * 0.85);
  if (cover <= 0.0) return vec4(0.0);
  if (head <= 0.0 && bead <= 0.0) {
    // the wet trail: a thin water lens that bends the lights behind it sideways, dark at its edges
    float tx = dx / max(wT, 1e-5);
    vec3 c = sampleCity(panoUv + vec2(-tx * 0.006, 0.0)) * (1.0 + 0.5 * (1.0 - tx * tx)) * (0.7 + 0.3 * (1.0 - abs(tx)));
    c += vec3(1.0, 0.82, 0.6) * 0.012 * (1.0 - tx * tx);                 // the wet line catches the room's light
    return vec4(c, cover);
  }
  vec2 lq = head > 0.0 ? e : bq;
  float lens = head > 0.0 ? 1.0 : 0.6;
  float L = length(lq);
  // a drop is a tiny fisheye: a wide, upside-down view of what is behind it, the lights sharp and concentrated
  vec2 suv = panoUv - lq * vec2(0.16, 0.24) * lens;
  vec3 c = mix(sampleBlur(suv), sampleCity(suv), 0.8) * 1.5;
  // the glowing sky lands, upside down, in its lower half, brightest just inside the lower edge
  float lowRim = smoothstep(0.15, 0.9, -lq.y) * smoothstep(1.0, 0.72, L);
  c += sampleBlur(vec2(panoUv.x - lq.x * 0.04, 0.6)) * lowRim * 1.4 * lens;
  // light bent away from the viewer at its edges: a dark outline
  c *= 1.0 - smoothstep(0.62, 0.98, L) * 0.75;
  // and the room's lamp caught near its top, a soft spot with a hard core
  vec2 gq = lq - vec2(-0.32, 0.42);
  c += vec3(1.0, 0.82, 0.58) * (exp(-dot(gq, gq) * 40.0) * 1.6 + exp(-dot(gq, gq) * 7.0) * 0.12) * lens;
  return vec4(c, cover);
}

vec3 rainOnGlass(vec2 glass, vec2 panoUv, vec3 city) {
  vec2 m = glass * uOpeningMeters;
  vec2 off = vec2(0.0);
  float wipe = 0.0;
  vec4 r0 = runner(m, 0.075, 1.0, panoUv, wipe);
  vec4 r1 = runner(m + vec2(0.031, 0.0), 0.11, 7.0, panoUv, wipe);
  vec4 r2 = vec4(0.0);
  if (uQuality > 0.5) r2 = runner(m + vec2(0.052, 0.0), 0.16, 13.0, panoUv, wipe);
  vec4 b0 = beadLayer(m, vec2(16.0, 14.0), 1.0, 0.0, panoUv, city, wipe, off);
  vec4 b1 = beadLayer(m + vec2(0.017, 0.0), vec2(8.5, 10.5), 0.72, 17.0, panoUv, b0.rgb, wipe, off);
  vec4 b2 = b1;
  if (uQuality > 0.5) b2 = beadLayer(m + vec2(0.0, 0.023), vec2(5.5, 6.2), 0.48, 31.0, panoUv, b1.rgb, wipe, off);
  vec3 col = b2.rgb;
  col = mix(col, r0.rgb, clamp(r0.a, 0.0, 0.95));
  col = mix(col, r1.rgb, clamp(r1.a, 0.0, 0.95));
  col = mix(col, r2.rgb, clamp(r2.a, 0.0, 0.95));
  vec3 wet = mix(city, col, clamp(b0.a + b1.a + b2.a + r0.a + r1.a + r2.a, 0.0, 0.92));
  // a faint film of water on the pane, clearer where the drops have run
  wet = mix(wet, sampleBlur(panoUv), 0.05 * smoothstep(0.05, 1.0, uRain) * (1.0 - wipe * 0.8));
  // rain falling outside, caught by the light: fine streaks going down, slanted a little by the wind
  vec2 su = glass * vec2(90.0, 30.0);
  su.x -= uTime * 3.8;                                   // drifting right while falling: about 8 degrees
  su.y += uTime * 9.0;
  vec2 sid = floor(su);
  vec2 sf = fract(su);
  float lineX = 0.5 + (0.5 - sf.y) * 0.45;
  float sr = step(0.982, hash12(sid)) * smoothstep(0.05, 0.0, abs(sf.x - lineX)) * smoothstep(0.0, 0.5, sf.y) * smoothstep(1.0, 0.5, sf.y);
  float lit = dot(city, vec3(0.3, 0.5, 0.2));
  wet += vec3(0.8, 0.86, 0.95) * sr * (0.012 + lit * 0.9) * smoothstep(0.45, 1.6, uRain);
  return wet;
}

void main() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec3 dirScene = rotateSceneDir(dir);
  vec2 panoUv = panoUvFromDir(dirScene);
  vec3 city = sampleCity(panoUv);
  city = animatedLights(panoUv, city);
  city = movingTraffic(panoUv, city);
  city = waterShimmer(panoUv, city);
  float pixA = max(length(fwidth(dirScene)), 1e-5);
  float waterHere = dirScene.y < -1e-4 ? texture2D(uWater, clamp(panoUv, 0.001, 0.999)).r : 0.0;
  vec3 glare = vec3(0.0);
  vec3 onWater = vec3(0.0);
  vec4 boat = riverTraffic(dirScene, sampleBlur(panoUv), pixA, waterHere, glare, onWater);
  city = mix(city + onWater, boat.rgb, boat.a) + glare;
  vec3 wet = rainOnGlass(vec2(vUv.x, 1.0 - vUv.y), panoUv, city);
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
uniform float uViewShift;
varying vec2 vUv;
varying vec3 vWorldPos;
vec2 panoUvFromDir(vec3 d) {
  float az = degrees(atan(d.x, -d.z));
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  vec2 ae = vec2(az, el) + uPanoOffset;
  return vec2((ae.x - uAzRange.x) / (uAzRange.y - uAzRange.x), (ae.y - uElRange.x) / (uElRange.y - uElRange.x));
}
vec3 rotateSceneDir(vec3 d) {
  d = vec3(d.x, d.y + uViewShift * d.z, d.z);
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

// the panorama is stored top row first and sampled with v up: flipped while decoding
async function loadTexture(url, renderer, { srgb = true } = {}) {
  const tex = configureTexture(await decodeTexture(url, { flipY: true, srgb }), renderer);
  if (!srgb) tex.colorSpace = THREE.NoColorSpace;
  return tex;
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

// A small copy of the water mask on the CPU: whether a boat's light is seen against the water or hidden behind
// the footbridge (or a bank). Same mapping as panoUvFromDir(); v = 0 is the bottom row, like the GPU texture.
async function loadMask(url, width = 1024) {
  try {
    const { w, h, data } = await loadPixels(url, width);
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i += 1) m[i] = data[i * 4];
    return { w, h, m };
  } catch (err) {
    console.warn('water mask unavailable: boat lights will not hide behind the bridge', err);
    return null;
  }
}

function maskSampler(mask, azRange, elRange) {
  const [az0, az1] = azRange;
  const [el0, el1] = elRange;
  return (d) => {
    if (!mask) return 1;
    const az = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z));
    const el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
    const u = (az - az0) / (az1 - az0);
    const v = (el - el0) / (el1 - el0);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const x = u * (mask.w - 1);
    const y = (1 - v) * (mask.h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, mask.w - 1);
    const y1 = Math.min(y0 + 1, mask.h - 1);
    const fx = x - x0;
    const fy = y - y0;
    const g = (xx, yy) => mask.m[yy * mask.w + xx];
    return ((g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy) / 255;
  };
}

// Where a boat carries its lights, in the boat's frame (x from the bow back, y up from the waterline, z to
// starboard); the numbers follow boatSdf() in the shader. 'cabin' is the lit wheelhouse: only its reflection.
function boatLightsFor(track) {
  const len = track.boatLength;
  const hw = track.boatWidth / 2;
  const kind = track.kind;
  const c0 = len * (kind === 2 ? 0.40 : kind === 1 ? 0.28 : 0.42);
  const c1 = len * (kind === 2 ? 0.74 : kind === 1 ? 0.72 : 0.66);
  const ch = kind > 0 ? 1.45 : 1.0;
  return [
    { p: [c0 - 0.05, 0.85 + ch * 0.55, -hw * 0.64 - 0.03], col: [1.0, 0.07, 0.03], arc: 'port' },
    { p: [c0 - 0.05, 0.85 + ch * 0.55, hw * 0.64 + 0.03], col: [0.08, 1.0, 0.3], arc: 'stbd' },
    { p: [c0 + 0.45, 0.85 + ch + 1.1, 0], col: [1.0, 0.93, 0.8], arc: 'mast' },
    { p: [len - 0.12, 1.05, 0], col: [1.0, 0.93, 0.8], arc: 'stern' },
    { p: [(c0 + c1) / 2, 0.85 + ch * 0.6, 0], col: [1.0, 0.7, 0.38], arc: 'cabin' },
  ];
}

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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

// How far the city is shifted down behind the window (tan of the angle), from where the camera is. From the desk (far
// from the glass) the full shift brings the ría into view; leaning on the glass (LOOK OUTSIDE) there is none, and the
// view is the photo's own perspective. In between it eases, so flying to the window the city settles into place.
const GLASS_Z = -0.82;           // the window glass (three.js z; blender/lib/layout.py ROOM win_frame_y)
const SHIFT_NEAR = 0.7;          // metres from the glass: no shift
const SHIFT_FAR = 1.6;           // metres from the glass: the full shift
function viewShift(meta, camera) {
  const deg = meta.view?.shift ?? 0;
  if (!deg) return 0;
  const d = Math.max(0, camera.position.z - GLASS_Z);
  return Math.tan(THREE.MathUtils.degToRad(deg * smooth(SHIFT_NEAR, SHIFT_FAR, d)));
}

export async function createWindowView({
  renderer,
  basePath = DEFAULT_BASE,
  quality = 'high',
  onLightning = null,
} = {}) {
  const baseUrl = resolveBase(basePath);
  const meta = await loadMeta(baseUrl);
  const suffix = quality === 'mobile' || quality === 'low' ? '_m' : '';
  const cars = pathUniforms(meta.cars ?? [], 4);
  // the water mask and the blurred copy are soft: 4096 and 2048 wide are plenty (and a fraction of the upload)
  const [river, color, lights, water, blur, mask] = await Promise.all([
    loadRiver(baseUrl),
    loadTexture(assetUrl(baseUrl, `city_color${suffix}.webp`), renderer),
    loadTexture(assetUrl(baseUrl, `city_lights${suffix}.webp`), renderer, { srgb: false }),
    loadTexture(assetUrl(baseUrl, 'city_water_m.webp'), renderer, { srgb: false }),
    loadTexture(assetUrl(baseUrl, 'city_blur.webp'), renderer),
    loadMask(assetUrl(baseUrl, 'city_water_m.webp')),
  ]);
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
    uViewShift: { value: Math.tan(THREE.MathUtils.degToRad(meta.view?.shift ?? 0)) },
    uCarPaths: { value: cars.paths },
    uCarSpeeds: { value: cars.speeds },
    uCarCount: { value: cars.count },
    uRiverH: { value: river?.height ?? 36 },
    uBoatGeo: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatSpan: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatLook: { value: fixedArray(3, () => new THREE.Vector4()) },
    uBoatCount: { value: 0 },
    uLightDir: { value: fixedArray(15, () => new THREE.Vector3(0, -1, 0)) },
    uLightCol: { value: fixedArray(15, () => new THREE.Vector3()) },
    uReflAE: { value: fixedArray(15, () => new THREE.Vector4()) },
    uReflCol: { value: fixedArray(15, () => new THREE.Vector3()) },
    uLightCount: { value: 0 },
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
  const waterAt = maskSampler(mask, [uniforms.uAzRange.value.x, uniforms.uAzRange.value.y], [uniforms.uElRange.value.x, uniforms.uElRange.value.y]);
  const vL = new THREE.Vector3();
  const vW = new THREE.Vector3();
  // every frame: where each boat's lights are, which of them face us (sidelights, masthead, sternlight arcs) and
  // whether the footbridge hides them; the shader draws them and their reflections
  const updateBoatLights = () => {
    const H = uniforms.uRiverH.value;
    let k = 0;
    for (const track of tracks) {
      const b = track.boat;
      if (!b) continue;
      const [sMin, sMax] = boatSpan(b);
      const bow = b.dir > 0 ? sMax : sMin;
      const u = track.dir;
      const o = track.origin;
      const nx = -u.y;
      const nz = u.x;
      const ex = b.dir * (bow + (o.x * u.x + o.y * u.y));          // the eye, in the boat's frame
      const ez = -b.dir * (o.x * nx + o.y * nz);
      for (const L of boatLightsFor(track)) {
        if (k >= 15) break;
        const [bx, by, bz] = L.p;
        const s = bow - b.dir * bx;
        const c = b.dir * bz;
        const wx = o.x + u.x * s + nx * c;
        const wz = o.y + u.y * s + nz * c;
        let vx = ex - bx;
        let vz = ez - bz;
        const vl = Math.hypot(vx, vz) || 1;
        vx /= vl;
        vz /= vl;
        let vis = 1;
        if (L.arc === 'port') vis = smooth(-0.08, 0.08, -vz) * (1 - smooth(0.30, 0.46, vx));
        else if (L.arc === 'stbd') vis = smooth(-0.08, 0.08, vz) * (1 - smooth(0.30, 0.46, vx));
        else if (L.arc === 'mast') vis = 1 - smooth(0.30, 0.46, vx);
        else if (L.arc === 'stern') vis = smooth(0.30, 0.46, vx);
        vL.set(wx, by - H, wz);
        const dist = vL.length();
        vL.divideScalar(dist);
        vW.set(wx, -H, wz).normalize();
        const seen = smooth(0.25, 0.5, Math.max(waterAt(vL), waterAt(vW)));
        const fade = Math.exp(-dist / 600) * b.lights;
        const a = vis * seen * fade;
        uniforms.uLightDir.value[k].copy(vL);
        if (L.arc === 'cabin') uniforms.uLightCol.value[k].set(0, 0, 0);
        else uniforms.uLightCol.value[k].set(L.col[0] * a, L.col[1] * a, L.col[2] * a);
        vW.set(wx, -by - H, wz).normalize();                          // the light's mirror image under the water
        const strength = L.arc === 'cabin' ? 0.06 * seen * fade : 0.22 * a;
        const width = THREE.MathUtils.clamp((L.arc === 'cabin' ? 1.4 : 0.35) / dist, 0.0008, 0.006);
        uniforms.uReflAE.value[k].set(Math.atan2(vW.x, -vW.z), Math.asin(THREE.MathUtils.clamp(vW.y, -1, 1)), strength, width);
        uniforms.uReflCol.value[k].set(L.col[0], L.col[1], L.col[2]);
        k += 1;
      }
    }
    uniforms.uLightCount.value = k;
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
    hasWaterMask: !!mask,                      // (without it boat lights would show through the bridge)
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
      updateBoatLights();
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
      if (camera) uniforms.uViewShift.value = viewShift(meta, camera);
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
  const baseUrl = resolveBase(basePath);
  const meta = await loadMeta(baseUrl);
  const color = await loadTexture(assetUrl(baseUrl, 'city_color_m.webp'), renderer);
  if (renderer) flushTextures(renderer);
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
      uViewShift: { value: Math.tan(THREE.MathUtils.degToRad(meta.view?.shift ?? 0)) },
    },
    toneMapped: false,
    depthWrite: false,
  });
  return {
    material,
    meta,
    update(time, dt, camera) { if (camera) material.uniforms.uViewShift.value = viewShift(meta, camera); },
    setRain() {},
    flash() {},
    dispose() {
      color.dispose();
      material.dispose();
    },
  };
}
