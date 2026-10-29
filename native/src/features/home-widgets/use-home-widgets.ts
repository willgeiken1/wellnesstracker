import { useMemo, useSyncExternalStore } from 'react';
import { trayItems } from './model';
import { createHomeWidgetStore, type HomeWidgetStorage } from './storage';

/** Home layout, tray and unlock state for screens. Pass the owner repository (e.g. `useWorkout().store?.repo`). */
export function useHomeWidgets(storage: HomeWidgetStorage | null | undefined) {
  const store = useMemo(() => createHomeWidgetStore(storage), [storage]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return {
    ...state,
    tray: trayItems(state),
    add: store.add,
    remove: store.remove,
    move: store.move,
    connectService: store.connectService,
    openEdit: store.openEdit,
    markGlowSeen: store.markGlowSeen,
  };
}
