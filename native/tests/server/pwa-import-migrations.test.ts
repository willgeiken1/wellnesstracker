import { OWNER_A, OWNER_B } from "../../fixtures/sync";
import { asUser, migratedDatabase } from "./pglite";

test("CI migration chain loads without native row-sync tables and privacy RPCs erase import archives", async () => {
  const db = await migratedDatabase();
  try {
    expect((await db.query("SELECT to_regclass('public.purges') AS relation")).rows[0])
      .toEqual({ relation: null });
    await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [OWNER_A, OWNER_B]);
    for (const owner of [OWNER_A, OWNER_B]) {
      await db.query(`INSERT INTO public.native_pwa_imports(owner_id,snapshot,plan)
        VALUES ($1,'{"synthetic":"snapshot"}','{"synthetic":"raw plan"}')`, [owner]);
    }
    await db.query("SELECT public.purge_user_range_rows($1,'2026-01-02','2026-01-02')", [OWNER_A]);
    expect((await db.query("SELECT snapshot,plan,completed FROM public.native_pwa_imports WHERE owner_id=$1", [OWNER_A])).rows)
      .toEqual([]);
    expect((await db.query("SELECT completed FROM public.native_pwa_imports WHERE owner_id=$1", [OWNER_B])).rows)
      .toEqual([{ completed: false }]);
    await asUser(db, OWNER_A, async (tx) => {
      const receipt = await tx.query<{ v: { completed: boolean; snapshot: unknown; plan: unknown } }>(
        "SELECT public.native_pwa_snapshot(true) AS v",
      );
      expect(receipt.rows[0].v).toMatchObject({ completed: false, plan: null });
      expect((await tx.query("SELECT public.native_pwa_commit('{}','[]',NULL) AS imported")).rows)
        .toEqual([{ imported: null }]);
    });
    await db.query("SELECT public.delete_user_rows($1)", [OWNER_B]);
    expect((await db.query("SELECT * FROM public.native_pwa_imports WHERE owner_id=$1", [OWNER_B])).rows)
      .toEqual([]);
    // A purge before any preview must allow a new filtered preview.
    await db.query("SELECT public.purge_user_range_rows($1,'2026-01-02','2026-01-02')", [OWNER_B]);
    await asUser(db, OWNER_B, async (tx) => {
      expect((await tx.query<{ v: { completed: boolean; snapshot: unknown; plan: unknown } }>(
        "SELECT public.native_pwa_snapshot(true) AS v",
      )).rows[0].v).toMatchObject({ completed: false, plan: null });
    });
  } finally {
    await db.close();
  }
});

test("row-sync before the importer also installs exactly one working purge trigger", async () => {
  const db = await migratedDatabase(true);
  try {
    expect((await db.query(`SELECT tgname FROM pg_trigger
      WHERE tgrelid='public.purges'::regclass AND tgname='native_pwa_purge' AND NOT tgisinternal`)).rows)
      .toEqual([{tgname:"native_pwa_purge"}]);
    await db.query("INSERT INTO auth.users VALUES ($1)", [OWNER_A]);
    await asUser(db, OWNER_A, async tx => {
      await tx.query("SELECT public.native_pwa_snapshot()");
      await tx.query("SELECT public.sync_purge_range($1,'2026-01-02','2026-01-02',1800000000000,'UTC')", [OWNER_B]);
    });
    expect((await db.query("SELECT snapshot,plan,completed FROM public.native_pwa_imports")).rows)
      .toEqual([]);
  } finally { await db.close(); }
});


test("purge predating the importer is retained without blocking the first preview", async () => {
  const db = await migratedDatabase(true, async before => {
    await before.query("INSERT INTO auth.users VALUES ($1)", [OWNER_A]);
    await asUser(before, OWNER_A, tx => tx.query(
      "SELECT public.sync_purge_range($1,'2026-01-02','2026-01-02',1000,'UTC')", [OWNER_B]));
  });
  try {
    const receipt = await asUser(db, OWNER_A, tx => tx.query<{v: {completed: boolean; snapshot: {purges: unknown[]}}}>(
      "SELECT public.native_pwa_snapshot() AS v"));
    expect(receipt.rows[0].v.completed).toBe(false);
    expect(receipt.rows[0].v.snapshot.purges).toEqual([
      {from_day:"2026-01-02",to_day:"2026-01-02",cutoff_ms:1000,tz:"UTC"},
    ]);
    await asUser(db, OWNER_B, async tx => {
      expect((await tx.query("SELECT * FROM public.native_pwa_purges")).rows).toEqual([]);
    });
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query("SELECT has_table_privilege($1,'public.native_pwa_purges','INSERT,UPDATE,DELETE') AS allowed",[role])).rows)
        .toEqual([{allowed:false}]);
    }
    await db.query("SELECT public.delete_user_rows($1)", [OWNER_A]);
    expect((await db.query("SELECT * FROM public.native_pwa_purges")).rows).toEqual([]);
  } finally { await db.close(); }
});
