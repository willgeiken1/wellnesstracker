import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { tabs } from '@/features/shell/tabs';
import { t } from '@/i18n/en';
import { Icon, type IconName } from './icon';

/** The open tab's circle, the other tabs' circles, and the room around them. */
export const DOCK_ACTIVE = 56, DOCK_ITEM = 46, DOCK_PAD = 5, DOCK_GAP = 8;
/** How far the dock sits above the bottom of the screen, and how much room a screen leaves for it. */
export const dockBottom = (inset: number) => Math.max(inset - 10, 12);
export const dockSpace = (inset: number) => dockBottom(inset) + DOCK_ACTIVE + DOCK_GAP;

export interface DockItem { key: string; label: string; icon: IconName }

/** The floating tab bar: the open tab stands on its own as an accent circle, and the tabs on either side of it
 * sit in dark pills. Icons only; each carries its name for VoiceOver. */
export function TabDock({ items, active, onPress }: { items: readonly DockItem[]; active: number; onPress: (index: number) => void }) {
  const { colors, mode } = useTheme();
  // The pill is the theme's ink in light mode and a raised surface in dark mode, so it reads on every theme.
  const dark = mode === 'dark';
  const pill = dark ? colors['surface-2'] : colors.text, well = dark ? `${colors.text}1F` : `${colors.bg}26`, ink = dark ? colors.text : colors.bg;
  const button = (item: DockItem, index: number) => {
    const open = index === active, size = open ? DOCK_ACTIVE : DOCK_ITEM;
    return <Pressable key={item.key} testID={`tab-${item.key}`} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: open }}
      onPress={() => onPress(index)} hitSlop={open ? 0 : { top: 6, bottom: 6 }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: open ? colors.accent : well, opacity: pressed ? 0.8 : 1 }, open && tokens.elevation.ios]}>
      <Icon name={item.icon} size={open ? 24 : 22} color={open ? colors['on-accent'] : ink} />
    </Pressable>;
  };
  const group = (from: number, to: number) => to > from && <View key={from} testID="tab-pill"
    style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: DOCK_PAD, borderRadius: (DOCK_ITEM + 2 * DOCK_PAD) / 2, backgroundColor: pill,
      borderWidth: dark ? 1 : 0, borderColor: colors['hair-2'] }, tokens.elevation.ios]}>
    {items.slice(from, to).map((item, i) => button(item, from + i))}
  </View>;
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: DOCK_GAP }}>
    {group(0, active)}
    {items[active] && button(items[active], active)}
    {group(active + 1, items.length)}
  </View>;
}

/** Inside the tabs the bottom inset includes the floating bar, so screens keep their last rows and buttons clear of it. */
function DockInsets({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: dockSpace(insets.bottom) }}>{children}</SafeAreaInsetsContext.Provider>;
}

/** The five tabs behind the floating bar. Tabs never slide; the bar floats over the screen. */
export function FloatingTabs() {
  const insets = useSafeAreaInsets();
  const items: DockItem[] = tabs.map(tab => ({ key: tab.route, label: t(tab.label), icon: tab.label }));
  return <Tabs screenOptions={{ headerShown: false, animation: 'none' }} screenLayout={({ children }) => <DockInsets>{children}</DockInsets>}
    tabBar={({ state, emitter, navigateToTab }) => <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: dockBottom(insets.bottom), alignItems: 'center' }}>
      <TabDock items={items} active={state.index} onPress={index => {
        const route = state.routes[index];
        if (!route) return;
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (state.index !== index && !event.defaultPrevented) navigateToTab(route.key);
      }} />
    </View>}>
    {tabs.map(tab => <Tabs.Screen key={tab.route} name={tab.route} options={{ title: t(tab.label) }} />)}
  </Tabs>;
}
