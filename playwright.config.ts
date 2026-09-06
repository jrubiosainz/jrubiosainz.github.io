import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Software WebGL renderers share the runner CPU, so keep CI scenes serial.
  workers: process.env.CI ? 1 : 3,
  timeout: process.env.CI ? 60000 : 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4322",
    browserName: "chromium",
    launchOptions: {
      args: process.env.CI ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
    },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4322",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: !process.env.CI,
  },
});
