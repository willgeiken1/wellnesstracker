import { Stack } from 'expo-router';
import { MeasurementsSheet } from '@/features/progress/screens/measurements';
import { largeSheet } from '@/features/navigation/presentation';

/** The Measurements sheet, at full height. */
export default function MeasurementsRoute() {
  return <>
    <Stack.Screen options={largeSheet} />
    <MeasurementsSheet />
  </>;
}
