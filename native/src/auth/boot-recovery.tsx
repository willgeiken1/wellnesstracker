import { useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button } from '../components/button';
import { useAuth } from './provider';
import { supportURL } from './boot-diagnostics';
import { t } from '../i18n/en';
import { exportBootDatabase } from '../data/boot-export';

export function BootRecovery() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false), [details, setDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = async (action: () => Promise<unknown>, failure: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try { await action(); } catch { setNotice(failure); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Screen title={t('bootRecoveryTitle')} topInset>
    <ThemedText>{t('bootRecoveryBody')}</ThemedText>
    <Button label={t('bootRetry')} disabled={busy} onPress={() => {
      if (auth.bootRetryNeedsConfirmation) Alert.alert(t('retrySignOut'), t('bootRetryWipeWarning'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('bootRetry'), style: 'destructive', onPress: () => auth.retryBoot?.(true) },
      ]);
      else auth.retryBoot?.();
    }} />
    <Button label={t('bootExport')} variant="secondary" disabled={busy} busy={busy} onPress={() => {
      void run(() => exportBootDatabase(() => auth.bootExportOwner?.() ?? null), t('bootExportFailed'));
    }} />
    <ThemedText muted>{t('bootExportHint')}</ThemedText>
    <Button label={t('bootSupport')} variant="secondary" disabled={busy} onPress={() => {
      void run(() => Linking.openURL(supportURL(Constants.expoConfig?.version ?? 'unknown', Platform.OS, auth.bootErrorClass ?? 'Error')), t('bootSupportFailed'));
    }} />
    <Button label={t(details ? 'bootHideDetails' : 'bootDetails')} variant="secondary" onPress={() => setDetails(!details)} />
    {details && <ThemedText>{auth.bootErrorClass ?? 'Error'}</ThemedText>}
    {notice && <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite">{notice}</ThemedText>}
  </Screen>;
}
