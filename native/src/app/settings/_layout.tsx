import { Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { SettingsIcon } from '@/features/settings/parts';
import { t } from '@/i18n/en';
export const unstable_settings = { initialRouteName: 'index' };
/** Settings is the first screen of its own stack, so the system gives it no back button. This one leaves Settings. */
function LeaveSettings() {
  const { colors } = useTheme();
  return <Pressable testID="settings-back" accessibilityRole="button" accessibilityLabel={t('settingsBack')} hitSlop={8}
    onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
    style={{ minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
    <SettingsIcon name="back" size={20} color={colors.text} />
  </Pressable>;
}
export default function SettingsLayout() {
  const { colors, reduceMotion, motion } = useTheme();
  // One title per screen: each screen shows its own large title, so the bar carries only the back button.
  // `title` still names the screen for the next screen's back button and for VoiceOver.
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false, headerTitle: '',
    contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
    <Stack.Screen name="index" options={{ title: t('settings'), headerLeft: () => <LeaveSettings /> }} />
    <Stack.Screen name="account" options={{ title: t('account') }} />
    <Stack.Screen name="appearance" options={{ title: t('appearance'), headerTitle: t('appearance') }} />
    <Stack.Screen name="[section]" options={{ title: t('settings') }} />
  </Stack>;
}
