import { chromium } from "@playwright/test";

const browser = await chromium.launch();
try {
  for (const lang of ["en", "es"]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
  const base = process.env.PREVIEW_URL || "http://127.0.0.1:4321/";
  await page.goto(new URL(lang === "es" ? "/es/" : "/", base).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `
    .header,.chapter-rail,.reading-track,.hero-footer,.hero-meta,.hero-note,.hero-copy,.world-caption,.world-coordinate { display:none!important }
    .hero { padding:0 65px!important }
    .hero-stage { height:630px!important;min-height:630px!important;padding-top:85px!important }
    .hero-role { margin-bottom:45px!important;font-size:14px!important }
    .hero-role strong { font-size:25px!important }
    h1 { font-size:110px!important;line-height:1.02!important }
    .hero-world { top:135px!important;right:-10px!important;width:46%!important }
    .hero-type { z-index:3!important }
    .hero::after { content:"${lang === "es" ? "CURIOSIDAD HUMANA. POSIBILIDAD ARTIFICIAL." : "HUMAN CURIOSITY. MACHINE POSSIBILITY."}";position:absolute;bottom:45px;left:65px;font:11px "IBM Plex Mono",monospace;letter-spacing:.1em }
    .build-section { display:none!important }
  ` });
  await page.screenshot({ path: `public/social-preview${lang === "es" ? "-es" : ""}.png` });
  await page.close();
  }
} finally {
  await browser.close();
}
