import { FREE_AI_FOOD_LOGS_PER_DAY } from './config';

/** Local policy only. No persistence, purchases, UI, or server enforcement. */
export interface FoodAiUsage {
  /** Calendar keys and counts must be recorded in the supplied timeZone. */
  readonly daily: { readonly day: string; readonly photos: number; readonly descriptions: number };
}

export interface FoodAiQuotaOptions {
  readonly tier: 'free' | 'plus';
  readonly kind: 'photos' | 'descriptions';
  readonly usage: FoodAiUsage;
  readonly clock: () => Date;
  readonly timeZone: string;
}

export interface FoodAiQuotaDecision {
  readonly allowed: boolean;
  /** Available attempts before the proposed attempt; this function never reserves. */
  readonly remaining: number;
  /** UTC ISO instant of the next local calendar reset. */
  readonly resetsAt: string;
  readonly reason: 'free_daily_limit' | 'daily_cap' | null;
}

const DAY_MS = 86_400_000;

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid quota count');
  return value;
}

// UTC arithmetic here shifts calendar dates, never elapsed local days across DST.
function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function calendarFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

function localParts(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

function midnight(day: string, formatter: Intl.DateTimeFormat): string {
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  // Re-evaluate the offset at the target date so resets follow DST transitions.
  for (let i = 0; i < 4; i++) {
    const local = localParts(formatter, new Date(instant));
    const correction = target - Date.parse(`${local.day}T${local.time}Z`);
    if (correction === 0) return new Date(instant).toISOString();
    instant += correction;
  }
  throw new RangeError('Timezone has no resolvable midnight on quota reset date');
}

/**
 * Snap and Describe share the configured free allowance per local day.
 * All tiers reset at local midnight. Plus retains independent daily caps.
 * Plus counters match service.ts: 10 photos / 20 descriptions, independently,
 * counting reserved attempts (including failures), rather than successful results.
 * Stale period counters are ignored. Callers own reservation and persistence.
 * This policy applies only to AI food attempts; no other feature accepts it.
 */
export function foodAiQuota(options: FoodAiQuotaOptions): FoodAiQuotaDecision {
  const { tier, kind, usage, clock, timeZone } = options;
  const formatter = calendarFormatter(timeZone);
  const now = clock();
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid quota clock');
  const day = localParts(formatter, now).day;
  const limit = tier === 'free' ? FREE_AI_FOOD_LOGS_PER_DAY : kind === 'photos' ? 10 : 20;
  const used = usage.daily.day !== day ? 0 : tier === 'free'
    ? count(usage.daily.photos) + count(usage.daily.descriptions)
    : count(usage.daily[kind]);
  const resetDay = shift(day, 1);
  const reason = tier === 'free' ? 'free_daily_limit' : 'daily_cap';
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, remaining, resetsAt: midnight(resetDay, formatter), reason: remaining > 0 ? null : reason };
}
