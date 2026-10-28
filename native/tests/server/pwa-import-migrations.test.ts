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
      .toEqual([{ snapshot: {}, plan: null, completed: true }]);
    expect((await db.query("SELECT completed FROM public.native_pwa_imports WHERE owner_id=$1", [OWNER_B])).rows)
      .toEqual([{ completed: false }]);
    await asUser(db, OWNER_A, async (tx) => {
      const receipt = await tx.query<{ v: { completed: boolean; snapshot: unknown; plan: unknown } }>(
        "SELECT public.native_pwa_snapshot(true) AS v",
      );
      expect(receipt.rows[0].v).toMatchObject({ completed: true, snapshot: {}, plan: null });
      expect((await tx.query("SELECT public.native_pwa_commit('{}','[]',NULL) AS imported")).rows)
        .toEqual([{ imported: false }]);
    });
    await db.query("SELECT public.delete_user_rows($1)", [OWNER_B]);
    expect((await db.query("SELECT * FROM public.native_pwa_imports WHERE owner_id=$1", [OWNER_B])).rows)
      .toEqual([]);
    // A purge before any preview must also prevent refreezing the legacy blob.
    await db.query("SELECT public.purge_user_range_rows($1,'2026-01-02','2026-01-02')", [OWNER_B]);
    await asUser(db, OWNER_B, async (tx) => {
      expect((await tx.query<{ v: { completed: boolean; snapshot: unknown; plan: unknown } }>(
        "SELECT public.native_pwa_snapshot(true) AS v",
      )).rows[0].v).toMatchObject({ completed: true, snapshot: {}, plan: null });
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
      .toEqual([{snapshot:{},plan:null,completed:true}]);
  } finally { await db.close(); }
});
