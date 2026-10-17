import { useEffect } from 'react';
import { Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '@/design/theme-provider';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';

void SplashScreen.preventAutoHideAsync();
export function NavigationShell() {
  const { colors, mode, reduceMotion, motion } = useTheme();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return <NavigationThemeProvider value={{ ...base, colors: { ...base.colors, primary: colors.accent,
    background: colors.bg, card: colors.surface, text: colors.text, border: colors['surface-2'], notification: colors.accent } }}>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerTintColor: colors.text, headerStyle: { backgroundColor: colors.surface },
      contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="workout" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="food/log" options={{ title: t('foodLog') }} />
    </Stack>
  </NavigationThemeProvider>;
}
export default function RootLayout() {
  const [loaded, error] = useFonts({ Lexend_500Medium });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <ThemeProvider>{error && <ThemedText accessibilityRole="alert">{t('fontError')}</ThemedText>}<NavigationShell /></ThemeProvider>;
}
