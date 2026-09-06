import { test, expect, type Page } from "@playwright/test";

async function jump(page: Page, y: number) {
  await page.evaluate(top => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(700);
}

test("English is the first-visit default even with a Spanish browser", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-ES" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/Jesús Rubio Sainz — Imagination/);
  await expect(page.locator(".project")).toHaveCount(4);
  await expect(page.locator(".experiment")).toHaveCount(3);
  await context.close();
});

test("Language console supports keyboard, deep links, persistence and history", async ({ page }) => {
  await page.goto("/#work");
  await expect(page.locator(".chapter-rail a[href='#work']")).toHaveClass(/active/);
  const consoleButton = page.locator(".language-console summary");
  await consoleButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".language-console")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(consoleButton).toBeFocused();
  // Keep the chapter while opening the language console at the top of the page.
  await consoleButton.dispatchEvent("click");
  await page.locator("[data-language=es]").dispatchEvent("click");
  await page.waitForURL("**/es/#work");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle(/Imaginación/);
  await expect(page.locator("#work-heading")).toContainText("La curiosidad");
  await expect(page.locator("meta[name=description]")).toHaveAttribute("content", /Arquitecto/);
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await page.waitForURL("**/es/");
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/es/#contact");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("Compiler genuinely assembles, completes, reverses and restores on motion off", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".build-section")).toHaveClass(/build-is-live/);
  const bounds = await page.locator(".build-runway").evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { start: rect.top + scrollY - innerHeight * .15, end: rect.bottom + scrollY - innerHeight * .9 };
  });
  await jump(page, bounds.start);
  await expect(page.locator(".compile-percent")).toHaveText("0%");
  const faceBefore = await page.locator("#idea .face").evaluate(el => getComputedStyle(el).opacity);
  await jump(page, bounds.start + (bounds.end - bounds.start) * .62);
  await expect(page.locator(".compile-percent")).toHaveText(/6[0-4]%/);
  await jump(page, bounds.end + 3);
  await expect(page.locator(".compile-percent")).toHaveText("100%");
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
  await jump(page, bounds.start);
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", faceBefore);
  await page.locator("#motion-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".build-section")).not.toHaveClass(/build-is-live/);
  for (const part of ["chassis", "limbs", "face", "spark"]) await expect(page.locator(`#idea .${part}`)).toHaveCSS("opacity", "1");
  for (const step of await page.locator(".code-step").all()) await expect(step).toHaveCSS("opacity", "1");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
});

test("Each project world assembles reversibly, and credits roll with native scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".build-section")).toHaveClass(/build-is-live/);
  for (const art of await page.locator(".project-art").all()) {
    const y = await art.evaluate(el => el.getBoundingClientRect().top + scrollY);
    await jump(page, y - 1000);
    const initial = await art.locator(".scene-object").getAttribute("transform");
    await jump(page, y - 240);
    await expect(art.locator(".scene-object")).toHaveCSS("opacity", "1");
    const completed = await art.locator(".scene-object").getAttribute("transform");
    expect(completed).not.toBe(initial);
    await jump(page, y - 1000);
    await expect(art.locator(".scene-object")).toHaveCSS("opacity", "0");
  }
  const credits = page.locator(".credits-list > div").first();
  const y = await page.locator(".credits-list").evaluate(el => el.getBoundingClientRect().top + scrollY);
  await jump(page, y - 1000);
  const before = await credits.evaluate(el => getComputedStyle(el).transform);
  await jump(page, y - 300);
  expect(await credits.evaluate(el => getComputedStyle(el).transform)).not.toBe(before);
});

test("Reduced motion works from first render and responds to live OS changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("#motion-toggle")).toBeDisabled();
  await expect(page.locator(".build-section")).not.toHaveClass(/build-is-live/);
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
  await expect(page.locator(".scene-object").first()).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".build-section")).toHaveClass(/build-is-live/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".build-section")).not.toHaveClass(/build-is-live/);
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
});

test("Core content and language navigation work without JavaScript or WebGL", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".project")).toHaveCount(4);
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
  await page.locator(".language-console summary").click();
  await page.locator("[data-language=es]").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#contact a[href='https://www.linkedin.com/in/jrubiosainz/']")).toBeVisible();
  await context.close();
});

test("A failed animation chunk leaves full static art and working navigation", async ({ page }) => {
  await page.route(/\/motion[.-].*\.js/, route => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
  await expect(page.locator(".scene-object").first()).toHaveCSS("opacity", "1");
  await page.locator(".chapter-rail a[href='#work']").click();
  await expect(page).toHaveURL(/#work$/);
});

test("WebGL unavailability has no effect on the SVG experience", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: () => null });
  });
  await page.goto("/");
  await expect(page.locator(".build-section")).toHaveClass(/build-is-live/);
  await expect(page.locator(".project-art svg")).toHaveCount(4);
  await page.locator("#motion-toggle").click();
  await expect(page.locator("#idea .face")).toHaveCSS("opacity", "1");
  await expect(page.locator(".scene-object").first()).toHaveCSS("opacity", "1");
});

test("Keyboard skip link and explicit language choices have visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.locator(".language-console summary").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-language=en]")).toBeFocused();
  expect(await page.locator("[data-language=en]").evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
});

for (const width of [360, 390, 768, 1440, 1920]) {
  for (const lang of ["en", "es"]) {
    test(`${lang} layout is readable without overflow at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 360 ? 640 : 1000 });
      await page.goto(lang === "es" ? "/es/" : "/");
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const id of ["build", "work", "about", "contact"]) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      if (width === 360) await expect(page.locator(".build-sticky")).toHaveCSS("position", "relative");
      expect(errors).toEqual([]);
    });
  }
}
