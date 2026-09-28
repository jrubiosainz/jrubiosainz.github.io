import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://jrubiosainz.github.io",
  base: "/portfolio",
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
