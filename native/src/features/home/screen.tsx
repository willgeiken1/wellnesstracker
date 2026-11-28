import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { readProfile } from '@/features/onboarding/model';
import { NudgeCard } from '@/features/onboarding/nudge/nudge-card';
import { HomeTips } from '@/features/onboarding/tips/home-tips';
import { SampleTour } from '@/features/onboarding/tour/sample-tour';
import { useHealthDays } from '@/features/health/use-health-days';
import { useOuraRecovery } from '@/features/health/use-oura-recovery';
import { useRecovery } from '@/features/health/use-recovery';
import { pageEndSpace } from '@/features/shell/geometry';
import { ProfileButton } from '@/features/shell/profile-button';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { TileGrid } from '@/features/tiles/tile-grid';
import { tileRoutes } from '@/features/tiles/nav';
import { tileEdit } from '@/features/tiles/store';
import { useTileEdit } from '@/features/tiles/use-tiles';
import { useWorkout } from '@/features/workout/use-workout';
import { fill } from '@/features/tiles/ui';
import { waterAmt, waterNum } from '@/features/food/water';
import { logForToday } from '@/features/food/selection';
import { HomeBackdrop, HomeHero } from './hero';
import { DAYS } from './tiles/data';
import { registerHomeTiles } from './tiles/register';
import { useHomeTiles } from './tiles/use-home-tiles';
import { withDemoSleep } from './demo-sleep';
import { useAuth } from '@/auth/provider';
import { useFocused } from './use-focused';
import { coverNumbers } from './hide-numbers';

registerHomeTiles();

/** The + menu's Log water line: today's total against the goal in the person's water unit, or Today before it is read. */
export function waterHint(w: { today: number; goal: number; unit: string } | undefined): string | undefined {
  if (!w) return undefined;
  const u = w.unit === 'ml' ? 'ml' : 'oz';
  return fill(t('homeWaterHint'), { v: waterNum(w.today, u), goal: waterAmt(w.goal, u) });
}
/** The water hint and its shorter forms, longest first, for a row of the + arc with less room. */
export function waterHints(w: { today: number; goal: number; unit: string } | undefined): string[] | undefined {
  if (!w) return undefined;
  const u = w.unit === 'ml' ? 'ml' : 'oz', v = { v: waterNum(w.today, u), goal: waterAmt(w.goal, u) };
  return [fill(t('homeWaterHint'), v), fill(t('homeWaterHintShort'), v), fill(t('homeWaterHintTiny'), { v: waterAmt(w.today, u) })];
}

/** The page's top: the status bar's safe area, at least 47 points so a frame that reports none still clears it. */
const MIN_TOP = 47;

/**
 * Home: the hero (date, greeting, today's map and the week), the tiles, and the profile button pinned at the top right. The + offers Edit tiles,
 * Add a tile, Water, Log a meal, Start workout and Weigh in; in edit mode it is the Done check.
 */
export function Home() {
  const { store } = useWorkout();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useFocused();
  // Hide numbers: a tap shows Home's numbers only until Home is left.
  useEffect(() => { if (!focused) coverNumbers(); }, [focused]);
  useEffect(() => () => coverNumbers(), []);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);
  // Health readings stay in memory for this screen only.
  const read = useHealthDays(focused, undefined, DAYS);
  const apple = useRecovery(focused, undefined, DAYS);
  const oura = useOuraRecovery(focused, undefined, DAYS);
  const repo = store?.repo ?? null;
  // Sample data alone: the app's own flag, and its namespace, so no real account ever gets made-up sleep.
  const sample = useAuth().demo === true && repo?.owner === 'demo';
  const health = useMemo(() => withDemoSleep(read, sample ? 'demo' : null, DAYS), [read, sample]);
  const tiles = useHomeTiles({ store, focused, health, apple, oura });
  const name = useMemo(() => repo ? readProfile(repo).name : '', [repo, store]); // eslint-disable-line react-hooks/exhaustive-deps
  // The first-Home tips point at the hero and the initial.
  const heroRef = useRef<ComponentRef<typeof View>>(null), avatarRef = useRef<ComponentRef<typeof View>>(null);

  const { editing } = useTileEdit('home');
  useShellEditMode('home', editing, () => tileEdit.end());
  const go = (href: string) => router.push(href as unknown as Href);
  useQuickActions('home', {
    edit: { run: () => tileEdit.set('home', true) },
    add: { run: () => tileRoutes().tray('home') },
    water: { run: () => { logForToday(); go('/food/water'); }, label: t('homeLogWater'), hint: waterHint(tiles?.data.water), hints: waterHints(tiles?.data.water) },
    meal: { run: () => { logForToday(); go('/food/log'); } },
    start: { run: () => go('/workout') },
    // The weigh-in sheet, as the mockup's Log weight opens it, not the Progress page.
    weigh: { run: () => go('/progress/log-weight') },
  });

  // The backdrop sits behind the scroll, so the page moves over it while it stays nearly still.
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <HomeBackdrop scrollY={scrollY} />
    <Animated.ScrollView ref={scrollRef} testID="home-scroll" style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: Math.max(insets.top, MIN_TOP), paddingHorizontal: 16, paddingBottom: pageEndSpace(insets.bottom) }}
      showsVerticalScrollIndicator={false}>
      <View ref={heroRef} collapsable={false}>
        <HomeHero scrollY={scrollY} name={name.trim().split(/\s+/)[0]} />
      </View>
      <NudgeCard store={repo} />
      <TileGrid page="home" scrollRef={scrollRef} />
    </Animated.ScrollView>
    {/* Pinned over the page, so it stays at the top right while the page scrolls under it. Its own fill keeps it legible. */}
    <View ref={avatarRef} collapsable={false} testID="profile-pin" style={{ position: 'absolute', top: Math.max(insets.top, MIN_TOP) + 6, right: 16 }}>
      <ProfileButton name={name} />
    </View>
    <HomeTips store={repo} hero={heroRef} avatar={avatarRef} />
    <SampleTour demo={repo?.owner === 'demo'} />
  </View>;
}
