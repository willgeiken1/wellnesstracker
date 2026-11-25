import { Stack } from 'expo-router';
import { WeeklyScreen } from '@/features/progress/screens/weekly';

/** The weekly report. */
export default function WeeklyRoute() {
  return <><Stack.Screen options={{ headerShown: false }} /><WeeklyScreen /></>;
}
