import { app } from "../runtime.js";

/* Muscle maps, exercise bank, and page headers. */
/* ================= Muscles: basic + advanced, diagrams, exercise bank ================= */
const ADV = {};
app.ADV = ADV;

 app.ASSETS.advGroups.forEach(([g, items]) => items.forEach(([k, n]) => { app.ADV[k] = n; }));

const ADV_GROUP = {};
app.ADV_GROUP = ADV_GROUP;

 app.ASSETS.advGroups.forEach(([g, items]) => items.forEach(([k]) => { app.ADV_GROUP[k] = g; }));

const uniq = (a) => [...new Set(a)];
app.uniq = uniq;

const muscleMode = () => (app.state.muscleMode === "advanced" ? "advanced" : "basic");
app.muscleMode = muscleMode;

const profileSex = () => (app.state.profile && app.state.profile.sex === "female" ? "female" : "male");
app.profileSex = profileSex;

const BANK_BY_NAME = new Map(app.ASSETS.bank.map((b) => [b.n.toLowerCase(), b]));
app.BANK_BY_NAME = BANK_BY_NAME;

function advOf(e) {
  if (e && e.adv && e.adv.length) return e.adv;
  const b = e && app.BANK_BY_NAME.get(String(e.name || e.exercise || "").toLowerCase());
  if (b) return b.a;
  return app.uniq(((e && e.muscles) || []).flatMap((m) => app.ASSETS.basicToAdv[m] || []));
}
app.advOf = advOf;

function basicOf(advList) { return app.uniq(advList.map((a) => app.ASSETS.advToBasic[a]).filter(Boolean)); }
app.basicOf = basicOf;

function musclesLabel(e, max) {
  const names = app.muscleMode() === "advanced" ? app.advOf(e).map((k) => app.ADV[k]) : (e.muscles || []).map((m) => app.MUSCLES[m]);
  const list = names.filter(Boolean);
  if (!max || list.length <= max) return list.join(", ");
  return list.slice(0, max).join(", ") + ` +${list.length - max}`;
}
app.musclesLabel = musclesLabel;

function advMusclesBetween(from, to) {
  const m = new Map();
  app.state.sessions.filter((s) => s.date >= from && s.date <= to).forEach((s) => s.entries.forEach((e) => {
    const n = e.sets.filter((x) => x.tag !== "warmup").length;
    if (n) app.advOf(e).forEach((k) => m.set(k, (m.get(k) || 0) + n));
  }));
  return m;
}
app.advMusclesBetween = advMusclesBetween;

/* ---------- diagram renderers ---------- */
let svgSeq = 0;
app.svgSeq = svgSeq;

function hatchDefs(uid) {
  return `<pattern id="${uid}hl" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" class="hp-bg"/><line x1="0" y1="0" x2="0" y2="4" class="hp-lo"/></pattern>
    <pattern id="${uid}hd" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" class="hp-bg"/><line x1="0" y1="0" x2="0" y2="4" class="hp-hi"/></pattern>`;
}
app.hatchDefs = hatchDefs;

function advBodySVG(sex, side, sets) {
  const F = app.ASSETS.advBody[sex][side], uid = "ab" + (++app.svgSeq);
  const lvl = (m) => { const n = sets.get(m) || 0; return n >= 6 ? " hit" : n > 0 ? " hit-lo" : ""; };
  const half = F.els.map(([t, m, d, ci]) =>
    t === "b" ? `<path class="base" d="${d}"/>`
    : t === "s" ? `<path class="skin" d="${d}"/>`
    : t === "m" ? `<path class="mus${lvl(m)}" data-m="${m}" d="${d}"/>`
    : t === "c" ? `<path class="mus${lvl(m)}" data-m="${m}" clip-path="url(#${uid}c${ci})" d="${d}"/>`
    : t === "o" ? `<path class="ol" d="${d}"/>`
    : `<path class="deep${lvl(m)}" data-m="${m}" d="${d}"/>`).join("");
  const mid = side === "front" ? `<path class="line" d="M100,119 L100,216"/>` : `<path class="line" d="M100,50 L100,230"/>`;
  return `<svg viewBox="2 6 196 404" class="body" role="img" aria-label="${side === "front" ? "Front" : "Back"} of body, detailed muscles">
    <defs>${F.clips.map((d, i) => `<clipPath id="${uid}c${i}"><path d="${d}"/></clipPath>`).join("")}${app.hatchDefs(uid)}</defs>
    <style>#${uid} .deep.hit-lo{fill:url(#${uid}hl)} #${uid} .deep.hit{fill:url(#${uid}hd)}</style>
    <g id="${uid}"><g>${half}</g><g transform="translate(200,0) scale(-1,1)">${half}</g>
    <path class="detail" d="${F.detail}"/><path class="detail" transform="translate(200,0) scale(-1,1)" d="${F.detail}"/>
    ${mid}<path class="skin" d="${F.head}"/></g></svg>`;
}
app.advBodySVG = advBodySVG;

function basicBodySVG(sex, side, sets) {
  if (sex !== "female") return app.bodySVG(side, sets);
  const F = app.ASSETS.basicFemale[side];
  const lvl = (m) => { const n = sets.get(m) || 0; return n >= 6 ? " hit" : n > 0 ? " hit-lo" : ""; };
  const half = F.els.map(([m, d]) => m === "base" ? `<path class="base" d="${d}"/>` : m ? `<path class="mus${lvl(m)}" data-m="${m}" d="${d}"/>` : `<path class="skin" d="${d}"/>`).join("");
  const mid = side === "front" ? `<path class="line" d="M100,119 L100,216"/>` : `<path class="line" d="M100,50 L100,230"/>`;
  return `<svg viewBox="2 6 196 404" class="body" role="img" aria-label="${side === "front" ? "Front" : "Back"} of body">
    <g>${half}</g><g transform="translate(200,0) scale(-1,1)">${half}</g>
    <path class="detail" d="${F.detail}"/><path class="detail" transform="translate(200,0) scale(-1,1)" d="${F.detail}"/>
    ${mid}<path class="skin" d="${F.head}"/></svg>`;
}
app.basicBodySVG = basicBodySVG;

function muscleMapHTML(kind) {
  const t = app.today(), mon = app.mondayOf(t), sun = app.addDays(mon, 6), sex = app.profileSex();
  const adv = kind === "advanced";
  const hit = adv ? app.advMusclesBetween(mon, sun) : app.musclesBetween(mon, sun);
  const names = adv ? app.ADV : app.MUSCLES;
  const keys = Object.keys(names).sort((a, b) => (hit.get(b) || 0) - (hit.get(a) || 0));
  const draw = (side) => adv ? app.advBodySVG(sex, side, hit) : app.basicBodySVG(sex, side, hit);
  const row = (k) => `<li class="${(hit.get(k) || 0) >= 6 ? "hit" : hit.get(k) ? "hit-lo" : ""}"><span>${names[k]}</span><b>${hit.get(k) ? app.pl(hit.get(k), "set") : "–"}</b></li>`;
  const trained = keys.filter((k) => hit.get(k)), rest = keys.filter((k) => !hit.get(k));
  return `<div class="sec-h"><h3>Muscles this week</h3><span class="sec-sub">${trained.length} of ${keys.length} trained</span></div>
    <div class="bodies">
      <div class="body-wrap">${draw("front")}<div class="body-cap">Front</div></div>
      <div class="body-wrap">${draw("back")}<div class="body-cap">Back</div></div>
    </div>
    <div class="legend"><span><i></i>Not yet</span><span><i class="lo"></i>1–5 sets</span><span><i class="hi"></i>6+ sets</span>${adv ? `<span><i class="deep-key"></i>Deep muscle</span>` : ""}</div>
    ${adv ? `${trained.length ? `<ul class="mgrid">${trained.map(row).join("")}</ul>` : ""}
      <details class="more-m"><summary>${trained.length ? `Not trained yet (${rest.length})` : `All ${rest.length} muscles`}</summary><ul class="mgrid">${rest.map(row).join("")}</ul></details>`
    : `<ul class="mgrid">${keys.map(row).join("")}</ul>`}`;
}
app.muscleMapHTML = muscleMapHTML;

/* ---------- header: profile picture on every tab ---------- */
function avatarHTML() {
  const p = app.state.profile;
  const inner = p && p.photo ? `<img src="${p.photo}" alt="">`
    : app.firstName() ? app.esc(p.name.trim().split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase())
    : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h8M16 7h4M4 12h2M10 12h10M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/></svg>`;
  return `<button class="avatar" data-action="tab" data-tab="settings" aria-label="Settings">${inner}</button>`;
}
app.avatarHTML = avatarHTML;

function pageHead(title, sub, opts = {}) {
  return `<div class="page-head ph2"><div class="ph-text"><h1 class="page-title">${title}</h1>${sub ? `<div class="page-sub">${sub}</div>` : ""}</div>
    <div class="head-r">${opts.left || ""}<div class="head-col">${app.avatarHTML()}${opts.below || ""}</div></div></div>`;
}
app.pageHead = pageHead;

const PLUS_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
app.PLUS_SVG = PLUS_SVG;

function squarePhoto(file, size) {
  return app.fileToBitmap(file).then((img) => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = Math.min(w, h);
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  });
}
app.squarePhoto = squarePhoto;

/* ---------- exercise bank picker ---------- */
function customExercises() {
  const bankNames = new Set(app.ASSETS.bank.map((e) => e.n.toLowerCase())), out = new Map();
  app.state.workouts.forEach((w) => w.exercises.forEach((e) => { if (!bankNames.has(e.name.toLowerCase())) out.set(e.name, e); }));
  app.state.sessions.forEach((s) => s.entries.forEach((e) => { if (!bankNames.has(e.exercise.toLowerCase()) && !out.has(e.exercise)) out.set(e.exercise, { name: e.exercise, muscles: e.muscles, adv: e.adv }); }));
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
app.customExercises = customExercises;

function exObjFrom(name) {
  const b = app.BANK_BY_NAME.get(String(name).toLowerCase());
  if (b) return { name: b.n, muscles: app.basicOf(b.a), adv: [...b.a] };
  const c = app.customExercises().find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  return c ? { name: c.name, muscles: [...(c.muscles || [])], ...(c.adv ? { adv: [...c.adv] } : {}) } : null;
}
app.exObjFrom = exObjFrom;

/* Equipment words are how an exercise is loaded, not what it is. Search ignores them. */
const EQUIPMENT_WORDS = new Set([
  "barbell", "dumbbell", "dumbbells", "cable", "cables", "machine", "machines", "smith",
  "kettlebell", "kettlebells", "ez", "band", "bands", "plate", "plates", "landmine",
  "resistance", "selectorized"
]);
app.EQUIPMENT_WORDS = EQUIPMENT_WORDS;

const BANK_FILTER_MS = 250;
app.BANK_FILTER_MS = BANK_FILTER_MS;

function bankTokens(s) {
  return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !EQUIPMENT_WORDS.has(w));
}
app.bankTokens = bankTokens;

/* Adjacent swaps count as one edit, so "bensh" and "sqaut" are one step away. */
function damerau(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let rowBest = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, dp[i - 2][j - 2] + 1);
      dp[i][j] = v;
      if (v < rowBest) rowBest = v;
    }
    if (rowBest > 2) return 3;
  }
  return dp[m][n];
}
app.damerau = damerau;

function tokenHit(q, word) {
  if (!q || !word) return false;
  if (word.includes(q)) return true;
  if (q.length >= 4 && word.length >= 4 && q.includes(word)) return true;
  if (q.length < 4) return false;
  const limit = q.length <= 5 ? 1 : 2;
  if (Math.abs(q.length - word.length) > limit) return false;
  return damerau(q, word) <= limit;
}
app.tokenHit = tokenHit;

/* Names and muscle groups only. A query that is just "barbell" or "machine" matches nothing. */
function bankHit(query, row) {
  const qTokens = bankTokens(query);
  if (!qTokens.length) return false;
  const nameTokens = bankTokens(row && row.name);
  const muscleTokens = bankTokens([row && row.group, ...((row && row.muscles) || []), ...((row && row.adv) || [])].join(" "));
  const words = nameTokens.concat(muscleTokens);
  const blobs = [nameTokens.join(""), muscleTokens.join("")].filter(Boolean);
  return qTokens.every((qt) => words.some((w) => tokenHit(qt, w)) || blobs.some((b) => tokenHit(qt, b)));
}
app.bankHit = bankHit;

/* One list for every place you choose an exercise: search, "similar muscles", your own, then the bank by group. */
function bankListHTML(o) {
  const q = (o.q || "").trim().toLowerCase(), have = o.have || new Set();
  const row = (name, e, src) => {
    const on = have.has(name.toLowerCase());
    return `<button class="pk-row${on ? " on" : ""}" data-action="${o.action}" data-src="${src}" data-name="${app.esc(name)}" aria-pressed="${on}">
      <span class="pk-t"><b>${app.esc(name)}</b><span>${app.esc(app.musclesLabel(e, 3))}</span></span><span class="pk-ic" aria-hidden="true">${on ? "✓" : "+"}</span></button>`;
  };
  const bankE = (b) => ({ name: b.n, group: b.g, adv: b.a, muscles: app.basicOf(b.a) });
  const custom = app.customExercises().filter((e) => !(o.exclude || new Set()).has(e.name.toLowerCase()));
  const bank = app.ASSETS.bank.filter((b) => !(o.exclude || new Set()).has(b.n.toLowerCase()));
  if (q) {
    const hits = [...custom.map((e) => [e.name, e, "custom"]), ...bank.map((b) => [b.n, bankE(b), "bank"])]
      .filter(([, e]) => bankHit(o.q, e))
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
    if (!hits.length) {
      const typed = String(o.q || "").trim();
      return `<div class="pk-empty"><p>No matches</p><button type="button" class="btn block" data-action="bank-create" data-name="${app.esc(typed)}">Create ${app.esc(typed)}</button></div>`;
    }
    return `<div class="pk-list" data-filter="1">${hits.map(([n, e, src]) => row(n, e, src)).join("")}</div>`;
  }
  let html = "";
  if (o.similar && o.similar.length) {
    const want = new Set(o.similar);
    const scored = [...custom.map((e) => [e.name, e, "custom"]), ...bank.map((b) => [b.n, bankE(b), "bank"])]
      .map(([n, e, src]) => [n, e, src, app.advOf(e).filter((k) => want.has(k)).length / Math.max(1, Math.max(app.advOf(e).length, want.size))])
      .filter((x) => x[3] > 0).sort((a, b) => b[3] - a[3] || a[0].localeCompare(b[0])).slice(0, 20);
    if (scored.length) html += `<details class="pk-g" open><summary>Works similar muscles <span>${scored.length}</span></summary><div class="pk-list">${scored.map(([n, e, src]) => row(n, e, src)).join("")}</div></details>`;
  }
  if (custom.length) html += `<details class="pk-g"${o.similar ? "" : " open"}><summary data-g="__mine">Your exercises <span>${custom.length}</span></summary><div class="pk-list">${custom.map((e) => row(e.name, e, "custom")).join("")}</div></details>`;
  const groups = {};
  bank.forEach((b) => (groups[b.g] = groups[b.g] || []).push(b));
  html += Object.keys(groups).sort().map((g) => `<details class="pk-g"${o.open === g ? " open" : ""}><summary data-g="${g}">${g} <span>${groups[g].length}</span></summary>
    <div class="pk-list">${groups[g].sort((a, b) => a.n.localeCompare(b.n)).map((b) => row(b.n, bankE(b), "bank")).join("")}</div></details>`).join("");
  return html;
}
app.bankListHTML = bankListHTML;

/* The field stays in normal flow and scrolls with the list. Typing only rewrites #pk-body. */
function bankSearchHTML(opts) {
  const q = (app.ui.sd && app.ui.sd.q) || "";
  return `<input class="text-in" id="pick-q" type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Search ${app.ASSETS.bank.length} exercises" aria-label="Search exercises" value="${app.esc(q)}">
    <div id="pk-body">${bankListHTML({ ...opts, q })}</div>`;
}
app.bankSearchHTML = bankSearchHTML;

function bankSheetOptions() {
  const sd = app.ui.sd || {};
  const q = sd.q, open = sd.open;
  if (app.ui.sheet === "picker") {
    const w = app.workoutById(app.ui.detail);
    if (!w) return null;
    return { q, open, have: new Set(w.exercises.map((e) => e.name.toLowerCase())), action: "pick-ex" };
  }
  if (app.ui.sheet === "live-add") {
    const s = app.activeSession();
    if (!s) return null;
    return { q, open, have: new Set(app.liveExercises(s).map((e) => e.name.toLowerCase())), action: "live-add" };
  }
  if (app.ui.sheet === "swap") {
    const s = app.activeSession();
    if (!s) return null;
    const list = app.liveExercises(s);
    const cur = list[sd.i];
    if (!cur) return null;
    return { q, open, action: "swap-pick", similar: app.advOf(cur), exclude: new Set(list.map((e) => e.name.toLowerCase())) };
  }
  return null;
}
app.bankSheetOptions = bankSheetOptions;

function refreshBankList() {
  if (typeof document === "undefined" || !document.getElementById) return;
  const body = document.getElementById("pk-body");
  if (!body) return;
  const opts = bankSheetOptions();
  if (!opts) return;
  const html = bankListHTML(opts);
  if (body.innerHTML === html) return;
  body.innerHTML = html;
}
app.refreshBankList = refreshBankList;

function noteBankQuery(value) {
  if (!app.ui.sd) app.ui.sd = {};
  app.ui.sd.q = value;
  clearTimeout(app._bankFilter);
  app._bankFilter = setTimeout(() => {
    app._bankFilter = null;
    refreshBankList();
  }, app.BANK_FILTER_MS || BANK_FILTER_MS);
}
app.noteBankQuery = noteBankQuery;

function pickerSheetHTML() {
  const w = app.workoutById(app.ui.detail); if (!w) return "";
  const have = new Set(w.exercises.map((e) => e.name.toLowerCase()));
  return `<h3>Add exercises</h3><p class="sub" style="margin:-6px 0 12px">to ${app.esc(w.name)} · tap to add, tap again to remove</p>
    ${bankSearchHTML({ have, action: "pick-ex", open: app.ui.sd.open })}
    <button class="link-btn" data-action="edit-ex" data-i="-1" style="display:block;margin:12px auto 4px">Create a custom exercise</button>
    <button class="btn primary block" data-action="sheet-close" style="margin-top:8px">Done</button>`;
}
app.pickerSheetHTML = pickerSheetHTML;

function liveAddSheetHTML() {
  const s = app.activeSession(); if (!s) return "";
  const w = app.workoutById(s.workoutId);
  const have = new Set(app.liveExercises(s).map((e) => e.name.toLowerCase()));
  const routineBox = w ? `<label class="swap-keep"><input type="checkbox" id="add-routine" ${app.ui.sd.routine ? "checked" : ""}> Also add it to my ${app.esc(w.name)} routine</label>` : "";
  return `<h3>Add to today's workout</h3>
    ${routineBox}
    ${bankSearchHTML({ have, action: "live-add", open: app.ui.sd.open })}
    <div class="add-row"><input id="live-new" placeholder="Or type a new exercise" autocomplete="off"><button data-action="live-add-new">Add</button></div>
    <button class="btn primary block" data-action="sheet-close" style="margin-top:12px">Done</button>`;
}
app.liveAddSheetHTML = liveAddSheetHTML;

function liveAdd(name) {
  const s = app.activeSession(); if (!s || !name) return;
  const w = app.workoutById(s.workoutId), list = app.liveExercises(s);
  const hit = list.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (hit) {
    // tapping a ✓ removes it again, if it was added today and nothing is logged yet
    const extra = (s.extra || []).findIndex((x) => x.name === hit.name);
    if (extra < 0) { app.toast(`${hit.name} is already in this workout.`); return; }
    if (app.setsFor(s, hit.name).length) { app.toast(`${hit.name} has sets logged, so it stays.`); return; }
    const [removed] = s.extra.splice(extra, 1); s.mod = Date.now(); app.save(); app.keepSheetScroll(app.renderSheet); app.renderWorkout();
    app.toast(`Removed ${hit.name}.`, () => { s.extra.splice(extra, 0, removed); app.save(); app.renderWorkout(); if (app.ui.sheet === "live-add") app.renderSheet(); });
    return;
  }
  const before = list.length;
  const ex = app.exObjFrom(name) || { name, muscles: [] };
  s.removed = (s.removed || []).filter((n) => n !== ex.name);
  if (Array.isArray(s.order) && !s.order.includes(ex.name)) s.order = [...s.order, ex.name];
  if (app.ui.sd.routine && w) { w.exercises.push(ex); app.toast(`${ex.name} added to today and your ${w.name} routine.`); }
  else { s.extra = [...(s.extra || []), ex]; app.toast(`${ex.name} added to today's workout.`); }
  if (before === 0) {
    const idx = app.liveExercises(s).findIndex((e) => e.name === ex.name);
    if (idx >= 0) app.ui.open = idx;
  }
  s.mod = Date.now(); app.save(); app.keepSheetScroll(app.renderSheet); app.renderWorkout();
}
app.liveAdd = liveAdd;

function keepSheetScroll(fn) {
  const c = app.$(".sheet-card"), top = c ? c.scrollTop : 0; fn();
  const c2 = app.$(".sheet-card"); if (c2) c2.scrollTop = top;
}
app.keepSheetScroll = keepSheetScroll;

function pickExercise(name, src) {
  const w = app.workoutById(app.ui.detail); if (!w) return;
  const idx = w.exercises.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    const [removed] = w.exercises.splice(idx, 1);
    app.save(); app.keepSheetScroll(app.renderSheet); app.render();
    app.toast(`Removed ${name}.`, () => { w.exercises.splice(idx, 0, removed); app.save(); app.render(); if (app.ui.sheet === "picker") app.renderSheet(); });
    return;
  }
  let e;
  if (src === "bank") {
    const b = app.ASSETS.bank.find((x) => x.n === name);
    if (!b) return;
    e = { name: b.n, muscles: app.basicOf(b.a), adv: [...b.a] };
  } else if (src === "create") {
    e = app.exObjFrom(name) || { name, muscles: [] };
  } else {
    const c = app.customExercises().find((x) => x.name === name);
    e = c ? { name: c.name, muscles: [...(c.muscles || [])], ...(c.adv ? { adv: [...c.adv] } : {}) } : (app.exObjFrom(name) || { name, muscles: [] });
  }
  w.exercises.push(e);
  app.save(); app.keepSheetScroll(app.renderSheet); app.render();
}
app.pickExercise = pickExercise;
