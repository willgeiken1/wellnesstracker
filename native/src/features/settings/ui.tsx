import { UnderBar } from '@/components/blur-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design/theme-provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber, stepValue, type StepOptions } from '@/components/stepper';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { t } from '@/i18n/en';
import { useAuth } from '@/auth/provider';
import { Icon, KitText, ListRow as KitListRow, NavBar, StackGapContext, SurfaceContext, Tappable, alpha, mix, useKit, type IconName, type ListRowProps } from '@/components/kit';

/* The pieces every Settings screen shares (the mockup's .st-* classes in pages/settings.js). */

/* The design's curve for small moves (`--ease`). */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
type ViewNode = ComponentRef<typeof View>;

/** The setting a search result or another page asked this page to show (`flash`): its row is brought into view and tinted. */
const FocusContext = createContext<{ focus?: string; reveal: (node: ViewNode) => void }>({ reveal: () => {} });

/** A pushed Settings screen: the bar with its back button and title, then the page scroll (16 pt sides). */
export function SetPage({ back, title, onBack, children, testID, right, large }: {
  back: string; title: string; onBack?: () => void; children: ReactNode; testID?: string; right?: ReactNode; large?: boolean;
}) {
  const k = useKit(), insets = useSafeAreaInsets();
  const [scrolled, setScrolled] = useState(false);
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // The row lands 220 pt down the screen, as the design scrolls it (the page scrolls under the bar, so that counts from the top).
  const reveal = useCallback((node: ViewNode) => {
    const inner = (scroll.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.() ?? scroll.current;
    if (!inner) return;
    try { (node as unknown as { measureLayout(to: unknown, ok: (x: number, y: number) => void, fail?: () => void): void })
      .measureLayout(inner, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 220), animated: false }), () => {}); } catch { /* stays where it is */ }
  }, []);
  const focusValue = useMemo(() => ({ focus: typeof focus === 'string' ? focus : undefined, reveal }), [focus, reveal]);
  return <View testID={testID} style={{ flex: 1, backgroundColor: k.c.bg }}>
    <UnderBar bar={<NavBar back={back} onBack={onBack} title={title} right={right} large={false} scrolled={!large || scrolled} />}>{top =>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} scrollIndicatorInsets={{ top }}
        onScroll={large ? e => setScrolled(e.nativeEvent.contentOffset.y > 46) : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 + insets.bottom, paddingTop: top }}>
        <FocusContext.Provider value={focusValue}>
          <StackGapContext.Provider value={0}><SurfaceContext.Provider value="page">{children}</SurfaceContext.Provider></StackGapContext.Provider>
        </FocusContext.Provider>
      </ScrollView>}
    </UnderBar>
  </View>;
}

/** The kit's list row, which also answers when the page was asked to show it: it scrolls into view and its tint fades away. */
export function ListRow(props: ListRowProps) {
  const f = useContext(FocusContext);
  return f.focus && (props.title ?? props.label) === f.focus ? <FlashRow {...props} /> : <KitListRow {...props} />;
}
/** `.row.st-flash`: 22 percent of the accent behind the row, held for the first third of 1.8 seconds, then eased away. */
function FlashRow(props: ListRowProps) {
  const k = useKit(), f = useContext(FocusContext), { reduceMotion } = useTheme();
  const node = useRef<ViewNode>(null), tint = useSharedValue(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (node.current) f.reveal(node.current);
      tint.value = 1;
      tint.value = reduceMotion ? withDelay(1800, withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }))
        : withDelay(630, withTiming(0, { duration: 1170, easing: EASE, reduceMotion: ReduceMotion.Never }));
    }, 420);
    return () => { clearTimeout(timer); cancelAnimation(tint); };
    // once, when the page opens on this row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fade = useAnimatedStyle(() => ({ opacity: tint.value }));
  return <View ref={node} collapsable={false}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: alpha(k.c.accent, 0.22) }, fade]} />
    <KitListRow {...props} />
  </View>;
}

/** `.st-h`: a 13.5 pt muted group header, 26 pt above (8 for the first), 8 below, 16 in. */
export function H({ children, first }: { children: string; first?: boolean }) {
  const f = useContext(FocusContext), node = useRef<ViewNode>(null), hit = !!f.focus && f.focus === children;
  useEffect(() => {
    if (!hit) return;
    const timer = setTimeout(() => { if (node.current) f.reveal(node.current); }, 420);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit]);
  return <View ref={node} collapsable={false}><KitText weight={600} size={13.5} lineHeight={1.2} tracking={0.01} color="text-muted" accessibilityRole="header"
    style={{ marginTop: first ? 8 : 26, marginBottom: 8, marginHorizontal: 16 }}>{children}</KitText></View>;
}
/** `.st-gap`: 20 pt between lists. */
export const Gap = () => <View style={{ height: 20 }} />;

/** A list surface for custom content (`.list` with no rows): 20 pt corners, the light-mode hairline edge. */
export function Panel({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const k = useKit();
  return <View testID={testID} style={[{ backgroundColor: k.cardBg, borderRadius: 20, overflow: 'hidden', boxShadow: k.cardEdge }, style]}>
    <SurfaceContext.Provider value="sheet-inset">{children}</SurfaceContext.Provider>
  </View>;
}
/** `.st-cl`: a hairline above the rows that follow custom content in a panel. */
export function Cl({ children, first }: { children: ReactNode; /** Nothing sits above it in the panel, so it draws no line. */ first?: boolean }) {
  const k = useKit();
  return <View style={first ? undefined : { borderTopWidth: 1, borderTopColor: k.c.hair }}>{children}</View>;
}

/** `.st-hero`: an intro card with a tinted icon square, a title and a line. */
export function Hero({ icon, color, title, body, tint }: { icon: IconName; color: string; title: string; body: string; tint?: boolean }) {
  const k = useKit(), c = k.tok(color);
  return <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 16, borderRadius: 20, marginTop: 8,
    backgroundColor: tint ? k.c['accent-tint'] : k.c.surface, boxShadow: tint ? undefined : k.cardEdge }}>
    <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}>
      <Icon name={icon} size={24} color={c} />
    </View>
    <View style={{ flex: 1 }}>
      <KitText weight={700} size={17} lineHeight={1.25} tracking={-0.02}>{title}</KitText>
      <KitText weight={500} size={13.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 4 }}>{body}</KitText>
    </View>
  </View>;
}

export type MenuOption<T> = { v: T; l: string };
/** A value row with ⌃⌄ that opens a menu of choices with a check on the current one (`pick` + `openMenu`, UIMenu). */
export function PickRow<T extends string | number>({ title, sub, value, options, onPick, short, testID, chevron }: {
  title: string; sub?: string; value: T; options: readonly MenuOption<T>[]; onPick: (v: T) => void; short?: (v: T) => string; testID?: string;
  /** Show a chevron instead of ⌃⌄ (the From and To rows of Delete a date range). */ chevron?: boolean;
}) {
  const k = useKit();
  const anchor = useRef<{ measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void } | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const label = short ? short(value) : options.find(o => String(o.v) === String(value))?.l ?? String(value);
  const open = () => anchor.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }));
  return <View ref={anchor as never} collapsable={false}>
    <ListRow testID={testID} title={title} sub={sub} onPress={open} accessibilityHint={label}
      value={<KitText weight={700} size={15} tracking={-0.01} numeric color="text-muted" numberOfLines={1} style={{ maxWidth: 170 }}>{label}</KitText>}
      right={chevron ? undefined : <View style={{ marginLeft: -6 }}><Icon name="updown" size={14} color={k.c.ghost} /></View>} chevron={!!chevron} />
    <Menu at={at} title={title} options={options} value={value} onClose={() => setAt(null)} onPick={v => { setAt(null); onPick(v); }} />
  </View>;
}

/**
 * `.st-menu`: 236 pt wide, its right edge 12 pt in from the row's, just under the row (above it when it would not fit),
 * a check on the current choice. It grows from the corner nearest the row while it fades in, and goes the same way.
 */
export function Menu<T extends string | number>({ at, title, options, value, onPick, onClose }: {
  at: { x: number; y: number; w: number; h: number } | null; title: string; options: readonly MenuOption<T>[]; value: T; onPick: (v: T) => void; onClose: () => void;
}) {
  const k = useKit(), { reduceMotion } = useTheme();
  const win = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // What is drawn: the menu stays up while it closes.
  const [live, setLive] = useState(at);
  const fade = useSharedValue(0), grow = useSharedValue(0.86);
  useEffect(() => {
    const never = { reduceMotion: ReduceMotion.Never } as const;
    if (at) {
      setLive(at);
      fade.value = withTiming(1, { duration: reduceMotion ? 0 : 160, easing: Easing.linear, ...never });
      grow.value = reduceMotion ? 1 : withTiming(1, { duration: 260, easing: EASE, ...never });
      return;
    }
    fade.value = withTiming(0, { duration: reduceMotion ? 0 : 160, easing: Easing.linear, ...never });
    if (!reduceMotion) grow.value = withTiming(0.86, { duration: 260, easing: EASE, ...never });
    const timer = setTimeout(() => setLive(null), reduceMotion ? 0 : 280);
    return () => clearTimeout(timer);
  }, [at, reduceMotion, fade, grow]);
  const shown = at ?? live;
  const rowH = 44, h = Math.min(396, options.length * rowH + options.length - 1);
  const screenH = height || win.height || 852;
  const below = shown ? shown.y + shown.h - 6 : 0;
  const up = !!shown && below + h > screenH - 40;
  const top = !shown ? 0 : up ? Math.max(60, shown.y - h + 6) : Math.max(60, below);
  const right = shown ? Math.max(12, win.width - (shown.x + shown.w) + 12) : 12;
  const moving = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: grow.value }] }));
  if (!shown) return null;
  // A long list opens with the current choice in view (88 pt down), as the design scrolls it.
  const current = options.findIndex(o => String(o.v) === String(value));
  const startY = options.length * (rowH + 1) - 1 > 396 && current > 0 ? Math.max(0, current * (rowH + 1) - 88) : 0;
  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <Tappable dim="none" accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1 }} onPress={onClose} onLayout={e => setHeight(e.nativeEvent.layout.height)}>
      <Animated.View accessibilityRole="menu" accessibilityLabel={title} pointerEvents={at ? 'auto' : 'none'} style={[{ position: 'absolute', top, right, width: 236, maxHeight: 396,
        borderRadius: 14, overflow: 'hidden', backgroundColor: mix(k.dark ? k.c['surface-2'] : k.c.surface, 'transparent', 0.94),
        boxShadow: k.dark ? k.lift : `${k.lift}, 0px 0px 0px 1px ${k.c.hair}`, transformOrigin: up ? 'bottom right' : 'top right' }, moving]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: startY }}>
          {options.map((o, i) => {
            const on = String(o.v) === String(value);
            return <Tappable key={String(o.v)} dim="none" accessibilityRole="menuitem" accessibilityState={{ checked: on }} accessibilityLabel={o.l}
              onPress={() => onPick(o.v)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: rowH, paddingLeft: 10, paddingRight: 16,
                borderTopWidth: i ? 1 : 0, borderTopColor: k.c['hair-2'], backgroundColor: pressed ? alpha(k.c.text, 0.08) : 'transparent' })}>
              <View style={{ width: 20, alignItems: 'center' }}>{on ? <Icon name="check" size={16} color={k.c.text} /> : null}</View>
              <KitText weight={500} size={16}>{o.l}</KitText>
            </Tappable>;
          })}
        </ScrollView>
      </Animated.View>
    </Tappable>
  </Modal>;
}

/** `.st-ud` and friends need these icons; the kit's set has them under these names. */
export const settingsIcons = { updown: 'updown', ext: 'ext' } as const;

/**
 * A stepper at the end of a Settings row (`.st .row .stepper`): the kit's control one size down so a row stays 62 pt,
 * with 36 pt buttons, a 70 pt wide value in 15.5 pt figures and the plain surface-2 pill a page list carries.
 * `format` shows the value another way (a clock for Default rest).
 */
export function RowStepper({ value, onChange, label, unit, format, testID, ...opts }: StepOptions & {
  value: number; onChange: (v: number) => void; label: string; unit?: string; format?: (v: number) => string; testID?: string;
}) {
  const k = useKit();
  const haptic = useSelectionHaptic();
  const text = format ? format(value) : formatNumber(value, opts.dec ?? 0) + (unit ? ' ' + unit : '');
  const lo = opts.min ?? 0, hi = opts.max ?? 1e9;
  const go = (d: -1 | 1) => { const v = stepValue(value, d, opts); if (v !== value) haptic(); onChange(v); };
  const button = (d: -1 | 1) => <Tappable dim="none" accessibilityRole="button" accessibilityLabel={d < 0 ? t('kitLess') : t('kitMore')}
    testID={testID ? `${testID}-${d < 0 ? 'less' : 'more'}` : undefined} onPress={() => go(d)} hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }}
    style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? k.c['hair-2'] : 'transparent' })}>
    <Icon name={d < 0 ? 'minus' : 'plus'} size={18} color={k.c.text} />
  </Tappable>;
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, padding: 3, borderRadius: 999, backgroundColor: k.c['surface-2'] }}>
    {button(-1)}
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text, min: lo, max: hi, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)} style={{ minWidth: 70 }}>
      <KitText weight={700} size={15.5} tracking={-0.015} numeric numberOfLines={1} style={{ textAlign: 'center' }}>{text}</KitText>
    </View>
    {button(1)}
  </View>;
}
/** Default rest: the row stepper with its value as a clock ("2:00"). */
export function TimeStepper({ value, onChange, label, step = 15, min = 30, max = 300 }: { value: number; onChange: (v: number) => void; label: string; step?: number; min?: number; max?: number }) {
  return <RowStepper label={label} value={value} onChange={onChange} step={step} min={min} max={max} format={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`} />;
}

/** The account state, or null where Settings opens with no account provider around it. Reads it through useAuth, which
 * both builds export (the phone-only build keeps its context private, so reading the context directly finds nothing). */
export function useOptionalAuth() {
  try { return useAuth(); } catch { return null; }
}
