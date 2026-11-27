import { useEffect, useRef, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { FADES, SPRINGS, tabArrival } from '@/components/kit-motion';
import { useTheme } from '@/design/theme-provider';

interface TabState { index: number; routes: { key: string }[] }
/** The bits of a tab screen's navigation the scene listens to. */
export interface SceneNavigation {
  getState: () => TabState;
  addListener(type: 'state', listener: (e: { data: { state: TabState } }) => void): () => void;
  addListener(type: 'focus', listener: () => void): () => void;
}

/** How long a change of tab takes: the opening page's wait and fade. The page that leaves is kept on screen this long. */
export const TAB_SWAP = FADES.tabDelay + FADES.tab;

const openKey = (s: TabState | undefined) => s?.routes[s.index]?.key;
/** The tab the app opened on; any other tab's first showing is a first visit. */
let launchKey: string | null = null;
/** Forget the tab the app opened on (tests that start the app again). */
export function resetTabScenes() { launchKey = null; }

/**
 * One tab page, as the mockup moves it when another tab opens: the page that opens fades in over the one that leaves (180 ms
 * after 40 ms) while it rises 8 pt on the tab spring; the page that leaves stays drawn underneath until then. A page's first visit only fades
 * in; Reduce Motion fades only. Screens pushed over the tabs leave the pages as they are, since only a change of tab moves them.
 */
export function TabScene({ children, routeKey, name, home, navigation }: { children: ReactNode; routeKey?: string; name?: string; home?: boolean; navigation?: SceneNavigation }) {
  const { reduceMotion } = useTheme();
  const reduced = useRef(reduceMotion);
  useEffect(() => { reduced.current = reduceMotion; }, [reduceMotion]);
  // A page under the navigator starts unseen and fades in when it opens, so it never shows for a frame before its fade.
  const opacity = useSharedValue(navigation && routeKey ? 0 : 1), rise = useSharedValue(0);

  useEffect(() => {
    if (!navigation || !routeKey) return;
    const arrive = (firstVisit: boolean) => {
      const m = tabArrival(firstVisit, !!home, reduced.current);
      opacity.value = 0; rise.value = m.rise;
      opacity.value = withDelay(m.delay, withTiming(1, { duration: m.fade, easing: Easing.linear }));
      if (m.rise) rise.value = withSpring(0, { mass: 1, stiffness: SPRINGS.tab.stiffness, damping: SPRINGS.tab.damping });
    };
    // The page that leaves stays fully drawn under the one that opens until that one has faded all the way in, so no frame
    // shows the empty background between them (the black flash); only then is it cleared, ready to fade in next time.
    const leave = () => {
      rise.value = 0;
      opacity.value = withDelay(TAB_SWAP, withTiming(0, { duration: 0 }));
    };
    let open = openKey(navigation.getState()) === routeKey, visited = open;
    if (open) {
      if (launchKey === null) launchKey = routeKey;
      arrive(launchKey !== routeKey);
    }
    const follow = (state: TabState) => {
      const now = openKey(state) === routeKey;
      if (now === open) return;
      open = now;
      if (now) { arrive(!visited); visited = true; } else leave();
    };
    const offState = navigation.addListener('state', e => follow(e.data.state));
    // Focus comes back after a screen pushed over the tabs closes; it only matters if a change of tab was missed meanwhile.
    const offFocus = navigation.addListener('focus', () => follow(navigation.getState()));
    return () => { offState(); offFocus(); };
  }, [navigation, routeKey, home, opacity, rise]);

  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value, transform: [{ translateY: rise.value }] }));
  return <Animated.View style={style} testID={name ? `tab-scene-${name}` : undefined}>{children}</Animated.View>;
}
