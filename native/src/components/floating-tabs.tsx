import { useSyncExternalStore, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { ShellChrome } from '@/features/shell/shell';
import { DOCK, dockBottom as shellDockBottom, pageEndSpace } from '@/features/shell/geometry';
import { PAGES, pageLabel, type PageKey } from '@/features/shell/pages';
import { TabScene, type SceneNavigation } from '@/features/shell/tab-scene';
import { FADES } from './kit-motion';
import { PRESSED_FILL_OPACITY } from './tappable';

/** The open tab's circle, the other tabs, the room inside a pill and the gap between pieces of the bar. */
export const DOCK_ACTIVE = DOCK.ACTIVE, DOCK_ITEM = DOCK.ITEM, DOCK_PAD = DOCK.PAD, DOCK_GAP = DOCK.GAP;
/** How far the bar sits above the bottom of the screen. */
export const dockBottom = shellDockBottom;
/** The bottom inset a tab page sees: with the Screen's own end padding it leaves the mockup's 116 points above the bar's offset,
 * so the last row scrolls clear of the bar and its fade. */
export const dockSpace = (inset: number) => pageEndSpace(inset) - tokens.spacing[3];
/** Kept for screens that add room for an older bar's fade; the shell's page end space already includes the fade. */
export const DOCK_FADE = 24;

/** Older API: a screen's own round button beside the bar. The shell's + button and its quick actions replace it (see
 * features/shell/registry.ts); these stay only until Home stops calling them, and the bar no longer draws the button. */
export interface DockAction { label: string; expanded: boolean; onPress: () => void }
let dockAction: DockAction | null = null;
const dockListeners = new Set<() => void>();
export function setDockAction(next: DockAction | null) {
  const same = next === dockAction || (!!next && !!dockAction && next.label === dockAction.label && next.expanded === dockAction.expanded && next.onPress === dockAction.onPress);
  if (same) return;
  dockAction = next;
  dockListeners.forEach(listener => listener());
}
const subscribeDock = (listener: () => void) => { dockListeners.add(listener); return () => { dockListeners.delete(listener); }; };
export const useDockAction = () => useSyncExternalStore(subscribeDock, () => dockAction, () => dockAction);
export function DockButton({ action }: { action: DockAction }) {
  const { colors } = useTheme();
  return <Pressable testID="dock-action" accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ expanded: action.expanded }}
    onPress={action.onPress} style={({ pressed }) => [{ width: DOCK_ITEM + 2 * DOCK_PAD, height: DOCK_ITEM + 2 * DOCK_PAD, borderRadius: (DOCK_ITEM + 2 * DOCK_PAD) / 2,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors['hair-2'], opacity: pressed ? PRESSED_FILL_OPACITY : 1 }, tokens.elevation.ios]}>
    <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 5v14M5 12h14" stroke={colors.text} strokeWidth={2} strokeLinecap="round" transform={action.expanded ? 'rotate(45 12 12)' : undefined} />
    </Svg>
  </Pressable>;
}

export { DockFade } from '@/features/shell/fade';

/** Inside the tabs the bottom inset includes the floating bar, so screens keep their last rows and buttons clear of it. */
function DockInsets({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: dockSpace(insets.bottom) }}>{children}</SafeAreaInsetsContext.Provider>;
}

/** How long the navigator keeps the page that leaves attached: its 110 ms fade, with a frame to spare. */
const TAB_HOLD = { animation: 'timing', config: { duration: FADES.tabOut + 30 } } as const;

/** The tab pages behind the shell: Home, Training, Food, Progress and Routines on the floating bar. Insights has folded into
 * Progress; its route stays so old links land on Progress. */
export function FloatingTabs() {
  // The pages move themselves (TabScene); the navigator only keeps the page that leaves on screen while it fades out.
  return <Tabs screenOptions={{ headerShown: false, transitionSpec: TAB_HOLD }}
    screenLayout={({ children, route, navigation }) => <DockInsets>
      <TabScene routeKey={route?.key} home={route?.name === 'index'} navigation={navigation as unknown as SceneNavigation}>{children}</TabScene>
    </DockInsets>}
    tabBar={({ state, emitter, navigateToTab }) => <ShellChrome route={state.routes[state.index]?.name}
      goTo={(page: PageKey) => {
        const name = PAGES.find(p => p.key === page)!.route, route = state.routes.find(r => r.name === name);
        if (!route) return;
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (state.routes[state.index]?.key !== route.key && !event.defaultPrevented) navigateToTab(route.key);
      }} />}>
    {PAGES.map(page => <Tabs.Screen key={page.route} name={page.route} options={{ title: pageLabel(page.key) }} />)}
    {/* Not on the bar (the bar draws PAGES only). No href: null here, which would now send its address to Home instead. */}
    <Tabs.Screen name="insights" options={{ title: pageLabel('progress') }} />
  </Tabs>;
}
