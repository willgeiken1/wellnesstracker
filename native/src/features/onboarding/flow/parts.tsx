import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View, useWindowDimensions, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, ReduceMotion, withTiming, type EntryExitAnimationFunction } from 'react-native-reanimated';
import { Icon, KitText, PressScale, Tappable, alpha, font, mix, tabular, useKit, type IconName } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import { t } from '@/i18n/en';
import { ObIcon, type ObIconName } from './icons';
import { Peak } from './peak';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const never = { reduceMotion: ReduceMotion.Never } as const;
/** A step's body and buttons as they arrive: fade in and rise 8 pt over 0.36 s; Reduce Motion: a 0.2 s fade. */
export function stepEntering(reduced: boolean): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return reduced
      ? { initialValues: { opacity: 0 }, animations: { opacity: withTiming(1, { duration: 200, easing: Easing.linear, ...never }) } }
      : { initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
        animations: { opacity: withTiming(1, { duration: 360, easing: EASE, ...never }), transform: [{ translateY: withTiming(0, { duration: 360, easing: EASE, ...never }) }] } };
  };
}

/**
 * Every setup step's frame: the top bar (Back, the mountain, an empty cell) stays put while the body and the buttons
 * below it change. The buttons sit at the bottom, and the page fades into the background over 22 pt above them.
 */
export function Frame({ stepKey, back, onBack, frac, glow, screenLabel, children, cta }: {
  stepKey: string; back: string; onBack: () => void; frac: number; glow: string; screenLabel: string; children: ReactNode; cta: ReactNode;
}) {
  const k = useKit(), insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // A new step starts at its top.
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [stepKey]);
  return <View style={{ flex: 1, backgroundColor: k.c.bg, paddingTop: insets.top }} accessibilityLabel={screenLabel}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64, marginHorizontal: 10 }}>
      <Tappable dim="fill" testID="onboarding-back" accessibilityRole="button" accessibilityLabel={back} onPress={onBack}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={22} color={k.c.accent} />
      </Tappable>
      <View style={{ flex: 1, alignItems: 'center', marginTop: -2 }}>
        <Peak testID="onboarding-progress" frac={frac} color={glow} label={t('obbProgress').replace('{n}', String(Math.round(frac * 100)))} />
      </View>
      <View style={{ width: 44 }} />
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} testID="screen-scroll" keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, flexGrow: 1 }}>
        <Animated.View key={stepKey} entering={stepEntering(k.reduceMotion)}>{children}</Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 34, backgroundColor: k.c.bg }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -22, height: 22 }}>
          <Svg width="100%" height={22}>
            <Defs><LinearGradient id="obFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={k.c.bg} stopOpacity={0} /><Stop offset="1" stopColor={k.c.bg} stopOpacity={1} /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height={22} fill="url(#obFade)" />
          </Svg>
        </View>
        <Animated.View key={stepKey} entering={stepEntering(k.reduceMotion)} style={{ gap: 4 }}>{cta}</Animated.View>
      </View>
    </KeyboardAvoidingView>
  </View>;
}

/** The step's eyebrow, title and lede. */
export function Head({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return <View>
    <KitText weight={700} size={11.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{eyebrow}</KitText>
    <Balanced key={title} text={title} />
    {lede ? <KitText weight={500} size={15.5} lineHeight={1.5} color="text-muted" style={{ marginTop: 10 }}>{lede}</KitText> : null}
  </View>;
}

/**
 * The step title. The design balances its lines (`text-wrap: balance`), so a two-line title never leaves one short word
 * below. The web build has that style; on the phone the first layout's two lines set a narrower width once.
 */
function Balanced({ text }: { text: string }) {
  const [max, setMax] = useState<number | undefined>(undefined);
  const done = useRef(false);
  return <KitText accessibilityRole="header" weight={700} size={30} lineHeight={1.1} tracking={-0.035}
    style={[{ marginTop: 10, maxWidth: max }, Platform.OS === 'web' ? ({ textWrapStyle: 'balance' } as object) : null]}
    onTextLayout={e => {
      if (done.current || Platform.OS === 'web') return;
      done.current = true;
      const lines = e.nativeEvent.lines;
      if (lines.length === 2 && lines[1].width < lines[0].width * 0.75) setMax(Math.ceil((lines[0].width + lines[1].width) / 2) + 12);
    }}>{text}</KitText>;
}

/** The muted label over a group (`.ob-lbl`, `.ob-sech`). */
export function Label({ children, style, nativeID }: { children: string; style?: ViewStyle; nativeID?: string }) {
  return <View style={[{ marginTop: 22, marginHorizontal: 4, marginBottom: 8 }, style]}><KitText nativeID={nativeID} weight={600} size={13} color="text-muted">{children}</KitText></View>;
}

/** A surface with the card edge in light mode. */
export function useSurface(radius: number): ViewStyle {
  const k = useKit();
  return { backgroundColor: k.c.surface, borderRadius: radius, boxShadow: k.cardEdge };
}

/** The radio or check disc (or square) at the end of a choice. */
export function Mark({ on, square = false, color, size = 22 }: { on: boolean; square?: boolean; color?: string; size?: number }) {
  const k = useKit(), c = color ?? k.c.accent;
  return <View style={{ width: size, height: size, borderRadius: square ? 7 : size / 2, borderWidth: 2, borderColor: on ? (square ? 'transparent' : c) : k.c['hair-2'],
    backgroundColor: on ? c : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
    {on ? <Icon name="check" size={size === 24 ? 14 : 13} color={k.c['on-accent']} /> : null}
  </View>;
}

/**
 * `.ob-opt`: a choice tile with a title, an optional line and the mark at the right. `kind` radio draws the accent
 * ring when chosen; `toggle` (the habits) only tints it. An `icon` puts the 32 pt tinted tile on the left.
 */
export function Option({ title, sub, on, onPress, kind = 'radio', height = 62, icon, iconColor, testID, pad }: {
  title: string; sub?: string; on: boolean; onPress: () => void; kind?: 'radio' | 'toggle'; height?: number;
  icon?: { kit?: IconName; ob?: ObIconName }; iconColor?: string; testID?: string; pad?: number;
}) {
  const k = useKit(), base = useSurface(16);
  // As the design draws it: the accent ring marks a chosen tile in dark; in light the tile keeps its card edge and the tint.
  const ring = on && kind === 'radio' && k.dark;
  const bg = on ? mix(k.c.accent, k.c.surface, kind === 'radio' ? 0.1 : 0.09) : k.c.surface;
  const ic = iconColor ?? k.c.sleep;
  return <PressScale testID={testID} accessibilityRole={kind === 'radio' ? 'radio' : 'button'} accessibilityLabel={sub ? `${title}, ${sub}` : title}
    accessibilityState={kind === 'radio' ? { checked: on } : { selected: on }} onPress={onPress}
    style={[base, { minHeight: height, paddingVertical: pad ?? 10, paddingLeft: icon ? 12 : 14, paddingRight: 40, justifyContent: 'center', backgroundColor: bg },
      ring ? { boxShadow: `0px 0px 0px 2px ${k.c.accent}` } : null, icon ? { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' } : { gap: 2 }]}>
    {icon ? <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(ic, 0.16) }}>
      {icon.ob ? <ObIcon name={icon.ob} size={18} color={ic} /> : icon.kit ? <Icon name={icon.kit} size={18} color={ic} /> : null}
    </View> : null}
    <KitText weight={600} size={15} lineHeight={1.25} tracking={-0.01} style={icon ? { flex: 1 } : undefined}>{title}</KitText>
    {sub ? <KitText weight={500} size={12.5} lineHeight={1.3} color="text-muted">{sub}</KitText> : null}
    <View style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}><Mark on={on} square={kind === 'toggle'} /></View>
  </PressScale>;
}

/** `.field` at a fixed 62 pt: a label over a 19 pt value. Holds an input, or a value that opens a menu. */
export function BoxField({ label, children, style }: { label: string; children: ReactNode; style?: ViewStyle }) {
  const base = useSurface(14);
  return <View style={[base, { height: 62, paddingVertical: 10, paddingHorizontal: 14 }, style]}>
    <KitText weight={600} size={12} color="text-muted">{label}</KitText>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 27, gap: 6 }}>{children}</View>
  </View>;
}
/** A number input inside a BoxField, with its unit. */
export function NumberInput({ unit, ...input }: TextInputProps & { unit: string }) {
  const k = useKit();
  return <>
    <TextInput {...input} allowFontScaling maxFontSizeMultiplier={1.4} placeholder="0" placeholderTextColor={k.c.ghost} selectionColor={k.c.accent} cursorColor={k.c.accent}
      style={[font(700, 19, undefined, -0.015), tabular, { flex: 1, minWidth: 0, color: k.c.text, paddingTop: 3, paddingBottom: 0, paddingHorizontal: 0 }]} />
    <KitText weight={600} size={14} color="text-muted" style={{ alignSelf: 'flex-end', marginBottom: 2 }}>{unit}</KitText>
  </>;
}

export interface MenuOption<T> { v: T; l: string }
/** A field that opens a small menu of choices (Height, Sex), with a check on the current one. */
export function MenuField<T extends string | number>({ label, a11y, value, placeholder, options, current, onPick, testID }: {
  label: string; a11y: string; value: string; placeholder: string; options: readonly MenuOption<T>[]; current: T; onPick: (v: T) => void; testID?: string;
}) {
  const k = useKit(), base = useSurface(14);
  const anchor = useRef<{ measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void } | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  return <View ref={anchor as never} collapsable={false} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
    <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={label}
      onPress={() => anchor.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }))}
      style={[base, { height: 62, paddingVertical: 10, paddingHorizontal: 14 }]}>
      <KitText weight={600} size={12} color="text-muted">{label}</KitText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 27 }}>
        {value ? <KitText weight={700} size={19} tracking={-0.015} numeric style={{ paddingTop: 3 }}>{value}</KitText>
          : <KitText weight={600} size={17} color="ghost" style={{ paddingTop: 3 }}>{placeholder}</KitText>}
        <Icon name="updown" size={14} color={k.c.ghost} />
      </View>
    </PressScale>
    <Popover at={at} label={label} options={options} current={current} onClose={() => setAt(null)} onPick={v => { setAt(null); onPick(v); }} />
  </View>;
}

/** `.ob-menu`: 220 pt wide under the field (above it when it would not fit), the current choice ticked and in view. */
function Popover<T extends string | number>({ at, label, options, current, onPick, onClose }: {
  at: { x: number; y: number; w: number; h: number } | null; label: string; options: readonly MenuOption<T>[]; current: T; onPick: (v: T) => void; onClose: () => void;
}) {
  const k = useKit(), win = useWindowDimensions();
  if (!at) return null;
  const rowH = 44, h = Math.min(340, options.length * (rowH + 1) - 1);
  let top = at.y + at.h + 6;
  if (top + h > win.height - 30) top = Math.max(60, at.y - h - 6);
  const left = Math.min(win.width - 236, Math.max(16, at.x));
  const i = options.findIndex(o => String(o.v) === String(current));
  const startY = options.length * (rowH + 1) > 340 && i > 0 ? Math.max(0, i * (rowH + 1) - 132) : 0;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <Tappable dim="none" accessibilityRole="button" accessibilityLabel={t('obbBack')} style={{ flex: 1 }} onPress={onClose}>
      <View accessibilityRole="menu" accessibilityLabel={label} style={{ position: 'absolute', top, left, width: 220, maxHeight: 340, borderRadius: 14, overflow: 'hidden',
        backgroundColor: mix(k.dark ? k.c['surface-2'] : k.c.surface, 'transparent', 0.94), boxShadow: k.dark ? k.lift : `${k.lift}, 0px 0px 0px 1px ${k.c.hair}` }}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: startY }}>
          {options.map((o, n) => {
            const on = String(o.v) === String(current);
            return <Tappable key={String(o.v)} dim="none" accessibilityRole="menuitem" accessibilityState={{ checked: on }} accessibilityLabel={o.l} onPress={() => onPick(o.v)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: rowH, paddingLeft: 10, paddingRight: 16,
                borderTopWidth: n ? 1 : 0, borderTopColor: k.c['hair-2'], backgroundColor: pressed ? alpha(k.c.text, 0.08) : 'transparent' })}>
              <View style={{ width: 20, alignItems: 'center' }}>{on ? <Icon name="check" size={16} color={k.c.text} /> : null}</View>
              <KitText weight={500} size={16}>{o.l}</KitText>
            </Tappable>;
          })}
        </ScrollView>
      </View>
    </Tappable>
  </Modal>;
}

/** The kit's ±50 stepper without its number (the calories show above it): two 38 pt buttons on a pill. */
export function KcalStepper({ onStep, label }: { onStep: (d: -1 | 1) => void; label: string }) {
  const k = useKit();
  const b = (d: -1 | 1) => <Tappable dim="none" accessibilityRole="button" accessibilityLabel={`${d < 0 ? t('kitLess') : t('kitMore')}, ${label}`}
    testID={`onboarding-kcal-${d < 0 ? 'less' : 'more'}`} onPress={() => onStep(d)} hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }}
    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? k.c['hair-2'] : 'transparent' })}>
    <Icon name={d < 0 ? 'minus' : 'plus'} size={18} color={k.c.text} />
  </Tappable>;
  return <View style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 999, backgroundColor: k.c['surface-2'] }}>{b(-1)}{b(1)}</View>;
}
