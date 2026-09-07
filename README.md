# Jesús Rubio Sainz

Personal portfolio at **https://jrubiosainz.github.io/**, with a complete Spanish edition at `/es/`.

A portrait-led creative-technologist site: oversized silver Kanit typography, a photograph encoded in silver points, opposing scroll-driven image bands, a progressively revealed introduction, a light professional-focus section and stacking project compositions.

## Run and publish

Node 22.12+:

```sh
npm ci
npm run dev
npm run check
npm run build
npm test
npx playwright install chromium firefox
npm run test:browser
```

For a single engine, use `npm run test:browser -- --project=firefox` or `--project=chromium`. GitHub Actions runs both engines and deploys the static `dist/` directory from `main`. Only the deployment job has Pages write and OIDC permissions. There is no catch-all router; existing project Pages paths are not replaced.

`npm run portrait` generates `public/creator/portrait-points.png` locally from the authorized photograph using Playwright's Firefox and Canvas2D. It requires no running server. `BROWSER=chromium` selects Chromium instead.

`npm run social` generates the two 1200×630 `portrait-points-preview*.png` social previews from a running local server. Set `BROWSER=firefox` for Firefox or `PREVIEW_URL` for a different preview origin.

## Editorial source boundary

Projects and professional activity come from the owner's original LinkedIn posts, **not repository descriptions**. The three featured projects are Maple Leaf, a 3D AI RPG prototype and a Copilot SDK desktop assistant. Each uses its own original post image and links to that publication. OGECON participation and the Microsoft AI Tour session announcement provide professional context; no employment chronology is invented.

`src/content/site.ts` is the typed bilingual source of truth. Edit its publication data, translations and focus areas together. The focus section describes professional interests, not a fabricated freelance services or pricing menu. [SOURCES.md](SOURCES.md) records exact citations and access limitations.

## Design and original assets

The owner's supplied MotionSites design brief informed the composition. The reference's fictional creator, commercial projects, stock head and externally hosted GIFs are not used. The bands show the owner's verified project images and clearly editorial artwork.

`scripts/build-point-portrait.mjs` samples the authorized `public/portrait.jpg` into a deterministic transparent point portrait. Uniform cropping preserves the photographed face's proportions; silver points encode its luminance, with the white backdrop removed and the lower edge faded. The shipped PNG is identical with and without JavaScript; Canvas2D is used only during asset generation, not by visitors.

`scripts/build-portrait.py --only icons` produces the four original decorative Blender renders in `public/creator/`. These objects are unchanged. Its legacy cartoon portrait is no longer published, and decorative objects are now the script's default output.

GPT-Image-2 was not used for this portrait. This is a deterministic local photograph transformation, not an AI-generated face. No photograph was uploaded to an external generation service.

Astro retains complete static HTML instead of introducing a React application merely to reproduce the reference's layout. Anime.js handles the portrait's reversible scroll transformation; lightweight native scroll calculations drive the bands, type reveal, decorative objects and card scales. Kanit is self-hosted through Fontsource. There is no runtime Three.js, React, Framer Motion, Tailwind, remote font, tracking, autoplaying GIF or embedded media dependency.

## Accessibility and motion

English is the first-visit default regardless of browser locale. The native language console persists explicit preferences, supports `/es/` and `/?lang=en`, preserves the current chapter and respects browser history.

The portrait and all content are available without JavaScript. The screen-reader introduction is one normal paragraph; the character animation is decorative and hidden from assistive technology. OS reduced motion and the persistent motion-off control disable magnetic movement, scroll transforms, animated text and sticky stacking. Smaller or short viewports always use natural-flow project cards.

Motion runs in response to scroll or pointer events, never an endless render loop. Hidden tabs stop animation frames. Native scroll, keyboard focus, skip navigation and semantic links remain intact. Full Kanit OFL and Anime.js MIT notices are copied to `dist/licenses/` during builds.
