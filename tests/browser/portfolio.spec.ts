import { test, expect, type Page, type Route } from "@playwright/test";

async function scrollToProgress(page: Page, progress: number) {
  await page.evaluate(value => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * value, behavior: "instant" }), progress);
  await expect.poll(async () => Number(await page.locator("#scene-stage").getAttribute("data-assembly")), { timeout: process.env.CI ? 15000 : 5000 }).toBeCloseTo(progress, 2);
}

test("First visit defaults to English, even in a Spanish browser", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-ES", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toContainText("RUBIO SAINZ");
  await expect(page.locator(".header-link")).toHaveAttribute("href", "https://www.linkedin.com/in/jrubiosainz/");
  await context.close();
});

test("LinkedIn is the only professional project source exposed to visitors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const externalLinks = await page.locator("a[href^='https:']").evaluateAll(links => links.map(link => link.getAttribute("href")));
  expect(externalLinks.every(url => url && (["www.linkedin.com", "es.linkedin.com"].includes(new URL(url).hostname) || url === "https://github.com/jrubiosainz"))).toBe(true);
  await expect(page.locator(".footer-links a[href='https://github.com/jrubiosainz']")).toBeVisible();
  await expect(page.locator(".project, .experiment")).toHaveCount(0);
});

test("The real GLB has many independent parts and reverses reproducibly with scroll", async ({ page }) => {
  await page.goto("/");
  const stage = page.locator("#scene-stage");
  await expect(stage).toHaveClass(/scene-ready/, { timeout: 20000 });
  expect(Number(await stage.getAttribute("data-mesh-count"))).toBeGreaterThan(40);
  await scrollToProgress(page, .05);
  const scattered = Number(await stage.getAttribute("data-sample-x"));
  await scrollToProgress(page, .62);
  const assembled = Number(await stage.getAttribute("data-sample-x"));
  expect(Math.abs(scattered - assembled)).toBeGreaterThan(.1);
  await scrollToProgress(page, .84);
  const layers = Number(await stage.getAttribute("data-sample-x"));
  expect(Math.abs(layers - assembled)).toBeGreaterThan(.05);
  await scrollToProgress(page, .05);
  expect(Number(await stage.getAttribute("data-sample-x"))).toBeCloseTo(scattered, 2);
  await expect(page.locator(".scene-stage")).toHaveCSS("position", "fixed");
});

test("The authorized portrait assembles from glyphs then gives way to the armor", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#scene-stage")).toHaveClass(/scene-ready/, { timeout: 20000 });
  await scrollToProgress(page, .2);
  expect(Number(await page.locator("#scene-stage").getAttribute("data-portrait"))).toBeGreaterThan(.8);
  await scrollToProgress(page, .6);
  expect(Number(await page.locator("#scene-stage").getAttribute("data-portrait"))).toBe(0);
  await scrollToProgress(page, .2);
  expect(Number(await page.locator("#scene-stage").getAttribute("data-portrait"))).toBeGreaterThan(.8);
});

test("Language console keeps the chapter, persists choice and respects browser history", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#systems");
  await expect(page.locator(".chapter-nav a[href='#systems']")).toHaveClass(/active/, { timeout: 20000 });
  await page.locator(".locale-console summary").click();
  await page.locator("[data-language=es]").click();
  await page.waitForURL("**/es/#systems");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle(/Más allá/);
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await page.waitForURL("**/es/");
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/es/#maple-leaf");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("Deep-linked chapters stay aligned after asynchronous 3D enhancement", async ({ page }) => {
  await page.goto("/?lang=en#ai-rpg");
  await expect(page.locator("#scene-stage")).toHaveClass(/scene-ready/, { timeout: 20000 });
  await expect(page.locator(".chapter-nav a[href='#ai-rpg']")).toHaveClass(/active/);
  await expect(page.locator("#ai-rpg h2")).toBeInViewport();
});

test("Scene readiness waits for font layout before exposing scroll coordinates", async ({ page }) => {
  const fonts: Route[] = [];
  await page.route(/\.woff2(?:\?.*)?$/, route => { fonts.push(route); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const stage = page.locator("#scene-stage");
  await expect(stage).toHaveAttribute("data-component-count", "81", { timeout: 20000 });
  expect(fonts.length).toBeGreaterThan(0);
  await expect(stage).not.toHaveClass(/scene-ready/);
  await Promise.all(fonts.map(route => route.continue()));
  await page.unroute(/\.woff2(?:\?.*)?$/);
  await expect(stage).toHaveClass(/scene-ready/, { timeout: 20000 });
  await scrollToProgress(page, .45);
});

test("Motion off restores the designed static render and persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#scene-stage")).toHaveClass(/scene-ready/, { timeout: 20000 });
  await scrollToProgress(page, .45);
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("#scene-stage canvas")).toHaveCount(0);
  await expect(page.locator(".static-armor")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("#scene-stage canvas")).toHaveCount(0);
});

test("OS reduced motion prevents the 3D download and responds to live changes", async ({ page }) => {
  let modelRequests = 0;
  page.on("request", request => { if (request.url().endsWith(".glb")) modelRequests++; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#motion-toggle")).toBeDisabled();
  await expect(page.locator(".static-armor")).toBeVisible();
  expect(modelRequests).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("#scene-stage")).toHaveClass(/scene-ready/, { timeout: 20000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#scene-stage canvas")).toHaveCount(0);
  await expect(page.locator(".static-armor")).toBeVisible();
});

test("No-JavaScript pages keep the complete art, content, and bilingual links", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".static-armor")).toBeVisible();
  expect(await page.locator(".static-armor").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".story-section")).toHaveCount(7);
  await page.locator(".locale-console summary").click();
  await page.locator("[data-language=es]").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#connect h2")).toContainText("conversación");
  await context.close();
});

test("WebGL unavailable retains a readable, fully rendered alternative", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function(type: string, ...args: unknown[]) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".static-armor")).toBeVisible();
  await expect(page.locator("#scene-stage canvas")).toHaveCount(0);
  await expect(page.locator("#systems h2")).toContainText("Architecture");
});

test("Model failure and context loss cannot leave the visitor in an empty void", async ({ page }) => {
  await page.route("**/models/exosuit.glb", route => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".static-armor")).toBeVisible();
  await page.unroute("**/models/exosuit.glb");
  await page.locator("#motion-toggle").click();
  await expect(page.locator("#scene-stage")).toHaveClass(/scene-ready/, { timeout: 20000 });
  await page.locator("#scene-stage canvas").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(page.locator("#scene-stage canvas")).toHaveCount(0);
  await expect(page.locator(".static-armor")).toBeVisible();
});

test("Keyboard navigation exposes a skip link and a dismissible language console", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.locator(".locale-console summary").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-language=en]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".locale-console summary")).toBeFocused();
  await expect(page.locator(".locale-console")).not.toHaveAttribute("open");
});

for (const lang of ["en", "es"]) {
  for (const width of [360, 390, 768, 1440, 1920]) {
    test(`${lang}: no overflow, working chapter navigation at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 360 ? 640 : 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(lang === "es" ? "/es/" : "/");
      await page.evaluate(() => document.fonts.ready);
      for (const section of ["signal", "human", "systems", "maple-leaf", "ai-rpg", "desktop-assistant", "connect"]) {
        await page.locator(`.chapter-nav a[href='#${section}']`).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await expect(page.locator(`#${section} h1, #${section} h2`)).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }
}
