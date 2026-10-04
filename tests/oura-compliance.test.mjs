import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyCollection, classifyRefresh, planSync, retentionDays, showOuraOnHome } from "../supabase/functions/_shared/oura-policy.js";
import { showOuraOnHome as showFromUi } from "../logger/js/shared/oura-ui.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("invalid_grant revokes, and a 401 that survives one refresh deletes", () => {
  assert.equal(classifyRefresh(400, JSON.stringify({ error: "invalid_grant" })), "revoked");
  assert.equal(classifyRefresh(200, JSON.stringify({ access_token: "a" })), "ok");
  assert.equal(classifyRefresh(500, "upstream"), "refresh_failed");
  assert.equal(classifyCollection(401), "unauthorized");
  assert.equal(classifyCollection(403), "membership_inactive");
  assert.equal(planSync({ refresh: "revoked", api: "ok" }), "delete");
  assert.equal(planSync({ refresh: "skipped", api: "unauthorized", retryRefresh: "refresh_failed" }), "error");
  assert.equal(planSync({ refresh: "skipped", api: "unauthorized", retryRefresh: "revoked" }), "delete");
  assert.equal(planSync({ refresh: "ok", api: "unauthorized", retryRefresh: "ok", retryApi: "unauthorized" }), "delete");
  assert.equal(planSync({ refresh: "skipped", api: "unauthorized" }), "retry");
  assert.equal(planSync({ refresh: "skipped", api: "unauthorized", retryRefresh: "ok", retryApi: "ok" }), "save");
});

test("a 403 keeps data and does not delete", () => {
  assert.equal(planSync({ refresh: "skipped", api: "membership_inactive" }), "inactive");
  assert.equal(planSync({ refresh: "ok", api: "unauthorized", retryRefresh: "ok", retryApi: "membership_inactive" }), "inactive");
  assert.equal(planSync({ refresh: "refresh_failed" }), "error");
  assert.equal(planSync({ refresh: "skipped", api: "ok" }), "save");
});

test("retention is unlimited unless a positive day count is set", () => {
  assert.equal(retentionDays(null), null);
  assert.equal(retentionDays("null"), null);
  assert.equal(retentionDays(0), null);
  assert.equal(retentionDays(-4), null);
  assert.equal(retentionDays(""), null);
  assert.equal(retentionDays(90), 90);
  assert.equal(retentionDays("30.9"), 30);
});

test("an empty Oura tile stays off Home; a lapsed membership still shows a stored score", () => {
  assert.equal(showOuraOnHome(null, false), false);
  assert.equal(showOuraOnHome("connected", false), false);
  assert.equal(showOuraOnHome("membership_inactive", false), false);
  assert.equal(showOuraOnHome("disconnected", true), false);
  assert.equal(showOuraOnHome("membership_inactive", true), true);
  assert.equal(showOuraOnHome("connected", true), true);
  assert.equal(showFromUi("membership_inactive", true), true);
});

test("sync deletes through the helper, and personal info is not requested", () => {
  const sync = read("../supabase/functions/oura-sync/index.ts");
  const connect = read("../supabase/functions/oura-connect/index.ts");
  const data = read("../supabase/functions/_shared/oura-data.ts");
  assert.match(sync, /planSync/);
  assert.match(sync, /markOuraDisconnected/);
  assert.match(sync, /markMembershipInactive/);
  assert.doesNotMatch(sync, /personal_info/);
  assert.match(connect, /deleteOuraData/);
  assert.match(connect, /daily heartrate workout/);
  assert.doesNotMatch(connect, /personal/);
  assert.match(data, /TODO\(#16\)/);
  assert.match(data, /onSubscriptionCancelled/);
  assert.match(data, /oura_tokens/);
  assert.match(data, /oura_days/);
  const sql = read("../supabase/migrations/20261004230000_oura_compliance.sql");
  assert.match(sql, /oura_days_retention_days/);
  assert.match(sql, /'null'::jsonb/);
  assert.match(sql, /purge_oura_days_retention/);
});

test("Claude calls do not include Oura fields", () => {
  for (const path of ["../supabase/functions/food-describe/index.ts", "../supabase/functions/food-photo/index.ts"]) {
    const src = read(path);
    assert.match(src, /Oura data is never sent to Claude/);
    assert.doesNotMatch(src, /oura_days|sleepScore|average_hrv|daily_readiness/);
  }
  const brief = read("../logger/js/shared/brief.js");
  const weekly = read("../logger/js/shared/weekly.js");
  const correlate = read("../logger/js/shared/correlate.js");
  const insights = read("../logger/js/pages/insights.js");
  for (const src of [brief, weekly, correlate, insights]) {
    assert.doesNotMatch(src, /api\.anthropic\.com|claude|FOOD_MODEL/);
  }
});

test("local Postgres drops only oura_days older than a configured window", () => {
  const db = "oura_retention";
  const psql = (database, args) => execFileSync("sudo", ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8" });
  const q = (sql) => psql(db, ["-t", "-A", "-c", sql]).trim();
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
  `]);
  const file = new URL("../supabase/migrations/20261004230000_oura_compliance.sql", import.meta.url).pathname;
  psql(db, ["-f", file]);
  const uid = "22222222-2222-2222-2222-222222222222";
  q(`delete from public.oura_days where user_id = '${uid}'`);
  q(`insert into public.oura_days (user_id, day, data) values
    ('${uid}', (now() at time zone 'utc')::date - 10, '{"date":"recent"}'),
    ('${uid}', (now() at time zone 'utc')::date - 40, '{"date":"old"}')
    on conflict (user_id, day) do update set data = excluded.data`);
  q(`update public.app_settings set value = 'null'::jsonb where key = 'oura_days_retention_days'`);
  assert.equal(q(`select public.purge_oura_days_retention()`), "0");
  assert.equal(q(`select count(*) from public.oura_days where user_id = '${uid}'`), "2");
  q(`update public.app_settings set value = '30'::jsonb where key = 'oura_days_retention_days'`);
  assert.equal(q(`select public.purge_oura_days_retention()`), "1");
  assert.equal(q(`select count(*) from public.oura_days where user_id = '${uid}'`), "1");
  assert.equal(q(`select day::text from public.oura_days where user_id = '${uid}'`), q(`select ((now() at time zone 'utc')::date - 10)::text`));
  q(`update public.app_settings set value = 'null'::jsonb where key = 'oura_days_retention_days'`);
  q(`delete from public.oura_days where user_id = '${uid}'`);
});
