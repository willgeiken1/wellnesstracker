import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';
import type { Repository } from '@/data/repository';
export function tick(repo: Repository) {
  if (repo.localGet<boolean>('haptics') !== false && AppState.currentState === 'active') void Haptics.selectionAsync().catch(() => {});
}
export function restBuzz(repo: Repository) {
  if (repo.localGet<boolean>('haptics') !== false && AppState.currentState === 'active') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
/** Distinct two-pulse signature; cleanup prevents a delayed pulse after leaving. */
export function signatureBuzz(repo: Repository) {
  if (repo.localGet<boolean>('haptics') === false || AppState.currentState !== 'active') return () => {};
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const timer = setTimeout(() => {
    if (AppState.currentState === 'active' && repo.localGet<boolean>('haptics') !== false) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, 140);
  return () => clearTimeout(timer);
}
