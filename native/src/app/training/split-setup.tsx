import { Stack, useLocalSearchParams } from 'expo-router';
import { SplitSetupSheet } from '@/features/splits/sheets';
import { trainingSheetOptions } from '@/features/workout/nav';

/** One preset split, set up before it is used, as a large form sheet. */
export default function SplitSetupRoute() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  return <>
    <Stack.Screen options={trainingSheetOptions.large} />
    <SplitSetupSheet presetKey={key} />
  </>;
}
