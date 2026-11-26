import { useEffect, useState } from 'react';
import { Image, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { router, type Href } from 'expo-router';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, KitText, PressScale, useKit } from '@/components/kit';
import { useAuth, type GoogleSignInResult } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { BAND_OPACITY, BAND_WIDTH, welcomeArt, type WelcomeArt } from './welcome-art';
import { iconArt, iconId } from '@/features/settings/app-icon';
import { LEGAL_LINKS, openPage } from '@/features/settings/links';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { t } from '@/i18n/en';
import { Notice } from './parts';
import { AppleSignIn } from './apple-sign-in';

/* ob-welcome (pages/onboarding.js): the contour map across the top with the app icon on it, the name and one line, the four
 * strands, then the ways in (Apple, email, Google, Skip for now) and the legal line. */
const STRANDS = [['training', 'c'], ['food', 't'], ['recovery', 'd'], ['sleep', 's']] as const;
const PILL_KEYS = ['welcomePillTraining', 'welcomePillFood', 'welcomePillSleep', 'welcomePillRoutines'] as const;
/** The map's height on the design's 852 pt phone. */
export const WELCOME_ART_HEIGHT = 344;

function Shape({ kind, color }: { kind: 'c' | 't' | 'd' | 's'; color: string }) {
  return <Svg width={10} height={10} viewBox="0 0 10 10">
    {kind === 'c' ? <Circle cx={5} cy={5} r={4.5} fill={color} /> : kind === 't' ? <Path d="M5 .8 9.4 9H.6z" fill={color} />
      : kind === 'd' ? <Path d="M5 .5 9.5 5 5 9.5.5 5z" fill={color} /> : <Rect x={1} y={1} width={8} height={8} rx={2} fill={color} />}
  </Svg>;
}

/** Google's four-colour G (the design's `ob-google`); its colours are Google's own, whatever the palette. */
export function GoogleMark({ size = 19 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.97-4.32 2.97-7.33z" />
    <Path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22z" />
    <Path fill="#FBBC04" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96z" />
    <Path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98z" />
  </Svg>;
}

let ART: WelcomeArt | null = null;
function Art({ width, height }: { width: number; height: number }) {
  const k = useKit(), { reduceMotion } = useTheme();
  // The map drifts very slowly, there and back over 24 seconds each way (`stDrift`); still with Reduce Motion.
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) { cancelAnimation(drift); drift.value = 0; return; }
    drift.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduceMotion, drift]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: -6 * drift.value }, { translateY: 4 * drift.value }, { scale: 1 + 0.02 * drift.value }] }));
  const H = WELCOME_ART_HEIGHT, art = ART ??= welcomeArt(393, H);
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width, height }, moving]}>
  <Svg width={width} height={height} viewBox={`0 0 393 ${H}`} preserveAspectRatio="xMidYMid slice" accessible={false}>
    <Defs>
      <LinearGradient id="wel-fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0.06" stopColor="#fff" stopOpacity={0} /><Stop offset="0.26" stopColor="#fff" stopOpacity={1} />
        <Stop offset="0.62" stopColor="#fff" stopOpacity={1} /><Stop offset="0.98" stopColor="#fff" stopOpacity={0} />
      </LinearGradient>
      <Mask id="wel-mask"><Rect width={393} height={H} fill="url(#wel-fade)" /></Mask>
    </Defs>
    <G mask="url(#wel-mask)">
      {art.paths.map((l, i) => <Path key={i} d={l.d} fill="none" stroke={k.tok(l.c)} strokeOpacity={BAND_OPACITY[l.band]} strokeWidth={BAND_WIDTH[l.band]} strokeLinecap="round" />)}
      {art.marks.map(m => { const c = k.tok(m.c); return m.mk === 'c' ? <Circle key={m.c} cx={m.x} cy={m.y} r={5} fill={c} />
        : m.mk === 's' ? <Rect key={m.c} x={m.x - 4.5} y={m.y - 4.5} width={9} height={9} rx={2} fill={c} />
        : <Path key={m.c} d={`M${m.x} ${m.y - 6}L${m.x + 6} ${m.y + 4.5}L${m.x - 6} ${m.y + 4.5}Z`} fill={c} stroke={c} strokeWidth={1.5} strokeLinejoin="round" />; })}
    </G>
  </Svg>
  </Animated.View>;
}

/** A 52 pt way in (`.ob-wcta .btn`): 600 17 pt label, an icon before it. */
function WayIn({ testID, label, icon, onPress, bg, ink }: { testID: string; label: string; icon: React.ReactNode; onPress: () => void; bg: string; ink: string }) {
  return <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, backgroundColor: bg }}>
    {icon}
    <KitText weight={600} size={17} tracking={-0.01} color={ink}>{label}</KitText>
  </PressScale>;
}

/** What Continue with Google says when it can't go ahead. Google needs a provider in the backend first, so for now it is
 * always the calm "not set up yet" line. */
export function googleNotice(result: GoogleSignInResult): string | null {
  return result.ok || result.reason === 'cancelled' ? null : t('obaGoogleOff');
}

/** Welcome: what the app is for, then the ways in. Sign-ins land in setup through the app's own check for a new account;
 * Skip for now opens its sheet (guest or sample data). */
export function Welcome() {
  const auth = useAuth();
  const k = useKit(), insets = useSafeAreaInsets(), { width, height } = useWindowDimensions();
  // The map is 344 pt tall as designed wherever the rest fits under it; on a shorter phone it gives way, so the ways in
  // and the legal line always stay on screen. `rest` is everything under the map, measured.
  const [rest, setRest] = useState({ top: 141, cta: 330 });
  const bottom = Math.max(30, insets.bottom - 4);
  const artH = Math.max(200, Math.min(WELCOME_ART_HEIGHT, Math.floor(height - bottom - rest.top - rest.cta)));
  const { palette, mode } = useTheme();
  const [p] = useSettingsPrefs();
  const [google, setGoogle] = useState<string | null>(null);
  const continueWithGoogle = async () => {
    const result = auth.signInWithGoogle ? await auth.signInWithGoogle() : { ok: false as const, reason: 'notConfigured' as const };
    setGoogle(googleNotice(result));
  };
  // A link's words stay together on one line, as in the design ("Privacy policy." wraps whole).
  const link = (label: string, url: string) => <KitText weight={600} size={12.5} color="text-muted" accessibilityRole="link" accessibilityLabel={label} onPress={() => { void openPage(url); }}
    style={{ textDecorationLine: 'underline' }}>{label.replace(/ /g, ' ')}</KitText>;
  const quietBg = k.dark ? k.c['surface-2'] : k.fill;
  return <ScrollView testID="welcome" bounces={false} showsVerticalScrollIndicator={false} style={{ flex: 1, backgroundColor: k.c.bg }}
    contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: bottom }}>
    <View style={{ height: artH, marginHorizontal: -16, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={t('welcomeMapLabel')}>
      <Art width={width} height={artH} />
      <View style={{ position: 'absolute', left: 16, bottom: 14, width: 52, height: 52, borderRadius: 13, overflow: 'hidden', boxShadow: k.lift }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 52, height: 52 }} accessible={false} />
      </View>
    </View>
    <View onLayout={e => { const h = Math.ceil(e.nativeEvent.layout.height); setRest(r => r.top === h ? r : { ...r, top: h }); }}>
      <KitText weight={700} size={44} lineHeight={1} tracking={-0.045} accessibilityRole="header">{t('welcomeName')}</KitText>
      <KitText weight={500} size={17} lineHeight={1.45} color="text-muted" style={{ marginTop: 12, maxWidth: 330 }}>{t('welcomeLine')}</KitText>
      <View testID="welcome-strands" accessible accessibilityLabel={t('welcomePillsLabel')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 14, marginTop: 14 }}>
        {STRANDS.map(([color, kind], i) => <View key={color} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Shape kind={kind} color={k.tok(color)} /><KitText weight={600} size={13.5}>{t(PILL_KEYS[i])}</KitText>
        </View>)}
      </View>
    </View>
    <View style={{ flex: 1 }} />
    <View onLayout={e => { const h = Math.ceil(e.nativeEvent.layout.height); setRest(r => r.cta === h ? r : { ...r, cta: h }); }}
      style={{ gap: 8, paddingTop: 20 }}>
      {auth.configError && <Notice testID="welcome-config-error" text={auth.configError} />}
      {google && <Notice testID="welcome-google-notice" text={google} />}
      <AppleSignIn />
      <WayIn testID="welcome-email" label={t('obaEmail')} bg={quietBg} ink={k.c.text} icon={<Icon name="mail" size={19} color={k.c.text} />}
        onPress={() => router.push('/auth/email' as Href)} />
      <WayIn testID="welcome-google" label={t('obaGoogle')} bg={quietBg} ink={k.c.text} icon={<GoogleMark />} onPress={() => { void continueWithGoogle(); }} />
      <PressScale testID="welcome-skip" accessibilityRole="button" accessibilityLabel={t('obaSkip')} onPress={() => router.push('/auth/skip' as Href)}
        style={{ minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
        <KitText weight={700} size={16} tracking={-0.01} color="accent">{t('obaSkip')}</KitText>
      </PressScale>
      <KitText weight={500} size={12.5} lineHeight={1.5} color="ghost" style={{ textAlign: 'center', marginTop: 2 }}>
        {t('welcomeLegal')}{link(t('termsOfUse'), LEGAL_LINKS.terms)}{t('welcomeLegalAnd')}{link(t('privacyPolicy'), LEGAL_LINKS.privacy)}.
      </KitText>
    </View>
  </ScrollView>;
}
