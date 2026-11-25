import { useSyncExternalStore } from 'react';
import { emptyProgress, type ProgressData, type Range } from './model';

/**
 * The Progress data the tab works out, shared with its tiles (drawn by the tile engine, also inside the tile tray and the
 * customize sheet) and its screens. In memory only. The page's Week, Month and Year control lives here too: every tile
 * with a Range option follows it unless the person picks a range for that tile.
 */
let data: ProgressData | null = null, range: Range = 'week';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function publishProgress(next: ProgressData) { if (next !== data) { data = next; emit(); } }
export function readProgress(): ProgressData { return data ?? fallback(); }
let empty: ProgressData | null = null;
function fallback() {
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!empty || empty.today !== today) empty = emptyProgress(today, 'lb');
  return empty;
}
export const useProgressData = () => useSyncExternalStore(subscribe, readProgress, readProgress);

export const pageRange = () => range;
export function setPageRange(next: Range) { if (next !== range) { range = next; emit(); } }
export const usePageRange = () => useSyncExternalStore(subscribe, pageRange, pageRange);
/** A tile's range: its own pick, or the page's. */
export const rangeOf = (options: Record<string, string>, page: Range): Range =>
  options.range === 'week' || options.range === 'month' || options.range === 'year' ? options.range : page;

/** For tests: forget everything. */
export function resetProgressStore() { data = null; range = 'week'; empty = null; emit(); }
