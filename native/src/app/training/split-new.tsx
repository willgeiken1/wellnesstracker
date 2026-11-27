import { Stack } from 'expo-router';
import { SplitNewSheet } from '@/features/splits/sheets';
import { trainingSheetOptions } from '@/features/workout/nav';

/** Build your own split from blank, as a large form sheet. */
export default function SplitNewRoute() {
  return <>
    <Stack.Screen options={trainingSheetOptions.large} />
    <SplitNewSheet />
  </>;
}
