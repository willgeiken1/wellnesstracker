import { Stack } from 'expo-router';
import { SplitLibrarySheet } from '@/features/splits/sheets';
import { trainingSheetOptions } from '@/features/workout/nav';

/** Change split (or Choose a split): the library of presets and Build your own, as a large form sheet. */
export default function SplitLibraryRoute() {
  return <>
    <Stack.Screen options={trainingSheetOptions.large} />
    <SplitLibrarySheet />
  </>;
}
