// Date-range wipe of the user_data JSON blob.
// Keep this in step with logger/js/shared/purge.js (stripRange / notePurge).
// opts.before / the before argument is the delete time. Logs created or updated
// after it stay. A missing time counts as older than the delete.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validDay(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function inRange(day: unknown, from: string, to: string) {
  return typeof day === "string" && validDay(day) && day >= from && day <= to;
}

type Bag = Record<string, any>;

function timeMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > 0) return t;
  }
  return null;
}

const ITEM_KEYS = ["loggedAt", "updatedAt", "createdAt", "at", "mod"];
const SESSION_KEYS = ["mod", "loggedAt", "updatedAt", "createdAt", "startedAt", "finishedAt"];

function latestTime(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  let best: number | null = null;
  const rec = obj as Bag;
  for (const k of keys) {
    const t = timeMs(rec[k]);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

function sessionTime(s: Bag): number | null {
  let best = latestTime(s, SESSION_KEYS);
  for (const e of (s && s.entries) || []) {
    for (const x of (e && e.sets) || []) {
      const t = timeMs(x && x.at);
      if (t != null && (best == null || t > best)) best = t;
    }
  }
  return best;
}

function dropBefore(stamp: number | null, before: number | null | undefined) {
  if (before == null) return true;
  return stamp == null || stamp <= before;
}

function copyWDelAt(src: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [d, v] of Object.entries(src as Bag)) {
    const t = timeMs(v);
    if (t != null) out[d] = t;
  }
  return out;
}

/* loggedAt is when the session was written. Manual cardio also stores
   finishedAt as that calendar day at noon, which is not the log time.
   This runtime is UTC, so that noon can fall after a delete that already
   happened. When loggedAt is present it is the only clock. */
function cardioTime(s: Bag): number | null {
  if (!s || typeof s !== "object") return null;
  const logged = timeMs(s.loggedAt);
  if (logged != null) return logged;
  const keys = s.src === "manual"
    ? ["mod", "updatedAt", "createdAt", "at", "startedAt"]
    : ["mod", "updatedAt", "createdAt", "at", "startedAt", "finishedAt"];
  return latestTime(s, keys);
}

function weighBeats(x: Bag, before: number, wDelAt: Record<string, number>): boolean {
  const t = timeMs(x && x.at);
  if (t == null || !x || !x.date) return false;
  const tomb = timeMs(wDelAt[x.date]) || 0;
  return t > Math.max(tomb, before);
}

/* A photo with no taken_at counts as older than the delete. */
export function photoDue(takenAt: unknown, cutoff: number): boolean {
  const t = timeMs(takenAt);
  if (t == null) return true;
  return t <= cutoff;
}

const CLOCK_SKEW_MS = 60_000;

function clampCutoff(t: number | null, now: number): number | null {
  if (t == null) return null;
  const cap = now + CLOCK_SKEW_MS;
  return t > cap ? cap : t;
}

export function stripRange(data: Bag, from: string, to: string, before?: number | null): Bag {
  if (!data || typeof data !== "object") data = {};
  if (!validDay(from) || !validDay(to) || from > to) return data;

  const deleted = new Set<string>(data.deleted || []);
  data.sessions = (data.sessions || []).filter((s: Bag) => {
    if (s && inRange(s.date, from, to) && dropBefore(sessionTime(s), before)) {
      if (s.id) deleted.add(s.id);
      return false;
    }
    return true;
  });
  data.deleted = [...deleted];

  if (data.food && typeof data.food === "object") {
    const fd = new Set<string>(data.food.deleted || []);
    const days = data.food.days || {};
    let foodChanged = false;
    for (const d of Object.keys(days)) {
      if (!inRange(d, from, to)) continue;
      const keep: Bag[] = [];
      let dayChanged = false;
      for (const e of days[d] || []) {
        if (dropBefore(latestTime(e, ITEM_KEYS), before)) {
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
    data.food.days = days;
    data.food.deleted = [...fd];
    if (foodChanged) data.food.updatedAt = Date.now();
  }

  if (data.cardio && typeof data.cardio === "object") {
    const cd = new Set<string>(data.cardio.deleted || []);
    let cardioChanged = false;
    data.cardio.sessions = (data.cardio.sessions || []).filter((s: Bag) => {
      if (s && inRange(s.date, from, to) && dropBefore(cardioTime(s), before)) {
        cardioChanged = true;
        if (s.id) cd.add(s.id);
        return false;
      }
      return true;
    });
    data.cardio.deleted = [...cd];
    if (cardioChanged) data.cardio.updatedAt = Date.now();
  }

  if (data.measurements && typeof data.measurements === "object") {
    for (const d of Object.keys(data.measurements)) {
      if (inRange(d, from, to) && dropBefore(latestTime(data.measurements[d], ITEM_KEYS), before)) delete data.measurements[d];
    }
  }

  if (data.profile && typeof data.profile === "object") {
    const wDel = new Set<string>(data.profile.wDel || []);
    const wDelAt = copyWDelAt(data.profile.wDelAt);
    const kept: Bag[] = [];
    let profileChanged = false;
    for (const x of data.profile.weighIns || []) {
      if (x && inRange(x.date, from, to)) {
        const wins = before != null && weighBeats(x, before, wDelAt);
        if (!wins) {
          if (!wDel.has(x.date)) profileChanged = true;
          wDel.add(x.date);
          continue;
        }
        if (wDel.delete(x.date)) profileChanged = true;
        if (wDelAt[x.date] != null) { delete wDelAt[x.date]; profileChanged = true; }
      }
      kept.push(x);
    }
    if (profileChanged || kept.length !== (data.profile.weighIns || []).length) {
      data.profile.weighIns = kept;
      data.profile.wDel = [...wDel];
      data.profile.wDelAt = wDelAt;
      data.profile.updatedAt = Date.now();
    }
  }

  if (data.plan && typeof data.plan === "object") {
    const at = data.planAt && typeof data.planAt === "object" ? data.planAt : null;
    for (const d of Object.keys(data.plan)) {
      if (!inRange(d, from, to)) continue;
      if (at && !dropBefore(timeMs(at[d]), before)) continue;
      delete data.plan[d];
      if (at) delete at[d];
    }
  }

  if (data.oura?.days && typeof data.oura.days === "object") {
    for (const d of Object.keys(data.oura.days)) if (inRange(d, from, to)) delete data.oura.days[d];
  }

  if (Array.isArray(data.checkins)) {
    const ids = new Set<string>(data.checkinDeleted || []);
    data.checkins = data.checkins.filter((x: Bag) => {
      const d = x && (x.date || x.day);
      if (inRange(d, from, to) && dropBefore(latestTime(x, ITEM_KEYS), before)) {
        if (x.id) ids.add(x.id);
        return false;
      }
      return true;
    });
    data.checkinDeleted = [...ids];
  } else if (data.checkins && typeof data.checkins === "object") {
    for (const d of Object.keys(data.checkins)) {
      if (inRange(d, from, to) && dropBefore(latestTime(data.checkins[d], ITEM_KEYS), before)) delete data.checkins[d];
    }
  }

  data.updatedAt = Date.now();
  return data;
}

export function resolveCutoff(data: Bag, from: string, to: string, requested: unknown, now = Date.now()): number {
  const hit = (Array.isArray(data?.purges) ? data.purges : []).find((p: Bag) => p && p.from === from && p.to === to);
  const stored = clampCutoff(timeMs(hit && (hit.deletedAt ?? hit.at)), now);
  const req = clampCutoff(timeMs(requested), now);
  if (req && stored) return Math.max(req, stored);
  return req || stored || now;
}

/* A stamp past the skew window is ignored so it cannot win Math.max over a real delete time. */
function usableStamp(t: number | null, now: number): number | null {
  if (t == null || !(t > 0)) return null;
  if (t > now + CLOCK_SKEW_MS) return null;
  return t;
}

export function addPurge(data: Bag, from: string, to: string, deletedAt?: number, now = Date.now()) {
  const purges = Array.isArray(data.purges) ? data.purges : [];
  const hit = purges.find((p: Bag) => p && p.from === from && p.to === to);
  const prevRaw = timeMs(hit && (hit.deletedAt ?? hit.at));
  const reqRaw = timeMs(deletedAt);
  const prev = usableStamp(prevRaw, now) || 0;
  const req = usableStamp(reqRaw, now) || 0;
  let next = Math.max(prev, req);
  if (!next) {
    const raw = Math.max(prevRaw || 0, reqRaw || 0);
    next = raw > now + CLOCK_SKEW_MS ? (now > 0 ? now - 1 : now) : now;
  }
  if (hit) {
    hit.at = next;
    hit.deletedAt = next;
    hit.synced = true;
  } else purges.push({ from, to, at: next, deletedAt: next, synced: true });
  data.purges = purges;
  return data;
}
