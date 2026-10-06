import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/food.js";

let store, calls, sheets;
const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  store = new Map();
  calls = [];
  sheets = [];
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  app.ui = { sheet: null, sd: {} };
  app.renderSheet = () => sheets.push(app.ui.sheet);
  app.aiConsentCancel();
  sheets.length = 0;
  app.toast = () => {};
  app.$ = () => null;
  app.today = () => "2026-10-06";
  app.autoMeal = () => "lunch";
  app.aiClock = () => ({ localDate: app.today(), timeZone: "America/Chicago" });
  app.compressForAI = async () => "compressed";
  app.session = {};
  app.describeBusy = false;
  app.sb = { functions: { invoke: async (name, options) => {
    calls.push({ name, options });
    return { data: { items: [], notes: "", remaining: 5 }, error: null };
  } } };
});

test("text and photo estimates send nothing before consent", async () => {
  app.ui.sheet = "food-describe";
  app.ui.sd = { meal: "lunch", text: "Two eggs and toast" };
  await app.analyzeFoodText();
  assert.equal(calls.length, 0);
  assert.equal(app.ui.sheet, "ai-consent");
  app.aiConsentCancel();

  app.ui.sheet = "food-photo";
  app.ui.sd = { meal: "lunch", hint: "Cooked in butter" };
  await app.analyzeFoodPhoto(null, "imgdata");
  assert.equal(calls.length, 0);
  assert.equal(app.ui.sheet, "ai-consent");
});

test("Cancel restores the previous sheet and text, and a later attempt asks again", async () => {
  app.ui.sheet = "food-describe";
  app.ui.sd = { meal: "lunch", text: "Two eggs and toast" };
  const sd = app.ui.sd;
  await app.analyzeFoodText();
  app.aiConsentCancel();
  await tick();
  assert.equal(calls.length, 0);
  assert.equal(store.has("insight-ai-consent"), false);
  assert.equal(app.aiConsentGiven(), false);
  assert.equal(app.ui.sheet, "food-describe");
  assert.equal(app.ui.sd, sd);
  assert.equal(app.ui.sd.text, "Two eggs and toast");
  await app.analyzeFoodText();
  assert.equal(app.ui.sheet, "ai-consent");
  assert.equal(calls.length, 0);
  app.aiConsentCancel();
  app.aiConsentAllow();
  assert.equal(calls.length, 0, "Cancel discarded the pending estimate");
});

for (const kind of ["text", "photo"]) {
  test(`Allow stores consent and runs the pending ${kind} estimate exactly once`, async () => {
    app.ui.sheet = kind === "text" ? "food-describe" : "food-photo";
    app.ui.sd = { meal: "lunch", text: "Two eggs and toast", hint: "Cooked in butter" };
    if (kind === "text") await app.analyzeFoodText();
    else await app.analyzeFoodPhoto(null, "imgdata");
    assert.equal(calls.length, 0);
    app.aiConsentAllow();
    assert.equal(store.get("insight-ai-consent"), "1");
    assert.equal(calls.length, 1, "the pending estimate starts in the Allow click");
    await tick();
    assert.equal(calls[0].name, kind === "text" ? "food-describe" : "food-photo");
    if (kind === "photo") {
      assert.equal(calls[0].options.body.image, "imgdata");
      assert.equal(calls[0].options.body.hint, "Cooked in butter");
    } else assert.equal(calls[0].options.body.text, "Two eggs and toast");
    app.aiConsentAllow();
    assert.equal(calls.length, 1, "the pending callback was cleared");

    app.ui.sheet = "food-describe";
    app.ui.sd = { meal: "lunch", text: "Rice and beans" };
    await app.analyzeFoodText();
    assert.equal(calls.length, 2);
    assert.equal(sheets.filter((sheet) => sheet === "ai-consent").length, 1);
    let ran = 0;
    app.withAIConsent(() => { ran++; });
    assert.equal(ran, 1, "stored consent runs the callback synchronously");
  });
}

test("Cancel closes consent when there was no previous sheet", () => {
  let ran = false;
  app.withAIConsent(() => { ran = true; });
  app.aiConsentCancel();
  assert.equal(app.ui.sheet, null);
  assert.equal(ran, false);
  assert.equal(store.has("insight-ai-consent"), false);
});

test("the consent sheet names the processor, privacy policy, and both actions", () => {
  const html = app.foodAIConsentSheetHTML();
  assert.match(html, /Before your first AI estimate/);
  assert.match(html, /Anthropic \(Claude\)/);
  assert.match(html, /href="https:\/\/willgeiken1\.github\.io\/wellnesstracker\/privacy" target="_blank" rel="noopener"/);
  assert.match(html, /data-action="ai-consent-allow">Allow/);
  assert.match(html, /data-action="ai-consent-cancel">Cancel/);
});

test("AI actions are gated and Settings credits RepDB", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const actions = read("../logger/js/shell/actions.js");
  for (const name of ["food-snap", "food-photo", "food-photo-go", "food-describe-go"]) {
    const body = actions.split(`case "${name}":`)[1]?.split(/\n\s*case /)[0];
    assert.ok(body, `${name} action exists`);
    assert.match(body, /app\.withAIConsent\(\(\) => \{/, `${name} is gated`);
  }
  const settings = read("../logger/js/pages/settings.js");
  assert.match(settings, /Exercise data by RepDB \(repdb\.co\)/);
  assert.match(settings, /href="https:\/\/repdb\.co"/);
  assert.match(read("../logger/js/shell/workout.js"), /app\.ui\.sheet === "ai-consent".*app\.foodAIConsentSheetHTML\(\)/);
});
