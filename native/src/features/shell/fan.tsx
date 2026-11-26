import { useEffect, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { alpha, mix, shellColors } from './colors';
import { ITEM_PRESS_SCALE, labelOffset, layoutArc, SPRINGS } from './geometry';
import { ActionIcon, type ActionIconName } from './icons';
import { useSpringPress } from './press';
import Reanimated from 'react-native-reanimated';
import type { PageColor } from './pages';

export interface FanAction { id: string; label: string; hint: string; icon: ActionIconName }
export interface FanProps {
  open: boolean; width: number; height: number; plus: { x: number; y: number };
  pageLabel: string; color: PageColor; actions: FanAction[];
  onRun: (action: FanAction) => void; onCustomize: () => void; onClose: () => void;
}
const CLOSE = Easing.bezier(0.4, 0, 0.7, 0.2);

/** The scrim behind the arc: the page dims and a tap anywhere closes the actions. */
export function Scrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, mode, reduceMotion } = useTheme();
  const fade = useState(() => new Animated.Value(open ? 1 : 0))[0];
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    Animated.timing(fade, { toValue: open ? 1 : 0, duration: reduceMotion ? 0 : 200, easing: Easing.linear, useNativeDriver: false })
      .start(({ finished }) => { if (finished && !open) setShown(false); });
  }, [open, fade, reduceMotion]);
  if (!shown) return null;
  return <Animated.View testID="fan-scrim" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade, backgroundColor: shellColors(colors, mode).scrim }}>
    <Tappable dim="none" accessible={false} onPress={onClose} style={{ flex: 1 }} />
  </Animated.View>;
}

function Item({ action, index, count, open, x, y, from, width, color, first, onRun }: {
  action: FanAction; index: number; count: number; open: boolean; x: number; y: number; from: { x: number; y: number }; width: number;
  color: string; first: boolean; onRun: () => void }) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const travel = useState(() => new Animated.Value(reduceMotion ? 1 : 0))[0], fade = useState(() => new Animated.Value(0))[0];
  const [label, setLabel] = useState<{ w: number; h: number } | null>(null);
  const press = useSpringPress(ITEM_PRESS_SCALE, reduceMotion);
  useEffect(() => {
    if (reduceMotion) {
      travel.setValue(1);
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: open ? 140 : 120, easing: Easing.linear, useNativeDriver: false }).start();
      return;
    }
    const delay = open ? index * 32 : (count - 1 - index) * 18;
    if (open) Animated.parallel([
      Animated.sequence([Animated.delay(delay), Animated.spring(travel, { toValue: 1, ...SPRINGS.open, mass: 1, useNativeDriver: false })]),
      Animated.sequence([Animated.delay(delay), Animated.timing(fade, { toValue: 1, duration: 140, easing: Easing.linear, useNativeDriver: false })]),
    ]).start();
    else Animated.parallel([
      Animated.timing(travel, { toValue: 0, duration: 190, delay, easing: CLOSE, useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 190, delay, easing: CLOSE, useNativeDriver: false }),
    ]).start();
  }, [open, index, count, reduceMotion, travel, fade]);
  const tint = first ? color : mix(color, shell.dark ? 0.17 : 0.1, colors.surface);
  const ink = first ? (shell.dark ? colors.bg : colors['on-accent']) : color;
  const place = label ? labelOffset(width, x, label.w) : { left: 62, side: 'r' as const };
  const measure = (e: LayoutChangeEvent) => { const { width: w, height: h } = e.nativeEvent.layout; if (!label || label.w !== w || label.h !== h) setLabel({ w, h }); };
  return <Animated.View pointerEvents={open ? 'box-none' : 'none'} style={{ position: 'absolute', left: 0, top: 0, width: 52, height: 52, opacity: fade,
    transform: [
      { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [from.x, x] }) },
      { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [from.y, y] }) },
      { scale: travel.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
    ] }}>
    <Tappable dim="none" testID={`fan-${action.id}`} accessibilityRole="menuitem" accessibilityLabel={`${action.label}, ${action.hint}`} onPress={onRun}
      onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Reanimated.View style={[{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: tint,
        boxShadow: first ? shell.lift : `inset 0px 0px 0px 1px ${alpha(color, 0.3)}, ${shell.lift}` }, press.style]}>
        <ActionIcon name={action.icon} color={ink} />
      </Reanimated.View>
    </Tappable>
    <Tappable dim="none" accessible={false} onPress={onRun} onLayout={measure} hitSlop={10}
      style={({ pressed }) => ({ position: 'absolute', left: place.left, top: label ? 26 - label.h / 2 : 0, opacity: label ? 1 : 0,
        alignItems: place.side === 'l' ? 'flex-end' : 'flex-start', paddingTop: 6, paddingBottom: 7, paddingHorizontal: 12, borderRadius: 14,
        backgroundColor: colors.surface, boxShadow: `inset 0px 0px 0px ${pressed ? 1.5 : 1}px ${pressed ? colors.accent : colors.hair}, ${shell.lift}`,
        transform: [{ scale: pressed ? 1.03 : 1 }] })}>
      <ThemedText numberOfLines={1} style={{ fontFamily: tokens.font.bodyStrong, fontSize: 14, lineHeight: 16.1, color: colors.text, textAlign: place.side === 'l' ? 'right' : 'left' }}>{action.label}</ThemedText>
      <ThemedText numberOfLines={1} style={{ marginTop: 1, fontFamily: tokens.font.body, fontSize: tokens.type.caption, lineHeight: 16, color: colors['text-muted'], textAlign: place.side === 'l' ? 'right' : 'left' }}>{action.hint}</ThemedText>
    </Tappable>
  </Animated.View>;
}

/** The + button's quick actions, swept up an arc from the button, with the page's name and Customize above them. */
export function Fan({ open, width, height, plus, pageLabel, color, actions, onRun, onCustomize }: FanProps) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const c = colors[color];
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const cap = useState(() => new Animated.Value(0))[0], rise = useState(() => new Animated.Value(8))[0];
  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(cap, { toValue: 1, duration: reduceMotion ? 0 : 220, delay: reduceMotion ? 0 : 80, easing: Easing.linear, useNativeDriver: false }),
        reduceMotion ? Animated.timing(rise, { toValue: 0, duration: 0, useNativeDriver: false })
          : Animated.sequence([Animated.delay(40), Animated.spring(rise, { toValue: 0, ...SPRINGS.open, mass: 1, useNativeDriver: false })]),
      ]).start();
      return;
    }
    const left = reduceMotion ? 120 : 190 + Math.max(0, actions.length - 1) * 18;
    Animated.parallel([
      Animated.timing(cap, { toValue: 0, duration: reduceMotion ? 0 : 180, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(rise, { toValue: 8, duration: reduceMotion ? 0 : 190, easing: CLOSE, useNativeDriver: false }),
    ]).start();
    const timer = setTimeout(() => setMounted(false), left);
    return () => clearTimeout(timer);
  }, [open, cap, rise, reduceMotion, actions.length]);
  if (!mounted) return null;
  const arc = layoutArc(width, height, plus, actions.length);
  return <View pointerEvents="box-none" accessibilityRole="menu" accessibilityLabel={t('shellQuickActions').replace('{page}', pageLabel)} testID="fan"
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
    <Animated.View pointerEvents={open ? 'box-none' : 'none'} style={{ position: 'absolute', right: 16, bottom: arc.captionBottom, flexDirection: 'row', alignItems: 'center', gap: 10,
      opacity: cap, transform: [{ translateY: rise }] }}>
      <ThemedText style={{ fontFamily: tokens.font.heading, fontSize: tokens.type.caption, color: c }}>{pageLabel}</ThemedText>
      <Tappable dim="fill" testID="fan-customize" accessibilityRole="menuitem" accessibilityLabel={t('shellCustomize')} onPress={onCustomize} hitSlop={{ top: 6, bottom: 6 }}
        style={{ minHeight: 34, paddingLeft: 10, paddingRight: 13, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7,
          backgroundColor: colors.surface, boxShadow: `inset 0px 0px 0px 1px ${colors['hair-2']}, ${shell.lift}` }}>
        <ActionIcon name="sliders2" size={15} color={colors['text-muted']} />
        <ThemedText style={{ fontFamily: tokens.font.bodyStrong, fontSize: 13, color: colors.text }}>{t('shellCustomize')}</ThemedText>
      </Tappable>
    </Animated.View>
    {actions.map((action, i) => <Item key={action.id} action={action} index={i} count={actions.length} open={open} {...arc.items[i]} width={width}
      color={c} first={i === 0} onRun={() => onRun(action)} />)}
  </View>;
}
