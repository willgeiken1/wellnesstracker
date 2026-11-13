import { useContext, useState } from 'react';
import { FoodPrivacyScreen } from '@/features/food/ai/privacy';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { LoadingPanel } from '@/components/loading-panel';
import { ThemedText } from '@/components/themed-text';
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
import { LicenseNotice, Licenses, noticeTitle } from '@/features/settings/licenses/screen';
import { LEGAL_LINKS, openPage } from '@/features/settings/links';
function HealthAndDevices() {
  // Settings also opens with no account provider around it; Apple Health is simply not offered there.
  const repository = useContext(AuthContext)?.repository;
  return <ConnectedServices apple={useAppleHealth(repository)} />;
}
/** Insight Score: one switch for the card on Home and the header ring, and the way to how it is worked out. */
function ScoreSettings() {
  const repository = useContext(AuthContext)?.repository;
  const [on, setOn] = useState(() => scoreOn(repository));
  // The account data is still opening: wait quietly rather than say the feature is missing.
  if (!repository) return <LoadingPanel testID="settings-score-loading" />;
  return <Group testID="settings-score">
    <ToggleRow testID="settings-score-switch" label={t('scoreSettingShow')} hint={t('scoreSettingHint')} value={on} onValueChange={next => {
      // The switch only moves once the layout is saved, so it never shows something Home will not.
      try { setScoreOn(repository, next); setOn(next); } catch { /* left as it was */ }
    }} />
    <NavRow label={t('scoreHow')} onPress={() => router.push('/score')} />
  </Group>;
}
/** About: what the app is, the version, the public pages and the licences. */
function About() {
  const version = Constants.expoConfig?.version;
  const [failed, setFailed] = useState(false);
  const open = (url: string) => { setFailed(false); void openPage(url).then(opened => { if (!opened) setFailed(true); }); };
  return <>
    <Group testID="settings-about">
      <InfoRow label="Insight" hint={t('settingsAboutBody')} />
      {!!version && <InfoRow label={t('settingsVersion')} value={version} />}
    </Group>
    <Group testID="settings-about-links">
      <NavRow label={t('privacyPolicy')} onPress={() => open(LEGAL_LINKS.privacy)} />
      <NavRow label={t('termsOfUse')} onPress={() => open(LEGAL_LINKS.terms)} />
      <NavRow label={t('supportPage')} onPress={() => open(LEGAL_LINKS.support)} />
    </Group>
    {failed && <ThemedText testID="settings-about-link-failed" muted accessibilityRole="alert" accessibilityLiveRegion="polite">{t('linkFailed')}</ThemedText>}
    <Group>
      <NavRow label={t('licenses')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'licenses' } })} />
    </Group>
    <ThemedText testID="settings-about-disclaimer" muted variant="caption">{t('aboutDisclaimer')}</ThemedText>
  </>;
}
/** One Settings page. The bar shows only Back; every page carries its own single title. */
export default function SettingsSection() {
  const { section, notice } = useLocalSearchParams<{ section: string; notice?: string }>();
  // Licenses and Notifications have no row on the Settings home (Notifications waits for reminders), so they are named here.
  const title = section === 'licenses' ? notice ? noticeTitle(notice) : t('licenses')
    : section === 'notifications' ? t('notifications') : t(settingsSections.find(item => item.route === section)?.label ?? 'settings');
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
  if (section === 'data') return <>{named}<ImportScreen inSettings /></>;
  if (section === 'privacy') return <>{named}<FoodPrivacyScreen /></>;
  if (section === 'profile') return <>{named}<Profile /></>;
  if (section === 'workout') return <>{named}<WorkoutSettings /></>;
  if (section === 'about') return <>{named}<Screen title={title}><About /></Screen></>;
  if (section === 'licenses') return <>{named}<Screen title={title}>{notice ? <LicenseNotice notice={notice} /> : <Licenses />}</Screen></>;
  return <>{named}<Screen title={title}><QuietCard title={t('notInVersion')} /></Screen></>;
}
