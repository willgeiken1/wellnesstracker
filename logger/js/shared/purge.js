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

function stripCheckins(data, from, to) {
  let changed = false;
  if (Array.isArray(data.checkins)) {
    const ids = new Set(data.checkinDeleted || []);
    const next = [];
    for (const x of data.checkins) {
      const d = x && (x.date || x.day);
      if (inRange(d, from, to)) {
        changed = true;
        if (x.id) ids.add(x.id);
      } else next.push(x);
    }
    data.checkins = next;
    data.checkinDeleted = [...ids];
  } else if (data.checkins && typeof data.checkins === "object") {
    for (const d of Object.keys(data.checkins)) {
      if (inRange(d, from, to)) { delete data.checkins[d]; changed = true; }
    }
  }
  return changed;
}

/* Remove logs that fall on from..to (inclusive). Does not record the purge itself.
   opts.quiet skips timestamp bumps so a merge can strip without winning every sync. */
export function stripRange(data, from, to, opts = {}) {
  if (!data || typeof data !== "object" || !validDay(from) || !validDay(to) || from > to) return false;
  let changed = false;

  const deleted = new Set(data.deleted || []);
  data.sessions = (data.sessions || []).filter((s) => {
    if (s && inRange(s.date, from, to)) {
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
      foodChanged = true;
      for (const e of days[d] || []) if (e && e.id) fd.add(e.id);
      delete days[d];
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
      if (s && inRange(s.date, from, to)) {
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
      if (inRange(d, from, to)) { delete data.measurements[d]; changed = true; }
    }
  }

  if (data.profile && typeof data.profile === "object") {
    const wDel = new Set(data.profile.wDel || []);
    const before = (data.profile.weighIns || []).length;
    data.profile.weighIns = (data.profile.weighIns || []).filter((x) => {
      if (x && inRange(x.date, from, to)) { wDel.add(x.date); return false; }
      return true;
    });
    if (data.profile.weighIns.length !== before || wDel.size !== (data.profile.wDel || []).length) {
      changed = true;
      data.profile.wDel = [...wDel];
      if (!opts.quiet) data.profile.updatedAt = Date.now();
    }
  }

  if (data.plan && typeof data.plan === "object") {
    for (const d of Object.keys(data.plan)) {
      if (inRange(d, from, to)) { delete data.plan[d]; changed = true; }
    }
  }

  if (data.oura && data.oura.days && typeof data.oura.days === "object") {
    for (const d of Object.keys(data.oura.days)) {
      if (inRange(d, from, to)) { delete data.oura.days[d]; changed = true; }
    }
  }

  if (stripCheckins(data, from, to)) changed = true;
  if (changed && !opts.quiet) data.updatedAt = Date.now();
  return changed;
}

export function unionPurges(a, b) {
  const map = new Map();
  for (const p of [...(a || []), ...(b || [])]) {
    if (!p || !validDay(p.from) || !validDay(p.to) || p.from > p.to) continue;
    const k = p.from + "\0" + p.to;
    const cur = map.get(k);
    if (!cur) map.set(k, { from: p.from, to: p.to, at: p.at || 0, synced: !!p.synced });
    else map.set(k, { from: p.from, to: p.to, at: Math.max(cur.at || 0, p.at || 0), synced: !!(cur.synced || p.synced) });
  }
  return [...map.values()];
}

export function coveredBy(purges, day) {
  return (purges || []).some((p) => p && inRange(day, p.from, p.to));
}

/* Re-apply every stored purge. Quiet, so opening the app does not reshuffle sync timestamps. */
export function applyPurges(data) {
  const purges = data.purges || [];
  for (const p of purges) stripRange(data, p.from, p.to, { quiet: true });
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
