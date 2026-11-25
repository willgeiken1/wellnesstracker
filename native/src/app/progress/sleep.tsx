import { Stack } from 'expo-router';
import { SleepScreen } from '@/features/progress/screens/sleep';

/** Last night's sleep, the week's nights and heart readings. */
export default function SleepRoute() {
  return <><Stack.Screen options={{ headerShown: false }} /><SleepScreen /></>;
}
