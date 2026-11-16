import type { Repository } from '../../data/repository';
import type { Row } from '../../data/rows';
import { setHealthWeighIns } from './live-weights';
import type { HealthSource, WeightSample } from './source';

/** How far back a read reaches. */
export const IMPORT_DAYS = 730;
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Apple Health readings as weigh-in rows for the screens, in memory only. Readings that make no sense
 * (no id, no weight, over 700 kg, or in the future) are left out. */
export function toWeighIns(owner: string, samples: readonly WeightSample[], now = new Date()): Row[] {
  const seen = new Set<string>(), rows: Row[] = [];
  for (const sample of samples) {
    const id = sample.id?.toLowerCase();
    if (!id || seen.has(id) || !Number.isFinite(sample.kg) || sample.kg <= 0 || sample.kg > 700) continue;
    const at = sample.at.getTime();
    if (!Number.isFinite(at) || at > now.getTime()) continue;
    seen.add(id);
    rows.push({ table: 'weigh_ins', owner_id: owner, id, updated_at: at, deleted_at: null, device_id: 'healthkit',
      data: { day: localDay(sample.at), weight_kg: sample.kg, entered_value: sample.kg, entered_unit: 'kg', source: 'healthkit' } });
  }
  return rows;
}

/** Earlier versions copied Apple Health weigh-ins into the phone's database. Removing them leaves only an
 * empty marker with no weight or day, and nothing is queued for sync. Returns how many were removed. */
export function forgetStoredWeights(repo: Repository): number {
  let removed = 0;
  for (const row of repo.list('weigh_ins')) {
    if (row.data.source === 'app') continue;
    repo.remove('weigh_ins', row.id); removed += 1;
  }
  return removed;
}

/** Local midnight `IMPORT_DAYS` ago, so a read covers whole days. */
export function importStart(now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - IMPORT_DAYS);
  return start;
}

/** Reads recent weights if the person has already been asked, and holds them in memory. Never prompts and
 * never saves them. `live` is asked after every wait: once it says no (the page closed, or the account changed
 * or signed out) nothing is kept. Returns how many readings Apple Health gave. */
export async function refreshWeights(repo: Repository, source: HealthSource | null, now = new Date(), live: () => boolean = () => true): Promise<number> {
  forgetStoredWeights(repo);
  if (!source || await source.access() !== 'asked' || !live()) return 0;
  const samples = await source.weights(importStart(now));
  if (!live()) return 0;
  const rows = toWeighIns(repo.owner, samples, now);
  setHealthWeighIns(repo.owner, rows);
  return rows.length;
}
