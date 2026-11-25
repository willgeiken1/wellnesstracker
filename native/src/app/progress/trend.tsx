import { Stack, useLocalSearchParams } from 'expo-router';
import { TrendScreen } from '@/features/progress/screens/trend';

/** One metric over time; `metric` and `range` come from the tile or chip that opened it. */
export default function TrendRoute() {
  const { metric, range } = useLocalSearchParams<{ metric?: string; range?: string }>();
  return <><Stack.Screen options={{ headerShown: false }} /><TrendScreen key={metric} metric={metric} range={range} /></>;
}
