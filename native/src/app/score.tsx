import { Stack } from 'expo-router';
import { DayScoreScreen } from '@/features/progress/screens/score';

/** The day score: how today adds up. */
export default function ScoreRoute() {
  return <><Stack.Screen options={{ headerShown: false }} /><DayScoreScreen /></>;
}
