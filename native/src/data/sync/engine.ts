import { ProvenanceConflict } from './conflict';
import type { Pending, Repository } from '../repository';
import type { Row, ServerRow, Table } from '../rows';
import { DEFAULT_SYNC_FLAGS, hasGatedColumns, type SyncFlags } from './flags';
export interface Transport {
  readonly syncFlags?: Readonly<SyncFlags>;
  readonly owner: string;
  push(rows: Row[]): Promise<Row[] | void>;
  pull(table: Table, after: string, limit: number): Promise<ServerRow[]>;
}
export type SyncStatus = 'idle' | 'syncing' | 'offline';
export class SyncEngine {
  status: SyncStatus = 'idle';
  initialPullComplete = false;
  pullRevision = 0;
  private active = true;
  private flight?: Promise<void>;
  private requested = false;
  private listeners = new Set<() => void>();
  constructor(readonly repository: Repository, private transport: Transport, private pageSize = 100) {
    if (repository.syncFlags.syncedV1Columns !== (transport.syncFlags ?? DEFAULT_SYNC_FLAGS).syncedV1Columns) throw new Error('Sync feature flags must match.');
    if (repository.owner !== transport.owner || ['guest','demo'].includes(repository.owner)) throw new Error('Sync requires the matching signed-in account.');
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; }
  private setStatus(status: SyncStatus) { this.status=status; this.listeners.forEach(l=>l()); }
  sync(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.flight) { this.requested = true; return this.flight; }
    this.flight = (async () => {
      do {
        this.requested = false;
        await this.run();
      } while (this.active && this.requested);
    })().finally(() => { this.flight = undefined; });
    return this.flight;
  }
  private async pushBatch(batch: Pending[]): Promise<void> {
    if (!this.active) return;
    try {
      const accepted = await this.transport.push(batch.map(p=>p.row));
      if (this.active) this.repository.ack(batch,Array.isArray(accepted)?accepted:undefined);
    } catch (error) {
      if (!this.active) return;
      if (!(error instanceof ProvenanceConflict)) throw error;
      // The RPC batch is atomic. Isolate only a dedicated provenance failure;
      // ordinary outages leave the entire batch pending for a later sync.
      if (batch.length === 1) this.repository.flagConflict(batch[0]);
      else for (const item of batch) await this.pushBatch([item]);
    }
  }
  private async pullTable(table: Table) {
    let more=true;
    while (more && this.active) {
      const after=this.repository.cursor(table);
      const page=await this.transport.pull(table,after,this.pageSize);
      if (!this.active) return;
      let cursor=after;
      for (const item of page) {
        if (!/^\d+$/.test(item.server_seq) || BigInt(item.server_seq)<=BigInt(cursor)) throw new Error('Invalid sync cursor.');
        cursor=item.server_seq;
      }
      more=page.length===this.pageSize;
      // Completion is known only after the final (possibly empty) page.
      this.repository.applyPage(table,page,cursor,!more,after);
      // A reset during the final page still requires another pull before push.
      more ||= this.repository.cursor(table) !== cursor;
    }
  }
  private async run() {
    this.setStatus('syncing');
    try {
      await this.pullTable('purges');
      // Replay v1 columns before an enabled upload can publish dormant values.
      if (this.repository.syncFlags.syncedV1Columns) {
        for (const table of this.repository.syncTables().filter(hasGatedColumns)) await this.pullTable(table);
      }
      // Snapshot revisions prevent a successful old push from acknowledging a newer edit.
      const pending=this.repository.pending();
      for (let i=0;i<pending.length;i+=100) {
        if (!this.active) return;
        const batch=pending.slice(i,i+100);
        await this.pushBatch(batch);
      }
      for (const table of this.repository.syncTables().filter(t=>t!=='purges')) await this.pullTable(table);
      if (this.active) { this.initialPullComplete=true; this.pullRevision++; this.setStatus('idle'); }
    } catch { if (this.active) this.setStatus('offline'); }
  }
  close() { this.active=false; this.listeners.clear(); }
}
/** Network/AppState are injected at the application boundary. No timer survives sign-out. */
export function syncTriggers(engine: SyncEngine, schedule = setTimeout, cancel = clearTimeout) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed=()=>{
    if (!engine.repository.pending().length) return;
    if (timer) cancel(timer);
    timer=schedule(()=>{timer=undefined; void engine.sync();},2000);
  };
  const unsubscribe=engine.repository.subscribe(changed);
  return {
    foreground:()=>engine.sync(), reconnect:()=>engine.sync(), now:()=>engine.sync(),
    stop:()=>{unsubscribe();if(timer)cancel(timer);engine.close();},
  };
}
