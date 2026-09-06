# Beyond the interface

Personal website at https://jrubiosainz.github.io/ with a complete Spanish edition at `/es/`.

An original, fixed-camera technological scene: typographic portrait particles and individually articulated titanium components assemble and separate with native scrolling. The scene is a visual metaphor, not a body scan or a reproduction of a fictional superhero suit.

## Publication policy

Professional history and projects must be supported by LinkedIn. Public availability of a personal repository does not grant permission to feature it. See [SOURCES.md](SOURCES.md).

## Development and deployment

Node 22.12+:

```sh
npm ci
npm run dev
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

The GitHub Actions workflow validates pull requests and deploys `dist/` to Pages from `main`. Only the deployment job receives Pages write/OIDC permissions. The site has no catch-all router and does not replace other project Pages paths.

## Scene and content

Astro emits complete static English and Spanish documents. Three.js renders the original GLB; Anime.js timelines interpolate each component's real position/rotation directly from scroll progress. The page never replaces native scrolling or traps the pointer. `src/scripts/scene.ts` owns renderer resources and the reversible assembly; `experience.ts` owns preferences, chapter navigation and lifecycle.

Anime.js is the single animation system; GSAP was replaced rather than layered on top. Direct Three.js avoids a React/R3F runtime for one scene. Native scrolling makes Lenis unnecessary. Pretext is not needed because the portrait uses a shader glyph atlas rather than text-layout measurement.

The profile photograph was explicitly authorized by the owner and comes from his public LinkedIn post's portrait. It is sampled locally into a glyph portrait, not sent to an image-generation service. Career/project content comes from exact, verified original LinkedIn posts: Maple Leaf, a 3D AI RPG prototype, a Copilot SDK desktop assistant, and two professional speaking-related posts. `src/content/site.ts` contains typed translations and citations. Do not add unverifiable project cards or career dates.

Project images are local copies of the accepted posts' original attachments, with localized alternative text and visible source captions. They are not invented product screenshots. The GitHub footer link is only the owner's requested social-profile link, never project evidence.

`scripts/build-armor.py` generates the original model and a transparent static render with Blender. `npm run social` captures both localized social previews from a running local server (default `http://127.0.0.1:4321/`, overridable with `PREVIEW_URL`).

## Progressive enhancement

The text, links, static armor render and native language console work without JavaScript. English is the first-visit default; explicit language preferences persist locally. `/es/` always opens Spanish, and `/?lang=en` explicitly selects English. The current chapter is preserved on language changes.

No 3D code or GLB is requested when OS reduced motion or the persistent motion-off setting is active. The complete Blender render replaces WebGL on initialization failure, asset failure or context loss. All render loops stop while the document is hidden; frames are requested only while a scroll transition is changing. Pixel ratio is bounded (1.35 on mobile, 1.7 on wider screens), resources are disposed on exit/preferences changes, and content remains visible during scene loading.

Fontsource fonts are self-hosted. Their full SIL Open Font License notices and Anime.js/Three.js MIT licenses are copied to `dist/licenses/` during the build. No analytics, third-party runtime embeds, remote fonts, autoplay audio or external 3D assets are used.
