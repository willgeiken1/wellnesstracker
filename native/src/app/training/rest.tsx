import { Stack, useLocalSearchParams } from 'expo-router';
import { RestTimerSheet } from '@/features/workout/sheets/rest';
import { trainingSheetOptions } from '@/features/workout/nav';

/** The full rest timer as a medium form sheet. */
export default function RestTimerRoute() {
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  return <>
    <Stack.Screen options={trainingSheetOptions.medium} />
    <RestTimerSheet entry={entry} />
  </>;
}
