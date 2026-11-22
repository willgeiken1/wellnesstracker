import { useCallback } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';

/** The repository when the app has one, or null (a screen drawn outside the app's providers, as in a test). */
function useOptionalRepository(): Repository | null {
  try { return useAuth().repository ?? null; } catch { return null; }
}

/** A light tick when a choice changes, like a tab or a segment. It follows the Haptics switch in Settings,
 * stays quiet while the app is in the background, and never throws. */
export function useSelectionHaptic() {
  const repository = useOptionalRepository();
  return useCallback(() => {
    if (!repository || repository.localGet<boolean>('haptics') === false || AppState.currentState !== 'active') return;
    void Haptics.selectionAsync().catch(() => {});
  }, [repository]);
}
