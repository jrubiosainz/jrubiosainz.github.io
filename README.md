# Jesús Rubio Sainz

Personal website at https://jrubiosainz.github.io/ with a complete Spanish edition at `/es/`.

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

Fontsource fonts are self-hosted. Their full SIL Open Font License notices are copied to `dist/licenses/` during the build. No analytics, third-party runtime embeds or remote fonts are used.
