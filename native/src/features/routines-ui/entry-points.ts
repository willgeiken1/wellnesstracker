import type { Href } from 'expo-router';

/* Every screen Routines opens, by its route. The forms (Add item with the
   converter, New routine, Edit routines and the setup quiz) are built apart
   from the tab; they take over the routes named here and read these params. */
const withParams = (pathname: string, params: Record<string, string | undefined>): Href => {
  const kept = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]));
  return { pathname, params: kept } as unknown as Href;
};

export const routineRoutes = {
  /** The Routines tab itself. `view` opens it on an item type's tab; without one it opens on the day. */
  tab: (view?: string) => withParams('/routines', { view }),
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
