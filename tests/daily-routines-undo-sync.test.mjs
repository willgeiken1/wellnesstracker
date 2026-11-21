import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic routines only. Disposable local Postgres. No production database. */
const memory = {};
globalThis.localStorage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
};
function el() {
  return {
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {},
    classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, hidden: true, innerHTML: "",
  };
}
globalThis.document = {
  addEventListener() {}, removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(), head: el(), querySelector: () => el(), querySelectorAll: () => [], getElementById: () => el(), createElement: () => el(),
};
globalThis.window = globalThis;

const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
await import("../logger/js/pages/privacy.js");
const { isLive, mergeDailyRoutines } = await import("../logger/js/shared/daily-routines-store.js");
const { restoreRoutineLog } = await import("../logger/js/pages/daily-routines.js");
const { applyPurges } = await import("../logger/js/shared/purge.js");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = fileURLToPath(new URL("../supabase/migrations/20261121183000_daily_routines_undo_keeps_dose.sql", import.meta.url));
const UID = "11111111-1111-4111-8111-111111111111";
const LOG_ID = "log_item-a_2026-11-01";
const KEYS = ["day", "deletedAt", "id", "status", "updatedAt"];

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

function undoneLog(stamp) {
  return {
    id: LOG_ID,
    itemId: "item-a",
    compoundId: "compound-a",
    day: "2026-11-01",
    status: "done",
    amount: 250,
    unit: "mcg",
    note: "extra dose note",
    at: 1500,
    updatedAt: stamp,
    deletedAt: stamp,
    undone: true,
  };
}

function payload(log) {
  return {
    sessions: [],
    purges: [{ from: "2026-11-01", to: "2026-11-01", at: 3000, deletedAt: 3000, synced: true }],
    dailyRoutines: {
      updatedAt: log.updatedAt,
      blocks: [{ id: "block-morning", name: "Morning routine", color: "citrus", order: 0, updatedAt: 1000, deletedAt: null }],
      items: [{ id: "item-a", name: "Example Compound A", kind: "dose", compoundId: "compound-a", updatedAt: 1000, deletedAt: null }],
      placements: [],
      compounds: [{ id: "compound-a", name: "Example Compound A", amount: 500, unit: "mg", startDate: "2026-11-01", archivedAt: null, updatedAt: 1000, deletedAt: null }],
      logs: [log],
      prefs: { lastBlockId: "block-morning", updatedAt: 1000 },
    },
  };
}

test("an undone dose inside an earlier deleted range survives SQL merge and restore", { timeout: 120_000 }, async () => {
  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required");

  const dir = mkdtempSync(join(tmpdir(), "insight-undo-sync-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const env = { ...process.env, PGUSER: user };
  let started = false;

  function sqlFile(path) {
    return run(psql, [...base, "-f", path], { env });
  }
  function sqlText(text) {
    const path = join(dir, "batch.sql");
    writeFileSync(path, text);
    return run(psql, [...base, "-q", "-t", "-A", "-f", path], { env });
  }
  function merge(body, { fresh = true } = {}) {
    const literal = JSON.stringify(body).replace(/'/g, "''");
    const reset = fresh ? `delete from public.user_data where user_id = '${UID}';` : "";
    const queried = sqlText(`
      ${reset}
      with auth as (
        select set_config('request.jwt.claim.sub', '${UID}', false) as uid
      )
      select (public.merge_user_data('${literal}'::jsonb)->'dailyRoutines'->'logs'->0)::text
      from auth;
    `);
    assert.equal(queried.status, 0, queried.stderr);
    return JSON.parse(queried.stdout.trim());
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started = true;

    const stub = sqlText(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      insert into auth.users (id) values ('${UID}') on conflict do nothing;
      create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create schema if not exists storage;
      create table if not exists storage.buckets (
        id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
      );
      create table if not exists storage.objects (
        id uuid primary key default gen_random_uuid(), bucket_id text, name text
      );
      create or replace function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      end
      $roles$;
    `);
    assert.equal(stub.status, 0, stub.stderr);

    const migrations = join(ROOT, "supabase/migrations");
    const names = [
      "20261001000000_lift_log.sql",
      "20261001100000_progress_photos.sql",
      "20261002000000_food_ai_usage.sql",
      "20261003120000_privacy_delete.sql",
      "20261004120000_ai_quota.sql",
      "20261004180000_merge_user_data.sql",
      "20261004210000_merge_home_v2.sql",
      "20261004220000_privacy_no_storage_sql_delete.sql",
      "20261005000000_home_v2_brief_rank.sql",
      "20261006120000_progress_photos_path_owner.sql",
      "20261012120000_social_schema.sql",
      "20261027190000_pwa_import.sql",
      "20261029120000_ai_quota_workout_summary.sql",
      "20261119234500_merge_daily_routines.sql",
    ];
    for (const name of names) {
      const applied = sqlFile(join(migrations, name));
      assert.equal(applied.status, 0, name + "\n" + applied.stderr);
    }

    const lost = merge(payload(undoneLog(5000)));
    assert.deepEqual(Object.keys(lost).sort(), KEYS);
    assert.equal(lost.amount, undefined);
    assert.equal(lost.note, undefined);

    const forward = sqlFile(FIX);
    assert.equal(forward.status, 0, forward.stderr);

    const kept = merge(payload(undoneLog(5000)));
    assert.equal(kept.amount, 250);
    assert.equal(kept.unit, "mcg");
    assert.equal(kept.note, "extra dose note");
    assert.equal(kept.undone, true);
    assert.equal(kept.deletedAt, 5000);

    const plain = { ...undoneLog(5000) };
    delete plain.undone;
    const reduced = merge(payload(plain));
    assert.deepEqual(Object.keys(reduced).sort(), KEYS);

    const early = merge(payload(undoneLog(2000)));
    assert.deepEqual(Object.keys(early).sort(), KEYS);
    assert.equal(early.deletedAt, 2000);

    const live = { ...undoneLog(5000), deletedAt: null };
    delete live.undone;
    const stayed = merge(payload(live));
    assert.equal(stayed.amount, 250);
    assert.equal(stayed.deletedAt, null);

    const marker = { id: LOG_ID, day: "2026-11-01", status: "done", updatedAt: 5000, deletedAt: 5000 };
    merge(payload(marker));
    const repaired = merge(payload(undoneLog(5000)), { fresh: false });
    assert.equal(repaired.amount, 250);
    assert.equal(repaired.unit, "mcg");
    assert.equal(repaired.note, "extra dose note");
    assert.equal(repaired.undone, true);

    const local = payload(undoneLog(5000)).dailyRoutines;
    const remote = { ...local, logs: [kept] };
    const merged = mergeDailyRoutines(local, remote, 8_000_000);
    const state = {
      sessions: [],
      purges: payload(undoneLog(5000)).purges,
      dailyRoutines: merged,
    };
    applyPurges(state, 8_000_000);
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: UID } };
    app.sb = null;
    app.cloudPullOk = true;
    app.save = () => {};
    app.today = () => "2026-11-21";
    app.routineNow = () => new Date(2026, 10, 21, 9, 0, 0);
    app.state = state;
    assert.equal(restoreRoutineLog(app.state, LOG_ID), true);
    const restored = app.state.dailyRoutines.logs.find((row) => row.id === LOG_ID);
    assert.equal(isLive(restored), true);
    assert.equal(restored.amount, 250);
    assert.equal(restored.unit, "mcg");
    assert.equal(restored.note, "extra dose note");
  } finally {
    if (started) run(pgCtl, ["-D", dir, "-m", "immediate", "-w", "stop"]);
    rmSync(dir, { recursive: true, force: true });
    app.ROUTINES_ENABLED = false;
    app.session = null;
  }
});
