import { copyFile, mkdir } from "node:fs/promises";

await mkdir("public/licenses", { recursive: true });
await copyFile("node_modules/@fontsource/kanit/LICENSE", "public/licenses/Kanit-OFL.txt");
await copyFile("node_modules/animejs/LICENSE.md", "public/licenses/Anime-js-MIT.txt");
