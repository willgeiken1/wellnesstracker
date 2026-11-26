import type { MessageKey } from '@/i18n/en';

/** What the tips read and write: the app's local key-value store for the signed-in, guest or sample space. */
export interface TipsStore { owner?: string; localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void }

/** Setup sets this to '1' as it opens Home ("Open Insight"); the tips show once, then clear it. */
export const TIPS_KEY = 'onboarding:tips';
/** Kept after the tips have been seen (ONBOARDING.md §4 `tipsSeen`). */
export const TIPS_SEEN_KEY = 'tipsSeen';

/** True when the first-Home tips are due: setup just finished, this isn't sample data, and they haven't been seen. */
export function tipsDue(store: TipsStore | null | undefined): boolean {
  if (!store || store.owner === 'demo') return false;
  const flag = store.localGet<unknown>(TIPS_KEY);
  return (flag === '1' || flag === true) && store.localGet(TIPS_SEEN_KEY) !== true;
}

/** After Got it (or the last tap): the flag is cleared and the tips are marked seen, so they never show again. */
export function finishTips(store: TipsStore) {
  store.localSave(TIPS_KEY, null);
  store.localSave(TIPS_SEEN_KEY, true);
}

/** The three tips, in order: the hero and This week, the + button, the initial that opens Settings. */
export const TIPS: readonly { target: 'hero' | 'plus' | 'avatar'; title: MessageKey; body: MessageKey }[] = [
  { target: 'hero', title: 'obaTip1Title', body: 'obaTip1Body' },
  { target: 'plus', title: 'obaTip2Title', body: 'obaTip2Body' },
  { target: 'avatar', title: 'obaTip3Title', body: 'obaTip3Body' },
];
/** The tips wait this long after Home appears, so Home's own reveal has settled. */
export const TIPS_DELAY = 420;
