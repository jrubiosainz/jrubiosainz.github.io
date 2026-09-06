import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { copy, identity } from "../src/content/site.ts";

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
