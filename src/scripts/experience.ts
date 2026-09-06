type MotionPreference = "on" | "off";

const root = document.documentElement;
const motionButton = document.querySelector<HTMLButtonElement>("#motion-toggle");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
let motionPreference: MotionPreference = "on";
try {
  if (localStorage.getItem("portfolio-motion") === "off") motionPreference = "off";
} catch {
  // Browser privacy settings may disable preference persistence.
}

const languages = document.querySelector<HTMLDetailsElement>(".language-console");
document.querySelectorAll<HTMLAnchorElement>("[data-language]").forEach(link => {
  link.addEventListener("click", () => {
    const language = link.dataset.language;
    if (language !== "en" && language !== "es") return;
    try {
      localStorage.setItem("portfolio-language", language);
    } catch {
      // The ordinary link still changes language without browser storage.
    }
    const url = new URL(link.href);
    const active = document.querySelector<HTMLAnchorElement>(".chapter-rail a.active");
    url.hash = location.hash || active?.hash || "";
    link.href = url.href;
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && languages?.open) {
    languages.open = false;
    languages.querySelector("summary")?.focus();
  }
});
document.addEventListener("click", event => {
  if (event.target instanceof Node && languages?.open && !languages.contains(event.target)) languages.open = false;
});

const chapters = [...document.querySelectorAll<HTMLElement>("section[id], footer[id]")];
const chapterLinks = [...document.querySelectorAll<HTMLAnchorElement>(".chapter-rail a")];
const progress = document.querySelector<HTMLElement>("#reading-progress");
let frameRequested = false;
function updateReading() {
  const height = document.documentElement.scrollHeight - innerHeight;
  if (progress) progress.style.transform = `scaleX(${height > 0 ? scrollY / height : 0})`;
  let current = chapters[0]?.id;
  for (const chapter of chapters) {
    if (chapter.getBoundingClientRect().top < innerHeight * .42) current = chapter.id;
  }
  chapterLinks.forEach(link => {
    const active = link.hash === `#${current}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  frameRequested = false;
}
function requestReadingUpdate() {
  if (!frameRequested) {
    frameRequested = true;
    requestAnimationFrame(updateReading);
  }
}
addEventListener("scroll", requestReadingUpdate, { passive: true });
addEventListener("resize", requestReadingUpdate);
addEventListener("pageshow", requestReadingUpdate);
updateReading();

let teardownMotion: (() => void) | undefined;
let motionGeneration = 0;
let initialAnchorPending = true;
const initialHash = location.hash;
let initialScrollInterrupted = false;
for (const event of ["wheel", "touchstart", "keydown"]) {
  addEventListener(event, () => { initialScrollInterrupted = true; }, { once: true, passive: true });
}
async function syncMotion() {
  const enabled = motionPreference === "on" && !motionQuery.matches;
  const generation = ++motionGeneration;
  teardownMotion?.();
  teardownMotion = undefined;
  root.dataset.motion = enabled ? "on" : "off";
  if (motionButton) {
    motionButton.hidden = false;
    motionButton.disabled = motionQuery.matches;
    motionButton.setAttribute("aria-pressed", String(enabled));
    const label = motionButton.querySelector(".motion-text");
    if (label) label.textContent = (enabled ? motionButton.dataset.on : motionButton.dataset.off) ?? "";
  }
  if (!enabled) return;
  try {
    const { enhanceMotion } = await import("./motion");
    if (generation === motionGeneration) {
      teardownMotion = enhanceMotion();
      if (initialAnchorPending) {
        initialAnchorPending = false;
        await document.fonts.ready;
        requestAnimationFrame(() => {
          // Sticky enhancement changes document height after native hash navigation.
          if (!initialScrollInterrupted && location.hash === initialHash) {
            chapters.find(chapter => `#${chapter.id}` === initialHash)?.scrollIntoView({ behavior: "instant" });
            requestReadingUpdate();
          }
        });
      }
    }
  } catch (error) {
    root.dataset.motion = "off";
    motionPreference = "off";
    motionButton?.setAttribute("aria-pressed", "false");
    const label = motionButton?.querySelector(".motion-text");
    if (label) label.textContent = motionButton?.dataset.off ?? "";
    console.warn("Motion enhancement could not load. The complete static portfolio remains available.", error);
  }
}
motionButton?.addEventListener("click", () => {
  // The OS preference is always an upper bound, including when it changes live.
  motionPreference = root.dataset.motion === "on" ? "off" : "on";
  try { localStorage.setItem("portfolio-motion", motionPreference); } catch {
    // A temporary setting is still usable when persistence is disabled.
  }
  void syncMotion();
});
motionQuery.addEventListener("change", () => void syncMotion());
void syncMotion();

addEventListener("pagehide", () => {
  ++motionGeneration;
  teardownMotion?.();
  teardownMotion = undefined;
});
addEventListener("pageshow", event => {
  if (event.persisted) void syncMotion();
});
