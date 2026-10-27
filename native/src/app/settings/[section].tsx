import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/empty-state';
import { settingsSections } from '@/features/settings/sections';
import { Profile } from '@/features/onboarding/profile';
import { WorkoutSettings } from '@/features/workout/settings';
import { t } from '@/i18n/en';
import Constants from 'expo-constants';
export default function SettingPlaceholder() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = section === 'licenses' ? t('licenses') : t(settingsSections.find(item => item.route === section)?.label ?? 'settings');
  if (Constants.expoConfig?.extra?.phoneOnly === true && ['health', 'notifications'].includes(section)) return <Screen title={title}><ThemedText>Not in this build.</ThemedText></Screen>;
  if (section === 'profile') return <Profile/>;
  if (section === 'workout') return <WorkoutSettings/>;
  return <><Stack.Screen options={{ title }} /><Screen><EmptyState title={title}
    action={{ label: t('backSettings'), onPress: () => router.navigate('/settings') }} />
    {section === 'about' && <Card><ListRow label={t('licenses')}
      onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'licenses' } })} /></Card>}
    {/* TODO: About > Licenses must list full Lexend (OFL 1.1) and RepDB notices before release. */}
    {section === 'licenses' && <ThemedText>{t('licensesHint')}</ThemedText>}
  </Screen></>;
}
