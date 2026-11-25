import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { tilePage } from './registry';
import { tileEdit, tileStoreFor, type TileStorage, type TileStore } from './store';
import type { TilePageId } from './types';

/** The signed-in owner's repository when the app has one (null in a test drawn outside the app's providers). */
export function useTileRepository(): Repository | null {
  try { return useAuth().repository ?? null; } catch { return null; }
}

/** A page's tile store and its current state. `storage` defaults to the app's repository. */
export function useTileStore(page: TilePageId, storage?: TileStorage | null) {
  const repo = useTileRepository();
  const store: TileStore = tileStoreFor(storage === undefined ? repo : storage, page);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { store, state, cfg: tilePage(page) };
}

/** Whether this page is in edit mode, which tile the customize sheet is open on, and a setter. */
export function useTileEdit(page: TilePageId) {
  const edit = useSyncExternalStore(tileEdit.subscribe, tileEdit.get, tileEdit.get);
  const setEditing = useCallback((on: boolean) => tileEdit.set(page, on), [page]);
  return { editing: edit.page === page, customizing: edit.page === page ? edit.customizing : null, setEditing };
}
