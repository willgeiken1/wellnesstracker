import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { OWNER_A, OWNER_B } from '../../fixtures/sync';
import { syncedTables, canonicalRow, fromWire, type Table, type Row } from '../../src/data/rows';
import { DEFAULT_SYNC_FLAGS, type SyncFlags } from '../../src/data/sync/flags';
import type { Transport } from '../../src/data/sync/engine';
export async function serverDatabase(applySql?: string) {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA auth, public TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  if (applySql) await db.exec(applySql);
  else {
    await db.exec(readFileSync(require('node:path').join(__dirname,'../../server/row-sync/0001_row_sync.sql'),'utf8'));
    await db.exec(readFileSync(require('node:path').join(__dirname,'../../server/row-sync/0002_v1_columns.sql'),'utf8'));
  }
  await db.exec(`INSERT INTO auth.users VALUES ('${OWNER_A}'), ('${OWNER_B}');`);
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
