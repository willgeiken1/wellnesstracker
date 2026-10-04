/* Skip an exercise for the current session only.

   The record lives on the session (`skipped`), which is already stored in
   localStorage and in the user_data JSON blob. Nothing here touches the
   saved routine. Parked sets stay off `entries`, so history, PRs, the muscle
   map, weekly volume, and averages cannot see them — including as zeros. */

export function skippedNames(session) {
  const out = new Set();
  const list = session && session.skipped;
  if (!Array.isArray(list)) return out;
  list.forEach((x) => { if (x && x.name) out.add(x.name); });
  return out;
}

/* Entries that count as work. A skipped exercise is absent even if a set row was left behind. */
export function countedEntries(session) {
  const skip = skippedNames(session);
  return ((session && session.entries) || []).filter((e) => {
    if (!e || !e.sets || !e.sets.length) return false;
    return !(e.exercise && skip.has(e.exercise));
  });
}

export const historyEntries = countedEntries;

export function withoutSkipped(list, session) {
  const skip = skippedNames(session);
  return (list || []).filter((e) => e && !skip.has(e.name));
}

export function normalizeSkipped(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  raw.forEach((x) => {
    if (!x || typeof x.name !== "string") return;
    const name = x.name.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    const rec = { name, muscles: Array.isArray(x.muscles) ? x.muscles.slice() : [] };
    if (Array.isArray(x.adv) && x.adv.length) rec.adv = x.adv.slice();
    if (typeof x.original === "string" && x.original) rec.original = x.original;
    if (x.extra) rec.extra = true;
    if (x.entry && typeof x.entry === "object" && Array.isArray(x.entry.sets) && x.entry.sets.length) rec.entry = x.entry;
    if (typeof x.at === "number") rec.at = x.at;
    out.push(rec);
  });
  return out;
}

/* If a skipped name is still in entries, park any logged sets and drop the row. */
export function reconcileSkipped(session) {
  if (!session) return session;
  const skipped = normalizeSkipped(session.skipped);
  if (!skipped.length) {
    delete session.skipped;
    return session;
  }
  const byName = new Map(skipped.map((x) => [x.name, x]));
  const entries = Array.isArray(session.entries) ? session.entries : [];
  session.entries = entries.filter((e) => {
    if (!e || !byName.has(e.exercise)) return true;
    const rec = byName.get(e.exercise);
    if (e.sets && e.sets.length && !rec.entry) rec.entry = e;
    return false;
  });
  session.skipped = skipped;
  return session;
}

/* Hide one exercise for this session. Logged sets are parked on the skip record, not deleted. */
export function skipForToday(session, exercise, now = Date.now()) {
  if (!session || !exercise || !exercise.name) return null;
  const name = exercise.name;
  const skipped = normalizeSkipped(session.skipped);
  const existing = skipped.find((x) => x.name === name);
  if (existing) {
    session.skipped = skipped;
    reconcileSkipped(session);
    return existing;
  }
  const entries = Array.isArray(session.entries) ? session.entries : [];
  const idx = entries.findIndex((e) => e && e.exercise === name);
  let entry = null;
  if (idx >= 0) {
    const found = entries[idx];
    if (found.sets && found.sets.length) entry = found;
    session.entries = entries.filter((_, i) => i !== idx);
  } else if (!Array.isArray(session.entries)) session.entries = [];
  const rec = {
    name,
    muscles: Array.isArray(exercise.muscles) ? exercise.muscles.slice() : (entry && entry.muscles ? entry.muscles.slice() : []),
    at: now,
  };
  if (Array.isArray(exercise.adv) && exercise.adv.length) rec.adv = exercise.adv.slice();
  else if (entry && Array.isArray(entry.adv) && entry.adv.length) rec.adv = entry.adv.slice();
  if (exercise.original) rec.original = exercise.original;
  if (exercise.extra) rec.extra = true;
  if (entry) rec.entry = entry;
  skipped.push(rec);
  session.skipped = skipped;
  session.mod = now;
  return rec;
}

/* A routine rename has to follow the exercise into parked sets, or the skip record
   keeps the old name and the exercise shows up again. */
export function renameExerciseData(session, from, to) {
  if (!session || !from || from === to) return;
  (session.entries || []).forEach((e) => { if (e && e.exercise === from) e.exercise = to; });
  (session.skipped || []).forEach((sk) => {
    if (!sk) return;
    if (sk.name === from) sk.name = to;
    if (sk.original === from) sk.original = to;
    if (sk.entry && sk.entry.exercise === from) sk.entry.exercise = to;
  });
  if (session.swaps && session.swaps[from]) {
    session.swaps[to] = session.swaps[from];
    delete session.swaps[from];
  }
}

/* Put a skipped exercise back into this session, including any sets that were parked. */
export function restoreSkipped(session, name, now = Date.now()) {
  if (!session || !name) return null;
  const skipped = normalizeSkipped(session.skipped);
  const idx = skipped.findIndex((x) => x.name === name);
  if (idx < 0) return null;
  const [rec] = skipped.splice(idx, 1);
  if (skipped.length) session.skipped = skipped;
  else delete session.skipped;
  if (rec.entry && rec.entry.sets && rec.entry.sets.length) {
    const entries = Array.isArray(session.entries) ? session.entries : [];
    if (!entries.some((e) => e && e.exercise === name)) entries.push(rec.entry);
    session.entries = entries;
  }
  session.mod = now;
  return rec;
}

export function setWorkVolume(x) {
  if (!x || x.tag === "warmup") return 0;
  if (x.uni) return [x.uni.l, x.uni.r].reduce((a, y) => a + (y && y.w != null ? y.w * y.r : 0), 0);
  return x.w != null ? x.w * x.r : 0;
}

export function workingVolume(session) {
  let n = 0;
  countedEntries(session).forEach((e) => { (e.sets || []).forEach((set) => { n += setWorkVolume(set); }); });
  return n;
}

/* Working-set bests only. A skipped exercise is not a zero and is not in the mean. */
export function bestEffortAverage(session) {
  const vals = [];
  countedEntries(session).forEach((e) => {
    let best = null;
    (e.sets || []).forEach((x) => {
      if (!x || x.tag === "warmup" || x.w == null || !(Number(x.r) > 0)) return;
      const e1 = Number(x.w) * (1 + Number(x.r) / 30);
      if (!Number.isFinite(e1)) return;
      if (best == null || e1 > best) best = e1;
    });
    if (best != null) vals.push(best);
  });
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function muscleSetMap(sessions) {
  const m = new Map();
  (sessions || []).forEach((s) => {
    countedEntries(s).forEach((e) => {
      const n = (e.sets || []).filter((x) => x && x.tag !== "warmup").length;
      if (!n) return;
      (e.muscles || []).forEach((k) => m.set(k, (m.get(k) || 0) + n));
    });
  });
  return m;
}
