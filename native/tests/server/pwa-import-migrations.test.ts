import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OWNER_A, OWNER_B } from "../../fixtures/sync";
import { asUser } from "./pglite";

test("CI migration chain loads without native row-sync tables and privacy RPCs erase import archives", async () => {
  const db = new PGlite();
  try {
    // Match the Node tests job's Supabase stubs, without row-sync/0001 or 0002.
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
        file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text REFERENCES storage.buckets(id), name text, owner uuid);
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
        AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    `);
    const directory = join(__dirname, "../../../supabase/migrations");
    for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(directory, file), "utf8"));
    }
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
