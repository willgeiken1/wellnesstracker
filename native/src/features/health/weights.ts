import type { Repository } from '../../data/repository';
import type { HealthSource, WeightSample } from './source';

/** How far back the first import reaches. */
export const IMPORT_DAYS = 730;
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rowId = (sample: WeightSample) => sample.id.toLowerCase();

/** Copies Apple Health weights into the weigh-ins kept on this phone. Rows carry the `healthkit` source,
 * which the repository never queues for sync. A reading already here is left alone. Returns how many were added. */
export function importWeights(repo: Repository, samples: readonly WeightSample[], now = new Date()): number {
  let added = 0;
  for (const sample of samples) {
    if (!sample.id || !Number.isFinite(sample.kg) || sample.kg <= 0 || sample.kg > 700) continue;
    if (!Number.isFinite(sample.at.getTime()) || sample.at.getTime() > now.getTime()) continue;
    if (repo.get('weigh_ins', rowId(sample))?.deleted_at === null) continue;
    repo.save('weigh_ins', { day: localDay(sample.at), weight_kg: sample.kg, entered_value: sample.kg, entered_unit: 'kg', source: 'healthkit' }, rowId(sample));
    added += 1;
  }
  return added;
}

/** Apple Health stays the record for its own readings: one that is no longer there is removed here too.
 * Only `healthkit` rows from `since` onward are touched, and `since` must be the same instant the read
 * started from. An empty read removes nothing: iOS returns nothing both when every reading is gone and when
 * the person has turned sharing off, and the two cannot be told apart. */
export function dropMissing(repo: Repository, samples: readonly WeightSample[], since: Date): number {
  if (!samples.length) return 0;
  const kept = new Set(samples.map(rowId)), from = localDay(since);
  let dropped = 0;
  for (const row of repo.list('weigh_ins')) {
    if (row.data.source !== 'healthkit' || String(row.data.day) < from || kept.has(row.id)) continue;
    repo.remove('weigh_ins', row.id); dropped += 1;
  }
  return dropped;
}

/** Local midnight `IMPORT_DAYS` ago, so the read and the removal check cover exactly the same whole days. */
export function importStart(now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - IMPORT_DAYS);
  return start;
}

/** Reads recent weights if the person has already been asked, and adds any new ones. Never prompts.
 * `live` is asked after every wait: once it says no (the page closed, or the account changed or signed out)
 * nothing more is written. */
export async function refreshWeights(repo: Repository, source: HealthSource | null, now = new Date(), live: () => boolean = () => true): Promise<number> {
  if (!source || await source.access() !== 'asked' || !live()) return 0;
  const since = importStart(now), samples = await source.weights(since);
  if (!live()) return 0;
  // One transaction and one change notice for the whole read: the first import can hold two years of readings,
  // and a notice per reading made every open screen redraw hundreds of times.
  return repo.atomic(() => {
    dropMissing(repo, samples, since);
    return importWeights(repo, samples, now);
  });
}
