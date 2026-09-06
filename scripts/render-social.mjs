import { chromium, firefox } from "@playwright/test";

const browser = await (process.env.BROWSER === "firefox" ? firefox : chromium).launch();
try {
  for (const lang of ["en", "es"]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
    const base = process.env.PREVIEW_URL || "http://127.0.0.1:4321/";
    await page.goto(new URL(lang === "es" ? "/es/" : "/", base).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: `
      .site-header,.utility-dock,.scroll-cue,.hero-dimension,.portrait-orbit { display:none!important }
      .hero { min-height:630px!important;height:630px!important;padding:30px!important }
      .hero-title-wrap { margin:0!important }
      h1 { font-size:153px!important }
      html[lang="es"] h1 { font-size:196px!important }
      .hero-identity { font-size:10px!important }
      .portrait-stage { width:365px!important;bottom:5px!important }
      .hero-bottom { padding-bottom:20px!important }
      .hero-statement { font-size:17px!important;max-width:220px!important }
    ` });
    await page.screenshot({ path: `public/creator-preview${lang === "es" ? "-es" : ""}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
