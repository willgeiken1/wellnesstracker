import type { Repository } from '@/data/repository';
import type { Row, Table } from '@/data/rows';
import { deleteProgressPhoto } from '@/core/owner-files';
import { WATER_KEY } from '@/features/food/water';
import { WorkoutStore } from '@/data/workout/store';

/** What Delete a date range can remove, in the order the sheet lists them. */
export const RANGE_KINDS = ['workouts', 'food', 'body', 'routines', 'photos'] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];

/** A store that keeps its own days outside the synced tables (routine check-ins live with the Routines tab) adds its deleter here. */
type Deleter = (repo: Repository, from: string, to: string) => number;
const extra: Partial<Record<RangeKind, Deleter>> = {};
export function registerRangeDeleter(kind: RangeKind, fn: Deleter) { extra[kind] = fn; }
/** Whether anything can be deleted for this kind on this build. */
export function canDeleteKind(kind: RangeKind) { return kind !== 'routines' || !!extra.routines; }

const inDays = (day: unknown, from: string, to: string) => typeof day === 'string' && day >= from && day <= to;
const live = (repo: Repository, table: Table) => repo.list(table).filter((r: Row) => r.deleted_at === null);

/** Removes every row of the picked kinds whose day falls from `from` to `to` (YYYY-MM-DD, both included). Returns how many went. */
export function deleteDateRange(repo: Repository, from: string, to: string, kinds: readonly RangeKind[]): number {
  let n = 0;
  const drop = (table: Table, row: Row) => { repo.remove(table, row.id); n++; };
  for (const kind of kinds) {
    if (kind === 'workouts') {
      const sessions = live(repo, 'sessions').filter(r => inDays(r.data.day, from, to));
      const ids = new Set(sessions.map(s => s.id));
      const entries = live(repo, 'entries').filter(e => ids.has(String(e.data.session_id)));
      const entryIds = new Set(entries.map(e => e.id));
      for (const s of live(repo, 'sets')) if (entryIds.has(String(s.data.entry_id))) drop('sets', s);
      for (const e of entries) drop('entries', e);
      for (const s of sessions) drop('sessions', s);
      for (const c of live(repo, 'cardio_sessions')) if (inDays(c.data.day, from, to)) drop('cardio_sessions', c);
      // Records and weekly sets are kept worked out from the workouts left, so a deleted best no longer hides a later one.
      if (sessions.length) new WorkoutStore(repo).recompute();
    } else if (kind === 'food') {
      for (const f of live(repo, 'food_entries')) if (inDays(f.data.day, from, to)) drop('food_entries', f);
      const water = repo.localGet<{ log?: Record<string, unknown[]> }>(WATER_KEY);
      if (water?.log && typeof water.log === 'object') {
        const log = Object.fromEntries(Object.entries(water.log).filter(([day, drinks]) => {
          if (!inDays(day, from, to)) return true;
          n += Array.isArray(drinks) ? drinks.length : 0; return false;
        }));
        repo.localSave(WATER_KEY, { ...water, log });
      }
    } else if (kind === 'body') {
      for (const table of ['weigh_ins', 'measurements'] as const) for (const r of live(repo, table)) if (inDays(r.data.day, from, to)) drop(table, r);
      for (const key of ['progressNeck', 'progressBodyFat']) {
        const kept = repo.localGet<{ day?: string }[]>(key);
        if (Array.isArray(kept)) { const next = kept.filter(x => !inDays(x?.day, from, to)); n += kept.length - next.length; repo.localSave(key, next); }
      }
    } else if (kind === 'photos') {
      // Each photo's file goes first; a photo whose file can't be deleted keeps its address, so a later try can find it.
      const kept = repo.localGet<{ day?: string; uri?: unknown }[]>('progressPhotos');
      if (Array.isArray(kept)) { const next = kept.filter(x => !inDays(x?.day, from, to) || !deleteProgressPhoto(x?.uri)); n += kept.length - next.length; repo.localSave('progressPhotos', next); }
    } else if (extra[kind]) n += extra[kind]!(repo, from, to);
  }
  return n;
}

/** Progress photos on these days still listed, because their files couldn't be deleted. */
export function photosLeftInRange(repo: Repository, from: string, to: string): number {
  const kept = repo.localGet<{ day?: string }[]>('progressPhotos');
  return Array.isArray(kept) ? kept.filter(x => inDays(x?.day, from, to)).length : 0;
}

/**
 * Delete a date range as the sheet runs it. `deleted` when everything picked went; `photosKept` when some photos' files
 * couldn't be deleted, so those photos stay listed for a later try and the sheet must not say the range was deleted;
 * `failed` when the delete threw.
 */
export function runDateRangeDelete(repo: Repository, from: string, to: string, kinds: readonly RangeKind[]): { outcome: 'deleted' | 'photosKept' | 'failed'; kept: number } {
  try { deleteDateRange(repo, from, to, kinds); } catch { return { outcome: 'failed', kept: 0 }; }
  const kept = kinds.includes('photos') ? photosLeftInRange(repo, from, to) : 0;
  return { outcome: kept > 0 ? 'photosKept' : 'deleted', kept };
}

/** A local calendar day as YYYY-MM-DD. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
