import { Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { SETTINGS_ROUTES } from '@/features/navigation/presentation';
export const unstable_settings = { initialRouteName: 'index' };
/** Settings is its own stack. Every screen draws its own bar (back button and title), as the mockup's settings screens do;
 * `title` still names each screen for VoiceOver. */
export default function SettingsLayout() {
  const { colors, reduceMotion, motion } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
    <Stack.Screen name="index" options={{ title: t('settings') }} />
    <Stack.Screen name="appearance" options={{ title: t('appearance') }} />
    <Stack.Screen name="[section]" options={{ title: t('settings') }} />
    <Stack.Screen name="dev-oura-preview" options={{ title: t('health') }} />
    {/* Delete a date range, What's new and Send feedback rise as large sheets over the page that opened them. */}
    {Object.entries(SETTINGS_ROUTES).map(([name, r]) => <Stack.Screen key={name} name={name} options={r.options} />)}
  </Stack>;
}
