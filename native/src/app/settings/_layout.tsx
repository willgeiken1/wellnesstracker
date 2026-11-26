import { Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
export const unstable_settings = { initialRouteName: 'index' };
/** Settings is its own stack. Every screen draws its own bar (back button and title), as the mockup's settings screens do;
 * `title` still names each screen for VoiceOver. */
export default function SettingsLayout() {
  const { colors, reduceMotion, motion } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
    <Stack.Screen name="index" options={{ title: t('settings') }} />
    <Stack.Screen name="account" options={{ title: t('account') }} />
    <Stack.Screen name="appearance" options={{ title: t('appearance') }} />
    <Stack.Screen name="[section]" options={{ title: t('settings') }} />
    <Stack.Screen name="dev-oura-preview" options={{ title: t('health') }} />
  </Stack>;
}
