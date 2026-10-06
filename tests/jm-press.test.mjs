import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/data/body.js";
import "../logger/js/shared/muscles.js";

app.esc = (s) => String(s);
app.customExercises = () => [];
app.musclesLabel = () => "";
const NAMES = ["JM Press", "Smith Machine JM Press"];

test("both JM Press entries are in the Triceps group, once each", () => {
  for (const n of NAMES) {
    const hits = app.ASSETS.bank.filter((b) => b.n.toLowerCase() === n.toLowerCase());
    assert.equal(hits.length, 1, n);
    assert.equal(hits[0].g, "Triceps", n);
  }
});

test("every muscle key on the JM Press entries is in the muscle map", () => {
  const keys = new Set(app.ASSETS.advGroups.flatMap(([, items]) => items.map(([k]) => k)));
  for (const n of NAMES) {
    const b = app.ASSETS.bank.find((x) => x.n === n);
    assert.ok(b.a.length, n);
    for (const k of b.a) assert.ok(keys.has(k), `${n}: ${k}`);
  }
});

test("picker search finds both for jm and JM", () => {
  for (const q of ["jm", "JM"]) {
    const html = app.bankListHTML({ q, action: "pick" });
    for (const n of NAMES) assert.ok(html.includes(`data-name="${n}"`), `${q}: ${n}`);
  }
});
