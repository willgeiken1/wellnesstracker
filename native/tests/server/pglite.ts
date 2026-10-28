import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_A, OWNER_B } from '../../fixtures/sync';
import { syncedTables, canonicalRow, fromWire, type Table, type Row } from '../../src/data/rows';
import { DEFAULT_SYNC_FLAGS, type SyncFlags } from '../../src/data/sync/flags';
import type { Transport } from '../../src/data/sync/engine';
export async function serverDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA auth, public TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${OWNER_A}'), ('${OWNER_B}');`);
  await db.exec(readFileSync(require('node:path').join(__dirname,'../../server/row-sync/0001_row_sync.sql'),'utf8'));
  await db.exec(readFileSync(require('node:path').join(__dirname,'../../server/row-sync/0002_v1_columns.sql'),'utf8'));
  return db;
}
export async function asUser<T>(db: PGlite, owner: string, operation: (tx: Parameters<Parameters<PGlite['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
    return operation(tx);
  });
}
export function testTransport(db: PGlite, owner: string, syncFlags: SyncFlags = DEFAULT_SYNC_FLAGS) {
  return {
    syncFlags,
    owner,
    async push(rows: Row[]) {
      const result=await asUser(db,owner,tx => tx.query<{sync_push:Row[]}>('SELECT public.sync_push($1::jsonb)',[JSON.stringify(rows)]));
      return result.rows[0].sync_push.map(canonicalRow);
    },
    async pull(table: Table, after: string, limit: number) {
      if (!syncedTables.includes(table)) throw new Error('Invalid table');
      return asUser(db,owner,async tx => {
        const result = await tx.query<Record<string,unknown>>(`SELECT t.*, t.server_seq::text AS server_seq FROM public.${table} t WHERE owner_id=$1 AND t.server_seq>$2::bigint ORDER BY t.server_seq LIMIT $3`,[owner,after,limit]);
        return result.rows.map(r => fromWire(table,r));
      });
    },
  } satisfies Transport;
}

/** CI migration chain first; row-sync drafts are installed separately afterwards. */
export async function migratedDatabase(rowSyncFirst = false) {
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
    if (rowSyncFirst) {
      for (const file of ["0001_row_sync.sql", "0002_v1_columns.sql"]) {
        await db.exec(readFileSync(join(__dirname, "../../server/row-sync", file), "utf8"));
      }
    }
    const directory = join(__dirname, "../../../supabase/migrations");
    for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(directory, file), "utf8"));
    }
    return db;
  } catch (error) { await db.close(); throw error; }
}
