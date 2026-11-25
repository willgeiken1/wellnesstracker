import { Stack } from 'expo-router';
import { LogWeightSheet } from '@/features/progress/screens/log-weight';

/** The Log weight sheet, at medium height. */
export default function LogWeightRoute() {
  return <>
    <Stack.Screen options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.66, 1], sheetGrabberVisible: true, sheetCornerRadius: 28 }} />
    <LogWeightSheet />
  </>;
}
