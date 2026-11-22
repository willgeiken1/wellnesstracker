import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url);
const MIGRATION = "supabase/migrations/20261119234500_merge_daily_routines.sql";
const STEP = "supabase/migrations/20261121110000_daily_routines_source_step.sql";
const ORDER_AT = "supabase/migrations/20261121140000_daily_routines_order_at.sql";
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

/* Snapshot of logger/js/shared/daily-routines-store.js at this commit.
   This branch does not contain that file; PR 209 does. Prefer the real
   path when it is checked out so the comparison tracks the client. */
const CLIENT_STORE_SHA = "5c6c0a345fc2d707b4cd922706d85fe1a2a3faf1";

function clientStoreSource() {
  const local = filePath("logger/js/shared/daily-routines-store.js");
  if (existsSync(local)) return readFileSync(local, "utf8");
  return readFileSync(filePath("tests/fixtures/client-daily-routines-store.js"), "utf8");
}

async function loadClientMerge() {
  const source = clientStoreSource();
  assert.match(source, /export function mergeDailyRoutines/);
  const dir = mkdtempSync(join(tmpdir(), "routines-client-"));
  mkdirSync(join(dir, "js", "shared"), { recursive: true });
  writeFileSync(join(dir, "js", "runtime.js"), "export const app = {};\n");
  writeFileSync(join(dir, "js", "shared", "daily-routines-store.js"), source);
  writeFileSync(join(dir, "js", "shared", "routine-supply.js"), readFileSync(filePath("logger/js/shared/routine-supply.js")));
  const loaded = await import(pathToFileURL(join(dir, "js", "shared", "daily-routines-store.js")).href);
  ctx.clientDir = dir;
  ctx.clientSha = CLIENT_STORE_SHA;
  return loaded.mergeDailyRoutines;
}

function mergeRoutines(stored, incoming, now) {
  const merged = ctx.mergeDailyRoutines(stored, incoming, now);
  assert.ok(merged && typeof merged === "object", "mergeDailyRoutines returns a store");
  return merged;
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

function sqlMerge(stored, incoming, now) {
  const text = query(`
    select public.daily_routines_merge(
      $stored$${JSON.stringify(stored)}$stored$::jsonb,
      $incoming$${JSON.stringify(incoming)}$incoming$::jsonb,
      ${Number(now)}
    )::text;
  `).trim();
  return JSON.parse(text);
}

function assertSameStore(actual, expected, label) {
  assert.equal(actual.updatedAt, expected.updatedAt, `${label} updatedAt`);
  assert.deepEqual(actual.prefs, expected.prefs, `${label} prefs`);
  for (const kind of KINDS) {
    assert.equal(actual[kind].length, expected[kind].length, `${label} ${kind} length`);
    for (let i = 0; i < expected[kind].length; i += 1) {
      const id = expected[kind][i] && expected[kind][i].id;
      assert.deepEqual(actual[kind][i], expected[kind][i], `${label} ${kind}[${i}] ${id}`);
    }
  }
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
  ctx.mergeDailyRoutines = await loadClientMerge();
  const sql = readSql(MIGRATION);
  const previous = readSql("supabase/migrations/20261004210000_merge_home_v2.sql");
  assert.match(sql, /create or replace function public\.merge_user_data\(p_data jsonb\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /grant execute on function public\.merge_user_data\(jsonb\) to authenticated/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(previous, /dailyRoutines/);
  assert.doesNotMatch(sql, /daily_routines_order_stamp/);
  assert.match(readSql(STEP), /daily_routines_order_stamp/);
  assert.doesNotMatch(readSql(STEP), /function\s+public\.merge_user_data/i);
  assert.match(readSql(ORDER_AT), /daily_routines_apply_order_at/);
  assert.doesNotMatch(readSql(ORDER_AT), /function\s+public\.merge_user_data/i);

  const files = readdirSync(filePath("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  const definedIn = files.filter((name) => /function\s+public\.merge_user_data/i.test(readSql(`supabase/migrations/${name}`)));
  assert.deepEqual(definedIn, [
    "20261004180000_merge_user_data.sql",
    "20261004210000_merge_home_v2.sql",
    MIGRATION.slice("supabase/migrations/".length),
    "20261121183000_daily_routines_undo_keeps_dose.sql",
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
  for (const rel of [...PREVIOUS, MIGRATION, MIGRATION, STEP, ORDER_AT, "supabase/migrations/20261121183000_daily_routines_undo_keeps_dose.sql"]) {
    const applied = run(psql, [...ctx.base, "-f", filePath(rel)], { env: { ...process.env, PGUSER: ctx.user } });
    assert.equal(applied.status, 0, `${rel}\n${applied.stderr}`);
  }
});

test.after(() => {
  if (ctx.started && ctx.pgCtl && ctx.dir) {
    run(ctx.pgCtl, ["-D", ctx.dir, "-w", "-m", "immediate", "stop"]);
  }
  if (ctx.dir) rmSync(ctx.dir, { recursive: true, force: true });
  if (ctx.clientDir) rmSync(ctx.clientDir, { recursive: true, force: true });
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
  const numbers = [0, 1, -1, 1.5, 0.1, 10, 12500, 1e-6, 1e-7, -1e-7, 1.23e-7, 9.87e-10, 1e20, 1e21, -1e21, 1.23e21, Number.MAX_VALUE, Number.MIN_VALUE, 1.0000000000000002];
  for (const n of numbers) {
    const json = JSON.stringify({ n });
    const got = query(`select public.daily_routines_stable($sample$${json}$sample$::jsonb);`).trim();
    assert.equal(got, stableStringify({ n }), `stable number ${json}`);
  }
  const keyed = { "\u{1F600}": 1, "\uFF21": 2 };
  const keyedJson = JSON.stringify(keyed);
  assert.equal(
    query(`select public.daily_routines_stable($sample$${keyedJson}$sample$::jsonb);`).trim(),
    stableStringify(keyed),
    "stable object keys follow UTF-16 code units",
  );

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

test("normalized tie-breaks match mergeDailyRoutines", () => {
  const now = 1_700_000_000_000;
  const day = "2026-01-02";
  const samples = [
    {
      name: "a trimmed name changes which equal-stamp row wins",
      stored: {
        updatedAt: 10,
        blocks: [{ id: "A", name: "m", note: "aaa", updatedAt: 10, deletedAt: null, constructor: "drop" }],
      },
      incoming: {
        updatedAt: 10,
        blocks: [{ id: "A", name: " m", note: "zzz", updatedAt: 10, deletedAt: null }],
      },
      check(merged) {
        assert.equal(merged.blocks[0].note, "zzz");
        assert.equal(merged.blocks[0].name, "m");
        assert.equal(merged.blocks[0].color, "citrus");
        assert.equal(merged.blocks[0].order, 0);
        assert.equal(Object.hasOwn(merged.blocks[0], "constructor"), false);
      },
    },
    {
      name: "a missing order is 0 before the tie-break",
      stored: {
        updatedAt: 10,
        blocks: [{ id: "A", name: "n", order: 0, tag: "b", updatedAt: 10 }],
      },
      incoming: {
        updatedAt: 10,
        blocks: [{ id: "A", name: "n", tag: "a", updatedAt: 10 }],
      },
      check(merged) {
        assert.equal(merged.blocks[0].tag, "b");
        assert.equal(merged.blocks[0].order, 0);
        assert.equal(merged.blocks[0].color, "citrus");
      },
    },
    {
      name: "color, kind, unit, status, and amount normalize like the client",
      stored: {
        updatedAt: 30,
        blocks: [{ id: "B", name: "  Night  ", color: "  ", order: "3", updatedAt: 10 }],
        items: [{ id: "I", name: " Example Compound A ", kind: " dose ", compoundId: "", updatedAt: 10 }],
        compounds: [{
          id: "C",
          name: "Example Compound A",
          amount: "1.50",
          unit: " mcg ",
          startDate: "2026-02-31",
          updatedAt: 10,
        }],
        logs: [{ id: "L", day, status: " done ", amount: "0.5", unit: " mcg ", at: "4", updatedAt: 10 }],
      },
      incoming: {
        updatedAt: 5,
        placements: [{ id: "P", blockId: "B", itemId: "I", updatedAt: 4 }],
      },
      check(merged) {
        assert.equal(merged.blocks[0].name, "Night");
        assert.equal(merged.blocks[0].color, "citrus");
        assert.equal(merged.blocks[0].order, 0);
        assert.equal(merged.items[0].kind, "dose");
        assert.equal(merged.items[0].compoundId, null);
        assert.equal(merged.compounds[0].amount, 1.5);
        assert.equal(merged.compounds[0].unit, "mcg");
        assert.equal(merged.compounds[0].startDate, null);
        assert.equal(merged.logs[0].status, "done");
        assert.equal(merged.logs[0].amount, 0.5);
        assert.equal(merged.logs[0].at, 0);
        assert.equal(merged.placements[0].order, 0);
      },
    },
    {
      name: "an equal stamp keeps the client's exponent form, so 1e-7 beats 0.1",
      stored: {
        updatedAt: 10,
        logs: [{ id: "L", day, status: "done", amount: 1e-7, updatedAt: 10, deletedAt: null }],
      },
      incoming: {
        updatedAt: 10,
        logs: [{ id: "L", day, status: "done", amount: 0.1, updatedAt: 10, deletedAt: null }],
      },
      check(merged) {
        assert.equal(merged.logs[0].amount, 1e-7);
      },
    },
    {
      name: "an equal stamp orders a supplementary character before a fullwidth letter",
      stored: {
        updatedAt: 10,
        blocks: [{ id: "A", name: "\u{1F600}", updatedAt: 10, deletedAt: null }],
      },
      incoming: {
        updatedAt: 10,
        blocks: [{ id: "A", name: "\uFF21", updatedAt: 10, deletedAt: null }],
      },
      check(merged) {
        assert.equal(merged.blocks[0].name, "\uFF21");
      },
    },
    {
      name: "a prefs tie uses the same UTF-16 order",
      stored: { updatedAt: 10, prefs: { lastBlockId: "A", note: "\u{1F600}", updatedAt: 10 } },
      incoming: { updatedAt: 10, prefs: { lastBlockId: "A", note: "\uFF21", updatedAt: 10 } },
      check(merged) {
        assert.equal(merged.prefs.note, "\uFF21");
      },
    },
  ];
  for (const sample of samples) {
    const forward = sqlMerge(sample.stored, sample.incoming, now);
    const backward = sqlMerge(sample.incoming, sample.stored, now);
    assert.deepEqual(forward, mergeRoutines(sample.stored, sample.incoming, now), sample.name);
    assert.deepEqual(backward, mergeRoutines(sample.incoming, sample.stored, now), `${sample.name} reversed`);
    assert.deepEqual(project(forward), project(backward), `${sample.name} converges`);
    sample.check(forward);
  }
});

test("a future step and an undone dose match the client", () => {
  const now = 8_000_000;
  const base = {
    id: "log_item_a_2026-11-19",
    itemId: "item_a",
    day: "2026-11-19",
    status: "done",
    amount: 400,
    unit: "mcg",
    note: "extra dose note",
    at: 4000,
    updatedAt: 5000,
    sourceAt: 9_000_000_000_000,
  };
  const cases = [
    ["restore step 3 beats undo step 2", { ...base, deletedAt: null, sourceStep: 3 }, { ...base, deletedAt: 5000, undone: true, sourceStep: 2 }],
    ["legacy supersedes loses to step 2", { ...base, deletedAt: null, supersedes: true }, { ...base, deletedAt: null, sourceStep: 2 }],
    ["undo step 3 beats restore step 2", { ...base, deletedAt: 5000, undone: true, sourceStep: 3 }, { ...base, deletedAt: null, sourceStep: 2 }],
    ["equal steps keep the newer stored stamp", { ...base, updatedAt: 4000, deletedAt: null, sourceStep: 2 }, { ...base, updatedAt: 6000, deletedAt: null, sourceStep: 2 }],
  ];
  for (const [label, storedLog, incomingLog] of cases) {
    const stored = { updatedAt: 1, logs: [storedLog], prefs: { lastBlockId: null, updatedAt: 1 } };
    const incoming = { updatedAt: 1, logs: [incomingLog], prefs: { lastBlockId: null, updatedAt: 1 } };
    const client = mergeRoutines(stored, incoming, now);
    const sql = sqlMerge(stored, incoming, now);
    const pick = (store) => (store.logs || []).find((row) => row && row.id === base.id);
    assert.deepEqual(pick(sql), pick(client), label);
  }
});

test("a newer orderAt reaches the other phone on the server and the client", () => {
  const now = 8_000_000;
  const block = (id, order, orderAt, extra = {}) => ({
    id,
    name: id === "block-night" ? "Night routine" : "Morning routine",
    color: "citrus",
    order,
    orderAt,
    updatedAt: 100,
    deletedAt: null,
    ...extra,
  });
  const prefs = { lastBlockId: null, updatedAt: 1 };
  const pairs = [
    ["one block takes the newer orderAt", { updatedAt: 100, blocks: [block("block-morning", 0, 50)], prefs }, { updatedAt: 100, blocks: [block("block-morning", 1, 80)], prefs }],
    ["a tombstone keeps its order over a later reorder", { updatedAt: 200, blocks: [block("block-morning", 0, 50, { updatedAt: 200, deletedAt: 200 })], prefs }, { updatedAt: 100, blocks: [block("block-morning", 1, 300)], prefs }],
  ];
  for (const [label, stored, incoming] of pairs) {
    const client = mergeRoutines(stored, incoming, now);
    const sql = sqlMerge(stored, incoming, now);
    assert.deepEqual(sql.blocks, client.blocks, label);
  }
  const stored = {
    updatedAt: 100,
    blocks: [block("block-morning", 0, 10), block("block-night", 1, 10)],
    prefs,
  };
  const incoming = {
    updatedAt: 100,
    blocks: [block("block-morning", 1, 90), block("block-night", 0, 90)],
    prefs,
  };
  const client = mergeRoutines(stored, incoming, now);
  const sql = sqlMerge(stored, incoming, now);
  const orders = (store) => store.blocks.slice().sort((a, b) => a.id < b.id ? -1 : 1).map((row) => [row.id, row.order, row.orderAt]);
  assert.deepEqual(orders(sql), orders(client), "a swap is the same on both sides");
  assert.deepEqual(orders(sql), [["block-morning", 1, 90], ["block-night", 0, 90]]);
});

test("a non-object dailyRoutines keeps the stored object", { timeout: 60_000 }, () => {
  const stored = {
    marker: "keep-shape",
    logs: [{ id: "L1", day: "2026-01-02", status: "done", updatedAt: 5, deletedAt: 9 }],
  };
  for (const shape of [[], "x", 0, false]) {
    const label = JSON.stringify(shape);
    const kept = push(
      { settingsAt: 1, dailyRoutines: stored },
      { settingsAt: 2, dailyRoutines: shape },
    );
    assert.equal(kept.after, kept.before, `${label} keeps the stored object`);
    assert.deepEqual(kept.full.dailyRoutines, stored, `${label} returns the stored object`);
    assert.equal(kept.full.settingsAt, 2);

    const none = push({ settingsAt: 1 }, { settingsAt: 2, dailyRoutines: shape });
    assert.equal(none.after, "<missing>", `${label} with nothing stored leaves the key out`);
    assert.equal(Object.hasOwn(none.full, "dailyRoutines"), false);
  }
});

test("merging thousands of logs finishes under the statement timeout", { timeout: 120_000 }, () => {
  const day = "2026-01-02";
  const side = (count, offset) => ({
    updatedAt: 1,
    logs: Array.from({ length: count }, (_, i) => ({
      id: `log-${i}`,
      day,
      status: "done",
      amount: i + offset,
      unit: "mcg",
      // A third of the ids tie on stamp, and some of those ties are tombstones.
      updatedAt: i % 3 === 0 ? 1000 + i : 1000 + i + offset,
      deletedAt: i % 9 === 0 ? 1000 + i : null,
    })),
  });
  const count = 5000;
  const stored = side(count, 1);
  const incoming = side(count, 2);
  // The server cancels the query at 8s. A quadratic merge of this size took
  // about 13s, so the timeout is the non-quadratic check. The client's clock
  // also includes the other suites running beside it, so it is not a limit.
  const got = query(`
    set statement_timeout = '8s';
    select public.daily_routines_merge(
      $stored$${JSON.stringify(stored)}$stored$::jsonb,
      $incoming$${JSON.stringify(incoming)}$incoming$::jsonb,
      0
    )::text;
  `).trim();
  const merged = JSON.parse(got);
  assert.equal(merged.logs.length, count);
  assertSameStore(merged, mergeRoutines(stored, incoming, 0), `${count} logs`);

  const withPurge = {
    settingsAt: 2,
    dailyRoutines: incoming,
    purges: [{ id: "purge-1", from: "2026-01-01", to: "2026-01-03", at: 50 }],
  };
  const timed = query(`
    set statement_timeout = '8s';
    do $do$
    begin
      perform set_config('request.jwt.claim.sub', '${UID}', false);
      delete from public.user_data where user_id = '${UID}';
      insert into public.user_data (user_id, data)
      values ('${UID}', $stored$${JSON.stringify({ settingsAt: 1, dailyRoutines: stored })}$stored$::jsonb);
    end
    $do$;
    select jsonb_array_length(public.merge_user_data($incoming$${JSON.stringify(withPurge)}$incoming$::jsonb) -> 'dailyRoutines' -> 'logs');
  `).trim();
  assert.equal(Number(timed), count);
});

test("4000 logs and 200 purges finish under the statement timeout", { timeout: 120_000 }, () => {
  const day = "2026-01-02";
  const count = 4000;
  const logs = Array.from({ length: count }, (_, i) => ({
    id: `log-${i}`,
    day,
    status: "done",
    amount: i + 1,
    unit: "mcg",
    updatedAt: 1000 + i,
    deletedAt: null,
  }));
  const purges = Array.from({ length: 200 }, (_, i) => ({
    id: `purge-${i}`,
    from: "2026-01-01",
    to: "2026-01-03",
    at: 50,
  }));
  const stored = { updatedAt: 1, logs };
  const incoming = {
    settingsAt: 2,
    dailyRoutines: { updatedAt: 2, logs },
    purges,
  };
  const timed = query(`
    set statement_timeout = '8s';
    do $do$
    begin
      perform set_config('request.jwt.claim.sub', '${UID}', false);
      delete from public.user_data where user_id = '${UID}';
      insert into public.user_data (user_id, data)
      values ('${UID}', $stored$${JSON.stringify({ settingsAt: 1, dailyRoutines: stored })}$stored$::jsonb);
    end
    $do$;
    select jsonb_array_length(public.merge_user_data($incoming$${JSON.stringify(incoming)}$incoming$::jsonb) -> 'dailyRoutines' -> 'logs');
  `).trim();
  assert.equal(Number(timed), count);
});

test("an equal-stamp tie breaks by code-unit order on an ICU en-US database", { timeout: 120_000 }, () => {
  assert.equal(query(`create database icu_tie template template0 locale_provider icu icu_locale 'en-US' encoding 'UTF8';`), "");
  const base = ctx.base.map((arg, i, all) => (all[i - 1] === "-d" ? "icu_tie" : arg));
  const env = { ...process.env, PGUSER: ctx.user };
  const exec = (text) => {
    const path = join(ctx.dir, "icu.sql");
    writeFileSync(path, text);
    const result = run(ctx.psql, [...base, "-q", "-t", "-A", "-f", path], { env });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql failed");
    return result.stdout;
  };
  exec(`
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end
    $roles$;
    create table public.user_data (user_id uuid primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
  `);
  for (const rel of [...PREVIOUS, MIGRATION, STEP, ORDER_AT, "supabase/migrations/20261121183000_daily_routines_undo_keeps_dose.sql"]) {
    const applied = run(ctx.psql, [...base, "-f", filePath(rel)], { env });
    assert.equal(applied.status, 0, `${rel}\n${applied.stderr}`);
  }
  const localeColumn = exec(`
    select attname from pg_attribute
    where attrelid = 'pg_catalog.pg_database'::regclass
      and attname in ('daticulocale', 'datlocale')
      and not attisdropped
    order by attname
    limit 1;
  `).trim();
  assert.ok(localeColumn === "daticulocale" || localeColumn === "datlocale", localeColumn);
  assert.equal(exec(`select datlocprovider::text || '|' || ${localeColumn} from pg_database where datname = 'icu_tie';`).trim(), "i|en-US");
  assert.equal(exec(`select ('apple' < 'Zinc')::text;`).trim(), "true", "the database really sorts text with ICU rules");

  // "Zinc" < "apple" in code-unit order (the client), "apple" < "Zinc" under en-US rules.
  const block = (name) => ({ id: "A", name, updatedAt: 10 });
  const merge = (a, b) =>
    JSON.parse(exec(`select public.daily_routines_merge($a$${JSON.stringify(a)}$a$::jsonb, $b$${JSON.stringify(b)}$b$::jsonb, 0)::text;`));
  for (const [stored, incoming] of [
    [{ blocks: [block("Zinc")] }, { blocks: [block("apple")] }],
    [{ blocks: [block("apple")] }, { blocks: [block("Zinc")] }],
  ]) {
    const expected = mergeRoutines(stored, incoming, 0);
    assert.equal(expected.blocks[0].name, "apple");
    assert.deepEqual(merge(stored, incoming), expected, "blocks tie");
  }
  const beats = exec(`select public.daily_routines_beats($a$${JSON.stringify(block("Zinc"))}$a$::jsonb, $b$${JSON.stringify(block("apple"))}$b$::jsonb, 'blocks', 0)::text;`).trim();
  assert.equal(beats, "false", "pairwise rule");
  const pref = (note) => ({ lastBlockId: "A", note, updatedAt: 10 });
  for (const [a, b] of [["Zinc", "apple"], ["apple", "Zinc"]]) {
    const stored = { prefs: pref(a) };
    const incoming = { prefs: pref(b) };
    const expected = mergeRoutines(stored, incoming, 0);
    assert.equal(expected.prefs.note, "apple");
    assert.deepEqual(merge(stored, incoming).prefs, expected.prefs, "prefs tie");
  }

  const day = "2026-01-02";
  const log = (amount) => ({ id: "L", day, status: "done", amount, updatedAt: 10 });
  for (const [a, b] of [[1e-7, 0.1], [0.1, 1e-7]]) {
    const stored = { logs: [log(a)] };
    const incoming = { logs: [log(b)] };
    const expected = mergeRoutines(stored, incoming, 0);
    assert.equal(expected.logs[0].amount, 1e-7);
    assert.equal(merge(stored, incoming).logs[0].amount, 1e-7, "exponent tie on ICU");
  }
  const wide = "\uFF21";
  const grin = "\u{1F600}";
  for (const [a, b] of [[grin, wide], [wide, grin]]) {
    const stored = { blocks: [{ id: "A", name: a, updatedAt: 10 }] };
    const incoming = { blocks: [{ id: "A", name: b, updatedAt: 10 }] };
    const expected = mergeRoutines(stored, incoming, 0);
    assert.equal(expected.blocks[0].name, wide);
    assert.equal(merge(stored, incoming).blocks[0].name, wide, "UTF-16 tie on ICU");
  }
});
