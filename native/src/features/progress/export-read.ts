import { appleHealth } from '@/features/health/apple';
import { lastDays, readHealthDays, type HealthDays } from '@/features/health/days';
import { mergeHealthDays, readOuraDays, readOuraRecovery, type OuraRecovery, type OuraSource } from '@/features/health/oura';
import { oura } from '@/features/health/oura-client';
import { readRecovery, type Recovery } from '@/features/health/recovery';
import type { HealthSource } from '@/features/health/source';
import { HISTORY } from './model';
import type { ExportRange } from './export';

export interface ExportReadings { health: HealthDays | null; recovery: Recovery | null; ring: OuraRecovery | null }

/** How many days of readings an export range needs. Progress keeps a year of days, so All time reads the last year of
 * Apple Health and Oura readings; logs kept on this phone (weight, food, workouts) are exported in full. */
export const exportDays = (range: ExportRange) => range === '30' ? 30 : range === '90' ? 90 : HISTORY;

/**
 * Reads Apple Health and Oura for the whole export range when the person exports, so a 90-day or All time export holds
 * every reading in that range, not only the 30 days Progress keeps in memory for its charts. Never prompts. A source that
 * is off or fails is left out, as on the screens.
 */
export async function readExportReadings(range: ExportRange, now = new Date(),
  sources: { apple?: HealthSource | null; ring?: OuraSource | null } = {}): Promise<ExportReadings> {
  const apple = sources.apple !== undefined ? sources.apple : appleHealth(), ring = sources.ring !== undefined ? sources.ring : oura();
  const days = lastDays(now, exportDays(range));
  const [appleDays, ringDays, recovery, ringRecovery] = await Promise.all([
    readHealthDays(apple, days, now).catch(() => null),
    readOuraDays(ring, days, now).catch(() => null),
    readRecovery(apple, days, now).catch(() => null),
    readOuraRecovery(ring, days, now).catch(() => null),
  ]);
  return { health: mergeHealthDays(appleDays, ringDays), recovery, ring: ringRecovery };
}
