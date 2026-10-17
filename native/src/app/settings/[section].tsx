import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { settingsSections } from '@/features/settings/sections';
import { t } from '@/i18n/en';
export default function SettingPlaceholder() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = t(settingsSections.find(item => item.route === section)?.label ?? 'settings');
  return <><Stack.Screen options={{ title }} /><Screen><EmptyState title={title}
    action={{ label: t('backSettings'), onPress: () => router.navigate('/settings') }} /></Screen></>;
}
