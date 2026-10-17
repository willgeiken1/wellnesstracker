import { sql, type SQL } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { columns, syncedTables, canonicalRow, compareRows, revision, validateRow, type Row, type Table, type Scalar, type ServerRow } from './rows';

type Physical = Record<string, Scalar>;
export interface Pending { row: Row; revision: string }
export class Repository {
  private listeners = new Set<() => void>();
  constructor(private db: ExpoSQLiteDatabase, readonly owner: string, readonly device: string, private uuid: () => string) {}
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private safe<T>(operation: () => T): T { try { return operation(); } catch { throw new Error('Local data is unavailable.'); } }
  private table(table: Table) { if (!syncedTables.includes(table)) throw new Error('Unsupported local table.'); return sql.identifier(table); }
  private state(key: string) { return this.db.get<{value:string}>(sql`SELECT value FROM sync_state WHERE owner_id=${this.owner} AND key=${key}`)?.value; }
  private setState(key: string, value: string) { this.db.run(sql`INSERT INTO sync_state(owner_id,key,value) VALUES(${this.owner},${key},${value}) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value`); }
  private decode(table: Table, physical: Physical): Row {
    const { owner_id, id, updated_at, deleted_at, device_id, ...data } = physical;
    return { table, owner_id: String(owner_id), id: String(id), updated_at: Number(updated_at), deleted_at: deleted_at === null ? null : Number(deleted_at), device_id: String(device_id), data };
  }
  private write(row: Row) {
    const data = {owner_id: row.owner_id, id: row.id, updated_at: row.updated_at, deleted_at: row.deleted_at, device_id: row.device_id, ...row.data};
    const keys = Object.keys(data);
    const fields = sql.join(keys.map(k => sql.identifier(k)), sql`, `);
    const values = sql.join(Object.values(data).map(v => sql`${v}`), sql`, `);
    const updates = sql.join(keys.filter(k => !['owner_id','id'].includes(k)).map(k => sql`${sql.identifier(k)}=excluded.${sql.identifier(k)}`), sql`, `);
    this.db.run(sql`INSERT INTO ${this.table(row.table)} (${fields}) VALUES (${values}) ON CONFLICT(owner_id,id) DO UPDATE SET ${updates}`);
  }
  get(table: Table, id: string): Row | undefined {
    return this.safe(() => { const value = this.db.get<Physical>(sql`SELECT * FROM ${this.table(table)} WHERE owner_id=${this.owner} AND id=${id}`); return value ? this.decode(table, value) : undefined; });
  }
  list(table: Table, includeDeleted = false): Row[] {
    return this.safe(() => this.db.all<Physical>(sql`SELECT * FROM ${this.table(table)} WHERE owner_id=${this.owner} ${includeDeleted ? sql`` : sql`AND deleted_at IS NULL`} ORDER BY id`).map(r => this.decode(table,r)));
  }
  /** One synchronous transaction commits both row and outbox before notifying subscribers. */
  putLocal(input: Row): void {
    this.safe(() => {
      if (input.owner_id !== this.owner || input.device_id !== this.device) throw new Error('Owner/device mismatch.');
      const healthLocal = input.table === 'weigh_ins' && input.data.source !== 'app';
      if (healthLocal && !['healthkit','health_connect'].includes(String(input.data.source))) throw new Error('Invalid provenance.');
      validateRow(healthLocal ? {...input, data: {...input.data, source:'app'}} : input);
      const previous = this.get(input.table, input.id);
      if (previous && previous.table === 'weigh_ins' && previous.data.source !== input.data.source) throw new Error('Provenance is immutable.');
      const row = healthLocal ? { ...input, data: Object.fromEntries(Object.keys(columns[input.table]).map(k => [k,input.data[k] ?? null])) } : canonicalRow(input);
      if (previous && compareRows(row, previous) <= 0) return;
      this.db.transaction(() => {
        this.write(row);
        const clock = Math.max(Number(this.state('clock') ?? 0), row.updated_at);
        this.setState('clock', String(clock));
        if (this.owner !== 'demo' && this.owner !== 'guest' && !healthLocal) {
          this.db.run(sql`INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(${this.owner},${row.table},${row.id},${revision(row)}) ON CONFLICT(owner_id,table_name,row_id) DO UPDATE SET revision=excluded.revision`);
        }
      });
      this.listeners.forEach(listener => listener());
    });
  }
  save(table: Table, data: Row['data'], id = this.uuid(), now = Date.now()): Row {
    const stamp = this.safe(() => Math.max(now, Number(this.state('clock') ?? 0) + 1));
    const row: Row = {table, owner_id:this.owner, device_id:this.device, id, updated_at:stamp, deleted_at:null, data};
    this.putLocal(row); return row;
  }
  remove(table: Table, id: string, now = Date.now()) {
    const row = this.get(table,id); if (!row) return;
    const stamp = this.safe(() => Math.max(now, Number(this.state('clock') ?? 0) + 1));
    this.putLocal({...row,device_id:this.device,updated_at:stamp,deleted_at:stamp});
  }
  pending(): Pending[] {
    return this.safe(() => this.db.all<{table_name:Table;row_id:string;revision:string}>(sql`SELECT table_name,row_id,revision FROM sync_outbox WHERE owner_id=${this.owner} ORDER BY table_name,row_id`).map(item => {
      const row = this.get(item.table_name,item.row_id); if (!row) throw new Error('Invalid outbox.'); validateRow(row); return {row,revision:item.revision};
    }));
  }
  ack(items: Pending[]) {
    this.safe(() => this.db.transaction(() => { for (const item of items) {
      if (item.row.owner_id !== this.owner) throw new Error('Owner mismatch.');
      this.db.run(sql`DELETE FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${item.row.table} AND row_id=${item.row.id} AND revision=${item.revision}`);
    }}));
    this.listeners.forEach(listener => listener());
  }
  cursor(table: Table) { return this.safe(() => this.state(`cursor:${table}`) ?? '0'); }
  applyPage(table: Table, page: ServerRow[], cursor: string) {
    this.safe(() => this.db.transaction(() => {
      this.table(table);
      if (!/^\d+$/.test(cursor) || BigInt(cursor) < BigInt(this.cursor(table))) throw new Error('Invalid cursor.');
      let clock = Number(this.state('clock') ?? 0);
      for (const remote of page) {
        const row = canonicalRow(remote.row);
        if (row.owner_id !== this.owner || row.table !== table || !/^\d+$/.test(remote.server_seq) || BigInt(remote.server_seq) > BigInt(cursor)) throw new Error('Invalid page.');
        const local = this.get(table,row.id);
        if (local?.table === 'weigh_ins' && local.data.source !== 'app') throw new Error('Provenance conflict.');
        if (!local || compareRows(row,local) > 0) this.write(row);
        clock = Math.max(clock, row.updated_at);
      }
      this.setState('clock', String(clock));
      this.setState(`cursor:${table}`,cursor);
    }));
    this.listeners.forEach(listener => listener());
  }
  cacheOura(day: string, cache: Record<string,unknown>) {
    this.safe(() => this.db.run(sql`INSERT INTO oura_days(owner_id,day,cache) VALUES(${this.owner},${day},${JSON.stringify(cache)}) ON CONFLICT(owner_id,day) DO UPDATE SET cache=excluded.cache`));
  }
}
/** Device metadata is local-only and has no account data. */
export function deviceId(db: ExpoSQLiteDatabase, uuid: () => string) {
  const current = db.get<{value:string}>(sql`SELECT value FROM sync_state WHERE owner_id='device' AND key='id'`);
  if (current) return current.value;
  const id = uuid(); db.run(sql`INSERT INTO sync_state(owner_id,key,value) VALUES('device','id',${id})`); return id;
}
export type LocalQuery = SQL;
