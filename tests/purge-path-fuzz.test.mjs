import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { deleteRange } from "../supabase/functions/_shared/range.ts";

const MIGRATION = new URL("../supabase/migrations/20261006120000_progress_photos_path_owner.sql", import.meta.url);
const DEFAULT_SEED = 20261006;
const TRIALS = 100;
const PATHS_PER_TRIAL = 8;
// Hex letters so caller.toUpperCase() is a different folder, not a no-op.
const CALLER = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER = "f6e5d4c3-b2a1-4f0e-9d8c-7b6a5f4e3d2c";

function readSeed() {
  const raw = process.env.PURGE_SEED;
  if (raw == null || raw === "") return DEFAULT_SEED;
  if (!/^\d+$/.test(raw)) throw new Error(`PURGE_SEED must be an unsigned integer, got ${raw}`);
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) throw new Error(`PURGE_SEED is out of range, got ${raw}`);
  return seed;
}

// mulberry32 (Tommy Ettinger). Seed is folded to uint32.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paths exercised on every seed, in the TypeScript half and the SQL half.
// Only caller/abc.jpg may be removed or inserted.
function fixedEdgePaths(caller, other) {
  return [
    { path: `${caller}/.`, accept: false },
    { path: `${caller}/..`, accept: false },
    { path: `${caller}/`, accept: false },
    { path: `/${caller}/x.jpg`, accept: false },
    { path: `${caller}/a\\b.jpg`, accept: false },
    { path: `${caller}/a/b.jpg`, accept: false },
    { path: `${other}/x.jpg`, accept: false },
    { path: `${caller.toUpperCase()}/x.jpg`, accept: false },
    { path: `${caller}//x.jpg`, accept: false },
    { path: `${caller}/abc.jpg`, accept: true },
  ];
}

function partsFor(caller, other) {
  return [
    caller,
    other,
    caller.toUpperCase(),
    "",
    ".",
    "..",
    "\\",
    "/",
    "%2e%2e",
    "．．",
    "‥",
    "‧",
    "∕",
    "／",
    "＼",
    "nested/seg",
  ];
}

function safeNames(parts) {
  return parts.filter((part) => part && part !== "." && part !== ".." && !part.includes("/") && !part.includes("\\"));
}

function buildPath(rng, parts, names) {
  const roll = rng();
  if (roll < 0.05) return "";
  if (roll < 0.3) return `${CALLER}/${names[Math.floor(rng() * names.length)]}`;
  const count = 1 + Math.floor(rng() * 4);
  const chosen = [];
  for (let i = 0; i < count; i++) chosen.push(parts[Math.floor(rng() * parts.length)]);
  const sep = rng() < 0.2 ? "\\" : "/";
  let path = chosen.join(sep);
  if (rng() < 0.15) path = "/" + path;
  return path;
}

// The shape purge-range is allowed to hand to bucket.remove.
function allowedPath(caller, path) {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  if (parts[0] !== caller) return false;
  const name = parts[1];
  if (name.length === 0 || name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  return true;
}

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

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

async function removePaths(photos) {
  const removed = [];
  let deletedIds = null;
  const admin = {
    from(table) {
      const api = {
        op: "select",
        select() { api.op = "select"; return api; },
        delete() { api.op = "delete"; return api; },
        eq() { return api; },
        gte() { return api; },
        lte() { return api; },
        in(_key, ids) { api.ids = ids; return api; },
        upsert() { return Promise.resolve({ error: null }); },
        maybeSingle() { return Promise.resolve({ data: { data: { purges: [] } }, error: null }); },
        then(resolve, reject) {
          if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
          const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
          return Promise.resolve(payload).then(resolve, reject);
        },
      };
      return api;
    },
    storage: { from() { return { remove(paths) { removed.push(...paths); return Promise.resolve({ error: null }); } }; } },
    rpc() { return Promise.resolve({ error: null }); },
  };
  const now = Date.parse("2026-10-04T16:00:00Z");
  const res = await deleteRange(admin, CALLER, { from: "2026-10-01", to: "2026-10-04", deletedAt: now - 1000 }, now);
  return { status: res.status, removed, deletedIds };
}

function assertPurge(got, photos, expected, where) {
  assert.equal(got.status, 200, where);
  assert.deepEqual(got.removed, expected, where);
  for (const path of got.removed) {
    assert.equal(path.startsWith(`${CALLER}/`), true, `${where} removed ${path}`);
    const name = path.slice(CALLER.length + 1);
    assert.equal(name.includes("/"), false, `${where} removed ${path}`);
    assert.equal(name.includes("\\"), false, `${where} removed ${path}`);
    assert.notEqual(name, "", where);
    assert.notEqual(name, ".", where);
    assert.notEqual(name, "..", where);
  }
  assert.deepEqual([...(got.deletedIds || [])].sort(), photos.map((photo) => photo.id).sort(), where);
}

test(`seeded purge paths stay inside the caller folder (${TRIALS} trials)`, async () => {
  const seed = readSeed();
  console.log(`PURGE_SEED=${seed}`);
  assert.notEqual(CALLER, CALLER.toUpperCase(), "caller uid needs hex a-f so the uppercase folder differs");
  assert.notEqual(OTHER, OTHER.toUpperCase(), "other uid needs hex a-f so it is not an all-digit stand-in");
  assert.match(CALLER, /[a-f]/);
  assert.match(OTHER, /[a-f]/);

  const edges = fixedEdgePaths(CALLER, OTHER);
  assert.equal(edges.filter((edge) => edge.accept).map((edge) => edge.path).join(","), `${CALLER}/abc.jpg`);
  assert.equal(edges.some((edge) => edge.path === `${CALLER}/.` && edge.accept === false), true);
  assert.equal(edges.some((edge) => edge.path.includes("\\") && edge.accept === false), true);

  const rng = mulberry32(seed);
  const parts = partsFor(CALLER, OTHER);
  const names = safeNames(parts);
  assert.ok(names.length > 0, "the part list has no legal file name");
  const accepted = new Set();
  const taken = new Date(Date.parse("2026-10-03T12:00:00Z")).toISOString();
  try {
    const edgePhotos = edges.map((edge, i) => ({ id: `edge-${i}`, path: edge.path, taken_at: taken }));
    const edgeWhere = `PURGE_SEED=${seed} fixed edges ${JSON.stringify(edges.map((edge) => edge.path))}`;
    const edgeGot = await removePaths(edgePhotos);
    assertPurge(edgeGot, edgePhotos, [`${CALLER}/abc.jpg`], edgeWhere);
    for (const edge of edges) {
      assert.equal(edgeGot.removed.includes(edge.path), edge.accept, `${edgeWhere} ${JSON.stringify(edge.path)}`);
      assert.equal(allowedPath(CALLER, edge.path), edge.accept, edge.path);
    }
    for (const path of edgeGot.removed) accepted.add(path);

    for (let trial = 0; trial < TRIALS; trial++) {
      const photos = [];
      for (let i = 0; i < PATHS_PER_TRIAL; i++) {
        photos.push({ id: `t${trial}-${i}`, path: buildPath(rng, parts, names), taken_at: taken });
      }
      const expected = photos.filter((photo) => allowedPath(CALLER, photo.path)).map((photo) => photo.path);
      const got = await removePaths(photos);
      const where = `PURGE_SEED=${seed} trial=${trial} paths=${JSON.stringify(photos.map((photo) => photo.path))}`;
      assertPurge(got, photos, expected, where);
      for (const path of got.removed) accepted.add(path);
    }
  } catch (err) {
    console.error(`PURGE_SEED=${seed}`);
    if (err && typeof err.message === "string" && !err.message.includes("PURGE_SEED=")) {
      err.message = `PURGE_SEED=${seed}\n${err.message}`;
    }
    throw err;
  }

  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  if (!initdb || !pgCtl || !psql) {
    console.log("skip SQL path check: PostgreSQL binaries not found");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "insight-purge-fuzz-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const started = { ok: false };
  function sql(text, extra = []) {
    return run(psql, [...base, ...extra, "-c", text], { env: { ...process.env, PGUSER: user } });
  }
  function sqlFile(file) {
    return run(psql, [...base, "-f", file], { env: { ...process.env, PGUSER: user } });
  }
  function insertSql(id, path) {
    return `insert into public.progress_photos (id, user_id, day, path) values (${sqlLiteral(id)}, ${sqlLiteral(CALLER)}::uuid, '2026-10-01', ${sqlLiteral(path)});`;
  }
  function asCaller(statement) {
    return `select set_config('request.jwt.claim.sub', ${sqlLiteral(CALLER)}, false); set role photo_user; ${statement}`;
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
        path text not null
      );
      alter table public.progress_photos enable row level security;
      -- The migration replaces insert and update only. Without a select policy,
      -- an update matches no rows and never evaluates its WITH CHECK.
      create policy "own photos: read" on public.progress_photos
        for select using (auth.uid() = user_id);
      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'photo_user') then
          create role photo_user nologin;
        end if;
      end
      $roles$;
      grant usage on schema public to photo_user;
      grant usage on schema auth to photo_user;
      grant execute on function auth.uid() to photo_user;
      grant select, insert, update on public.progress_photos to photo_user;
    `);
    assert.equal(setup.status, 0, setup.stderr);
    const applied = sqlFile(MIGRATION.pathname);
    assert.equal(applied.status, 0, applied.stderr);

    // Superuser inserts skip RLS, so this loop only exercises the CHECK.
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const inserted = sql(insertSql(edge.accept ? "edge-ok" : `edge-bad-${i}`, edge.path));
      if (edge.accept) {
        if (inserted.status !== 0) {
          throw new Error(`PURGE_SEED=${seed} CHECK rejected a fixed path TypeScript accepts: ${JSON.stringify(edge.path)}\n${inserted.stderr}`);
        }
      } else if (inserted.status === 0) {
        throw new Error(`PURGE_SEED=${seed} CHECK accepted a fixed path: ${JSON.stringify(edge.path)}`);
      } else if (!/progress_photos_path_owner/.test(inserted.stderr || "")) {
        throw new Error(`PURGE_SEED=${seed} CHECK failed for an unexpected reason: ${JSON.stringify(edge.path)}\n${inserted.stderr}`);
      }
    }

    const values = [...accepted];
    for (let i = 0; i < values.length; i++) {
      const path = values[i];
      // edge-ok already inserted the one accepted fixed path.
      if (path === `${CALLER}/abc.jpg`) continue;
      const inserted = sql(insertSql(`ok-${i}`, path));
      if (inserted.status !== 0) {
        throw new Error(`PURGE_SEED=${seed} SQL rejected a path TypeScript accepted: ${JSON.stringify(path)}\n${inserted.stderr}`);
      }
    }
    const acceptedCount = values.filter((path) => path !== `${CALLER}/abc.jpg`).length + 1;
    const counted = sql("select count(*) from public.progress_photos", ["-t", "-A"]);
    assert.equal(counted.status, 0, counted.stderr);
    assert.equal(Number(counted.stdout.trim()), acceptedCount);

    // photo_user is not the table owner, so the insert and update policies apply.
    // request.jwt.claim.sub is the caller. A path the policy allows that the CHECK
    // rejects would surface as the constraint; these must fail the policy itself.
    const rlsOk = sql(asCaller(insertSql("rls-ok", `${CALLER}/abc.jpg`)));
    if (rlsOk.status !== 0) {
      throw new Error(`PURGE_SEED=${seed} RLS rejected a caller-owned file\n${rlsOk.stderr}`);
    }
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (edge.accept) continue;
      const inserted = sql(asCaller(insertSql(`rls-bad-${i}`, edge.path)));
      if (inserted.status === 0) {
        throw new Error(`PURGE_SEED=${seed} RLS insert accepted a fixed path: ${JSON.stringify(edge.path)}`);
      }
      if (!/row-level security policy/.test(inserted.stderr || "")) {
        throw new Error(`PURGE_SEED=${seed} RLS insert did not apply the path policy: ${JSON.stringify(edge.path)}\n${inserted.stderr}`);
      }
      const updated = sql(asCaller(`update public.progress_photos set path = ${sqlLiteral(edge.path)} where id = 'edge-ok';`));
      if (updated.status === 0) {
        throw new Error(`PURGE_SEED=${seed} RLS update accepted a fixed path: ${JSON.stringify(edge.path)}\n${updated.stdout}`);
      }
      if (!/row-level security policy/.test(updated.stderr || "")) {
        throw new Error(`PURGE_SEED=${seed} RLS update did not apply the path policy: ${JSON.stringify(edge.path)}\n${updated.stderr}`);
      }
    }
    const kept = sql("select path from public.progress_photos where id = 'edge-ok'", ["-t", "-A"]);
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout.trim(), `${CALLER}/abc.jpg`);

    const renamed = sql(asCaller(`update public.progress_photos set path = ${sqlLiteral(`${CALLER}/renamed.jpg`)} where id = 'edge-ok';`));
    if (renamed.status !== 0) {
      throw new Error(`PURGE_SEED=${seed} RLS update rejected a caller-owned file\n${renamed.stderr}`);
    }
    const after = sql("select path from public.progress_photos where id = 'edge-ok'", ["-t", "-A"]);
    assert.equal(after.status, 0, after.stderr);
    assert.equal(after.stdout.trim(), `${CALLER}/renamed.jpg`);
  } catch (err) {
    console.error(`PURGE_SEED=${seed}`);
    if (err && typeof err.message === "string" && !err.message.includes("PURGE_SEED=")) {
      err.message = `PURGE_SEED=${seed}\n${err.message}`;
    }
    throw err;
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});
