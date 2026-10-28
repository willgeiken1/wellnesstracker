import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { serverDatabase, asUser } from "./pglite";
import { OWNER_A, OWNER_B, DEVICE_A } from "../../fixtures/sync";
import { legacyV2 } from "../../fixtures/pwa-import";
import {
  normalizePwa,
  importId,
} from "../../../supabase/functions/_shared/pwa-import";
import { pwaExerciseBank } from "../../../supabase/functions/_shared/pwa-bank";
let db: PGlite;
beforeEach(async () => {
  db = await serverDatabase();
  await db.exec(`CREATE TABLE public.user_data(user_id uuid PRIMARY KEY REFERENCES auth.users(id),data jsonb);
 CREATE TABLE public.progress_photos(id text,user_id uuid,path text,taken_at timestamptz,day date,pose text);
 CREATE TABLE public.oura_connections(user_id uuid PRIMARY KEY, connected boolean);
 INSERT INTO public.oura_connections VALUES('${OWNER_A}',true);`);
  await db.query("INSERT INTO public.user_data VALUES($1,$2)", [
    OWNER_A,
    JSON.stringify({ ...legacyV2, restSeconds: 90 }),
  ]);
  const social = readFileSync(
    join(
      __dirname,
      "../../../supabase/migrations/20261012120000_social_schema.sql",
    ),
    "utf8",
  );
  await db.exec(
    social.slice(
      social.indexOf("create or replace function public.delete_user_rows"),
    ),
  );
  await db.exec(
    readFileSync(
      join(
        __dirname,
        "../../../supabase/migrations/20261027190000_pwa_import.sql",
      ),
      "utf8",
    ),
  );
});
afterEach(async () => {
  await db?.close();
});
const snapshot = (owner = OWNER_A) =>
  asUser(db, owner, (tx) =>
    tx.query<{
      v: {
        snapshot: { blob: unknown };
        completed: boolean;
        plan: unknown;
        preview_id: string;
      };
    }>("SELECT public.native_pwa_snapshot() AS v"),
  );
const plan = () => normalizePwa(legacyV2, pwaExerciseBank);
const rows = () =>
  plan().rows.map((r) => ({
    ...r,
    data:
      r.table === "sets"
        ? Object.fromEntries(
            Object.entries(r.data).filter(([k]) => k !== "tag"),
          )
        : r.data,
    owner_id: OWNER_A,
    device_id: DEVICE_A,
    updated_at: 1,
    deleted_at: null,
  }));
test("snapshot owner-isolated, frozen once, omits checkins and device settings", async () => {
  const first = (await snapshot()).rows[0].v;
  expect(first.snapshot.blob).toMatchObject({ restSeconds: 90 });
  expect(JSON.stringify(first)).not.toMatch(
    /ignored-fixture|analytics|appLock/,
  );
  await db.query("UPDATE public.user_data SET data=$1 WHERE user_id=$2", [
    JSON.stringify({ sessions: [] }),
    OWNER_A,
  ]);
  expect((await snapshot()).rows[0].v).toEqual(first);
  expect((await snapshot(OWNER_B)).rows[0].v.snapshot.blob).toEqual({
    version: 2,
    sessions: [],
    workouts: [],
  });
  await expect(
    asUser(db, OWNER_B, (tx) =>
      tx.query("UPDATE public.native_pwa_imports SET completed=true"),
    ),
  ).rejects.toThrow();
});
test("failed batch rolls back all rows and leaves completion unset", async () => {
  const bad = [...rows(), { ...rows()[0], table: "not_allowed" }];
  await expect(
    asUser(db, OWNER_A, (tx) =>
      tx.query(
        "SELECT public.native_pwa_commit($1,$2,(SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=auth.uid()))",
        [JSON.stringify(plan()), JSON.stringify(bad)],
      ),
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM public.sessions",
      )
    ).rows[0].n,
  ).toBe(0);
  expect((await snapshot()).rows[0].v.completed).toBe(false);
});
test("commit is one transaction, twice adds nothing and Oura stays connected", async () => {
  await snapshot();
  const existing = rows().find((r) => r.table === "sessions")!;
  await asUser(db, OWNER_A, (tx) =>
    tx.query("SELECT public.sync_push($1)", [
      JSON.stringify([
        {
          ...existing,
          updated_at: 500,
          data: { ...existing.data, name: "Native edit" },
        },
      ]),
    ]),
  );
  const commit = () =>
    asUser(db, OWNER_A, (tx) =>
      tx.query<{ v: boolean }>(
        "SELECT public.native_pwa_commit($1,$2,(SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=auth.uid())) AS v",
        [JSON.stringify(plan()), JSON.stringify(rows())],
      ),
    );
  expect((await commit()).rows[0].v).toBe(true);
  const before = await db.query("SELECT * FROM public.sessions");
  expect(before.rows).toHaveLength(1);
  expect(before.rows[0]).toMatchObject({ name: "Native edit" });
  expect((await commit()).rows[0].v).toBe(false);
  expect((await db.query("SELECT * FROM public.sessions")).rows).toEqual(
    before.rows,
  );
  expect((await snapshot()).rows[0].v.completed).toBe(true);
  expect(
    (
      await db.query(
        "SELECT snapshot, plan FROM public.native_pwa_imports WHERE owner_id=$1",
        [OWNER_A],
      )
    ).rows[0],
  ).toEqual({ snapshot: {}, plan: null });
  expect(
    (
      await db.query<{ connected: boolean }>(
        "SELECT connected FROM public.oura_connections",
      )
    ).rows[0].connected,
  ).toBe(true);
});
test("RPCs reject signed-out execution and cross-owner rows", async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE anon");
      return tx.query("SELECT public.native_pwa_snapshot()");
    }),
  ).rejects.toThrow();
  await expect(
    asUser(db, OWNER_B, (tx) =>
      tx.query(
        "SELECT public.native_pwa_commit($1,$2,(SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=auth.uid()))",
        [JSON.stringify(plan()), JSON.stringify(rows())],
      ),
    ),
  ).rejects.toThrow();
});

const commitRows = (batch = rows()) =>
  asUser(db, OWNER_A, (tx) =>
    tx.query<{ v: boolean }>(
      "SELECT public.native_pwa_commit($1,$2,(SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=auth.uid())) AS v",
      [JSON.stringify(plan()), JSON.stringify(batch)],
    ),
  );
test("range purge wipes snapshot and raw plan, blocks resurrection, isolates owners", async () => {
  await snapshot();
  await snapshot(OWNER_B);
  await db.query(
    "UPDATE public.native_pwa_imports SET plan=$1 WHERE owner_id=$2",
    [JSON.stringify(plan()), OWNER_A],
  );
  await db.query(
    "SELECT public.purge_user_range_rows($1,'2026-01-02','2026-01-02')",
    [OWNER_A],
  );
  expect(
    (
      await db.query(
        "SELECT snapshot,plan,completed FROM public.native_pwa_imports WHERE owner_id=$1",
        [OWNER_A],
      )
    ).rows[0],
  ).toEqual({ snapshot: {}, plan: null, completed: true });
  expect((await commitRows()).rows[0].v).toBe(false);
  expect((await db.query("SELECT * FROM public.sessions")).rows).toHaveLength(
    0,
  );
  expect((await snapshot(OWNER_B)).rows[0].v.completed).toBe(false);
});
test("account delete explicitly clears archives before auth deletion", async () => {
  await snapshot();
  await snapshot(OWNER_B);
  await db.query("SELECT public.delete_user_rows($1)", [OWNER_A]);
  expect(
    (
      await db.query(
        "SELECT * FROM public.native_pwa_imports WHERE owner_id=$1",
        [OWNER_A],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(commitRows()).rejects.toThrow("Preview required");
  expect((await snapshot(OWNER_B)).rows[0].v.completed).toBe(false);
});
test("commit refuses snapshots older than fifteen minutes", async () => {
  await snapshot();
  await db.query(
    "UPDATE public.native_pwa_imports SET created_at=now()-interval '16 minutes' WHERE owner_id=$1",
    [OWNER_A],
  );
  await expect(commitRows()).rejects.toThrow(/expired/i);
  expect((await db.query("SELECT * FROM public.sessions")).rows).toHaveLength(
    0,
  );
});
test.each(["owner_id", "id"])(
  "direct RPC refuses nested %s even on an already present row",
  async (field) => {
    await snapshot();
    const session = rows().find((r) => r.table === "sessions")!;
    await asUser(db, OWNER_A, (tx) =>
      tx.query("SELECT public.sync_push($1)", [JSON.stringify([session])]),
    );
    await expect(
      commitRows([{ ...session, data: { ...session.data, [field]: OWNER_B } }]),
    ).rejects.toThrow();
    expect((await snapshot()).rows[0].v.completed).toBe(false);
    expect(
      (
        await db.query("SELECT * FROM public.sessions WHERE owner_id=$1", [
          OWNER_B,
        ])
      ).rows,
    ).toHaveLength(0);
  },
);
test("direct RPC refuses cross-owner rows with a valid caller preview", async () => {
  await snapshot(OWNER_B);
  await expect(
    asUser(db, OWNER_B, (tx) =>
      tx.query(
        "SELECT public.native_pwa_commit($1,$2,(SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=auth.uid()))",
        [JSON.stringify(plan()), JSON.stringify(rows())],
      ),
    ),
  ).rejects.toThrow();
  expect((await db.query("SELECT * FROM public.sessions")).rows).toHaveLength(
    0,
  );
});
test("retry beyond the first 100-row batch remains atomic and idempotent", async () => {
  await snapshot();
  const session = rows().find((r) => r.table === "sessions")!;
  const batch = Array.from({ length: 101 }, (_, i) => ({
    ...session,
    id: importId("retry:" + i),
  }));
  await expect(
    commitRows([...batch, { ...session, table: "not_allowed" }]),
  ).rejects.toThrow();
  expect((await db.query("SELECT * FROM public.sessions")).rows).toHaveLength(
    0,
  );
  expect((await snapshot()).rows[0].v.completed).toBe(false);
  expect((await commitRows(batch)).rows[0].v).toBe(true);
  expect((await commitRows(batch)).rows[0].v).toBe(false);
  expect((await db.query("SELECT * FROM public.sessions")).rows).toHaveLength(
    101,
  );
});

test("explicit re-preview replaces an expired archive and refuses its old token", async () => {
  const old = (await snapshot()).rows[0].v.preview_id;
  await db.query(
    "UPDATE public.native_pwa_imports SET created_at=now()-interval '16 minutes' WHERE owner_id=$1",
    [OWNER_A],
  );
  await db.query("UPDATE public.user_data SET data=$1 WHERE user_id=$2", [
    JSON.stringify({ version: 2, sessions: [], workouts: [] }),
    OWNER_A,
  ]);
  await asUser(db, OWNER_A, (tx) =>
    tx.query("SELECT public.native_pwa_snapshot(true)"),
  );
  await expect(
    asUser(db, OWNER_A, (tx) =>
      tx.query("SELECT public.native_pwa_commit($1,$2,$3)", [
        JSON.stringify(plan()),
        JSON.stringify(rows()),
        old,
      ]),
    ),
  ).rejects.toThrow("preview changed");
  expect((await snapshot()).rows[0].v.snapshot.blob).toEqual({
    version: 2,
    sessions: [],
    workouts: [],
  });
});

test("native row-range purge also invalidates pending raw archives", async () => {
  await snapshot();
  await asUser(db, OWNER_A, (tx) =>
    tx.query(
      "SELECT public.sync_purge_range($1,'2026-01-02','2026-01-02',1800000000000,'UTC')",
      [importId("native-purge")],
    ),
  );
  expect((await commitRows()).rows[0].v).toBe(false);
  expect(
    (
      await db.query(
        "SELECT snapshot,plan FROM public.native_pwa_imports WHERE owner_id=$1",
        [OWNER_A],
      )
    ).rows[0],
  ).toEqual({ snapshot: {}, plan: null });
});
test("oversized snapshot is refused before any raw archive is saved", async () => {
  await db.query("UPDATE public.user_data SET data=$1 WHERE user_id=$2", [
    JSON.stringify({
      sessions: [],
      machineNotes: { fixture: "x".repeat(5 * 1024 * 1024) },
    }),
    OWNER_A,
  ]);
  await expect(snapshot()).rejects.toThrow("Import too large");
  expect(
    (await db.query("SELECT * FROM public.native_pwa_imports")).rows,
  ).toHaveLength(0);
});
