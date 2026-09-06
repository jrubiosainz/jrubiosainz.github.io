# Imagination, compiled.

The personal portfolio of **Jesús Rubio Sainz**, Cloud Solution Architect, AI & Apps at Microsoft.

**[Live site](https://jrubiosainz.github.io/)** · **[Español](https://jrubiosainz.github.io/es/)**

An original, illustrated scroll story: an idea becomes a little mechanical companion, then four creative worlds, then an invitation to say hello. All artwork is original SVG, not screenshots of the featured products or assets from an animated film.

## Develop

Node **22.12+** and npm are required.

```sh
npm ci
npm run dev               # http://127.0.0.1:4321
npm run check             # strict TypeScript + Astro
npm run build            # static output in dist/
npm test                 # content, provenance boundaries and static HTML
npx playwright install chromium
npm run test:browser     # production preview + interaction/responsive tests
npm run preview
```

`npm run social` regenerates both localized `public/social-preview*.png` images from the running development server. Set `PREVIEW_URL` to use a different server. The PNGs are committed so social previews do not require a browser in the deployment job.

## Publish

`.github/workflows/pages.yml` validates pull requests. A push to `main` runs the same checks, uploads `dist`, and deploys to GitHub Pages. Repository **Settings → Pages → Source** must be **GitHub Actions**. Only the deploy job has `pages: write` and `id-token: write`; action versions are pinned to commit hashes.

`astro.config.mjs` uses `https://jrubiosainz.github.io` with no subpath. Both `/` and `/es/` have canonical URLs, reciprocal language alternates and a sitemap. There is no catch-all router or redirect: other project sites such as `/deduku/` remain independent.

## Content and languages

Edit `src/content/site.ts`: typed identity, public project sources, additional experiments, and complete `en` / `es` dictionaries. Keep each project's description, category, status and note accurate in both languages. Product names and actual code remain unchanged. A handful of illustration-only captions live beside their SVG in `src/components/`.

English is the first-visit default, independent of browser language. The native `<details>` language console links to real static pages and works without JavaScript. With JavaScript, explicit choices persist in `localStorage`, the nearest chapter is preserved, and back/forward navigation respects the visited page. `/?lang=en` explicitly selects English; `/es/` always opens Spanish. No preference is sent to a server.

Sources and limitations are documented in **[SOURCES.md](SOURCES.md)**. Do not add private repositories, infer career dates, or turn a simulation into a physical-hardware claim.

## Rendering and accessibility

**[Astro](https://docs.astro.build/en/concepts/islands/)** produces complete HTML; **strict TypeScript** handles the small enhancement layer; **[GSAP/ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)** drives reversible assembly and native-scroll timelines. The four code lines in the compiler correspond to the four real timeline operations in `src/scripts/motion.ts`.

The original SVG companion and project drawings are always present. GSAP loads dynamically only when motion is allowed. Its matchMedia contexts clean up on preference changes, resize and page exit. The companion's idle animation pauses offscreen and when the tab is hidden. No audio, tracking, remote fonts, scroll hijacking, custom cursor, blocking loader or embedded third-party runtime is used.

OS reduced motion is always respected, including live changes; the persistent motion toggle can further disable animation. Complete static illustrations replace scrubbed effects on reduced motion, missing JavaScript, failed animation loading or short screens. Project-world assembly is desktop-only; the compiler is sticky only on viewports at least 740px high. Core prose and links are never hidden by animation. Navigation uses real anchors, a skip link, visible focus styles and chapter labels.

**Why not more libraries?** React/R3F and Framer Motion add an unnecessary application runtime to this static story. Lenis would duplicate native scroll. Rive requires an additional authoring/runtime pipeline. Spline introduces a hosted embed and vendor payload. Direct Three.js was considered, but carefully layered original SVG provides the desired art direction with better small-screen fidelity and no GPU dependency. Consequently there is no WebGL context to fail or lose: the same designed artwork works without it. [Astro Pages guide](https://docs.astro.build/en/guides/deploy/github/) informed the deployment.

## Fonts and notices

Space Grotesk, Manrope and IBM Plex Mono are self-hosted through Fontsource under the SIL Open Font License. Their full upstream notices are copied into `dist/licenses/` during each build, alongside the GSAP notice. GSAP is available under its [standard no-charge license](https://gsap.com/standard-license), including commercial use; it is not described here as MIT-licensed. Dependency versions and transitive licenses remain in the lockfile and installed packages.

This is a personal website. Opinions and experiments are not statements on behalf of Microsoft.
