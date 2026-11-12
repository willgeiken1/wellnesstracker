import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
export default function WorkoutLayout() {
  const { colors, mode, reduceMotion, motion } = useTheme();
  return <SafeAreaProvider><Stack screenOptions={{ title: t('workout'), headerShown: false, statusBarStyle: mode === 'dark' ? 'light' : 'dark', headerTintColor: colors.text,
    headerStyle: { backgroundColor: colors.surface }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }} /></SafeAreaProvider>;
}
