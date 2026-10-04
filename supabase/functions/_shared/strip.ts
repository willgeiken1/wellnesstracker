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
      if (s && inRange(s.date, from, to) && dropBefore(latestTime(s, ["loggedAt", "mod", "updatedAt", "createdAt", "at", "startedAt", "finishedAt"]), before)) {
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
    const kept: Bag[] = [];
    let profileChanged = false;
    for (const x of data.profile.weighIns || []) {
      if (x && inRange(x.date, from, to) && dropBefore(latestTime(x, ITEM_KEYS), before)) {
        wDel.add(x.date);
        profileChanged = true;
        continue;
      }
      if (x && inRange(x.date, from, to) && wDel.delete(x.date)) profileChanged = true;
      kept.push(x);
    }
    if (profileChanged || kept.length !== (data.profile.weighIns || []).length) {
      data.profile.weighIns = kept;
      data.profile.wDel = [...wDel];
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

export function resolveCutoff(data: Bag, from: string, to: string, requested: unknown): number {
  const hit = (Array.isArray(data?.purges) ? data.purges : []).find((p: Bag) => p && p.from === from && p.to === to);
  const stored = timeMs(hit && (hit.deletedAt ?? hit.at));
  const req = timeMs(requested);
  if (req && stored) return Math.max(req, stored);
  return req || stored || Date.now();
}

export function addPurge(data: Bag, from: string, to: string, deletedAt?: number) {
  const purges = Array.isArray(data.purges) ? data.purges : [];
  const hit = purges.find((p: Bag) => p && p.from === from && p.to === to);
  const stamp = timeMs(deletedAt) || timeMs(hit && (hit.deletedAt ?? hit.at)) || Date.now();
  if (hit) {
    const prev = timeMs(hit.deletedAt ?? hit.at) || 0;
    const next = Math.max(prev, stamp);
    hit.at = next;
    hit.deletedAt = next;
    hit.synced = true;
  } else purges.push({ from, to, at: stamp, deletedAt: stamp, synced: true });
  data.purges = purges;
  return data;
}
