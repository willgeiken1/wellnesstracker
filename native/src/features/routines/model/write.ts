/* The small steps every rule in model/ shares when it changes the shape:
   read a clean copy, stamp a row past the one it replaces, and hand back a
   clean copy. Nothing here writes to the phone; features/routines/store.ts
   saves the difference as rows. */

import { clipText, normalizeRoutineStore, validDay, type RoutineStore, type Stamped } from "./shape";

/** The moment of the change, and the routine day that moment falls on (dose.routineDayKey). */
export interface RoutineClock { now: number; day: string }
export type Collection = "blocks" | "items" | "placements" | "compounds" | "logs";

/* A change has to beat the row it replaces, even when the phone's clock ran backwards. */
export function stampAfter(now: number, previous: number | null | undefined): number {
  const floor = typeof previous === "number" && Number.isFinite(previous) && previous > 0 ? previous + 1 : 0;
  return Math.max(Number.isFinite(now) ? now : 0, floor);
}

export function rowStampOf(row: Stamped | undefined): number {
  return row ? Math.max(row.updatedAt || 0, row.deletedAt || 0) : 0;
}

export function put<K extends Collection>(store: RoutineStore, collection: K, entity: RoutineStore[K][number], at: number): RoutineStore {
  const rows = store[collection] as Stamped[];
  const row = { ...entity, updatedAt: at, deletedAt: typeof entity.deletedAt === "number" && entity.deletedAt > 0 ? at : null };
  const index = rows.findIndex((existing) => existing.id === entity.id);
  const next = index < 0 ? [...rows, row] : rows.map((existing, position) => (position === index ? row : existing));
  return { ...store, [collection]: next } as RoutineStore;
}

export function clean(store: RoutineStore | null): RoutineStore | null {
  return store ? normalizeRoutineStore(store) : null;
}

export function start(input: unknown, clock: RoutineClock, needsDay = true): RoutineStore | null {
  if (!clock || typeof clock.now !== "number" || !Number.isFinite(clock.now)) return null;
  if (needsDay && !validDay(clock.day)) return null;
  return normalizeRoutineStore(input);
}

export function logStamp(store: RoutineStore, clock: RoutineClock, id: string): number {
  return stampAfter(clock.now, rowStampOf(store.logs.find((row) => row.id === id)));
}

/* Prefs and the rollover hour are one row on the phone, so one stamp covers both. */
export function prefStamp(store: RoutineStore, clock: RoutineClock): number {
  return stampAfter(clock.now, Math.max(store.prefs.updatedAt || 0, store.settings.updatedAt || 0));
}

export function cleanName(name: unknown): string {
  if (typeof name !== "string") return "";
  return clipText(name, 80);
}

const TIME_RE = /^(\d{1,2}):([0-5]\d)$/;

/* "7:05" or "21:30". An hour past 23 is refused. */
export function parseRoutineTime(raw: unknown): { hour: number; minute: number } | null {
  if (typeof raw !== "string") return null;
  const match = TIME_RE.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

export function timeToMin(raw: unknown): number | null {
  const parsed = parseRoutineTime(raw);
  return parsed ? parsed.hour * 60 + parsed.minute : null;
}
