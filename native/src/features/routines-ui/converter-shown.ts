import { routineShows } from '@/features/routines/model/setup';
import type { RoutineStore } from '@/features/routines/model/shape';
import { CONCENTRATION_CONVERTER_ENABLED } from './converter-flag';

/** Whether this build has the converter at all. Off, no screen draws it, names it or links to it. */
export const converterInBuild = (): boolean => CONCENTRATION_CONVERTER_ENABLED;

/** Whether the converter is on this person's page: the build has it, and their setup or their items call for it. */
export function converterShown(store: Partial<RoutineStore> | null | undefined): boolean {
  return CONCENTRATION_CONVERTER_ENABLED && routineShows('calculator', store);
}
