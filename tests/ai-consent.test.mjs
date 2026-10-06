import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/food.js";
import "../logger/js/shared/cloud.js";
// Privacy registers DOM listeners at import time; no listeners are needed in these tests.
globalThis.document = { addEventListener: () => {} };
await import("../logger/js/pages/privacy.js");

let store, calls, sheets;
const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  store = new Map();
  calls = [];
  sheets = [];
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
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
  app.session = { user: { id: "user-a" } };
  app.state = {};
  app.renderOnboard = () => {};
  app.save = () => {};
  app.render = () => {};
  app.clearPhotoStore = async () => {};
  app.replaceState = (state) => { app.state = state; };
  app.load = () => ({});
  app.applyTheme = () => {};
  app.deleteBusy = false;
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
  assert.equal(store.has("insight-ai-consent:user-a"), false);
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
    assert.equal(store.get("insight-ai-consent:user-a"), "1");
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
  assert.equal(store.has("insight-ai-consent:user-a"), false);
});

test("the consent sheet names the processor, privacy policy, and both actions", () => {
  const html = app.foodAIConsentSheetHTML();
  assert.match(html, /Before your first AI estimate/);
  assert.match(html, /You'll only be asked once for this account\./);
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


test("consent belongs to the current account", async () => {
  app.aiConsentAllow();
  assert.equal(app.aiConsentGiven(), true);
  app.session = { user: { id: "user-b" } };
  app.ui.sd = { meal: "lunch", text: "Rice and beans" };
  await app.analyzeFoodText();
  assert.equal(app.ui.sheet, "ai-consent");
  assert.equal(calls.length, 0);
  app.aiConsentCancel();

  app.session = { user: { id: "user-a" } };
  sheets.length = 0;
  await app.analyzeFoodText();
  assert.equal(calls.length, 1);
  assert.equal(sheets.includes("ai-consent"), false);
});

test("signed-out consent uses local and clearing defaults to the current account", () => {
  app.aiConsentAllow();
  app.session = null;
  assert.equal(app.aiConsentGiven(), false);
  app.aiConsentAllow();
  assert.equal(store.get("insight-ai-consent:local"), "1");
  app.clearAIConsent();
  assert.equal(app.aiConsentGiven(), false);
  assert.equal(store.get("insight-ai-consent:user-a"), "1");
  app.session = { user: { id: "user-a" } };
  app.clearAIConsent();
  assert.equal(app.aiConsentGiven(), false);
});

test("sign-out clears the account and local consent flags", async () => {
  app.aiConsentAllow();
  store.set("insight-ai-consent:local", "1");
  store.set("insight-ai-consent:user-b", "1");
  app.sb = null;
  await app.signOut({ skipPush: true, quiet: true });
  assert.equal(app.session, null);
  assert.equal(store.has("insight-ai-consent:user-a"), false);
  assert.equal(store.has("insight-ai-consent:local"), false);
  assert.equal(store.get("insight-ai-consent:user-b"), "1");
});

for (const action of ["eraseThisPhone", "deleteAccount"]) {
  test(`${action} clears every consent flag, including the legacy key`, async () => {
    app.aiConsentAllow();
    store.set("insight-ai-consent:local", "1");
    store.set("insight-ai-consent:user-b", "1");
    store.set("insight-ai-consent", "1");
    store.set("unrelated", "keep");
    app.$ = (selector) => selector === "#del-confirm" ? { value: "DELETE" } : null;
    await app[action]();
    assert.equal([...store.keys()].some((key) => key.startsWith("insight-ai-consent")), false);
    assert.equal(store.get("unrelated"), "keep");
    if (action === "deleteAccount") {
      assert.equal(app.session, null);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, "delete-account");
    } else assert.equal(calls.length, 0);
  });
}

for (const change of ["account", "consent", "sign-out"]) {
  test(`photo sends nothing when ${change} changes during compression`, async () => {
    app.aiConsentAllow();
    // Give user-b consent too, so the account check is tested independently.
    store.set("insight-ai-consent:user-b", "1");
    store.set("insight-ai-consent:local", "1");
    app.compressForAI = async () => {
      if (change === "account") app.session = { user: { id: "user-b" } };
      else if (change === "consent") app.clearAIConsent();
      else app.session = null;
      return "compressed";
    };
    await app.analyzeFoodPhoto({});
    assert.equal(calls.length, 0);
    assert.match(app.ui.sd.error, /Nothing was sent because the account changed\. Try again\./);
    assert.equal(app.ui.sd.loading, false);
  });
}

test("photo invokes exactly once after compression when account and consent stay unchanged", async () => {
  app.aiConsentAllow();
  await app.analyzeFoodPhoto({});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "food-photo");
  assert.equal(calls[0].options.body.image, "compressed");
  assert.equal(app.ui.sd.error, null);
});
