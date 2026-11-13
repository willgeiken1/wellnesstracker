import type { HealthDays } from './days';

/**
 * Oura, through the account's existing connection. The server already holds the Oura login and one row per
 * day for the signed-in person; this only asks it to refresh and reads those rows back. On the phone the
 * values live in memory: they are never written to local storage, the sync queue, logs, AI or analytics.
 */
/** `expired`: still connected, but Oura no longer accepts the sign-in, so new days cannot come in until the person reconnects. */
export interface OuraStatus { connected: boolean; expired?: boolean; lastSync: string | null; /** The signed-in account's id. */ account?: string }
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
/** Only Oura's own approval page is ever opened, whatever the server answers. */
export const isOuraUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith('https://cloud.ouraring.com/oauth/authorize?');

const HOUR = 3_600_000;
/** How long a refresh from Oura is trusted before the server is asked again, and how soon a failed ask is retried. */
export const SYNC_EVERY = HOUR, RETRY_AFTER = 10 * 60_000;
export const FIRST_SYNC_DAYS = 120, LATER_SYNC_DAYS = 14;
/** How long a refresh may take before it is given up on, so nothing waits on a request that never answers. */
export const SYNC_TIMEOUT = 60_000;
/** When the server was last asked to refresh, per account, so a second account on the same phone is not skipped. */
const lastAsk = new Map<string, number>();
/** For tests: forget when the server was last asked. */
export const resetOuraAsk = () => { lastAsk.clear(); };

/** Asks the server to fetch the last `days` days from Oura, giving up after `SYNC_TIMEOUT`. */
export function syncOura(source: OuraSource, days: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error('Oura request timed out.')), SYNC_TIMEOUT); });
  return Promise.race([source.sync(days), late]).finally(() => clearTimeout(timer));
}

/** Asks the server to refresh from Oura when its copy is over an hour old. True once a refresh has landed.
 * A failed refresh is not an error here: the days already stored still show. */
export async function refreshOura(source: OuraSource, status: OuraStatus, now = new Date()): Promise<boolean> {
  // An expired sign-in cannot refresh; asking again would only fail. Reconnecting starts it again.
  if (status.expired) return false;
  const synced = status.lastSync ? Date.parse(status.lastSync) : NaN;
  if (Number.isFinite(synced) && now.getTime() - synced < SYNC_EVERY) return false;
  const account = status.account ?? '';
  if (now.getTime() - (lastAsk.get(account) ?? 0) < RETRY_AFTER) return false;
  lastAsk.set(account, now.getTime());
  try { await syncOura(source, status.lastSync ? LATER_SYNC_DAYS : FIRST_SYNC_DAYS); return true; } catch { return false; }
}

/** Steps and sleep for the given days from Oura, or null when Oura is not connected. A day Oura has nothing for is 0.
 * The days already stored come back at once; a refresh from Oura runs alongside and never holds them back.
 * `onFresh` is called once that refresh has landed, so the caller can read again. */
export async function readOuraDays(source: OuraSource | null, days: readonly string[], now = new Date(), onFresh?: () => void): Promise<HealthDays | null> {
  if (!source || !days.length) return null;
  const status = await source.status();
  if (!status?.connected) return null;
  void refreshOura(source, status, now).then(fresh => { if (fresh) onFresh?.(); });
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
