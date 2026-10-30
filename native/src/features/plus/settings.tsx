import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '../../components/screen';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { entitlementPlanLabel, useEntitlement } from './use-entitlement';
export function PlusSettings() {
  const snapshot = useEntitlement();
  const { entitlement, settled, status, error, restore } = snapshot;
  const [message, setMessage] = useState<string | null>(null);
  return <Screen title="Insight Plus">
    <ThemedText>Simulator preview · No real purchases</ThemedText>
    <ThemedText accessibilityLiveRegion="polite">{entitlementPlanLabel(snapshot)}</ThemedText>
    {settled && entitlement === 'free' && <Button label="Explore Insight Plus" onPress={() => router.push('/paywall')} />}
    <Button label="Restore Purchases" disabled={status === 'loading'} onPress={() => { void restore().then(result => {
      setMessage(result.status === 'success' ? (result.value === 'plus' ? 'Simulated purchases restored.' : 'No simulated purchases to restore.') : 'Could not restore simulated purchases. Try again.');
    }); }} />
    <Button label="Manage subscription" variant="secondary" onPress={() => setMessage('Subscription management will be available when store purchases are connected.')} />
    {message && <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText>}
    {error && <ThemedText accessibilityRole="alert">Could not update simulated purchases. Try again.</ThemedText>}
  </Screen>;
}
