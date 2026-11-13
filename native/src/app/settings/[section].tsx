import { useContext, useState } from 'react';
import { FoodPrivacyScreen } from '@/features/food/ai/privacy';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import { Group, InfoRow, NavRow, QuietCard, ToggleRow } from '@/features/settings/parts';
import { scoreOn, setScoreOn } from '@/features/home/tiles';
import { settingsSections } from '@/features/settings/sections';
import { Profile } from '@/features/onboarding/profile';
import { WorkoutSettings } from '@/features/workout/settings';
import { t } from '@/i18n/en';
import { ImportScreen } from '@/features/importer/screen';
import { AuthContext } from '@/auth/provider';
import { ConnectedServices } from '@/features/connections/screen';
import { useAppleHealth } from '@/features/health/use-apple-health';
import Constants from 'expo-constants';
function HealthAndDevices() {
  // Settings also opens with no account provider around it; Apple Health is simply not offered there.
  const repository = useContext(AuthContext)?.repository;
  return <ConnectedServices apple={useAppleHealth(repository)} />;
}
/** Insight Score: one switch for the card on Home and the header ring, and the way to how it is worked out. */
function ScoreSettings() {
  const repository = useContext(AuthContext)?.repository;
  const [on, setOn] = useState(() => scoreOn(repository));
  if (!repository) return <QuietCard title={t('notInVersion')} />;
  return <Group testID="settings-score">
    <ToggleRow testID="settings-score-switch" label={t('scoreSettingShow')} hint={t('scoreSettingHint')} value={on} onValueChange={next => {
      // The switch only moves once the layout is saved, so it never shows something Home will not.
      try { setScoreOn(repository, next); setOn(next); } catch { /* left as it was */ }
    }} />
    <NavRow label={t('scoreHow')} onPress={() => router.push('/score')} />
  </Group>;
}
/** One Settings page. The bar shows only Back; every page carries its own single title. */
export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = section === 'licenses' ? t('licenses') : t(settingsSections.find(item => item.route === section)?.label ?? 'settings');
  // Names the page for VoiceOver and for the back button of whatever opens from it.
  const named = <Stack.Screen options={{ title }} />;
  const phoneOnly = Constants.expoConfig?.extra?.phoneOnly === true;
  if (section === 'health' && phoneOnly) return <>{named}<Screen title={title}>
    <QuietCard testID="settings-health-empty" title={t('settingsHealthEmpty')} body={t('notInVersion')} /></Screen></>;
  if (section === 'notifications') return <>{named}<Screen title={title}>
    <QuietCard testID="settings-notifications-empty" title={t('settingsNotificationsEmpty')} body={t('notInVersion')} /></Screen></>;
  // Health & devices opens with its own headline, so the bar names the page here.
  if (section === 'health') return <><Stack.Screen options={{ title, headerTitle: title }} /><Screen><HealthAndDevices /></Screen></>;
  if (section === 'score') return <>{named}<Screen title={title}><ScoreSettings /></Screen></>;
  if (section === 'data') return <>{named}<ImportScreen /></>;
  if (section === 'privacy') return <>{named}<FoodPrivacyScreen /></>;
  if (section === 'profile') return <>{named}<Profile /></>;
  if (section === 'workout') return <>{named}<WorkoutSettings /></>;
  if (section === 'about') {
    const version = Constants.expoConfig?.version;
    return <>{named}<Screen title={title}>
      <Group testID="settings-about">
        <InfoRow label="Insight" hint={t('settingsAboutBody')} />
        {!!version && <InfoRow label={t('settingsVersion')} value={version} />}
      </Group>
      <Group>
        <NavRow label={t('licenses')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'licenses' } })} />
      </Group>
    </Screen></>;
  }
  // TODO: About > Licenses must list full Lexend (OFL 1.1) and RepDB notices before release.
  if (section === 'licenses') return <>{named}<Screen title={title}>
    <Card style={{ borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[2] }}>
      <ThemedText>{t('licensesHint')}</ThemedText>
      <ThemedText muted>{t('atlasPaletteCredit')}</ThemedText>
    </Card>
  </Screen></>;
  return <>{named}<Screen title={title}><QuietCard title={t('notInVersion')} /></Screen></>;
}
