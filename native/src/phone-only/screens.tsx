import { useState } from 'react';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button } from '../components/button';
import { useAuth } from './provider';
import { exportPhoneBackup } from './export';
import { Panel, PROTOTYPE_RADIUS } from '../components/card';
import { SectionLabel, semibold } from '../features/settings/parts';
const card = { borderRadius: PROTOTYPE_RADIUS, padding: 16, gap: 12 } as const;
export function Welcome() {
  const auth = useAuth();
  return <Screen title="Phone-only build"><ThemedText>Saved on this phone. No account or sync.</ThemedText>
    <Button label="Look around first" onPress={auth.lookAround} /></Screen>;
}
export function AuthForm() { return <Welcome />; }
export function Account() {
  const auth = useAuth();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return <Screen title="Account">
    <Panel style={card}>
      <ThemedText variant="headline" style={semibold}>{auth.demo ? 'Example data' : 'Saved on this phone'}</ThemedText>
      <ThemedText muted>{auth.demo ? 'You are looking at example data. Your own log is kept separately and is not changed.' : 'Your log is kept on this phone only. There is no account and nothing syncs.'}</ThemedText>
    </Panel>
    {auth.demo ? <Button label="Return to my log" onPress={() => { void auth.signOut(); }} /> : <>
      <SectionLabel>Back up your data</SectionLabel>
      <Panel style={card}>
        <ThemedText muted>A backup file is the only copy of your log outside this phone.</ThemedText>
        <Button label="Export backup" busy={busy} disabled={busy || !auth.repository} onPress={() => {
        if (busy || !auth.repository) return;
        setBusy(true); setStatus('');
        void exportPhoneBackup(auth.repository).then(() => setStatus('Share sheet closed. Check that the backup is saved in Files.'))
          .catch(() => setStatus('Backup could not be exported. Please try again.'))
          .finally(() => setBusy(false));
      }} />
        {!!status && <ThemedText muted variant="caption" accessibilityLiveRegion="polite">{status}</ThemedText>}
      </Panel>
      <Button label="Look around first" variant="secondary" onPress={auth.lookAround} />
    </>}
    <ThemedText muted variant="caption">Apple Health, widgets and notifications are not part of this version yet.</ThemedText>
  </Screen>;
}
export function LocalDataRecovery() {
  const auth = useAuth();
  if (!auth.configError) return null;
  return <Screen title="Local data is unavailable"><Button label="Try again" onPress={() => auth.retryBoot?.()} /></Screen>;
}
