import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const MIGRATION = new URL("../supabase/migrations/20261012120000_social_schema.sql", import.meta.url);
const EDGE = new URL("../supabase/functions/delete-account/index.ts", import.meta.url);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const F = "55555555-5555-4555-8555-555555555555";
const R = "66666666-6666-4666-8666-666666666666";
const E = "77777777-7777-4777-8777-777777777777";

const SHARE = {
  duration: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  volume: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  pr: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  cardio: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  streak: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  goal: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
  rate: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
  finn: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  report1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
  report2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
  report3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13",
  report4: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14",
  report5: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa15",
  report6: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16",
};
const COMMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const COMMENT_ON_FINN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const INVITE = "invite-token-abcdefghijklmnopqrst";

const SOCIAL_TABLES = [
  "social_settings",
  "friend_invites",
  "friendships",
  "shared_items",
  "comments",
  "reactions",
  "reports",
  "blocks",
];

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

test("social schema keeps health data out and purges with the account", () => {
  const migration = readFileSync(MIGRATION, "utf8");
  const edge = readFileSync(EDGE, "utf8");
  assert.doesNotMatch(migration, /auth\.role\s*\(/);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(migration, /from\s+public\.oura_days/i);
  assert.doesNotMatch(migration, /from\s+public\.user_data/i);
  assert.doesNotMatch(migration, /from\s+public\.progress_photos/i);
  assert.doesNotMatch(migration, /\bjsonb\b/i);
  for (const table of SOCIAL_TABLES) assert.match(migration, new RegExp(`public\\.${table}\\b`));
  assert.match(migration, /comment rate limit/);
  assert.match(migration, /with check/i);

  const known = edge.match(/const KNOWN = \[([\s\S]*?)\];/);
  assert.ok(known, "KNOWN table list");
  const tables = [...known[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  for (const table of SOCIAL_TABLES) assert.ok(tables.includes(table), table);
  assert.match(edge, /friendships:\s*\["requester_id", "addressee_id"\]/);
  assert.match(edge, /friend_invites:\s*\["owner_id"\]/);
  assert.match(edge, /shared_items:\s*\["owner_id"\]/);
  assert.match(edge, /comments:\s*\["author_id"\]/);
  assert.match(edge, /reports:\s*\["reporter_id"\]/);
  assert.match(edge, /blocks:\s*\["blocker_id", "blocked_id"\]/);
  assert.match(edge, /OWNED_BY\[table\] \?\? \["user_id"\]/);
});

test("two accounts cannot read, forge, or bypass a block on the social feed", { timeout: 180_000 }, async () => {
  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required to run the social RLS test");

  const dir = mkdtempSync(join(tmpdir(), "insight-social-"));
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
  function scalar(text) {
    const r = sql(text, ["-t", "-A"]);
    assert.equal(r.status, 0, r.stderr + "\n" + text);
    return r.stdout.trim();
  }
  function asUser(uid, statement, extra = []) {
    return sql(`
      select set_config('request.jwt.claim.sub', '${uid}', false);
      set role authenticated;
      ${statement}
    `, extra);
  }
  function asScalar(uid, statement) {
    const r = asUser(uid, statement, ["-t", "-A"]);
    assert.equal(r.status, 0, r.stderr + "\n" + statement);
    const lines = r.stdout.trim().split(/\n/).map((line) => line.trim()).filter(Boolean);
    return lines[lines.length - 1];
  }
  function asCount(uid, fromWhere) {
    const value = asScalar(uid, `select count(*)::text from ${fromWhere}`);
    assert.match(value, /^\d+$/, value + " from " + fromWhere);
    return value;
  }
  function expectDenied(uid, statement, pattern) {
    const r = asUser(uid, statement);
    assert.notEqual(r.status, 0, r.stdout + "\n" + statement);
    assert.match(r.stderr, pattern);
  }
  function expectOk(uid, statement) {
    const r = asUser(uid, statement);
    assert.equal(r.status, 0, r.stderr + "\n" + statement);
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started.ok = true;

    const setup = sql(`
      create schema if not exists auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
      language sql stable
      as $fn$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $fn$;
      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      end
      $roles$;
      grant usage on schema public to anon, authenticated, service_role;
    `);
    assert.equal(setup.status, 0, setup.stderr);

    const applied = sqlFile(MIGRATION);
    assert.equal(applied.status, 0, applied.stderr);
    const again = sqlFile(MIGRATION);
    assert.equal(again.status, 0, again.stderr);

    const tableList = SOCIAL_TABLES.map((name) => `'${name}'`).join(", ");
    assert.equal(scalar(`
      select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname in (${tableList})
        and c.relrowsecurity
    `), "8");
    assert.equal(scalar(`
      select count(*) from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${tableList})
    `), "29");
    assert.equal(scalar(`
      select count(*) from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${tableList})
        and (
          p.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
          or (
            p.polcmd in ('a', 'w', '*')
            and (
              p.polwithcheck is null
              or pg_get_expr(p.polwithcheck, p.polrelid) not like '%auth.uid()%'
            )
          )
          or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%auth.role()%'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%auth.role()%'
        )
    `), "0");
    assert.equal(scalar(`
      select string_agg(column_name, ',' order by column_name)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'shared_items'
    `), [
      "cardio_distance_meters",
      "cardio_duration_seconds",
      "created_at",
      "goal_percent",
      "id",
      "kind",
      "occurred_on",
      "owner_id",
      "pr_exercise",
      "pr_flag",
      "streak_days",
      "total_volume",
      "unshared_at",
      "workout_duration_seconds",
    ].join(","));
    assert.equal(scalar(`
      select count(*) from information_schema.columns
      where table_schema = 'public' and table_name in (${tableList})
        and (
          data_type = 'jsonb'
          or column_name in (
            'weight', 'body_weight', 'set_weight', 'reps', 'sets', 'set_count',
            'oura', 'photo', 'photo_path', 'image', 'food', 'meal', 'kcal', 'calories',
            'sleep', 'hrv', 'readiness', 'load', 'barcode'
          )
        )
    `), "0");
    assert.equal(scalar(`
      select count(*) from pg_constraint fk
      join pg_class src on src.oid = fk.conrelid
      join pg_namespace sn on sn.oid = src.relnamespace
      join pg_class dst on dst.oid = fk.confrelid
      where fk.contype = 'f' and sn.nspname = 'public'
        and src.relname in (${tableList})
        and dst.relname in ('oura_days', 'user_data', 'progress_photos', 'ai_usage')
    `), "0");
    assert.equal(scalar(`select has_function_privilege('anon', 'private.is_friend(uuid,uuid)', 'execute')`), "f");
    assert.equal(scalar(`select has_function_privilege('anon', 'public.request_friend(text)', 'execute')`), "f");
    assert.equal(scalar(`select has_function_privilege('authenticated', 'private.is_friend(uuid,uuid)', 'execute')`), "t");
    assert.equal(scalar(`select has_table_privilege('anon', 'public.shared_items', 'SELECT')`), "f");

    const seed = sql(`
      insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${F}'), ('${R}'), ('${E}');
      insert into public.social_settings (user_id, enabled, username) values
        ('${A}', true, 'alice'),
        ('${B}', true, 'blake'),
        ('${C}', true, 'casey'),
        ('${D}', true, 'dana'),
        ('${F}', true, 'finn'),
        ('${R}', true, 'rory'),
        ('${E}', false, null);
      insert into public.friendships (requester_id, addressee_id, status) values
        ('${A}', '${B}', 'accepted'),
        ('${A}', '${D}', 'accepted'),
        ('${A}', '${F}', 'accepted'),
        ('${A}', '${R}', 'accepted');
      insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${D}');
      insert into public.shared_items (id, owner_id, kind, workout_duration_seconds, occurred_on) values
        ('${SHARE.duration}', '${A}', 'workout_duration', 1800, '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, total_volume, occurred_on) values
        ('${SHARE.volume}', '${A}', 'total_volume', 12500, '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, pr_flag, pr_exercise, occurred_on) values
        ('${SHARE.pr}', '${A}', 'pr_flag', true, 'Bench', '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, cardio_distance_meters, cardio_duration_seconds, occurred_on) values
        ('${SHARE.cardio}', '${A}', 'cardio', 5000, 1500, '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, streak_days, occurred_on) values
        ('${SHARE.streak}', '${A}', 'streak', 12, '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, goal_percent, occurred_on) values
        ('${SHARE.goal}', '${A}', 'goal_percent', 80, '2026-10-01');
      insert into public.shared_items (id, owner_id, kind, workout_duration_seconds) values
        ('${SHARE.rate}', '${A}', 'workout_duration', 60),
        ('${SHARE.report1}', '${A}', 'workout_duration', 61),
        ('${SHARE.report2}', '${A}', 'workout_duration', 62),
        ('${SHARE.report3}', '${A}', 'workout_duration', 63),
        ('${SHARE.report4}', '${A}', 'workout_duration', 64),
        ('${SHARE.report5}', '${A}', 'workout_duration', 65),
        ('${SHARE.report6}', '${A}', 'workout_duration', 66);
      insert into public.shared_items (id, owner_id, kind, streak_days) values
        ('${SHARE.finn}', '${F}', 'streak', 3);
      insert into public.comments (id, shared_item_id, author_id, body) values
        ('${COMMENT}', '${SHARE.duration}', '${B}', 'nice session'),
        ('${COMMENT_ON_FINN}', '${SHARE.finn}', '${A}', 'keep the streak');
    `);
    assert.equal(seed.status, 0, seed.stderr);
    const reapplied = sqlFile(MIGRATION);
    assert.equal(reapplied.status, 0, reapplied.stderr);
    assert.equal(scalar(`select count(*) from public.shared_items where owner_id = '${A}'`), "13");
    assert.equal(scalar(`select pr_exercise from public.shared_items where id = '${SHARE.pr}'`), "Bench");
    assert.equal(scalar(`select total_volume is null from public.shared_items where id = '${SHARE.pr}'`), "t");

    assert.equal(asCount(B, `public.shared_items where owner_id = '${A}'`), "13");
    assert.equal(asScalar(B, `select pr_exercise from public.shared_items where id = '${SHARE.pr}'`), "Bench");
    assert.equal(asCount(A, `public.shared_items where owner_id = '${A}'`), "13");
    assert.equal(asCount(C, `public.shared_items`), "0");
    assert.equal(asCount(D, `public.shared_items`), "0");
    assert.equal(asCount(C, `public.comments`), "0");
    assert.equal(asCount(D, `public.comments`), "0");
    assert.equal(asCount(B, `public.comments where id = '${COMMENT}'`), "1");
    assert.equal(asCount(C, `public.social_settings where username = 'alice'`), "0");
    assert.equal(asCount(C, `public.friendships`), "0");
    assert.equal(asCount(D, `public.blocks`), "0");
    assert.equal(asCount(A, `public.blocks`), "1");
    assert.equal(asScalar(B, `select private.is_friend('${A}'::uuid, '${B}'::uuid)`), "t");
    assert.equal(asScalar(C, `select private.is_friend('${A}'::uuid, '${B}'::uuid)`), "f");
    assert.equal(asScalar(D, `select private.is_blocked('${A}'::uuid, '${D}'::uuid)`), "t");

    const anon = sql(`set role anon; select count(*) from public.shared_items;`);
    assert.notEqual(anon.status, 0);
    assert.match(anon.stderr, /permission denied/);

    expectDenied(C, `
      insert into public.shared_items (owner_id, kind, workout_duration_seconds)
      values ('${A}', 'workout_duration', 10);
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.shared_items (owner_id, kind, workout_duration_seconds)
      values ('${C}', 'oura', 10);
    `, /shared_items_kind_check|shared_items_snapshot_shape/);
    expectDenied(A, `
      insert into public.shared_items (owner_id, kind, pr_flag, pr_exercise, total_volume)
      values ('${A}', 'pr_flag', true, 'Bench', 100);
    `, /shared_items_snapshot_shape/);
    expectDenied(C, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.duration}', '${B}', 'forged');
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.duration}', '${C}', 'hello');
    `, /row-level security policy/);
    expectDenied(A, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.duration}', '${A}', 'mine');
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.friendships (requester_id, addressee_id, status)
      values ('${A}', '${C}', 'accepted');
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.friendships (requester_id, addressee_id, status)
      values ('${C}', '${A}', 'accepted');
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}');
    `, /row-level security policy/);
    expectDenied(C, `
      insert into public.reactions (shared_item_id, user_id, kind)
      values ('${SHARE.duration}', '${A}', 'like');
    `, /row-level security policy/);
    expectOk(C, `select count(*) from public.shared_items where id = '${SHARE.duration}'`);
    assert.equal(scalar(`select workout_duration_seconds from public.shared_items where id = '${SHARE.duration}'`), "1800");
    expectDenied(A, `
      update public.shared_items set workout_duration_seconds = 1 where id = '${SHARE.duration}';
    `, /shared snapshot is immutable/);
    assert.equal(scalar(`select workout_duration_seconds from public.shared_items where id = '${SHARE.duration}'`), "1800");
    expectOk(B, `
      with upd as (
        update public.shared_items set workout_duration_seconds = 9 where id = '${SHARE.duration}' returning 1
      ) select count(*) from upd;
    `);
    assert.equal(scalar(`select workout_duration_seconds from public.shared_items where id = '${SHARE.duration}'`), "1800");

    expectOk(C, `
      insert into public.friendships (requester_id, addressee_id, status)
      values ('${C}', '${F}', 'pending');
    `);
    assert.equal(scalar(`
      select status from public.friendships
      where requester_id = '${C}' and addressee_id = '${F}'
    `), "pending");
    expectOk(C, `
      with upd as (
        update public.friendships set status = 'accepted'
        where requester_id = '${C}' and addressee_id = '${F}' returning 1
      ) select count(*) from upd;
    `);
    assert.equal(scalar(`
      select status from public.friendships
      where requester_id = '${C}' and addressee_id = '${F}'
    `), "pending");
    expectDenied(F, `
      update public.friendships
      set requester_id = '${A}', status = 'accepted'
      where requester_id = '${C}' and addressee_id = '${F}';
    `, /friendship parties are fixed/);
    expectOk(F, `
      update public.friendships set status = 'accepted'
      where requester_id = '${C}' and addressee_id = '${F}';
    `);
    assert.equal(scalar(`
      select status from public.friendships
      where requester_id = '${C}' and addressee_id = '${F}'
    `), "accepted");
    expectOk(C, `
      delete from public.friendships where requester_id = '${C}' and addressee_id = '${F}';
    `);
    assert.equal(asCount(C, "public.shared_items"), "0");

    expectOk(B, `
      update public.comments set body = 'edited' where id = '${COMMENT}';
    `);
    assert.equal(scalar(`select body from public.comments where id = '${COMMENT}'`), "edited");
    expectDenied(B, `
      update public.comments set author_id = '${F}' where id = '${COMMENT}';
    `, /comment identity is fixed/);
    expectOk(F, `
      with upd as (
        update public.comments set body = 'nope' where id = '${COMMENT}' returning 1
      ) select count(*) from upd;
    `);
    assert.equal(scalar(`select body from public.comments where id = '${COMMENT}'`), "edited");
    expectOk(F, `
      with del as (
        delete from public.comments where id = '${COMMENT}' returning 1
      ) select count(*) from del;
    `);
    assert.equal(scalar(`select count(*) from public.comments where id = '${COMMENT}'`), "1");
    expectOk(A, `delete from public.comments where id = '${COMMENT}';`);
    assert.equal(scalar(`select count(*) from public.comments where id = '${COMMENT}'`), "0");
    expectOk(B, `
      insert into public.comments (id, shared_item_id, author_id, body)
      values ('${COMMENT}', '${SHARE.duration}', '${B}', 'back');
    `);

    expectOk(B, `
      insert into public.reactions (shared_item_id, user_id, kind)
      values ('${SHARE.duration}', '${B}', 'cheer');
    `);
    assert.equal(asCount(F, `public.reactions where shared_item_id = '${SHARE.duration}'`), "1");
    expectOk(B, `
      insert into public.blocks (blocker_id, blocked_id) values ('${B}', '${F}');
    `);
    assert.equal(asCount(B, `public.reactions where user_id = '${F}'`), "0");
    assert.equal(asCount(F, `public.comments where author_id = '${B}'`), "0");
    assert.equal(asCount(B, `public.shared_items where owner_id = '${A}'`), "13");
    expectOk(B, `
      delete from public.blocks where blocker_id = '${B}' and blocked_id = '${F}';
    `);
    assert.equal(asCount(F, `public.comments where id = '${COMMENT}'`), "1");

    expectOk(B, `
      insert into public.blocks (blocker_id, blocked_id) values ('${B}', '${A}');
    `);
    assert.equal(asCount(B, "public.shared_items"), "0");
    expectDenied(B, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.streak}', '${B}', 'blocked');
    `, /row-level security policy/);
    expectOk(B, `delete from public.blocks where blocker_id = '${B}' and blocked_id = '${A}';`);
    assert.equal(asCount(B, `public.shared_items where id = '${SHARE.duration}'`), "1");

    expectOk(A, `update public.social_settings set enabled = false where user_id = '${A}';`);
    assert.equal(asCount(B, `public.shared_items where owner_id = '${A}'`), "0");
    assert.equal(asCount(A, `public.shared_items where owner_id = '${A}'`), "13");
    expectDenied(A, `
      insert into public.shared_items (owner_id, kind, workout_duration_seconds)
      values ('${A}', 'workout_duration', 15);
    `, /row-level security policy/);
    expectOk(A, `update public.social_settings set enabled = true where user_id = '${A}';`);
    assert.equal(asCount(B, `public.shared_items where owner_id = '${A}'`), "13");

    const cleared = sql(`delete from public.social_settings where user_id = '${E}';`);
    assert.equal(cleared.status, 0, cleared.stderr);
    expectOk(E, `
      insert into public.social_settings (user_id) values ('${E}');
    `);
    assert.equal(scalar(`select enabled from public.social_settings where user_id = '${E}'`), "f");
    expectDenied(E, `
      insert into public.shared_items (owner_id, kind, streak_days) values ('${E}', 'streak', 1);
    `, /row-level security policy/);
    expectDenied(E, `select public.request_friend('blake')`, /social is off/);
    expectOk(E, `update public.social_settings set enabled = true where user_id = '${E}';`);
    expectOk(E, `
      insert into public.shared_items (owner_id, kind, streak_days) values ('${E}', 'streak', 1);
    `);
    assert.equal(asCount(B, `public.shared_items where owner_id = '${E}'`), "0");

    expectOk(A, `
      update public.shared_items set unshared_at = clock_timestamp() where id = '${SHARE.goal}';
    `);
    assert.equal(asCount(B, `public.shared_items where id = '${SHARE.goal}'`), "0");
    assert.equal(asCount(A, `public.shared_items where id = '${SHARE.goal}'`), "1");

    expectOk(B, `
      insert into public.reports (reporter_id, shared_item_id, reason)
      values ('${B}', '${SHARE.report1}', 'spam');
    `);
    assert.equal(asCount(B, `public.shared_items where id = '${SHARE.report1}'`), "0");
    assert.equal(asCount(F, `public.shared_items where id = '${SHARE.report1}'`), "1");
    assert.equal(asCount(A, `public.reports`), "0");
    expectOk(B, `
      insert into public.reports (reporter_id, shared_item_id, reason) values
        ('${B}', '${SHARE.report2}', 'spam'),
        ('${B}', '${SHARE.report3}', 'spam'),
        ('${B}', '${SHARE.report4}', 'spam'),
        ('${B}', '${SHARE.report5}', 'spam');
    `);
    expectDenied(B, `
      insert into public.reports (reporter_id, shared_item_id, reason)
      values ('${B}', '${SHARE.report6}', 'spam');
    `, /report rate limit/);
    assert.equal(asCount(F, `public.shared_items where id = '${SHARE.report6}'`), "1");
    expectDenied(C, `
      insert into public.reports (reporter_id, shared_item_id, reason)
      values ('${C}', '${SHARE.duration}', 'nope');
    `, /row-level security policy/);

    expectOk(R, `
      insert into public.comments (shared_item_id, author_id, body)
      select '${SHARE.rate}', '${R}', 'n' || g from generate_series(1, 30) g;
    `);
    assert.equal(scalar(`select count(*) from public.comments where author_id = '${R}'`), "30");
    expectDenied(R, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.rate}', '${R}', 'one more');
    `, /comment rate limit/);
    assert.equal(scalar(`select count(*) from public.comments where author_id = '${R}'`), "30");
    expectDenied(R, `
      update public.comments set created_at = clock_timestamp() - interval '2 hours'
      where author_id = '${R}';
    `, /comment identity is fixed/);
    const backdated = sql(`
      update public.comments
      set created_at = clock_timestamp() - interval '2 hours'
      where author_id = '${R}';
    `);
    assert.equal(backdated.status, 0, backdated.stderr);
    expectOk(R, `
      insert into public.comments (shared_item_id, author_id, body)
      values ('${SHARE.rate}', '${R}', 'after the hour');
    `);
    assert.equal(scalar(`select count(*) from public.comments where author_id = '${R}'`), "31");

    const requested = asScalar(C, `select public.request_friend('finn')`);
    assert.match(requested, /^[0-9a-f-]{36}$/);
    assert.equal(scalar(`select status from public.friendships where id = '${requested}'`), "pending");
    assert.equal(scalar(`select requester_id::text || ':' || addressee_id::text from public.friendships where id = '${requested}'`), `${C}:${F}`);
    expectDenied(D, `select public.request_friend('alice')`, /unknown username/);
    expectDenied(C, `select public.request_friend('nobody_here')`, /unknown username/);
    expectOk(A, `delete from public.friendships where id = '${requested}';`);

    expectOk(A, `
      insert into public.friend_invites (token, owner_id, expires_at)
      values ('${INVITE}', '${A}', now() + interval '7 days');
    `);
    assert.equal(asCount(C, `public.friend_invites where token = '${INVITE}'`), "0");
    const redeemed = asScalar(C, `select public.redeem_friend_invite('${INVITE}')`);
    assert.match(redeemed, /^[0-9a-f-]{36}$/);
    assert.equal(scalar(`select status from public.friendships where id = '${redeemed}'`), "pending");
    assert.equal(scalar(`select requester_id = '${C}' and addressee_id = '${A}' from public.friendships where id = '${redeemed}'`), "t");
    expectOk(A, `delete from public.friendships where id = '${redeemed}';`);
    expectOk(A, `update public.friend_invites set revoked_at = clock_timestamp() where token = '${INVITE}';`);
    expectDenied(C, `select public.redeem_friend_invite('${INVITE}')`, /unknown invite/);

    const health = sql(`
      create table public.user_data (
        user_id uuid primary key,
        data jsonb not null default '{}'::jsonb
      );
      create table public.oura_days (
        user_id uuid not null,
        day date not null,
        data jsonb not null,
        primary key (user_id, day)
      );
      alter table public.oura_days enable row level security;
      create policy "own days: read" on public.oura_days
        for select to authenticated using (user_id = (select auth.uid()));
      grant select on public.oura_days to authenticated;
      insert into public.user_data (user_id, data) values
        ('${A}', '{"weight": 180}'::jsonb),
        ('${B}', '{"weight": 170}'::jsonb);
      insert into public.oura_days (user_id, day, data) values
        ('${A}', '2026-10-01', '{"readiness": 99, "token": "oura-secret-value"}'::jsonb),
        ('${A}', '2026-10-11', '{"readiness": 70}'::jsonb),
        ('${B}', '2026-10-01', '{"readiness": 10}'::jsonb);
    `);
    assert.equal(health.status, 0, health.stderr);
    assert.equal(asCount(B, `public.oura_days where user_id = '${A}'`), "0");
    assert.equal(asCount(A, `public.oura_days where user_id = '${A}'`), "2");
    assert.equal(scalar(`
      select count(*) from public.shared_items
      where coalesce(pr_exercise, '') like '%oura-secret-value%'
         or coalesce(workout_duration_seconds::text, '') = 'oura-secret-value'
    `), "0");

    const purged = sql(`select public.purge_user_range_rows('${A}', '2026-10-01', '2026-10-02');`);
    assert.equal(purged.status, 0, purged.stderr);
    assert.equal(scalar(`select count(*) from public.oura_days where user_id = '${A}' and day = '2026-10-01'`), "0");
    assert.equal(scalar(`select count(*) from public.oura_days where user_id = '${A}' and day = '2026-10-11'`), "1");
    assert.equal(scalar(`select count(*) from public.shared_items where id = '${SHARE.duration}'`), "1");
    assert.equal(scalar(`select count(*) from public.friendships where requester_id = '${A}' or addressee_id = '${A}'`), "4");

    expectOk(B, `
      insert into public.shared_items (owner_id, kind, streak_days) values ('${B}', 'streak', 4);
    `);
    const removed = sql(`select public.delete_user_rows('${A}');`);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(scalar(`select count(*) from public.shared_items where owner_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.comments where author_id = '${A}' or shared_item_id = '${SHARE.finn}'`), "0");
    assert.equal(scalar(`select count(*) from public.shared_items where id = '${SHARE.finn}'`), "1");
    assert.equal(scalar(`select count(*) from public.shared_items where owner_id = '${B}'`), "1");
    assert.equal(scalar(`select count(*) from public.comments where author_id = '${B}' or author_id = '${R}'`), "0");
    assert.equal(scalar(`select count(*) from public.friendships where requester_id = '${A}' or addressee_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.blocks where blocker_id = '${A}' or blocked_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.social_settings where user_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.friend_invites where owner_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.reports where reporter_id = '${B}'`), "0");
    assert.equal(scalar(`select count(*) from public.reactions where shared_item_id = '${SHARE.duration}'`), "0");
    assert.equal(scalar(`select count(*) from public.user_data where user_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.user_data where user_id = '${B}'`), "1");
    assert.equal(scalar(`select count(*) from public.oura_days where user_id = '${A}'`), "0");
    assert.equal(scalar(`select count(*) from public.oura_days where user_id = '${B}'`), "1");
    assert.equal(scalar(`select count(*) from public.social_settings where user_id = '${B}'`), "1");
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});
