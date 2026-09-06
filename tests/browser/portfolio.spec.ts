import { test, expect } from "@playwright/test";

for (const lang of ["en", "es"]) {
  for (const width of [360, 390, 768, 1440]) {
    test(`${lang}: profile-only page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(lang === "es" ? "/es/" : "/");
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("main a")).toHaveAttribute("href", "https://www.linkedin.com/in/jrubiosainz/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator(".project, .experiment")).toHaveCount(0);
    });
  }
}
