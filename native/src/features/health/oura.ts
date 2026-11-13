import { getAuthClient } from '@/auth/client';
import type { HealthDays } from './days';

/**
 * Oura, through the account's existing connection. The server already holds the Oura login and one row per
 * day for the signed-in person; this only asks it to refresh and reads those rows back. On the phone the
 * values live in memory: they are never written to local storage, the sync queue, logs, AI or analytics.
 */
/** `expired`: still connected, but Oura no longer accepts the sign-in, so new days cannot come in until the person reconnects. */
export interface OuraStatus { connected: boolean; expired?: boolean; lastSync: string | null }
export interface OuraDay { day: string; sleepSeconds: number | null; steps: number | null }
export interface OuraSource {
  /** Null when nobody is signed in. Never prompts. */
  status(): Promise<OuraStatus | null>;
  /** The Oura page where the person approves the connection. */
  connectUrl(): Promise<string>;
  /** Asks the server to fetch the last `days` days from Oura. */
  sync(days: number): Promise<void>;
  days(from: string, to: string): Promise<OuraDay[]>;
  /** Removes the Oura login and the stored Oura days from the account. */
  disconnect(): Promise<void>;
}

/** The server's own words when Oura has signed Insight out (`oura-sync`). Only used to choose the state; the text is never shown or logged. */
export const isExpired = (error: unknown) => typeof error === 'string' && /login expired|isn't connected/i.test(error);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** Only Oura's own approval page is ever opened, whatever the server answers. */
export const isOuraUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith('https://cloud.ouraring.com/oauth/authorize?');

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
      return { connected: !!data, expired: !!data && isExpired(data.last_error), lastSync: typeof data?.last_sync === 'string' ? data.last_sync : null };
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

const HOUR = 3_600_000;
/** How long a refresh from Oura is trusted before the server is asked again, and how soon a failed ask is retried. */
export const SYNC_EVERY = HOUR, RETRY_AFTER = 10 * 60_000;
export const FIRST_SYNC_DAYS = 120, LATER_SYNC_DAYS = 14;
let lastAsk = 0;
/** For tests: forget when the server was last asked. */
export const resetOuraAsk = () => { lastAsk = 0; };

/** Asks the server to refresh from Oura when its copy is over an hour old. A failed refresh is not an error
 * here: the days already stored still show. */
export async function refreshOura(source: OuraSource, status: OuraStatus, now = new Date()): Promise<void> {
  // An expired sign-in cannot refresh; asking again would only fail. Reconnecting starts it again.
  if (status.expired) return;
  const synced = status.lastSync ? Date.parse(status.lastSync) : NaN;
  if (Number.isFinite(synced) && now.getTime() - synced < SYNC_EVERY) return;
  if (now.getTime() - lastAsk < RETRY_AFTER) return;
  lastAsk = now.getTime();
  try { await source.sync(status.lastSync ? LATER_SYNC_DAYS : FIRST_SYNC_DAYS); } catch { /* the stored days still show */ }
}

/** Steps and sleep for the given days from Oura, or null when Oura is not connected. A day Oura has nothing for is 0. */
export async function readOuraDays(source: OuraSource | null, days: readonly string[], now = new Date()): Promise<HealthDays | null> {
  if (!source || !days.length) return null;
  const status = await source.status();
  if (!status?.connected) return null;
  await refreshOura(source, status, now);
  const rows = new Map((await source.days(days[0], days[days.length - 1])).map(row => [row.day, row]));
  return {
    steps: days.map(day => Math.round(rows.get(day)?.steps ?? 0)),
    sleepHours: days.map(day => (rows.get(day)?.sleepSeconds ?? 0) / 3600),
  };
}

/** One set of days from two sources. Sleep prefers Oura (the ring worn to bed); steps prefer Apple Health,
 * which may already include the ring's steps, so the two are never added together. */
export function mergeHealthDays(apple: HealthDays | null, ring: HealthDays | null): HealthDays | null {
  if (!apple || !ring) return apple ?? ring;
  const pick = (first: number[] | null, second: number[] | null) => !first || !second ? first ?? second
    : first.map((value, i) => value > 0 ? value : second[i] ?? 0);
  return { steps: pick(apple.steps, ring.steps), sleepHours: pick(ring.sleepHours, apple.sleepHours) };
}
