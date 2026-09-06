import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { copy, projects, experiments, identity } from "../src/content/site.ts";

test("English and Spanish have complete, matching dictionaries", () => {
  assert.deepEqual(Object.keys(copy.en).sort(), Object.keys(copy.es).sort());
  for (const [language, entries] of Object.entries(copy)) {
    for (const [key, value] of Object.entries(entries)) assert.ok(value.trim(), `${language}.${key}`);
  }
});

test("Four verified flagship projects and three other experiments have safe public links", () => {
  assert.equal(projects.length, 4);
  assert.equal(experiments.length, 3);
  assert.equal(new Set(projects.map(project => project.id)).size, projects.length);
  const allowed = new Set(["github.com", "huggingface.co", "jrubiosainz.github.io"]);
  for (const item of [...projects, ...experiments]) {
    const url = new URL(item.url);
    assert.equal(url.protocol, "https:");
    assert.ok(allowed.has(url.hostname));
    for (const lang of ["en", "es"] as const) assert.ok(item.description[lang].trim());
  }
  for (const project of projects) {
    for (const lang of ["en", "es"] as const) {
      assert.ok(project.note[lang].trim());
      assert.ok(project.category[lang].trim());
      assert.ok(project.status[lang].trim());
    }
  }
  assert.equal(projects.find(p => p.id === "agentmon")?.url, "https://github.com/jrubiosainz/agentmon");
  assert.match(projects.find(p => p.id === "microduck")?.status.en ?? "", /simulation/i);
  assert.match(projects.find(p => p.id === "reachy-mini")?.status.en ?? "", /simulation/i);
});

test("Static build exposes content, local social preview, canonical and alternate languages", async () => {
  for (const lang of ["en", "es"] as const) {
    const html = await readFile(lang === "en" ? "dist/index.html" : "dist/es/index.html", "utf8");
    assert.ok(html.includes(`<html lang="${lang}"`));
    assert.ok(html.includes(copy[lang].heroFirst));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(html.includes("hreflang=\"en\"") && html.includes("hreflang=\"es\""));
    assert.ok(html.includes(identity.linkedin) && html.includes(identity.github));
    for (const project of projects) assert.ok(html.includes(project.url));
    assert.ok(html.includes(`social-preview${lang === "es" ? "-es" : ""}.png`));
    assert.ok(!html.includes("fonts.googleapis.com"));
    assert.ok(!html.includes("agentmon.azurewebsites.net"));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, "IDs must be unique, including SVG paint servers");
  }
  for (const suffix of ["", "-es"]) {
    const preview = await readFile(`public/social-preview${suffix}.png`);
    assert.ok(preview.length > 10_000);
  }
});

test("The displayed compiler lines match the actual implementation", async () => {
  const motion = await readFile("src/scripts/motion.ts", "utf8");
  for (const [part, property] of [["chassis", "y: 90"], ["limbs", "scale: 0"], ["face", "y: -60"], ["spark", "scale: 0"]]) {
    assert.ok(motion.includes(`world.from("#idea .${part}", { ${property}, opacity: 0 });`));
  }
});
