import { Stack } from 'expo-router';
import { PhotoCaptureSheet } from '@/features/progress/screens/photo-capture';
import { largeSheet } from '@/features/navigation/presentation';

/** The camera sheet for a progress photo, at full height. */
export default function PhotoCaptureRoute() {
  return <>
    <Stack.Screen options={largeSheet} />
    <PhotoCaptureSheet />
  </>;
}
