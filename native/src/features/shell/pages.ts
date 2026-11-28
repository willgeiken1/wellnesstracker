import { en, t, type MessageKey } from '@/i18n/en';
import type { ActionIconName, NavIconName } from './icons';

/** The five pages on the bar, in bar order. `route` is the file under app/(tabs); `color` is the theme colour the page's
 * quick actions, its Customize sheet and its row in the Tab bar sheet take. Home is always on the bar. */
export const PAGES = [
  { key: 'home', route: 'index', href: '/', color: 'accent' },
  { key: 'training', route: 'workouts', href: '/workouts', color: 'training' },
  { key: 'food', route: 'food', href: '/food', color: 'food' },
  { key: 'progress', route: 'progress', href: '/progress', color: 'recovery' },
  { key: 'routines', route: 'routines', href: '/routines', color: 'sleep' },
] as const satisfies readonly { key: NavIconName; route: string; href: string; color: string }[];
export type PageKey = (typeof PAGES)[number]['key'];
export type PageColor = (typeof PAGES)[number]['color'];
export const PAGE_KEYS = PAGES.map(page => page.key) as PageKey[];
export const pageLabel = (key: PageKey) => t(`shellTab_${key}`);
export const pageOf = (key: PageKey) => PAGES.find(page => page.key === key)!;
/** The page a tab route belongs to. Insights now lives inside Progress, so its old route lights Progress. */
export function pageForRoute(route: string | undefined): PageKey | null {
  if (route === 'insights') return 'progress';
  return PAGES.find(page => page.route === route)?.key ?? null;
}

/** What a quick action opens when the page has not given it a handler of its own: an app route, or nothing yet. */
export type ActionGo = { route: string } | null;
export interface QuickAction {
  id: string;
  /** i18n keys for the name and the line under it. */
  label: MessageKey; hint: MessageKey;
  icon: ActionIconName;
  /** Its place among the page's defaults (1 sits closest to the thumb); absent when it is off by default. */
  d?: number;
  go: ActionGo;
}
const act = (id: string, key: string, icon: ActionIconName, d: number | undefined, go: ActionGo = null): QuickAction =>
  ({ id, label: `shellAct_${key}` as MessageKey, hint: `shellHint_${key}` as MessageKey, icon, d, go });

/** Every page's quick actions, in the order the Customize sheet lists the ones that are off. `d` marks the four on by
 * default. Ids match the mockup, so a page registers handlers by these ids (see registry.ts). */
export const ACTIONS: Record<PageKey, QuickAction[]> = {
  home: [
    act('edit', 'edit', 'move', 1), act('add', 'add', 'grid', 2), act('water', 'water', 'drop', 3),
    act('meal', 'meal', 'meal', 4, { route: '/food/log' }), act('start', 'start', 'play', undefined, { route: '/workout' }), act('weigh', 'weigh', 'scale', undefined),
  ],
  training: [
    act('start', 'start', 'play', 1, { route: '/workout' }), act('empty', 'empty', 'plus', 2, { route: '/workout' }), act('cardio', 'cardio', 'run', 3),
    act('plan', 'plan', 'clip', 4), act('timer', 'timer', 'timer', undefined), act('repeat', 'repeat', 'repeat', undefined), act('tiles', 'tiles', 'move', undefined),
  ],
  food: [
    act('meal', 'meal', 'meal', 1, { route: '/food/log' }), act('scan', 'scan', 'barcode', 2), act('water', 'glass', 'drop', 3), act('quick', 'quick', 'bolt', 4),
    act('saved', 'saved', 'bookmark', undefined), act('copy', 'copy', 'copy', undefined), act('tiles', 'tiles', 'move', undefined),
  ],
  progress: [
    act('weigh', 'weigh', 'scale', 1), act('photo', 'photo', 'camera', 2), act('range', 'range', 'cal', 3), act('charts', 'tiles', 'sliders', 4),
    act('measure', 'measure', 'ruler', undefined), act('export', 'export', 'share', undefined),
  ],
  routines: [
    act('add', 'item', 'capsule', 1), act('due', 'due', 'checks', 2), act('conv', 'conv', 'swap', 3), act('order', 'order', 'reorder', 4),
    act('pause', 'pause', 'pause', undefined), act('hist', 'hist', 'history', undefined), act('tiles', 'tiles', 'move', undefined),
  ],
};
/** The most actions the arc holds. */
export const MAX_ACTIONS = 5;
export const defaultActionIds = (page: PageKey) =>
  ACTIONS[page].filter(a => a.d).sort((a, b) => (a.d ?? 0) - (b.d ?? 0)).map(a => a.id);
/** The actions the + shows on a page: the person's own set in their order, or the defaults. Ids that no longer exist drop out,
 * and an empty set falls back to the defaults, so the + always has something. */
export function chosenActions(page: PageKey, saved: readonly string[] | undefined): QuickAction[] {
  const pool = ACTIONS[page];
  const ids = saved ?? defaultActionIds(page);
  const out = ids.map(id => pool.find(a => a.id === id)).filter((a): a is QuickAction => !!a).slice(0, MAX_ACTIONS);
  return out.length ? out : defaultActionIds(page).map(id => pool.find(a => a.id === id)!);
}
/** The Customize sheet's list: the chosen ones first in their order, then the rest in catalogue order. */
export function customizeOrder(page: PageKey, draft: readonly string[]): QuickAction[] {
  const pool = ACTIONS[page];
  return [...draft.map(id => pool.find(a => a.id === id)).filter((a): a is QuickAction => !!a), ...pool.filter(a => !draft.includes(a.id))];
}
/** Turning an action on or off in the Customize sheet. At least one stays on and five at most; a refused change says why. */
export function toggleDraft(draft: readonly string[], id: string): { next: string[]; refused?: 'keepOne' | 'fiveMost' } {
  if (draft.includes(id)) return draft.length <= 1 ? { next: [...draft], refused: 'keepOne' } : { next: draft.filter(x => x !== id) };
  return draft.length >= MAX_ACTIONS ? { next: [...draft], refused: 'fiveMost' } : { next: [...draft, id] };
}

/** Pages on the bar, as indexes into PAGES: every page not hidden, and the open page even when hidden, so you can see where you are. */
export function visiblePages(hidden: Partial<Record<PageKey, boolean>>, current: number): number[] {
  return PAGES.map((page, i) => i).filter(i => i === current || PAGES[i].key === 'home' || !hidden[PAGES[i].key]);
}

/** The next meal by the clock, for the Log a meal hint. */
export function nextMeal(now: Date): 'breakfast' | 'lunch' | 'dinner' {
  const h = now.getHours() + now.getMinutes() / 60;
  return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner';
}
/** The default hint for an action, before a page gives a live one. */
export function defaultHint(action: QuickAction, now: Date): string {
  return defaultHints(action, now)[0];
}
/** The default hint and its shorter forms, longest first: the arc uses the fullest one that fits beside its button. A shorter
 * form lives under `shellHintShort_<key>` next to the hint's own `shellHint_<key>`. */
export function defaultHints(action: QuickAction, now: Date): string[] {
  if (action.id === 'meal') {
    const meal = t(`shellMeal_${nextMeal(now)}`);
    return [t('shellMealNext').replace('{meal}', meal), t('shellMealNextShort').replace('{meal}', meal)];
  }
  const short = action.hint.replace('shellHint_', 'shellHintShort_');
  return short in en ? [t(action.hint), t(short as MessageKey)] : [t(action.hint)];
}
