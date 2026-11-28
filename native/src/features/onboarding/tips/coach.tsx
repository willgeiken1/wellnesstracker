import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Button, Eyebrow, KitText, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** `--ease-push`, the glide of the spotlight and the card between targets. */
const PUSH = Easing.bezier(0.32, 0.72, 0, 1);
export const COACH_GLIDE = 420;

export interface Hole { x: number; y: number; w: number; h: number; r: number }
export type CoachKind = 'tips' | 'tour';
/** The scrim around the spotlight: darker for the first-Home tips than for the sample-data tour (`.ob-coach .hole`). */
export function scrimColor(kind: CoachKind, dark: boolean) {
  return kind === 'tips' ? (dark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(16, 18, 20, 0.42)') : (dark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(16, 18, 20, 0.26)');
}

/** Where the tip card sits: under the spotlight when it fits, otherwise over it; `below` keeps it under, clear of the bottom. */
export function cardTop(hole: Hole, cardH: number, screenH: number, side: 'auto' | 'above' | 'below') {
  const below = hole.y + hole.h + 14, above = hole.y - 14 - cardH;
  if (side === 'below') return Math.min(below, screenH - cardH - 24);
  if (side === 'above') return Math.max(60, above);
  return below + cardH < screenH - 40 ? below : Math.max(60, above);
}

/** A rectangle with a rounded hole cut out of it, for the scrim (even-odd fill). Runs on the UI thread. */
function holePath(W: number, H: number, x: number, y: number, w: number, h: number, r: number) {
  'worklet';
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M0 0H${W}V${H}H0Z` +
    `M${x + R} ${y}H${x + w - R}A${R} ${R} 0 0 1 ${x + w} ${y + R}V${y + h - R}A${R} ${R} 0 0 1 ${x + w - R} ${y + h}` +
    `H${x + R}A${R} ${R} 0 0 1 ${x} ${y + h - R}V${y + R}A${R} ${R} 0 0 1 ${x + R} ${y}Z`;
}

export interface CoachProps {
  kind: CoachKind;
  /** The spotlight in window points, already padded; null while the target is still being found. */
  hole: Hole | null;
  side: 'auto' | 'above' | 'below';
  eyebrow: string; title: string; body: string;
  index: number; count: number;
  /** The colour of the Next button: the accent for tips, the open page's colour on the tour. */
  color?: string;
  onNext: () => void;
  /** The tour's Skip tour; tips have none. */
  onSkip?: () => void;
  /** The overlay's size once laid out, for targets placed by the bar's geometry (the + and the tabs). */
  onSize?: (size: { width: number; height: number }) => void;
  /** A tap inside the spotlight, which shows a control, uses that control after moving on. */
  onHole?: () => void;
}

/**
 * Coach marks (pages/onboarding.js `.ob-coach`): a scrim over the whole screen, bar included, with a spotlight hole ringed
 * in white, and a tip card with its eyebrow, title, line, dots and buttons. The hole and the card glide between targets in
 * 0.42 s; with Reduce Motion they jump. A tap anywhere moves on. It is a modal dialog named by the tip's title.
 */
export function Coach({ kind, hole, side, eyebrow, title, body, index, count, color = 'accent', onNext, onSkip, onSize, onHole }: CoachProps) {
  const k = useKit(), { reduceMotion } = useTheme();
  const win = useWindowDimensions();
  // The overlay's own size is the space the spotlight is drawn in; until it is laid out, the window's.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const W = size?.width ?? win.width, H = size?.height ?? win.height;
  const [cardH, setCardH] = useState(0);
  const x = useSharedValue(hole?.x ?? 0), y = useSharedValue(hole?.y ?? 0), w = useSharedValue(hole?.w ?? 0), h = useSharedValue(hole?.h ?? 0), r = useSharedValue(hole?.r ?? 0);
  const top = useSharedValue(0), shown = useSharedValue(0), placed = useSharedValue(0);
  // The first place is set at once; later ones glide.
  const first = useRef(true);
  useEffect(() => { shown.value = reduceMotion ? 1 : withTiming(1, { duration: 280, easing: Easing.linear }); }, [reduceMotion, shown]);
  useEffect(() => {
    if (!hole) return;
    const move = (v: typeof x, to: number) => { v.value = first.current || reduceMotion ? to : withTiming(to, { duration: COACH_GLIDE, easing: PUSH }); };
    move(x, hole.x); move(y, hole.y); move(w, hole.w); move(h, hole.h); move(r, hole.r);
    if (cardH) { move(top, cardTop(hole, cardH, H, side)); placed.value = 1; first.current = false; }
  }, [hole, cardH, side, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrim = useAnimatedProps(() => ({ d: holePath(W, H, x.value, y.value, w.value, h.value, r.value) }));
  // The ring sits 4 pt outside the hole, 1.5 pt of white at 70 percent.
  const ring = useAnimatedStyle(() => ({ left: x.value - 5.5, top: y.value - 5.5, width: w.value + 11, height: h.value + 11,
    borderRadius: Math.min(r.value, (w.value + 11) / 2, (h.value + 11) / 2) + 1.5 }));
  const card = useAnimatedStyle(() => ({ top: top.value, opacity: placed.value }));
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const last = index === count - 1;
  const tapAnywhere = { onStartShouldSetResponder: () => true, onResponderRelease: (e: GestureResponderEvent) => {
    const { locationX: px, locationY: py } = e.nativeEvent;
    const inside = !!hole && px >= hole.x && px <= hole.x + hole.w && py >= hole.y && py <= hole.y + hole.h;
    onNext();
    if (inside && onHole) onHole();
  } };
  const next = last ? t(kind === 'tour' ? 'obaStartExploring' : 'obaGotIt') : t('obaNext');
  return <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onNext}>
    <Animated.View testID={`coach-${kind}`} style={[StyleSheet.absoluteFill, fade]} accessibilityViewIsModal
      onLayout={e => { const { width, height } = e.nativeEvent.layout; if (width !== size?.width || height !== size?.height) { setSize({ width, height }); onSize?.({ width, height }); } }}>
      {/* A tap anywhere moves on, as in the design; it isn't a control of its own, so it takes the touch without a look. */}
      <View testID="coach-scrim" accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} {...tapAnywhere}>
        {hole ? <Svg width={W} height={H} style={StyleSheet.absoluteFill}><AnimatedPath animatedProps={scrim} fill={scrimColor(kind, k.dark)} fillRule="evenodd" /></Svg>
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor(kind, k.dark) }]} />}
        {hole ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.7)' }, ring]} /> : null}
      </View>
      <Animated.View testID="coach-card" accessibilityLabel={title} onLayout={e => { const v = Math.ceil(e.nativeEvent.layout.height); if (v !== cardH) setCardH(v); }}
        style={[{ position: 'absolute', left: 16, right: 16, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12, borderRadius: 20,
          backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, boxShadow: k.lift }, card]}>
        <View {...tapAnywhere}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <KitText weight={700} size={18} lineHeight={1.2} tracking={-0.02} accessibilityRole="header" style={{ marginTop: 8 }}>{title}</KitText>
          <KitText weight={500} size={14.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 6 }}>{body}</KitText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
          <View testID="coach-dots" accessible={false} style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: count }, (_, i) => <View key={i} testID={i === index ? 'coach-dot-on' : undefined}
              style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? k.c.accent : k.c['hair-2'] }} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {onSkip && !last ? <Button testID="coach-skip" size="sm" variant="plain" color="text-muted" label={t('obaSkipTour')} onPress={onSkip} /> : null}
            <Button testID="coach-next" size="sm" color={color} label={next} onPress={onNext} />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  </Modal>;
}
