import { useMemo, useSyncExternalStore } from 'react';
import { homeItems, trayItems } from './model';
import { homeWidgetStoreFor, type HomeWidgetStorage } from './storage';

/**
 * Home layout, tray and unlock state for screens. Pass the owner repository (e.g. `useWorkout().store?.repo`);
 * every caller for that owner shares one store.
 */
export function useHomeWidgets(storage: HomeWidgetStorage | null | undefined) {
  const store = useMemo(() => homeWidgetStoreFor(storage), [storage]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return {
    ...state,
    home: homeItems(state),
    tray: trayItems(state),
    add: store.add,
    remove: store.remove,
    move: store.move,
    connectService: store.connectService,
    disconnectService: store.disconnectService,
    openEdit: store.openEdit,
    markGlowSeen: store.markGlowSeen,
  };
}
