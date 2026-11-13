import { useContext, useEffect } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AuthContext } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { ConnectedServices } from '@/features/connections/screen';
import { useAppleHealth } from '@/features/health/use-apple-health';
import { OURA_PREVIEW_STATES, previewOura } from '@/features/health/oura-preview';
import { t } from '@/i18n/en';

/** insight://dev/oura-preview?state=off|on|expired|busy|failed
 * Development only: Health & devices with the Oura card in one state, for screenshots on a build with no
 * signed-in account. The Apple Health card is the real one. */
export default function OuraPreviewRoute() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const shown = OURA_PREVIEW_STATES.find(item => item === state);
  const repository = useContext(AuthContext)?.repository;
  const apple = useAppleHealth(repository);
  useEffect(() => { if (!__DEV__ || !shown) router.replace('/'); }, [shown]);
  if (!__DEV__ || !shown) return null;
  const title = t('health');
  return <><Stack.Screen options={{ title, headerTitle: title }} /><Screen><ConnectedServices apple={apple} oura={previewOura(shown)} /></Screen></>;
}
