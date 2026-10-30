import { EntitlementProvider } from '../features/plus/use-entitlement';
import * as rootPurchase from '../features/plus/root-purchase';
import { FoodAiRuntime } from '../features/food/ai/runtime';
import { useEffect, useState } from 'react';
import type { PurchaseProvider } from '../features/plus/types';
import { router, Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
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
    <Stack screenOptions={{ headerTintColor: colors.text, headerStyle: { backgroundColor: colors.surface },
      contentStyle: { backgroundColor: colors.bg }, animation: reduceMotion ? 'none' : 'default', animationDuration: motion.sheet }}>
      <Stack.Protected guard={!access}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={access}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="dev/logger-fixture" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="workout" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="food/log" options={{ title: t('foodLog') }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
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
    <FoodAiRuntime repo={auth.ready ? auth.repository : null} />
    {auth.demoTransferError&&<><ThemedText accessibilityRole="alert">{t('demoTransferFailed')}</ThemedText><Button label={t('tryAgain')} onPress={()=>auth.retryDemoTransfer?.()}/></>}
    {auth.ready && <NavigationShell access={!!auth.session || auth.demo || auth.phoneOnly === true} signedIn={!!auth.session} />}
  </ThemeProvider>;
}
export default function RootLayout() {
  const [purchaseProvider, setPurchaseProvider] = useState<PurchaseProvider | null>(null);
  const [loaded, error] = useFonts({ Lexend_500Medium });
  useEffect(() => {
    let active = true;
    void rootPurchase.createRootPurchaseProvider().then(provider => { if (active) setPurchaseProvider(provider); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if ((loaded || error) && purchaseProvider) void SplashScreen.hideAsync(); }, [loaded, error, purchaseProvider]);
  if ((!loaded && !error) || !purchaseProvider) return null;
  return <EntitlementProvider provider={purchaseProvider}><OnboardingDraftProvider><AuthProvider>{error && <ThemeProvider><ThemedText accessibilityRole="alert">{t('fontError')}</ThemedText></ThemeProvider>}<Application /></AuthProvider></OnboardingDraftProvider></EntitlementProvider>;
}
