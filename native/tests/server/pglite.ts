import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { OWNER_A, OWNER_B } from '../../fixtures/sync';
import { syncedTables, fromWire, type Table, type Row } from '../../src/data/rows';
import type { Transport } from '../../src/data/sync/engine';
export async function serverDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA auth, public TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    INSERT INTO auth.users VALUES ('${OWNER_A}'), ('${OWNER_B}');`);
  await db.exec(readFileSync(require('node:path').join(__dirname,'../../server/row-sync/0001_row_sync.sql'),'utf8'));
  return db;
}
export async function asUser<T>(db: PGlite, owner: string, operation: (tx: Parameters<Parameters<PGlite['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
    return operation(tx);
  });
}
export function testTransport(db: PGlite, owner: string): Transport {
  return {
    owner,
    async push(rows: Row[]) { await asUser(db,owner,tx => tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify(rows)])); },
    async pull(table: Table, after: string, limit: number) {
      if (!syncedTables.includes(table)) throw new Error('Invalid table');
      return asUser(db,owner,async tx => {
        const result = await tx.query<Record<string,unknown>>(`SELECT t.*, t.server_seq::text AS server_seq FROM public.${table} t WHERE owner_id=$1 AND t.server_seq>$2::bigint ORDER BY t.server_seq LIMIT $3`,[owner,after,limit]);
        return result.rows.map(r => fromWire(table,r));
      });
    },
  };
}
