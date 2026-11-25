import { Stack } from 'expo-router';
import { MeasurementsSheet } from '@/features/progress/screens/measurements';

/** The Measurements sheet, at full height. */
export default function MeasurementsRoute() {
  return <>
    <Stack.Screen options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28 }} />
    <MeasurementsSheet />
  </>;
}
