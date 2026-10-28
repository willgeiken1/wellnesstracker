import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { serverDatabase, asUser } from "./pglite";
import { OWNER_A, OWNER_B, DEVICE_A } from "../../fixtures/sync";
import { legacyV2 } from "../../fixtures/pwa-import";
import { normalizePwa } from "../../../supabase/functions/_shared/pwa-import";
import { pwaExerciseBank } from "../../../supabase/functions/_shared/pwa-bank";
let db: PGlite;
beforeAll(async () => {
  db = await serverDatabase();
  await db.exec(`CREATE TABLE public.user_data(user_id uuid PRIMARY KEY REFERENCES auth.users(id),data jsonb);
 CREATE TABLE public.progress_photos(id text,user_id uuid,path text,taken_at timestamptz,day date,pose text);
 CREATE TABLE public.oura_connections(user_id uuid PRIMARY KEY, connected boolean);
 INSERT INTO public.oura_connections VALUES('${OWNER_A}',true);`);
  await db.query("INSERT INTO public.user_data VALUES($1,$2)", [
    OWNER_A,
    JSON.stringify(legacyV2),
  ]);
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
afterAll(async () => {
  await db?.close();
});
const snapshot = (owner = OWNER_A) =>
  asUser(db, owner, (tx) =>
    tx.query<{
      v: { snapshot: { blob: unknown }; completed: boolean; plan: unknown };
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
      tx.query("SELECT public.native_pwa_commit($1,$2)", [
        JSON.stringify(plan()),
        JSON.stringify(bad),
      ]),
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
      tx.query<{ v: boolean }>("SELECT public.native_pwa_commit($1,$2) AS v", [
        JSON.stringify(plan()),
        JSON.stringify(rows()),
      ]),
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
      tx.query("SELECT public.native_pwa_commit($1,$2)", [
        JSON.stringify(plan()),
        JSON.stringify(rows()),
      ]),
    ),
  ).rejects.toThrow();
});
