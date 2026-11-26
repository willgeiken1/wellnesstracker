import { useMemo } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KitText, Tappable, useKit } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { terrain } from '@/features/home/contour';
import { iconArt, iconId } from '@/features/settings/app-icon';
import { LEGAL_LINKS, openPage } from '@/features/settings/links';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { t } from '@/i18n/en';
import { Notice } from './parts';

/* The welcome screen (pages/settings.js `welcome`): the contour map across the top, the app icon, the name and one line,
 * the four strands, then the ways in and the legal line. */
const STRANDS = [['training', 'c'], ['food', 't'], ['recovery', 'd'], ['sleep', 's']] as const;
const PILL_KEYS = ['welcomePillTraining', 'welcomePillFood', 'welcomePillSleep', 'welcomePillRoutines'] as const;

function Shape({ kind, color }: { kind: 'c' | 't' | 'd' | 's'; color: string }) {
  return <Svg width={10} height={10} viewBox="0 0 10 10">
    {kind === 'c' ? <Circle cx={5} cy={5} r={4.5} fill={color} /> : kind === 't' ? <Path d="M5 .8 9.4 9H.6z" fill={color} />
      : kind === 'd' ? <Path d="M5 .5 9.5 5 5 9.5.5 5z" fill={color} /> : <Rect x={1} y={1} width={8} height={8} rx={2} fill={color} />}
  </Svg>;
}

function Art({ width }: { width: number }) {
  const k = useKit();
  const map = useMemo(() => terrain([1, 0.86, 0.94, 0.8], width, 430, { sd: 0.16, wobble: 0.22, levels: 7, seed: 29,
    positions: [[0.24, 0.36], [0.66, 0.66], [0.32, 0.8], [0.8, 0.26]] }), [width]);
  const colors = STRANDS.map(([c]) => k.tok(c));
  return <Svg width={width} height={430} style={{ position: 'absolute', top: 0, left: 0 }} accessible={false}>
    <Defs>
      <LinearGradient id="wel-fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0.04" stopColor="#fff" stopOpacity={0} /><Stop offset="0.22" stopColor="#fff" stopOpacity={1} />
        <Stop offset="0.62" stopColor="#fff" stopOpacity={1} /><Stop offset="0.98" stopColor="#fff" stopOpacity={0} />
      </LinearGradient>
      <Mask id="wel-mask"><Rect width={width} height={430} fill="url(#wel-fade)" /></Mask>
    </Defs>
    <G mask="url(#wel-mask)">
      {map.lines.map((l, i) => <Path key={i} d={l.d} fill="none" stroke={colors[l.hill]} strokeWidth={l.width * 1.1} opacity={Math.min(1, l.opacity * 1.15)} strokeLinecap="round" />)}
      {map.markers.filter(m => m.summit).map(m => <Circle key={m.hill} cx={m.x} cy={m.y} r={5} fill={colors[m.hill]} />)}
    </G>
  </Svg>;
}

/** Welcome: what the app is for, then the ways in (start, look around, sign in, import). */
export function Welcome() {
  const auth = useAuth();
  const k = useKit(), insets = useSafeAreaInsets(), { width } = useWindowDimensions();
  const { palette, mode } = useTheme();
  const [p] = useSettingsPrefs();
  const link = (label: string, url: string) => <KitText weight={600} size={12.5} color="text-muted" accessibilityRole="link" onPress={() => { void openPage(url); }}
    style={{ textDecorationLine: 'underline' }}>{label}</KitText>;
  const quiet = (testID: string, label: string, onPress: () => void, disabled = false) => <Tappable testID={testID} dim="none" accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
    <KitText weight={600} size={14} color="text-muted">{label}</KitText>
  </Tappable>;
  return <View testID="welcome" style={{ flex: 1, backgroundColor: k.c.bg, paddingHorizontal: 16, paddingBottom: insets.bottom + 8 }}>
    <View style={{ height: 430, marginHorizontal: -16 }} accessible accessibilityRole="image" accessibilityLabel={t('welcomeMapLabel')}>
      <Art width={width} />
      <View style={{ position: 'absolute', left: 16, bottom: 18, width: 52, height: 52, borderRadius: 13, overflow: 'hidden', boxShadow: k.lift }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 52, height: 52 }} accessible={false} />
      </View>
    </View>
    <KitText weight={700} size={44} lineHeight={1} tracking={-0.045} accessibilityRole="header">{t('welcomeName')}</KitText>
    <KitText weight={500} size={17} lineHeight={1.45} color="text-muted" style={{ marginTop: 14, maxWidth: 330 }}>{t('welcomeLine')}</KitText>
    <View testID="welcome-strands" accessible accessibilityLabel={t('welcomePillsLabel')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 14, marginTop: 16 }}>
      {STRANDS.map(([color, kind], i) => <View key={color} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Shape kind={kind} color={k.tok(color)} /><KitText weight={600} size={13.5}>{t(PILL_KEYS[i])}</KitText>
      </View>)}
    </View>
    <View style={{ flex: 1, minHeight: 16 }} />
    {!auth.configured && <Notice testID="welcome-unavailable" text={t('accountsUnavailable')} />}
    {auth.configError && <Notice testID="welcome-config-error" text={auth.configError} />}
    <View style={{ gap: 8, paddingTop: 16 }}>
      <Tappable testID="welcome-get-started" accessibilityRole="button" accessibilityLabel={t('getStarted')} disabled={!auth.configured} accessibilityState={{ disabled: !auth.configured }}
        onPress={() => router.push('/onboarding')}
        style={{ minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.text, opacity: auth.configured ? 1 : 0.4 }}>
        <KitText weight={600} size={17} tracking={-0.01} style={{ color: k.c.bg }}>{t('getStarted')}</KitText>
      </Tappable>
      <Tappable testID="welcome-look-around" accessibilityRole="button" accessibilityLabel={t('lookAround')} onPress={auth.lookAround}
        style={{ minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
        <KitText weight={600} size={16} color="accent-2">{t('lookAround')}</KitText>
      </Tappable>
      <View testID="welcome-other-ways" style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {quiet('welcome-sign-in', t('haveAccount'), () => router.push('/auth/sign-in'), !auth.configured)}
        {quiet('welcome-import', t('importChoose'), () => router.push('/import'))}
      </View>
      <KitText weight={500} size={12.5} lineHeight={1.5} color="ghost" style={{ textAlign: 'center', marginTop: 2 }}>
        {t('welcomeLegal')}{link(t('termsOfUse'), LEGAL_LINKS.terms)}{t('welcomeLegalAnd')}{link(t('privacyPolicy'), LEGAL_LINKS.privacy)}.
      </KitText>
    </View>
  </View>;
}
