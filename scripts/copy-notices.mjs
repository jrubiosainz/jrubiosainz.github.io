import { copyFile, mkdir } from "node:fs/promises";

await mkdir("public/licenses", { recursive: true });
for (const [source, name] of [
  ["@fontsource-variable/space-grotesk", "Space-Grotesk"],
  ["@fontsource-variable/manrope", "Manrope"],
  ["@fontsource/ibm-plex-mono", "IBM-Plex-Mono"],
]) {
  await copyFile(`node_modules/${source}/LICENSE`, `public/licenses/${name}-OFL.txt`);
}
await copyFile("node_modules/animejs/LICENSE.md", "public/licenses/Anime-js-MIT.txt");
await copyFile("node_modules/three/LICENSE", "public/licenses/Three-js-MIT.txt");
