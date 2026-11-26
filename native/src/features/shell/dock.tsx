import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Tappable } from '@/components/tappable';
import { DISTANCES, SPRINGS as KIT } from '@/components/kit-motion';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { shellColors } from './colors';
import { DOCK, PRESS_SCALE, SPRINGS, type DockLayout } from './geometry';
import { NavIcon } from './icons';
import { PAGES, pageLabel } from './pages';
import { useSpringPress } from './press';

type Spring = { stiffness: number; damping: number };
const springOf = (s: Spring) => ({ mass: 1, stiffness: s.stiffness, damping: s.damping });
const linear = (ms: number) => ({ duration: ms, easing: Easing.linear });

/** One number on the UI thread that glides to each new target on `spring` (the bar's tab spring), or jumps there under Reduce
 * Motion. It starts at its first target, so the bar draws in place. */
function useGlide(target: number, still: boolean, spring: Spring = SPRINGS.tab) {
  const v = useSharedValue(target);
  useEffect(() => { v.value = still ? target : withSpring(target, springOf(spring)); }, [target, still, spring, v]);
  return v;
}
/** One number that fades linearly to each new target in `ms`. */
function useFade(target: number, ms: number, still: boolean) {
  const v = useSharedValue(target);
  useEffect(() => { v.value = still ? target : withTiming(target, linear(ms)); }, [target, ms, still, v]);
  return v;
}

export interface DockProps {
  layout: DockLayout; bottom: number; active: number; open: boolean; editing: boolean;
  onTab: (index: number) => void; onHold: () => void; onPlus: () => void;
}

function Pill({ x, width, shown, dim, still }: DockLayout['pillA'] & { dim: SharedValue<number>; still: boolean }) {
  const { colors, mode } = useTheme();
  const shell = shellColors(colors, mode);
  const left = useGlide(x, still), w = useGlide(width, still), fade = useFade(shown ? 1 : 0, 180, still);
  const style = useAnimatedStyle(() => ({ width: w.value, opacity: fade.value * dim.value, transform: [{ translateX: left.value }] }));
  return <Animated.View pointerEvents="none" testID="tab-pill" style={[{ position: 'absolute', top: 0, left: 0, height: 56, borderRadius: 28,
    backgroundColor: shell.pill, boxShadow: shell.dockShadow }, style]} />;
}

/** A tab's icon: the outline in the pill's ink, or the filled twin on the accent circle. The colour change cross-fades in 180 ms
 * and the filled icon lands with a small spring (scale .78 to 1) each time its tab opens. */
function TabIcon({ name, selected, ink, onInk, still }: { name: (typeof PAGES)[number]['key']; selected: boolean; ink: string; onInk: string; still: boolean }) {
  const on = useFade(selected ? 1 : 0, 180, still);
  const grow = useGlide(selected ? 1.06 : 1, still);
  const pop = useSharedValue(1);
  const was = useRef(selected);
  useEffect(() => {
    if (selected && !was.current && !still) { pop.value = DISTANCES.popFrom; pop.value = withSpring(1, springOf(KIT.pop)); }
    was.current = selected;
  }, [selected, still, pop]);
  const offStyle = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const onStyle = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: pop.value }] }));
  const growStyle = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));
  return <Animated.View style={[{ width: 23, height: 23 }, growStyle]}>
    <Animated.View style={[{ position: 'absolute' }, offStyle]}><NavIcon name={name} color={ink} /></Animated.View>
    <Animated.View style={[{ position: 'absolute' }, onStyle]}><NavIcon name={name} on color={onInk} /></Animated.View>
  </Animated.View>;
}

function Tab({ index, x, width, shown, selected, dim, still, onTab, onHold, holdable }: DockLayout['tabs'][number] & {
  index: number; selected: boolean; dim: SharedValue<number>; still: boolean; holdable: boolean; onTab: (index: number) => void; onHold: () => void }) {
  const { colors, mode } = useTheme();
  const shell = shellColors(colors, mode);
  const page = PAGES[index], label = pageLabel(page.key);
  const left = useGlide(x, still), w = useGlide(width, still), gone = useFade(shown ? 1 : 0, 200, still), shrink = useGlide(shown ? 1 : 0.5, still);
  const press = useSpringPress(PRESS_SCALE, still);
  const style = useAnimatedStyle(() => ({ width: w.value, opacity: gone.value * dim.value, transform: [{ translateX: left.value }, { scale: shrink.value }] }));
  return <Animated.View pointerEvents={shown ? 'auto' : 'none'} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!shown}
    style={[{ position: 'absolute', top: 0, left: 0, height: 56, width }, style]}>
    <Tappable dim="none" testID={`tab-${page.route}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }}
      onPress={() => onTab(index)} onLongPress={holdable ? onHold : undefined} delayLongPress={520} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: width / 2 }}>
      <Animated.View style={press.style}>
        <TabIcon name={page.key} selected={selected} ink={shell.pillInk} onInk={colors['on-accent']} still={still} />
      </Animated.View>
    </Tappable>
  </Animated.View>;
}

/** The floating bar: the open tab stands alone as an accent circle, the tabs before and after it sit in pills on either side,
 * and the + button closes the row. When another tab opens, the circle, the pills and every tab glide to their new places on the
 * tab spring, all on the UI thread. Touch and hold a tab to choose which tabs the bar shows. */
export function Dock({ layout, bottom, active, open, editing, onTab, onHold, onPlus }: DockProps) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const still = reduceMotion;
  const dim = useFade(open ? 0.32 : 1, 180, still);
  const bubble = useGlide(layout.bubbleX, still), plusX = useGlide(layout.plusX, still);
  const turn = useGlide(open && !editing ? 1 : 0, still, SPRINGS.open);
  const check = useFade(editing ? 1 : 0, 140, still);
  const plusLabel = editing ? t('shellDoneEditing') : open ? t('shellCloseQuickActions') : t('shellQuickActions').replace('{page}', pageLabel(PAGES[active].key));
  const plusFill = editing ? colors.accent : open ? colors.text : colors.surface;
  const plusInk = editing ? colors['on-accent'] : open ? colors.bg : colors.text;
  const plusShadow = editing ? '0px 4px 10px rgba(0, 0, 0, 0.2)' : open ? '0px 6px 18px rgba(0, 0, 0, 0.28)' : shell.plusShadow;
  const fill = useSharedValue(plusFill);
  useEffect(() => { fill.value = still ? plusFill : withTiming(plusFill, linear(200)); }, [plusFill, still, fill]);
  const press = useSpringPress(PRESS_SCALE, still);
  const bubbleStyle = useAnimatedStyle(() => ({ opacity: dim.value, transform: [{ translateX: bubble.value }] }));
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ translateX: plusX.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ backgroundColor: fill.value }));
  const turnStyle = useAnimatedStyle(() => ({ opacity: 1 - check.value, transform: [{ rotate: `${turn.value * 135}deg` }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: check.value }));
  return <View pointerEvents="box-none" testID="dock" style={{ position: 'absolute', left: 0, right: 0, bottom, height: 56,
    transform: [{ scale: layout.scale }], transformOrigin: '50% 100%' }}>
    <View accessibilityRole="tablist" accessibilityLabel={t('shellTabs')} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56 }}>
      <Pill {...layout.pillA} dim={dim} still={still} />
      <Pill {...layout.pillB} dim={dim} still={still} />
      <Animated.View pointerEvents="none" testID="tab-bubble" style={[{ position: 'absolute', top: 0, left: 0, width: DOCK.ACTIVE, height: DOCK.ACTIVE, borderRadius: 28,
        backgroundColor: colors.accent, boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.18)' }, bubbleStyle]} />
      {layout.tabs.map((tab, index) => <Tab key={PAGES[index].key} index={index} {...tab} selected={index === active} dim={dim} still={still}
        holdable={!editing} onTab={onTab} onHold={onHold} />)}
    </View>
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, plusStyle]}>
      <Tappable dim="none" testID="dock-plus" accessibilityRole="button" accessibilityLabel={plusLabel} accessibilityState={{ expanded: open }} onPress={onPlus}
        onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
        <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', boxShadow: plusShadow }, fillStyle]}>
          <Animated.View style={[{ width: 25, height: 25 }, press.style]}>
            <Animated.View style={[{ position: 'absolute' }, turnStyle]}><NavIcon name="plus" size={25} color={plusInk} /></Animated.View>
            <Animated.View style={[{ position: 'absolute' }, checkStyle]}><NavIcon name="check" size={25} color={plusInk} /></Animated.View>
          </Animated.View>
        </Animated.View>
      </Tappable>
    </Animated.View>
  </View>;
}
