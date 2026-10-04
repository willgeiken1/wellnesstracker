import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url);
const OLD_SQL = new URL("../supabase/migrations/20261003120000_privacy_delete.sql", import.meta.url);
const NEW_SQL = new URL("../supabase/migrations/20261004220000_privacy_no_storage_sql_delete.sql", import.meta.url);

function pgBin(name) {
  const candidates = [
    process.env.PG_BIN && join(process.env.PG_BIN, name),
    "/usr/lib/postgresql/16/bin/" + name,
    "/usr/lib/postgresql/17/bin/" + name,
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
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
  const r = spawnSync(bin, args, { encoding: "utf8", ...opts });
  if (r.error) throw r.error;
  return r;
}

test("delete and range SQL functions run with the storage delete trigger", { timeout: 120_000 }, async () => {
  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required to run the storage-trigger test");

  const migration = await import("node:fs").then((fs) => fs.readFileSync(NEW_SQL, "utf8"));
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  assert.match(migration, /create or replace function public\.delete_user_rows/i);
  assert.match(migration, /create or replace function public\.purge_user_range_rows/i);
  assert.match(migration, /'progress_photos'/);

  const dir = mkdtempSync(join(tmpdir(), "insight-pg-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const started = { ok: false };

  function sql(text, extra = []) {
    return run(psql, [...base, ...extra, "-c", text], { env: { ...process.env, PGUSER: user } });
  }
  function sqlFile(url) {
    return run(psql, [...base, "-f", filePath(url)], { env: { ...process.env, PGUSER: user } });
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started.ok = true;

    const setup = sql(`
      create schema if not exists storage;
      create table storage.objects (
        id bigint generated always as identity primary key,
        bucket_id text,
        name text
      );
      create or replace function storage.protect_delete()
      returns trigger
      language plpgsql
      as $fn$
      begin
        if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
          raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            using hint = 'This prevents accidental data loss from orphaned objects.',
                  errcode = '42501';
        end if;
        return null;
      end;
      $fn$;
      create trigger protect_objects_delete
        before delete on storage.objects
        for each statement
        execute function storage.protect_delete();

      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      as $fn$
        select coalesce(string_to_array(name, '/'), '{}'::text[]);
      $fn$;

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
      create table public.oura_days (
        user_id uuid not null,
        day date not null,
        data jsonb not null,
        primary key (user_id, day)
      );
      create table public.progress_photos (
        id text primary key,
        user_id uuid not null,
        day date not null,
        path text not null
      );
      create table public.ai_usage (
        user_id uuid not null,
        day date not null,
        count integer not null default 0,
        primary key (user_id, day)
      );
      create table public.oura_tokens (
        user_id uuid primary key,
        access_token text not null
      );
    `);
    assert.equal(setup.status, 0, setup.stderr);

    const blocked = sql("delete from storage.objects where false;");
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Direct deletion from storage tables is not allowed/);

    const oldFns = sqlFile(OLD_SQL);
    assert.equal(oldFns.status, 0, oldFns.stderr);

    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const seed = sql(`
      insert into public.user_data (user_id, data) values ('${userA}', '{"sessions":[]}');
      insert into public.user_data (user_id, data) values ('${userB}', '{"sessions":[]}');
      insert into public.oura_days (user_id, day, data) values
        ('${userB}', '2026-09-01', '{"readiness":1}'),
        ('${userB}', '2026-10-04', '{"readiness":2}');
      insert into public.progress_photos (id, user_id, day, path) values
        ('in', '${userB}', '2026-09-15', '${userB}/in.jpg'),
        ('out', '${userB}', '2026-10-04', '${userB}/out.jpg');
      insert into public.ai_usage (user_id, day, count) values ('${userB}', '2026-09-15', 3);
      insert into public.oura_tokens (user_id, access_token) values ('${userB}', 'secret');
      insert into storage.objects (bucket_id, name) values ('progress', '${userB}/in.jpg');
    `);
    assert.equal(seed.status, 0, seed.stderr);

    const oldDelete = sql(`select public.delete_user_rows('${userA}');`);
    assert.notEqual(oldDelete.status, 0);
    assert.match(oldDelete.stderr, /Direct deletion from storage tables is not allowed/);
    assert.equal(scalar(sql, "select count(*) from public.user_data where user_id = '" + userA + "'"), "1");

    const oldPurge = sql(`select public.purge_user_range_rows('${userB}', '2026-09-01', '2026-09-30');`);
    assert.notEqual(oldPurge.status, 0);
    assert.match(oldPurge.stderr, /Direct deletion from storage tables is not allowed/);
    assert.equal(scalar(sql, "select count(*) from public.oura_days where user_id = '" + userB + "'"), "2");
    assert.equal(scalar(sql, "select count(*) from storage.objects"), "1");

    const upgraded = sqlFile(NEW_SQL);
    assert.equal(upgraded.status, 0, upgraded.stderr);
    const again = sqlFile(NEW_SQL);
    assert.equal(again.status, 0, again.stderr);

    const purged = sql(`select public.purge_user_range_rows('${userB}', '2026-09-01', '2026-09-30');`);
    assert.equal(purged.status, 0, purged.stderr);
    assert.equal(scalar(sql, "select count(*) from public.oura_days where user_id = '" + userB + "' and day = '2026-09-01'"), "0");
    assert.equal(scalar(sql, "select count(*) from public.oura_days where user_id = '" + userB + "' and day = '2026-10-04'"), "1");
    assert.equal(scalar(sql, "select count(*) from public.progress_photos where id = 'in'"), "1");
    assert.equal(scalar(sql, "select count(*) from public.progress_photos where id = 'out'"), "1");
    assert.equal(scalar(sql, "select count(*) from public.ai_usage where user_id = '" + userB + "'"), "1");
    assert.equal(scalar(sql, "select count(*) from public.user_data where user_id = '" + userB + "'"), "1");
    assert.equal(scalar(sql, "select count(*) from public.oura_tokens where user_id = '" + userB + "'"), "1");
    assert.equal(scalar(sql, "select count(*) from storage.objects"), "1");

    const empty = sql(`select public.purge_user_range_rows('${userA}', '2026-01-01', '2026-01-02');`);
    assert.equal(empty.status, 0, empty.stderr);

    const removed = sql(`select public.delete_user_rows('${userA}'); select public.delete_user_rows('${userB}');`);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(scalar(sql, "select count(*) from public.user_data"), "0");
    assert.equal(scalar(sql, "select count(*) from public.oura_days"), "0");
    assert.equal(scalar(sql, "select count(*) from public.progress_photos"), "0");
    assert.equal(scalar(sql, "select count(*) from public.ai_usage"), "0");
    assert.equal(scalar(sql, "select count(*) from public.oura_tokens"), "0");
    assert.equal(scalar(sql, "select count(*) from storage.objects"), "1");
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});

function filePath(url) {
  return new URL(url).pathname;
}

function scalar(sql, text) {
  const r = sql(text, ["-t", "-A"]);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
