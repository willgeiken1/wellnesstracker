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

/** Apple Health stays the record for its own readings: one that is no longer there (deleted in Health, or
 * no longer shared) is removed here too. Only `healthkit` rows inside the window just read are touched. */
export function dropMissing(repo: Repository, samples: readonly WeightSample[], since: Date): number {
  const kept = new Set(samples.map(rowId)), from = localDay(since);
  let dropped = 0;
  for (const row of repo.list('weigh_ins')) {
    if (row.data.source !== 'healthkit' || String(row.data.day) < from || kept.has(row.id)) continue;
    repo.remove('weigh_ins', row.id); dropped += 1;
  }
  return dropped;
}

/** Reads recent weights if the person has already been asked, and adds any new ones. Never prompts. */
export async function refreshWeights(repo: Repository, source: HealthSource | null, now = new Date()): Promise<number> {
  if (!source || await source.access() !== 'asked') return 0;
  const since = new Date(now.getTime() - IMPORT_DAYS * 86_400_000), samples = await source.weights(since);
  dropMissing(repo, samples, since);
  return importWeights(repo, samples, now);
}
