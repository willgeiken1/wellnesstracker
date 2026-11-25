import { FoodAiRuntime } from '../features/food/ai/runtime';
import { AI_FEATURES_ENABLED } from '../features/ai-launch';
import { TelemetryRuntime } from '../telemetry/runtime';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router, Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Lexend_300Light } from '@expo-google-fonts/lexend/300Light';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureTileToast } from '@/features/tiles/store';
import { tileSheetOptions } from '@/features/tiles/nav';
import { trainingSheetOptions } from '@/features/workout/nav';
// Every page's tiles register at startup, so each page and Home's tray can draw any of them on first open.
import '@/features/food/tiles';
import '@/features/progress/tiles';
import '@/features/workout/tiles';
import { registerHomeTiles } from '@/features/home/tiles/register';
import { showToast } from '@/features/shell/toast';
import { ThemeProvider, useTheme } from '@/design/theme-provider';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AuthProvider, useAuth } from '../auth/provider';
import { LocalDataRecovery } from '../auth/screens';
import { setAndroidCopy, t } from '@/i18n/en';
import { OnboardingDraftProvider } from '../features/onboarding/screen';

import { LegacyImportPrompt, SharedImportEntry } from '../features/importer/screen';
void SplashScreen.preventAutoHideAsync();
// Android has no Apple Health in v1, so its copy names only Oura.
setAndroidCopy(Platform.OS === 'android');
// The tile grid's removes and resets use the shell's toast, with Undo.
configureTileToast((message, action) => showToast(message, { color: 'accent', action }));
registerHomeTiles();
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
      {/* Training's detail screens draw their own nav bar and push as cards; its sheets open over the tab or a workout. */}
      <Stack.Screen name="training/detail" options={{ headerShown: false }} />
      <Stack.Screen name="training/exercise" options={{ headerShown: false }} />
      <Stack.Screen name="training/plan" options={{ headerShown: false }} />
      <Stack.Screen name="training/picker" options={trainingSheetOptions.large} />
      <Stack.Screen name="training/rest" options={trainingSheetOptions.medium} />
      <Stack.Screen name="training/cardio" options={trainingSheetOptions.large} />
      <Stack.Screen name="food/log" options={{ title: t('foodLog') }} />
      <Stack.Screen name="score" options={{ title: t('scoreTitle'), headerTitle: '', headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg } }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="tab-bar" options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 24 }} />
      <Stack.Screen name="tiles/tray" options={tileSheetOptions.tray} />
      <Stack.Screen name="tiles/edit" options={tileSheetOptions.edit} />
      <Stack.Screen name="tiles/section" options={tileSheetOptions.section} />
      </Stack.Protected>
      <Stack.Screen name="import" options={{ title: t('importTitle') }} />
      <Stack.Protected guard={!signedIn}><Stack.Screen name="sign-in" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  </NavigationThemeProvider>;
}
function Application() {
  const auth = useAuth();
  useEffect(()=>{
    // Resume an interrupted first setup (including email confirmation on restart).
    if(auth.ready&&auth.session&&auth.repository&&auth.initialPullComplete&&auth.repository.list('profile').length===0)router.replace('/onboarding');
  },[auth.ready,auth.session,auth.repository,auth.initialPullComplete,auth.syncPullRevision]);
  return <ThemeProvider key={auth.session?.user.id ?? (auth.demo ? 'demo' : 'guest')} repository={auth.repository}>
    {auth.recovery!=='boot-error' && auth.configError && <ThemedText accessibilityRole="alert">{auth.configError}</ThemedText>}
    <LocalDataRecovery />
    <LegacyImportPrompt />
    <SharedImportEntry />
    {AI_FEATURES_ENABLED && <FoodAiRuntime repo={auth.ready ? auth.repository : null} />}
    <TelemetryRuntime userId={auth.session?.user.id} />
    {auth.demoTransferError&&<><ThemedText accessibilityRole="alert">{t('demoTransferFailed')}</ThemedText><Button label={t('tryAgain')} onPress={()=>auth.retryDemoTransfer?.()}/></>}
    {auth.ready && <NavigationShell access={!!auth.session || auth.demo || auth.phoneOnly === true} signedIn={!!auth.session} />}
  </ThemeProvider>;
}
export default function RootLayout() {
  const [loaded, error] = useFonts({ Lexend_300Light, Lexend_500Medium, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}><OnboardingDraftProvider><AuthProvider>{error && <ThemeProvider><ThemedText accessibilityRole="alert">{t('fontError')}</ThemedText></ThemeProvider>}<Application /></AuthProvider></OnboardingDraftProvider></GestureHandlerRootView>;
}
