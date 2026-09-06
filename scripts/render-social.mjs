import { chromium } from "@playwright/test";

const browser = await chromium.launch();
try {
  for (const lang of ["en", "es"]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
    const base = process.env.PREVIEW_URL || "http://127.0.0.1:4321/";
    await page.goto(new URL(lang === "es" ? "/es/" : "/", base).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: `
      .site-header,.chapter-nav,.assembly-meter,.intro-reference,.hero-baseline,.coordinate,.scene-cross { display:none!important }
      .opening-section { padding:65px!important;min-height:630px!important;height:630px!important;align-items:center!important }
      .section-label { margin-bottom:28px!important }
      .hero-role { margin-bottom:35px!important;font-size:14px!important }
      h1 { font-size:95px!important }
      .static-armor { height:690px!important;left:55%!important;bottom:-40px!important;max-width:50%!important;opacity:1!important }
      .opening-copy { position:relative;z-index:4 }
      .scene-vignette { background:linear-gradient(90deg,#080a0e77,transparent 80%)!important }
    ` });
    await page.screenshot({ path: `public/identity-preview${lang === "es" ? "-es" : ""}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
