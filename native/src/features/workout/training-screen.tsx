import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/provider';
import { IconButton } from '@/components/button';
import { PageHeader } from '@/components/nav-bar';
import { useTheme } from '@/design/theme-provider';
import { TileGrid, tileEdit, useTileEdit } from '@/features/tiles';
import { pageEndSpace } from '@/features/shell/geometry';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { WorkoutStore } from '@/data/workout/store';
import { t } from '@/i18n/en';
import { trainingNav } from './nav';
import { repeatSession, startTraining } from './start-workout';
import { seedTrainingDemo } from './training-demo';
import { useTrainingData } from './tiles/parts';
import './tiles';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (d = new Date()) => `${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;

/** The Training tab: today's date and title, cardio and empty workout buttons, then the Training tiles. */
export function TrainingScreen() {
  const { colors } = useTheme();
  const { repository } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const data = useTrainingData();
  const { editing } = useTileEdit('training');
  useEffect(() => { if (repository?.owner === 'demo') seedTrainingDemo(repository); }, [repository]);

  const start = useCallback((routineId?: string) => { if (repository) startTraining(repository, routineId); }, [repository]);
  const repeat = useCallback(() => {
    if (!repository) return;
    const last = new WorkoutStore(repository).history()[0];
    if (last) repeatSession(repository, last.id); else start();
  }, [repository, start]);
  const next = data?.plan().next ?? null, last = data?.history()[0];
  useQuickActions('training', {
    start: { run: () => start(next?.routineId), hint: next?.name },
    empty: { run: () => start() },
    cardio: { run: () => trainingNav.cardio() },
    plan: { run: () => trainingNav.plan() },
    timer: { run: () => trainingNav.rest() },
    repeat: { run: repeat, hint: last ? String(last.data.name ?? '') || undefined : undefined },
    tiles: { run: () => tileEdit.set('training', true) },
  });
  useShellEditMode('training', editing, () => tileEdit.set('training', false));

  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Animated.ScrollView ref={scrollRef} testID="training-scroll" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: pageEndSpace(insets.bottom) }}>
      <View style={{ paddingHorizontal: 16 }}>
        <PageHeader eyebrow={longDate()} title={t('trainingTitle')} right={<>
          <IconButton icon="run" label={t('trainingLogCardio')} onPress={() => trainingNav.cardio()} />
          <IconButton icon="plus" label={t('trainingStartEmpty')} onPress={() => start()} />
        </>} />
      </View>
      <TileGrid page="training" scrollRef={scrollRef} />
    </Animated.ScrollView>
  </View>;
}
