import { useCallback, useSyncExternalStore } from 'react';
import type { Repository } from '@/data/repository';
import {
  ALL_DAYS, addDays, clock, demoState, emptyState, itemById, normalize, nowOf, pretty, rById,
  type HiddenRoutine, type Item, type ItemKind, type ItemType, type Mark, type Now, type Routine, type RoutineColor, type RoutinesState,
} from './model';
import { dropWhenOwnerChanges } from '@/core/session-memory';
import { guardRoutinesStore, routineTablesIo } from './data/sqlite-store';

/*
 * The Routines data adapter. The screens and tiles talk only to `RoutinesStore`. `createLocalRoutinesStore` keeps each
 * account's routines on the phone, in that account's daily_* tables (data/sqlite-store.ts): a routine, an item, its place
 * in a routine, a pause and a check-off are each a row of their own. ROUTINES_KEY is only where an earlier build kept the
 * whole state as one JSON document; one found there is moved into the tables and the key is cleared.
 * The store the tab and the Home tiles share is dropped when the account changes or signs out (core/session-memory.ts).
 */

export const ROUTINES_KEY = 'routines';
/** History older than this many days is dropped on write. */
const KEEP_DAYS = 120;

export interface NewItem {
  name: string; type: ItemType | ''; kind: ItemKind; amt: number | null; unit: string;
  routines: string[]; time: number | null; hand: string; mixed: string; note: string | null;
}
export interface NewRoutine { name: string; from: number; to: number; days: number[]; color: RoutineColor; items: string[] }
/** What undoes a change. */
export type Undo = () => void;

export interface RoutinesStore {
  /** The whole state as it is now. The same object until something changes. */
  read(): RoutinesState;
  subscribe(listener: () => void): () => void;
  /** Ticks an item off for a day (today by default), or takes the tick away. Keeps the on-hand count in step. */
  toggleDone(itemId: string, day?: string): void;
  /** Skips an item for today, or takes the skip back. */
  toggleSkip(itemId: string, day?: string): void;
  addItem(draft: NewItem): { item: Item; undo: Undo };
  addRoutine(draft: NewRoutine): Routine;
  /** Puts the routines in this order (ids not listed keep their place at the end). */
  reorder(ids: string[]): void;
  /** Brings a hidden routine back onto the tab. */
  restore(id: string): Undo;
  pause(routineId: string, until: string, why: string | null): Undo;
  resume(routineId: string): void;
  setRemind(routineId: string, on: boolean): void;
}

function onHandStep(i: Item) { return i.vial ? 1 : i.perDay ? (i.unit === 'g' ? (i.amt ?? 1) : 1) : 0; }

/** A store over any get and save pair. Pure enough to test without a database. */
export function createRoutinesStore(io: { get(): unknown; save(s: RoutinesState): void; subscribe?(l: () => void): () => void; seed?(): RoutinesState }): RoutinesStore {
  let cache: RoutinesState | null = null;
  const listeners = new Set<() => void>();
  const read = () => {
    if (!cache) {
      const stored = normalize(io.get());
      cache = stored ?? (io.seed ? io.seed() : emptyState());
      if (!stored && io.seed) io.save(cache);
    }
    return cache;
  };
  const write = (next: RoutinesState) => {
    const today = nowOf().day, keepFrom = addDays(today, -KEEP_DAYS);
    next.log = Object.fromEntries(Object.entries(next.log).filter(([d, m]) => d >= keepFrom && Object.keys(m).length));
    cache = next; io.save(next); listeners.forEach(l => l());
  };
  const edit = (fn: (s: RoutinesState) => void) => { const s = structuredCloneState(read()); fn(s); write(s); };
  io.subscribe?.(() => {
    // Another writer changed the stored copy: read it again next time.
    const stored = normalize(io.get());
    if (stored && JSON.stringify(stored) !== JSON.stringify(cache)) { cache = stored; listeners.forEach(l => l()); }
  });
  const setMark = (s: RoutinesState, day: string, id: string, m: Mark | null) => {
    const prev = s.log[day]?.[id] ?? null, i = itemById(s, id);
    if (i && day === nowOf().day && i.left != null) {
      const step = onHandStep(i);
      if (prev === 'd' && m !== 'd') i.left += step;
      if (prev !== 'd' && m === 'd') i.left = Math.max(0, i.left - step);
    }
    const dayLog = { ...(s.log[day] ?? {}) };
    if (m) dayLog[id] = m; else delete dayLog[id];
    s.log[day] = dayLog;
  };
  const api: RoutinesStore = {
    read,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    toggleDone(id, day = nowOf().day) { edit(s => setMark(s, day, id, s.log[day]?.[id] === 'd' ? null : 'd')); },
    toggleSkip(id, day = nowOf().day) { edit(s => setMark(s, day, id, s.log[day]?.[id] === 's' ? null : 's')); },
    addItem(d) {
      const now = clock.now(), first = rById(read(), d.routines[0]);
      const dose = d.kind === 'dose';
      const item: Item = {
        id: `n${now.getTime().toString(36)}`, name: d.name.trim(), amt: dose ? d.amt : null, unit: dose ? d.unit : '',
        dose: dose ? `${pretty(d.amt)} ${d.unit}` : 'Tick when done', type: d.type || 'Other', kind: d.kind,
        routines: [...d.routines], h: d.time ?? first?.from ?? 9, days: null, created: nowOf(now).day, note: d.note,
        ...(d.mixed.trim() && dose ? { mixed: d.mixed.trim() } : {}),
      };
      if (d.hand) { item.left = Number(d.hand); if (d.type === 'Peptide') item.vial = Math.max(item.left, 1); else item.perDay = 1; }
      edit(s => { s.items.push(item); });
      return { item, undo: () => edit(s => { s.items = s.items.filter(i => i.id !== item.id); }) };
    },
    addRoutine(d) {
      const r: Routine = { id: `r${clock.now().getTime().toString(36)}`, name: d.name.trim(), from: d.from, to: d.to, color: d.color,
        days: d.days.length ? [...d.days].sort() : [...ALL_DAYS], remind: true, pauses: [] };
      edit(s => { s.routines.push(r); s.items.forEach(i => { if (d.items.includes(i.id) && !i.routines.includes(r.id)) i.routines.push(r.id); }); });
      return r;
    },
    reorder(ids) {
      edit(s => { const at = (r: Routine) => { const k = ids.indexOf(r.id); return k < 0 ? ids.length : k; }; s.routines.sort((a, b) => at(a) - at(b)); });
    },
    restore(id) {
      let back: HiddenRoutine | null = null;
      edit(s => { const k = s.hidden.findIndex(r => r.id === id); if (k < 0) return; back = s.hidden[k]; s.hidden.splice(k, 1); const { sub: _sub, ...r } = back; void _sub; s.routines.push(r); });
      return () => edit(s => { const r = s.routines.find(x => x.id === id); if (!r || !back) return; s.routines = s.routines.filter(x => x.id !== id); s.hidden.push({ ...r, sub: back.sub }); });
    },
    pause(rid, until, why) {
      const today = nowOf().day;
      edit(s => { const r = rById(s, rid); if (!r) return; r.pauses = r.pauses.filter(p => p.until <= today); r.pauses.push({ from: today, until, why }); });
      return () => api.resume(rid);
    },
    resume(rid) {
      const today = nowOf().day;
      // A pause that has not started counts for nothing; one that ran ends today, so its past days stay paused.
      edit(s => { const r = rById(s, rid); if (!r) return; r.pauses = r.pauses.filter(p => p.from < today || p.until <= today).map(p => (p.until > today ? { ...p, until: today } : p)); });
    },
    setRemind(rid, on) { edit(s => { const r = rById(s, rid); if (r) r.remind = on; }); },
  };
  return api;
}
function structuredCloneState(s: RoutinesState): RoutinesState { return JSON.parse(JSON.stringify(s)) as RoutinesState; }

/** The store for one account, kept in the phone's daily_* tables (data/sqlite-store.ts). A document an earlier build
 * left under ROUTINES_KEY is taken into the tables once. The demo account starts with the sample routines. */
export function createLocalRoutinesStore(repo: Repository): RoutinesStore {
  // The shared store below follows one account: it is dropped on sign-out and whenever the account changes.
  dropWhenOwnerChanges(ROUTINES_KEY, () => setActiveRoutinesStore(null));
  return guardRoutinesStore(createRoutinesStore(routineTablesIo(repo, {
    legacyKey: ROUTINES_KEY,
    seed: repo.owner === 'demo' ? () => demoState() : undefined,
  })));
}

/* ---------- the store the tab, tiles and screens share ---------- */

let current: { repo: Repository; store: RoutinesStore } | null = null;
const shareListeners = new Set<() => void>();
/** The store for this repository, made once per account. */
export function routinesStoreFor(repo: Repository): RoutinesStore {
  if (current?.repo !== repo) { current = { repo, store: createLocalRoutinesStore(repo) }; shareListeners.forEach(l => l()); }
  return current.store;
}
/** The store last opened, for code outside React (tile header text, quick actions). */
export const activeRoutinesStore = () => current?.store ?? null;
/** Replace the shared store (tests, or the real data layer). */
export function setActiveRoutinesStore(store: RoutinesStore | null, repo: Repository | null = null) {
  current = store ? { repo: repo ?? ({} as Repository), store } : null; shareListeners.forEach(l => l());
}

const noop = () => () => {};
/* One clock for every reader: it moves once a minute (checked every 20 seconds). */
let nowSnap = nowOf();
const nowListeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
function subscribeNow(l: () => void) {
  nowListeners.add(l);
  if (!ticker) ticker = setInterval(() => {
    const next = nowOf();
    if (next.day !== nowSnap.day || Math.floor(next.h * 60) !== Math.floor(nowSnap.h * 60)) { nowSnap = next; nowListeners.forEach(x => x()); }
  }, 20000);
  return () => { nowListeners.delete(l); if (!nowListeners.size && ticker) { clearInterval(ticker); ticker = null; } };
}
/** Reads the clock again now (tests, or after the app comes back). */
export function refreshNow() { nowSnap = nowOf(); nowListeners.forEach(x => x()); }
export const useNow = () => useSyncExternalStore(subscribeNow, () => nowSnap, () => nowSnap);

/** The state, redrawn on every change and once a minute so "now" moves. */
export function useRoutines(store: RoutinesStore | null): { s: RoutinesState; n: Now } {
  const sub = useCallback((l: () => void) => (store ? store.subscribe(l) : noop()), [store]);
  const s = useSyncExternalStore(sub, () => store?.read() ?? EMPTY, () => store?.read() ?? EMPTY);
  return { s, n: useNow() };
}
const EMPTY = emptyState();
/** The shared store, following whichever account the tab last opened. */
export function useActiveRoutinesStore() {
  return useSyncExternalStore(l => { shareListeners.add(l); return () => { shareListeners.delete(l); }; }, activeRoutinesStore, activeRoutinesStore);
}
