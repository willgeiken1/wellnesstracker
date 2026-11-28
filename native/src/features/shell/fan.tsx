import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { blurIntensity, useReduceTransparency } from '@/components/blur-bar';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { capitals, font } from '@/components/kit-style';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { alpha, mix, shellColors } from './colors';
import { fitHint, ITEM_PRESS_SCALE, LABEL_TYPE, labelPlace, layoutArc, SPRINGS } from './geometry';
import { ActionIcon, type ActionIconName } from './icons';
import { useSpringPress } from './press';
import Reanimated from 'react-native-reanimated';
import type { PageColor } from './pages';

/** `hint` is the full line under the name; `hints`, when given, lists it and its shorter forms, longest first, so the arc can
 * use the fullest one that fits beside its button. */
export interface FanAction { id: string; label: string; hint: string; hints?: readonly string[]; icon: ActionIconName }
export interface FanProps {
  open: boolean; width: number; height: number; plus: { x: number; y: number };
  pageLabel: string; color: PageColor; actions: FanAction[];
  onRun: (action: FanAction) => void; onCustomize: () => void; onClose: () => void;
}
const CLOSE = Easing.bezier(0.4, 0, 0.7, 0.2);

/** The scrim's blur, as the kit's `.qa-scrim` draws it (`backdrop-filter: blur(14px)`), so the page's own text never reads
 * through next to the arc's labels. */
export const SCRIM_BLUR = 14;
/** The scrim behind the arc: the page blurs and dims, and a tap anywhere closes the actions. With Reduce Transparency on,
 * or where the system can't blur, the dim colour alone. */
export function Scrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, mode, reduceMotion } = useTheme();
  const reduce = useReduceTransparency(), blur = Platform.OS === 'ios' && !reduce;
  const fade = useState(() => new Animated.Value(open ? 1 : 0))[0];
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    Animated.timing(fade, { toValue: open ? 1 : 0, duration: reduceMotion ? 0 : 200, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !open) setShown(false); });
  }, [open, fade, reduceMotion]);
  if (!shown) return null;
  // Once closing starts it lets taps through, so the page under it answers while it fades.
  return <Animated.View testID="fan-scrim" pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade, backgroundColor: blur ? undefined : shellColors(colors, mode).scrim }}>
    {blur ? <View pointerEvents="none" testID="fan-scrim-blur" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <BlurView intensity={blurIntensity(SCRIM_BLUR)} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: shellColors(colors, mode).scrim }]} />
    </View> : null}
    <Tappable dim="none" accessible={false} onPress={onClose} style={{ flex: 1 }} />
  </Animated.View>;
}

function Item({ action, index, count, open, x, y, from, width, color, first, onRun }: {
  action: FanAction; index: number; count: number; open: boolean; x: number; y: number; from: { x: number; y: number }; width: number;
  color: string; first: boolean; onRun: () => void }) {
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  const travel = useState(() => new Animated.Value(reduceMotion ? 1 : 0))[0], fade = useState(() => new Animated.Value(0))[0];
  const [labelH, setLabelH] = useState<number | null>(null);
  const press = useSpringPress(ITEM_PRESS_SCALE, reduceMotion);
  useEffect(() => {
    if (reduceMotion) {
      travel.setValue(1);
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: open ? 140 : 120, easing: Easing.linear, useNativeDriver: true }).start();
      return;
    }
    const delay = open ? index * 32 : (count - 1 - index) * 18;
    if (open) Animated.parallel([
      Animated.sequence([Animated.delay(delay), Animated.spring(travel, { toValue: 1, ...SPRINGS.open, mass: 1, useNativeDriver: true })]),
      Animated.sequence([Animated.delay(delay), Animated.timing(fade, { toValue: 1, duration: 140, easing: Easing.linear, useNativeDriver: true })]),
    ]).start();
    else Animated.parallel([
      Animated.timing(travel, { toValue: 0, duration: 190, delay, easing: CLOSE, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 190, delay, easing: CLOSE, useNativeDriver: true }),
    ]).start();
  }, [open, index, count, reduceMotion, travel, fade]);
  const tint = first ? color : mix(color, shell.dark ? 0.17 : 0.1, colors.surface);
  const ink = first ? (shell.dark ? colors.bg : colors['on-accent']) : color;
  // Only the top action's name goes on the left; the rest sit on the right, each in the room its row leaves.
  const place = labelPlace(width, x, index === count - 1), left = place.side === 'l';
  const hint = fitHint(action.label, action.hints?.length ? action.hints : [action.hint], place.room);
  const measure = (e: LayoutChangeEvent) => { const h = e.nativeEvent.layout.height; if (h !== labelH) setLabelH(h); };
  const fit = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 } as const;
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
    {/* The name sits in a box exactly as wide as the room on its side, and its bubble takes its own width inside it, so a name
        can never reach across its own button or off the screen. Text that would not fit shrinks a little instead of being cut. */}
    <View testID={`fan-${action.id}-label`} pointerEvents="box-none" style={{ position: 'absolute', top: labelH == null ? 0 : 26 - labelH / 2,
      left: left ? -LABEL_TYPE.gap - place.room : 52 + LABEL_TYPE.gap, width: place.room, alignItems: left ? 'flex-end' : 'flex-start' }}>
    <Tappable dim="none" accessible={false} onPress={onRun} onLayout={measure} hitSlop={10}
      style={({ pressed }) => ({ opacity: labelH == null ? 0 : 1, maxWidth: place.room,
        alignItems: left ? 'flex-end' : 'flex-start', paddingTop: 6, paddingBottom: 7, paddingHorizontal: LABEL_TYPE.padX, borderRadius: 14,
        backgroundColor: colors.surface, boxShadow: `inset 0px 0px 0px ${pressed ? 1.5 : 1}px ${pressed ? colors.accent : colors.hair}, ${shell.lift}`,
        transform: [{ scale: pressed ? 1.03 : 1 }] })}>
      <ThemedText {...fit} style={{ fontFamily: tokens.font.bodyStrong, fontSize: LABEL_TYPE.name, lineHeight: 16.1, color: colors.text, textAlign: left ? 'right' : 'left' }}>{action.label}</ThemedText>
      <ThemedText {...fit} style={{ marginTop: 1, fontFamily: tokens.font.body, fontSize: LABEL_TYPE.hint, lineHeight: 16, color: colors['text-muted'], textAlign: left ? 'right' : 'left' }}>{hint}</ThemedText>
    </Tappable>
    </View>
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
        Animated.timing(cap, { toValue: 1, duration: reduceMotion ? 0 : 220, delay: reduceMotion ? 0 : 80, easing: Easing.linear, useNativeDriver: true }),
        reduceMotion ? Animated.timing(rise, { toValue: 0, duration: 0, useNativeDriver: true })
          : Animated.sequence([Animated.delay(40), Animated.spring(rise, { toValue: 0, ...SPRINGS.open, mass: 1, useNativeDriver: true })]),
      ]).start();
      return;
    }
    const left = reduceMotion ? 120 : 190 + Math.max(0, actions.length - 1) * 18;
    Animated.parallel([
      Animated.timing(cap, { toValue: 0, duration: reduceMotion ? 0 : 180, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 8, duration: reduceMotion ? 0 : 190, easing: CLOSE, useNativeDriver: true }),
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
      <ThemedText testID="fan-page" style={[font(700, 11, 13 / 11, 0.14), capitals, { color: c }]}>{pageLabel}</ThemedText>
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
