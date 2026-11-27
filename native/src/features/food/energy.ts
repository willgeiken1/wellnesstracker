import { t } from '@/i18n/en';
import { energyValue } from '../home/hero/model';
import { useSettingsPrefs } from '../settings/prefs';
import { loadSettingsPrefs, type PrefsStorage } from '../settings/prefs-model';
import { num } from './day';

/** Food is stored in kJ and counted in kcal; it is shown in the unit chosen in Settings, rounded the way Home rounds it. */
export type EnergyUnit = 'kcal' | 'kJ';
export const KJ_PER_KCAL = 4.184;

/** The energy unit from Settings; screens redraw when it changes. */
export function useEnergyUnit(): EnergyUnit { return useSettingsPrefs()[0].units.energy; }
/** The same, read once (for a toast or other one-off text). */
export const energyUnitOf = (storage: PrefsStorage | null | undefined): EnergyUnit => loadSettingsPrefs(storage).units.energy;

/** A kcal value in the chosen unit, as a number. */
export const enValue = (kcal: number, u: EnergyUnit) => energyValue(kcal, u);
/** A kcal value in the chosen unit, with commas: "1,240" or "5,190". */
export const enNum = (kcal: number, u: EnergyUnit) => num(energyValue(kcal, u));
/** The unit's label: "kcal" or "kJ". */
export const enLabel = (u: EnergyUnit) => u === 'kJ' ? t('foodKj') : t('foodKcal');
/** "1,240 kcal" or "5,190 kJ". */
export const enAmt = (kcal: number, u: EnergyUnit) => `${enNum(kcal, u)} ${enLabel(u)}`;
/** A typed amount in the chosen unit, back to kcal. */
export const toKcal = (v: number, u: EnergyUnit) => u === 'kJ' ? v / KJ_PER_KCAL : v;
/** " · 300 kcal" after a label, or nothing when the energy is unknown. */
export const energyTail = (kcal: number | null, u: EnergyUnit) => kcal == null ? '' : ` · ${enAmt(kcal, u)}`;
/** A sentence written in kcal, reworded for the chosen unit: "{v} kcal left" becomes "{v} kJ left". */
export const enText = (s: string, u: EnergyUnit) => u === 'kJ' ? s.replace(/\bkcal\b/g, t('foodKj')) : s;
