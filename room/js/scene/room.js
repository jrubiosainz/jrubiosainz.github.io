import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import { LIGHTS, lightmapMaterial, dynamicMaterial, glowMaterial, discMaterial, glassMaterial } from './materials.js';

// three(x,y,z) = blender(x, z, -y)
export const toThree = (b) => new THREE.Vector3(b[0], b[2], -b[1]);

function loadTex(loader, url, { srgb = false, mips = true, aniso = 8, renderer } = {}) {
  return loader.loadAsync(url).then((t) => {
    t.flipY = false;                       // glTF UV convention (v down in image space)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = mips;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = Math.min(aniso, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
    return t;
  });
}

// The glTF exporter writes TEXCOORD_0 (UVMap -> uv), TEXCOORD_1 (LightmapUV -> uv1), TEXCOORD_2 (DynUV -> uv2).

function matParams(mat) {
  const u = mat?.userData || {};
  return {
    color: new THREE.Color().fromArray(u.rt_color || [0.6, 0.6, 0.6]),
    rough: u.rt_rough ?? 0.5,
    spec: u.rt_spec ?? 0.5,
    metal: u.rt_metal ?? 0,
    trans: u.rt_trans ?? 0,
    emit: u.rt_emit ? new THREE.Color().fromArray(u.rt_emit) : null,
    emitStrength: u.rt_emit_strength ?? 0,
    group: u.light_group,
    flat: Array.isArray(u.rt_flat) ? new THREE.Color().fromArray(u.rt_flat) : null,
  };
}

// Specular weight per material for the analytic gloss: coated/varnished/plastic things shine, fabric/paper don't.
// Lamp irradiance multiplier for surfaces right next to the bulb (the bake is physically right, but a 2 cm point
// light saturates them to white; photos of real lamps show a warm, saturated interior instead).
const LAMP_GAIN = { Lamp_Shade_Interior: 0.085, Lamp_Socket: 0.35, Lamp_Joint: 0.5 };
// the lamp's swivelling head: it keeps its baked light (lit from inside) wherever it points
export const LAMP_HEAD = ['Lamp_Shade', 'Lamp_Shade_Interior', 'Lamp_Socket', 'Lamp_Bulb'];

function glossOf(p) {
  if (p.rough > 0.85) return 0;
  const s = THREE.MathUtils.clamp((p.spec ?? 0.5) * 2.0, 0, 2);
  return s * (1 - p.rough * 0.6);
}

export async function loadRoom({ renderer, base = 'assets/', quality = 'high', onProgress = () => {} }) {
  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath('vendor/three/draco/');
  loader.setDRACOLoader(draco);
  const texLoader = new THREE.TextureLoader(manager);
  let loaded = 0;
  const total = 16;
  const tick = () => { loaded += 1; onProgress(Math.min(1, loaded / total)); };
  const lmMeta = await (await fetch(`${base}lightmaps/lightmaps.json`)).json();
  const sfx = quality === 'mobile' ? '_m' : '';
  const atlases = {};
  const jobs = [];
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  for (const [a, entry] of Object.entries(lmMeta.atlases)) {
    const at = { scales: new THREE.Vector3(), black, lampi: null, scaleI: 0 };
    atlases[a] = at;
    const g = entry.groups;
    at.scales.set(g.amb.scale, g.lamp.scale, g.tv.scale);
    // the lamp's bounce light (older bakes don't have it: the aimed lamp then only has its live direct light)
    if (g.lampi) {
      at.scaleI = g.lampi.scale;
      jobs.push(loadTex(texLoader, `${base}lightmaps/${g.lampi.file.replace('.webp', `${sfx}.webp`)}`, { renderer }).then((t) => { at.lampi = t; tick(); }));
    } else loaded += 1;
    jobs.push(loadTex(texLoader, `${base}lightmaps/${g.amb.file.replace('.webp', `${sfx}.webp`)}`, { renderer }).then((t) => { at.amb = t; tick(); }));
    jobs.push(loadTex(texLoader, `${base}lightmaps/${g.lamp.file.replace('.webp', `${sfx}.webp`)}`, { renderer }).then((t) => { at.lamp = t; tick(); }));
    jobs.push(loadTex(texLoader, `${base}lightmaps/${g.tv.file.replace('.webp', `${sfx}.webp`)}`, { renderer }).then((t) => { at.tv = t; tick(); }));
    jobs.push(loadTex(texLoader, `${base}lightmaps/${entry.albedo.file.replace('.webp', `${sfx}.webp`)}`, { srgb: true, renderer, aniso: 16 }).then((t) => { at.albedo = t; tick(); }));
  }
  let dynTex = null;
  if (lmMeta.dynamic) {
    jobs.push(loadTex(texLoader, `${base}lightmaps/${lmMeta.dynamic.file.replace('.webp', `${sfx}.webp`)}`, { srgb: true, renderer }).then((t) => { dynTex = t; tick(); }));
  }
  let gltf;
  jobs.push(loader.loadAsync(`${base}room.glb`, (e) => {
    if (e.total) onProgress(Math.min(1, (loaded + (e.loaded / e.total) * 4) / total));
  }).then((g) => { gltf = g; loaded += 4; onProgress(loaded / total); }));
  await Promise.all(jobs);
  draco.dispose();

  const scene = gltf.scene;
  const byName = new Map();
  const views = {};
  const specials = [];
  const hoverables = [];
  const dynamics = [];
  const matCache = new Map();

  // GLTFLoader keeps the raw node name in userData.name, but glTF extras with a `name` key overwrite it.
  scene.traverse((o) => {
    if (o.name) byName.set(o.name, o);
    const raw = o.userData?.name;
    if (raw && raw !== o.name && !byName.has(raw)) byName.set(raw, o);
    if (o.userData?.view) {
      views[o.userData.name || o.name] = {
        pos: o.position.clone(),
        target: new THREE.Vector3().fromArray(o.userData.target),
        fov: o.userData.fov,
      };
    }
  });

  // meshes: glTF nodes become Mesh (1 primitive) or Group of Meshes (several materials)
  const meshNodes = [];
  scene.traverse((o) => { if (o.isMesh) meshNodes.push(o); });
  for (const mesh of meshNodes) {
    const node = mesh.userData?.lm ? mesh : mesh.parent;
    const ex = node.userData || {};
    const lm = ex.lm || 'static';
    const role = ex.role;
    const p = matParams(mesh.material);
    // printed labels exported with their own image (see blender/export.py label_image)
    const label = mesh.material?.map || null;
    if (label) label.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
    mesh.userData.node = node;
    mesh.userData.nodeName = node.name || node.userData?.name;
    mesh.matrixAutoUpdate = lm === 'dynamic';
    if (lm === 'static' || lm === 'glass' && ex.lm_atlas !== undefined) {
      const at = atlases[String(ex.lm_atlas ?? 0)];
      if (!at || !mesh.geometry.attributes.uv1) { mesh.visible = false; continue; }
      const runtime = ex.albedo === 'runtime';
      const combined = ex.lm_mode === 'combined';
      const live = !LAMP_HEAD.includes(mesh.userData.nodeName);
      const key = `${ex.lm_atlas}|${combined}|${runtime ? node.name : ''}|${label?.uuid || ''}|${glossOf(p).toFixed(2)}|${p.rough.toFixed(2)}|${live}`;
      // per-vertex material params for the gloss so that meshes can share one material per atlas
      const n = mesh.geometry.attributes.position.count;
      const arr = new Float32Array(n * 4);
      const lg = LAMP_GAIN[mesh.userData.nodeName] ?? 1;
      for (let i = 0; i < n; i += 1) { arr[i * 4] = p.rough; arr[i * 4 + 1] = 1; arr[i * 4 + 2] = p.metal; arr[i * 4 + 3] = lg; }
      mesh.geometry.setAttribute('aMat', new THREE.BufferAttribute(arr, 4));
      // flat albedo (w = 2) for untextured materials; w = 0 samples the atlas (a missing attribute reads w = 1)
      const alb = new Float32Array(n * 4);
      if (p.flat && !runtime) for (let i = 0; i < n; i += 1) { alb[i * 4] = p.flat.r; alb[i * 4 + 1] = p.flat.g; alb[i * 4 + 2] = p.flat.b; alb[i * 4 + 3] = 2; }
      mesh.geometry.setAttribute('aAlb', new THREE.BufferAttribute(alb, 4));
      let m = matCache.get(key);
      if (!m || runtime) {
        m = lightmapMaterial({ atlas: at, combined, gloss: glossOf(p), runtime: runtime ? null : label, tint: runtime ? new THREE.Color(1, 1, 1) : null, live });
        if (!runtime) matCache.set(key, m);
      }
      mesh.material = m;
      mesh.userData.mergeable = !runtime;
      if (runtime) specials.push({ mesh, node, kind: 'runtime-static', slot: ex.slot, params: p });
    } else if (lm === 'dynamic') {
      const useAtlas = !!mesh.geometry.attributes.uv2 && !p.flat;
      mesh.material = role === 'disc' ? discMaterial() : dynamicMaterial({
        dynTex, color: p.flat || p.color, rough: p.rough, spec: glossOf(p) * 0.5, metal: p.metal, useAtlas, runtime: label,
      });
      dynamics.push({ mesh, node, role, params: p });
      if (ex.albedo === 'runtime') specials.push({ mesh, node, kind: 'runtime-dynamic', slot: ex.slot, params: p });
    } else if (lm === 'emissive') {
      const col = p.emit || p.color;
      mesh.material = glowMaterial(col, Math.min(p.emitStrength || 1, 6));
      specials.push({ mesh, node, kind: 'emissive', role, params: p });
    } else if (lm === 'glass') {
      mesh.material = glassMaterial();
      mesh.renderOrder = 5;
    } else {
      mesh.visible = false;
    }
    if (role && ['tv_button', 'tv_knob', 'vcr_button', 'cdp_button', 'cdp_volume', 'lamp_switch', 'key', 'cassette', 'cdp_lid', 'disc'].includes(role)) {
      hoverables.push(mesh);
    }
  }
  scene.updateMatrixWorld(true);
  // lights & anchors from the bake
  const L = lmMeta.lights || {};
  if (L.BL_Lamp) LIGHTS.lampPos.value.copy(toThree(L.BL_Lamp.pos));
  if (L.TV_ScreenCenter) {
    LIGHTS.tvPos.value.copy(toThree(L.TV_ScreenCenter.pos));
    LIGHTS.tvNormal.value.copy(toThree(L.TV_ScreenCenter.normal)).normalize();
  }
  if (L.BL_Window) LIGHTS.winPos.value.copy(toThree(L.BL_Window.pos));
  if (L.Lamp_LightPos && L.Lamp_LightAim) {
    LIGHTS.lampDir.value.copy(toThree(L.Lamp_LightAim.pos)).sub(toThree(L.Lamp_LightPos.pos)).normalize();
  }
  return { scene, byName, views, atlases, dynTex, specials, hoverables, dynamics, lmMeta };
}
