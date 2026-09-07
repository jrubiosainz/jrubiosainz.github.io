import { readFile, writeFile } from "node:fs/promises";
import { chromium, firefox } from "@playwright/test";

const source = await readFile(new URL("../public/portrait.jpg", import.meta.url));
const browser = await (process.env.BROWSER === "chromium" ? chromium : firefox).launch();

try {
  const page = await browser.newPage();
  const result = await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${data}`;
    await image.decode();
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sample = source.getContext("2d", { willReadFrequently: true });
    if (!sample) throw new Error("Source image sampling is unavailable.");
    sample.drawImage(image, 0, 0);
    const { data: pixels } = sample.getImageData(0, 0, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = 1100;
    canvas.height = 1300;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Point portrait rendering is unavailable.");

    // Keep the actual facial proportions: a uniform crop, never a generated face.
    const scale = 3.65;
    const spacing = 7;
    const smooth = (a, b, value) => {
      const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    let points = 0;
    for (let row = 0, y = 3; y < canvas.height; row++, y += spacing * .88) {
      for (let x = 3 + (row % 2) * spacing / 2; x < canvas.width; x += spacing) {
        const sx = Math.round(source.width / 2 + (x - canvas.width / 2) / scale);
        const sy = Math.round(y / scale);
        if (sx < 0 || sx >= source.width || sy >= source.height) continue;
        const offset = (sy * source.width + sx) * 4;
        const [r, g, b] = pixels.subarray(offset, offset + 3);
        // The authorized source has a white backdrop. Remove it, not the face.
        if (Math.min(r, g, b) > 225) continue;
        const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
        const tone = Math.min(1, Math.pow(luminance, 1.2) * 1.65);
        const fade = (1 - smooth(1070, 1295, y)) * smooth(0, 50, x) * (1 - smooth(1050, 1100, x));
        if (fade <= .01) continue;
        const radius = .95 + tone * 1.95;
        const silver = Math.round(140 + tone * 110);
        ctx.fillStyle = `rgba(${silver - 9},${silver - 3},${silver},${(.24 + tone * .76) * fade})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        points++;
      }
    }
    return { png: canvas.toDataURL("image/png").split(",")[1], points };
  }, source.toString("base64"));
  const output = new URL("../public/creator/portrait-points.png", import.meta.url);
  await writeFile(output, Buffer.from(result.png, "base64"));
  console.log(`Generated portrait-points.png: 1100 x 1300 RGBA, ${result.points} photo-sampled points.`);
} finally {
  await browser.close();
}
