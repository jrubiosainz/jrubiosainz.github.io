import { createTimeline, type Timeline } from "animejs";

const root = document.documentElement;
const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
const motionButton = document.querySelector<HTMLButtonElement>("#motion-toggle");
const locale = document.querySelector<HTMLDetailsElement>(".locale-console");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const hero = document.querySelector<HTMLElement>(".hero");
const portrait = document.querySelector<HTMLElement>(".portrait-scroll");
const magnet = document.querySelector<HTMLElement>(".portrait-magnet");
const marquee = document.querySelector<HTMLElement>(".marquee-section");
const rows = [...document.querySelectorAll<HTMLElement>(".marquee-row")];
const about = document.querySelector<HTMLElement>(".about-copy");
const characters = [...document.querySelectorAll<HTMLElement>(".reveal-char")];
const objects = [...document.querySelectorAll<HTMLElement>(".about-object")];
const cards = [...document.querySelectorAll<HTMLElement>(".project-card")];
const stackMedia = matchMedia("(min-width:1000px) and (min-height:800px)");
let enabled = false;
let preference = true;
let ready = false;
let interacted = false;
let frame = 0;
let timeline: Timeline | undefined;
let activeChapter = "signal";
const clamp = (value: number) => Math.max(0, Math.min(1, value));

try { preference = localStorage.getItem("portfolio-motion") !== "off"; } catch { /* Native navigation never depends on storage. */ }

function readingPosition() {
  activeChapter = sections.reduce((id, section) => section.getBoundingClientRect().top < innerHeight * .45 ? section.id : id, "signal");
  root.dataset.chapter = activeChapter;
}

function update() {
  frame = 0;
  if (document.hidden) return;
  readingPosition();
  if (!enabled) return;
  const heroProgress = hero ? clamp(-hero.getBoundingClientRect().top / hero.offsetHeight) : 0;
  timeline?.seek(heroProgress * 1000, true);
  if (marquee) {
    const rect = marquee.getBoundingClientRect();
    const progress = clamp((innerHeight - rect.top) / (innerHeight + rect.height));
    rows.forEach((row, index) => {
      const distance = innerWidth < 761 ? 230 : 350;
      const x = index === 0 ? -distance * 1.4 + progress * distance : -80 - progress * distance;
      row.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    });
    marquee.dataset.progress = progress.toFixed(4);
  }
  if (about) {
    const rect = about.getBoundingClientRect();
    const progress = clamp((innerHeight * .83 - rect.top) / (innerHeight * .55 + rect.height * .45));
    characters.forEach((char, index) => {
      char.style.opacity = String(.24 + .76 * clamp((progress * (characters.length + 24) - index) / 24));
    });
    about.dataset.reveal = progress.toFixed(4);
  }
  objects.forEach((object, index) => {
    const parent = object.parentElement;
    if (!parent) return;
    const progress = clamp((innerHeight - parent.getBoundingClientRect().top) / (innerHeight + parent.offsetHeight));
    const direction = index % 2 ? 1 : -1;
    object.style.transform = `translate3d(0,${((progress - .5) * 95 * direction).toFixed(2)}px,0) rotate(${direction * (10 + progress * 35)}deg)`;
  });
  cards.forEach((card, index) => {
    const next = cards[index + 1];
    const progress = next && stackMedia.matches ? clamp((innerHeight * .8 - next.getBoundingClientRect().top) / (innerHeight * .8 - 80)) : 0;
    const scale = 1 - (cards.length - index - 1) * .03 * progress;
    card.style.transform = `scale(${scale.toFixed(4)})`;
    card.dataset.scale = scale.toFixed(4);
  });
}

function requestUpdate() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(update);
}

function resetMagnet() {
  if (magnet) magnet.style.transform = "";
}

function setMotion() {
  const previous = sections.find(section => section.id === activeChapter);
  const previousTop = previous?.getBoundingClientRect().top;
  enabled = preference && !reducedMotion.matches;
  root.dataset.motion = enabled ? "on" : "off";
  root.classList.toggle("motion-enabled", enabled && ready);
  if (motionButton) {
    motionButton.hidden = false;
    motionButton.disabled = reducedMotion.matches;
    motionButton.setAttribute("aria-pressed", String(enabled));
    const text = motionButton.querySelector(".motion-text");
    if (text) text.textContent = (enabled ? motionButton.dataset.on : motionButton.dataset.off) ?? "";
  }
  timeline?.revert();
  timeline = undefined;
  for (const element of [...rows, ...characters, ...objects, ...cards, ...(portrait ? [portrait] : [])]) element.removeAttribute("style");
  // Card indices remain layout data even when animation transforms are removed.
  cards.forEach((card, index) => { card.style.setProperty("--index", String(index)); card.dataset.scale = "1.0000"; });
  resetMagnet();
  if (enabled && ready && portrait) {
    timeline = createTimeline({ autoplay: false }).add(portrait, { y: [0, -90], rotate: [0, -8], scale: [1, .88], duration: 1000, ease: "linear" }, 0);
  }
  if (previous && previousTop !== undefined && scrollY > 0) {
    const correction = previous.getBoundingClientRect().top - previousTop;
    if (Math.abs(correction) > 1) scrollTo({ top: scrollY + correction, behavior: "instant" });
  }
  update();
}

for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  addEventListener(event, () => { interacted = true; }, { once: true, passive: true });
}
addEventListener("scroll", requestUpdate, { passive: true });
addEventListener("resize", requestUpdate);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
  else requestUpdate();
});
hero?.addEventListener("pointermove", event => {
  if (!enabled || !finePointer.matches || !magnet) return;
  const rect = hero.getBoundingClientRect();
  const x = Math.max(-25, Math.min(25, (event.clientX - rect.width / 2) / 22));
  const y = Math.max(-18, Math.min(18, (event.clientY - rect.top - rect.height * .55) / 28));
  magnet.style.transform = `translate3d(${x}px,${y}px,0) rotate(${x * .08}deg)`;
});
hero?.addEventListener("pointerleave", resetMagnet);
finePointer.addEventListener("change", resetMagnet);
motionButton?.addEventListener("click", () => {
  preference = !enabled;
  try { localStorage.setItem("portfolio-motion", preference ? "on" : "off"); } catch { /* The current-page choice still takes effect. */ }
  setMotion();
});
reducedMotion.addEventListener("change", setMotion);
document.querySelectorAll<HTMLAnchorElement>("[data-language]").forEach(link => {
  link.addEventListener("click", () => {
    readingPosition();
    const language = link.dataset.language;
    if (language !== "en" && language !== "es") return;
    try { localStorage.setItem("portfolio-language", language); } catch { /* The semantic URL remains sufficient. */ }
    const url = new URL(link.href);
    url.hash = activeChapter;
    link.href = url.href;
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && locale?.open) { locale.open = false; locale.querySelector("summary")?.focus(); }
});
document.addEventListener("click", event => {
  if (locale?.open && event.target instanceof Node && !locale.contains(event.target)) locale.open = false;
});

readingPosition();
setMotion();
void document.fonts.ready.then(() => {
  ready = true;
  setMotion();
  if (!interacted) sections.find(section => `#${section.id}` === location.hash)?.scrollIntoView({ behavior: "instant" });
  root.classList.add("scroll-ready");
  root.dataset.experience = "ready";
  update();
});
addEventListener("pagehide", () => { cancelAnimationFrame(frame); frame = 0; timeline?.pause(); });
addEventListener("pageshow", event => { if (event.persisted) setMotion(); });
