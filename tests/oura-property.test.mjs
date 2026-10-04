import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { classifyCollection, classifyRefresh, planSync } from "../supabase/functions/_shared/oura-policy.js";

/* Seeded so a failure can be replayed with OURA_PROP_SEED. */
const SEED = Number(process.env.OURA_PROP_SEED ?? 20261004);
const SYNC_SEQUENCES = 200;
const STEPS_PER_SEQUENCE = 12;
const RETENTION_ITERATIONS = 40;
const RETENTION_SEED = (SEED ^ 0x9e3779b9) >>> 0;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/* One sync attempt: a refresh outcome, a collection status, and one retry after a 401. */
function randomAttempt(rng) {
  const refreshRoll = pick(rng, ["skipped", 200, "invalid_grant", "refresh_failed"]);
  let refresh;
  if (refreshRoll === "skipped") refresh = "skipped";
  else if (refreshRoll === "invalid_grant") refresh = classifyRefresh(400, JSON.stringify({ error: "invalid_grant" }));
  else if (refreshRoll === 200) refresh = classifyRefresh(200, JSON.stringify({ access_token: "t" }));
  else refresh = classifyRefresh(500, "upstream");

  if (refresh === "revoked" || refresh === "refresh_failed") {
    return { refresh, api: null, retryRefresh: null, retryApi: null, apiStatus: null, retryStatus: null };
  }

  const apiStatus = pick(rng, [200, 401, 403, 500]);
  const api = classifyCollection(apiStatus);
  if (api !== "unauthorized") {
    return { refresh, api, retryRefresh: null, retryApi: null, apiStatus, retryStatus: null };
  }

  const retryRoll = pick(rng, [200, "invalid_grant", "refresh_failed"]);
  let retryRefresh;
  if (retryRoll === "invalid_grant") retryRefresh = classifyRefresh(400, "invalid_grant");
  else if (retryRoll === 200) retryRefresh = classifyRefresh(200, JSON.stringify({ access_token: "t2" }));
  else retryRefresh = classifyRefresh(401, "nope");
  if (retryRefresh !== "ok") {
    return { refresh, api, retryRefresh, retryApi: null, apiStatus, retryStatus: null };
  }
  const retryStatus = pick(rng, [200, 401, 403, 500]);
  return { refresh, api, retryRefresh, retryApi: classifyCollection(retryStatus), apiStatus, retryStatus };
}

/* Stored rows go away only for invalid_grant, or a 401 that is still 401 after a successful refresh. */
function deletesData(attempt) {
  if (attempt.refresh === "revoked") return true;
  if (attempt.api === "unauthorized" && attempt.retryRefresh === "revoked") return true;
  if (attempt.api === "unauthorized" && attempt.retryRefresh === "ok" && attempt.retryApi === "unauthorized") return true;
  return false;
}

/* Mirrors oura-sync: a revoked refresh deletes inside loadToken; a failed refresh does not. */
function outcome(attempt) {
  if (attempt.refresh === "revoked") return "delete";
  if (attempt.refresh === "refresh_failed") return "error";
  if (attempt.api === "unauthorized" && attempt.retryRefresh === "revoked") return "delete";
  return planSync(attempt);
}

function applyAttempt(state, attempt) {
  if (!state.hasTokens) return { ...state };
  const decision = outcome(attempt);
  if (decision === "delete") return { status: "disconnected", hasData: false, hasTokens: false };
  if (decision === "inactive") return { status: "membership_inactive", hasData: state.hasData, hasTokens: true };
  if (decision === "save") return { status: "connected", hasData: true, hasTokens: true };
  return { ...state };
}

test("Oura response sequences only delete on invalid_grant or a 401 that survives refresh", () => {
  const rng = mulberry32(SEED);
  console.log(`[oura-property] seed=${SEED} syncSequences=${SYNC_SEQUENCES} stepsPerSequence=${STEPS_PER_SEQUENCE}`);
  for (let s = 0; s < SYNC_SEQUENCES; s++) {
    let state = rng() < 0.5
      ? { status: "connected", hasData: true, hasTokens: true }
      : { status: "connected", hasData: false, hasTokens: true };
    for (let step = 0; step < STEPS_PER_SEQUENCE; step++) {
      const before = { ...state };
      if (!state.hasTokens && rng() < 0.25) {
        state = { status: "connected", hasData: before.hasData, hasTokens: true };
        assert.equal(state.hasData, before.hasData, `seed ${SEED} seq ${s} step ${step} reconnect resurrected data`);
        assert.equal(state.status, "connected");
        continue;
      }

      const attempt = randomAttempt(rng);
      const decision = before.hasTokens ? outcome(attempt) : "missing";
      const planned = planSync(attempt);
      state = applyAttempt(state, attempt);
      const where = `seed ${SEED} seq ${s} step ${step} ${JSON.stringify(attempt)}`;

      assert.equal(planned === "delete", deletesData(attempt), where);
      if (attempt.refresh === "refresh_failed") assert.equal(planned, "error", where);
      assert.equal(decision === "delete", before.hasTokens && deletesData(attempt), where);
      if (attempt.apiStatus === 403 || attempt.retryStatus === 403) {
        assert.notEqual(planned, "delete", where);
        assert.notEqual(decision, "delete", where);
        assert.equal(state.hasData, before.hasData, where);
      }
      if (before.hasData && !state.hasData) assert.ok(before.hasTokens && deletesData(attempt), where);
      if (!before.hasData && state.hasData) assert.equal(decision, "save", where);
      if (!before.hasTokens) {
        assert.equal(state.hasData, false, where);
        assert.equal(state.hasTokens, false, where);
        assert.equal(state.status, "disconnected", where);
      }
      if (decision === "delete") {
        assert.equal(state.status, "disconnected", where);
        assert.equal(state.hasData, false, where);
        assert.equal(state.hasTokens, false, where);
      } else if (decision === "inactive") {
        assert.equal(state.status, "membership_inactive", where);
        assert.equal(state.hasData, before.hasData, where);
        assert.equal(state.hasTokens, true, where);
      } else if (decision === "save") {
        assert.equal(state.status, "connected", where);
        assert.equal(state.hasData, true, where);
        assert.equal(state.hasTokens, true, where);
      } else if (decision === "error" || decision === "missing") {
        assert.deepEqual(state, before, where);
      }
      if (state.status === "disconnected") {
        assert.equal(state.hasData, false, where);
        assert.equal(state.hasTokens, false, where);
      }
      assert.ok(["connected", "disconnected", "membership_inactive"].includes(state.status), where);
    }
  }
});

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ZONES = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York", "Asia/Kathmandu"];

function psql(database, args, input) {
  return execFileSync("sudo", ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
  });
}

test("purge_oura_days_retention deletes only rows older than a positive window", () => {
  const rng = mulberry32(RETENTION_SEED);
  const db = "oura_property";
  console.log(`[oura-property] seed=${SEED} retentionSeed=${RETENTION_SEED} retentionIterations=${RETENTION_ITERATIONS}`);
  const exists = psql("postgres", ["-t", "-A", "-c", `select 1 from pg_database where datname = '${db}'`]).trim();
  if (exists !== "1") psql("postgres", ["-c", `create database ${db}`]);
  psql(db, ["-c", `
    create table if not exists public.oura_connections (
      user_id uuid primary key,
      connected_at timestamptz not null default now(),
      last_sync timestamptz,
      last_error text
    );
    create table if not exists public.oura_days (
      user_id uuid not null,
      day date not null,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (user_id, day)
    );
    create table if not exists public.oura_tokens (
      user_id uuid primary key,
      access_token text not null
    );
    create table if not exists public.retention_sentinel (
      id int primary key,
      note text not null
    );
  `]);
  const file = new URL("../supabase/migrations/20261004230000_oura_compliance.sql", import.meta.url).pathname;
  psql(db, ["-f", file]);
  const present = psql(db, ["-t", "-A", "-c", "select string_agg(name, ',' order by name) from pg_timezone_names where name in ('UTC','Pacific/Kiritimati','Pacific/Pago_Pago','America/New_York','Asia/Kathmandu')"]).trim();
  for (const zone of ZONES) assert.ok(present.split(",").includes(zone), `missing time zone ${zone}`);

  const kinds = ["null", "zero", "neg", "pos"];
  for (let i = 0; i < RETENTION_ITERATIONS; i++) {
    const zone = ZONES[i % ZONES.length];
    const kind = kinds[i % kinds.length];
    let n = null;
    let cutoff = null;
    let valueSql = "'null'::jsonb";
    if (kind === "zero") valueSql = "'0'::jsonb";
    else if (kind === "neg") {
      const whole = 1 + Math.floor(rng() * 60);
      const tenths = Math.floor(rng() * 10);
      valueSql = `to_jsonb(-(${whole}::numeric + ${tenths}::numeric / 10))`;
      n = -(whole + tenths / 10);
    } else if (kind === "pos") {
      const whole = Math.floor(rng() * 90);
      const tenths = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 9);
      cutoff = whole;
      n = whole + tenths / 10;
      valueSql = tenths === 0 ? `to_jsonb(${whole}::int)` : `to_jsonb(${whole}::numeric + ${tenths}::numeric / 10)`;
      if (n <= 0) {
        cutoff = 1;
        n = 1;
        valueSql = "to_jsonb(1::int)";
      }
    }

    const offsets = new Map();
    const add = (user, offset) => offsets.set(`${user}|${offset}`, { user, offset });
    for (const user of [USER_A, USER_B]) {
      add(user, 0);
      add(user, -1);
      add(user, 1);
      if (cutoff != null) {
        add(user, cutoff);
        add(user, cutoff + 1);
        if (cutoff > 0) add(user, cutoff - 1);
      }
      for (let k = 0; k < 6; k++) add(user, Math.floor(rng() * 400) - 5);
    }
    const values = [...offsets.values()].map((row) => `('${row.user}', current_date - ${row.offset}, '{"row":${row.offset}}')`).join(",\n");
    const where = `seed ${SEED} retentionSeed ${RETENTION_SEED} iter ${i} zone ${zone} kind ${kind} n ${n} cutoff ${cutoff}`;
    const sql = `
      begin;
      set local time zone '${zone}';
      insert into public.retention_sentinel (id, note) values (1, 'keep')
        on conflict (id) do update set note = excluded.note;
      insert into public.app_settings (key, value) values ('property_sentinel', '"keep"'::jsonb)
        on conflict (key) do update set value = excluded.value;
      insert into public.oura_connections (user_id, status) values
        ('${USER_A}', 'connected'),
        ('${USER_B}', 'membership_inactive')
        on conflict (user_id) do update set status = excluded.status;
      insert into public.oura_tokens (user_id, access_token) values
        ('${USER_A}', 'token-a'),
        ('${USER_B}', 'token-b')
        on conflict (user_id) do update set access_token = excluded.access_token;
      delete from public.oura_days;
      insert into public.oura_days (user_id, day, data) values ${values};
      update public.app_settings set value = ${valueSql} where key = 'oura_days_retention_days';
      select 'REMOVED|' || public.purge_oura_days_retention()::text;
      select 'LEFT|' || coalesce(string_agg(user_id::text || '|' || (current_date - day)::text, ',' order by user_id::text, day), '')
        from public.oura_days
        where user_id in ('${USER_A}', '${USER_B}');
      select 'SENTINEL|' || note from public.retention_sentinel where id = 1;
      select 'SETTING|' || value::text from public.app_settings where key = 'property_sentinel';
      select 'CONN|' || coalesce(string_agg(user_id::text || ':' || status, ',' order by user_id::text), '')
        from public.oura_connections where user_id in ('${USER_A}', '${USER_B}');
      select 'TOKEN|' || coalesce(string_agg(user_id::text || ':' || access_token, ',' order by user_id::text), '')
        from public.oura_tokens where user_id in ('${USER_A}', '${USER_B}');
      select 'UTC|' || (timezone('UTC', now()))::date::text;
      select 'LOCAL|' || current_date::text;
      rollback;
    `;
    const out = psql(db, ["-t", "-A", "-f", "-"], sql);
    const lines = Object.fromEntries(out.split("\n").filter((line) => line.includes("|")).map((line) => {
      const idx = line.indexOf("|");
      return [line.slice(0, idx), line.slice(idx + 1)];
    }));
    const kept = new Set(lines.LEFT ? lines.LEFT.split(",").filter(Boolean) : []);
    const deletes = kind === "pos";
    let expectRemoved = 0;
    for (const row of offsets.values()) {
      const drop = deletes && row.offset > cutoff;
      if (drop) expectRemoved += 1;
      assert.equal(kept.has(`${row.user}|${row.offset}`), !drop, `${where} utc ${lines.UTC} local ${lines.LOCAL}`);
    }
    assert.equal(Number(lines.REMOVED), expectRemoved, where);
    assert.equal(kept.size, offsets.size - expectRemoved, where);
    assert.equal(lines.SENTINEL, "keep", where);
    assert.equal(lines.SETTING, '"keep"', where);
    assert.equal(lines.CONN, `${USER_A}:connected,${USER_B}:membership_inactive`, where);
    assert.equal(lines.TOKEN, `${USER_A}:token-a,${USER_B}:token-b`, where);

    if (deletes && lines.UTC !== lines.LOCAL) {
      const delta = lines.UTC > lines.LOCAL ? 1 : -1;
      const diverged = [...offsets.values()].some((row) => (row.offset > cutoff) !== (row.offset + delta > cutoff));
      assert.equal(diverged, true, `${where} utc ${lines.UTC} local ${lines.LOCAL} followed the same cutoff`);
    }
  }
});
