import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-experience", "ready");
}

async function place(page: Page, selector: string, viewportFraction = .15) {
  await page.locator(selector).evaluate((element, fraction) => {
    scrollTo({ top: element.getBoundingClientRect().top + scrollY - innerHeight * fraction, behavior: "instant" });
  }, viewportFraction);
  await page.waitForTimeout(100);
}

test("English is the first visit default and Jesús is the unmistakable identity", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-ES" });
  const page = await context.newPage();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("HI, I'M JESÚS");
  await expect(page.locator(".hero-identity")).toContainText("JESÚS RUBIO SAINZ");
  await expect(page.locator(".hero-identity")).toContainText("Microsoft");
  await expect(page.locator(".hero-portrait")).toBeVisible();
  expect(await page.locator(".hero-portrait").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth >= 700)).toBe(true);
  await context.close();
});

test("The point portrait retains facial contrast, separated points and a transparent backdrop", async ({ page }) => {
  await ready(page);
  const portrait = page.locator(".hero-portrait");
  await expect(portrait).toHaveAttribute("src", "/creator/portrait-points.png");
  await expect(portrait).toHaveAttribute("alt", /photograph.*silver points/);
  const regions = await portrait.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Portrait sampling context is unavailable.");
    ctx.drawImage(image, 0, 0);
    const sample = (x: number, y: number, width: number, height: number) => {
      const { data } = ctx.getImageData(x, y, width, height);
      let light = 0, clear = 0, ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        light += data[i + 1] * data[i + 3] / 255;
        if (data[i + 3] === 0) clear++;
        if (data[i + 3] > 128) ink++;
      }
      return { light: light / (width * height), clear: clear / (width * height), ink: ink / (width * height) };
    };
    return {
      width: canvas.width, height: canvas.height,
      background: sample(0, 0, 120, 350),
      forehead: sample(400, 150, 200, 200),
      eyes: sample(300, 480, 500, 90),
      beard: sample(350, 880, 400, 100),
    };
  });
  expect([regions.width, regions.height]).toEqual([1100, 1300]);
  expect(regions.background.clear).toBe(1);
  expect(regions.forehead.clear).toBeGreaterThan(.08);
  expect(regions.forehead.ink).toBeGreaterThan(.25);
  expect(regions.forehead.light).toBeGreaterThan(regions.eyes.light * 1.3);
  expect(regions.forehead.light).toBeGreaterThan(regions.beard.light * 1.8);
});

test("Only verified LinkedIn projects are featured, without template assets or external requests", async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  const external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4322/")) external.push(request.url()); });
  await ready(page);
  for (const selector of [".about-section", ".focus-section", "#maple-leaf", "#ai-rpg", "#desktop-assistant"]) await place(page, selector);
  await expect(page.locator(".project-card")).toHaveCount(3);
  await expect(page.locator(".focus-item")).toHaveCount(5);
  const destinations = await page.locator("a[href^='https:']").evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
  expect(destinations.every(url => ["www.linkedin.com", "es.linkedin.com"].includes(new URL(url).hostname) || url === "https://github.com/jrubiosainz")).toBe(true);
  await expect.poll(async () => page.locator(".project-image img").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
  expect(external).toEqual([]);
});

test("Both montage rows move in opposite directions and reverse with native scroll", async ({ page }) => {
  await ready(page);
  await place(page, ".marquee-section", .8);
  const transforms = async () => page.locator(".marquee-row").evaluateAll(rows => rows.map(row => new DOMMatrix(getComputedStyle(row).transform).m41));
  const initial = await transforms();
  await page.evaluate(() => scrollBy({ top: 350, behavior: "instant" }));
  await expect.poll(async () => (await transforms())[0]).toBeGreaterThan(initial[0] + 20);
  const forward = await transforms();
  expect(forward[1]).toBeLessThan(initial[1] - 20);
  await page.evaluate(() => scrollBy({ top: -350, behavior: "instant" }));
  await expect.poll(async () => (await transforms())[0]).toBeCloseTo(initial[0], 1);
  expect((await transforms())[1]).toBeCloseTo(initial[1], 1);
});

test("About text reveals progressively and is readable once, not character by character, to assistive technology", async ({ page }) => {
  await ready(page);
  const chars = page.locator(".reveal-char");
  await place(page, ".about-copy", .85);
  const initial = Number(await chars.last().evaluate(el => getComputedStyle(el).opacity));
  await place(page, ".about-copy", -.1);
  await expect(chars.last()).toHaveCSS("opacity", "1");
  await place(page, ".about-copy", .85);
  await expect.poll(async () => Number(await chars.last().evaluate(el => getComputedStyle(el).opacity))).toBeCloseTo(initial, 2);
  await expect(page.locator(".animated-text")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".about-copy .sr-only")).toContainText("Cloud Solution Architect");
});

test("Desktop cards stick and scale backwards; mobile and short screens use normal flow", async ({ page }) => {
  await ready(page);
  const first = page.locator(".project-card").first();
  await expect(first).toHaveCSS("position", "sticky");
  await place(page, "#ai-rpg", .12);
  await expect.poll(async () => Number(await first.getAttribute("data-scale"))).toBeLessThan(.97);
  await place(page, ".project-stack", .7);
  await expect.poll(async () => Number(await first.getAttribute("data-scale"))).toBe(1);
  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(first).toHaveCSS("position", "relative");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(first).toHaveCSS("position", "relative");
});

test("Magnetic portrait responds to a fine pointer and resets on exit", async ({ page }) => {
  await ready(page);
  await page.mouse.move(1200, 400);
  await expect(page.locator(".portrait-magnet")).not.toHaveCSS("transform", "none");
  await page.mouse.move(10, 995);
  await place(page, ".about-section");
  await page.mouse.move(700, 300);
  await expect(page.locator(".portrait-magnet")).toHaveCSS("transform", "none");
});

test("Motion off restores complete text, static artwork and normal-flow projects and persists", async ({ page }) => {
  await ready(page);
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".project-card").first()).toHaveCSS("position", "relative");
  await expect(page.locator(".reveal-char").last()).toHaveCSS("opacity", "1");
  await expect(page.locator(".hero-portrait")).toBeVisible();
  const initial = await page.locator(".marquee-row").first().evaluate(el => getComputedStyle(el).transform);
  await place(page, ".marquee-section", .2);
  expect(await page.locator(".marquee-row").first().evaluate(el => getComputedStyle(el).transform)).toBe(initial);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
});

test("OS reduced motion is respected at startup and when changed live", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(page.locator("#motion-toggle")).toBeDisabled();
  await expect(page.locator(".reveal-char").last()).toHaveCSS("opacity", "1");
  await expect(page.locator(".project-card").first()).toHaveCSS("position", "relative");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("#motion-toggle")).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
});

test("Language console preserves the chapter, explicit preferences and browser back navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "/#systems");
  await page.locator(".locale-console summary").click();
  await page.locator("[data-language=es]").click();
  await expect(page).toHaveURL(/\/es\/#systems$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#focus-title")).toHaveText("MI ENFOQUE");
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/es\/$/);
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/es/#desktop-assistant");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("Delayed fonts do not displace a deep-linked project after enhancement", async ({ page }) => {
  await page.route(/\.woff2$/, async route => { await new Promise(resolve => setTimeout(resolve, 250)); await route.continue(); });
  await ready(page, "/?lang=en#ai-rpg");
  await expect(page.locator("#ai-rpg-title")).toBeInViewport();
});

test("No-JavaScript pages retain all text, portrait, project links and bilingual navigation", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const path of ["/", "/es/"]) {
    await page.goto(path);
    await expect(page.locator(".hero-portrait")).toBeVisible();
    await expect(page.locator(".hero-portrait")).toHaveAttribute("src", "/creator/portrait-points.png");
    await expect(page.locator(".hero-portrait")).toHaveAttribute("alt", path === "/" ? /photograph.*silver points/ : /Fotografía.*puntos plateados/);
    await expect(page.locator(".project-card")).toHaveCount(3);
    await expect(page.locator(".project-card").first()).toHaveCSS("position", "relative");
    await expect(page.locator(".reveal-char").last()).toHaveCSS("opacity", "1");
    await page.locator(".locale-console summary").click();
    await expect(page.locator("[data-language=es]")).toBeVisible();
  }
  await context.close();
});

test("Keyboard users have a visible skip link and a dismissible locale console", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toBeInViewport();
  await page.locator(".locale-console summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".locale-console")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".locale-console")).not.toHaveAttribute("open");
  await expect(page.locator(".locale-console summary")).toBeFocused();
});

for (const lang of ["en", "es"]) {
  for (const width of [360, 390, 768, 1440, 1920]) {
    test(`${lang}: complete usable layout at ${width}px without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 400 ? 640 : 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready(page, lang === "es" ? "/es/" : "/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const heading = await page.locator("h1").boundingBox();
      expect(heading && heading.x >= 0 && heading.x + heading.width <= width + 1).toBeTruthy();
      await page.locator(".site-header a[href='#projects']").click();
      await expect(page.locator("#projects-title")).toBeInViewport();
      await place(page, "#connect");
      await expect(page.locator(".contact-bottom .contact-pill")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
