import { Stack } from 'expo-router';
import { PhotoCaptureSheet } from '@/features/progress/screens/photo-capture';

/** The camera sheet for a progress photo, at full height. */
export default function PhotoCaptureRoute() {
  return <>
    <Stack.Screen options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28 }} />
    <PhotoCaptureSheet />
  </>;
}
