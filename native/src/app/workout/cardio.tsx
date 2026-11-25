import { Stack } from 'expo-router';
import { CardioLogSheet } from '@/features/workout/sheets/cardio';
import { trainingSheetOptions } from '@/features/workout/nav';

/** Log cardio as a large form sheet. */
export default function CardioLogRoute() {
  return <>
    <Stack.Screen options={trainingSheetOptions.large} />
    <CardioLogSheet />
  </>;
}
