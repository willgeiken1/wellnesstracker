import { matchesPurge, purgeTombstone } from './purges';
import { sql, type SQL } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { columns, syncedTables, canonicalRow, canonicalPulledRow, compareRows, revision, validateRow, validatePulledRow, type Row, type Table, type Scalar, type ServerRow } from './rows';

import { DEFAULT_SYNC_FLAGS, hasGatedColumns, hydrateSyncRow, mergeSyncRow, projectSyncRow, syncTables, type SyncFlags } from './sync/flags';

type Physical = Record<string, Scalar>;
// Repositories sharing a database handle must share transaction guards.
const batches = new WeakMap<ExpoSQLiteDatabase, { depth: number; rollbackOnly: boolean }>();
export interface SyncConflict { table: Table; id: string; reason: 'provenance' }
export interface Pending { row: Row; revision: string }
/** Corrupt-marker escape only: erase every namespace in one atomic transaction. */
export function wipeAllOwners(db: ExpoSQLiteDatabase) {
  try {
    db.transaction(() => {
      for(const table of [...syncedTables,'sync_outbox','sync_state','sync_conflicts','oura_days','workout_local','workout_milestones','workout_weekly']) {
        db.run(sql`DELETE FROM ${sql.identifier(table)}`);
      }
    });
  } catch {throw new Error('Local data is unavailable.');}
}
export class Repository {
  readonly syncFlags: Readonly<SyncFlags>;
  syncTables() { return syncTables(this.syncFlags); }
  private viewRevision = 0;
  /** Monotonic UI snapshot; no persisted or synced state. */
  getRevision = () => this.viewRevision;
  private listeners = new Set<() => void>();
  /** Owner-scoped logger state. This table is deliberately absent from the wire catalog. */
  private localTable(key:string) {return sql.identifier(key==='milestones'?'workout_milestones':key==='weekly'?'workout_weekly':'workout_local');}
  localGet<T>(key: string): T | undefined {
    return this.safe(() => { const row=this.db.get<{value:string}>(sql`SELECT value FROM ${this.localTable(key)} WHERE owner_id=${this.owner} AND key=${key}`); return row ? JSON.parse(row.value) as T : undefined; });
  }
  localSave(key:string,value:unknown) {
    this.safe(()=>this.db.run(sql`INSERT INTO ${this.localTable(key)}(owner_id,key,value) VALUES(${this.owner},${key},${JSON.stringify(value)}) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value`));
    this.notify();
  }
  /** Multi-row logger operations are synchronous. No sync work (including
   * flagConflict), ack, applyPage or wipe is allowed inside atomic().
   * Promise/thenable returns are rejected; callbacks must never schedule async writes.
   * A failed nested atomic marks the entire outer transaction rollback-only. */
  private batch: { depth: number; rollbackOnly: boolean };
  private notify() { if (!this.batch.depth) { this.viewRevision++; this.listeners.forEach(listener => listener()); } }
  private outsideAtomic() {
    if (this.batch.depth) {
      this.batch.rollbackOnly = true;
      throw new Error('Operation is forbidden inside atomic().');
    }
  }
  atomic<T>(operation:()=>T):T {
    const run = () => {
      const value = operation();
      if (value !== null && (typeof value === 'object' || typeof value === 'function') &&
          typeof (value as { then?: unknown }).then === 'function') {
        throw new Error('atomic() callbacks must be synchronous.');
      }
      return value;
    };
    if (this.batch.depth) {
      try { return run(); }
      catch (error) { this.batch.rollbackOnly = true; throw error; }
    }
    this.batch.rollbackOnly = false;
    const result = this.safe(() => this.db.transaction(() => {
      this.batch.depth++;
      try {
        const value = run();
        if (this.batch.rollbackOnly) throw new Error('Transaction requires rollback.');
        return value;
      } finally { this.batch.depth--; this.batch.rollbackOnly = false; }
    }));
    this.notify();return result;
  }

  constructor(private db: ExpoSQLiteDatabase, readonly owner: string, readonly device: string, private uuid: () => string, flags: SyncFlags = DEFAULT_SYNC_FLAGS) {
    this.syncFlags = Object.freeze({...flags});
    let batch = batches.get(db);
    if (!batch) { batch = { depth: 0, rollbackOnly: false }; batches.set(db, batch); }
    this.batch = batch;
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private safe<T>(operation: () => T): T { try { return operation(); } catch { throw new Error('Local data is unavailable.'); } }
  private table(table: Table) { if (!syncedTables.includes(table)) throw new Error('Unsupported local table.'); return sql.identifier(table); }
  private state(key: string) { return this.db.get<{value:string}>(sql`SELECT value FROM sync_state WHERE owner_id=${this.owner} AND key=${key}`)?.value; }
  private setState(key: string, value: string) { this.db.run(sql`INSERT INTO sync_state(owner_id,key,value) VALUES(${this.owner},${key},${value}) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value`); }
  private decode(table: Table, physical: Physical): Row {
    const { owner_id, id, updated_at, deleted_at, device_id, ...data } = physical;
    return { table, owner_id: String(owner_id), id: String(id), updated_at: Number(updated_at), deleted_at: deleted_at === null ? null : Number(deleted_at), device_id: String(device_id), data };
  }
  private write(input: Row) {
    let row = input;
    for (const marker of this.list('purges').sort((a,b)=>compareRows(b,a))) {
      if (matchesPurge(row,marker,(table,id)=>this.get(table,id))) { row=purgeTombstone(row,marker); break; }
    }
    const data = {owner_id: row.owner_id, id: row.id, updated_at: row.updated_at, deleted_at: row.deleted_at, device_id: row.device_id, ...row.data};
    const keys = Object.keys(data);
    const fields = sql.join(keys.map(k => sql.identifier(k)), sql`, `);
    const values = sql.join(Object.values(data).map(v => sql`${v}`), sql`, `);
    const updates = sql.join(keys.filter(k => !['owner_id','id'].includes(k)).map(k => sql`${sql.identifier(k)}=excluded.${sql.identifier(k)}`), sql`, `);
    this.db.run(sql`INSERT INTO ${this.table(row.table)} (${fields}) VALUES (${values}) ON CONFLICT(owner_id,id) DO UPDATE SET ${updates}`);
    return row;
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
      if (input.table === 'purges') throw new Error('purges is pull-only.');
      if (input.owner_id !== this.owner || input.device_id !== this.device) throw new Error('Owner/device mismatch.');
      const healthLocal = input.table === 'weigh_ins' && input.data.source !== 'app';
      if (healthLocal && !['healthkit','health_connect'].includes(String(input.data.source))) throw new Error('Invalid provenance.');
      validateRow(healthLocal ? {...input, data: {...input.data, source:'app'}} : input);
      const previous = this.get(input.table, input.id);
      if (previous && previous.table === 'weigh_ins' && previous.data.source !== input.data.source) throw new Error('Provenance is immutable.');
      let row = healthLocal ? { ...input, data: Object.fromEntries(Object.keys(columns[input.table]).map(k => [k,input.deleted_at !== null && k !== 'source' ? null : input.data[k] ?? null])) } : canonicalRow(input);
      if (previous && compareRows(row, previous) <= 0) return;
      this.atomic(() => {
        row = this.write(row);
        this.applyPurges();
        const clock = Math.max(Number(this.state('clock') ?? 0), row.updated_at);
        this.setState('clock', String(clock));
        if (this.owner !== 'demo' && this.owner !== 'guest' && !healthLocal) {
          this.db.run(sql`INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(${this.owner},${row.table},${row.id},${revision(row)}) ON CONFLICT(owner_id,table_name,row_id) DO UPDATE SET revision=excluded.revision`);
        }
      });
    });
  }
  /** Atomic account departure, including local-only caches and flagged outbox rows. */
  wipe() {
    this.outsideAtomic();
    this.safe(() => this.db.transaction(() => {
      for (const table of [...syncedTables, 'sync_outbox', 'sync_state', 'sync_conflicts', 'oura_days', 'workout_local', 'workout_milestones', 'workout_weekly']) {
        this.db.run(sql`DELETE FROM ${sql.identifier(table)} WHERE owner_id=${this.owner}`);
      }
    }));
    this.notify();
  }
  /** Includes conflict-flagged rows, which pending() intentionally excludes from upload. */
  unsyncedCount() {
    return this.safe(() => this.db.get<{count:number}>(sql`SELECT count(*) AS count FROM sync_outbox WHERE owner_id=${this.owner} AND table_name <> 'purges'`)?.count ?? 0);
  }
  hasUnsynced() {
    return this.safe(() => !!this.db.get(sql`SELECT 1 FROM sync_outbox WHERE owner_id=${this.owner} AND table_name <> 'purges' LIMIT 1`));
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
    return this.safe(() => this.db.all<{table_name:Table;row_id:string;revision:string}>(sql`SELECT table_name,row_id,revision FROM sync_outbox WHERE owner_id=${this.owner} AND table_name <> 'purges' AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.owner_id=sync_outbox.owner_id AND c.table_name=sync_outbox.table_name AND c.row_id=sync_outbox.row_id) ORDER BY table_name,row_id`).filter(item => this.syncTables().includes(item.table_name)).map(item => {
      const row = this.get(item.table_name,item.row_id); if (!row) throw new Error('Invalid outbox.'); validateRow(row); return {row:projectSyncRow(row,this.syncFlags),revision:item.revision};
    }));
  }
  conflicts(): SyncConflict[] {
    return this.safe(() => this.db.all<SyncConflict>(sql`SELECT table_name AS "table",row_id AS id,reason FROM sync_conflicts WHERE owner_id=${this.owner} ORDER BY table_name,row_id`));
  }
  private recordConflict(table: Table, id: string) {
    this.table(table);
    this.db.run(sql`INSERT INTO sync_conflicts(owner_id,table_name,row_id,reason) VALUES(${this.owner},${table},${id},'provenance') ON CONFLICT(owner_id,table_name,row_id) DO NOTHING`);
  }
  flagConflict(item: Pending) {
    this.outsideAtomic();
    this.safe(() => {
      if (item.row.owner_id !== this.owner) throw new Error('Owner mismatch.');
      this.recordConflict(item.row.table,item.row.id);
    });
    this.notify();
  }
  ack(items: Pending[], accepted?: Row[]) {
    this.outsideAtomic();
    this.safe(() => this.db.transaction(() => {
      if (accepted && accepted.length !== items.length) throw new Error('Invalid acknowledgment.');
      let correctedClock = false;
      for (const [index,item] of items.entries()) {
        if (item.row.owner_id !== this.owner) throw new Error('Owner mismatch.');
        const remote = accepted && canonicalRow(projectSyncRow(accepted[index],this.syncFlags));
        if (remote && (remote.owner_id !== this.owner || remote.table !== item.row.table || remote.id !== item.row.id
          || (remote.table === 'weigh_ins' && remote.data.source !== item.row.data.source))) throw new Error('Invalid acknowledgment.');
        const local = this.get(item.row.table,item.row.id);
        // Only replace the exact sent revision. Edits committed during upload survive.
        if (remote && local && revision(local) === item.revision) {
          this.write(canonicalRow(mergeSyncRow(remote,local,this.syncFlags)));
          correctedClock ||= remote.updated_at < local.updated_at;
          this.setState('clock',String(Math.max(Number(this.state('clock') ?? 0),remote.updated_at)));
        }
        this.db.run(sql`DELETE FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${item.row.table} AND row_id=${item.row.id} AND revision=${item.revision}`);
      }
      if (correctedClock) {
        // Every other local revision (including unsent edits) still contributes.
        const clock = Math.max(0, ...syncedTables.map(name => Number(this.db.get<{stamp:number}>(sql`SELECT max(updated_at) AS stamp FROM ${this.table(name)} WHERE owner_id=${this.owner}`)?.stamp ?? 0)));
        this.setState('clock',String(clock));
      }
    }));
    this.notify();
  }
  private cursorKey(table: Table) { return `cursor:${this.syncFlags.syncedV1Columns && hasGatedColumns(table) ? 'v1:' : ''}${table}`; }
  cursor(table: Table) { return this.safe(() => this.state(this.cursorKey(table)) ?? '0'); }
  applyPage(table: Table, page: ServerRow[], cursor: string) {
    this.outsideAtomic();
    this.safe(() => this.db.transaction(() => {
      this.table(table);
      if (!this.syncTables().includes(table)) throw new Error('Sync feature disabled.');
      if (!/^\d+$/.test(cursor) || BigInt(cursor) < BigInt(this.cursor(table))) throw new Error('Invalid cursor.');
      let clock = Number(this.state('clock') ?? 0);
      for (const remote of page) {
        const row = projectSyncRow(remote.row,this.syncFlags);
        validatePulledRow(row);
        if (row.owner_id !== this.owner || row.table !== table || !/^\d+$/.test(remote.server_seq) || BigInt(remote.server_seq) > BigInt(cursor)) throw new Error('Invalid page.');
        const local = this.get(table,row.id);
        clock = Math.max(clock, row.updated_at);
        if (local?.table === 'weigh_ins' && local.data.source !== row.data.source) {
          this.recordConflict(table,row.id); continue;
        }
        if (this.db.get(sql`SELECT 1 FROM sync_conflicts WHERE owner_id=${this.owner} AND table_name=${table} AND row_id=${row.id}`)) continue;
        const order = local ? compareRows(row,local) : 1;
        // Replaying the enabled cursor hydrates fields ignored at the same revision.
        const hydrate = order === 0 && local && this.syncFlags.syncedV1Columns && !this.db.get(sql`SELECT 1 FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${table} AND row_id=${row.id}`);
        if (order > 0) this.write(canonicalPulledRow(mergeSyncRow(row,local,this.syncFlags)));
        else if (hydrate) {
          const hydrated = hydrateSyncRow(row,local!);
          if (hydrated) this.write(canonicalPulledRow(hydrated));
        }
      }
      this.applyPurges();
      this.setState('clock', String(clock));
      this.setState(this.cursorKey(table),cursor);
    }));
    this.notify();
  }
  /** Within the caller's transaction. Children must be wiped before references. */
  private applyPurges() {
    const markers=this.list('purges').sort((a,b)=>compareRows(b,a));
    for (const marker of markers) {
      for (const table of ['sets','entries','sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days','photos'] as const) {
        for (const row of this.list(table)) {
          // Health-origin rows remain local and never enter a sync outbox.
          if (!matchesPurge(row,marker,(parent,id)=>this.get(parent,id))) continue;
          const dead=this.write(purgeTombstone(row,marker));
          this.db.run(sql`UPDATE sync_outbox SET revision=${revision(dead)} WHERE owner_id=${this.owner} AND table_name=${table} AND row_id=${row.id}`);
        }
      }
    }
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
