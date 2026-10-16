import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { app } from "../logger/js/runtime.js";
import { echoMeal } from "../logger/js/shared/heard.js";
import "../logger/js/pages/food.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function item(name, portion, calories = 100) {
  return { name, portion, grams: 50, calories, protein: 1, carbs: 2, fat: 3, hrv: 987654, mood: 24680 };
}

test("a describe-it echo keeps the person's words apart from guessed foods", () => {
  const echo = echoMeal("2 eggs, toast", [
    item("Eggs", "2 large", 156),
    item("Toast", "2 slices", 80),
    item("Butter", "1 tbsp", 100),
  ]);
  assert.equal(echo.heardText, "2 eggs, toast");
  assert.deepEqual(echo.heard.map((row) => [row.name, row.echo]), [["Eggs", "heard"], ["Toast", "portion"]]);
  assert.deepEqual(echo.guessed.map((row) => row.name), ["Butter"]);
  const raw = JSON.stringify(echo);
  assert.equal(raw.includes("987654"), false);
  assert.equal(raw.includes("24680"), false);
  assert.equal(raw.includes("hrv"), false);
  assert.equal(raw.includes("mood"), false);
  assert.deepEqual(Object.keys(echo.rows[0]).sort(), ["base", "echo", "mult", "name", "portion"]);
  assert.deepEqual(Object.keys(echo.rows[0].base).sort(), ["c", "f", "kcal", "p"]);
});

test("number words and butter the person named stay in what was heard", () => {
  const eggs = echoMeal("two eggs", [item("Eggs", "2 large")]);
  assert.equal(eggs.rows[0].echo, "heard");
  const both = echoMeal("toast with butter", [item("Toast", "1 slice"), item("Butter", "1 tbsp")]);
  assert.deepEqual(both.rows.map((row) => row.echo), ["portion", "portion"]);
  assert.equal(both.guessed.length, 0);
  const coffee = echoMeal("black coffee", [item("Coffee", "1 cup")]);
  assert.equal(coffee.rows[0].echo, "portion");
  const half = echoMeal("1/2 cup rice", [item("Rice", "0.5 cup")]);
  assert.equal(half.rows[0].echo, "heard");
});

test("a shorter meal name is heard when the estimate adds a preparation or a cut", () => {
  const echo = echoMeal("chicken and rice", [
    item("Grilled chicken breast", "6 oz"),
    item("White rice", "1 cup"),
    item("Chicken broth", "1 cup"),
  ]);
  assert.deepEqual(echo.rows.map((row) => [row.name, row.echo]), [
    ["Grilled chicken breast", "portion"],
    ["White rice", "portion"],
    ["Chicken broth", "guessed"],
  ]);
  assert.deepEqual(echo.guessed.map((row) => row.name), ["Chicken broth"]);
  const named = echoMeal("6 oz chicken and 1 cup rice", [
    item("Grilled chicken breast", "6 oz"),
    item("White rice", "1 cup"),
  ]);
  assert.deepEqual(named.rows.map((row) => row.echo), ["heard", "heard"]);
});

test("an empty description marks every food as guessed", () => {
  const echo = echoMeal("  ", [item("Eggs", "2 large")]);
  assert.equal(echo.heardText, "");
  assert.equal(echo.rows[0].echo, "guessed");
  assert.equal(echoMeal("eggs", []).rows.length, 0);
});

test("the review sheet shows what was heard and what was guessed before save", () => {
  app.esc = esc;
  app.pl = (n, word) => `${n} ${word}`;
  app.ui = {
    sd: {
      meal: "breakfast",
      source: "describe",
      text: "2 eggs, toast",
      items: echoMeal("2 eggs, toast", [
        { name: "Eggs", portion: "2 large", mult: 1, base: { kcal: 156, p: 12, c: 1, f: 11 } },
        { name: "Toast", portion: "2 slices", mult: 1, base: { kcal: 80, p: 3, c: 14, f: 1 } },
        { name: "Butter", portion: "1 tbsp", mult: 1, base: { kcal: 100, p: 0, c: 0, f: 11 } },
      ]).rows,
    },
  };
  const html = app.foodReviewSheetHTML();
  assert.match(html, /What I heard/);
  assert.match(html, /What I guessed/);
  assert.match(html, /2 eggs, toast/);
  assert.match(html, /data-echo="heard"/);
  assert.match(html, /data-echo="guessed"/);
  assert.match(html, /Portion guessed/);
  assert.match(html, /Guessed/);
  assert.match(html, /Nothing is saved until you confirm/);
  assert.match(html, /aria-label="Portion for Eggs"/);
  assert.equal(html.includes("987654"), false);
  const photo = app.foodReviewSheetHTML.call ? null : null;
  app.ui.sd = {
    meal: "lunch",
    source: "photo",
    items: [{ name: "Rice", portion: "1 cup", mult: 1, base: { kcal: 200, p: 4, c: 40, f: 1 } }],
  };
  const plate = app.foodReviewSheetHTML();
  assert.doesNotMatch(plate, /What I heard/);
  assert.equal(photo, null);
});

test("describe-it still sends only the meal text and stamps the echo locally", async () => {
  const calls = [];
  app.esc = esc;
  app.pl = (n, word) => `${n} ${word}`;
  app.ui = { sheet: "food-describe", sd: { meal: "breakfast", text: "2 eggs, toast" } };
  app.renderSheet = () => {};
  app.toast = () => {};
  app.today = () => "2026-10-14";
  app.aiClock = () => ({ localDate: "2026-10-14", timeZone: "America/Chicago" });
  app.aiConsentGiven = () => true;
  app.describeBusy = false;
  app.session = { user: { id: "user-a" } };
  app.sb = { functions: { invoke: async (name, options) => {
    calls.push({ name, options });
    return {
      data: {
        items: [
          { name: "Eggs", portion: "2 large", calories: 156, protein: 12, carbs: 1, fat: 11 },
          { name: "Butter", portion: "1 tbsp", calories: 100, protein: 0, carbs: 0, fat: 11 },
        ],
        notes: "Butter was not named.",
        remaining: 19,
      },
      error: null,
    };
  } } };
  await app.analyzeFoodText();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "food-describe");
  assert.deepEqual(Object.keys(calls[0].options.body).sort(), ["localDate", "text", "timeZone"]);
  assert.equal(calls[0].options.body.text, "2 eggs, toast");
  assert.deepEqual(app.ui.sd.items.map((row) => [row.name, row.echo]), [["Eggs", "heard"], ["Butter", "guessed"]]);
  const src = readFileSync(new URL("../logger/js/shared/heard.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|posthog|Sentry|oura|capture\(/);
});
