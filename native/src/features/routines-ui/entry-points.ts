import type { Href } from 'expo-router';

/* Every screen Routines opens, by its route. The forms (Add item with the
   converter, New routine, Edit routines and the setup quiz) are built apart
   from the tab; they take over the routes named here and read these params. */
const withParams = (pathname: string, params: Record<string, string | undefined>): Href => {
  const kept = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]));
  return { pathname, params: kept } as unknown as Href;
};

/** The view of the Routines tab that shows today's routines. An item type's tab is named by its type. */
export const ROUTINES_DAY_VIEW = 'routines';

/** What a link into the day view opens: a routine, or the routine that holds an item. */
export interface RoutineLinkTarget { blockId?: string; itemId?: string }

export const routineRoutes = {
  /** The Routines tab itself. `view` opens it on an item type's tab, or on the day with `ROUTINES_DAY_VIEW`.
   * Without one the tab stays on the view it was last left on, so a link that means the day says so.
   * `target` names the routine, and the item in it, that the day view opens: a routine other than the
   * current one is folded there until something opens it. */
  tab: (view?: string, target: RoutineLinkTarget = {}) => withParams('/routines', { view, blockId: target.blockId, itemId: target.itemId }),
  /** Add item. `type` preselects an item type, `blockId` a routine. */
  addItem: (params: { type?: string; blockId?: string } = {}) => withParams('/routines/add-item', params),
  /** The same form, opened on a saved item. */
  editItem: (itemId: string) => withParams('/routines/add-item', { itemId }),
  /** The concentration converter as a sheet of its own. With an item it opens for that item. */
  converter: (itemId?: string) => withParams('/routines/add-item', { step: 'converter', itemId }),
  newRoutine: () => '/routines/new' as Href,
  /** The list that moves, retimes, recolours, hides and restores routines. */
  editRoutines: () => '/routines/edit' as Href,
  editRoutine: (id: string) => withParams('/routines/edit/[id]', { id }),
  setup: (mode: 'quiz' | 'retake' = 'quiz') => withParams('/routines/setup', { mode: mode === 'retake' ? 'retake' : undefined }),
  history: () => '/routines/history' as Href,
  settings: () => '/routines/settings' as Href,
  sites: () => '/routines/sites' as Href,
  /** Item details. With a log it opens that log to edit. */
  item: (itemId: string, logId?: string) => withParams('/routines/item', { itemId, logId }),
} as const;
