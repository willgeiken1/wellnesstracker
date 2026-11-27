import { Stack } from 'expo-router';
import { BodyScreen } from '@/features/progress/screens/body';

/** Weight, the weight goal, body fat, tape measurements and photos. */
export default function BodyRoute() {
  return <><Stack.Screen options={{ headerShown: false }} /><BodyScreen /></>;
}
