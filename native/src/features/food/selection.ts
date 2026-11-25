import { useSyncExternalStore } from 'react';
import { attributedDay } from './model';

/**
 * The day picked in the Food tab's strip, shared by the strip, the tiles and the sheets they open. Null means today,
 * so the tab follows the clock past 4 AM without being told. Burned calories from Apple Health are kept here too,
 * in memory only, so tiles drawn by the grid can read them without each asking Health again.
 */
let picked: string | null = null;
let burned: Record<string, number> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
let version = 0;
const read = () => version;

export function pickFoodDay(day: string | null) {
  const next = day && day !== attributedDay() ? day : null;
  if (next === picked) return;
  picked = next; version++; emit();
}
export const foodDay = () => picked ?? attributedDay();
/** Burned calories by day. Health readings stay in memory for this session and are never saved or sent. */
export function setBurned(next: Record<string, number>) {
  const same = Object.keys(next).length === Object.keys(burned).length && Object.entries(next).every(([k, v]) => burned[k] === v);
  if (same) return;
  burned = next; version++; emit();
}
export const burnedOn = (day: string): number | null => burned[day] ?? null;

/** The picked day, today's day and whether they are the same, redrawn when either changes. */
export function useFoodDay() {
  useSyncExternalStore(subscribe, read, read);
  const today = attributedDay(), day = picked && picked < today ? picked : today;
  return { day, today, isToday: day === today, burned: burnedOn(day) };
}
/** For tests: back to today with nothing burned. */
export function resetFoodDay() { picked = null; burned = {}; version++; emit(); }
