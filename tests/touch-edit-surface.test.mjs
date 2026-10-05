import assert from "node:assert/strict";
import test from "node:test";
import { HOME_WIDGETS, commitHomeEditor, homeEditorDraft } from "../logger/js/shared/home-widgets.js";
import { addToDraft, moveItem, reorderDraft, removeFromDraft, sizeChoices } from "../logger/js/shared/home-edit.js";

const SEED = Number(process.env.TEST_SEED || 0x70c4);
console.log("TEST_SEED", SEED);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = Object.keys(HOME_WIDGETS);
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const baseState = () => ({ demo: true, muscleMode: "basic", layout: {}, oura: { connected: false } });

/* Tiny model of the editor shell: hold enters edit, Done exits, edits only happen in edit mode. */
function run(rand, say) {
  const state = baseState();
  let editing = false;
  let draft = null;
  for (let step = 0; step < 25; step++) {
    const op = pick(rand, ["hold", "drag", "tap-add", "remove", "done"]);
    if (op === "hold") {
      if (!editing) { draft = homeEditorDraft(state); editing = true; }
      /* a second hold while editing changes nothing */
    } else if (!editing) {
      continue; // drag, add, remove and Done are only reachable in edit mode
    } else if (op === "drag") {
      if (!draft.items.length) continue;
      const id = pick(rand, draft.items);
      const to = Math.floor(rand() * draft.items.length);
      const before = draft.items.slice();
      draft = reorderDraft(draft, id, to);
      assert.deepEqual(draft.items, moveItem(before, before.indexOf(id), to), say("drag matches moveItem"));
      assert.equal(draft.items.indexOf(id), to, say("dragged id lands at target"));
    } else if (op === "tap-add") {
      const id = pick(rand, IDS);
      draft = addToDraft(draft, id, pick(rand, sizeChoices(id)));
    } else if (op === "remove") {
      if (draft.items.length) draft = removeFromDraft(draft, pick(rand, draft.items));
    } else {
      const home = commitHomeEditor(state, draft);
      editing = false;
      assert.deepEqual([...home.items].sort(), [...draft.items].sort(), say("Done saves a permutation of the draft"));
      draft = null;
      continue;
    }
    assert.equal(new Set(draft.items).size, draft.items.length, say("no duplicate ids"));
    assert.ok(draft.items.every((id) => HOME_WIDGETS[id]), say("only registry ids"));
    assert.ok(draft.items.every((id) => !draft.hidden.includes(id)), say("shown and hidden are disjoint"));
    assert.equal(new Set(draft.hidden).size, draft.hidden.length, say("no duplicate hidden ids"));
  }
  if (editing) {
    const home = commitHomeEditor(state, draft);
    assert.deepEqual([...home.items].sort(), [...draft.items].sort(), say("final order is a permutation of the draft"));
  }
}

test("random hold, drag, add, remove, Done sequences keep the draft a clean permutation", () => {
  for (let i = 0; i < 300; i++) {
    const seed = (SEED + i * 7919) >>> 0;
    run(mulberry32(seed), (what) => `seed ${seed}: ${what}`);
  }
});

test("a drag never changes the set of ids", () => {
  const rand = mulberry32(SEED);
  for (let i = 0; i < 300; i++) {
    const d = homeEditorDraft(baseState());
    const moved = reorderDraft(d, pick(rand, d.items), Math.floor(rand() * d.items.length));
    assert.deepEqual([...moved.items].sort(), [...d.items].sort(), `seed ${SEED} iter ${i}`);
  }
});

test("selection emptiness after a long press is asserted in the browser harness", () => {
  /* The selectstart guard in home-drag.js needs a DOM. logger/tests/touch-qol.mjs
     long-presses a Home card and checks window.getSelection().toString() === "". */
  assert.ok(true);
});
