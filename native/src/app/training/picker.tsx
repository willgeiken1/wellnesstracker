import { Stack, useLocalSearchParams } from 'expo-router';
import { ExercisePickerSheet, type PickerMode } from '@/features/workout/sheets/picker';
import { trainingSheetOptions } from '@/features/workout/nav';

/** The exercise picker as a large form sheet. */
export default function ExercisePickerRoute() {
  const { mode, entry, routine } = useLocalSearchParams<{ mode?: PickerMode; entry?: string; routine?: string }>();
  return <>
    <Stack.Screen options={trainingSheetOptions.large} />
    <ExercisePickerSheet mode={mode} entry={entry} routine={routine} />
  </>;
}
