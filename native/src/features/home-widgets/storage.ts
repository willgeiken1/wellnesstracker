import type { Repository } from '../../data/repository';
import {
  addWidget, connectService, defaultHomeWidgetState, disconnectService, markGlowSeen, moveWidget, openEdit, removeWidget,
  type HomeWidgetState,
} from './model';
import { isAvailable, isServiceId, isWidgetId, type ServiceId, type WidgetId } from './registry';

/** Owner-scoped local key (workout_local); not in the sync catalog. */
export const HOME_WIDGETS_KEY = 'homeWidgets';
export type HomeWidgetStorage = Pick<Repository, 'owner' | 'localGet' | 'localSave'>;

const unique = <T>(values: T[]) => [...new Set(values)];
const list = <T>(value: unknown, guard: (item: unknown) => item is T) => Array.isArray(value) ? unique(value.filter(guard)) : [];

/**
 * Reads saved state, dropping unknown and unavailable ids so a stale or damaged save never breaks Home.
 * Locked ids keep their layout slot (a disconnected service's widgets return in place on reconnect).
 */
export function loadHomeWidgets(storage: HomeWidgetStorage | null | undefined): HomeWidgetState {
  let saved: unknown;
  try { saved = storage?.localGet<unknown>(HOME_WIDGETS_KEY); } catch { saved = undefined; }
  if (!saved || typeof saved !== 'object' || !Array.isArray((saved as {layout?: unknown}).layout)) return defaultHomeWidgetState();
  const raw = saved as Record<string, unknown>;
  const glowSeen = list(raw.glowSeen, isWidgetId);
  return {
    layout: list(raw.layout, isWidgetId).filter(isAvailable),
    services: list(raw.services, isServiceId),
    editDot: raw.editDot === true,
    glowPending: list(raw.glowPending, isWidgetId).filter(id => !glowSeen.includes(id)),
    glowSeen,
  };
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
    disconnectService: (service: ServiceId) => commit(disconnectService(state, service)),
    openEdit: () => commit(openEdit(state)),
    markGlowSeen: (id: WidgetId) => commit(markGlowSeen(state, id)),
  };
}
export type HomeWidgetStore = ReturnType<typeof createHomeWidgetStore>;

const stores = new Map<string, { storage: HomeWidgetStorage | null; store: HomeWidgetStore }>();

/**
 * One shared store per owner, so Home and Edit widgets see the same state (B3). A new repository instance for the
 * same owner reloads from its saved state; '' holds the signed-out, no-repository store.
 */
export function homeWidgetStoreFor(storage: HomeWidgetStorage | null | undefined): HomeWidgetStore {
  const owner = storage?.owner ?? '';
  const cached = stores.get(owner);
  if (cached && cached.storage === (storage ?? null)) return cached.store;
  const store = createHomeWidgetStore(storage);
  stores.set(owner, { storage: storage ?? null, store });
  return store;
}
