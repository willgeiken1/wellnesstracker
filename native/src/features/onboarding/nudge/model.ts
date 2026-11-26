import type { MessageKey } from '@/i18n/en';

/** What the nudge reads and writes: the app's local key-value store for the signed-in or guest space. */
export interface NudgeStore { owner?: string; localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void }

/** Written by setup when it ends: which sections were skipped (ONBOARDING.md section 4). */
export const SKIPPED_KEY = 'onboardingSkipped';
export const COMPLETE_KEY = 'onboardingComplete';
/** How many times Later was tapped, and when it was first tapped. */
export const LATER_COUNT_KEY = 'nudgeLaterCount';
export const LATER_AT_KEY = 'nudgeLaterAt';
/** After the first Later the card comes back after this long; after the second it stays away. */
export const NUDGE_AGAIN_MS = 3 * 24 * 60 * 60 * 1000;
export const NUDGE_MAX_LATER = 2;

export interface Nudge { about: boolean; goals: boolean; title: MessageKey; body: MessageKey; frac: number }

/** The card's words for what was skipped, and how much of the mountain line is lit (half for each section done, at least 12 percent). */
export function nudgeFor(skipped: { about: boolean; goals: boolean }): Nudge | null {
  const { about, goals } = skipped;
  if (!about && !goals) return null;
  const title: MessageKey = about && goals ? 'obaNudgeBoth' : about ? 'obaNudgeAbout' : 'obaNudgeGoals';
  const body: MessageKey = about && goals ? 'obaNudgeBothBody' : about ? 'obaNudgeAboutBody' : 'obaNudgeGoalsBody';
  return { about, goals, title, body, frac: Math.max(0.12, (about ? 0 : 0.5) + (goals ? 0 : 0.5)) };
}

/**
 * The nudge to show on Home now, or null: setup has finished with About you or Goals skipped, this isn't sample data,
 * Later hasn't been tapped twice, and it's been three days since the first Later.
 */
export function nudgeDue(store: NudgeStore | null | undefined, now = Date.now()): Nudge | null {
  if (!store || store.owner === 'demo') return null;
  if (store.localGet(COMPLETE_KEY) !== true) return null;
  const s = store.localGet<{ about?: unknown; goals?: unknown }>(SKIPPED_KEY);
  const nudge = nudgeFor({ about: s?.about === true, goals: s?.goals === true });
  if (!nudge) return null;
  const count = Number(store.localGet(LATER_COUNT_KEY) ?? 0) || 0;
  if (count >= NUDGE_MAX_LATER) return null;
  const at = Number(store.localGet(LATER_AT_KEY) ?? 0) || 0;
  if (count > 0 && now - at < NUDGE_AGAIN_MS) return null;
  return nudge;
}

/** Later: counts the tap and starts the wait; returns the toast to show (ask again, or finish in Settings). */
export function nudgeLater(store: NudgeStore, now = Date.now()): MessageKey {
  const count = (Number(store.localGet(LATER_COUNT_KEY) ?? 0) || 0) + 1;
  store.localSave(LATER_COUNT_KEY, count);
  store.localSave(LATER_AT_KEY, now);
  return count > 1 ? 'obaLaterLast' : 'obaLaterFirst';
}
