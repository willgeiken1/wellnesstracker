import { Stack } from 'expo-router';
import { ExportSheet } from '@/features/progress/screens/export';
import { largeSheet } from '@/features/navigation/presentation';

/** The Export data sheet, at full height. */
export default function ExportRoute() {
  return <>
    <Stack.Screen options={largeSheet} />
    <ExportSheet />
  </>;
}
