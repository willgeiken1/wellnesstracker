import { Stack } from 'expo-router';
import { ExportSheet } from '@/features/progress/screens/export';

/** The Export data sheet, at full height. */
export default function ExportRoute() {
  return <>
    <Stack.Screen options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28 }} />
    <ExportSheet />
  </>;
}
