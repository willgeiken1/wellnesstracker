import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
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
import { SwipeDays } from './swipe-days';
import { skyTokens } from './tones';
import { FadeUp } from './text-motion';
import { HeroWeek } from './week';
import { spreadAt } from './scroll-spread';
import { revealNumbers } from '../hide-numbers';

export { dateLine, greeting } from './model';

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
export function HomeHero({ scrollY, name }: { scrollY?: SharedValue<number>; name?: string } = {}) {
  const { colors, mode, reduceMotion } = useTheme();
  const c = colors as unknown as Record<string, string>;
  const dark = mode === 'dark';
  const [prefs] = useMapPrefs();
  const focused = useFocused();
  const { now, active } = useClock();
  const input = useHeroInput(now);
  const { width: winW, height: winH } = useWindowDimensions();
  const tick = useSelectionHaptic();

  // The selected day (6 is today) goes back to today when the date turns over.
  const [sel, setSel] = useState(6);
  const [focus, setFocus] = useState(-1);
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const [shownDay, setShownDay] = useState(dayKey);
  if (shownDay !== dayKey) { setShownDay(dayKey); setSel(6); setFocus(-1); }
  const view = useMemo(() => heroView(input, sel), [input, sel]);
  // Once setup has their first name, the greeting carries it.
  const greet = name?.trim() ? t('obaGreeting').replace('{greeting}', view.greeting).replace('{name}', name.trim()) : view.greeting;
  const sky = useMemo(() => skyTokens(c, mode), [c, mode]);
  const calm = prefs.motion === 'calm';
  const build = !reduceMotion && !calm;
  const headStyle = useReveal(110, build), secStyle = useReveal(254, build);
  // The layers trail the swipe by different shares, so the gaps between the lines open and settle with it (scroll-spread.ts).
  const greetDrift = useAnimatedStyle(() => ({ transform: [{ translateY: scrollY ? spreadAt('greet', scrollY.value, reduceMotion) : 0 }] }));
  const mapDrift = useAnimatedStyle(() => ({ transform: [{ translateY: scrollY ? spreadAt('map', scrollY.value, reduceMotion) : 0 }] }));

  // Hide numbers: a tap on the hidden food energy shows Home's numbers.
  const reveal = (pi: number) => { if (pi >= 0 && input.hide && view.pillars[pi]?.key === 'food') revealNumbers(); };
  const select = (i: number) => { if (i === sel) return; tick(); setFocus(-1); setTouched(true); setSel(i); };
  // A swipe on the map, in points as the hero shows it: the words lean with it and the week's glow leans toward the day it heads
  // for. Once the day changes the new day takes over, so it clears (after the week has folded it into its glow).
  const swipe = useSharedValue(0);
  useLayoutEffect(() => { swipe.value = 0; }, [sel, swipe]);

  const head = <Animated.View style={[{ paddingRight: 56 }, headStyle]}>
    <KitText weight={600} size={11.5} lineHeight={1.2} tracking={0.14} color="text-muted" style={capitals}>{view.dateLine}</KitText>
    <Animated.View style={greetDrift} testID="home-hero-greeting">
      <KitText weight={700} size={29} lineHeight={1.1} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 5 }}>{greet}</KitText>
    </Animated.View>
  </Animated.View>;

  // The whole hero off leaves a plain greeting.
  if (!prefs.hero) return <View testID="home-hero" style={{ paddingTop: 6, paddingBottom: 8 }}>
    <KitText weight={700} size={11.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{view.dateLine}</KitText>
    <KitText weight={700} size={34} lineHeight={1.05} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 8, marginRight: 110 }}>{greet}</KitText>
  </View>;

  const W = winW - 32, paused = !focused || !active;
  const style = !prefs.map ? 'plain' : prefs.style === 'ridge' ? 'ridge' : failed ? 'ridge' : 'aurora';
  const map = style === 'plain' ? <SwipeDays sel={sel} swipe={swipe} reduceMotion={reduceMotion} onSwipeDay={select}>
      <PlainHero view={view} colors={c} reduceMotion={reduceMotion} onReveal={input.hide ? revealNumbers : undefined} /></SwipeDays>
    : style === 'ridge' ? <SwipeDays sel={sel} swipe={swipe} reduceMotion={reduceMotion} onSwipeDay={select}>
      <RidgeHero view={view} width={winW} colors={c} mode={mode} reduceMotion={reduceMotion} calm={calm} labels={prefs.labels} glow={prefs.glow} onPeak={reveal} /></SwipeDays>
    : <AuroraHero view={view} width={winW} colors={c} mode={mode} sky={sky} reduceMotion={reduceMotion} calm={calm} paused={paused}
      animate={touched && !reduceMotion} levels={LEVELS[prefs.detail]} glow={prefs.glow} labels={prefs.labels}
      scrollY={scrollY} swipe={swipe} onSwipeDay={select} focus={focus} onFocus={pi => { setTouched(true); setFocus(pi); reveal(pi); }} onTouch={() => setTouched(true)} onFail={() => setFailed(true)} />;

  return <View testID="home-hero" style={{ paddingTop: 6, paddingBottom: 6 }}>
    {head}
    <Animated.View style={mapDrift} testID="home-hero-map">{map}</Animated.View>
    {prefs.week ? <>
      <Animated.View style={[{ marginTop: 28, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, secStyle]}>
        <KitText weight={700} size={16} lineHeight={1.1} tracking={-0.02} accessibilityRole="header">{t('homeHeroThisWeek')}</KitText>
        <FadeUp k={view.weekNote} animate={touched && !reduceMotion} style={{ flexShrink: 1 }}>
          <KitText weight={500} size={12.5} lineHeight={1.2} color="text-muted" style={{ textAlign: 'right' }} testID="home-hero-week-note">{view.weekNote}</KitText>
        </FadeUp>
      </Animated.View>
      <HeroWeek width={W + 32} week={view.week} sel={sel} colors={c} sky={sky} dark={dark} glow={prefs.glow} reduceMotion={reduceMotion} build={build} swipe={swipe} onSelect={select} />
    </> : null}
  </View>;
}

/**
 * Behind Home, outside its scroll: today's isobars, the far graticule and the night stars over a soft wash. The page
 * scrolls over it while its three line layers drift only slightly, so it stays nearly fixed.
 */
export function HomeBackdrop({ scrollY }: { scrollY?: SharedValue<number> }) {
  const { colors, mode, reduceMotion } = useTheme();
  const c = colors as unknown as Record<string, string>;
  const [prefs] = useMapPrefs();
  const { now } = useClock();
  const input = useHeroInput(now);
  const values = useMemo(() => heroView(input, 6).week[6].values, [input]);
  const sky = useMemo(() => skyTokens(c, mode), [c, mode]);
  const { width, height } = useWindowDimensions();
  if (!prefs.hero) return null;
  return <View style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
    <HeroBackdrop values={values} levels={LEVELS[prefs.detail]} width={width} height={height} colors={c} sky={sky} dark={mode === 'dark'}
      lines={prefs.lines} scrollY={scrollY} reduceMotion={reduceMotion} />
  </View>;
}
