import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Repository } from '@/data/repository';

/** The short buzz when touch and hold on the bar opens the Tab bar sheet. It follows the Haptics switch in Settings,
 * stays quiet in the background, and never throws. */
export function holdBuzz(repository: Pick<Repository, 'localGet'> | null) {
  if (!repository || repository.localGet<boolean>('haptics') === false || AppState.currentState !== 'active') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
