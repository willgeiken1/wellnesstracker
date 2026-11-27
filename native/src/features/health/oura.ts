import type { DaySeries, HealthDays } from './days';
import type { Night } from './recovery';

/**
 * Oura, through the account's existing connection. The server already holds the Oura login and one row per
 * day for the signed-in person; this only asks it to refresh and reads those rows back. On the phone the
 * values live in memory: they are never written to local storage, the sync queue, logs, AI or analytics.
 */
/** `expired`: still connected, but Oura no longer accepts the sign-in, so new days cannot come in until the person reconnects. */
export interface OuraStatus { connected: boolean; expired?: boolean; lastSync: string | null; /** The signed-in account's id. */ account?: string }
export interface OuraDay {
  day: string; sleepSeconds: number | null; steps: number | null;
  /** Oura's own scores, 0 to 100. */
  readiness?: number | null; sleepScore?: number | null;
  /** From the night that ends on this day: average HRV (ms) and lowest heart rate (bpm). */
  hrv?: number | null; restingHeartRate?: number | null;
  /** That night's stages, in seconds. */
  deepSeconds?: number | null; lightSeconds?: number | null; remSeconds?: number | null; awakeSeconds?: number | null;
}
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

/** Where oura-callback sends a login that was started from this app; reaching it closes the sign-in sheet. */
export const OURA_RETURN = 'insight://oura';

const HOUR = 3_600_000;
/** How long a refresh from Oura is trusted before the server is asked again, and how soon a failed ask is retried. */
export const SYNC_EVERY = HOUR, RETRY_AFTER = 10 * 60_000;
/** When Oura is refusing the sign-in, it is still tried now and then: a brief outage at Oura looks the same. */
export const EXPIRED_RETRY_AFTER = 3 * HOUR;
export const FIRST_SYNC_DAYS = 120, LATER_SYNC_DAYS = 14;
/** How long a refresh may take before it is given up on, so nothing waits on a request that never answers. */
export const SYNC_TIMEOUT = 60_000;
/** Per account: when the server was last asked to refresh, and the refresh still running, so every screen (and
 * Settings) shares one refresh at a time and a second account on the same phone is never skipped. */
const lastAsk = new Map<string, number>();
const running = new Map<string, Promise<boolean>>();
/** For tests: forget when the server was last asked. */
export const resetOuraAsk = () => { lastAsk.clear(); running.clear(); };

/** Asks the server to fetch the last `days` days from Oura, giving up after `SYNC_TIMEOUT`. */
export function syncOura(source: OuraSource, days: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error('Oura request timed out.')), SYNC_TIMEOUT); });
  return Promise.race([source.sync(days), late]).finally(() => clearTimeout(timer));
}

/** Refreshes now, or joins the refresh already running for this account. True once a refresh has landed.
 * Used by the Settings buttons, which say when it fails. */
export function syncNow(source: OuraSource, status: OuraStatus, now = new Date()): Promise<boolean> {
  const account = status.account ?? '', already = running.get(account);
  if (already) return already;
  lastAsk.set(account, now.getTime());
  const work = syncOura(source, status.lastSync ? LATER_SYNC_DAYS : FIRST_SYNC_DAYS).then(() => true)
    .finally(() => { running.delete(account); });
  running.set(account, work);
  return work;
}

/** Asks the server to refresh from Oura when its copy is over an hour old, or joins a refresh already running.
 * True once a refresh has landed. A failed refresh is not an error here: the days already stored still show. */
export async function refreshOura(source: OuraSource, status: OuraStatus, now = new Date()): Promise<boolean> {
  const account = status.account ?? '', already = running.get(account);
  if (already) return already.catch(() => false);
  const synced = status.lastSync ? Date.parse(status.lastSync) : NaN;
  if (!status.expired && Number.isFinite(synced) && now.getTime() - synced < SYNC_EVERY) return false;
  if (now.getTime() - (lastAsk.get(account) ?? 0) < (status.expired ? EXPIRED_RETRY_AFTER : RETRY_AFTER)) return false;
  return syncNow(source, status, now).catch(() => false);
}

/** Steps and sleep for the given days from Oura, or null when Oura is not connected. A day Oura has nothing for is null.
 * The days already stored come back at once; a refresh from Oura runs alongside and never holds them back.
 * `onFresh` is called once that refresh has landed, so the caller can read again. */
export async function readOuraDays(source: OuraSource | null, days: readonly string[], now = new Date(), onFresh?: () => void): Promise<HealthDays | null> {
  if (!source || !days.length) return null;
  const status = await source.status();
  if (!status?.connected) return null;
  void refreshOura(source, status, now).then(fresh => { if (fresh) onFresh?.(); });
  const rows = new Map((await source.days(days[0], days[days.length - 1])).map(row => [row.day, row]));
  const sleepHours = days.map(day => { const seconds = rows.get(day)?.sleepSeconds; return typeof seconds === 'number' && seconds > 0 ? seconds / 3600 : null; });
  return {
    steps: days.map(day => { const steps = rows.get(day)?.steps; return typeof steps === 'number' && Number.isFinite(steps) ? Math.round(steps) : null; }),
    sleepHours, sleepFrom: sleepHours.map(h => h == null ? null : 'oura'),
    // Only steps and sleep are read from Oura; everything else comes from Apple Health alone.
    activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null,
  };
}

/** One set of days from two sources. Sleep prefers Oura (the ring worn to bed); steps prefer Apple Health,
 * which may already include the ring's steps, so the two are never added together. */
export function mergeHealthDays(apple: HealthDays | null, ring: HealthDays | null): HealthDays | null {
  if (!apple || !ring) return apple ?? ring;
  const pick = (first: DaySeries | null, second: DaySeries | null) => !first || !second ? first ?? second
    : first.map((value, i) => value !== null && value > 0 ? value : second[i] ?? value);
  const sleepHours = pick(ring.sleepHours, apple.sleepHours);
  // Each day keeps where its sleep came from: Oura's night, or Apple Health's where the ring has none.
  const from = (h: DaySeries | null, i: number) => h?.[i] != null && h[i]! > 0;
  const sleepFrom = sleepHours?.map((h, i) => h == null ? null : from(ring.sleepHours, i) ? 'oura' as const : from(apple.sleepHours, i) ? 'apple' as const : null);
  return { ...apple, steps: pick(apple.steps, ring.steps), sleepHours, ...(sleepFrom ? { sleepFrom } : {}) };
}

/** What Oura adds to Insights › Recovery, oldest day first, null for a day with no reading. Held in memory only. */
export type OuraRecovery = {
  readiness: (number | null)[]; sleepScore: (number | null)[]; hrv: (number | null)[]; restingHeartRate: (number | null)[];
  /** The night that ended on the last day, by stage. Oura's light sleep is Apple Health's core. */
  night: Night | null;
};
const reading = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
const minutes = (seconds: number | null | undefined) => typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : 0;

/** Oura's scores, heart readings and last night for the given days, or null when Oura is not connected. The days
 * already stored come back at once; a refresh from Oura runs alongside, and `onFresh` is called once it lands. */
export async function readOuraRecovery(source: OuraSource | null, days: readonly string[], now = new Date(), onFresh?: () => void): Promise<OuraRecovery | null> {
  if (!source || !days.length) return null;
  const status = await source.status();
  if (!status?.connected) return null;
  void refreshOura(source, status, now).then(fresh => { if (fresh) onFresh?.(); });
  const rows = new Map((await source.days(days[0], days[days.length - 1])).map(row => [row.day, row]));
  const each = (pick: (row: OuraDay) => number | null | undefined) => days.map(day => { const row = rows.get(day); return row ? reading(pick(row)) : null; });
  const last = rows.get(days[days.length - 1]);
  const stages = last && { deep: minutes(last.deepSeconds), core: minutes(last.lightSeconds), rem: minutes(last.remSeconds), asleep: 0, awake: minutes(last.awakeSeconds) };
  return {
    readiness: each(row => row.readiness), sleepScore: each(row => row.sleepScore),
    hrv: each(row => row.hrv), restingHeartRate: each(row => row.restingHeartRate),
    night: stages && stages.deep + stages.core + stages.rem > 0 ? stages : null,
  };
}
