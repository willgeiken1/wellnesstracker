import { createContext, useContext } from 'react';
import type { SettingsPrefs } from './prefs-model';

/**
 * One tile's own units (the tile editor's Units section). A tile drawn inside a provider reads these in place of
 * Settings, so changing a tile to kg leaves every other tile and screen on what Settings says. Absent keys follow
 * Settings. They are kept in the tile's saved options as 'u.weight', 'u.energy' and so on.
 */
export type UnitKey = 'weight' | 'energy' | 'water' | 'distance' | 'height' | 'clock';
export type UnitOverride = Partial<{ [K in UnitKey]: SettingsPrefs['units'][K] }>;

export const UNIT_KEYS: readonly UnitKey[] = ['weight', 'energy', 'water', 'distance', 'height', 'clock'];
const OK: Record<UnitKey, readonly string[]> = {
  weight: ['lb', 'kg'], energy: ['kcal', 'kJ'], water: ['floz', 'ml'], distance: ['mi', 'km'], height: ['ftin', 'cm'], clock: ['12', '24'],
};

/** The tile's own units from its saved options, or null when it follows Settings for every unit. */
export function unitOverrideOf(options: Readonly<Record<string, string>> | undefined): UnitOverride | null {
  if (!options) return null;
  let out: UnitOverride | null = null;
  for (const k of UNIT_KEYS) {
    const v = options[`u.${k}`];
    if (v != null && OK[k].includes(v)) (out ??= {} as UnitOverride)[k] = v as never;
  }
  return out;
}

export const UnitOverrideContext = createContext<UnitOverride | null>(null);
/** The units of the tile being drawn, where it has its own; null outside a tile or when it follows Settings. */
export const useUnitOverride = () => useContext(UnitOverrideContext);

/** Settings' units with the tile's own laid over them. */
export function withUnits(prefs: SettingsPrefs, o: UnitOverride | null): SettingsPrefs {
  if (!o) return prefs;
  let same = true;
  for (const k of UNIT_KEYS) if (o[k] != null && o[k] !== prefs.units[k]) same = false;
  return same ? prefs : { ...prefs, units: { ...prefs.units, ...o } };
}
