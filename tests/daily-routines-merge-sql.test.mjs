import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url);
const MIGRATION = "supabase/migrations/20261119234500_merge_daily_routines.sql";
const PREVIOUS = [
  "supabase/migrations/20261004180000_merge_user_data.sql",
  "supabase/migrations/20261004210000_merge_home_v2.sql",
  "supabase/migrations/20261005000000_home_v2_brief_rank.sql",
];
const UID = "11111111-1111-4111-8111-111111111111";
const DAY_MS = 86400000;
const KINDS = ["blocks", "items", "placements", "compounds", "logs"];

const ctx = {};

function pgBin(name) {
  const candidates = [
    process.env.PG_BIN && join(process.env.PG_BIN, name),
    "/usr/lib/postgresql/16/bin/" + name,
    "/usr/lib/postgresql/17/bin/" + name,
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function run(bin, args, opts = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", ...opts });
  if (result.error) throw result.error;
  return result;
}

function filePath(rel) {
  return new URL(rel, ROOT).pathname;
}

function readSql(rel) {
  return readFileSync(filePath(rel), "utf8");
}

/* Same comparison the client uses. Keys sort by UTF-16, which for these
   ASCII ids is the same order as COLLATE "C". */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fieldMs(row, key) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return 0;
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function clampMs(ms, now) {
  if (!(ms > 0)) return 0;
  const base = typeof now === "number" && Number.isFinite(now) ? now : 0;
  const cap = base + DAY_MS;
  return ms > cap ? cap : ms;
}

function stampOf(row, now) {
  return Math.max(clampMs(fieldMs(row, "updatedAt"), now), clampMs(fieldMs(row, "deletedAt"), now));
}

function isTomb(row, now) {
  return clampMs(fieldMs(row, "deletedAt"), now) > 0;
}

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function prepare(raw, kind, now) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > 80) return null;
  const updated = clampMs(fieldMs(raw, "updatedAt"), now);
  const deleted = clampMs(fieldMs(raw, "deletedAt"), now);
  const updatedAt = deleted > 0 && updated < deleted ? deleted : updated;
  const deletedAt = deleted > 0 ? deleted : null;
  if (kind === "placements") {
    if (typeof raw.blockId !== "string" || raw.blockId === "") return null;
    if (typeof raw.itemId !== "string" || raw.itemId === "") return null;
  }
  if (kind === "logs") {
    const day = validDay(raw.day) ? raw.day : null;
    const status = typeof raw.status === "string" && raw.status.trim() ? raw.status.trim().slice(0, 24) : "";
    if (!day || !status) return null;
    if (deletedAt) return { id: raw.id, day, status, updatedAt, deletedAt };
    return { ...raw, id: raw.id, day, status, updatedAt, deletedAt };
  }
  return { ...raw, id: raw.id, updatedAt, deletedAt };
}

function beats(candidate, current, kind, now) {
  const left = stampOf(candidate, now);
  const right = stampOf(current, now);
  if (left !== right) return left > right;
  if (isTomb(candidate, now) !== isTomb(current, now)) return isTomb(candidate, now);
  return stableStringify(prepare(candidate, kind, now)) > stableStringify(prepare(current, kind, now));
}

function mergeList(stored, incoming, kind, now) {
  const list = [];
  if (Array.isArray(incoming)) list.push(...incoming);
  if (Array.isArray(stored)) list.push(...stored);
  const ids = [];
  const acc = new Map();
  for (const item of list) {
    const ready = prepare(item, kind, now);
    if (!ready) continue;
    const current = acc.get(ready.id);
    if (!current) {
      ids.push(ready.id);
      acc.set(ready.id, item);
    } else if (beats(item, current, kind, now)) {
      acc.set(ready.id, item);
    }
  }
  return ids.map((id) => prepare(acc.get(id), kind, now));
}

function preparePrefs(raw, now) {
  const prefs = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const updatedAt = clampMs(fieldMs(prefs, "updatedAt"), now);
  const lastBlockId = typeof prefs.lastBlockId === "string" && prefs.lastBlockId ? prefs.lastBlockId : null;
  return { ...prefs, updatedAt, lastBlockId };
}

function mergePrefs(stored, incoming, now) {
  const left = preparePrefs(stored, now);
  const right = preparePrefs(incoming, now);
  const leftAt = clampMs(fieldMs(left, "updatedAt"), now);
  const rightAt = clampMs(fieldMs(right, "updatedAt"), now);
  if (leftAt !== rightAt) return leftAt > rightAt ? left : right;
  const leftS = stableStringify(left);
  const rightS = stableStringify(right);
  if (leftS > rightS || leftS === rightS) return left;
  return right;
}

function mergeRoutines(stored, incoming, now) {
  const left = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const right = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  const out = {
    updatedAt: Math.max(clampMs(fieldMs(left, "updatedAt"), now), clampMs(fieldMs(right, "updatedAt"), now)),
  };
  for (const kind of KINDS) out[kind] = mergeList(left[kind], right[kind], kind, now);
  out.prefs = mergePrefs(left.prefs, right.prefs, now);
  return out;
}

function indexRows(list) {
  const out = {};
  for (const row of list || []) out[row.id] = row;
  return out;
}

function project(store) {
  const out = { updatedAt: store.updatedAt, prefs: store.prefs };
  for (const kind of KINDS) out[kind] = indexRows(store[kind]);
  return out;
}

function query(text) {
  const path = join(ctx.dir, "batch.sql");
  writeFileSync(path, text);
  const result = run(ctx.psql, [...ctx.base, "-q", "-t", "-A", "-f", path], {
    env: { ...process.env, PGUSER: ctx.user },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

function tagged(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const cut = line.indexOf("|");
    if (cut < 0) continue;
    out[line.slice(0, cut)] = line.slice(cut + 1);
  }
  return out;
}

function push(stored, incoming) {
  const storedJson = JSON.stringify(stored);
  const incomingJson = JSON.stringify(incoming);
  const got = tagged(query(`
    do $do$
    begin
      perform set_config('request.jwt.claim.sub', '${UID}', false);
      delete from public.user_data where user_id = '${UID}';
      insert into public.user_data (user_id, data)
      values ('${UID}', $stored$${storedJson}$stored$::jsonb);
    end
    $do$;
    select 'before|' || coalesce((data->'dailyRoutines')::text, '<missing>')
      from public.user_data where user_id = '${UID}';
    select 'full|' || public.merge_user_data($incoming$${incomingJson}$incoming$::jsonb)::text;
    select 'after|' || coalesce((data->'dailyRoutines')::text, '<missing>')
      from public.user_data where user_id = '${UID}';
    select 'row|' || data::text
      from public.user_data where user_id = '${UID}';
  `));
  const full = JSON.parse(got.full);
  const row = JSON.parse(got.row);
  assert.deepEqual(row, full, "the saved row must be the value merge_user_data returns");
  return { before: got.before, after: got.after, full };
}

function mergedRoutines(storedStore, incomingStore, now) {
  const got = push(
    { settingsAt: 7, workouts: [{ id: "w-old" }], dailyRoutines: storedStore },
    { settingsAt: 3, workouts: [{ id: "w-new" }], dailyRoutines: incomingStore },
  );
  assert.equal(got.full.settingsAt, 3, "settingsAt stays the caller's payload");
  assert.deepEqual(got.full.workouts, [{ id: "w-new" }], "workouts stay the caller's payload");
  const expected = mergeRoutines(storedStore, incomingStore, now);
  assert.deepEqual(got.full.dailyRoutines, expected);
  return got.full.dailyRoutines;
}

test.before(async () => {
  const sql = readSql(MIGRATION);
  const previous = readSql("supabase/migrations/20261004210000_merge_home_v2.sql");
  assert.match(sql, /create or replace function public\.merge_user_data\(p_data jsonb\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /grant execute on function public\.merge_user_data\(jsonb\) to authenticated/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(previous, /dailyRoutines/);

  const files = readdirSync(filePath("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  const definedIn = files.filter((name) => /function\s+public\.merge_user_data/i.test(readSql(`supabase/migrations/${name}`)));
  assert.deepEqual(definedIn, [
    "20261004180000_merge_user_data.sql",
    "20261004210000_merge_home_v2.sql",
    MIGRATION.slice("supabase/migrations/".length),
  ]);

  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required");
  ctx.dir = mkdtempSync(join(tmpdir(), "insight-routines-merge-"));
  ctx.user = process.env.USER || "ubuntu";
  ctx.psql = psql;
  ctx.pgCtl = pgCtl;
  const port = await freePort();
  ctx.base = ["-h", ctx.dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];

  const init = run(initdb, ["-D", ctx.dir, "--auth=trust", "--username", ctx.user, "--no-sync"]);
  assert.equal(init.status, 0, init.stderr);
  const start = run(pgCtl, ["-D", ctx.dir, "-l", join(ctx.dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${ctx.dir}`]);
  assert.equal(start.status, 0, start.stderr);
  ctx.started = true;

  const schema = query(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end
    $roles$;
    create table public.user_data (
      user_id uuid primary key,
      data jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `);
  assert.equal(schema, "");
  for (const rel of [...PREVIOUS, MIGRATION, MIGRATION]) {
    const applied = run(psql, [...ctx.base, "-f", filePath(rel)], { env: { ...process.env, PGUSER: ctx.user } });
    assert.equal(applied.status, 0, `${rel}\n${applied.stderr}`);
  }
});

test.after(() => {
  if (ctx.started && ctx.pgCtl && ctx.dir) {
    run(ctx.pgCtl, ["-D", ctx.dir, "-w", "-m", "immediate", "stop"]);
  }
  if (ctx.dir) rmSync(ctx.dir, { recursive: true, force: true });
});

test("merge_user_data keeps dailyRoutines and merges rows the way the client does", { timeout: 120_000 }, () => {
  const samples = [
    { aa: 1, b: 2, nested: { z: true, a: null }, list: ["q", { b: 1, a: 2 }], n: 1.5, s: 'say "hi"' },
    {},
    [],
    null,
    "text",
    true,
    0,
  ];
  for (const sample of samples) {
    const json = JSON.stringify(sample);
    const got = query(`select public.daily_routines_stable($sample$${json}$sample$::jsonb);`).trim();
    assert.equal(got, stableStringify(sample), `stable ${json}`);
  }

  const storedHome = { v: 2, items: ["today", "this-week"], hidden: [], updatedAt: 5000 };
  const kept = {
    marker: "keep-omit",
    custom: [1, "x"],
    logs: [{ id: "L9", day: "2026-01-02", status: "done", amount: 1.25, unit: "mcg" }],
  };
  const omitted = push(
    {
      settingsAt: 9,
      sessions: [{ id: "s1", name: "Old" }],
      workouts: [{ id: "w-old" }],
      food: { days: { "2026-01-02": { kcal: 1 } } },
      machineNotes: {
        Squat: { text: "Rack 7", at: 50 },
        Curl: { text: "Pin 1", at: 5 },
      },
      layout: { homeV2: storedHome },
      dailyRoutines: kept,
    },
    {
      settingsAt: 2,
      workouts: [{ id: "w-new", note: "Example" }],
      food: { days: { "2026-01-03": { kcal: 2 } } },
      theme: "ink",
      machineNotes: {
        Squat: { text: "Rack 1", at: 10 },
        Curl: { text: "Pin 9", at: 40 },
        Row: { text: "Pad 2", at: 20 },
      },
      layout: {
        homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1000 },
        extra: "from-phone",
      },
    },
  );
  assert.equal(omitted.after, omitted.before, "an omitted dailyRoutines key keeps the stored object");
  assert.match(omitted.after, /keep-omit/);
  assert.equal(omitted.full.settingsAt, 2);
  assert.equal(Object.hasOwn(omitted.full, "sessions"), false, "a key only on the stored blob is still replaced");
  assert.deepEqual(omitted.full.workouts, [{ id: "w-new", note: "Example" }]);
  assert.deepEqual(omitted.full.food, { days: { "2026-01-03": { kcal: 2 } } });
  assert.equal(omitted.full.theme, "ink");
  assert.deepEqual(omitted.full.machineNotes, {
    Squat: { text: "Rack 7", at: 50 },
    Curl: { text: "Pin 9", at: 40 },
    Row: { text: "Pad 2", at: 20 },
  });
  assert.deepEqual(omitted.full.layout, { homeV2: storedHome, extra: "from-phone" });

  const nulled = push(
    { settingsAt: 4, dailyRoutines: { marker: "keep-null", logs: [{ id: "L1", amount: 3 }] } },
    { settingsAt: 8, dailyRoutines: null, workouts: [{ id: "w-null" }] },
  );
  assert.equal(nulled.after, nulled.before, "JSON null dailyRoutines keeps the stored object");
  assert.match(nulled.after, /keep-null/);
  assert.equal(nulled.full.settingsAt, 8);
  assert.deepEqual(nulled.full.workouts, [{ id: "w-null" }]);

  const day = "2026-01-02";
  const storedStore = {
    updatedAt: 80,
    blocks: [
      { id: "A", name: "alpha", updatedAt: 10, deletedAt: null },
      { id: "B", name: "kept", updatedAt: 10, deletedAt: null },
    ],
    items: [{ id: "item-a", name: "Example Compound A", updatedAt: 10, deletedAt: null }],
    placements: [{ id: "place-a", blockId: "A", itemId: "item-a", order: 1, updatedAt: 10, deletedAt: null }],
    compounds: [{ id: "compound-a", name: "Example Compound A", amount: 1.25, unit: "mcg", updatedAt: 12, deletedAt: null }],
    logs: [
      { id: "live-tie", day, status: "done", name: "zinc", amount: 9, unit: "mcg", updatedAt: 40, deletedAt: null },
      { id: "by-delete", day, status: "done", amount: 9, updatedAt: 50, deletedAt: null },
      { id: "bad-day", day: "2026-02-31", status: "done", amount: 4, updatedAt: 70, deletedAt: null },
    ],
    prefs: { lastBlockId: "A", theme: "alpha", updatedAt: 10 },
  };
  const incomingStore = {
    updatedAt: 20,
    blocks: [
      { id: "A", name: "zinc", updatedAt: 10, deletedAt: null },
      { id: "C", name: "added", updatedAt: 4, deletedAt: null },
      { name: "drop me" },
    ],
    items: [],
    placements: [{ id: "place-a", blockId: "", itemId: "item-a", updatedAt: 99, deletedAt: null }],
    compounds: [{ id: "compound-a", name: "Example Compound A", amount: 2, unit: "mcg", updatedAt: "soon", deletedAt: null }],
    logs: [
      { id: "live-tie", day, status: "done", amount: 1, unit: "mcg", note: "extra", updatedAt: 40, deletedAt: 40 },
      { id: "by-delete", day, status: " done ", amount: 3, updatedAt: 10, deletedAt: 100 },
      { id: "only-in", day, status: "skipped", amount: 0.25, unit: "mcg", updatedAt: 15, deletedAt: null },
    ],
    prefs: { lastBlockId: "C", theme: "zinc", updatedAt: 10 },
  };

  const forward = mergedRoutines(storedStore, incomingStore, 0);
  const backward = mergedRoutines(incomingStore, storedStore, 0);
  assert.deepEqual(project(forward), project(backward), "both push orders pick the same rows");
  assert.deepEqual(forward, mergeRoutines(storedStore, incomingStore, 0));
  assert.deepEqual(backward, mergeRoutines(incomingStore, storedStore, 0));

  assert.equal(forward.updatedAt, 80);
  assert.equal(forward.blocks.find((row) => row.id === "A").name, "zinc");
  assert.equal(forward.blocks.find((row) => row.id === "B").name, "kept");
  assert.deepEqual(forward.blocks.map((row) => row.id).sort(), ["A", "B", "C"]);
  assert.equal(forward.items.length, 1);
  assert.equal(forward.placements.length, 1);
  assert.equal(forward.placements[0].blockId, "A");
  assert.equal(forward.compounds[0].amount, 1.25, "a malformed incoming stamp does not replace the stored compound");

  const tie = forward.logs.find((row) => row.id === "live-tie");
  assert.deepEqual(tie, { id: "live-tie", day, status: "done", updatedAt: 40, deletedAt: 40 });
  assert.equal(Object.hasOwn(tie, "amount"), false, "a log tombstone drops the dose");
  assert.equal(Object.hasOwn(tie, "note"), false);

  const deleted = forward.logs.find((row) => row.id === "by-delete");
  assert.deepEqual(deleted, { id: "by-delete", day, status: "done", updatedAt: 100, deletedAt: 100 });
  assert.equal(forward.logs.some((row) => row.id === "bad-day"), false);
  assert.equal(forward.logs.find((row) => row.id === "only-in").amount, 0.25);
  assert.equal(forward.prefs.theme, "zinc");
  assert.equal(forward.prefs.updatedAt, 10);

  const emptyPush = mergedRoutines(storedStore, {}, 0);
  assert.ok(emptyPush.blocks.some((row) => row.id === "B"), "an empty object merges; it does not wipe stored rows");

  const capNow = 1000;
  const capAt = capNow + DAY_MS;
  const capped = JSON.parse(query(`
    select public.daily_routines_merge(
      '{"updatedAt":1,"blocks":[{"id":"cap","name":"later","updatedAt":${capAt + 1}}]}'::jsonb,
      '{"updatedAt":1,"blocks":[{"id":"under","name":"now","updatedAt":500}]}'::jsonb,
      ${capNow}
    )::text;
  `).trim());
  assert.equal(capped.blocks.find((row) => row.id === "cap").updatedAt, capAt);
  assert.equal(capped.blocks.find((row) => row.id === "under").updatedAt, 500);
  assert.deepEqual(capped, mergeRoutines(
    { updatedAt: 1, blocks: [{ id: "cap", name: "later", updatedAt: capAt + 1 }] },
    { updatedAt: 1, blocks: [{ id: "under", name: "now", updatedAt: 500 }] },
    capNow,
  ));

  const security = tagged(query(`
    select 'definer|' || prosecdef::text
      || '|' || coalesce(proconfig::text, '')
      || '|' || has_function_privilege('authenticated', oid, 'execute')::text
      || '|' || has_function_privilege('anon', oid, 'execute')::text
      || '|' || has_function_privilege('public', oid, 'execute')::text
    from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'merge_user_data';
    select 'helpers|' || count(*)::text
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like 'daily_routines_%'
      and (
        prosecdef
        or has_function_privilege('authenticated', oid, 'execute')
        or has_function_privilege('anon', oid, 'execute')
        or has_function_privilege('public', oid, 'execute')
      );
  `));
  assert.equal(security.definer, "true|{search_path=public}|true|false|false");
  assert.equal(security.helpers, "0");

  const unauth = run(ctx.psql, [...ctx.base, "-c", "select set_config('request.jwt.claim.sub', '', false); select public.merge_user_data('{}'::jsonb);"], {
    env: { ...process.env, PGUSER: ctx.user },
  });
  assert.notEqual(unauth.status, 0);
  assert.match(`${unauth.stderr}`, /not authenticated/i);

  const bad = run(ctx.psql, [...ctx.base, "-c", `select set_config('request.jwt.claim.sub', '${UID}', false); select public.merge_user_data('[]'::jsonb);`], {
    env: { ...process.env, PGUSER: ctx.user },
  });
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stderr}`, /bad data/i);
});
