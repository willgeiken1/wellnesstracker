import { Platform, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { Icon } from './icon';
import { touchTarget } from './button';

export function TabRootLayout({ title }: { title: string }) {
  const { colors } = useTheme();
  const openSettings = () => router.push('/settings');
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerTintColor: Platform.OS === 'ios' ? colors.accent : colors.text,
    headerStyle: Platform.OS === 'ios' ? undefined : { backgroundColor: colors.surface } }}>
    <Stack.Screen name="index" options={{ title, headerLargeTitleEnabled: true,
      // UIKit provides the standard bar button on iOS; Android/web use the same accessible action.
      unstable_headerRightItems: () => [{ type: 'button', label: t('openSettings'),
        accessibilityLabel: t('openSettings'), icon: { type: 'sfSymbol', name: 'person.crop.circle' },
        width: touchTarget, onPress: openSettings }],
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel={t('openSettings')}
        onPress={openSettings} style={{ minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="avatar" color={colors.accent} />
      </Pressable>,
    }} />
  </Stack>;
}
