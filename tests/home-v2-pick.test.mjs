import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { pickHomeV2 } from "../logger/js/shared/home-migrate.js";
import { HOME_WIDGETS } from "../logger/js/shared/home-widgets.js";

const ROOT = new URL("..", import.meta.url);
const MIGRATIONS = [
  "supabase/migrations/20261004180000_merge_user_data.sql",
  "supabase/migrations/20261004210000_merge_home_v2.sql",
  "supabase/migrations/20261005000000_home_v2_brief_rank.sql",
];
const IDS = Object.keys(HOME_WIDGETS);
const UID = "11111111-1111-1111-1111-111111111111";

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

function filePath(rel) {
  return new URL(rel, ROOT).pathname;
}

function mulberry(seed) {
  let rng = seed >>> 0;
  return () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
}

function oldClientCopy(home) {
  const keep = (id) => HOME_WIDGETS[id] && id !== "brief";
  const items = home.items.filter(keep);
  const hidden = home.hidden.filter((id) => keep(id) && !items.includes(id));
  return { v: 2, items, hidden, updatedAt: home.updatedAt };
}

function sig(home) {
  return JSON.stringify({ items: (home && home.items) || [], hidden: (home && home.hidden) || [] });
}

test("home_v2_pick and merge_user_data keep the copy with more distinct ids", { timeout: 120_000 }, async () => {
  const rankSql = await import("node:fs").then((fs) => fs.readFileSync(filePath(MIGRATIONS[2]), "utf8"));
  assert.match(rankSql, /COLLATE "C"/);
  assert.match(rankSql, /home_v2_id_count/);

  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required");

  const dir = mkdtempSync(join(tmpdir(), "insight-home-v2-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const started = { ok: false };

  function sqlFile(path) {
    return run(psql, [...base, "-f", path], { env: { ...process.env, PGUSER: user } });
  }
  function sqlText(text) {
    const path = join(dir, "batch.sql");
    writeFileSync(path, text);
    return run(psql, [...base, "-q", "-t", "-A", "-f", path], { env: { ...process.env, PGUSER: user } });
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started.ok = true;

    const schema = sqlText(`
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
    assert.equal(schema.status, 0, schema.stderr);
    for (const rel of MIGRATIONS) {
      const applied = sqlFile(filePath(rel));
      assert.equal(applied.status, 0, applied.stderr);
    }

    const rnd = mulberry(0xb3f6484);
    const pool = [...IDS, "future-widget", "next-card"];
    const cases = [
      {
        full: { v: 2, items: ["brief", "this-week", "cardio"], hidden: [], updatedAt: 1000 },
        stripped: { v: 2, items: ["this-week", "cardio"], hidden: [], updatedAt: 1000 },
      },
      {
        full: { v: 2, items: ["this-week"], hidden: ["brief"], updatedAt: 1000 },
        stripped: { v: 2, items: ["this-week"], hidden: [], updatedAt: 1000 },
      },
    ];
    for (let trial = 0; trial < 24; trial++) {
      const chosen = pool.filter(() => rnd() < 0.45);
      if (!chosen.includes("brief")) chosen.push("brief");
      if (!chosen.some((id) => HOME_WIDGETS[id])) chosen.push("today");
      const items = [];
      const hidden = [];
      chosen.forEach((id) => (rnd() < 0.72 ? items : hidden).push(id));
      if (!items.some((id) => HOME_WIDGETS[id])) items.unshift("brief");
      const full = { v: 2, items, hidden, updatedAt: 3000 + trial };
      cases.push({ full, stripped: oldClientCopy(full) });
    }

    const picks = cases.map((row, index) => {
      const a = JSON.stringify(row.full).replace(/'/g, "''");
      const b = JSON.stringify(row.stripped).replace(/'/g, "''");
      return `select ${index}, 'ab', public.home_v2_pick('${a}'::jsonb, '${b}'::jsonb, 9000)::text
union all select ${index}, 'ba', public.home_v2_pick('${b}'::jsonb, '${a}'::jsonb, 9000)::text`;
    }).join("\nunion all\n");
    const picked = sqlText(picks + ";");
    assert.equal(picked.status, 0, picked.stderr);
    const byTrial = new Map();
    picked.stdout.trim().split("\n").filter(Boolean).forEach((line) => {
      const splitAt = line.indexOf("|");
      const rest = line.slice(splitAt + 1);
      const dirAt = rest.indexOf("|");
      const index = Number(line.slice(0, splitAt));
      const dir = rest.slice(0, dirAt);
      const home = JSON.parse(rest.slice(dirAt + 1));
      if (!byTrial.has(index)) byTrial.set(index, {});
      byTrial.get(index)[dir] = home;
    });
    cases.forEach((row, index) => {
      const got = byTrial.get(index);
      assert.ok(got && got.ab && got.ba, `missing sql row ${index}`);
      const clientAb = pickHomeV2({ homeV2: row.full }, { homeV2: row.stripped }, 9000);
      const clientBa = pickHomeV2({ homeV2: row.stripped }, { homeV2: row.full }, 9000);
      assert.equal(sig(got.ab), sig(clientAb), `pick ab ${index}`);
      assert.equal(sig(got.ba), sig(clientBa), `pick ba ${index}`);
      assert.equal(sig(got.ab), sig(got.ba), `pick diverge ${index}`);
      const hasBrief = (home) => (home.items || []).includes("brief") || (home.hidden || []).includes("brief");
      assert.equal(hasBrief(got.ab), true, `sql dropped brief ${index}`);
    });

    const merges = cases.map((row, index) => {
      const rich = JSON.stringify({ settingsAt: 1, layout: { homeV2: row.full } }).replace(/'/g, "''");
      const poor = JSON.stringify({ settingsAt: 2, layout: { homeV2: row.stripped } }).replace(/'/g, "''");
      const poorFirst = JSON.stringify({ settingsAt: 1, layout: { homeV2: row.stripped } }).replace(/'/g, "''");
      const richSecond = JSON.stringify({ settingsAt: 2, layout: { homeV2: row.full } }).replace(/'/g, "''");
      return `
select set_config('request.jwt.claim.sub', '${UID}', false);
delete from public.user_data where user_id = '${UID}';
select public.merge_user_data('${rich}'::jsonb);
select ${index}, 'rich-then-poor', (public.merge_user_data('${poor}'::jsonb)->'layout'->'homeV2')::text;
delete from public.user_data where user_id = '${UID}';
select public.merge_user_data('${poorFirst}'::jsonb);
select ${index}, 'poor-then-rich', (public.merge_user_data('${richSecond}'::jsonb)->'layout'->'homeV2')::text;`;
    }).join("\n");
    const merged = sqlText(merges);
    assert.equal(merged.status, 0, merged.stderr);
    const mergeRows = new Map();
    merged.stdout.trim().split("\n").filter((line) => /^\d+\|/.test(line)).forEach((line) => {
      const splitAt = line.indexOf("|");
      const rest = line.slice(splitAt + 1);
      const dirAt = rest.indexOf("|");
      const index = Number(line.slice(0, splitAt));
      const dir = rest.slice(0, dirAt);
      const home = JSON.parse(rest.slice(dirAt + 1));
      if (!mergeRows.has(index)) mergeRows.set(index, {});
      mergeRows.get(index)[dir] = home;
    });
    cases.forEach((row, index) => {
      const got = mergeRows.get(index);
      assert.ok(got && got["rich-then-poor"] && got["poor-then-rich"], `missing merge ${index}`);
      const client = pickHomeV2({ homeV2: row.full }, { homeV2: row.stripped }, 9000);
      assert.equal(sig(got["rich-then-poor"]), sig(client), `merge rich-then-poor ${index}`);
      assert.equal(sig(got["poor-then-rich"]), sig(client), `merge poor-then-rich ${index}`);
    });
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});
