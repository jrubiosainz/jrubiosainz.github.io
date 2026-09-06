import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function enhanceMotion(): () => void {
  const section = document.querySelector<HTMLElement>(".build-section");
  const phase = document.querySelector<HTMLElement>(".phase-label");
  const percent = document.querySelector<HTMLElement>(".compile-percent");
  const phases: string[] = JSON.parse(phase?.dataset.phases || "[]");
  const originalPhase = phase?.textContent ?? "";
  const steps = gsap.utils.toArray<HTMLElement>(".code-step");
  const meters = gsap.utils.toArray<HTMLElement>(".build-meter > span");
  const media = gsap.matchMedia();
  let floatTween: gsap.core.Tween | undefined;
  let heroVisible = true;

  media.add("(prefers-reduced-motion: no-preference)", () => {
    floatTween = gsap.to(".companion-float", { y: -12, rotation: 4, duration: 3.3, repeat: -1, yoyo: true, ease: "sine.inOut" });
    const heroObserver = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      floatTween?.paused(!heroVisible || document.hidden);
    });
    const hero = document.querySelector(".hero");
    if (hero) heroObserver.observe(hero);
    gsap.to(".hero-world .world-drawing", {
      rotation: -9, y: 20, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: .5 },
    });
    return () => {
      heroObserver.disconnect();
    };
  });

  media.add("(prefers-reduced-motion: no-preference) and (min-height: 740px)", () => {
    section?.classList.add("build-is-live");
    gsap.set("#idea .chassis, #idea .limbs, #idea .face, #idea .spark", { transformOrigin: "50% 50%" });
    const world = gsap.timeline();
    // These four operations are the code shown in the compiler, in the same order.
    world.from("#idea .chassis", { y: 90, opacity: 0 });
    world.from("#idea .limbs", { scale: 0, opacity: 0 });
    world.from("#idea .face", { y: -60, opacity: 0 });
    world.from("#idea .spark", { scale: 0, opacity: 0 });
    gsap.set(steps, { opacity: .3 });
    gsap.set(".step-check", { opacity: 0 });
    gsap.set(meters, { opacity: .2 });
    steps.forEach((step, i) => {
      world.to(step, { opacity: 1, duration: .12 }, i * .5);
      world.to(meters[i], { opacity: 1, duration: .12 }, i * .5);
      world.to(step.querySelector(".step-check"), { opacity: 1, duration: .05 }, (i + 1) * .5 - .05);
    });
    const drawStatus = (value: number) => {
      const index = Math.min(3, Math.floor(value * 4));
      steps.forEach((step, i) => step.classList.toggle("current-step", i === index));
      if (phase) phase.textContent = value === 1 ? originalPhase : phases[index] ?? originalPhase;
      if (percent) percent.textContent = `${Math.round(value * 100)}%`;
    };
    const trigger = ScrollTrigger.create({
      trigger: ".build-runway",
      start: "top 15%",
      end: "bottom 90%",
      animation: world,
      scrub: .35,
      invalidateOnRefresh: true,
      onUpdate: self => drawStatus(self.progress),
    });
    drawStatus(trigger.progress);
    return () => {
      section?.classList.remove("build-is-live");
      if (phase) phase.textContent = originalPhase;
      if (percent) percent.textContent = "100%";
    };
  });

  media.add("(prefers-reduced-motion: no-preference) and (min-width: 801px)", () => {
    document.querySelectorAll<HTMLElement>(".project-art").forEach(art => {
      const scene = gsap.timeline({
        scrollTrigger: { trigger: art, start: "top 95%", end: "top 26%", scrub: .45 },
        defaults: { ease: "power1.out" },
      });
      const isRobot = art.classList.contains("art-garden");
      const isNotebook = art.classList.contains("art-atlas");
      scene.from(art.querySelector(".scene-base"), { y: 50, scaleY: .85, opacity: 0, transformOrigin: "50% 100%", duration: .5 });
      scene.from(art.querySelector(".scene-object"), { y: isNotebook ? -70 : 25, x: isRobot ? -60 : 0, opacity: 0, duration: .8 }, .25);
      scene.from(art.querySelector(".scene-detail"), { y: isNotebook ? -100 : -20, rotation: isNotebook ? 18 : 0, scale: .8, opacity: 0, transformOrigin: "50% 50%", duration: .6 }, .55);
      art.querySelectorAll<SVGPathElement>(".scene-path").forEach(path => {
        const length = path.getTotalLength();
        scene.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: .8 }, .3);
      });
      if (isRobot) scene.to(art.querySelector(".scene-object"), { x: 32, y: -13, rotation: -3, transformOrigin: "50% 90%", duration: .6 }, 1);
    });
    gsap.from(".credits-list > div", {
      y: 65, stagger: .12, ease: "none",
      scrollTrigger: { trigger: ".credits-list", start: "top 95%", end: "bottom 65%", scrub: .5 },
    });
    gsap.to(".credits-orbit", {
      rotation: -10, y: -70, ease: "none",
      scrollTrigger: { trigger: ".contact-section", start: "top bottom", end: "bottom bottom", scrub: .5 },
    });
  });

  const visibility = () => floatTween?.paused(document.hidden || !heroVisible);
  document.addEventListener("visibilitychange", visibility);
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  return () => {
    document.removeEventListener("visibilitychange", visibility);
    media.revert();
    steps.forEach(step => step.classList.remove("current-step"));
    if (phase) phase.textContent = originalPhase;
    if (percent) percent.textContent = "100%";
    section?.classList.remove("build-is-live");
  };
}
