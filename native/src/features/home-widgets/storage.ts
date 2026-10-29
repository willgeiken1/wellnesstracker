import type { Repository } from '../../data/repository';
import {
  addWidget, connectService, defaultHomeWidgetState, isUnlocked, markGlowSeen, moveWidget, openEdit, removeWidget,
  type HomeWidgetState,
} from './model';
import { isServiceId, isWidgetId, type ServiceId, type WidgetId } from './registry';

/** Owner-scoped local key (workout_local); not in the sync catalog. */
export const HOME_WIDGETS_KEY = 'homeWidgets';
export type HomeWidgetStorage = Pick<Repository, 'localGet' | 'localSave'>;

const unique = <T>(values: T[]) => [...new Set(values)];
const list = <T>(value: unknown, guard: (item: unknown) => item is T) => Array.isArray(value) ? unique(value.filter(guard)) : [];

/** Reads saved state, dropping unknown ids so a stale or damaged save never breaks Home. */
export function loadHomeWidgets(storage: HomeWidgetStorage | null | undefined): HomeWidgetState {
  let saved: unknown;
  try { saved = storage?.localGet<unknown>(HOME_WIDGETS_KEY); } catch { saved = undefined; }
  if (!saved || typeof saved !== 'object' || !Array.isArray((saved as {layout?: unknown}).layout)) return defaultHomeWidgetState();
  const raw = saved as Record<string, unknown>;
  const services = list(raw.services, isServiceId);
  const state: HomeWidgetState = { layout: [], services, editDot: raw.editDot === true, glowPending: list(raw.glowPending, isWidgetId), glowSeen: list(raw.glowSeen, isWidgetId) };
  return { ...state, layout: list(raw.layout, isWidgetId).filter(id => isUnlocked(state, id)) };
}

export function createHomeWidgetStore(storage: HomeWidgetStorage | null | undefined) {
  let state = loadHomeWidgets(storage);
  const listeners = new Set<() => void>();
  const commit = (next: HomeWidgetState) => {
    if (next === state) return;
    state = next;
    // Memory state still updates if the local write fails; Home stays usable this session.
    try { storage?.localSave(HOME_WIDGETS_KEY, state); } catch { /* retried on the next change */ }
    listeners.forEach(listener => listener());
  };
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    add: (id: WidgetId) => commit(addWidget(state, id)),
    remove: (id: WidgetId) => commit(removeWidget(state, id)),
    move: (from: number, to: number) => commit(moveWidget(state, from, to)),
    connectService(service: ServiceId): WidgetId[] {
      const result = connectService(state, service);
      commit(result.state);
      return result.unlocked;
    },
    openEdit: () => commit(openEdit(state)),
    markGlowSeen: (id: WidgetId) => commit(markGlowSeen(state, id)),
  };
}
export type HomeWidgetStore = ReturnType<typeof createHomeWidgetStore>;
