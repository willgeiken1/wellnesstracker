import { useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { tabs } from '@/features/shell/tabs';
import { t } from '@/i18n/en';
import { Icon, type IconName } from './icon';
import { useSelectionHaptic } from './selection-haptic';

/** The open tab's circle, the other tabs' circles, and the room around them, on a phone of ordinary width. */
export const DOCK_ACTIVE = 56, DOCK_ITEM = 46, DOCK_PAD = 5, DOCK_GAP = 8;
/** The sizes the bar is drawn at. `open` is the open tab's circle and `item` every other tab's; `pad` is the room
 * inside a pill, `gap` the room between two tabs in a pill, and `groupGap` the room between the pills, the open
 * tab and a screen's own button. */
export interface DockMetrics { size: 'regular' | 'compact'; open: number; item: number; pad: number; gap: number; groupGap: number; openIcon: number; icon: number }
const REGULAR: DockMetrics = { size: 'regular', open: DOCK_ACTIVE, item: DOCK_ITEM, pad: DOCK_PAD, gap: 4, groupGap: DOCK_GAP, openIcon: 24, icon: 22 };
/* Display Zoom makes the smallest phones 320 points wide. Five tabs and a screen's + are 334 wide at the ordinary
   sizes, so there the bar is drawn a little smaller: 296 wide, with every tab still a 44-point target. */
const COMPACT: DockMetrics = { size: 'compact', open: 52, item: 42, pad: 4, gap: 2, groupGap: 6, openIcon: 24, icon: 22 };
/** The least room the bar keeps clear on each side of the screen. */
export const DOCK_SIDE = 12;
/** How wide the bar is: the open tab, the pills either side of it, and a screen's own button when it has one. */
export function dockWidth(metrics: DockMetrics, count: number, active: number, withAction = false): number {
  const pill = (tabs: number) => (tabs > 0 ? tabs * metrics.item + (tabs - 1) * metrics.gap + 2 * metrics.pad : 0);
  const parts = [pill(active), metrics.open, pill(count - active - 1), withAction ? metrics.item + 2 * metrics.pad : 0].filter(width => width > 0);
  return parts.reduce((sum, width) => sum + width, 0) + (parts.length - 1) * metrics.groupGap;
}
/** The sizes for a screen this wide. The answer depends only on the width, so nothing changes size from one tab
 * to the next: the widest the bar gets (an end tab with its + beside it) has to fit. */
export function dockMetrics(windowWidth: number, count: number = tabs.length): DockMetrics {
  const widest = Math.max(dockWidth(REGULAR, count, 0, true), dockWidth(REGULAR, count, count - 1, true));
  return windowWidth >= widest + 2 * DOCK_SIDE ? REGULAR : COMPACT;
}
/** How far the dock sits above the bottom of the screen, and how much room a screen leaves for it. */
export const dockBottom = (inset: number) => Math.max(inset - 10, 12);
export const dockSpace = (inset: number, metrics: DockMetrics = REGULAR) => dockBottom(inset) + metrics.open + 2 * metrics.groupGap;
/** The pill in dark themes: darker than any card, so the bar stands off the page as it does in light themes. */
export const DOCK_NIGHT = '#08090B';
/** How far the fade behind the bar reaches above the room left for it. Screens leave this much more at their end,
 * so a last button can rest clear of the fade, not only clear of the bar. */
export const DOCK_FADE = 24;

/** A screen's own round button that rides beside the floating bar while that screen is open, like Home's +.
 * It sits in line with the tabs, so it never covers a card the way a button floating over the page does. */
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

/** The button beside the bar: the size of the other tabs, neutral, so the open tab stays the only accent circle. */
export function DockButton({ action, metrics = REGULAR }: { action: DockAction; metrics?: DockMetrics }) {
  const { colors } = useTheme();
  const size = metrics.item + 2 * metrics.pad;
  return <Pressable testID="dock-action" accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ expanded: action.expanded }}
    onPress={action.onPress} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors['hair-2'], opacity: pressed ? 0.8 : 1 }, tokens.elevation.ios]}>
    <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 5v14M5 12h14" stroke={colors.text} strokeWidth={2} strokeLinecap="round" transform={action.expanded ? 'rotate(45 12 12)' : undefined} />
    </Svg>
  </Pressable>;
}
function DockRow({ children, metrics }: { children: ReactNode; metrics: DockMetrics }) {
  const action = useDockAction();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupGap }}>{children}{action && <DockButton action={action} metrics={metrics} />}</View>;
}

export interface DockItem { key: string; label: string; icon: IconName }

/** The floating tab bar: the open tab stands on its own as an accent circle, and the tabs on either side of it
 * sit in dark pills. Icons only; each carries its name for VoiceOver. */
export function TabDock({ items, active, onPress, metrics = REGULAR }: { items: readonly DockItem[]; active: number; onPress: (index: number) => void; metrics?: DockMetrics }) {
  const { colors, mode } = useTheme();
  // The pill is the theme's ink in light mode and near-black in dark mode, so it reads on every theme.
  const dark = mode === 'dark';
  const pill = dark ? DOCK_NIGHT : colors.text, ink = dark ? colors.text : colors.bg;
  const button = (item: DockItem, index: number) => {
    const open = index === active, size = open ? metrics.open : metrics.item;
    // A tab's target reaches half way to its neighbour, so even the smaller circles are 44 points across.
    const side = metrics.gap / 2;
    return <Pressable key={item.key} testID={`tab-${item.key}`} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: open }}
      // The bar is icons only and does not grow with the text size, so a long press shows the name large.
      accessibilityShowsLargeContentViewer accessibilityLargeContentTitle={item.label}
      onPress={() => onPress(index)} hitSlop={open ? 0 : { top: 6, bottom: 6, left: side, right: side }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: open ? colors.accent : 'transparent', opacity: pressed ? 0.8 : 1 }, open && tokens.elevation.ios]}>
      <Icon name={item.icon} size={open ? metrics.openIcon : metrics.icon} color={open ? colors['on-accent'] : ink} />
    </Pressable>;
  };
  const group = (from: number, to: number) => to > from && <View key={from} testID="tab-pill"
    style={[{ flexDirection: 'row', alignItems: 'center', gap: metrics.gap, padding: metrics.pad, borderRadius: (metrics.item + 2 * metrics.pad) / 2, backgroundColor: pill,
      borderWidth: dark ? 1 : 0, borderColor: colors['hair-2'] }, tokens.elevation.ios]}>
    {items.slice(from, to).map((item, i) => button(item, from + i))}
  </View>;
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupGap }}>
    {group(0, active)}
    {items[active] && button(items[active], active)}
    {group(active + 1, items.length)}
  </View>;
}

/** A soft fade of the page colour behind the bar, so rows scrolling under it melt away instead of showing between the pills. */
export function DockFade({ height }: { height: number }) {
  const { colors } = useTheme();
  return <View pointerEvents="none" testID="tab-fade" accessible={false} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
    <Svg width="100%" height={height}>
      <Defs><LinearGradient id="dock-fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
        <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0.92} />
        <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
      </LinearGradient></Defs>
      <Rect width="100%" height={height} fill="url(#dock-fade)" />
    </Svg>
  </View>;
}

/** Inside the tabs the bottom inset includes the floating bar, so screens keep their last rows and buttons clear of it. */
function DockInsets({ children, metrics }: { children: ReactNode; metrics: DockMetrics }) {
  const insets = useSafeAreaInsets();
  return <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: dockSpace(insets.bottom, metrics) }}>{children}</SafeAreaInsetsContext.Provider>;
}

/** The tabs behind the floating bar. Tabs never slide; the bar floats over the screen. */
export function FloatingTabs() {
  const insets = useSafeAreaInsets();
  const haptic = useSelectionHaptic();
  const metrics = dockMetrics(useWindowDimensions().width);
  const items: DockItem[] = tabs.map(tab => ({ key: tab.route, label: t(tab.label), icon: tab.label }));
  return <Tabs screenOptions={{ headerShown: false, animation: 'none' }} screenLayout={({ children }) => <DockInsets metrics={metrics}>{children}</DockInsets>}
    tabBar={({ state, emitter, navigateToTab }) => <><DockFade height={dockSpace(insets.bottom, metrics) + DOCK_FADE} /><View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: dockBottom(insets.bottom), alignItems: 'center' }}>
      <DockRow metrics={metrics}><TabDock items={items} active={state.index} metrics={metrics} onPress={index => {
        const route = state.routes[index];
        if (!route) return;
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (state.index !== index && !event.defaultPrevented) { haptic(); navigateToTab(route.key); }
      }} /></DockRow>
    </View></>}>
    {tabs.map(tab => <Tabs.Screen key={tab.route} name={tab.route} options={{ title: t(tab.label) }} />)}
  </Tabs>;
}
