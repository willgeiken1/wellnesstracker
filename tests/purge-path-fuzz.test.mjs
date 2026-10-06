import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
const CALLER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function readSeed() {
  const raw = process.env.PURGE_SEED;
  if (raw == null || raw === "") return DEFAULT_SEED;
  if (!/^\d+$/.test(raw)) throw new Error(`PURGE_SEED must be an unsigned integer, got ${raw}`);
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) throw new Error(`PURGE_SEED is out of range, got ${raw}`);
  return seed;
}

function mulberry(seed) {
  let rng = seed >>> 0;
  return () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
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

test(`seeded purge paths stay inside the caller folder (${TRIALS} trials)`, async () => {
  const seed = readSeed();
  const rng = mulberry(seed);
  const parts = partsFor(CALLER, OTHER);
  const names = safeNames(parts);
  assert.ok(names.length > 0, "the part list has no legal file name");
  const accepted = new Set();
  try {
    for (let trial = 0; trial < TRIALS; trial++) {
      const taken = new Date(Date.parse("2026-10-03T12:00:00Z")).toISOString();
      const photos = [];
      for (let i = 0; i < PATHS_PER_TRIAL; i++) {
        photos.push({ id: `t${trial}-${i}`, path: buildPath(rng, parts, names), taken_at: taken });
      }
      const expected = photos.filter((photo) => allowedPath(CALLER, photo.path)).map((photo) => photo.path);
      const got = await removePaths(photos);
      const where = `PURGE_SEED=${seed} trial=${trial} paths=${JSON.stringify(photos.map((photo) => photo.path))}`;
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
    `);
    assert.equal(setup.status, 0, setup.stderr);
    const applied = sqlFile(MIGRATION.pathname);
    assert.equal(applied.status, 0, applied.stderr);

    const values = [...accepted];
    if (!values.length) return;
    for (let i = 0; i < values.length; i++) {
      const path = values[i];
      const quoted = path.replaceAll("'", "''");
      const inserted = sql(`
        insert into public.progress_photos (id, user_id, day, path)
        values ('ok-${i}', '${CALLER}', '2026-10-01', '${quoted}');
      `);
      if (inserted.status !== 0) {
        throw new Error(`PURGE_SEED=${seed} SQL rejected a path TypeScript accepted: ${JSON.stringify(path)}\n${inserted.stderr}`);
      }
    }
    assert.equal(Number(sql("select count(*) from public.progress_photos", ["-t", "-A"]).stdout.trim()), values.length);
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
