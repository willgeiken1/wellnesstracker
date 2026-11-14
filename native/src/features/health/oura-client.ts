import { getAuthClient } from '@/auth/client';
import { isExpired, isOuraUrl, type OuraSource } from './oura';

// The free iPhone build swaps this file for src/phone-only/oura-client.ts, which has no account and so no Oura.
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Null wherever there is no account to hold the connection (the phone-only build, or no sign-in set up). */
export function oura(): OuraSource | null {
  let client: ReturnType<typeof getAuthClient>;
  try { client = getAuthClient(); } catch { return null; }
  if (!client) return null;
  const user = async () => (await client.auth.getSession()).data.session?.user.id ?? null;
  const invoke = async (name: string, body: Record<string, unknown>) => {
    const { data, error } = await client.functions.invoke(name, { body });
    // The server's message is not passed on: it is not written for the person and is never logged.
    if (error || (data && typeof data === 'object' && 'error' in data)) throw new Error('Oura request failed.');
    return data as Record<string, unknown> | null;
  };
  return {
    async status() {
      const id = await user();
      if (!id) return null;
      const { data, error } = await client.from('oura_connections').select('last_sync, last_error').eq('user_id', id).maybeSingle();
      if (error) throw new Error('Oura status failed.');
      return { connected: !!data, expired: !!data && isExpired(data.last_error), lastSync: typeof data?.last_sync === 'string' ? data.last_sync : null, account: id };
    },
    async connectUrl() {
      const url = (await invoke('oura-connect', {}))?.url;
      if (!isOuraUrl(url)) throw new Error('Oura request failed.');
      return url;
    },
    async sync(days) { await invoke('oura-sync', { days }); },
    async days(from, to) {
      const id = await user();
      if (!id) return [];
      const { data, error } = await client.from('oura_days').select('day, data').eq('user_id', id).gte('day', from).lte('day', to);
      if (error) throw new Error('Oura read failed.');
      return (data ?? []).map(row => {
        const day = (row.data ?? {}) as Record<string, unknown>;
        return { day: String(row.day), sleepSeconds: number(day.total), steps: number(day.steps) };
      });
    },
    async disconnect() { await invoke('oura-connect', { action: 'disconnect' }); },
  };
}
