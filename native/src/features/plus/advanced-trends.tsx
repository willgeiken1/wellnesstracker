import { router } from 'expo-router';
import { Card } from '../../components/card';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import type { AtlasSession } from '../atlas/volume';
import { useEntitlement } from './use-entitlement';
/** Only manually logged workouts feed this panel. Never reads HealthKit or recovery values. */
export function AdvancedTrends({ sessions, now }: { sessions: readonly AtlasSession[]; now: number }) {
  const { isFeatureAvailable } = useEntitlement();
  return <Card>
    <ThemedText accessibilityRole="header" variant="headline">Advanced trends</ThemedText>
    {isFeatureAvailable('advancedTrends') ? <>
      <ThemedText>Logged workouts · Four-week view</ThemedText>
      {[0, 1, 2, 3].map(week => {
        const end = now - week * 7 * 86400000;
        const count = sessions.filter(session => session.at <= end && session.at > end - 7 * 86400000).length;
        return <ThemedText key={week}>{week === 0 ? 'Last 7 days' : `${week * 7 + 1}–${(week + 1) * 7} days ago`}: {count} logged workouts</ThemedText>;
      })}
    </> : <Button label="Explore Insight Plus for advanced trends" variant="secondary" onPress={() => router.push('/paywall')} />}
  </Card>;
}
