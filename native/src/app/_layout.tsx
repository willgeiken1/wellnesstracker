import { FoodAiRuntime } from '../features/food/ai/runtime';
import { useEffect } from 'react';
import { router, Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Lexend_300Light } from '@expo-google-fonts/lexend/300Light';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '@/design/theme-provider';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AuthProvider, useAuth } from '../auth/provider';
import { LocalDataRecovery } from '../auth/screens';
import { t } from '@/i18n/en';
import { OnboardingDraftProvider } from '../features/onboarding/screen';

import { LegacyImportPrompt, SharedImportEntry } from '../features/importer/screen';
void SplashScreen.preventAutoHideAsync();
export function NavigationShell({ access = false, signedIn = false }: {access?: boolean;signedIn?:boolean}) {
  const { colors, mode, reduceMotion, motion } = useTheme();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return <NavigationThemeProvider value={{ ...base, colors: { ...base.colors, primary: colors.accent,
    background: colors.bg, card: colors.surface, text: colors.text, border: colors['surface-2'], notification: colors.accent } }}>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    {/* Full-screen modals (the workout logger) take the status bar from their own screen, not from the component
        above, so the style is also set per screen. Without it a dark theme showed dark clock text on a dark page. */}
    <Stack screenOptions={{ statusBarStyle: mode === 'dark' ? 'light' : 'dark', headerTintColor: colors.text, headerStyle: { backgroundColor: colors.surface },
      contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
      <Stack.Protected guard={!access}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={access}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="dev/sample-data" options={{ headerShown: false }} />
      <Stack.Screen name="dev/logger-fixture" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="workout" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="food/log" options={{ title: t('foodLog') }} />
      <Stack.Screen name="score" options={{ title: t('scoreTitle'), headerTitle: '', headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg } }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Screen name="import" options={{ title: t('importTitle') }} />
      <Stack.Protected guard={!signedIn}><Stack.Screen name="sign-in" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  </NavigationThemeProvider>;
}
/** Longest the splash waits for local data and the session before it gives way anyway. */
export const SPLASH_LIMIT_MS = 6000;
function Application() {
  const auth = useAuth();
  // Keep the splash up until there is something to draw: hiding it when only the fonts were ready showed an empty
  // window while the database opened and the session was checked. A recovery or setup error is something to draw.
  const drawable = auth.ready || !!auth.recovery || !!auth.configError || !!auth.demoTransferError;
  useEffect(() => { if (drawable) void SplashScreen.hideAsync(); }, [drawable]);
  useEffect(() => { const limit = setTimeout(() => void SplashScreen.hideAsync(), SPLASH_LIMIT_MS); return () => clearTimeout(limit); }, []);
  useEffect(()=>{
    // Resume an interrupted first setup (including email confirmation on restart).
    if(auth.ready&&auth.session&&auth.repository&&auth.initialPullComplete&&auth.repository.list('profile').length===0)router.replace('/onboarding');
  },[auth.ready,auth.session,auth.repository,auth.initialPullComplete,auth.syncPullRevision]);
  return <ThemeProvider key={auth.session?.user.id ?? (auth.demo ? 'demo' : 'guest')} repository={auth.repository}>
    {auth.recovery!=='boot-error' && auth.configError && <ThemedText accessibilityRole="alert">{auth.configError}</ThemedText>}
    <LocalDataRecovery />
    <LegacyImportPrompt />
    <SharedImportEntry />
    <FoodAiRuntime repo={auth.ready ? auth.repository : null} />
    {auth.demoTransferError&&<><ThemedText accessibilityRole="alert">{t('demoTransferFailed')}</ThemedText><Button label={t('tryAgain')} onPress={()=>auth.retryDemoTransfer?.()}/></>}
    {auth.ready && <NavigationShell access={!!auth.session || auth.demo || auth.phoneOnly === true} signedIn={!!auth.session} />}
  </ThemeProvider>;
}
export default function RootLayout() {
  const [loaded, error] = useFonts({ Lexend_300Light, Lexend_500Medium });
  // A font error is shown as text, which needs the splash gone.
  useEffect(() => { if (error) void SplashScreen.hideAsync(); }, [error]);
  if (!loaded && !error) return null;
  return <OnboardingDraftProvider><AuthProvider>{error && <ThemeProvider><ThemedText accessibilityRole="alert">{t('fontError')}</ThemedText></ThemeProvider>}<Application /></AuthProvider></OnboardingDraftProvider>;
}
