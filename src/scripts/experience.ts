import type { SceneExperience } from "./scene";

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>("#scene-stage");
const sections = [...document.querySelectorAll<HTMLElement>(".story-section")];
const links = [...document.querySelectorAll<HTMLAnchorElement>(".chapter-nav a")];
const motionButton = document.querySelector<HTMLButtonElement>("#motion-toggle");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const locale = document.querySelector<HTMLDetailsElement>(".locale-console");
let userMotion = true;
let scene: SceneExperience | undefined;
let generation = 0;
let frame = 0;
let lastFrameTime = 0;
let activeIndex = 0;
let activeChapter = "signal";
let targetProgress = 0;
let renderedProgress = 0;
let userInteracted = false;
let initialAnchor = true;
try { userMotion = localStorage.getItem("portfolio-motion") !== "off"; } catch { /* Storage is optional. */ }

for (const event of ["wheel", "touchstart", "keydown"]) {
  addEventListener(event, () => { userInteracted = true; }, { once: true, passive: true });
}
document.querySelectorAll<HTMLAnchorElement>("[data-language]").forEach(link => {
  link.addEventListener("click", () => {
    const language = link.dataset.language;
    if (language !== "en" && language !== "es") return;
    try { localStorage.setItem("portfolio-language", language); } catch { /* The native link still works. */ }
    const url = new URL(link.href);
    url.hash = activeChapter;
    link.href = url.href;
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && locale?.open) {
    locale.open = false;
    locale.querySelector("summary")?.focus();
  }
});
document.addEventListener("click", event => {
  if (locale?.open && event.target instanceof Node && !locale.contains(event.target)) locale.open = false;
});

function syncReading() {
  const range = document.documentElement.scrollHeight - innerHeight;
  targetProgress = range > 0 ? Math.max(0, Math.min(1, scrollY / range)) : 0;
  activeIndex = 0;
  sections.forEach((section, index) => {
    if (section.getBoundingClientRect().top < innerHeight * .5) activeIndex = index;
  });
  activeChapter = sections[activeIndex]?.id ?? "signal";
  links.forEach(link => {
    const active = link.hash === `#${activeChapter}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  const fill = document.querySelector<HTMLElement>("#meter-fill");
  const value = document.querySelector("#meter-value");
  if (fill) fill.style.transform = `scaleX(${targetProgress})`;
  if (value) value.textContent = String(Math.round(targetProgress * 100)).padStart(3, "0");
  if (stage) {
    stage.dataset.chapter = activeChapter;
    stage.dataset.progress = targetProgress.toFixed(4);
  }
  requestFrame();
}

function render(timestamp: number) {
  frame = 0;
  if (document.hidden || !scene) return;
  const delta = targetProgress - renderedProgress;
  const blend = 1 - Math.exp(-(timestamp - lastFrameTime) / 90);
  lastFrameTime = timestamp;
  renderedProgress = Math.abs(delta) < .0001 ? targetProgress : renderedProgress + delta * blend;
  scene.update(renderedProgress);
  const angle = document.querySelector("#scene-angle");
  if (angle) angle.textContent = scene.angle().toFixed(2);
  if (Math.abs(targetProgress - renderedProgress) > .0001) requestFrame();
  else lastFrameTime = 0;
}
function requestFrame() {
  if (!frame && !document.hidden && scene) {
    lastFrameTime ||= performance.now();
    frame = requestAnimationFrame(render);
  }
}
function preserveReading(change: () => void) {
  const anchor = sections[activeIndex];
  const before = anchor?.getBoundingClientRect().top;
  change();
  if (anchor && before !== undefined && scrollY > 0) {
    const correction = anchor.getBoundingClientRect().top - before;
    if (Math.abs(correction) > 1) scrollTo({ top: scrollY + correction, behavior: "instant" });
  }
}
addEventListener("scroll", syncReading, { passive: true });
addEventListener("resize", () => { scene?.resize(); syncReading(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrameTime = 0;
  } else { syncReading(); }
});

function restoreStatic() {
  scene?.dispose();
  scene = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  lastFrameTime = 0;
  stage?.classList.remove("scene-ready");
  preserveReading(() => root.classList.remove("enhanced-story"));
  const status = document.querySelector("#scene-state");
  if (status) status.textContent = stage?.dataset.fallback ?? "";
}
async function setMotion() {
  const version = ++generation;
  const enabled = userMotion && !reducedMotion.matches;
  restoreStatic();
  root.dataset.motion = enabled ? "on" : "off";
  if (motionButton) {
    motionButton.hidden = false;
    motionButton.disabled = reducedMotion.matches;
    motionButton.setAttribute("aria-pressed", String(enabled));
    const text = motionButton.querySelector(".motion-text");
    if (text) text.textContent = (enabled ? motionButton.dataset.on : motionButton.dataset.off) ?? "";
  }
  if (!enabled || !stage) { syncReading(); return; }
  const status = document.querySelector("#scene-state");
  if (status) status.textContent = stage.dataset.loading ?? "";
  try {
    const { createScene } = await import("./scene");
    const loaded = await createScene(stage, () => {
      restoreStatic();
      root.dataset.motion = "off";
      motionButton?.setAttribute("aria-pressed", "false");
      const text = motionButton?.querySelector(".motion-text");
      if (text) text.textContent = motionButton?.dataset.off ?? "";
    });
    if (version !== generation) { loaded.dispose(); return; }
    scene = loaded;
    preserveReading(() => root.classList.add("enhanced-story"));
    stage.classList.add("scene-ready");
    if (status) status.textContent = stage.dataset.ready ?? "";
    await document.fonts.ready;
    if (initialAnchor) {
      initialAnchor = false;
      if (!userInteracted) sections.find(section => `#${section.id}` === location.hash)?.scrollIntoView({ behavior: "instant" });
    }
    syncReading();
    renderedProgress = targetProgress;
    scene.update(renderedProgress);
  } catch (error) {
    if (version !== generation) return;
    restoreStatic();
    root.dataset.motion = "off";
    motionButton?.setAttribute("aria-pressed", "false");
    const text = motionButton?.querySelector(".motion-text");
    if (text) text.textContent = motionButton?.dataset.off ?? "";
    console.warn("The 3D scene could not initialize. The static artwork and all content remain available.", error);
  }
}
motionButton?.addEventListener("click", () => {
  userMotion = root.dataset.motion !== "on";
  try { localStorage.setItem("portfolio-motion", userMotion ? "on" : "off"); } catch { /* Temporary preferences still work. */ }
  void setMotion();
});
reducedMotion.addEventListener("change", () => void setMotion());
addEventListener("pagehide", () => { ++generation; restoreStatic(); });
addEventListener("pageshow", event => { if (event.persisted) void setMotion(); });
syncReading();
void setMotion();
