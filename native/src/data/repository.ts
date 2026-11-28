import { MAX_LOSING_VERSIONS, LOSING_VERSION_TTL_MS, losingVersionKey, type LosingVersion } from './losing-version';
import { matchesPurge, purgeTombstone } from './purges';
import { sql, type SQL } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { columns, localTables, routineTables, canonicalRow, canonicalPulledRow, compareRows, revision, validateRow, validatePulledRow, type Row, type Table, type Scalar, type ServerRow } from './rows';

import { isHealthSource } from './health-store';
import { DEFAULT_SYNC_FLAGS, gatedColumns, hasGatedColumns, hydrateSyncRow, mergeSyncRow, projectSyncRow, syncTables, type SyncFlags } from './sync/flags';

type Physical = Record<string, Scalar>;
// Repositories sharing a database handle must share transaction guards.
const batches = new WeakMap<ExpoSQLiteDatabase, { depth: number; rollbackOnly: boolean }>();
/** What repositories on one database have read since its last change. Screens ask for the same lists and
 * values many times per draw (a few dozen hooks each read the settings; every exercise reads the custom
 * list), and each ask was a fresh synchronous query on the JS thread. Every write made through a repository,
 * including one that rolls back, forgets all of it; so does {@link forgetReads}. */
interface ReadCache {
  seen: Map<string, unknown>;
  /** Purge markers by owner. Only a pulled page writes them, so they outlive ordinary saves. */
  purges: Map<string, Row[]>;
}
const remembered = new WeakMap<ExpoSQLiteDatabase, ReadCache>();
const MAX_REMEMBERED = 4000;
function readCache(db: ExpoSQLiteDatabase) {
  let cache = remembered.get(db);
  if (!cache) { cache = { seen: new Map(), purges: new Map() }; remembered.set(db, cache); }
  return cache;
}
/** For a change made to the database other than through a {@link Repository}. */
export function forgetReads(db: ExpoSQLiteDatabase) {
  const cache = remembered.get(db);
  cache?.seen.clear(); cache?.purges.clear();
}
const READ_CALLS = new Set<PropertyKey>(['get', 'all']);
/** The same handle, except that any call other than a plain read forgets what was remembered, before it runs
 * and after it ends (so a transaction that rolls back is forgotten too). */
function forgetOnWrite(db: ExpoSQLiteDatabase, cache: ReadCache): ExpoSQLiteDatabase {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      const call = value as (...args: unknown[]) => unknown;
      if (READ_CALLS.has(prop)) return call.bind(target);
      return (...args: unknown[]) => {
        cache.seen.clear();
        try { return call.apply(target, args); } finally { cache.seen.clear(); }
      };
    },
  });
}
/** Rows are shared by everyone who reads them; in development, a caller that changes one fails at once. */
function shared(row: Row): Row {
  if (typeof __DEV__ === 'undefined' || __DEV__) { Object.freeze(row.data); Object.freeze(row); }
  return row;
}
export interface SyncConflict { table: Table; id: string; reason: 'provenance' }
export interface Pending { row: Row; revision: string }
/** Corrupt-marker escape only: erase every namespace in one atomic transaction, and the Health store. */
export function wipeAllOwners(db: ExpoSQLiteDatabase, health?: ExpoSQLiteDatabase) {
  forgetReads(db);
  try {
    db.transaction(() => {
      for(const table of [...localTables,'sync_outbox','sync_state','sync_conflicts','oura_days','workout_local','workout_milestones','workout_weekly']) {
        db.run(sql`DELETE FROM ${sql.identifier(table)}`);
      }
    });
    health?.run(sql`DELETE FROM weigh_ins`);
  } catch {throw new Error('Local data is unavailable.');}
  finally { forgetReads(db); }
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
    // The text is remembered, not the value: callers change what they are given before saving it back.
    // Outside a batch of writes, the logger's own values are read together: a draw asks for a draft, a unit
    // and a skip mark per exercise, which was one query each.
    const local = key !== 'milestones' && key !== 'weekly' && !this.batch.depth ? this.remember('local\u0000*', () => this.safe(() =>
      new Map(this.db.all<{key:string;value:string}>(sql`SELECT key,value FROM workout_local WHERE owner_id=${this.owner}`).map(row => [row.key, row.value])))) : undefined;
    const value = local ? local.get(key) : this.remember(`local\u0000${key}`, () => this.safe(() => this.db.get<{value:string}>(sql`SELECT value FROM ${this.localTable(key)} WHERE owner_id=${this.owner} AND key=${key}`)?.value));
    return value === undefined ? undefined : JSON.parse(value) as T;
  }
  private index = new WeakMap<Row[], Map<string, Row>>();
  private indexed(rows: Row[]) {
    let byId = this.index.get(rows);
    if (!byId) { byId = new Map(rows.map(row => [row.id, row])); this.index.set(rows, byId); }
    return byId;
  }
  private remember<T>(key: string, read: () => T): T {
    const seen = this.reads.seen, at = `${this.owner}\u0000${key}`;
    if (seen.has(at)) return seen.get(at) as T;
    const value = read();
    if (seen.size >= MAX_REMEMBERED) seen.clear();
    seen.set(at, value);
    return value;
  }
  /** Owner-scoped local logger state for the phone-only JSON backup. */
  localSnapshot(): Record<string, unknown> {
    return this.safe(() => Object.fromEntries(
      ['workout_local', 'workout_milestones', 'workout_weekly'].flatMap(table =>
        this.db.all<{key:string;value:string}>(sql`SELECT key,value FROM ${sql.identifier(table)} WHERE owner_id=${this.owner}`)
          .map(row => [row.key, JSON.parse(row.value)])),
    ));
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
  private reads: ReadCache;
  private db: ExpoSQLiteDatabase;
  private health?: ExpoSQLiteDatabase;
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

  /** `health` is the separate store, kept out of backups, that holds weigh-ins copied from a health service. */
  constructor(db: ExpoSQLiteDatabase, readonly owner: string, readonly device: string, private uuid: () => string, flags: SyncFlags = DEFAULT_SYNC_FLAGS, health?: ExpoSQLiteDatabase) {
    this.syncFlags = Object.freeze({...flags});
    this.reads = readCache(db);
    this.db = forgetOnWrite(db, this.reads);
    this.health = health && forgetOnWrite(health, this.reads);
    let batch = batches.get(db);
    if (!batch) { batch = { depth: 0, rollbackOnly: false }; batches.set(db, batch); }
    this.batch = batch;
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private safe<T>(operation: () => T): T { try { return operation(); } catch { throw new Error('Local data is unavailable.'); } }
  private table(table: Table) { if (!localTables.includes(table)) throw new Error('Unsupported local table.'); return sql.identifier(table); }
  private state(key: string) { return this.db.get<{value:string}>(sql`SELECT value FROM sync_state WHERE owner_id=${this.owner} AND key=${key}`)?.value; }
  private setState(key: string, value: string) { this.db.run(sql`INSERT INTO sync_state(owner_id,key,value) VALUES(${this.owner},${key},${value}) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value`); }
  private decode(table: Table, physical: Physical): Row {
    const { owner_id, id, updated_at, deleted_at, device_id, ...data } = physical;
    return shared({ table, owner_id: String(owner_id), id: String(id), updated_at: Number(updated_at), deleted_at: deleted_at === null ? null : Number(deleted_at), device_id: String(device_id), data });
  }
  /** Newest first. */
  private purgeMarkers(): Row[] {
    let markers = this.reads.purges.get(this.owner);
    if (!markers) { markers = this.list('purges').sort((a,b)=>compareRows(b,a)); this.reads.purges.set(this.owner, markers); }
    return markers;
  }
  private write(input: Row) {
    let row = input;
    if (row.table === 'purges') this.reads.purges.clear();
    for (const marker of this.purgeMarkers()) {
      if (matchesPurge(row,marker,(table,id)=>this.get(table,id))) { row=purgeTombstone(row,marker); break; }
    }
    const data = {owner_id: row.owner_id, id: row.id, updated_at: row.updated_at, deleted_at: row.deleted_at, device_id: row.device_id, ...row.data};
    const keys = Object.keys(data);
    const fields = sql.join(keys.map(k => sql.identifier(k)), sql`, `);
    const values = sql.join(Object.values(data).map(v => sql`${v}`), sql`, `);
    const updates = sql.join(keys.filter(k => !['owner_id','id'].includes(k)).map(k => sql`${sql.identifier(k)}=excluded.${sql.identifier(k)}`), sql`, `);
    this.store(row).run(sql`INSERT INTO ${this.table(row.table)} (${fields}) VALUES (${values}) ON CONFLICT(owner_id,id) DO UPDATE SET ${updates}`);
    if (row.table === 'purges') this.reads.purges.clear();
    return row;
  }
  /** Health weigh-ins go to the Health store when there is one; everything else to the main database. */
  private store(row: Row) { return this.health && row.table === 'weigh_ins' && isHealthSource(row.data.source) ? this.health : this.db; }
  /** With a Health store, a Health weigh-in still in the main database is a copy waiting to move and is not read. */
  private shadowed(table: Table, value: Physical) { return !!this.health && table === 'weigh_ins' && isHealthSource(value.source); }
  get(table: Table, id: string): Row | undefined {
    // A list read since the last change already holds the row: every entry of a history asks for itself.
    const all = this.reads.seen.get(`${this.owner}\u0000list\u0000${table}\u0000true`) as Row[] | undefined;
    if (all) return this.indexed(all).get(id);
    const live = this.reads.seen.get(`${this.owner}\u0000list\u0000${table}\u0000false`) as Row[] | undefined;
    const found = live && this.indexed(live).get(id);
    if (found) return found;
    return this.remember(`get\u0000${table}\u0000${id}`, () => this.safe(() => {
      const value = this.db.get<Physical>(sql`SELECT * FROM ${this.table(table)} WHERE owner_id=${this.owner} AND id=${id}`);
      if (value && !this.shadowed(table, value)) return this.decode(table, value);
      const kept = this.health && table === 'weigh_ins' ? this.health.get<Physical>(sql`SELECT * FROM weigh_ins WHERE owner_id=${this.owner} AND id=${id}`) : undefined;
      return kept ? this.decode(table, kept) : undefined;
    }));
  }
  list(table: Table, includeDeleted = false): Row[] {
    // Callers sort and filter what they are given, so each gets its own copy of the list.
    return [...this.remember(`list\u0000${table}\u0000${includeDeleted}`, () => this.safe(() => {
      const live = includeDeleted ? sql`` : sql`AND deleted_at IS NULL`;
      const rows = this.db.all<Physical>(sql`SELECT * FROM ${this.table(table)} WHERE owner_id=${this.owner} ${live} ORDER BY id`);
      if (!this.health || table !== 'weigh_ins') return rows.map(r => this.decode(table, r));
      const kept = this.health.all<Physical>(sql`SELECT * FROM weigh_ins WHERE owner_id=${this.owner} ${live}`);
      return [...rows.filter(r => !this.shadowed(table, r)), ...kept].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0).map(r => this.decode(table, r));
    }))];
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
      // OFF keeps gated values in the phone's own database: the flag only keeps
      // them out of sync (pending() and the transport project them away). An OFF
      // edit still cannot author them on the server: the dormant marker below has
      // an ON replay refill them from the server before any ON push.
      if (previous && compareRows(row, previous) <= 0) return;
      this.atomic(() => {
        row = this.write(row);
        if (hasGatedColumns(row.table)) {
          if (!this.syncFlags.syncedV1Columns) {
            // An OFF edit authors no gated column for sync, so replacing a JSON marker with '1' is correct.
            this.setState(this.dormantKey(row.table,row.id),'1');
            this.setState(this.replayKey(row.table),'needed');
            // Even a previously enabled cursor must replay this server row.
            this.setState(`cursor:v1:${row.table}`,'0');
          }
          else {
            // Preserve unauthored columns through edits before the replay. A pending
            // ON edit already owns its changed fields, including explicit nulls.
            const dormant = this.dormantFields(row.table,row.id);
            const pending = this.db.get(sql`SELECT 1 FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${row.table} AND row_id=${row.id}`);
            // Field-level merge: re-saving an unchanged gated value does not author it;
            // during an ON replay after upgrade or any later OFF period it still takes the server value.
            const refill = previous && row.deleted_at === null
              ? (dormant ?? (!pending && this.needsV1Replay(row.table) ? gatedColumns(row.table) : []))
                .filter(key => !Object.hasOwn(input.data,key) || row.data[key] === previous.data[key])
              : [];
            if (refill.length) {
              this.setState(this.dormantKey(row.table,row.id),JSON.stringify(refill));
              // Existing markers are already covered by the in-progress replay.
              // A newly marked row may be behind its cursor and must restart it.
              if (!dormant || !this.needsV1Replay(row.table)) {
                this.setState(`cursor:v1:${row.table}`,'0');
                this.setState(this.replayKey(row.table),'needed');
              }
            } else this.clearDormant(row.table,row.id);
          }
        }
        this.applyPurges();
        const clock = Math.max(Number(this.state('clock') ?? 0), row.updated_at);
        this.setState('clock', String(clock));
        // Routines stay on this phone while their sync is off, so they are not queued: turning sync on later
        // could otherwise upload everything ever written here, without the person being asked.
        if (this.owner !== 'demo' && this.owner !== 'guest' && !healthLocal && !this.phoneOnlyRoutines(row.table)) {
          this.db.run(sql`INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(${this.owner},${row.table},${row.id},${revision(row)}) ON CONFLICT(owner_id,table_name,row_id) DO UPDATE SET revision=excluded.revision`);
        }
      });
    });
  }
  /** Demo carry-over only; caller owns the shared database transaction. */
  clearDemoForTransfer() {
    if (this.owner !== 'demo' || !this.batch.depth) throw new Error('Demo transfer transaction required.');
    this.reads.purges.clear();
    for (const table of [...localTables, 'sync_outbox', 'sync_state', 'sync_conflicts', 'oura_days', 'workout_local', 'workout_milestones', 'workout_weekly']) {
      this.db.run(sql`DELETE FROM ${sql.identifier(table)} WHERE owner_id=${this.owner}`);
    }
    this.health?.run(sql`DELETE FROM weigh_ins WHERE owner_id=${this.owner}`);
  }
  /** Atomic account departure, including local-only caches and flagged outbox rows. */
  wipe() {
    this.outsideAtomic();
    this.reads.purges.clear();
    this.safe(() => this.db.transaction(() => {
      for (const table of [...localTables, 'sync_outbox', 'sync_state', 'sync_conflicts', 'oura_days', 'workout_local', 'workout_milestones', 'workout_weekly']) {
        this.db.run(sql`DELETE FROM ${sql.identifier(table)} WHERE owner_id=${this.owner}`);
      }
      this.health?.run(sql`DELETE FROM weigh_ins WHERE owner_id=${this.owner}`);
    }));
    this.notify();
  }
  /** The earliest day Apple Health weigh-ins have been read back to for this account: a date only, never a
   * reading. It is kept in the main database so that if iOS clears the Health store, the next refresh reads that
   * far back again instead of only the usual window. */
  healthWeightsFrom(): string | undefined { return this.safe(() => this.state('health_weights_from')); }
  noteHealthWeightsFrom(day: string) {
    this.safe(() => { const kept = this.state('health_weights_from'); if (!kept || day < kept) this.setState('health_weights_from', day); });
  }
  /** Includes conflict-flagged rows, which pending() intentionally excludes from upload. */
  unsyncedCount() {
    return this.safe(() => this.db.get<{count:number}>(sql`SELECT count(*) AS count FROM sync_outbox WHERE owner_id=${this.owner} AND table_name <> 'purges'`)?.count ?? 0);
  }
  /** A Routines table while Routines are not synced: the same table list the sync gate reads. */
  private phoneOnlyRoutines(table: Table) { return routineTables.includes(table) && !this.syncTables().includes(table); }
  /** How many live Routines rows an account keeps on this phone alone. With their sync off they are never
   * uploaded or queued, so they are counted where they are stored. Sign-out says in plain words that they
   * will be erased. A demo or phone-only owner has no sign-out to warn, and synced Routines are not phone-only. */
  phoneOnlyRoutineCount() {
    if (this.owner === 'demo' || this.owner === 'guest') return 0;
    return this.safe(() => routineTables.filter(table => this.phoneOnlyRoutines(table)).reduce((count, table) =>
      count + (this.db.get<{count:number}>(sql`SELECT count(*) AS count FROM ${sql.identifier(table)} WHERE owner_id=${this.owner} AND deleted_at IS NULL`)?.count ?? 0), 0));
  }
  /** Changes whenever a Routines row is written or erased: each daily_* table's row count and newest stamp. The
   * Routines store keeps a copy in memory and reads this to learn that another writer changed its rows. */
  routineTablesStamp(): string {
    return this.safe(() => routineTables.map(table => {
      const row = this.db.get<{n:number;m:number|null}>(sql`SELECT count(*) AS n, max(updated_at) AS m FROM ${this.table(table)} WHERE owner_id=${this.owner}`);
      return `${row?.n ?? 0}:${row?.m ?? 0}`;
    }).join('|'));
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
  /** How many rows pending() would upload, counted without reading them. */
  pendingCount(): number {
    const tables = this.syncTables().filter(table => table !== 'purges');
    if (!tables.length) return 0;
    return this.safe(() => this.db.get<{count:number}>(sql`SELECT count(*) AS count FROM sync_outbox WHERE owner_id=${this.owner} AND table_name IN (${sql.join(tables.map(table => sql`${table}`), sql`, `)}) AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.owner_id=sync_outbox.owner_id AND c.table_name=sync_outbox.table_name AND c.row_id=sync_outbox.row_id)`)?.count ?? 0);
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
          this.retainLosingVersion(local,remote);
          this.write(canonicalRow(mergeSyncRow(remote,local,this.syncFlags)));
          correctedClock ||= remote.updated_at < local.updated_at;
          this.setState('clock',String(Math.max(Number(this.state('clock') ?? 0),remote.updated_at)));
        }
        this.db.run(sql`DELETE FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${item.row.table} AND row_id=${item.row.id} AND revision=${item.revision}`);
      }
      this.applyPurges();
      if (correctedClock) {
        // Every other local revision (including unsent edits) still contributes.
        const clock = Math.max(0, ...localTables.map(name => Number(this.db.get<{stamp:number}>(sql`SELECT max(updated_at) AS stamp FROM ${this.table(name)} WHERE owner_id=${this.owner}`)?.stamp ?? 0)));
        this.setState('clock',String(clock));
      }
    }));
    if (items.length) this.notify();
  }
  /** Lazy expiry also physically removes stale payloads whenever sync/recovery is used. */
  losingVersions(now = Date.now()): LosingVersion[] {
    return this.safe(() => {
      const versions = this.db.all<{key:string;value:string}>(sql`SELECT key,value FROM sync_state WHERE owner_id=${this.owner} AND key LIKE 'losing:%' ORDER BY key`);
      const retained: LosingVersion[] = [];
      for (const item of versions) {
        try {
          const value = JSON.parse(item.value) as LosingVersion;
          validateRow(value?.row);
          if (value.row.owner_id !== this.owner || value.row.device_id !== this.device ||
              value.row.deleted_at !== null || value.row.table === 'purges' ||
              item.key !== losingVersionKey(value.row) ||
              !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now ||
              typeof value.winningRevision !== 'string') throw new Error('Invalid recovery copy.');
          const [stamp, device, extra] = value.winningRevision.split(':');
          if (extra !== undefined || String(Number(stamp)) !== stamp) throw new Error('Invalid winning revision.');
          validateRow({...value.row,updated_at:Number(stamp),device_id:device});
          retained.push({...value,key:item.key});
        } catch {
          // Isolate corrupt/legacy entries so sync and deletion can still commit.
          this.dropLosingVersion(item.key);
        }
      }
      return this.trimLosingVersions(retained);
    });
  }
  private trimLosingVersions(retained: LosingVersion[]): LosingVersion[] {
    // Expiry records capture time, unlike the losing edit's author timestamp.
    retained.sort((a,b) => b.expiresAt-a.expiresAt || b.row.updated_at-a.row.updated_at || a.key.localeCompare(b.key));
    for (const value of retained.splice(MAX_LOSING_VERSIONS)) this.dropLosingVersion(value.key);
    return retained;
  }
  private dropLosingVersion(key: string) {
    this.db.run(sql`DELETE FROM sync_state WHERE owner_id=${this.owner} AND key=${key}`);
  }
  private retainLosingVersion(local: Row, remote: Row) {
    const retained = this.losingVersions();
    // A synced local row is ordinary history, even if another phone replaces it.
    const pending = this.db.get(sql`SELECT 1 FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${local.table} AND row_id=${local.id} AND revision=${revision(local)}`);
    // Deletions/purges must never leave a restorable copy behind.
    if (!pending || local.deleted_at !== null || remote.deleted_at !== null || local.table === 'purges' ||
        local.device_id !== this.device || remote.device_id === this.device ||
        Object.entries(projectSyncRow(local,this.syncFlags).data).every(([key,value]) => value === (remote.data[key] ?? null))) return;
    const key = losingVersionKey(local);
    // A replay cannot extend the seven-day deadline.
    if (!this.state(key)) {
      const saved = {key,row:local,winningRevision:revision(remote),expiresAt:Date.now()+LOSING_VERSION_TTL_MS};
      this.setState(key,JSON.stringify(saved));
      this.trimLosingVersions([...retained,saved]);
    }
  }
  /** Restore is an explicit new local edit, so normal LWW and outbox rules still apply. */
  restoreLosingVersion(key: string, now = Date.now()): boolean {
    const saved = this.losingVersions(now).find(version => version.key === key);
    if (!saved || saved.row.owner_id !== this.owner || !this.syncTables().includes(saved.row.table)) return false;
    const current = this.get(saved.row.table,saved.row.id);
    if (!current || current.deleted_at !== null || revision(current) !== saved.winningRevision) {
      this.dropLosingVersion(key);
      this.notify();
      return false;
    }
    this.atomic(() => {
      this.save(saved.row.table,saved.row.data,saved.row.id,now);
      this.dropLosingVersion(key);
    });
    return true;
  }
  private dormantKey(table: Table, id: string) { return `dormant-v1:${table}:${id}`; }
  private dormantFields(table: Table, id: string): readonly string[] | undefined {
    const value = this.state(this.dormantKey(table,id));
    // Existing OFF markers mean every gated column needs reconciliation.
    if (value === undefined) return undefined;
    const gated = gatedColumns(table);
    if (value === '1') return gated;
    try {
      const fields: unknown = JSON.parse(value);
      const valid = Array.isArray(fields) ? fields.filter((key): key is string => typeof key === 'string' && gated.includes(key)) : [];
      return valid.length ? valid : gated;
    } catch { return gated; }
  }
  private clearDormant(table: Table, id: string) {
    this.db.run(sql`DELETE FROM sync_state WHERE owner_id=${this.owner} AND key=${this.dormantKey(table,id)}`);
  }
  private replayKey(table: Table) { return `replay:v1:${table}`; }
  private needsV1Replay(table: Table) {
    // Missing records conservatively require one full replay after upgrade, even
    // for existing ON users: absence cannot distinguish legacy OFF history.
    return this.state(this.replayKey(table)) !== 'complete';
  }
  /** OFF local values must see a complete ON pull before promotion.
   * Local-only owners never pull and never enqueue uploads. */
  canPromotePreferences(table: 'machine_notes' | 'settings' | 'custom_exercises' | 'routine_exercises' | 'entries') {
    return this.syncFlags.syncedV1Columns && (this.owner === 'guest' || this.owner === 'demo' ||
      this.safe(() => this.state(this.replayKey(table)) === 'complete'));
  }
  private cursorKey(table: Table) { return `cursor:${this.syncFlags.syncedV1Columns && hasGatedColumns(table) ? 'v1:' : ''}${table}`; }
  cursor(table: Table) { return this.safe(() => this.state(this.cursorKey(table)) ?? '0'); }
  /** complete is supplied by the engine only after exhausting the table replay. */
  applyPage(table: Table, page: ServerRow[], cursor: string, complete = false, after = this.cursor(table)) {
    this.outsideAtomic();
    this.reads.purges.clear();
    const replay = () => this.safe(() => this.state(this.replayKey(table)));
    const before = page.length ? undefined : replay();
    try { this.applyPageRows(table, page, cursor, complete, after); } finally { this.reads.purges.clear(); }
    // A foreground sync pulls every table, nearly always empty: only a page that could change what a screen shows
    // redraws the app.
    if (page.length || replay() !== before) this.notify();
  }
  private applyPageRows(table: Table, page: ServerRow[], cursor: string, complete: boolean, after: string) {
    this.safe(() => this.db.transaction(() => {
      this.table(table);
      if (!this.syncTables().includes(table)) throw new Error('Sync feature disabled.');
      if (!/^\d+$/.test(after) || !/^\d+$/.test(cursor) || BigInt(cursor) < BigInt(after)) throw new Error('Invalid cursor.');
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
        // Refill only unauthored gated fields, even for a newer pending base edit.
        const dormant = this.syncFlags.syncedV1Columns ? this.dormantFields(table,row.id) : undefined;
        const hydrate = local && this.syncFlags.syncedV1Columns && (dormant ||
          (order === 0 && !this.db.get(sql`SELECT 1 FROM sync_outbox WHERE owner_id=${this.owner} AND table_name=${table} AND row_id=${row.id}`)));
        if (order > 0) {
          // retainLosingVersion requires this exact local revision in the outbox.
          if (local) this.retainLosingVersion(local,row);
          this.write(canonicalPulledRow(mergeSyncRow(row,local,this.syncFlags)));
          // An OFF merge retains local gated values even when the server base
          // wins. Mark them regardless of an older ON revision in the outbox.
          if (!this.syncFlags.syncedV1Columns && hasGatedColumns(table) && row.deleted_at === null) {
            this.setState(this.dormantKey(table,row.id),'1');
          }
        }
        else if (hydrate) {
          const hydrated = hydrateSyncRow(row,local!,dormant);
          if (hydrated) this.write(canonicalPulledRow(hydrated));
        }
        if (dormant) this.clearDormant(table,row.id);
      }
      this.applyPurges();
      this.setState('clock', String(clock));
      // An edit/OFF pull may have reset progress while this page was in flight.
      // Its rows remain useful, but it cannot advance or complete that replay.
      if (this.cursor(table) !== after) return;
      this.setState(this.cursorKey(table),cursor);
      // custom_exercises is ON-only in syncTables: its OFF arm is unreachable;
      // the shared completion path still marks its ON replay for preference promotion.
      if (hasGatedColumns(table) || table === 'custom_exercises') {
        if (!this.syncFlags.syncedV1Columns) {
          this.setState(this.replayKey(table),'needed');
          this.setState(`cursor:v1:${table}`,'0');
        } else if (complete) this.setState(this.replayKey(table),'complete');
      }
    }));
  }
  /** Within the caller's transaction. Children must be wiped before references. */
  private applyPurges() {
    const markers=this.purgeMarkers();
    // Recovery copies come only from sync, which the sample and guest data never do: no need to look for them on each save.
    for (const saved of this.owner === 'demo' || this.owner === 'guest' ? [] : this.losingVersions()) {
      const current = this.get(saved.row.table,saved.row.id);
      if (current?.deleted_at !== null || markers.some(marker => matchesPurge(saved.row,marker,(table,id)=>this.get(table,id)))) {
        this.dropLosingVersion(saved.key);
      }
    }
    for (const marker of markers) {
      for (const table of ['sets','entries','sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days','photos','daily_logs'] as const) {
        for (const row of this.list(table)) {
          // Health-origin rows remain local and never enter a sync outbox.
          if (!matchesPurge(row,marker,(parent,id)=>this.get(parent,id))) continue;
          const dead=this.write(purgeTombstone(row,marker));
          this.db.run(sql`UPDATE sync_outbox SET revision=${revision(dead)} WHERE owner_id=${this.owner} AND table_name=${table} AND row_id=${row.id}`);
        }
      }
    }
  }
}
/** Device metadata is local-only and has no account data. */
export function deviceId(db: ExpoSQLiteDatabase, uuid: () => string) {
  const current = db.get<{value:string}>(sql`SELECT value FROM sync_state WHERE owner_id='device' AND key='id'`);
  if (current) return current.value;
  const id = uuid(); db.run(sql`INSERT INTO sync_state(owner_id,key,value) VALUES('device','id',${id})`); return id;
}
export type LocalQuery = SQL;
