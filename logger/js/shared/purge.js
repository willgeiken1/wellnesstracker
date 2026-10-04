/* Pure helpers for privacy: date-range wipes, CSV, and an uncompressed zip.
   No DOM. The edge function supabase/functions/_shared/strip.ts mirrors stripRange. */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validDay(s) {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

export function inRange(day, from, to) {
  return validDay(day) && validDay(from) && validDay(to) && day >= from && day <= to;
}

function timeMs(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > 0) return t;
  }
  return null;
}

const ITEM_KEYS = ["loggedAt", "updatedAt", "createdAt", "at", "mod"];
const SESSION_KEYS = ["mod", "loggedAt", "updatedAt", "createdAt", "startedAt", "finishedAt"];

function latestTime(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  let best = null;
  for (const k of keys) {
    const t = timeMs(obj[k]);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

function sessionTime(s) {
  let best = latestTime(s, SESSION_KEYS);
  for (const e of (s && s.entries) || []) {
    for (const x of (e && e.sets) || []) {
      const t = timeMs(x && x.at);
      if (t != null && (best == null || t > best)) best = t;
    }
  }
  return best;
}

/* A purge with no cutoff still clears the whole range. Otherwise drop a log
   with no timestamp, a timestamp more than a minute ahead, or a timestamp at
   or before the delete. A fast clock's stamp counts as before the cutoff. */
function dropBefore(stamp, before, now = Date.now()) {
  if (before == null) return true;
  return stamp == null || stamp > now + CLOCK_SKEW_MS || stamp <= before;
}

const CLOCK_SKEW_MS = 60_000;

/* A stamp more than a minute ahead is not a real delete time. Drop it.
   Anything inside that window, including a clock a minute fast, is kept. */
function clampStamp(t, now) {
  if (!(t > 0)) return null;
  if (t > now + CLOCK_SKEW_MS) return null;
  return t;
}

/* The cutoff to store and apply. The server uses this same instant: a stamp
   more than a minute ahead becomes just before now, never now plus a minute.
   Neutralising an unknown future delete time removes range logs made before a
   device first sees the purge, and keeps logs made after. Removing those
   earlier logs is the privacy-safe direction. A real earlier stamp still wins. */
function neutralCutoff(p, now) {
  if (!p) return null;
  const deleted = timeMs(p.deletedAt);
  const at = timeMs(p.at);
  const usable = Math.max(clampStamp(deleted, now) || 0, clampStamp(at, now) || 0);
  if (usable) return usable;
  const raw = Math.max(deleted || 0, at || 0);
  if (raw > now + CLOCK_SKEW_MS) return now > 0 ? now - 1 : now;
  return null;
}

export function purgeCutoff(p, now = Date.now()) {
  if (!p) return null;
  const deleted = clampStamp(timeMs(p.deletedAt), now);
  if (p.deletedAt != null && deleted != null) return deleted;
  const at = clampStamp(timeMs(p.at), now);
  if (at != null) return at;
  return neutralCutoff(p, now);
}

function aheadOf(t, now) {
  return t > now + CLOCK_SKEW_MS;
}

function neutralAt(now) {
  return now > 0 ? now - 1 : now;
}

/* These four fields were a clock-skew guess. They are not read, and reading a
   profile drops them so a later sync stops storing them. */
const CLOCK_FIELDS = ["clocks", "clockHint", "skewApplied", "skewKnown"];

export function stripProfileClockFields(profile) {
  if (!profile || typeof profile !== "object") return false;
  let changed = false;
  for (const k of CLOCK_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profile, k)) {
      delete profile[k];
      changed = true;
    }
  }
  return changed;
}

/* Writes use this phone's clock. Nothing is inferred from other phones. */
export function localStamp(_profile, now = Date.now()) {
  return now;
}

function latestWeighAt(profile, d) {
  let best = null;
  for (const w of (profile && profile.weighIns) || []) {
    const t = w && w.date === d ? timeMs(w.at) : null;
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

/* entryAt - 1 sits beside a new weigh-in so a legacy date-only wDel cannot hide
   it. It is not a delete, and must not be stored as a raw future stamp. */
function readdMarkerStamp(profile, d, stamp) {
  if (stamp == null) return false;
  const at = latestWeighAt(profile, d);
  return at != null && stamp === at - 1;
}

/* A future delete stamp is neutralised once, against this phone's clock only.
   wDelAtRaw[d] is that raw value, so the same stamp arriving again keeps the
   stored wDelAt[d]. A different, newer raw value is a second delete.
   A stamp that is still ahead of local now is a new raw even when an older
   raw is sitting beside it (an older app writes the new delete and leaves the
   previous raw in place). A stored cutoff that is already below its raw is
   left alone, including when a slow clock still sees that cutoff as ahead. */
function observeTomb(profile, d, now) {
  if (!profile) return null;
  const stamp = timeMs(profile.wDelAt && profile.wDelAt[d]);
  const raw = timeMs(profile.wDelAtRaw && profile.wDelAtRaw[d]);
  if (stamp != null && readdMarkerStamp(profile, d, stamp)) {
    if (aheadOf(stamp, now)) return null;
    return { stamp, raw: null, fresh: false };
  }
  if (stamp != null && aheadOf(stamp, now)) {
    if (raw != null && stamp < raw) return { stamp, raw, fresh: false };
    return { stamp: neutralAt(now), raw: stamp, fresh: true };
  }
  if (raw != null && stamp != null) return { stamp, raw, fresh: false };
  if (stamp != null) return { stamp, raw: null, fresh: false };
  if (raw != null && aheadOf(raw, now)) return { stamp: neutralAt(now), raw, fresh: true };
  return null;
}

function pickTomb(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.raw != null && a.raw === b.raw) {
    if (a.fresh && !b.fresh) return b;
    if (b.fresh && !a.fresh) return a;
    /* Two first looks at the same stamp: the later clock covers more
       pre-delete logs. A later fresh look does not move a stored one. */
    return a.stamp >= b.stamp ? a : b;
  }
  if (a.raw != null && b.raw != null) return a.raw > b.raw ? a : b;
  if (a.raw == null && b.raw == null) return a.stamp >= b.stamp ? a : b;
  const rawSide = a.raw != null ? a : b;
  const plain = rawSide === a ? b : a;
  if (plain.stamp === rawSide.raw) return rawSide;
  /* A plain delete newer than the raw raises the cutoff. The raw stays so that
     same future stamp is not neutralised again. A plain stamp between the
     frozen cutoff and the raw is an older future value, not a new delete. */
  if (plain.stamp > rawSide.raw) return { stamp: plain.stamp, raw: rawSide.raw, fresh: false };
  return rawSide;
}

function readdMarker(profile, d, obs) {
  if (!obs || obs.raw != null) return false;
  return readdMarkerStamp(profile, d, obs.stamp);
}

function mergeTombs(local, remote, now) {
  const dates = new Set([
    ...Object.keys((local && local.wDelAt) || {}),
    ...Object.keys((local && local.wDelAtRaw) || {}),
    ...Object.keys((remote && remote.wDelAt) || {}),
    ...Object.keys((remote && remote.wDelAtRaw) || {}),
  ]);
  const wDelAt = {};
  const wDelAtRaw = {};
  for (const d of [...dates].sort()) {
    let a = observeTomb(local, d, now);
    let b = observeTomb(remote, d, now);
    if (readdMarker(local, d, a) && b && b.raw != null) a = null;
    if (readdMarker(remote, d, b) && a && a.raw != null) b = null;
    const picked = pickTomb(a, b);
    if (!picked) continue;
    wDelAt[d] = picked.stamp;
    if (picked.raw != null) wDelAtRaw[d] = picked.raw;
  }
  return { wDelAt, wDelAtRaw };
}

/* Latest purge cutoff that covers this date, or 0 when none does. */
function coveringCutoff(purges, date, now) {
  let cut = 0;
  for (const p of purges || []) {
    const c = purgeCutoff(p, now);
    if (c != null && inRange(date, p.from, p.to) && c > cut) cut = c;
  }
  return cut;
}

/* A weigh-in outlives a tombstone only when its own log time is after both
   the manual delete (wDelAt) and any purge covering that date.
   A missing wDelAt does not raise the bar. A missing at never wins.
   Dates that are only in wDel, with no timestamp, still hide the weigh-in
   unless this returns true. */
export function weighBeatsTombstone(purges, x, wDelAt, now = Date.now(), wDelAtRaw = null) {
  const t = timeMs(x && x.at);
  if (t == null || !x || !x.date) return false;
  const tomb = timeMs(wDelAt && wDelAt[x.date]) || 0;
  const raw = timeMs(wDelAtRaw && wDelAtRaw[x.date]) || 0;
  const cut = coveringCutoff(purges, x.date, now);
  /* A stamp ahead of this clock is not a real log time. It loses, unless it is
     later than the raw future delete and no purge covers the date. The raw
     escape must not skip a range delete. */
  if (aheadOf(t, now) && (cut || !(raw && t > raw))) return false;
  if (!tomb && !cut) return false;
  return t > Math.max(tomb, cut);
}

/* True when this weigh-in was logged after a purge that covers its date. */
export function weighAfterPurge(purges, x) {
  return weighBeatsTombstone(purges, x, null);
}

/* Union of two profiles' weigh-ins. A manual delete is wDel plus wDelAt[date].
   The weigh-in wins only when x.at is later than both that stamp and the purge. */
export function mergeWeighIns(localProfile, remoteProfile, purges, now = Date.now()) {
  const lp = localProfile && typeof localProfile === "object" ? { ...localProfile } : {};
  const rp = remoteProfile && typeof remoteProfile === "object" ? { ...remoteProfile } : {};
  stripProfileClockFields(lp);
  stripProfileClockFields(rp);
  const wDel = new Set([...(lp.wDel || []), ...(rp.wDel || [])]);
  const tombs = mergeTombs(lp, rp, now);
  const wDelAt = tombs.wDelAt;
  const wDelAtRaw = tombs.wDelAtRaw;
  const byDate = new Map();
  const newerLocal = (lp.updatedAt || 0) >= (rp.updatedAt || 0);
  const lists = [rp.weighIns || [], lp.weighIns || []];
  const profiles = [lp, rp];
  /* A phone that saved this stamp has updatedAt at or after it, so the stamp
     is a real log time on that phone. Both sides of the merge can see that,
     and neither side's clock is used to raise a delete cutoff. */
  const acceptedStamp = (x) => {
    const t = timeMs(x && x.at);
    if (t == null || !x || !x.date) return false;
    return profiles.some((p) => {
      const upd = timeMs(p && p.updatedAt) || 0;
      if (t > upd + CLOCK_SKEW_MS) return false;
      return (p.weighIns || []).some((w) => w && w.date === x.date && timeMs(w.at) === t);
    });
  };
  const wins = (x) => {
    const cut = coveringCutoff(purges, x && x.date, now);
    /* A range delete still uses this phone's clock. A vouched stamp must not
       skip that cutoff. */
    if (cut || !acceptedStamp(x)) return weighBeatsTombstone(purges, x, wDelAt, now, wDelAtRaw);
    const t = timeMs(x.at);
    const tomb = timeMs(wDelAt[x.date]) || 0;
    if (!tomb) return false;
    return t > tomb;
  };
  lists.forEach((list) => list.forEach((x) => {
    if (!x || !x.date) return;
    const blocked = wDel.has(x.date) || wDelAt[x.date] != null;
    const cut = coveringCutoff(purges, x.date, now);
    if ((blocked || cut) && !wins(x)) return;
    const prev = byDate.get(x.date);
    if (!prev || (timeMs(x.at) || 0) >= (timeMs(prev.at) || 0)) byDate.set(x.date, x);
  }));
  for (const x of byDate.values()) {
    if (!wins(x)) continue;
    wDel.delete(x.date);
    if (wDelAtRaw[x.date] == null) delete wDelAt[x.date];
  }
  const merged = {
    ...(newerLocal ? lp : rp),
    weighIns: [...byDate.values()],
    wDel: [...wDel],
    wDelAt,
    wDelAtRaw,
  };
  stripProfileClockFields(merged);
  return merged;
}

/* loggedAt is when the session was written. Manual cardio also stores
   finishedAt as that calendar day at noon, which is not the log time.
   The edge runtime reads that noon as UTC, so it can land after a delete
   that already happened. When loggedAt is present it is the only clock. */
function cardioTime(s) {
  if (!s || typeof s !== "object") return null;
  const logged = timeMs(s.loggedAt);
  if (logged != null) return logged;
  const keys = s.src === "manual"
    ? ["mod", "updatedAt", "createdAt", "at", "startedAt"]
    : ["mod", "updatedAt", "createdAt", "at", "startedAt", "finishedAt"];
  return latestTime(s, keys);
}

function stripCheckins(data, from, to, before, now) {
  let changed = false;
  if (Array.isArray(data.checkins)) {
    const ids = new Set(data.checkinDeleted || []);
    const next = [];
    for (const x of data.checkins) {
      const d = x && (x.date || x.day);
      if (inRange(d, from, to) && dropBefore(latestTime(x, ITEM_KEYS), before, now)) {
        changed = true;
        if (x.id) ids.add(x.id);
      } else next.push(x);
    }
    data.checkins = next;
    data.checkinDeleted = [...ids];
  } else if (data.checkins && typeof data.checkins === "object") {
    for (const d of Object.keys(data.checkins)) {
      if (inRange(d, from, to) && dropBefore(latestTime(data.checkins[d], ITEM_KEYS), before, now)) {
        delete data.checkins[d];
        changed = true;
      }
    }
  }
  return changed;
}

/* Remove logs that fall on from..to (inclusive). Does not record the purge itself.
   opts.quiet skips timestamp bumps so a merge can strip without winning every sync. */
export function stripRange(data, from, to, opts = {}) {
  if (!data || typeof data !== "object" || !validDay(from) || !validDay(to) || from > to) return false;
  let changed = false;

  const before = opts.before;
  const now = opts.now ?? Date.now();
  const deleted = new Set(data.deleted || []);
  data.sessions = (data.sessions || []).filter((s) => {
    if (s && inRange(s.date, from, to) && dropBefore(sessionTime(s), before, now)) {
      changed = true;
      if (s.id) deleted.add(s.id);
      return false;
    }
    return true;
  });
  data.deleted = [...deleted];

  if (data.food && typeof data.food === "object") {
    const fd = new Set(data.food.deleted || []);
    const days = data.food.days || {};
    let foodChanged = false;
    for (const d of Object.keys(days)) {
      if (!inRange(d, from, to)) continue;
      const keep = [];
      let dayChanged = false;
      for (const e of days[d] || []) {
        if (dropBefore(latestTime(e, ITEM_KEYS), before, now)) {
          dayChanged = true;
          if (e && e.id) fd.add(e.id);
        } else keep.push(e);
      }
      if (dayChanged) {
        foodChanged = true;
        if (keep.length) days[d] = keep;
        else delete days[d];
      }
    }
    if (foodChanged) {
      changed = true;
      data.food.days = days;
      data.food.deleted = [...fd];
      if (!opts.quiet) data.food.updatedAt = Date.now();
    }
  }

  if (data.cardio && typeof data.cardio === "object") {
    const cd = new Set(data.cardio.deleted || []);
    let cardioChanged = false;
    data.cardio.sessions = (data.cardio.sessions || []).filter((s) => {
      if (s && inRange(s.date, from, to) && dropBefore(cardioTime(s), before, now)) {
        cardioChanged = true;
        if (s.id) cd.add(s.id);
        return false;
      }
      return true;
    });
    if (cardioChanged) {
      changed = true;
      data.cardio.deleted = [...cd];
      if (!opts.quiet) data.cardio.updatedAt = Date.now();
    }
  }

  if (data.measurements && typeof data.measurements === "object") {
    for (const d of Object.keys(data.measurements)) {
      if (inRange(d, from, to) && dropBefore(latestTime(data.measurements[d], ITEM_KEYS), before, now)) {
        delete data.measurements[d];
        changed = true;
      }
    }
  }

  if (data.profile && typeof data.profile === "object") {
    if (stripProfileClockFields(data.profile)) changed = true;
    const wDel = new Set(data.profile.wDel || []);
    const tombs = mergeTombs(data.profile, null, now);
    const wDelAt = tombs.wDelAt;
    const wDelAtRaw = tombs.wDelAtRaw;
    const kept = [];
    let profileChanged = false;
    const beat = before == null ? [] : [{ from, to, deletedAt: before }];
    for (const x of data.profile.weighIns || []) {
      if (x && inRange(x.date, from, to)) {
        const wins = before != null && weighBeatsTombstone(beat, x, wDelAt, now, wDelAtRaw);
        if (!wins) {
          if (!wDel.has(x.date)) profileChanged = true;
          wDel.add(x.date);
          continue;
        }
        if (wDel.delete(x.date)) profileChanged = true;
        if (wDelAtRaw[x.date] == null && wDelAt[x.date] != null) { delete wDelAt[x.date]; profileChanged = true; }
      }
      kept.push(x);
    }
    if (profileChanged || kept.length !== (data.profile.weighIns || []).length
      || JSON.stringify(data.profile.wDelAt || {}) !== JSON.stringify(wDelAt)
      || JSON.stringify(data.profile.wDelAtRaw || {}) !== JSON.stringify(wDelAtRaw)) {
      changed = true;
      data.profile.weighIns = kept;
      data.profile.wDel = [...wDel];
      data.profile.wDelAt = wDelAt;
      data.profile.wDelAtRaw = wDelAtRaw;
      if (!opts.quiet) data.profile.updatedAt = Date.now();
    }
  }

  if (data.plan && typeof data.plan === "object") {
    const at = data.planAt && typeof data.planAt === "object" ? data.planAt : null;
    for (const d of Object.keys(data.plan)) {
      if (!inRange(d, from, to)) continue;
      if (at && !dropBefore(timeMs(at[d]), before, now)) continue;
      delete data.plan[d];
      if (at) delete at[d];
      changed = true;
    }
  }

  if (data.oura && data.oura.days && typeof data.oura.days === "object") {
    for (const d of Object.keys(data.oura.days)) {
      if (inRange(d, from, to)) { delete data.oura.days[d]; changed = true; }
    }
  }

  if (stripCheckins(data, from, to, before, now)) changed = true;
  if (changed && !opts.quiet) data.updatedAt = Date.now();
  return changed;
}

function usableCutoff(p, now) {
  return Math.max(clampStamp(timeMs(p && p.deletedAt), now) || 0, clampStamp(timeMs(p && p.at), now) || 0);
}

function rawAhead(p, now) {
  return Math.max(timeMs(p && p.deletedAt) || 0, timeMs(p && p.at) || 0) > now + CLOCK_SKEW_MS;
}

export function unionPurges(a, b, now = Date.now()) {
  const map = new Map();
  for (const p of [...(a || []), ...(b || [])]) {
    if (!p || !validDay(p.from) || !validDay(p.to) || p.from > p.to) continue;
    const k = p.from + "\0" + p.to;
    const cur = map.get(k);
    const usable = Math.max(usableCutoff(p, now), cur ? cur.usable : 0);
    const ahead = rawAhead(p, now) || !!(cur && cur.ahead);
    const stamp = usable || (ahead ? (now > 0 ? now - 1 : now) : 0);
    map.set(k, { from: p.from, to: p.to, at: stamp, deletedAt: stamp, synced: !!((cur && cur.synced) || p.synced), usable, ahead });
  }
  return [...map.values()].map(({ usable, ahead, ...rest }) => rest);
}

/* Record a range delete. A repeat delete moves deletedAt. Marking the same
   delete synced does not, or logs made in between would be wiped on the next sync. */
export function notePurge(list, from, to, synced, now = Date.now()) {
  const purges = Array.isArray(list) ? list : [];
  if (!validDay(from) || !validDay(to) || from > to) return purges;
  const hit = purges.find((p) => p && p.from === from && p.to === to);
  if (hit) {
    if (!synced) { hit.at = now; hit.deletedAt = now; }
    else if (purgeCutoff(hit) == null) { hit.at = now; hit.deletedAt = now; }
    hit.synced = !!synced;
    return purges;
  }
  purges.push({ from, to, at: now, deletedAt: now, synced: !!synced });
  return purges;
}

export function coveredBy(purges, day) {
  return (purges || []).some((p) => p && inRange(day, p.from, p.to));
}

/* Re-apply every stored purge. Quiet, so opening the app does not reshuffle sync timestamps.
   Only logs created or updated at or before deletedAt (or at, on older records) are removed. */
export function applyPurges(data, now = Date.now()) {
  const purges = data.purges || [];
  for (const p of purges) {
    if (!p) continue;
    const before = neutralCutoff(p, now);
    if (before != null) { p.at = before; p.deletedAt = before; }
    stripRange(data, p.from, p.to, { quiet: true, before, now });
  }
  if (data) stripProfileClockFields(data.profile);
  data.purges = purges;
  return data;
}

export function mergeCheckins(local, remote) {
  const deleted = new Set([...(local && local.checkinDeleted || []), ...(remote && remote.checkinDeleted || [])]);
  const a = local && local.checkins;
  const b = remote && remote.checkins;
  if (Array.isArray(a) || Array.isArray(b)) {
    const by = new Map();
    for (const x of [...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])]) {
      if (!x || deleted.has(x.id)) continue;
      const id = x.id || x.date || x.day;
      if (!id) continue;
      by.set(id, x);
    }
    return { checkins: [...by.values()], checkinDeleted: [...deleted] };
  }
  if ((a && typeof a === "object") || (b && typeof b === "object")) {
    return { checkins: { ...(b || {}), ...(a || {}) }, checkinDeleted: [...deleted] };
  }
  return { checkins: a || null, checkinDeleted: [...deleted] };
}

export function csvEscape(v) {
  if (v == null || v === "") return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

const ABOUT = `Insight data export
This zip is a copy of what Insight has stored on this device.
Weights are in the units listed in profile.csv.
photos.csv lists progress photos (date and pose). The image files are not in this zip.
Meal photos sent off for a nutrition estimate are not kept, so they are not here.
A written meal description sent for an estimate is not kept either.
Oura rows are the days Insight has stored, not a full copy of your Oura account.
`;

function num(v) { return v == null || v === "" ? "" : String(v); }

export function buildExportFiles(state, opts = {}) {
  const s = state || {};
  const profile = s.profile || {};
  const files = [{ name: "about.txt", text: ABOUT }];

  const profRows = [["field", "value"]];
  for (const k of ["name", "email", "dob", "sex", "units", "heightCm", "activity"]) {
    if (profile[k] != null && profile[k] !== "") profRows.push([k, profile[k]]);
  }
  if (opts.email) profRows.push(["account_email", opts.email]);
  files.push({ name: "profile.csv", text: toCsv(profRows) });

  const weighs = [["date", "kg"]];
  for (const w of [...(profile.weighIns || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    weighs.push([w.date, num(w.kg)]);
  }
  files.push({ name: "weigh_ins.csv", text: toCsv(weighs) });

  const routines = [["routine_id", "routine", "exercise", "muscles"]];
  for (const w of s.workouts || []) {
    for (const e of w.exercises || []) routines.push([w.id, w.name, e.name, (e.muscles || []).join(" ")]);
  }
  files.push({ name: "routines.csv", text: toCsv(routines) });

  const sets = [["date", "workout_id", "workout", "exercise", "set_index", "weight", "reps", "tag", "note", "pr", "left_weight", "left_reps", "right_weight", "right_reps", "rpe"]];
  for (const sess of s.sessions || []) {
    for (const e of sess.entries || []) {
      (e.sets || []).forEach((x, i) => {
        sets.push([
          sess.date, sess.workoutId || "", sess.name || "", e.exercise || "", i + 1,
          num(x.w), num(x.r), x.tag || "", x.note || "", (x.pr || []).join(" "),
          x.uni ? num(x.uni.l && x.uni.l.w) : "", x.uni ? num(x.uni.l && x.uni.l.r) : "",
          x.uni ? num(x.uni.r && x.uni.r.w) : "", x.uni ? num(x.uni.r && x.uni.r.r) : "",
          num(x.rpe),
        ]);
      });
    }
  }
  files.push({ name: "sets.csv", text: toCsv(sets) });

  const food = [["date", "meal", "name", "servings", "calories", "protein_g", "carbs_g", "fat_g", "source"]];
  const days = (s.food && s.food.days) || {};
  for (const d of Object.keys(days).sort()) {
    for (const e of days[d] || []) {
      const m = e.servings || 1;
      const b = e.base || {};
      food.push([d, e.meal || "", e.name || "", num(m), num(Math.round((b.kcal || 0) * m)), num(Math.round((b.p || 0) * m)), num(Math.round((b.c || 0) * m)), num(Math.round((b.f || 0) * m)), e.src || ""]);
    }
  }
  files.push({ name: "food.csv", text: toCsv(food) });

  const measKeys = ["chest", "waist", "hips", "arms", "thighs", "calves", "neck"];
  const meas = [["date", ...measKeys.map((k) => k + "_cm")]];
  const measurements = s.measurements || {};
  for (const d of Object.keys(measurements).sort()) {
    const vals = (measurements[d] && measurements[d].vals) || {};
    meas.push([d, ...measKeys.map((k) => vals[k] == null ? "" : num(vals[k]))]);
  }
  files.push({ name: "measurements.csv", text: toCsv(meas) });

  const cardio = [["date", "machine", "minutes", "kcal", "segments"]];
  for (const c of (s.cardio && s.cardio.sessions) || []) {
    const min = (c.segments || []).reduce((n, g) => n + (g.min || 0), 0);
    cardio.push([c.date, c.machine || "", num(Math.round(min * 10) / 10), num(c.kcal), JSON.stringify(c.segments || [])]);
  }
  files.push({ name: "cardio.csv", text: toCsv(cardio) });

  const oura = [["date", "readiness", "sleep_score", "sleep_seconds", "hrv_ms", "resting_hr", "steps", "temp_c"]];
  const od = (s.oura && s.oura.days) || {};
  for (const d of Object.keys(od).sort()) {
    const o = od[d] || {};
    oura.push([d, num(o.readiness), num(o.sleepScore), num(o.total), num(o.hrv), num(o.rhr), num(o.steps), num(o.temp)]);
  }
  files.push({ name: "oura_days.csv", text: toCsv(oura) });

  const goals = [["kind", "name", "value"]];
  const g = s.goals || {};
  if (g.sessionsPerWeek) goals.push(["sessions_per_week", "", g.sessionsPerWeek]);
  if (g.weightDir) goals.push(["weight_direction", "", g.weightDir]);
  for (const [name, lift] of Object.entries(g.lifts || {})) goals.push(["lift", name, lift && lift.kg != null ? lift.kg : ""]);
  files.push({ name: "goals.csv", text: toCsv(goals) });

  const plan = [["date", "plan"]];
  for (const d of Object.keys(s.plan || {}).sort()) plan.push([d, s.plan[d]]);
  files.push({ name: "plan.csv", text: toCsv(plan) });

  const photos = [["id", "date", "pose", "taken_at"]];
  for (const p of opts.photos || []) photos.push([p.id, p.date, p.pose || "", p.at || ""]);
  files.push({ name: "photos.csv", text: toCsv(photos) });

  const checks = [["date", "id", "kind", "note"]];
  if (Array.isArray(s.checkins)) {
    for (const x of s.checkins) checks.push([x.date || x.day || "", x.id || "", x.kind || x.type || "", x.note || ""]);
  } else if (s.checkins && typeof s.checkins === "object") {
    for (const d of Object.keys(s.checkins).sort()) {
      const x = s.checkins[d];
      checks.push([d, x && x.id || "", x && (x.kind || x.type) || "", x && x.note || ""]);
    }
  }
  files.push({ name: "checkins.csv", text: toCsv(checks) });
  return files;
}

/* CRC-32 (IEEE), used by the zip local and central headers. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* STORE method (no compression) so the zip needs no library. */
export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = typeof f.text === "string" ? enc.encode(f.text) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const centralBlob = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralBlob, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}
