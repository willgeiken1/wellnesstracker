// Date-range wipe of the user_data JSON blob.
// Keep this in step with logger/js/shared/purge.js (stripRange / unionPurges).

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

export function stripRange(data: Bag, from: string, to: string): Bag {
  if (!data || typeof data !== "object") data = {};
  if (!validDay(from) || !validDay(to) || from > to) return data;

  const deleted = new Set<string>(data.deleted || []);
  data.sessions = (data.sessions || []).filter((s: Bag) => {
    if (s && inRange(s.date, from, to)) {
      if (s.id) deleted.add(s.id);
      return false;
    }
    return true;
  });
  data.deleted = [...deleted];

  if (data.food && typeof data.food === "object") {
    const fd = new Set<string>(data.food.deleted || []);
    const days = data.food.days || {};
    for (const d of Object.keys(days)) {
      if (!inRange(d, from, to)) continue;
      for (const e of days[d] || []) if (e && e.id) fd.add(e.id);
      delete days[d];
    }
    data.food.days = days;
    data.food.deleted = [...fd];
    data.food.updatedAt = Date.now();
  }

  if (data.cardio && typeof data.cardio === "object") {
    const cd = new Set<string>(data.cardio.deleted || []);
    data.cardio.sessions = (data.cardio.sessions || []).filter((s: Bag) => {
      if (s && inRange(s.date, from, to)) {
        if (s.id) cd.add(s.id);
        return false;
      }
      return true;
    });
    data.cardio.deleted = [...cd];
    data.cardio.updatedAt = Date.now();
  }

  if (data.measurements && typeof data.measurements === "object") {
    for (const d of Object.keys(data.measurements)) if (inRange(d, from, to)) delete data.measurements[d];
  }

  if (data.profile && typeof data.profile === "object") {
    const wDel = new Set<string>(data.profile.wDel || []);
    data.profile.weighIns = (data.profile.weighIns || []).filter((x: Bag) => {
      if (x && inRange(x.date, from, to)) { wDel.add(x.date); return false; }
      return true;
    });
    data.profile.wDel = [...wDel];
    data.profile.updatedAt = Date.now();
  }

  if (data.plan && typeof data.plan === "object") {
    for (const d of Object.keys(data.plan)) if (inRange(d, from, to)) delete data.plan[d];
  }

  if (data.oura?.days && typeof data.oura.days === "object") {
    for (const d of Object.keys(data.oura.days)) if (inRange(d, from, to)) delete data.oura.days[d];
  }

  if (Array.isArray(data.checkins)) {
    const ids = new Set<string>(data.checkinDeleted || []);
    data.checkins = data.checkins.filter((x: Bag) => {
      const d = x && (x.date || x.day);
      if (inRange(d, from, to)) { if (x.id) ids.add(x.id); return false; }
      return true;
    });
    data.checkinDeleted = [...ids];
  } else if (data.checkins && typeof data.checkins === "object") {
    for (const d of Object.keys(data.checkins)) if (inRange(d, from, to)) delete data.checkins[d];
  }

  data.updatedAt = Date.now();
  return data;
}

export function addPurge(data: Bag, from: string, to: string) {
  const purges = Array.isArray(data.purges) ? data.purges : [];
  const hit = purges.find((p: Bag) => p && p.from === from && p.to === to);
  if (hit) { hit.at = Date.now(); hit.synced = true; }
  else purges.push({ from, to, at: Date.now(), synced: true });
  data.purges = purges;
  return data;
}
