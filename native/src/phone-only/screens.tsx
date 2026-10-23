import { useState } from 'react';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button } from '../components/button';
import { useAuth } from './provider';
import { exportPhoneBackup } from './export';
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
  return <Screen title="Phone-only build">
    <ThemedText>{auth.demo ? 'Demo mode. Your phone-only log is kept separately.' : 'Saved on this phone. No account or sync. Export a JSON backup daily and at the end of the week.'}</ThemedText>
    <ThemedText>Health, widgets and push are not in this build.</ThemedText>
    {auth.demo ? <Button label="Return to phone-only log" onPress={() => { void auth.signOut(); }} /> : <>
      <Button label="Export JSON backup" busy={busy} disabled={busy || !auth.repository} onPress={() => {
        if (busy || !auth.repository) return;
        setBusy(true); setStatus('');
        void exportPhoneBackup(auth.repository).then(() => setStatus('Share sheet closed. Check that the backup is saved in Files.'))
          .catch(() => setStatus('Backup could not be exported. Please try again.'))
          .finally(() => setBusy(false));
      }} />
      <Button label="Look around first" variant="secondary" onPress={auth.lookAround} />
    </>}
    {!!status && <ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>}
  </Screen>;
}
export function LocalDataRecovery() {
  const auth = useAuth();
  if (!auth.configError) return null;
  return <Screen title="Local data is unavailable"><Button label="Try again" onPress={() => auth.retryBoot?.()} /></Screen>;
}
