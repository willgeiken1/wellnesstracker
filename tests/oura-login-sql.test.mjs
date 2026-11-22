// Oura login changes against a disposable Postgres: the real migrations, the real oura-store functions, made-up
// logins and days only. No Oura calls and no real database. Needs the PostgreSQL server binaries (PG_BIN), and
// initdb refuses to run as root, so run it as an ordinary user.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { DELETING, disconnect, finishRevoked, forgetRevoked, NEWER_LOGIN, RECONNECT, REVOKED, saveLogin } from "../supabase/functions/_shared/oura-store.js";

const BASE_SQL = "supabase/migrations/20261001000000_lift_log.sql";
const MIGRATION = "supabase/migrations/20261122020000_oura_atomic_login.sql";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OLD = "2026-11-16T10:00:00+00:00";
const NOW = "2026-11-19T15:00:00+00:00";
const fresh = { access_token: "made-up-new-access", refresh_token: "made-up-new-refresh", expires_at: "2026-11-20T15:00:00+00:00" };
const ctx = {};

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

const env = (app = "oura-test") => ({ ...process.env, PGUSER: ctx.user, PGTZ: "UTC", PGAPPNAME: app });
const args = (text) => [...ctx.base, "-q", "-t", "-A", "-c", text];

/** Runs SQL and returns its output, or throws with psql's error. */
function sql(text) {
  const r = run(ctx.psql, args(text), { env: env() });
  if (r.status !== 0) throw new Error(r.stderr || "psql failed");
  return r.stdout.trim();
}
/** Runs SQL in its own session without waiting. Resolves with { status, stdout, stderr }. */
function sqlLater(text, app) {
  return new Promise((resolve) => {
    const child = spawn(ctx.psql, args(text), { env: env(app) });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => { stdout += b; });
    child.stderr.on("data", (b) => { stderr += b; });
    child.on("close", (status) => resolve({ status, stdout: stdout.trim(), stderr }));
  });
}
const json = (text) => JSON.parse(sql(text) || "null");
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

/** The few query shapes oura-store sends through supabase-js, run on the disposable database. */
function pgAdmin({ loseAnswer = () => false } = {}) {
  const from = (table) => {
    const where = [];
    const clause = () => (where.length ? ` where ${where.join(" and ")}` : "");
    const chain = {
      eq(k, v) { where.push(`${k} = ${lit(v)}`); return chain; },
      select(cols = "*") { chain.cols = cols; return chain; },
      async maybeSingle() {
        try { return { data: json(`select row_to_json(t) from (select ${chain.cols ?? "*"} from public.${table}${clause()}) t limit 1`), error: null }; }
        catch (e) { return { data: null, error: { message: e.message } }; }
      },
      update(values) {
        const set = Object.entries(values).map(([k, v]) => `${k} = ${lit(v)}`).join(", ");
        const up = {
          eq(k, v) { where.push(`${k} = ${lit(v)}`); return up; },
          then(ok, bad) {
            return (async () => { try { sql(`update public.${table} set ${set}${clause()}`); return { error: null }; } catch (e) { return { error: { message: e.message } }; } })().then(ok, bad);
          },
        };
        return up;
      },
    };
    return chain;
  };
  const calls = [];
  const rpc = async (name, params) => {
    calls.push(name);
    const named = Object.entries(params).map(([k, v]) => `${k} => ${lit(v)}`).join(", ");
    try {
      const data = json(`select to_json(public.${name}(${named}))`);
      if (loseAnswer(name)) return { data: null, error: { message: "made-up lost answer" } };
      return { data, error: null };
    } catch (e) { return { data: null, error: { message: e.message } }; }
  };
  return { from, rpc, calls };
}

const quiet = async (fn) => { const log = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = log; } };

/** Fresh fixture: A has a login, a connection from OLD and three days (one unmarked, one OLD's, one newer). B is a
 * sentinel user with the same shape that nothing here may touch. */
function seed() {
  sql(`
    truncate public.oura_tokens, public.oura_connections, public.oura_days, public.oura_revoke_intents, public.test_faults;
    insert into public.oura_tokens (user_id, access_token, refresh_token, expires_at) values
      ('${A}', 'made-up-access', 'made-up-refresh', '2026-11-17T11:00:00Z'),
      ('${B}', 'made-up-b-access', 'made-up-b-refresh', '2026-11-17T11:00:00Z');
    insert into public.oura_connections (user_id, connected_at, last_sync, last_error) values
      ('${A}', '${OLD}', '2026-11-18T08:00:00Z', 'made-up old message'),
      ('${B}', '${OLD}', '2026-11-18T08:00:00Z', null);
    insert into public.oura_days (user_id, day, data) values
      ('${A}', '2026-11-13', '{"steps":1}'),
      ('${A}', '2026-11-14', '{"steps":2,"conn":"${OLD}"}'),
      ('${B}', '2026-11-14', '{"steps":9,"conn":"${OLD}"}'),
      ('${B}', '2026-11-15', '{"steps":8}');
  `);
}
const snapshot = (user) => json(`select json_build_object(
  'tokens', (select coalesce(json_agg(t order by user_id), '[]') from public.oura_tokens t where user_id = '${user}'),
  'connections', (select coalesce(json_agg(c order by user_id), '[]') from public.oura_connections c where user_id = '${user}'),
  'intents', (select coalesce(json_agg(json_build_object('conn', i.conn, 'kind', i.kind)), '[]') from public.oura_revoke_intents i where user_id = '${user}'),
  'days', (select coalesce(json_agg(json_build_object('day', d.day, 'data', d.data) order by day), '[]') from public.oura_days d where user_id = '${user}'))`);
const fault = (name, on) => sql(on ? `insert into public.test_faults values ('${name}') on conflict do nothing` : `delete from public.test_faults where name = '${name}'`);

test.before(async () => {
  const initdb = pgBin("initdb"), pgCtl = pgBin("pg_ctl"), psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required to run the Oura login SQL tests");
  Object.assign(ctx, { pgCtl, psql, user: userInfo().username, dir: mkdtempSync(join(tmpdir(), "insight-oura-pg-")), port: await freePort() });
  ctx.base = ["-h", ctx.dir, "-p", String(ctx.port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const init = run(initdb, ["-D", ctx.dir, "--auth=trust", "--username", ctx.user, "--no-sync"]);
  assert.equal(init.status, 0, init.stderr);
  const start = run(pgCtl, ["-D", ctx.dir, "-l", join(ctx.dir, "server.log"), "-w", "start", "-o", `-p ${ctx.port} -k ${ctx.dir}`]);
  assert.equal(start.status, 0, start.stderr);
  ctx.started = true;

  sql(`
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end
    $roles$;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    insert into auth.users values ('${A}'), ('${B}');
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const file of [BASE_SQL, MIGRATION, MIGRATION]) {
    const r = run(psql, [...ctx.base, "-q", "-f", new URL(`../${file}`, import.meta.url).pathname], { env: env() });
    assert.equal(r.status, 0, `${file}: ${r.stderr}`);
  }
  // Test-only switches that make one write fail, to force a rollback in the middle of a function.
  sql(`
    create table public.test_faults (name text primary key);
    create function public.test_fault() returns trigger language plpgsql as $fn$
    begin
      if exists (select 1 from public.test_faults where name = tg_argv[0]) then
        raise exception 'made-up % failure', tg_argv[0];
      end if;
      return case when tg_op = 'DELETE' then old else new end;
    end $fn$;
    create trigger fail_connections before insert or update on public.oura_connections for each row execute function public.test_fault('connections');
    create trigger fail_days before delete on public.oura_days for each row execute function public.test_fault('days');
  `);
});

test.after(() => {
  if (ctx.started) run(ctx.pgCtl, ["-D", ctx.dir, "-w", "-m", "immediate", "stop"]);
  if (ctx.dir) rmSync(ctx.dir, { recursive: true, force: true });
});

test("only the server role can run the new functions or read the removal records", () => {
  const fns = ["oura_lock_user(uuid)", "oura_day_conn(jsonb)", "oura_save_login(uuid, text, text, timestamptz, timestamptz)",
    "oura_revoke_login(uuid, timestamptz, text)", "oura_finish_revoke(uuid, timestamptz)"];
  for (const fn of fns) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`), "f", `${role} ${fn}`);
    }
    // No grant to PUBLIC (grantee 0) either.
    assert.equal(sql(`select count(*) from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.${fn}'::regprocedure and a.grantee = 0`), "0", fn);
    assert.equal(sql(`select has_function_privilege('service_role', 'public.${fn}', 'execute')`), "t", fn);
  }
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_table_privilege('${role}', 'public.oura_revoke_intents', 'select')`), "f", role);
  }
  // service_role really can save a login (the call runs end to end under that role).
  seed();
  assert.match(sql(`set role service_role; select public.oura_save_login('${B}', 'made-up-a', 'made-up-r', '2026-11-20T00:00:00Z', '${NOW}')`), /^2026-11-19/);
  const mig = readFileSync(new URL(`../${MIGRATION}`, import.meta.url), "utf8");
  assert.doesNotMatch(mig, /grant[^;]*to\s+(anon|authenticated)/i);
  // Every SECURITY DEFINER function pins an empty search_path.
  for (const fn of ["oura_lock_user(uuid)", "oura_save_login(uuid, text, text, timestamptz, timestamptz)",
    "oura_revoke_login(uuid, timestamptz, text)", "oura_finish_revoke(uuid, timestamptz)"]) {
    assert.equal(sql(`select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.${fn}'::regprocedure`), "t", fn);
  }
});

test("a login missing a token is refused before any row is written, and the error carries no token", () => {
  seed();
  const before = snapshot(A);
  for (const [access, refresh] of [["'made-up-secret-access'", "null"], ["null", "'made-up-secret-refresh'"], ["''", "'made-up-secret-refresh'"]]) {
    assert.throws(
      () => sql(`set role service_role; select public.oura_save_login('${A}', ${access}, ${refresh}, '2026-11-20T00:00:00Z', '${NOW}')`),
      (e) => /missing token/.test(e.message) && !/made-up-secret/.test(e.message),
    );
  }
  assert.deepEqual(snapshot(A), before);
});

test("acceptance 1: a reconnect whose connection half fails leaves the old login, connection and days unchanged", async () => {
  seed();
  const before = snapshot(A);
  fault("connections", true);
  assert.equal(await quiet(() => saveLogin(pgAdmin(), A, fresh, NOW)), "error");
  fault("connections", false);
  assert.deepEqual(snapshot(A), before);
});

test("acceptance 1: a first connect that fails leaves neither row; a success saves both and starts over", async () => {
  seed();
  sql(`delete from public.oura_tokens where user_id = '${A}'; delete from public.oura_connections where user_id = '${A}'`);
  fault("connections", true);
  assert.equal(await quiet(() => saveLogin(pgAdmin(), A, fresh, NOW)), "error");
  fault("connections", false);
  assert.deepEqual(snapshot(A).tokens, []);
  assert.deepEqual(snapshot(A).connections, []);

  seed();
  sql(`insert into public.oura_revoke_intents (user_id, conn, kind) values ('${A}', '${OLD}', 'revoked')`);
  assert.equal(await saveLogin(pgAdmin(), A, fresh, NOW), "connected");
  const after = snapshot(A);
  assert.deepEqual(after.tokens.map((t) => [t.access_token, t.refresh_token]), [[fresh.access_token, fresh.refresh_token]]);
  assert.deepEqual(after.connections, [{ user_id: A, connected_at: NOW, last_sync: null, last_error: null }]);
  assert.deepEqual(after.intents, []);
  assert.equal(after.days.length, 2);
});

test("acceptance 1: the new connection is always later than the one it replaces, even with a slow clock", async () => {
  seed();
  assert.equal(await saveLogin(pgAdmin(), A, fresh, "2026-11-01T00:00:00+00:00"), "connected");
  assert.equal(snapshot(A).connections[0].connected_at, "2026-11-16T10:00:00.000001+00:00");
});

test("acceptance 2: of two callbacks, the committed one keeps its login, connection and days when the other fails", async () => {
  seed();
  assert.equal(await saveLogin(pgAdmin(), A, fresh, NOW), "connected");
  sql(`insert into public.oura_days (user_id, day, data) values ('${A}', '2026-11-19', '{"steps":5,"conn":"${NOW}"}')`);
  const committed = snapshot(A);
  fault("connections", true);
  assert.equal(await quiet(() => saveLogin(pgAdmin(), A, { ...fresh, refresh_token: "made-up-loser" }, "2026-11-19T15:00:01+00:00")), "error");
  fault("connections", false);
  assert.deepEqual(snapshot(A), committed);
});

test("acceptance 2: an answer lost after commit says error but never deletes anything", async () => {
  for (const firstConnect of [true, false]) {
    seed();
    if (firstConnect) sql(`delete from public.oura_tokens where user_id = '${A}'; delete from public.oura_connections where user_id = '${A}'`);
    const admin = pgAdmin({ loseAnswer: (name) => name === "oura_save_login" });
    assert.equal(await quiet(() => saveLogin(admin, A, fresh, NOW)), "error");
    assert.deepEqual(admin.calls, ["oura_save_login"]);
    const after = snapshot(A);
    assert.equal(after.tokens[0].refresh_token, fresh.refresh_token);
    assert.equal(after.connections[0].connected_at, NOW);
    assert.equal(after.days.length, 2);
  }
});

test("acceptance 2: a stale cleanup touches neither the newer connection nor another person's rows", async () => {
  seed();
  const sentinel = snapshot(B);
  assert.equal(await saveLogin(pgAdmin(), A, fresh, NOW), "connected");
  sql(`insert into public.oura_days (user_id, day, data) values ('${A}', '2026-11-19', '{"steps":5,"conn":"${NOW}"}')`);
  const newer = snapshot(A);
  // The old connection's cleanup, with the old refresh token, after the reconnect.
  await assert.rejects(forgetRevoked(pgAdmin(), A, OLD, "made-up-refresh"), /^Error: Oura isn't connected$/);
  await assert.rejects(finishRevoked(pgAdmin(), A, OLD), /^Error: Oura isn't connected$/);
  assert.equal(sql(`select public.oura_finish_revoke('${A}', '${OLD}')`), "not_connected");
  assert.deepEqual(snapshot(A), newer);
  // B's own refusal and cleanup run, and A's rows are untouched by it.
  await forgetRevoked(pgAdmin(), B, OLD, "made-up-b-refresh");
  assert.deepEqual(snapshot(A), newer);
  assert.deepEqual(snapshot(B).days, []);
  assert.notDeepEqual(sentinel, snapshot(B));
});

/** Holds one of the functions open in its own transaction, then checks that `second` waits for the per-user lock. */
async function serialized(first, second) {
  const holder = sqlLater(`begin; ${first}; select pg_sleep(1.5); commit;`, "oura-first");
  for (let i = 0; i < 100 && sql(`select count(*) from pg_locks where locktype = 'advisory' and granted`) === "0"; i++) await new Promise((r) => setTimeout(r, 20));
  const waiter = sqlLater(second, "oura-second");
  let waited = false;
  for (let i = 0; i < 100 && !waited; i++) {
    waited = sql(`select count(*) from pg_stat_activity where application_name = 'oura-second' and wait_event_type = 'Lock' and wait_event = 'advisory'`) === "1";
    if (!waited) await new Promise((r) => setTimeout(r, 20));
  }
  const [a, b] = await Promise.all([holder, waiter]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.ok(waited, "the second call waits for the first one's per-user lock");
  return b.stdout;
}

test("acceptance 2: a reconnect and a confirmed cleanup for one person run one after the other", async () => {
  // Reconnect first: the cleanup then sees the newer connection and removes nothing.
  seed();
  const out = await serialized(
    `select public.oura_save_login('${A}', 'made-up-new-access', 'made-up-new-refresh', '2026-11-20T00:00:00Z', '${NOW}')`,
    `select public.oura_revoke_login('${A}', '${OLD}', 'made-up-refresh')`,
  );
  assert.equal(out, "not_connected");
  assert.equal(snapshot(A).tokens[0].refresh_token, "made-up-new-refresh");
  assert.equal(snapshot(A).days.length, 2);

  // Cleanup first: the reconnect then saves its login and clears the record, and the old cleanup can't go on.
  seed();
  await serialized(
    `select public.oura_revoke_login('${A}', '${OLD}', 'made-up-refresh')`,
    `select public.oura_save_login('${A}', 'made-up-new-access', 'made-up-new-refresh', '2026-11-20T00:00:00Z', '${NOW}')`,
  );
  assert.deepEqual(snapshot(A).intents, []);
  assert.equal(sql(`select public.oura_finish_revoke('${A}', '${OLD}')`), "not_connected");
  assert.equal(snapshot(A).days.length, 2);
  assert.equal(snapshot(A).connections[0].connected_at, NOW);
});

test("acceptance 3: no login and no recorded removal asks for a reconnect and keeps every day", async () => {
  for (const message of [null, DELETING, REVOKED]) {
    seed();
    // An ambiguous leftover from before this change: a connection with no login, whatever its message says.
    sql(`delete from public.oura_tokens where user_id = '${A}'; update public.oura_connections set last_error = ${lit(message)} where user_id = '${A}'`);
    const before = snapshot(A);
    await assert.rejects(finishRevoked(pgAdmin(), A, OLD), (e) => e.message === RECONNECT);
    assert.deepEqual(snapshot(A), before);
  }
  // A removal recorded for another connection is not this connection's.
  seed();
  sql(`delete from public.oura_tokens where user_id = '${A}'; insert into public.oura_revoke_intents values ('${A}', '2026-11-15T10:00:00Z', 'revoked')`);
  await assert.rejects(finishRevoked(pgAdmin(), A, OLD), (e) => e.message === RECONNECT);
  assert.equal(snapshot(A).days.length, 2);
  assert.doesNotMatch(RECONNECT, /deleted/);
});

test("acceptance 4: a confirmed refusal removes that login and this connection's days, newer days stay", async () => {
  seed();
  sql(`insert into public.oura_days (user_id, day, data) values ('${A}', '2026-11-20', '{"steps":7,"conn":"2026-11-20T00:00:00+00:00"}')`);
  await forgetRevoked(pgAdmin(), A, OLD, "made-up-refresh");
  const after = snapshot(A);
  assert.deepEqual(after.tokens, []);
  assert.deepEqual(after.days.map((d) => d.day), ["2026-11-20"]);
  assert.deepEqual(after.intents, [{ conn: "2026-11-16T10:00:00+00:00", kind: "revoked" }]);
  assert.equal(after.connections[0].last_error, REVOKED);
  // Later syncs keep saying so, until a reconnect or Disconnect.
  await assert.rejects(finishRevoked(pgAdmin(), A, OLD), (e) => e.message === REVOKED);
});

test("acceptance 4: a refusal of a login that has since been replaced deletes nothing", async () => {
  seed();
  sql(`update public.oura_tokens set refresh_token = 'made-up-winner' where user_id = '${A}'`);
  const before = snapshot(A);
  await assert.rejects(forgetRevoked(pgAdmin(), A, OLD, "made-up-refresh"), (e) => e.message === NEWER_LOGIN);
  assert.deepEqual(snapshot(A).tokens, before.tokens);
  assert.deepEqual(snapshot(A).days, before.days);
  assert.deepEqual(snapshot(A).intents, []);
});

test("acceptance 4: a failed day delete resumes from the record for its own connection, whatever the message says", async () => {
  seed();
  fault("days", true);
  await assert.rejects(forgetRevoked(pgAdmin(), A, OLD, "made-up-refresh"), (e) => e.message === DELETING);
  let now = snapshot(A);
  assert.deepEqual(now.tokens, []);
  assert.equal(now.days.length, 2);
  assert.equal(now.intents.length, 1);
  fault("days", false);
  sql(`update public.oura_connections set last_error = 'made-up overwritten message' where user_id = '${A}'`);
  await assert.rejects(finishRevoked(pgAdmin(), A, OLD), (e) => e.message === REVOKED);
  now = snapshot(A);
  assert.deepEqual(now.days, []);
  assert.equal(now.connections[0].last_error, REVOKED);
  assert.equal(snapshot(B).days.length, 2);
});

test("acceptance 4: Disconnect removes everything, and a failed second step is finished by a retry or by a sync", async () => {
  seed();
  await disconnect(pgAdmin(), A);
  assert.deepEqual(snapshot(A), { tokens: [], connections: [], intents: [], days: [] });
  assert.equal(snapshot(B).days.length, 2);

  for (const finish of ["retry", "sync"]) {
    seed();
    fault("days", true);
    await assert.rejects(disconnect(pgAdmin(), A), /couldn't be removed/);
    fault("days", false);
    let now = snapshot(A);
    assert.deepEqual(now.tokens, []);
    assert.equal(now.days.length, 2);
    assert.deepEqual(now.intents, [{ conn: "2026-11-16T10:00:00+00:00", kind: "disconnect" }]);
    sql(`update public.oura_connections set last_error = 'made-up overwritten message' where user_id = '${A}'`);
    if (finish === "retry") await disconnect(pgAdmin(), A);
    else await assert.rejects(finishRevoked(pgAdmin(), A, OLD), /^Error: Oura isn't connected$/);
    assert.deepEqual(snapshot(A), { tokens: [], connections: [], intents: [], days: [] }, finish);
    assert.equal(snapshot(B).days.length, 2, finish);
  }
});
