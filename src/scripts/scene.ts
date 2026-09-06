import {
  AdditiveBlending, AmbientLight, Box3, BufferAttribute, BufferGeometry, CanvasTexture,
  DirectionalLight, Euler, FogExp2, Group, Mesh, MeshStandardMaterial, Object3D, PCFSoftShadowMap,
  PerspectiveCamera, PMREMGenerator, Points, Scene, ShaderMaterial, SRGBColorSpace,
  Vector3, WebGLRenderer, ACESFilmicToneMapping,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTimeline } from "animejs";

export interface SceneExperience {
  update(progress: number): void;
  resize(): void;
  dispose(): void;
  angle(): number;
}

function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

async function portraitCloud() {
  const image = new Image();
  image.src = "/portrait.jpg";
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Portrait sampling canvas is unavailable.");
  ctx.drawImage(image, 0, 0, 160, 160);
  const pixels = ctx.getImageData(0, 0, 160, 160).data;
  const positions: number[] = [];
  const scatter: number[] = [];
  const colors: number[] = [];
  const glyphs: number[] = [];
  const alphabet = "JRS01AI/CLOUD";
  const atlas = document.createElement("canvas");
  atlas.width = alphabet.length * 32;
  atlas.height = 32;
  const ink = atlas.getContext("2d");
  if (!ink) throw new Error("Portrait glyph canvas is unavailable.");
  ink.fillStyle = "#ffffff";
  ink.font = "25px monospace";
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  for (let i = 0; i < alphabet.length; i++) ink.fillText(alphabet[i], i * 32 + 16, 17);
  const glyphTexture = new CanvasTexture(atlas);
  for (let y = 0; y < 160; y += 2) {
    for (let x = 0; x < 160; x += 2) {
      const i = (y * 160 + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (Math.min(r, g, b) > 225) continue;
      const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
      positions.push((x / 160 - .5) * 1.9, (1 - y / 160) * 1.9 + .35, luminance * .12);
      scatter.push((random(i) - .5) * 4.5, (random(i + 1) - .5) * 4.5, (random(i + 2) - .5) * 3);
      const light = Math.pow(luminance, 1.8) * 2.7;
      colors.push(light * .88, light * .94, light);
      glyphs.push(Math.floor(random(i + 5) * alphabet.length));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aScatter", new BufferAttribute(new Float32Array(scatter), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute("aGlyph", new BufferAttribute(new Float32Array(glyphs), 1));
  const material = new ShaderMaterial({
    uniforms: { spread: { value: 1 }, opacity: { value: 0 }, pixelRatio: { value: Math.min(devicePixelRatio, 1.7) }, atlas: { value: glyphTexture }, glyphCount: { value: alphabet.length } },
    vertexShader: `
      attribute vec3 aScatter;
      attribute vec3 color;
      attribute float aGlyph;
      uniform float spread;
      uniform float pixelRatio;
      varying vec3 vColor;
      varying float vGlyph;
      void main() {
        vColor = color;
        vGlyph = aGlyph;
        vec3 point = position + aScatter * spread;
        vec4 mvPosition = modelViewMatrix * vec4(point, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (8.0 * pixelRatio) * (3.8 / -mvPosition.z);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform sampler2D atlas;
      uniform float glyphCount;
      varying vec3 vColor;
      varying float vGlyph;
      void main() {
        vec2 uv = vec2((gl_PointCoord.x + vGlyph) / glyphCount, 1.0 - gl_PointCoord.y);
        float ink = texture2D(atlas, uv).a;
        float dot = 1.0 - smoothstep(0.32, 0.5, length(gl_PointCoord - vec2(0.5)));
        gl_FragColor = vec4(vColor, mix(ink, dot, 0.55) * opacity);
      }
    `,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const cloud = new Points(geometry, material);
  cloud.userData.glyphTexture = glyphTexture;
  cloud.position.z = .55;
  return cloud;
}

export async function createScene(container: HTMLElement, onContextLost: () => void): Promise<SceneExperience> {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  scene.fog = new FogExp2("#080a0e", .07);
  const camera = new PerspectiveCamera(34, innerWidth / innerHeight, .1, 100);
  const assembly = new Group();
  const modelRoot = new Group();
  assembly.add(modelRoot);
  scene.add(assembly);
  const ambient = new AmbientLight("#a1afc3", .18);
  const key = new DirectionalLight("#e8f0ff", 3.2);
  key.position.set(-3, 4, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  key.shadow.camera.far = 15;
  key.shadow.normalBias = .015;
  key.shadow.bias = -.0002;
  const rim = new DirectionalLight("#a3e6f1", 5);
  rim.position.set(4, 2, -2);
  const warm = new DirectionalLight("#d5d4d2", .7);
  warm.position.set(1, 4, 2);
  scene.add(ambient, key, rim, warm);
  const pmrem = new PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  const environment = pmrem.fromScene(studio, .03, .1, 100);
  scene.environment = environment.texture;
  studio.dispose();
  pmrem.dispose();
  const timeline = createTimeline({ autoplay: false, defaults: { ease: "inOutCubic" } });
  const disposables: Array<{ dispose(): void }> = [environment];
  let disposed = false;
  let lastAngle = 0;
  let lastProgress = 0;
  let meshCount = 0;
  let trackedPart: Object3D | undefined;
  const surfaces = new Set<MeshStandardMaterial>();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    timeline.cancel();
    canvas.removeEventListener("webglcontextlost", contextLost);
    scene.traverse(object => {
      if (object instanceof Mesh || object instanceof Points) {
        if (object.userData.glyphTexture instanceof CanvasTexture) object.userData.glyphTexture.dispose();
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          if (material instanceof MeshStandardMaterial) {
            material.map?.dispose();
            material.normalMap?.dispose();
            material.roughnessMap?.dispose();
            material.metalnessMap?.dispose();
          }
          material.dispose();
        });
      }
    });
    disposables.forEach(item => item.dispose());
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    canvas.remove();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    console.warn("WebGL context lost; the complete static scene is being restored.");
    cleanup();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", contextLost);

  try {
    const gltf = await new GLTFLoader().loadAsync("/models/exosuit.glb");
    modelRoot.add(gltf.scene);
    const box = new Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    const scale = 2.4 / height;
    modelRoot.scale.setScalar(scale);
    modelRoot.position.set(-(box.max.x + box.min.x) * scale / 2, -box.min.y * scale, -(box.max.z + box.min.z) * scale / 2);
    const components: Object3D[] = [];
    gltf.scene.traverse(object => {
      if (typeof object.userData.groupId === "string") components.push(object);
      if (!(object instanceof Mesh)) return;
      meshCount++;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (material instanceof MeshStandardMaterial) {
          material.envMapIntensity = .6;
          material.roughness = Math.max(.24, material.roughness);
          material.transparent = true;
          surfaces.add(material);
        }
      });
    });
    components.forEach((object, index) => {
      trackedPart ??= object;
      const assembled = object.position.clone();
      const assembledRotation = object.rotation.clone();
      const seed = index + 19;
      const side = assembled.x < 0 ? -1 : 1;
      const offset = new Vector3(side * (.32 + random(seed) * 1.05), (random(seed + 1) - .4) * 1.75, (random(seed + 2) - .3) * .95);
      const scattered = assembled.clone().add(offset);
      const rotation = new Euler(assembledRotation.x + (random(seed + 3) - .5) * 1.6, assembledRotation.y + (random(seed + 4) - .5) * 2, assembledRotation.z + side * .7);
      object.position.copy(scattered);
      object.rotation.copy(rotation);
      const order = typeof object.userData.order === "number" ? object.userData.order / 100 : random(seed + 6);
      const start = 850 + Math.min(1, Math.max(0, order)) * 2100;
      timeline.add(object.position, { x: assembled.x, y: assembled.y, z: assembled.z, duration: 2000 }, start);
      timeline.add(object.rotation, { x: assembledRotation.x, y: assembledRotation.y, z: assembledRotation.z, duration: 2000 }, start);
      const separated = assembled.clone().addScaledVector(offset, .36);
      timeline.add(object.position, { x: separated.x, y: separated.y, z: separated.z, duration: 1000 }, 5700);
      timeline.add(object.position, { x: assembled.x, y: assembled.y, z: assembled.z, duration: 1000 }, 6900);
    });
    const portrait = await portraitCloud();
    assembly.add(portrait);
    const cloudMaterial = portrait.material;
    timeline.add(cloudMaterial.uniforms.spread, { value: 0, duration: 900 }, 100);
    timeline.add(cloudMaterial.uniforms.opacity, { value: .85, duration: 600 }, 100);
    timeline.add(cloudMaterial.uniforms.opacity, { value: 0, duration: 700 }, 1900);
    timeline.add(cloudMaterial.uniforms.spread, { value: .8, duration: 700 }, 2000);
    container.append(canvas);
    container.dataset.meshCount = String(meshCount);
    container.dataset.componentCount = String(components.length);

    const resize = () => {
      if (disposed) return;
      const width = container.clientWidth, height = container.clientHeight;
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(devicePixelRatio, width < 761 ? 1.35 : 1.7));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const narrow = width < 761;
      camera.position.set(narrow ? -.33 : -1.25, 1.32, narrow ? 5.1 : 5.7);
      camera.lookAt(narrow ? -.33 : -1.25, 1.26, 0);
      update(lastProgress);
    };
    const update = (progress: number) => {
      if (disposed) return;
      lastProgress = progress;
      const p = Math.max(0, Math.min(1, progress));
      timeline.seek(p * 8000, true);
      surfaces.forEach(material => { material.opacity = Math.min(1, .16 + p * 4.2); });
      const yaw = -.2 + Math.sin(p * Math.PI) * .47;
      assembly.rotation.y = yaw;
      lastAngle = yaw * 180 / Math.PI;
      const narrow = container.clientWidth < 761;
      assembly.position.x = narrow ? .06 : 0;
      portrait.rotation.y = -yaw;
      container.dataset.assembly = p.toFixed(4);
      container.dataset.sampleX = trackedPart?.position.x.toFixed(4) ?? "";
      container.dataset.portrait = cloudMaterial.uniforms.opacity.value.toFixed(4);
      renderer.render(scene, camera);
    };
    resize();
    return { update, resize, dispose: cleanup, angle: () => lastAngle };
  } catch (error) {
    cleanup();
    throw error;
  }
}
