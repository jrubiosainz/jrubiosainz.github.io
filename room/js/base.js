// ---------------------------------------------------------------------------------------------------------------
// Where the room's files live: the folder the code itself was loaded from (not the page's address). The published
// home page loads the code, and with it every asset, from jsDelivr, pinned to the commit it was published in
// (tools/publish_home.sh): GitHub Pages is slow to serve large files on some routes, and it keeps the 3D room, the
// lightmaps, the textures and the sounds off its bandwidth. In development, and whenever the CDN fails, the code
// comes from the page's own origin, and so do the assets.
// ---------------------------------------------------------------------------------------------------------------
export const BASE = new URL('../', import.meta.url).href;

// a path inside the site ('assets/…', 'vendor/…') as a full URL; absolute URLs pass through
export function asset(path) {
  if (!path || /^(?:[a-z]+:|\/\/)/i.test(path)) return path;
  return new URL(path.replace(/^\.?\//, ''), BASE).href;
}
