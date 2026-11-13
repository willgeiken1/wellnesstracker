import { useWindowDimensions } from 'react-native';

/** At or above this text size (iOS Accessibility sizes start near 1.6x) side-by-side rows stack. */
export const STACK_AT = 1.6;
/** How far a number drawn inside a fixed-size ring may grow; the same value is also written at full size outside it. */
export const IN_RING_MAX = 1.2;

/** The system text size as a multiplier (1 at the default size). */
export function useFontScale() {
  return useWindowDimensions().fontScale || 1;
}
/** True when the person's text size is large enough that rows should stack instead of sitting side by side. */
export function useStacked(at = STACK_AT) {
  return useFontScale() >= at;
}
/** True when text capped at `IN_RING_MAX` is smaller than the person asked for, so a full-size copy is needed. */
export function useOutgrowsRing() {
  return useFontScale() > IN_RING_MAX;
}
