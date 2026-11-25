import { Stack } from 'expo-router';
import { PhotosScreen } from '@/features/progress/screens/photos';

/** Progress photos: compare two, see them all, and the weekly reminder. They stay on this phone. */
export default function PhotosRoute() {
  return <><Stack.Screen options={{ headerShown: false }} /><PhotosScreen /></>;
}
