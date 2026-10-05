import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL("../logger/" + p, import.meta.url), "utf8");
const html = read("index.html");
const css = ["base", "platform", "home-widgets"].map((f) => read(`css/${f}.css`)).join("\n");

/* Selector lists of every rule block whose declarations match decl. */
function selectorsWith(decl) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (decl.test(m[2])) out.push(m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
  }
  return out.join(",\n");
}

test("viewport blocks pinch and button zoom", () => {
  const meta = html.match(/<meta name="viewport" content="([^"]*)"/);
  assert.ok(meta, "viewport meta present");
  assert.match(meta[1], /maximum-scale=1\b/);
  assert.match(meta[1], /user-scalable=no/);
  assert.match(meta[1], /width=device-width/);
});

test("Home cards and shell chrome opt out of selection", () => {
  const none = selectorsWith(/(?<![-\w])user-select:\s*none/);
  for (const sel of [".hw", ".hw-slot", ".home-v2", "#tabs", ".page-head", ".home-editor-top"]) {
    assert.ok(none.includes(sel), `${sel} has user-select: none`);
  }
  const webkit = selectorsWith(/-webkit-user-select:\s*none/);
  assert.ok(webkit.includes(".hw-slot") && webkit.includes("#tabs"));
});

test("callout is off on the Home and gesture surface", () => {
  const callout = selectorsWith(/-webkit-touch-callout:\s*none/);
  for (const sel of [".home-v2", ".hw-slot", ".hw", "#tabs"]) assert.ok(callout.includes(sel), sel);
});

test("fields and prose stay selectable", () => {
  const text = selectorsWith(/(?<![-\w])user-select:\s*text/);
  for (const sel of ["input", "textarea", "[contenteditable]", ".hint", ".prose"]) assert.ok(text.includes(sel), sel);
  assert.ok(selectorsWith(/-webkit-user-select:\s*text/).includes("textarea"));
});

test("drag keeps touch-action none; shell uses manipulation", () => {
  assert.match(css, /\.editing \.hw-slot\.dragging\s*\{[^}]*touch-action:\s*none/);
  assert.match(selectorsWith(/touch-action:\s*manipulation/), /\bbody\b/);
});

/* Typed-text controls only: untyped input, text-like types, textarea, .text-in.
   Checkbox/radio glyphs, ::before/::after and labels are decorative and skipped. */
const TEXT_TYPES = ["text", "search", "email", "tel", "url", "password", "number"];
function isTextEntry(sel) {
  if (/::|:(?:before|after)\b/.test(sel)) return false;
  if (!/\binput\b|\btextarea\b|\.text-in\b/.test(sel)) return false;
  const type = sel.match(/\[type=["']?([\w-]+)["']?\]/);
  return !type || TEXT_TYPES.includes(type[1]);
}

test("no text-entry field forces a font under 16px (iOS focus zoom)", () => {
  let seen = 0;
  for (const f of ["base", "food", "platform", "polish", "privacy", "theme", "goals", "session", "cardio", "progress", "appearance", "weekly", "brief"]) {
    for (const m of read(`css/${f}.css`).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const px = m[2].match(/(?<![-\w])font-size:\s*(\d+(?:\.\d+)?)px/);
      if (!px) continue;
      for (const sel of m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim())) {
        if (!isTextEntry(sel)) continue;
        seen++;
        assert.ok(+px[1] >= 16, `${f}.css: ${sel} has ${px[1]}px`);
      }
    }
  }
  assert.ok(seen > 0, "found text-entry font-size rules");
});
