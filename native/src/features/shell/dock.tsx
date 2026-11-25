import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { shellColors } from './colors';
import { DOCK, PRESS_SCALE, SPRINGS, type DockLayout } from './geometry';
import { NavIcon } from './icons';
import { PAGES, pageLabel } from './pages';

/** One animated number that glides to each new target on the tab spring, or jumps there with Reduce Motion. */
function useGlide(target: number, still: boolean, spring: { stiffness: number; damping: number } = SPRINGS.tab) {
  const value = useState(() => new Animated.Value(target))[0];
  const first = useRef(true);
  useEffect(() => {
    if (first.current || still) { first.current = false; value.stopAnimation(); value.setValue(target); return; }
    Animated.spring(value, { toValue: target, ...spring, mass: 1, useNativeDriver: false }).start();
  }, [target, still, value, spring]);
  return value;
}
function useFade(target: number, ms: number, still: boolean) {
  const value = useState(() => new Animated.Value(target))[0];
  useEffect(() => {
    if (still) { value.setValue(target); return; }
    Animated.timing(value, { toValue: target, duration: ms, easing: Easing.linear, useNativeDriver: false }).start();
  }, [target, ms, still, value]);
  return value;
}

export interface DockProps {
  layout: DockLayout; bottom: number; active: number; open: boolean; editing: boolean;
  onTab: (index: number) => void; onHold: () => void; onPlus: () => void;
}

function Pill({ x, width, shown, dim, still }: DockLayout['pillA'] & { dim: Animated.Value; still: boolean }) {
  const { colors, mode } = useTheme();
  const shell = shellColors(colors, mode);
  const left = useGlide(x, still), w = useGlide(width, still), fade = useFade(shown ? 1 : 0, 180, still);
  return <Animated.View pointerEvents="none" testID="tab-pill" style={{ position: 'absolute', top: 0, left: 0, height: 56, borderRadius: 28,
    width: w, transform: [{ translateX: left }], opacity: Animated.multiply(fade, dim), backgroundColor: shell.pill, boxShadow: shell.dockShadow }} />;
}

function Tab({ index, x, width, shown, selected, dim, still, onTab, onHold, holdable }: DockLayout['tabs'][number] & {
  index: number; selected: boolean; dim: Animated.Value; still: boolean; holdable: boolean; onTab: (index: number) => void; onHold: () => void }) {
  const { colors, mode } = useTheme();
  const shell = shellColors(colors, mode);
  const page = PAGES[index], label = pageLabel(page.key);
  const left = useGlide(x, still), w = useGlide(width, still), gone = useFade(shown ? 1 : 0, 200, still);
  const grow = useGlide(selected ? 1.06 : 1, still);
  const scale = gone.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return <Animated.View pointerEvents={shown ? 'auto' : 'none'} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!shown}
    style={{ position: 'absolute', top: 0, left: 0, height: 56, width: w, transform: [{ translateX: left }, { scale }], opacity: Animated.multiply(gone, dim) }}>
    <Tappable dim="none" testID={`tab-${page.route}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }}
      onPress={() => onTab(index)} onLongPress={holdable ? onHold : undefined} delayLongPress={520}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: width / 2 }}>
      {({ pressed }) => <Animated.View style={{ transform: [{ scale: pressed ? PRESS_SCALE : grow }] }}>
        <NavIcon name={page.key} on={selected} color={selected ? colors['on-accent'] : shell.pillInk} />
      </Animated.View>}
    </Tappable>
  </Animated.View>;
}

/** The floating bar: the open tab stands alone as an accent circle, the tabs before and after it sit in pills on either side,
 * and the + button closes the row. Touch and hold a tab to choose which tabs the bar shows. */
export function Dock({ layout, bottom, active, open, editing, onTab, onHold, onPlus }: DockProps) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const still = reduceMotion;
  const dim = useFade(open ? 0.32 : 1, 180, still);
  const bubble = useGlide(layout.bubbleX, still), plusX = useGlide(layout.plusX, still);
  const turn = useGlide(open && !editing ? 1 : 0, still, SPRINGS.open);
  const plusLabel = editing ? t('shellDoneEditing') : open ? t('shellCloseQuickActions') : t('shellQuickActions').replace('{page}', pageLabel(PAGES[active].key));
  const plusFill = editing ? colors.accent : open ? colors.text : colors.surface;
  const plusInk = editing ? colors['on-accent'] : open ? colors.bg : colors.text;
  const plusShadow = editing ? '0px 4px 10px rgba(0, 0, 0, 0.2)' : open ? '0px 6px 18px rgba(0, 0, 0, 0.28)' : shell.plusShadow;
  return <View pointerEvents="box-none" testID="dock" style={{ position: 'absolute', left: 0, right: 0, bottom, height: 56,
    transform: [{ scale: layout.scale }], transformOrigin: '50% 100%' }}>
    <View accessibilityRole="tablist" accessibilityLabel={t('shellTabs')} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56 }}>
      <Pill {...layout.pillA} dim={dim} still={still} />
      <Pill {...layout.pillB} dim={dim} still={still} />
      <Animated.View pointerEvents="none" testID="tab-bubble" style={{ position: 'absolute', top: 0, left: 0, width: DOCK.ACTIVE, height: DOCK.ACTIVE, borderRadius: 28,
        backgroundColor: colors.accent, boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.18)', transform: [{ translateX: bubble }], opacity: dim }} />
      {layout.tabs.map((tab, index) => <Tab key={PAGES[index].key} index={index} {...tab} selected={index === active} dim={dim} still={still}
        holdable={!editing} onTab={onTab} onHold={onHold} />)}
    </View>
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: plusX }] }}>
      <Tappable dim="none" testID="dock-plus" accessibilityRole="button" accessibilityLabel={plusLabel} accessibilityState={{ expanded: open }} onPress={onPlus}
        style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: plusFill, boxShadow: plusShadow }}>
        {({ pressed }) => <View style={{ width: 25, height: 25, transform: [{ scale: pressed ? PRESS_SCALE : 1 }] }}>
          <Animated.View style={{ position: 'absolute', opacity: editing ? 0 : 1, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) }] }}>
            <NavIcon name="plus" size={25} color={plusInk} />
          </Animated.View>
          <View style={{ position: 'absolute', opacity: editing ? 1 : 0 }}><NavIcon name="check" size={25} color={plusInk} /></View>
        </View>}
      </Tappable>
    </Animated.View>
  </View>;
}
