import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Icon, KitText, SegmentedControl, Tappable, alpha, mix, slopFor, useKit, useSelectionHaptic } from '@/components/kit';
import type { WaterIconName } from './water';
import { capitals } from '@/components/kit-style';

/* Building blocks shared by the Food tab, its tiles and its sheets, drawn to the final design (pages/food.js, pagetiles-food.js). */

/** The colour each macro draws in. */
export const MACRO_COLOR = { p: 'food', c: 'accent', f: 'sleep', fib: 'success' } as const;

const WATER_PATHS: Record<WaterIconName, string[]> = {
  glass: ['M6 4h12l-1.6 15.6a1.6 1.6 0 0 1-1.6 1.4H9.2a1.6 1.6 0 0 1-1.6-1.4z', 'M6.7 10.5h10.6'],
  bottle: ['M10 2.75h4v2.5h-4z', 'M10 5.25c0 1.6-2.75 2.4-2.75 4.75v9.5c0 .9.7 1.75 1.75 1.75h6c1 0 1.75-.85 1.75-1.75V10c0-2.35-2.75-3.15-2.75-4.75', 'M7.25 12.5h9.5M7.25 16.5h9.5'],
  tumbler: ['M5.75 7.25h12.5', 'M6.5 7.25c0-1.5.9-2.5 2.4-2.5h6.2c1.5 0 2.4 1 2.4 2.5', 'M6.75 7.25 7.9 19.7a1.6 1.6 0 0 0 1.6 1.45h5a1.6 1.6 0 0 0 1.6-1.45l1.15-12.45', 'M13.5 4.75 15.25 1.75'],
  jug: ['M9.25 2.75h5.5v2.75h-5.5z', 'M8 5.5h8a2 2 0 0 1 2 2v12a1.75 1.75 0 0 1-1.75 1.75h-8.5A1.75 1.75 0 0 1 6 19.5v-12a2 2 0 0 1 2-2z', 'M6 10.5h2.75M6 13.75h2.75M6 17h2.75'],
};
/** A water container drawn like the kit's icons: 24 grid, 1.75 stroke, round ends. */
export function WaterIcon({ name, size = 20, color }: { name: WaterIconName; size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {WATER_PATHS[name].map(d => <Path key={d} d={d} />)}
  </Svg>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** The 270 degree dial with ticks (vz.gauge): the arc fills to `frac`, ticks light up to it, the value sits inside. */
export function Gauge({ frac, size, sw, color, value, unit, fs = 26, us = 11.5, label }: {
  frac: number; size: number; sw?: number; color: string; value: string; unit: string; fs?: number; us?: number; label: string;
}) {
  const k = useKit();
  const s = size, w = sw ?? Math.max(5, Math.round(s / 11)), tk = s >= 110 ? 8 : s >= 100 ? 6 : 5, R = s / 2 - w / 2 - tk - 3, cx = s / 2, cy = s / 2 + R * 0.1;
  const f = Math.max(0, Math.min(1, frac || 0));
  const pt = (t: number, rr: number) => { const a = (135 + 270 * t) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const arc = (t0: number, t1: number) => { const a = pt(t0, R), b = pt(t1, R); return `M${r2(a[0])} ${r2(a[1])}A${R} ${R} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${r2(b[0])} ${r2(b[1])}`; };
  const ticks: ReactNode[] = [];
  for (let t = 0; t <= 20; t++) {
    const major = t % 5 === 0; if (s < 100 && !major) continue;
    const a = pt(t / 20, R + w / 2 + 3), b = pt(t / 20, R + w / 2 + 3 + (major ? tk : tk * 0.6)), lit = t / 20 <= f + 1e-6 && f > 0;
    ticks.push(<Line key={t} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={lit ? color : major ? k.c['text-muted'] : k.c['hair-2']}
      strokeWidth={major ? 1.5 : 1} strokeLinecap="round" opacity={lit && !major ? 0.7 : 1} />);
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: s, height: s }}>
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {ticks}
      <Path d={arc(0, 1)} fill="none" stroke={mix(color, k.c['surface-2'], 0.16)} strokeWidth={w} strokeLinecap="round" />
      {f > 0.004 ? <Path d={arc(0, Math.max(f, 0.012))} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" /> : null}
    </Svg>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: Math.round(R * 0.2) }}>
      <KitText weight={700} size={fs} lineHeight={1} tracking={-0.035} numeric>{value}</KitText>
      <KitText weight={600} size={us} lineHeight={1.2} color="text-muted" style={{ marginTop: 3 }}>{unit}</KitText>
    </View>
  </View>;
}

/** A row of cells filled to a fraction (vz.meter + vz.cells): whole cells on, one part cell, the rest a soft tint. */
export function meter(frac: number, n: number) { const x = Math.max(0, Math.min(1, frac)) * n; return Array.from({ length: n }, (_, i) => x >= i + 1 ? 1 : x > i ? x - i : 0); }
export function Cells({ states, color, h = 8, gap = 3, r = 2.5, style }: { states: number[]; color: string; h?: number; gap?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const k = useKit();
  const off = k.dark ? mix(color, k.c['surface-2'], 0.15) : mix(color, k.fill, 0.14);
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>
    {states.map((v, i) => <View key={i} style={{ flex: 1, minWidth: 0, height: h, borderRadius: r, overflow: 'hidden', backgroundColor: v >= 1 ? color : off }}>
      {v > 0 && v < 1 ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(v * 100)}%`, backgroundColor: color }} /> : null}
    </View>)}
  </View>;
}

/** Where the calories came from: protein, carbs and fat side by side (`.fdt-split` / `.fd-split`). */
export function SplitBar({ parts, h = 10, gap = 2, radius = 999, track }: { parts: { v: number; color: string }[]; h?: number; gap?: number; radius?: number; track?: string }) {
  return <View style={{ flexDirection: 'row', gap, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: track }}>
    {parts.filter(p => p.v > 0).map((p, i) => <View key={i} style={{ flex: p.v, minWidth: 3, height: '100%', backgroundColor: p.color }} />)}
  </View>;
}
/** Calories from protein (4 a gram), carbs (4) and fat (9), as whole percentages. */
export function macroPercents(p: number, c: number, f: number) {
  const kp = p * 4, kc = c * 4, kf = f * 9, t = kp + kc + kf || 1;
  return { kcal: [kp, kc, kf], pc: [kp, kc, kf].map(x => Math.round(x / t * 100)) };
}

/** A meal picker on one segmented row. */
export function MealSeg({ meals, value, onChange, label }: { meals: { id: string; name: string }[]; value: string; onChange: (id: string) => void; label: string }) {
  return <SegmentedControl label={label} options={meals.map(m => ({ value: m.id, label: m.name }))} value={value} onChange={onChange} />;
}

/** The small capitals label over a list (`.fd-lh`), with an optional plain aside or a tappable one on the right. */
export function SectionLabel({ title, aside, onAside, asideColor, inset, first }: { title: string; aside?: string; onAside?: () => void; asideColor?: string; inset?: boolean; first?: boolean }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: first ? 4 : inset ? 16 : 20, marginBottom: 8, marginHorizontal: inset ? 0 : 4 }}>
    <KitText accessibilityRole="header" weight={700} size={12} tracking={0.06} color="text-muted" style={capitals}>{title}</KitText>
    {aside ? onAside
      ? <Tappable dim="text" accessibilityRole="button" accessibilityLabel={aside} onPress={onAside} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
          <KitText weight={600} size={13.5} color={asideColor ?? 'accent'}>{aside}</KitText>
        </Tappable>
      : <KitText weight={500} size={12.5} color="text-muted">{aside}</KitText> : null}
  </View>;
}
/** A muted line of help under a block (`.fd-cap`). */
export function Caption({ children, center, style }: { children: ReactNode; center?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ marginTop: 10, marginHorizontal: 2 }, style]}><KitText weight={500} size={12.5} lineHeight={1.4} color="text-muted" style={center ? { textAlign: 'center' } : undefined}>{children}</KitText></View>;
}

/** The round add button at the end of a food row (`.fd-add`): a soft food tint, filled once the food is picked. */
export function AddButton({ on, onPress, label, color = 'food', size = 44 }: { on?: boolean; onPress: () => void; label: string; color?: string; size?: number }) {
  const k = useKit(), c = k.tok(color);
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress}
    hitSlop={slopFor(size, size)} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: on ? c : alpha(c, 0.14) }}>
    <Icon name={on ? 'check' : 'plus'} size={size > 36 ? 20 : 17} color={on ? k.c['on-accent'] : c} />
  </Tappable>;
}

/** The pill stepper for servings (`.fd-stp`): minus, the amount, plus. */
export function PillStepper({ value, onChange, step, min, max, format, label, color, tint, onStep }: {
  value: number; onChange: (v: number) => void; step: number; min: number; max: number; format: (v: number) => string; label: string; color?: string;
  /** A colour token for a soft tinted pill (the water sheet), in place of the plain one. */ tint?: string;
  /** Steps that are not a plain add (millilitres in 50s): called in place of onChange. */ onStep?: (d: -1 | 1) => void;
}) {
  const k = useKit(), haptic = useSelectionHaptic();
  const bg = tint ? k.tint(k.tok(tint), 0.14) : k.dark && k.surface !== 'page' ? k.c['accent-tint'] ?? k.c['surface-2'] : k.c['surface-2'];
  const go = (d: -1 | 1) => { if (onStep) { haptic(); onStep(d); return; } const next = Math.round(Math.max(min, Math.min(max, value + d * step)) * 100) / 100; if (next !== value) { haptic(); onChange(next); } };
  const btn = (d: -1 | 1) => <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={`${d < 0 ? 'Less' : 'More'}, ${label}`} disabled={d < 0 ? value <= min : value >= max}
    onPress={() => go(d)} hitSlop={slopFor(40, 40)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: (d < 0 ? value <= min : value >= max) ? 0.4 : 1 }}>
    <Icon name={d < 0 ? 'minus' : 'plus'} size={18} color={color ? k.tok(color) : k.c.text} />
  </Tappable>;
  return <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, backgroundColor: bg, flexShrink: 0 }}>
    {btn(-1)}
    <KitText weight={700} size={17} numeric style={{ minWidth: 56, textAlign: 'center' }}>{format(value)}</KitText>
    {btn(1)}
  </View>;
}

/** A tick in a circle (copy day rows, checklists). */
export function CheckCircle({ on, size = 26 }: { on: boolean; size?: number }) {
  const k = useKit();
  return <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.c.food : 'transparent', borderWidth: on ? 0 : 2, borderColor: k.c['hair-2'] }}>
    {on ? <Icon name="check" size={16} color={k.c['on-accent']} /> : null}
  </View>;
}

/** Concentric macro rings for the small Macros tile. */
export function MacroRings({ size, values }: { size: number; values: { frac: number; color: string }[] }) {
  const k = useKit(), R = [35, 25.5, 16];
  return <Svg width={size} height={size} viewBox="0 0 80 80">
    {values.slice(0, 3).map((v, i) => {
      const r = R[i], C = 2 * Math.PI * r, f = Math.min(1, Math.max(0, v.frac));
      return <G key={i}>
        <Circle cx={40} cy={40} r={r} fill="none" stroke={mix(v.color, k.c['surface-2'], 0.18)} strokeWidth={7.5} />
        {f > 0 ? <Circle cx={40} cy={40} r={r} fill="none" rotation={-90} origin="40, 40" strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} stroke={v.color} strokeWidth={7.5} strokeLinecap="round" /> : null}
      </G>;
    })}
  </Svg>;
}
