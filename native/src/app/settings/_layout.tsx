import { Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
export const unstable_settings = { initialRouteName: 'index' };
export default function SettingsLayout() {
  const { colors, reduceMotion, motion } = useTheme();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text,
    contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
    <Stack.Screen name="index" options={{ title: t('settings'), headerLargeTitleEnabled: true }} />
    <Stack.Screen name="account" options={{ title: t('account') }} />
    <Stack.Screen name="appearance" options={{ title: t('appearance') }} />
    <Stack.Screen name="[section]" options={{ title: t('settings') }} />
  </Stack>;
}
