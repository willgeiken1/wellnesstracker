import { ProvenanceConflict } from './conflict';
import type { Pending, Repository } from '../repository';
import { syncedTables, type Row, type ServerRow, type Table } from '../rows';
export interface Transport {
  readonly owner: string;
  push(rows: Row[]): Promise<void>;
  pull(table: Table, after: string, limit: number): Promise<ServerRow[]>;
}
export type SyncStatus = 'idle' | 'syncing' | 'offline';
export class SyncEngine {
  status: SyncStatus = 'idle';
  private active = true;
  private flight?: Promise<void>;
  private requested = false;
  private listeners = new Set<() => void>();
  constructor(readonly repository: Repository, private transport: Transport, private pageSize = 100) {
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
      await this.transport.push(batch.map(p=>p.row));
      if (this.active) this.repository.ack(batch);
    } catch (error) {
      if (!this.active) return;
      if (!(error instanceof ProvenanceConflict)) throw error;
      // The RPC batch is atomic. Isolate only a dedicated provenance failure;
      // ordinary outages leave the entire batch pending for a later sync.
      if (batch.length === 1) this.repository.flagConflict(batch[0]);
      else for (const item of batch) await this.pushBatch([item]);
    }
  }
  private async run() {
    this.setStatus('syncing');
    try {
      // Snapshot revisions prevent a successful old push from acknowledging a newer edit.
      const pending=this.repository.pending();
      for (let i=0;i<pending.length;i+=100) {
        if (!this.active) return;
        const batch=pending.slice(i,i+100);
        await this.pushBatch(batch);
      }
      for (const table of syncedTables) {
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
          this.repository.applyPage(table,page,cursor);
          more=page.length===this.pageSize;
        }
      }
      if (this.active) this.setStatus('idle');
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
