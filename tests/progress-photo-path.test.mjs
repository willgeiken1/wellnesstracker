import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const MIGRATION = new URL("../supabase/migrations/20261006120000_progress_photos_path_owner.sql", import.meta.url);
const SELF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

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

test("progress photo paths stay inside the owner's folder", { timeout: 120_000 }, async () => {
  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required to run the photo-path test");

  const migration = readFileSync(MIGRATION, "utf8");
  assert.match(migration, /progress_photos_path_owner/);
  assert.match(migration, /path ~ \('\^' \|\| user_id::text \|\| '\/\[\^\/\\\\\]\+\$'\)/);
  assert.match(migration, /split_part\(path, '\/', 2\) not in \('\.', '\.\.'\)/);
  assert.match(migration, /own photos: insert/);
  assert.match(migration, /own photos: update/);
  assert.doesNotMatch(migration, /update\s+public\.progress_photos/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.progress_photos/i);

  const dir = mkdtempSync(join(tmpdir(), "insight-photo-path-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const started = { ok: false };

  function sql(text, extra = []) {
    return run(psql, [...base, ...extra, "-c", text], { env: { ...process.env, PGUSER: user } });
  }
  function sqlFile(url) {
    return run(psql, [...base, "-f", new URL(url).pathname], { env: { ...process.env, PGUSER: user } });
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started.ok = true;

    const setup = sql(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid
      language sql stable
      as $fn$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $fn$;

      create table public.progress_photos (
        id text primary key,
        user_id uuid not null,
        day date not null,
        pose text,
        path text not null,
        taken_at timestamptz not null default now()
      );
      alter table public.progress_photos enable row level security;
      create policy "own photos: read" on public.progress_photos
        for select using (auth.uid() = user_id);
      create policy "own photos: insert" on public.progress_photos
        for insert with check (auth.uid() = user_id);
      create policy "own photos: update" on public.progress_photos
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'photo_user') then
          create role photo_user nologin;
        end if;
      end
      $roles$;
      grant usage on schema public to photo_user;
      grant select, insert, update on public.progress_photos to photo_user;
    `);
    assert.equal(setup.status, 0, setup.stderr);

    const applied = sqlFile(MIGRATION);
    assert.equal(applied.status, 0, applied.stderr);

    const own = sql(`
      insert into public.progress_photos (id, user_id, day, path)
      values ('ok', '${SELF}', '2026-10-01', '${SELF}/a.jpg');
    `);
    assert.equal(own.status, 0, own.stderr);

    const foreignInsert = sql(`
      insert into public.progress_photos (id, user_id, day, path)
      values ('bad', '${SELF}', '2026-10-01', '${OTHER}/secret.jpg');
    `);
    assert.notEqual(foreignInsert.status, 0);
    assert.match(foreignInsert.stderr, /progress_photos_path_owner/);

    const foreignUpdate = sql(`
      update public.progress_photos
      set path = '${OTHER}/secret.jpg'
      where id = 'ok';
    `);
    assert.notEqual(foreignUpdate.status, 0);
    assert.match(foreignUpdate.stderr, /progress_photos_path_owner/);

    const rename = sql(`
      update public.progress_photos
      set path = '${SELF}/b.jpg'
      where id = 'ok';
    `);
    assert.equal(rename.status, 0, rename.stderr);
    assert.equal(scalar(sql, "select path from public.progress_photos where id = 'ok'"), `${SELF}/b.jpg`);

    const again = sqlFile(MIGRATION);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(scalar(sql, "select path from public.progress_photos where id = 'ok'"), `${SELF}/b.jpg`);
    assert.equal(scalar(sql, "select count(*) from public.progress_photos"), "1");

    const insertCheck = scalar(sql, `
      select pg_get_expr(polwithcheck, polrelid)
      from pg_policy
      where polrelid = 'public.progress_photos'::regclass
        and polname = 'own photos: insert'
    `);
    assert.match(insertCheck, /auth\.uid\(\) = user_id/);
    assert.match(insertCheck, /user_id/);
    assert.match(insertCheck, /\[\^\/\\\\\]\+/);
    assert.match(insertCheck, /split_part|'\.'|'\.\.'/);

    const asOwner = sql(`
      select set_config('request.jwt.claim.sub', '${SELF}', false);
      set role photo_user;
      insert into public.progress_photos (id, user_id, day, path)
      values ('rls-ok', '${SELF}', '2026-10-02', '${SELF}/rls.jpg');
    `);
    assert.equal(asOwner.status, 0, asOwner.stderr);

    const asOther = sql(`
      select set_config('request.jwt.claim.sub', '${SELF}', false);
      set role photo_user;
      insert into public.progress_photos (id, user_id, day, path)
      values ('rls-bad', '${OTHER}', '2026-10-02', '${OTHER}/secret.jpg');
    `);
    assert.notEqual(asOther.status, 0);
    assert.match(asOther.stderr, /row-level security policy/);

    const asOtherUpdate = sql(`
      select set_config('request.jwt.claim.sub', '${SELF}', false);
      set role photo_user;
      update public.progress_photos
      set path = '${OTHER}/secret.jpg'
      where id = 'ok';
    `);
    assert.notEqual(asOtherUpdate.status, 0);
    assert.match(asOtherUpdate.stderr, /progress_photos_path_owner|row-level security policy/);
    assert.equal(scalar(sql, "select path from public.progress_photos where id = 'ok'"), `${SELF}/b.jpg`);
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});

function scalar(sql, text) {
  const r = sql(text, ["-t", "-A"]);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
