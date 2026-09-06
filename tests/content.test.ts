import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { copy, identity, publications, professionalNotes } from "../src/content/site.ts";

test("Both language dictionaries are complete", () => {
  assert.deepEqual(Object.keys(copy.en).sort(), Object.keys(copy.es).sort());
  for (const entries of Object.values(copy)) for (const value of Object.values(entries)) assert.ok(value.trim());
});
test("Published content links to LinkedIn, not repository-sourced personal projects", async () => {
  for (const lang of ["en", "es"]) {
    const html = await readFile(lang === "es" ? "dist/es/index.html" : "dist/index.html", "utf8");
    assert.ok(html.includes(identity.linkedin));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(html.includes(`lang="${lang}"`));
    assert.equal((html.match(/href="https:\/\/github.com\/jrubiosainz\/[^"]+"/g) ?? []).length, 0);
    assert.ok(!html.includes("huggingface.co"));
  }
});
test("Featured projects and professional activities cite exact LinkedIn posts in both languages", () => {
  assert.equal(publications.length, 3);
  assert.equal(professionalNotes.length, 2);
  for (const entry of [...publications, ...professionalNotes]) {
    const url = new URL(entry.url);
    assert.ok(["www.linkedin.com", "es.linkedin.com"].includes(url.hostname));
    assert.ok(url.pathname.startsWith("/posts/jrubiosainz_"));
    assert.ok(!Number.isNaN(Date.parse(entry.date)));
    assert.ok(entry.description.en.length > 0 && entry.description.es.length > 0);
  }
});
test("Original model and its static render are present, with separately movable mesh nodes", async () => {
  const glb = await readFile("public/models/exosuit.glb");
  assert.equal(glb.subarray(0, 4).toString(), "glTF");
  const length = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + length).toString());
  assert.ok(document.meshes.length > 40);
  assert.ok(document.nodes.filter((node: { mesh?: number }) => node.mesh !== undefined).length > 40);
  const image = await readFile("public/models/exosuit-fallback.png");
  assert.ok(image.length > 30_000);
});
test("Localized social previews are original 1200 x 630 images", async () => {
  for (const suffix of ["", "-es"]) {
    const png = await readFile(`public/identity-preview${suffix}.png`);
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  }
});
test("Every project includes local media and localized alternative text", async () => {
  for (const publication of publications) {
    assert.ok(publication.image.alt.en.length > 20);
    assert.ok(publication.image.alt.es.length > 20);
    assert.notEqual(publication.image.alt.en, publication.image.alt.es);
    const image = await readFile(`public${publication.image.src}`);
    assert.ok(image.length > 10_000);
    assert.equal(image.readUInt16BE(0), 0xffd8);
  }
});
