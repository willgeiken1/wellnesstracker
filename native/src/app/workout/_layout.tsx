import { Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
export default function WorkoutLayout() {
  const { colors, reduceMotion, motion } = useTheme();
  return <Stack screenOptions={{ title: t('workout'), headerShown: false, headerTintColor: colors.text,
    headerStyle: { backgroundColor: colors.surface }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }} />;
}
