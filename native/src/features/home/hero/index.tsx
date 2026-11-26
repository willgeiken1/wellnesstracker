import { useEffect, useMemo, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { capitals } from '@/components/kit-style';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { KitText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { useFocused } from '../use-focused';
import { AuroraHero } from './aurora';
import { HeroBackdrop } from './backdrop';
import { useHeroInput } from './data';
import { heroView } from './model';
import { PlainHero } from './plain';
import { useMapPrefs } from './prefs';
import { RidgeHero } from './ridge';
import { skyTokens } from './tones';
import { HeroWeek } from './week';

export { dateLine, greeting } from './model';

/** The page's top inset, as Home lays it out (at least 47 points). */
const MIN_TOP = 47;
const LEVELS = [6, 9, 12] as const;
const EASE_OUT = Easing.out(Easing.cubic);

/** The clock the hero follows: each minute, and at once when the app comes back; `active` is false while it's away. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', state => { setActive(state === 'active'); if (state === 'active') tick(); });
    return () => { clearInterval(timer); sub?.remove(); };
  }, []);
  return { now, active };
}

/** Fades a block up into place after `delay` ms on first show, unless motion is reduced or calm. */
function useReveal(delay: number, build: boolean) {
  const v = useSharedValue(build ? 0 : 1);
  useEffect(() => { if (build) v.value = withDelay(delay, withTiming(1, { duration: 360, easing: EASE_OUT })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 10 }] }));
}

/**
 * Home's hero: the date and greeting, today's map (Aurora by default; Ridgeline, or numbers only, as chosen in Insight map),
 * and This week. Real numbers from the day's logs and Health; an empty day shows a clear sky. Tapping an arc shows that
 * pillar's full readout; a day in the week turns the whole hero to that day. Frames stop while Home isn't in front.
 */
export function HomeHero() {
  const { colors, mode, reduceMotion } = useTheme();
  const c = colors as unknown as Record<string, string>;
  const dark = mode === 'dark';
  const [prefs] = useMapPrefs();
  const focused = useFocused();
  const { now, active } = useClock();
  const input = useHeroInput(now);
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, MIN_TOP);
  const tick = useSelectionHaptic();

  // The selected day (6 is today) goes back to today when the date turns over.
  const [sel, setSel] = useState(6);
  const [focus, setFocus] = useState(-1);
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  useEffect(() => { setSel(6); setFocus(-1); }, [dayKey]);
  const view = useMemo(() => heroView(input, sel), [input, sel]);
  const sky = useMemo(() => skyTokens(c, mode), [c, mode]);
  const calm = prefs.motion === 'calm';
  const build = !reduceMotion && !calm;
  const headStyle = useReveal(110, build), secStyle = useReveal(254, build);

  const select = (i: number) => { if (i === sel) return; tick(); setFocus(-1); setTouched(true); setSel(i); };

  const head = <Animated.View style={[{ paddingRight: 56 }, headStyle]}>
    <KitText weight={600} size={11.5} lineHeight={1.2} tracking={0.14} color="text-muted" style={capitals}>{view.dateLine}</KitText>
    <KitText weight={700} size={29} lineHeight={1.1} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 5 }}>{view.greeting}</KitText>
  </Animated.View>;

  // The whole hero off leaves a plain greeting.
  if (!prefs.hero) return <View testID="home-hero" style={{ paddingTop: 6, paddingBottom: 8 }}>
    <KitText weight={700} size={11.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{view.dateLine}</KitText>
    <KitText weight={700} size={34} lineHeight={1.05} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 8, marginRight: 110 }}>{view.greeting}</KitText>
  </View>;

  const W = winW - 32, paused = !focused || !active;
  const style = !prefs.map ? 'plain' : prefs.style === 'ridge' ? 'ridge' : failed ? 'ridge' : 'aurora';
  const map = style === 'plain' ? <PlainHero view={view} colors={c} reduceMotion={reduceMotion} />
    : style === 'ridge' ? <RidgeHero view={view} width={winW} colors={c} mode={mode} reduceMotion={reduceMotion} calm={calm} labels={prefs.labels} glow={prefs.glow} />
    : <AuroraHero view={view} width={winW} colors={c} mode={mode} sky={sky} reduceMotion={reduceMotion} calm={calm} paused={paused}
      animate={touched && !reduceMotion} levels={LEVELS[prefs.detail]} glow={prefs.glow} labels={prefs.labels}
      focus={focus} onFocus={pi => { setTouched(true); setFocus(pi); }} onTouch={() => setTouched(true)} onFail={() => setFailed(true)} />;

  return <View testID="home-hero" style={{ paddingTop: 6, paddingBottom: 6 }}>
    <View style={{ position: 'absolute', left: -16, top: -top, width: winW, height: winH }} pointerEvents="none">
      <HeroBackdrop values={view.week[6].values} levels={LEVELS[prefs.detail]} width={winW} height={winH} colors={c} sky={sky} dark={dark} lines={prefs.lines} />
    </View>
    {head}
    {map}
    {prefs.week ? <>
      <Animated.View style={[{ marginTop: 28, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, secStyle]}>
        <KitText weight={700} size={16} lineHeight={1.1} tracking={-0.02} accessibilityRole="header">{t('homeHeroThisWeek')}</KitText>
        <KitText weight={500} size={12.5} lineHeight={1.2} color="text-muted" style={{ textAlign: 'right', flexShrink: 1 }} testID="home-hero-week-note">{view.weekNote}</KitText>
      </Animated.View>
      <HeroWeek width={W + 32} week={view.week} sel={sel} colors={c} sky={sky} dark={dark} glow={prefs.glow} reduceMotion={reduceMotion} build={build} onSelect={select} />
    </> : null}
  </View>;
}
