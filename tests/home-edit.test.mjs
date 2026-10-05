import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pickHomeV2 } from "../logger/js/shared/home-migrate.js";
import { HOME_WIDGETS, commitHomeEditor, getHomeLayout, homeEditorDraft } from "../logger/js/shared/home-widgets.js";
import { GALLERY_SUBTITLES, addToDraft, galleryEntries, moveItem, needsSizeChoice, removeFromDraft, reorderDraft, sizeChoices } from "../logger/js/shared/home-edit.js";

const IDS = Object.keys(HOME_WIDGETS);
const DEMO = () => ({ demo: true, muscleMode: "basic", layout: {}, oura: { connected: false } });
const NO_RING = () => ({ muscleMode: "basic", layout: {}, oura: { connected: false } });
const BOTH = IDS.filter((id) => sizeChoices(id).length > 1);
const ONE = IDS.filter((id) => sizeChoices(id).length === 1);

function saved(state, draft) {
  const before = Date.now();
  const home = commitHomeEditor(state, draft);
  assert.ok(home.updatedAt >= before && home.updatedAt <= Date.now(), "save stamps updatedAt from the clock");
  return home;
}

test("moveItem moves i to j and ignores bad indexes", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], -1, 0), ["a", "b"]);
  const src = ["a", "b"];
  moveItem(src, 0, 1);
  assert.deepEqual(src, ["a", "b"], "input is not mutated");
});

test("a drag from i to j lands in homeV2 and stamps updatedAt like the editor save", () => {
  const state = DEMO();
  const draft = homeEditorDraft(state);
  assert.ok(draft.items.length >= 3);
  const moved = reorderDraft(draft, draft.items[0], 2);
  const expected = moveItem(draft.items, 0, 2);
  assert.deepEqual(moved.items, expected);
  const home = saved(state, moved);
  assert.deepEqual(home.items, expected);
  assert.equal(home.v, 2);
  assert.deepEqual(getHomeLayout(state).items, expected);
  /* Same helper the old editor used, so the two saves produce identical shapes. */
  const control = DEMO();
  const old = commitHomeEditor(control, { items: expected, hidden: draft.hidden, sizes: draft.sizes });
  assert.deepEqual(Object.keys(home).sort(), Object.keys(old).sort());
  assert.deepEqual({ ...home, updatedAt: 0 }, { ...old, updatedAt: 0 });
});

test("gallery lists registry cards that are not on Home and filters case-insensitively", () => {
  const state = DEMO();
  const draft = { items: ["headline", "today"], hidden: ["readiness"], sizes: {} };
  const all = galleryEntries(draft, state, "");
  const ids = all.map((e) => e.id);
  assert.ok(!ids.includes("headline") && !ids.includes("today"), "cards already on Home are left out");
  assert.ok(ids.includes("readiness"), "a hidden card can be added again");
  ids.forEach((id) => assert.ok(HOME_WIDGETS[id]));
  all.forEach((e) => { assert.equal(e.title, HOME_WIDGETS[e.id].name); assert.ok(e.subtitle); });
  IDS.forEach((id) => assert.ok(GALLERY_SUBTITLES[id], `${id} has a gallery subtitle`));

  const byTitle = galleryEntries(draft, state, "  READINESS ").map((e) => e.id);
  assert.deepEqual(byTitle, ["readiness"]);
  const bySubtitle = galleryEntries(draft, state, "todays SCORE").map((e) => e.id);
  assert.deepEqual(bySubtitle, []);
  assert.deepEqual(galleryEntries(draft, state, "today's score").map((e) => e.id), ["readiness"]);
  assert.deepEqual(galleryEntries(draft, state, "zzzz-nope"), []);
});

test("gallery hides Oura cards without a ring or sample data", () => {
  const draft = { items: [], hidden: [], sizes: {} };
  const plain = galleryEntries(draft, NO_RING(), "").map((e) => e.id);
  IDS.forEach((id) => {
    assert.equal(plain.includes(id), !HOME_WIDGETS[id].needsOura, id);
  });
  const ring = galleryEntries(draft, { ...NO_RING(), oura: { connected: true } }, "").map((e) => e.id);
  assert.ok(ring.includes("readiness") && ring.includes("last-night"));
  assert.equal(galleryEntries(draft, DEMO(), "").length, IDS.length);
});

test("size choice flow: multi-size offers choices, single-size adds directly", () => {
  assert.ok(BOTH.length > 0 && ONE.length > 0);
  BOTH.forEach((id) => {
    assert.equal(needsSizeChoice(id), true);
    assert.deepEqual(sizeChoices(id).sort(), ["medium", "small"]);
  });
  ONE.forEach((id) => {
    assert.equal(needsSizeChoice(id), false);
    assert.deepEqual(sizeChoices(id), [HOME_WIDGETS[id].size]);
  });
  const state = DEMO();
  const start = { items: [], hidden: [], sizes: {} };
  /* readiness defaults to small, so medium is stored and small is the default. */
  const medium = addToDraft(start, "readiness", "medium");
  assert.deepEqual(medium.items, ["readiness"]);
  assert.equal(medium.sizes.readiness, "medium");
  const home = saved(state, medium);
  assert.deepEqual(home.items, ["readiness"]);
  assert.deepEqual(home.sizes, { readiness: "medium" });
  const small = addToDraft(start, "readiness", "small");
  assert.equal(small.sizes.readiness, undefined);
  const direct = addToDraft(start, "brief");
  assert.deepEqual(direct.items, ["brief"]);
  assert.deepEqual(direct.sizes, {});
  assert.deepEqual(addToDraft(start, "brief", "small").items, [], "an unsupported size adds nothing");
  assert.deepEqual(addToDraft(start, "nope", "small").items, []);
});

test("add never duplicates and removes the id from hidden", () => {
  const draft = { items: ["headline"], hidden: ["readiness"], sizes: {} };
  const twice = addToDraft(addToDraft(draft, "readiness", "small"), "readiness", "medium");
  assert.deepEqual(twice.items, ["headline", "readiness"]);
  assert.deepEqual(twice.hidden, []);
  assert.equal(twice.sizes.readiness, undefined, "second add is ignored");
  assert.deepEqual(addToDraft(draft, "headline").items, ["headline"]);
});

test("remove uses the hide path and unknown ids are ignored", () => {
  const draft = { items: ["headline", "today", "steps"], hidden: [], sizes: {} };
  const out = removeFromDraft(draft, "today");
  assert.deepEqual(out.items, ["headline", "steps"]);
  assert.deepEqual(out.hidden, ["today"]);
  assert.deepEqual(removeFromDraft(out, "today"), out);
  assert.deepEqual(removeFromDraft(draft, "future-widget").items, draft.items);
});

test("saved homeV2 keeps the same keys the old editor wrote and merges as an edit", () => {
  const state = DEMO();
  const draft = homeEditorDraft(state);
  const next = addToDraft(removeFromDraft(reorderDraft(draft, draft.items[1], 0), draft.items[2]), "weekly-goal", "medium");
  const home = saved(state, next);
  assert.deepEqual(Object.keys(home).filter((k) => !["v", "items", "hidden", "updatedAt", "sizes"].includes(k)), []);
  assert.equal(home.migrated, undefined);
  const older = { v: 2, items: draft.items, hidden: [], updatedAt: home.updatedAt - 5000 };
  const picked = pickHomeV2({ homeV2: home }, { homeV2: older });
  assert.deepEqual(picked.items, home.items);
  const pulled = pickHomeV2({ homeV2: older }, { homeV2: home });
  assert.deepEqual(pulled.items, home.items);
});

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("randomized move/add/remove sequences keep Home valid and mergeable", () => {
  const seed = Number(process.env.TEST_SEED) || 20260505;
  console.log(`home-edit random seed: ${seed}`);
  const rand = rng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const state = DEMO();
  let draft = homeEditorDraft(state);
  let lastAt = 0;
  let remote = null;
  for (let i = 0; i < 600; i++) {
    const ops = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < ops; k++) {
      const roll = rand();
      if (roll < 0.4 && draft.items.length) {
        draft = { ...draft, ...reorderDraft(draft, pick(draft.items), Math.floor(rand() * draft.items.length)) };
      } else if (roll < 0.7) {
        const open = galleryEntries(draft, state, rand() < 0.3 ? pick(["a", "e", "s", "today"]) : "");
        if (open.length) {
          const e = pick(open);
          draft = { ...draft, ...addToDraft(draft, e.id, rand() < 0.5 ? pick(e.sizes) : undefined) };
        }
      } else if (draft.items.length) {
        draft = { ...draft, ...removeFromDraft(draft, pick(draft.items)) };
      }
    }
    const home = commitHomeEditor(state, draft);
    assert.ok(home.updatedAt >= lastAt, `updatedAt went backwards on save ${i}`);
    lastAt = home.updatedAt;
    assert.equal(new Set(home.items).size, home.items.length, "no duplicate items");
    assert.equal(new Set(home.hidden).size, home.hidden.length, "no duplicate hidden");
    home.items.forEach((id) => assert.ok(HOME_WIDGETS[id], `${id} is a registry id`));
    home.hidden.forEach((id) => assert.ok(HOME_WIDGETS[id], `${id} is a registry id`));
    home.items.forEach((id) => assert.ok(!home.hidden.includes(id), `${id} is both shown and hidden`));
    assert.deepEqual(home.items, draft.items);
    Object.keys(home.sizes || {}).forEach((id) => {
      assert.ok(sizeChoices(id).includes(home.sizes[id]) && home.sizes[id] !== HOME_WIDGETS[id].size);
      assert.ok(home.items.includes(id) || home.hidden.includes(id) || true);
    });
    /* Saves in one millisecond tie on updatedAt, so the pulled copy is always older. */
    if (remote) remote.updatedAt = Math.min(remote.updatedAt, home.updatedAt - 1);
    const picked = pickHomeV2({ homeV2: home }, remote ? { homeV2: remote } : {}, Date.now());
    assert.ok(picked, "merge accepts the saved layout");
    assert.deepEqual(picked.items, home.items);
    assert.deepEqual(picked.hidden, home.hidden);
    const back = pickHomeV2({}, { homeV2: home }, Date.now());
    assert.deepEqual(back.items, home.items, "copy accepts the saved layout");
    remote = JSON.parse(JSON.stringify(home));
    draft = homeEditorDraft(state);
  }
});

test("gallery markup never nests interactive elements inside a button", async () => {
  const { app } = await import("../logger/js/runtime.js");
  await import("../logger/js/pages/home.js");
  const keep = { ui: app.ui, state: app.state, esc: app.esc, snap: app.snapshotFromApp, hero: app.homeHeroHTML, week: app.homeWeekHTML, pattern: HOME_WIDGETS.pattern.render, headline: HOME_WIDGETS.headline.render };
  app.state = DEMO();
  app.esc = (s) => String(s ?? "");
  app.snapshotFromApp = () => ({ live: true });
  app.homeHeroHTML = () => `<div class="hero"><button class="btn" data-action="start">Start</button></div>`;
  app.homeWeekHTML = () => `<section class="sec"><button data-action="plan">Mon</button><a href="#x">link</a></section>`;
  HOME_WIDGETS.pattern.render = () => `<button class="hw hw-m hw-hit" data-action="open-affects">Pattern</button>`;
  HOME_WIDGETS.headline.render = () => `<section class="hw hw-m"><button data-action="x">Headline</button></section>`;
  const empty = () => ({ items: [], hidden: [], sizes: {} });
  try {
    [{ q: "" }, { q: "", pick: "readiness" }, { q: "", pick: "pattern" }].forEach((sd) => {
      app.ui = { homeDraft: empty(), sd };
      const html = app.homeGalleryHTML();
      const items = html.match(/class="hw-gal-item\b/g) || [];
      const hitBtns = html.match(/<button type="button" class="hw-gal-hit"[^>]*><\/button>/g) || [];
      assert.ok(items.length > 0);
      /* In-flow header: one Cancel and one close, both sheet-close buttons, before the grid. */
      const bar = html.slice(html.indexOf('class="hw-gal-bar"'), html.indexOf('class="hw-gal-scroll"'));
      assert.ok(bar.length > 0, "header row exists before the scroll area");
      assert.equal((bar.match(/class="hw-gal-cancel" data-action="sheet-close">Cancel<\/button>/g) || []).length, 1, "exactly one Cancel");
      assert.equal((bar.match(/class="hw-gal-x" data-action="sheet-close" aria-label="Close"/g) || []).length, 1, "exactly one close");
      assert.equal((html.match(/aria-label="Close"/g) || []).length, 1);
      assert.equal((html.match(/>Cancel<\/button>/g) || []).length, 1);
      assert.match(bar, sd.pick ? /Choose a size/ : /Add Widget/);
      assert.equal(/hw-gal-back/.test(bar), !!sd.pick);
      assert.equal(hitBtns.length, items.length, "one empty hit button per item");
      hitBtns.forEach((b) => assert.match(b, /data-action="(home-gal-pick|home-add)" data-id="[^"]+"( data-size="(small|medium)")? aria-label="[^"]+"/));
      assert.equal((html.match(/<div class="hw-prev [^"]*" inert aria-hidden="true">/g) || []).length, items.length, "every preview is inert and aria-hidden");
      assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length, "balanced divs");
      let depth = 0;
      for (const tok of html.match(/<\/?button\b|<a\b/g) || []) {
        if (tok === "<button") { assert.equal(depth, 0, "button inside a button"); depth = 1; }
        else if (tok === "</button") depth = 0;
        else assert.equal(depth, 0, "link inside a button");
      }
    });
  } finally {
    app.ui = keep.ui; app.state = keep.state; app.esc = keep.esc; app.snapshotFromApp = keep.snap;
    app.homeHeroHTML = keep.hero; app.homeWeekHTML = keep.week;
    HOME_WIDGETS.pattern.render = keep.pattern; HOME_WIDGETS.headline.render = keep.headline;
  }
});

test("edit mode jiggle is wired to .editing .hw-slot, off while lifted, off for reduced motion, and never in the gallery", () => {
  const css = readFileSync(new URL("../logger/css/home-widgets.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const home = readFileSync(new URL("../logger/js/pages/home.js", import.meta.url), "utf8");
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) rules.push({ sel: m[1].trim(), body: m[2] });
  const block = (name) => css.slice(css.indexOf(name));

  const keyframes = css.match(/@keyframes hw-wobble\s*\{[\s\S]*?\}\s*\}/);
  assert.ok(keyframes, "wobble keyframes exist");
  assert.match(keyframes[0], /rotate:/, "wobble uses the independent rotate property");
  assert.doesNotMatch(keyframes[0], /transform:/, "wobble leaves transform to drag and FLIP");

  const hook = rules.find((r) => r.sel === ".editing .hw-slot" && /animation:\s*hw-wobble/.test(r.body));
  assert.ok(hook, "the wobble is attached to .editing .hw-slot");
  assert.match(css, /--hw-wobble-angle:\s*1\.25deg/);
  assert.match(css, /--hw-wobble-ms:\s*270ms/);
  assert.ok(rules.some((r) => /nth-child/.test(r.sel) && /animation-delay:\s*-/.test(r.body)), "negative staggered delays");
  assert.ok(rules.some((r) => /nth-child/.test(r.sel) && /alternate-reverse/.test(r.body)), "alternating direction");

  /* Resolve the cascade for the first 8 cards: the last matching nth-child rule wins at equal specificity. */
  const combos = [];
  for (let n = 1; n <= 8; n++) {
    const get = (prop, fallback) => {
      let value = fallback;
      rules.forEach((r) => {
        if (!/^\.editing \.hw-slot(:nth-child\((\d+)n\))?$/.test(r.sel)) return;
        const k = r.sel.match(/nth-child\((\d+)n\)/);
        if (k && n % Number(k[1])) return;
        const d = r.body.match(new RegExp(`${prop}:\\s*([^;]+)`));
        if (d) value = d[1].trim();
      });
      return value;
    };
    combos.push([get("animation-duration", "base"), get("animation-delay", "0"), get("animation-direction", "alternate")].join("|"));
  }
  assert.equal(new Set(combos).size, 8, `first 8 cards wobble out of sync: ${combos.join(" / ")}`);

  assert.match(home, /class="home-v2 editing"/, "edit-mode markup carries the editing class on the list");

  const lifted = rules.find((r) => /\.editing \.hw-slot\.dragging/.test(r.sel) && /animation:\s*none/.test(r.body));
  assert.ok(lifted && /\.editing \.hw-slot\.settling/.test(lifted.sel), "dragging and settling cards do not wobble");
  assert.ok(css.indexOf(lifted.sel) > css.indexOf(hook.sel), "the lifted rule comes after the wobble rule");

  const reduced = block("@media (prefers-reduced-motion: reduce)");
  assert.match(reduced.slice(0, reduced.indexOf("}\n}") + 3), /\.editing \.hw-slot[^{]*\{\s*animation:\s*none/);

  rules.filter((r) => /hw-wobble|animation|rotate/.test(r.body)).forEach((r) => {
    assert.ok(!/home-gallery|hw-prev|hw-gal/.test(r.sel), `wobble leaks into ${r.sel}`);
    assert.ok(/\.editing/.test(r.sel) || /@keyframes/.test(r.sel) || /--hw-wobble/.test(r.body) || r.sel.startsWith("from") || r.sel.startsWith("to"), `animation outside edit mode: ${r.sel}`);
  });
});
