/** Pure, network-free legacy conversion, shared by native and the edge function.
 * No Oura cache, check-ins, device consent, credentials or lock settings enter this plan. */
export type Value = string | number | null;
export interface ImportRow {
  table: string;
  id: string;
  data: Record<string, Value>;
}
export interface ImportIssue {
  path: string;
  reason: string;
  raw: unknown;
}
export interface ImportPlan {
  version: 1;
  rows: ImportRow[];
  issues: ImportIssue[];
  unmapped: string[];
  legacy: Record<string, unknown>;
  home?: unknown;
}
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Obj)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
/** Four independent 32-bit lanes; callers reject collisions instead of losing rows. */
export function importId(key: string): string {
  const hex = [2166136261, 3335557771, 1518500249, 2718281829]
    .map((seed) => {
      let n = seed;
      for (let i = 0; i < key.length; i++)
        n = Math.imul(n ^ key.charCodeAt(i), 16777619);
      return (n >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
const keyName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const exerciseAliases: Record<string, string> = {
  "barbell bench press": "Bench Press",
  rdl: "Barbell Romanian Deadlift (RDL)",
  pullups: "Pull Ups",
  pushups: "Push-Up",
  "db curl": "Dumbbell Curl",
  "tricep pushdown": "Cable Tricep Pulldown",
};
/** Conservative typo matching: only a unique nearest bank name may auto-link. */
function nameDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = next;
  }
  return previous[b.length];
}
// v1 implicit routines, names only, ported from the PWA DEFAULT_WORKOUTS.
const legacyDefaultRoutines = [
  {
    id: "push",
    name: "Push",
    exercises: [
      {
        name: "Pec Fly Machine",
      },
      {
        name: "Smith Machine Incline Bench Press",
      },
      {
        name: "Chest Press Machine",
      },
      {
        name: "Cable Lateral Raise",
      },
      {
        name: "Shoulder Press Machine",
      },
      {
        name: "Rear Deltoid Fly Machine",
      },
      {
        name: "Cable Tricep Pulldown",
      },
      {
        name: "Dips",
      },
    ],
  },
  {
    id: "pull",
    name: "Pull",
    exercises: [
      {
        name: "Pull Ups",
      },
      {
        name: "Lat Pulldown Machine",
      },
      {
        name: "Seated Row Machine",
      },
      {
        name: "Plate Loaded Low Row",
      },
      {
        name: "Cable Lat Pullover",
      },
      {
        name: "Preacher Curl Machine",
      },
      {
        name: "Bicep Curl Machine",
      },
      {
        name: "Rope Hammer Curl",
      },
    ],
  },
  {
    id: "legs",
    name: "Legs",
    exercises: [
      {
        name: "Seated Leg Press Machine",
      },
      {
        name: "Barbell Romanian Deadlift (RDL)",
      },
      {
        name: "Seated Leg Curl Machine",
      },
      {
        name: "Seated Leg Extension Machine",
      },
      {
        name: "Abductor Machine",
      },
      {
        name: "Adductor Machine",
      },
      {
        name: "Calf Raises",
      },
    ],
  },
];
export function normalizePwa(
  input: unknown,
  bank: string[],
  mapping: Record<string, string> = {},
): ImportPlan {
  const root = obj(input);
  if (!Array.isArray(root.sessions)) throw new Error("Invalid backup.");
  if (root.version !== undefined && root.version !== 1 && root.version !== 2)
    throw new Error("Unsupported backup version.");
  const plan: ImportPlan = {
    version: 1,
    rows: [],
    issues: [],
    unmapped: [],
    legacy: {},
  };
  const used = new Map<string, string>(),
    occurrences = new Map<string, number>();
  const issue = (path: string, reason: string, raw: unknown) =>
    plan.issues.push({ path, reason, raw });
  const collection = (v: unknown, path: string): unknown[] => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    issue(path, "collection", v);
    return [v];
  };
  const number = (v: unknown, path: string, factor = 1): number | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      issue(path, "number", v);
      return null;
    }
    const result = v * factor;
    if (
      !Number.isFinite(result) ||
      Math.abs(result) > Number.MAX_SAFE_INTEGER
    ) {
      issue(path, "number-range", v);
      return null;
    }
    return result;
  };
  const integer = (v: unknown, path: string): number | null => {
    const n = number(v, path);
    if (n !== null && !Number.isSafeInteger(n)) {
      issue(path, "integer", v);
      return null;
    }
    return n;
  };
  const date = (v: unknown, path: string): string | null => {
    if (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v
    )
      return v;
    issue(path, "date", v ?? null);
    return null;
  };
  const time = (v: unknown, path: string): number | null => {
    if (v === null || v === undefined || v === "") return null;
    let text = str(v);
    if (
      text &&
      /^\d{4}-\d{2}-\d{2}T/.test(text) &&
      !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ) {
      issue(path, "timezone-unknown", v);
      text += "Z";
    }
    const n = typeof v === "number" ? v : Date.parse(text);
    if (!Number.isSafeInteger(n) || n < 0) {
      issue(path, "timestamp", v);
      return null;
    }
    return n;
  };
  const exercise = (v: unknown, path: string) => {
    const name = str(v).trim();
    if (!name) issue(path, "exercise", v ?? null);
    const mapped = Object.hasOwn(mapping, name) ? mapping[name] : undefined;
    if (mapped && mapped !== "custom" && !bank.includes(mapped))
      throw new Error("Invalid exercise mapping.");
    if (mapped && mapped !== "custom") return mapped;
    const alias = Object.hasOwn(exerciseAliases, name.toLowerCase())
      ? exerciseAliases[name.toLowerCase()]
      : undefined;
    const matches = bank.filter((n) => keyName(n) === keyName(alias ?? name));
    if (mapped !== "custom" && matches.length === 1) return matches[0];
    if (
      mapped !== "custom" &&
      matches.length === 0 &&
      keyName(name).length >= 7
    ) {
      const close = bank
        .map((n) => ({
          name: n,
          distance: nameDistance(keyName(name), keyName(n)),
        }))
        .filter((n) => n.distance <= 1);
      if (close.length === 1) return close[0].name;
    }
    if (!plan.unmapped.includes(name || "Imported exercise"))
      plan.unmapped.push(name || "Imported exercise");
    return name || "Imported exercise";
  };
  const identity = (path: string, v: unknown) => {
    const r = obj(v),
      key = path + ":" + (str(r.id) || stableJson(v));
    const n = occurrences.get(key) ?? 0;
    occurrences.set(key, n + 1);
    if (n > 0) issue(path, "duplicate-source-id", v);
    return key + ":" + n;
  };
  const add = (
    table: string,
    key: string,
    data: Record<string, Value>,
    raw: unknown,
  ) => {
    const id = importId("pwa:" + table + ":" + key),
      prior = used.get(id);
    if (prior) throw new Error("Duplicate import identity.");
    used.set(id, key);
    plan.rows.push({ table, id, data });
    plan.legacy[id] = raw;
    // Retain full legacy payload for fields with no native representation, locally only.
    const validScalar =
      (["routine_exercises", "machine_notes", "home_layout"].includes(table) &&
        typeof raw === "string") ||
      (table === "goals" && typeof raw === "number");
    if ((raw === null || typeof raw !== "object") && !validScalar)
      issue(key, "shape", raw);
    const original = obj(raw);
    if (
      ["name", "text", "exercise", "notes"].some(
        (field) =>
          original[field] != null && typeof original[field] !== "string",
      )
    )
      issue(key, "text", raw);
    return id;
  };
  const stamp = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && Number.isFinite(Date.parse(v))
        ? Date.parse(v)
        : 0;
  const purged = (day: unknown, raw: unknown, path: string) => {
    if (typeof day !== "string") return false;
    const r = obj(raw);
    const stamps = [
      "mod",
      "loggedAt",
      "updatedAt",
      "createdAt",
      "at",
      "startedAt",
      "finishedAt",
    ].map((k) => stamp(r[k]));
    for (const entry of list(r.entries))
      for (const set of list(obj(entry).sets)) stamps.push(stamp(obj(set).at));
    const latest = stamps.reduce((a, b) => Math.max(a, b), 0),
      now = Date.now();
    for (const v of list(root.purges)) {
      const p = obj(v);
      if (
        typeof p.from !== "string" ||
        typeof p.to !== "string" ||
        day < p.from ||
        day > p.to
      )
        continue;
      const rawCutoff = Math.max(stamp(p.deletedAt), stamp(p.at)),
        cutoff = rawCutoff > now + 60000 ? now - 1 : rawCutoff;
      if (!cutoff || !latest || latest > now + 60000 || latest <= cutoff) {
        issue(path, "deleted-by-range", { day });
        return true;
      }
    }
    return false;
  };
  const explicitlyDeleted = (id: unknown, marks: unknown) =>
    !!id &&
    list(marks).some((m) => (typeof m === "string" ? m : obj(m).id) === id);
  const profile = obj(root.profile),
    unit = profile.units === "metric" ? "kg" : "lb",
    kg = unit === "kg" ? 1 : 1 / 2.20462;
  const routines = new Map<string, string>();
  const workouts = Array.isArray(root.workouts)
    ? root.workouts
    : root.templates
      ? Object.entries(obj(root.templates)).map(([name, exercises]) => ({
          id: name.toLowerCase(),
          name,
          exercises,
        }))
      : legacyDefaultRoutines;
  workouts.forEach((v, i) => {
    const w = obj(v),
      key = identity("workouts", v);
    const id = add(
      "routines",
      key,
      { name: str(w.name) || "Imported routine", position: i },
      v,
    );
    routines.set(str(w.id), id);
    collection(w.exercises, key + ":exercises").forEach((v, j) => {
      const e = typeof v === "string" ? { name: v } : obj(v);
      add(
        "routine_exercises",
        key + ":" + j,
        {
          routine_id: id,
          exercise: exercise(e.name, key),
          position: j,
          target_sets: integer(e.sets, key),
          target_reps: integer(e.reps, key),
        },
        v,
      );
    });
  });
  list(root.sessions).forEach((v) => {
    const s = obj(v),
      key = identity("sessions", v);
    const setTimes = list(s.entries)
      .flatMap((e) => list(obj(e).sets))
      .map((x) => time(obj(x).at, key))
      .filter((n): n is number => n !== null);
    const first = setTimes.reduce<number | null>(
        (a, b) => (a === null ? b : Math.min(a, b)),
        null,
      ),
      last = setTimes.reduce<number | null>(
        (a, b) => (a === null ? b : Math.max(a, b)),
        null,
      );
    const started = time(s.startedAt ?? first, key),
      finished = time(
        s.finishedAt ??
          (root.version === 2
            ? null
            : (last ??
              (typeof s.date === "string" ? s.date + "T12:00:00Z" : null))),
        key,
      );
    const marks = list(root.deleted).filter(
      (m) => (typeof m === "string" ? m : obj(m).id) === s.id,
    );
    const live =
      !s.finishedAt &&
      s.origin === "freestyle" &&
      list(s.entries).some((e) => list(obj(e).sets).length > 0);
    const deleted = marks.some(
      (m) =>
        !live ||
        (typeof obj(m).at === "number" &&
          Number(obj(m).at) >= Number(s.mod ?? 0)),
    );
    // Retain intentional deletions for review without resurrecting their contents.
    if (deleted) {
      issue(key, "deleted-session", { id: s.id });
      return;
    }
    if (purged(s.date, s, key)) return;
    const id = add(
      "sessions",
      key,
      {
        day: date(s.date, key),
        routine_id:
          routines.get(str(s.workoutId) || str(s.day).toLowerCase()) ?? null,
        name: str(s.name) || str(s.day) || "Imported workout",
        origin: str(s.origin) || "routine",
        started_at: started,
        finished_at: finished,
        duration_ms:
          started !== null && finished !== null
            ? Math.max(0, finished - started)
            : null,
        notes: str(s.notes) || null,
      },
      v,
    );
    collection(s.entries, key + ":entries").forEach((v, i) => {
      const e = obj(v),
        ek = key + ":entries:" + i,
        entry = add(
          "entries",
          ek,
          {
            session_id: id,
            exercise: exercise(e.exercise, ek),
            position: i,
            notes: str(e.notes) || null,
          },
          v,
        );
      collection(e.sets, ek + ":sets").forEach((v, j) => {
        const s = obj(v),
          sk = ek + ":sets:" + j,
          uni = obj(s.uni),
          left = obj(uni.l),
          right = obj(uni.r),
          data: Record<string, Value> = {
            entry_id: entry,
            position: j,
            weight_kg: number(s.w, sk, kg),
            entered_value: number(s.w, sk),
            entered_unit: unit,
            reps: number(s.r, sk),
            rpe: number(s.rpe, sk),
            tag: str(s.tag) || null,
          };
        for (const [side, value] of [
          ["left", left],
          ["right", right],
        ] as const)
          if (Object.keys(value).length) {
            data[side + "_weight_kg"] = number(value.w, sk, kg);
            data[side + "_entered_value"] = number(value.w, sk);
            data[side + "_entered_unit"] = unit;
            data[side + "_reps"] = number(value.r, sk);
          }
        for (const k of ["reps", "left_reps", "right_reps"])
          if (typeof data[k] === "number" && !Number.isSafeInteger(data[k])) {
            issue(sk, "integer", v);
            data[k] = null;
          }
        if (data.reps === null) issue(sk, "missing-reps", v);
        add("sets", sk, data, v);
      });
    });
  });
  if (Object.keys(profile).length)
    add(
      "profile",
      "profile",
      {
        name: str(profile.name) || null,
        dob: profile.dob ? date(profile.dob, "profile.dob") : null,
        weight_unit: unit,
        height_m: number(profile.heightCm, "profile.height", 0.01),
      },
      Object.fromEntries(
        Object.entries(profile).filter(
          ([key]) => !["weighIns", "wDel", "wDelAt", "wDelAtRaw"].includes(key),
        ),
      ),
    );
  collection(profile.weighIns, "weighIns").forEach((v) => {
    const w = obj(v),
      key = identity("weighIns", v);
    if (purged(w.date, w, key)) return;
    const tomb = stamp(obj(profile.wDelAt)[str(w.date)]);
    if (
      (list(profile.wDel).includes(w.date) || tomb) &&
      (!stamp(w.at) || stamp(w.at) <= tomb || !tomb)
    ) {
      issue(key, "deleted-weigh-in", { day: w.date });
      return;
    }
    add(
      "weigh_ins",
      key,
      {
        day: date(w.date, key),
        weight_kg: number(w.kg, key),
        entered_value: number(w.kg, key, unit === "kg" ? 1 : 2.20462),
        entered_unit: unit,
        source: "app",
      },
      v,
    );
  });
  const nutrition = (
    b: Obj,
    m: number,
    path: string,
  ): Record<string, Value> => ({
    energy_kj: number(b.kcal, path, 4.184 * m),
    protein_g: number(b.p, path, m),
    carbs_g: number(b.c, path, m),
    fat_g: number(b.f, path, m),
  });
  const food = obj(root.food);
  for (const [day, entries] of Object.entries(obj(food.days)))
    collection(entries, "food:" + day).forEach((v) => {
      const e = obj(v),
        key = identity("food:" + day, v),
        meal = str(e.meal) || "other";
      if (explicitlyDeleted(e.id, food.deleted) || purged(day, e, key)) {
        issue(key, "deleted-food", { id: e.id });
        return;
      }
      const mealId = importId("pwa:meal:" + meal);
      if (!plan.rows.some((r) => r.table === "meals" && r.id === mealId))
        plan.rows.push({
          table: "meals",
          id: mealId,
          data: {
            name: meal,
            position: plan.rows.filter((r) => r.table === "meals").length,
          },
        });
      add(
        "food_entries",
        key,
        {
          day: date(day, key),
          meal_id: mealId,
          name: str(e.name) || "Imported food",
          ...nutrition(obj(e.base), number(e.servings, key) ?? 1, key),
        },
        v,
      );
    });
  collection(food.saved, "food.saved").forEach((v) => {
    const e = obj(v),
      key = identity("savedFood", v);
    add(
      "saved_foods",
      key,
      {
        name: str(e.name) || "Imported food",
        ...nutrition(obj(e.base), 1, key),
      },
      v,
    );
  });
  if (obj(food.targets).auto === false)
    add(
      "food_targets",
      "targets",
      { ...nutrition(obj(food.targets), 1, "targets") },
      food.targets,
    );
  collection(obj(root.cardio).sessions, "cardio.sessions").forEach((v) => {
    const c = obj(v),
      key = identity("cardio", v);
    if (
      explicitlyDeleted(c.id, obj(root.cardio).deleted) ||
      purged(c.date, c, key)
    ) {
      issue(key, "deleted-cardio", { id: c.id });
      return;
    }
    const segments = list(c.segments),
      minutes = segments.reduce<number>(
        (n, s) => n + (number(obj(s).min, key) ?? 0),
        0,
      );
    add(
      "cardio_sessions",
      key,
      {
        day: date(c.date, key),
        kind: str(c.machine) || str(c.kind) || "other",
        duration_ms: Math.round(minutes * 60000),
        distance_m: number(c.distance_m, key),
        notes: str(c.notes) || null,
      },
      v,
    );
    issue(key, "legacy-cardio-details", v);
  });
  for (const [day, v] of Object.entries(obj(root.measurements))) {
    const wrapped = obj(v),
      m = wrapped.vals ? obj(wrapped.vals) : wrapped,
      key = "measurements:" + day;
    if (purged(day, v, key)) continue;
    add(
      "measurements",
      key,
      {
        day: date(day, key),
        waist_m: number(m.waist, key, 0.01),
        hips_m: number(m.hips, key, 0.01),
        chest_m: number(m.chest, key, 0.01),
        arm_m: number(m.arms, key, 0.01),
        thigh_m: number(m.thighs, key, 0.01),
      },
      v,
    );
    if (m.neck !== undefined || m.calves !== undefined)
      issue(key, "extra-measurements", v);
  }
  for (const [name, v] of Object.entries(obj(root.machineNotes))) {
    const n = typeof v === "string" ? { text: v } : obj(v);
    if (n.gone) continue;
    add(
      "machine_notes",
      "note:" + name,
      { exercise: exercise(name, "machineNotes"), text: str(n.text).trim() },
      v,
    );
  }
  const home = obj(obj(root.layout).homeV2);
  if (home.v === 2 && Array.isArray(home.items)) {
    plan.home = home;
    const ids = [...new Set([...list(home.items), ...list(home.hidden)])];
    ids.forEach((v, i) => {
      if (typeof v !== "string") {
        issue("homeV2", "widget", v);
        return;
      }
      add(
        "home_layout",
        "widget:" + v,
        {
          widget: v,
          position: i,
          hidden: list(home.hidden).includes(v) ? 1 : 0,
        },
        v,
      );
    });
    if (home.sizes) issue("homeV2", "legacy-widget-sizes", home.sizes);
  }
  for (const [key, v] of Object.entries(food))
    if (!["days", "saved", "targets", "updatedAt"].includes(key))
      issue("food." + key, "legacy-field", v);
  for (const [key, v] of Object.entries(obj(root.cardio)))
    if (!["sessions", "updatedAt"].includes(key))
      issue("cardio." + key, "legacy-field", v);
  for (const [day, v] of Object.entries(obj(root.plan))) {
    const key = "plan:" + day;
    const routine = routines.get(str(v));
    if (!routine) issue(key, "missing-routine", v);
    add(
      "plan_days",
      key,
      { day: date(day, key), routine_id: routine ?? null, status: "planned" },
      v,
    );
  }
  const goals = obj(root.goals);
  if (goals.sessionsPerWeek != null)
    add(
      "goals",
      "sessions-per-week",
      {
        kind: "sessionsPerWeek",
        target_value: number(goals.sessionsPerWeek, "goals"),
        target_unit: "sessions",
      },
      goals.sessionsPerWeek,
    );
  for (const [name, v] of Object.entries(obj(goals.lifts))) {
    const g = obj(v);
    add(
      "goals",
      "lift:" + name,
      {
        kind: exercise(name, "goals"),
        target_value:
          g.kg != null ? number(g.kg, "goals") : number(g.w ?? v, "goals", kg),
        target_unit: "kg",
      },
      v,
    );
  }
  if (goals.weightDir)
    issue("goals.weightDir", "legacy-field", goals.weightDir);
  if (root.restSeconds != null)
    add(
      "settings",
      "settings",
      { rest_seconds: integer(root.restSeconds, "restSeconds") },
      { restSeconds: root.restSeconds },
    );
  for (const key of [
    "food",
    "cardio",
    "measurements",
    "layout",
    "plan",
    "goals",
    "profile",
    "machineNotes",
    "templates",
  ])
    if (
      root[key] != null &&
      (typeof root[key] !== "object" || Array.isArray(root[key]))
    )
      issue(key, "shape", root[key]);
  if (root.workouts != null && !Array.isArray(root.workouts))
    issue("workouts", "shape", root.workouts);
  if (Object.keys(obj(root.layout)).length && !plan.home)
    issue("layout", "legacy-home-layout", root.layout);
  for (const key of ["days", "targets"])
    if (
      food[key] != null &&
      (typeof food[key] !== "object" || Array.isArray(food[key]))
    )
      issue("food." + key, "shape", food[key]);
  const supported = new Set([
    "app",
    "version",
    "exportedAt",
    "sessions",
    "workouts",
    "templates",
    "profile",
    "food",
    "cardio",
    "measurements",
    "machineNotes",
    "layout",
    "deleted",
    "goals",
    "plan",
    "planAt",
    "purges",
    "restSeconds",
  ]);
  const ignored = new Set([
    "checkins",
    "checkinDeleted",
    "oura",
    "analytics",
    "analyticsPref",
    "crashReports",
    "crashReporting",
    "sentry",
    "usage",
    "appLock",
    "ownerId",
    "lastCloud",
    "lastExport",
    "demo",
    "updatedAt",
    "settingsAt",
  ]);
  for (const [key, v] of Object.entries(root))
    if (!supported.has(key) && !ignored.has(key)) issue(key, "legacy-field", v);
  return plan;
}
