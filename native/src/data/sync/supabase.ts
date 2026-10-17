import type { SupabaseClient } from '@supabase/supabase-js';
import { columns, fromWire, validateRow, type Row, type Table } from '../rows';
import type { Transport } from './engine';

export class SupabaseTransport implements Transport {
  constructor(private client: SupabaseClient, readonly owner: string) {}

  private async request<T>(operation: () => PromiseLike<T>): Promise<T> {
    try { return await operation(); }
    catch { throw new Error('Sync unavailable.'); }
  }

  private async checkOwner() {
    const { data, error } = await this.request(() => this.client.auth.getSession());
    if (error || data.session?.user.id !== this.owner) throw new Error('Sync account changed.');
  }

  async push(rows: Row[]) {
    await this.checkOwner();
    for (const row of rows) {
      validateRow(row);
      if (row.owner_id !== this.owner) throw new Error('Sync account changed.');
    }
    const { error } = await this.request(() => this.client.rpc('sync_push', { rows }));
    if (error) throw new Error('Sync unavailable.');
  }

  async pull(table: Table, after: string, limit: number) {
    await this.checkOwner();
    if (!Object.hasOwn(columns, table) || !/^\d+$/.test(after) || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error('Invalid sync request.');
    }
    // Cast bigint before JSON serialization, but filter/order the physical bigint column.
    const fields = ['owner_id', 'id', 'updated_at', 'deleted_at', 'device_id', ...Object.keys(columns[table]), 'server_seq::text'].join(',');
    const { data, error } = await this.request(() => this.client.from(table).select(fields)
      .eq('owner_id', this.owner).gt('server_seq', after).order('server_seq', { ascending: true }).limit(limit));
    if (error || !Array.isArray(data)) throw new Error('Sync unavailable.');
    return (data as unknown as Record<string, unknown>[]).map(row => fromWire(table, row));
  }
}
