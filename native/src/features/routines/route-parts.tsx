import { useEffect, useState, type ReactNode } from 'react';
import { TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, useNavigation, type NativeStackNavigationOptions } from 'expo-router';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { EmptyState, Icon, KitText, Sheet, SheetHeader, Tappable, alpha, font, useKit } from '@/components/kit';
import { GRABBER_ROOM } from '@/components/sheet';
import { largeSheet } from '../navigation/presentation';
import { capitals } from '@/components/kit-style';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { nudge, pretty, parseAmt, smallSteps, stepsFor } from './model';

/* The frame and the small parts the Routines sheets share (`.rt-sheet` and friends in the mockup). */

/** Native form sheet options for the Routines sheets: all open large. */
export const sheetOptions: NativeStackNavigationOptions = { ...largeSheet, contentStyle: { flex: 1 } };

/** Whether this screen was opened cold (a link or a widget), with nothing under it to go back to. */
export function useCold() {
  const navigation = useNavigation(), [cold, setCold] = useState(false);
  useEffect(() => {
    const check = () => setCold(!navigation.canGoBack());
    check();
    return navigation.addListener('state', check);
  }, [navigation]);
  return cold;
}

/** Shown when there is no account or demo to read from. Opened cold, it offers Close. */
export function NoRoutines() {
  const k = useKit(), cold = useCold();
  return <View style={{ flex: 1, backgroundColor: k.sheetBg }}>
    {cold ? <View style={{ paddingHorizontal: 16 }}><SheetHeader left={t('routinesClose')} onLeft={() => router.replace('/routines')} /></View> : null}
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <EmptyState icon="routines" color="sleep" title={t('routinesTitle')} description={t('routinesSignedOut')} />
    </View>
  </View>;
}

/** The sheet colours the mockup names `--rt-*`: a well under the sheet, a raised fill, and the ink on a coloured card. */
export function useRt() {
  const k = useKit(), c = k.c, onAccent = c['on-accent'];
  return {
    well: k.dark ? c.bg : c.surface, raised: k.dark ? c['surface-2'] : c.surface,
    ink: onAccent, inkm: alpha(onAccent, k.dark ? 0.72 : 0.84),
    glass: `rgba(255,255,255,${k.dark ? 0.42 : 0.17})`,
    /** The track under a unit row and the Clear pill. */ shade: k.dark ? 'rgba(20,20,20,0.1)' : 'rgba(255,255,255,0.16)',
    /** Light mode rings the wells with a hairline. */ edge: k.dark ? undefined : `0 0 0 1px ${c.hair}`,
    dark: k.dark,
  };
}

/** A Routines sheet: the big title with a round close button pinned at the top, then the blocks 16 pt apart. */
export function RtSheet({ header, children, testID }: { header: ReactNode; children: ReactNode; testID?: string }) {
  // The mockup keeps its header inside the 16 pt grid, so the first block sits a gap below it.
  return <Sheet header={header} gap={16} testID={testID}><View />{children}</Sheet>;
}

/** The sheet's title row (`.rt-shd`): 700 24 pt, a 32 pt close button, and an optional back link above the title. */
export function SheetTitle({ title, onClose, back, onBack, size = 24, closeLabel, top }: {
  title: string; onClose: () => void; back?: string; onBack?: () => void; size?: number; closeLabel?: string;
  /** Line the title up with the top of the close button instead of its middle (the converter's header). */ top?: boolean;
}) {
  const k = useKit(), rt = useRt();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: back || top ? 'flex-start' : 'center', gap: 12,
    paddingTop: 10 + GRABBER_ROOM, paddingBottom: 8, backgroundColor: k.sheetBg }}>
    <View style={{ gap: 2, flexShrink: 1 }}>
      {back ? <Tappable dim="text" accessibilityRole="button" accessibilityLabel={back} onPress={onBack ?? onClose}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}>
        <Icon name="back" size={18} color={k.c.accent} /><KitText weight={700} size={14} color="accent">{back}</KitText>
      </Tappable> : null}
      <KitText weight={700} size={size} tracking={-0.03} accessibilityRole="header" style={{ marginTop: back ? 4 : 0 }}>{title}</KitText>
    </View>
    <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={closeLabel ?? t('routinesClose')} onPress={onClose} hitSlop={6}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: rt.raised, alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 1px ${k.c.hair}` }}>
      <Icon name="close" size={16} color={k.c['text-muted']} />
    </Tappable>
  </View>;
}

/** A block's caps label (`.rt-lbx`), with an optional note at the right such as Optional. */
export function Lbx({ children, right, color }: { children: string; right?: string; color?: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <KitText weight={700} size={11} tracking={0.15} color={color ?? 'text-muted'} style={capitals}>{children}</KitText>
    {right ? <KitText weight={600} size={11.5} color="text-muted">{right}</KitText> : null}
  </View>;
}
/** A block: its label and what it labels, 8 pt apart (`.rt-blk`). */
export function Blk({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
/** The muted help line (`.rt-help`). */
export function Help({ children, size = 12.5, style }: { children: ReactNode; size?: number; style?: object }) {
  return <KitText weight={500} size={size} lineHeight={1.45} color="text-muted" style={style}>{children}</KitText>;
}

/** The sheet's main button (`.rt-cta`): a 52 pt pill, the accent unless a colour is given. */
export function Cta({ label, onPress, color, ink, testID }: { label: string; onPress: () => void; color?: string; ink?: string; testID?: string }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
    style={{ minHeight: 52, borderRadius: 999, backgroundColor: color ?? k.c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
    <KitText weight={700} size={16} color={ink ?? k.c['on-accent']} numberOfLines={1}>{label}</KitText>
  </Tappable>;
}
/** The outlined button under a main one (`.rt-ghostbtn`). */
export function GhostBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 50, borderRadius: 999, borderWidth: 1.5, borderColor: k.c['hair-2'], alignItems: 'center', justifyContent: 'center' }}>
    <KitText weight={700} size={15}>{label}</KitText>
  </Tappable>;
}

/* ---------- the amount card (`.rt-dcard`): a coloured card with dark ink ---------- */

/** The coloured card the amount and the units sit on. */
export function DoseCard({ color, children, small, label, right }: { color: string; children: ReactNode; small?: boolean; label: string; right?: ReactNode }) {
  const rt = useRt();
  return <View style={{ backgroundColor: color, borderRadius: 24, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <KitText weight={700} size={11} tracking={0.14} color={rt.inkm} style={capitals}>{label}</KitText>
      {right}
    </View>
    {children}
  </View>;
}
/** The small Clear pill on the card (`.rt-clr`). */
export function ClearPill({ onPress, disabled, label }: { onPress: () => void; disabled: boolean; label: string }) {
  const rt = useRt();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
    style={{ backgroundColor: rt.dark ? 'rgba(20,20,20,0.1)' : 'rgba(255,255,255,0.2)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11, opacity: disabled ? 0.35 : 1 }}>
    <KitText weight={700} size={11.5} color={rt.ink}>{t('routinesClear')}</KitText>
  </Tappable>;
}

/** The big amount field (`.rt-readout`): what is typed, shown as 2½ or 1,000 once it loses focus, and the unit at the end. */
export function Readout({ value, onChange, unit, small, label, testID }: {
  value: number | null; onChange: (v: number | null) => void; unit: string | null; small?: boolean; label: string; testID?: string;
}) {
  const rt = useRt(), [focus, setFocus] = useState(false), [text, setText] = useState('');
  const shown = focus ? text : pretty(value);
  return <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, backgroundColor: rt.glass, borderRadius: 16,
    paddingVertical: small ? 8 : 10, paddingHorizontal: small ? 12 : 14 }}>
    <TextInput testID={testID} accessibilityLabel={label} value={shown} placeholder="0" keyboardType="decimal-pad" inputMode="decimal" autoComplete="off"
      onFocus={() => { setText(value == null ? '' : String(+value.toFixed(6))); setFocus(true); }} onBlur={() => setFocus(false)}
      onChangeText={v => { setText(v); onChange(parseAmt(v)); }}
      placeholderTextColor={alpha(rt.inkm, 0.45)} selectionColor={rt.ink} cursorColor={rt.ink}
      style={[font(700, small ? 30 : 40, 1, -0.04), { flex: 1, minWidth: 0, color: rt.ink, padding: 0, fontVariant: ['tabular-nums'] }]} />
    <KitText weight={700} size={small ? 16 : 18} color={rt.ink} style={{ opacity: unit ? 1 : 0.4 }}>{unit || t('routinesUnitWord')}</KitText>
  </View>;
}

/** A row of units on the card (`.rt-useg`): the picked one in ink. */
export function UnitSeg<U extends string>({ units, value, onChange, label, cardColor }: {
  units: readonly U[]; value: U | null | ''; onChange: (u: U) => void; label: string; cardColor: string;
}) {
  const rt = useRt();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label}
    style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: rt.dark ? 'rgba(20,20,20,0.1)' : 'rgba(255,255,255,0.16)', borderRadius: 14 }}>
    {units.map(u => {
      const on = u === value;
      return <Tappable key={u} dim="fill" accessibilityRole="radio" accessibilityLabel={u} accessibilityState={{ selected: on }} onPress={() => onChange(u)}
        style={{ flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? rt.ink : 'transparent' }}>
        <KitText weight={700} size={13.5} color={on ? (rt.dark ? '#ffffff' : cardColor) : rt.ink}>{u}</KitText>
      </Tappable>;
    })}
  </View>;
}

/** Take away and Add steps that grow with the amount (`.rt-nudge`): ¼ ½ 1, then 1 5 10, then 10 50 100. */
export function Nudges({ value, onChange, cardColor, caps }: { value: number | null; onChange: (v: number | null) => void; cardColor: string; caps?: boolean }) {
  const rt = useRt(), st = stepsFor(value), cur = value ?? 0;
  const btn = (d: number) => {
    const add = d > 0, off = !add && cur + d < -1e-9, mag = pretty(Math.abs(d));
    return <Tappable key={d} dim="fill" accessibilityRole="button" disabled={off} accessibilityState={{ disabled: off }}
      accessibilityLabel={add ? fill(t('routinesAddAmt'), { n: mag }) : fill(t('routinesTakeAway'), { n: mag })} onPress={() => onChange(nudge(value, d))}
      style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.3 : 1,
        backgroundColor: add ? rt.ink : rt.glass }}>
      <KitText weight={700} size={15} numeric color={add ? (rt.dark ? '#ffffff' : cardColor) : rt.ink}>{`${add ? '+' : '−'}${mag}`}</KitText>
    </Tappable>;
  };
  return <View style={{ gap: 6 }}>
    {caps ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: -2 }}>
      <KitText weight={700} size={10.5} tracking={0.1} color={rt.inkm} style={capitals}>{t('routinesTakeAwayCap')}</KitText>
      <KitText weight={700} size={10.5} tracking={0.1} color={rt.inkm} style={capitals}>{t('routinesAddCap')}</KitText>
    </View> : null}
    <View accessibilityRole="toolbar" accessibilityLabel={t('routinesChangeAmount')} style={{ flexDirection: 'row', gap: 4 }}>
      {[...st].reverse().map(d => btn(-d))}<View style={{ width: 6 }} />{st.map(d => btn(d))}
    </View>
  </View>;
}

/** The 0 to 2 (or 0 to 4) gauge under small amounts (`.rt-gauge2`), with a tick each quarter. */
export function Gauge({ value, width }: { value: number | null; width: number }) {
  const rt = useRt(), v = value ?? 0, max = v <= 2 ? 2 : v <= 4 ? 4 : null;
  if (max == null || !smallSteps(value) || width <= 0) return null;
  const x = (n: number) => 12 + (n / max) * 276, marks = [];
  for (let n = 0; n <= max + 1e-9; n += 0.25) {
    const whole = Math.abs(n - Math.round(n)) < 1e-9;
    marks.push(<Line key={`k${n}`} x1={x(n)} y1={whole ? 3 : 5} x2={x(n)} y2={8} stroke={whole ? rt.ink : rt.inkm} strokeWidth={whole ? 1.6 : 1.2} opacity={whole ? 1 : 0.6} />);
    if (whole || (max === 2 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9)) {
      marks.push(<SvgText key={`l${n}`} x={x(n)} y={29} textAnchor="middle" fill={rt.inkm} fontFamily={tokens.font.heading} fontSize={10.5}>{pretty(n)}</SvgText>);
    }
  }
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width, height: (width * 34) / 300 }}>
    <Svg width={width} height={(width * 34) / 300} viewBox="0 0 300 34">
      <Rect x={12} y={8} width={276} height={6} rx={3} fill={rt.dark ? 'rgba(20,20,20,0.12)' : 'rgba(255,255,255,0.22)'} />
      <Rect x={12} y={8} width={Math.max(0, x(v) - 12)} height={6} rx={3} fill={rt.ink} />
      {marks}
      {v > 0 ? <Circle cx={x(v)} cy={11} r={6} fill="#FFFDF2" stroke={rt.ink} strokeWidth={2.5} /> : null}
    </Svg>
  </View>;
}
