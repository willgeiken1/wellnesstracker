import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { readProfile } from '@/features/onboarding/model';
import { useHealthDays } from '@/features/health/use-health-days';
import { useOuraRecovery } from '@/features/health/use-oura-recovery';
import { useRecovery } from '@/features/health/use-recovery';
import { pageEndSpace } from '@/features/shell/geometry';
import { ProfileButton } from '@/features/shell/profile-button';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { showToast } from '@/features/shell/toast';
import { TileGrid } from '@/features/tiles/tile-grid';
import { tileRoutes } from '@/features/tiles/nav';
import { tileEdit } from '@/features/tiles/store';
import { useTileEdit } from '@/features/tiles/use-tiles';
import { useWorkout } from '@/features/workout/use-workout';
import { HomeHero } from './hero';
import { DAYS } from './tiles/data';
import { registerHomeTiles } from './tiles/register';
import { useHomeTiles } from './tiles/use-home-tiles';
import { useFocused } from './use-focused';

registerHomeTiles();

/** The page's top: the status bar's safe area, at least 47 points so a frame that reports none still clears it. */
const MIN_TOP = 47;

/**
 * Home: the hero (date, greeting, today's map and the week), the profile button, and the tiles. The + offers Edit tiles,
 * Add a tile, Water, Log a meal, Start workout and Weigh in; in edit mode it is the Done check.
 */
export function Home() {
  const { store } = useWorkout();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useFocused();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Health readings stay in memory for this screen only.
  const health = useHealthDays(focused, undefined, DAYS);
  const apple = useRecovery(focused, undefined, DAYS);
  const oura = useOuraRecovery(focused, undefined, DAYS);
  useHomeTiles({ store, focused, health, apple, oura });
  const repo = store?.repo ?? null;
  const name = useMemo(() => repo ? readProfile(repo).name : '', [repo, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const { editing } = useTileEdit('home');
  useShellEditMode('home', editing, () => tileEdit.end());
  const go = (href: string) => router.push(href as unknown as Href);
  useQuickActions('home', {
    edit: { run: () => tileEdit.set('home', true) },
    add: { run: () => tileRoutes().tray('home') },
    water: { run: () => showToast(t('homeWaterFromHealth'), { color: 'water' }) },
    meal: { run: () => go('/food/log') },
    start: { run: () => go('/workout') },
    weigh: { run: () => go('/progress') },
  });

  return <Animated.ScrollView ref={scrollRef} testID="home-scroll" style={{ flex: 1, backgroundColor: colors.bg }}
    contentContainerStyle={{ paddingTop: Math.max(insets.top, MIN_TOP), paddingHorizontal: 16, paddingBottom: pageEndSpace(insets.bottom) }}
    showsVerticalScrollIndicator={false}>
    <View>
      <HomeHero />
      <View style={{ position: 'absolute', top: 6, right: 0 }}><ProfileButton name={name} /></View>
    </View>
    <TileGrid page="home" scrollRef={scrollRef} />
  </Animated.ScrollView>;
}
