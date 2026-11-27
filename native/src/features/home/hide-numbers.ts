import { useSyncExternalStore } from 'react';
import { t } from '@/i18n/en';
import { fill } from '@/features/tiles/ui';
import type { TileCover } from '@/features/tiles/types';
import { homeTileState, subscribeHomeTileState } from './tiles/state';

/*
 * Hide numbers (Settings, Privacy and security; pages/home.js "MASKED"): while it is on, the Home tiles that show weight or
 * energy sit under a cover of dots and the hero's food energy reads as dots. One tap on a cover, or on the hero's food value,
 * shows Home's numbers until Home is left; coming back covers them again. The setting itself rides on Home's tile state, so
 * a tile never draws its figures before Home knows whether to hide them.
 */
/** Home tiles whose figures are body weight or energy: weight, body fat, calories eaten, active energy, training volume, Log a
 * meal, and Next while it shows the day's food (it shows sets during a workout). */
export const HIDDEN_TILES: ReadonlySet<string> = new Set(['weight', 'bodyFat', 'calories', 'active', 'volume', 'logMeal', 'next']);
/** Whether a tile shows weight or energy figures now. */
export function showsNumbers(id: string): boolean {
  if (!HIDDEN_TILES.has(id)) return false;
  return id !== 'next' || !homeTileState()?.data.next.activeWorkout;
}

let revealed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Shows Home's numbers until Home is left. */
export function revealNumbers() { if (revealed) return; revealed = true; emit(); }
/** Covers them again: on leaving Home, and when the setting changes. */
export function coverNumbers() { if (!revealed) return; revealed = false; emit(); }
/** Whether Home's weight and energy figures are covered now. */
export const numbersHidden = () => !!homeTileState()?.hide && !revealed;
export function subscribeNumbers(listener: () => void) {
  listeners.add(listener);
  const off = subscribeHomeTileState(listener);
  return () => { listeners.delete(listener); off(); };
}
export const useNumbersHidden = () => useSyncExternalStore(subscribeNumbers, numbersHidden, numbersHidden);

/** Whether this tile's figures are covered now. */
export const tileCovered = (id: string) => numbersHidden() && showsNumbers(id);
export const useTileCovered = (id: string) => useSyncExternalStore(subscribeNumbers, () => tileCovered(id), () => tileCovered(id));

/** What the tile grid uses for a covered tile: VoiceOver says it is hidden, and a tap shows the numbers instead of opening it. */
export const numbersCover = (id: string): TileCover => ({
  subscribe: subscribeNumbers, covered: () => tileCovered(id), reveal: revealNumbers,
  label: title => fill(t('homeNumbersHidden'), { title }),
});
