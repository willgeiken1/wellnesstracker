import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useAuth } from '@/auth/provider';
import { Icon, type IconName } from '@/components/icon';
import { font, mix, alpha, tabular } from '@/components/kit-style';
import type { ThemeColors, ThemeMode } from '@/design/tokens';
import { tokens } from '@/design/tokens';
import { plate, raised, well } from '@/features/tiles/depth';
import { TileSurface } from '@/features/tiles/tile-surface';
import { liveReads } from '@/data/read-cache';
import { TrainingData } from '../training-data';
import { t } from '@/i18n/en';

/** Tile body text: an exact mockup style in a given colour. */
export function T({ w = 500, s, lh, tr, c, num, lines = 1, style, children }: {
  w?: 500 | 600 | 700; s: number; lh?: number; tr?: number; c: string; num?: boolean; lines?: number; style?: StyleProp<TextStyle>; children: ReactNode;
}) {
  return <Text numberOfLines={lines} allowFontScaling={false} style={[font(w, s, lh, tr), { color: c }, num && tabular, style]}>{children}</Text>;
}
/** The tiles' big number with its small unit after it (`.trt-n`). */
export function N({ v, unit, size = 32, colors, style }: { v: string | number; unit?: string; size?: number; colors: ThemeColors; style?: StyleProp<TextStyle> }) {
  return <Text numberOfLines={1} allowFontScaling={false} style={[font(700, size, 1, -0.03), tabular, { color: colors.text }, style]}>
    {v}{unit ? <Text style={[font(600, 13), { color: colors['text-muted'], letterSpacing: 0 }]}>{' ' + unit}</Text> : null}
  </Text>;
}
/** Muted small line (`.trt-s`), with optional bold runs passed as children. */
export function S({ colors, children, style, lines = 1, size = 12.5 }: { colors: ThemeColors; children: ReactNode; style?: StyleProp<TextStyle>; lines?: number; size?: number }) {
  return <Text numberOfLines={lines} allowFontScaling={false} style={[font(500, size, 1.35), { color: colors['text-muted'] }, style]}>{children}</Text>;
}
export function B({ colors, children, color }: { colors: ThemeColors; children: ReactNode; color?: string }) {
  return <Text style={[font(600, 12.5), { color: color ?? colors.text }]}>{children}</Text>;
}
/** Small capitals label (`.trt-k`). */
export function K({ colors, children, color, size = 10.5, style }: { colors: ThemeColors; children: ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle> }) {
  return <Text numberOfLines={1} allowFontScaling={false} style={[font(700, size, 1, 0.1), { color: color ?? colors['text-muted'], textTransform: 'uppercase' }, style]}>{children}</Text>;
}

/** The depth materials: a recessed well, a raised fill in the tile colour, a raised neutral plate. Children sit on top. */
export function Material({ kind, fill, mode, colors, radius, w, h, style, children }: {
  kind: 'well' | 'fill' | 'plate'; fill?: string; mode: ThemeMode; colors: ThemeColors; radius?: number; w: number; h: number; style?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  const spec = kind === 'well' ? well(colors, mode, radius ?? 999) : kind === 'fill' ? raised(fill ?? colors.training, mode, radius ?? 999) : plate(colors, mode, radius ?? 14);
  return <View style={[{ width: w, height: h }, style]}>
    <TileSurface spec={spec} width={w} height={h} />
    {children}
  </View>;
}
export function Pips({ done, total, w = 20, colors, mode, tint }: { done: number; total: number; w?: number; colors: ThemeColors; mode: ThemeMode; tint: string }) {
  return <View style={{ flexDirection: 'row', gap: 4 }} accessible={false} importantForAccessibility="no-hide-descendants">
    {Array.from({ length: Math.max(0, total) }, (_, k) => <Material key={k} kind={k < done ? 'fill' : 'well'} fill={tint} mode={mode} colors={colors} radius={3} w={w} h={6} />)}
  </View>;
}
/** A recessed bar with a raised fill to `frac`. */
export function WellBar({ frac, h, w, colors, mode, tint }: { frac: number; h: number; w: number; colors: ThemeColors; mode: ThemeMode; tint: string }) {
  const f = Math.max(0, Math.min(1, frac)), fw = f > 0 ? Math.max(h, f * w) : 0;
  return <Material kind="well" mode={mode} colors={colors} w={w} h={h}>
    {fw ? <Material kind="fill" fill={tint} mode={mode} colors={colors} w={fw} h={h} style={{ position: 'absolute', left: 0, top: 0 }} /> : null}
  </Material>;
}

/** The tiles' button (`.trt-btn`): a raised fill in the tile colour, or a ghost tint. */
export function TileButton({ label, icon, onPress, w, h = 40, small, ghost, tint, colors, mode, a11y }: {
  label: string; icon?: IconName; onPress?: () => void; w: number; h?: number; small?: boolean; ghost?: boolean; tint: string; colors: ThemeColors; mode: ThemeMode; a11y?: string;
}) {
  const hh = small ? 34 : h, r = small ? 11 : 13;
  const ink = ghost ? tint : colors['on-accent'];
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} hitSlop={hh < 44 ? { top: (44 - hh) / 2, bottom: (44 - hh) / 2 } : undefined}
    style={({ pressed }) => [{ width: w, height: hh, borderRadius: r, transform: [{ scale: pressed ? 0.97 : 1 }] }, ghost && { backgroundColor: alpha(tint, 0.15) }]}>
    {ghost ? null : <TileSurface spec={raised(tint, mode, r)} width={w} height={hh} />}
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: small ? 13 : 16 }}>
      {icon ? <Icon name={icon} size={17} color={ink} /> : null}
      <T w={700} s={small ? 13.5 : 14.5} c={ink}>{label}</T>
    </View>
  </Pressable>;
}
/** A small square icon in a tint (`.trt-ic`). */
export function IconChip({ name, color, size = 36, icon = 19, radius = 11 }: { name: IconName; color: string; size?: number; icon?: number; radius?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(color, 0.15) }}>
    <Icon name={name} size={icon} color={color} />
  </View>;
}
export function PrBadge({ colors }: { colors: ThemeColors }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 19, paddingHorizontal: 7, borderRadius: 999, backgroundColor: alpha(colors.warning, 0.16) }}>
    <Icon name="trophy" size={11} color={colors.warning} />
    <T w={700} s={10.5} c={colors.warning}>{t('trainingPr')}</T>
  </View>;
}
/** The pulsing "In progress" mark. */
export function LiveDot({ label, colors }: { label: string; colors: ThemeColors }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.training, boxShadow: `0 0 0 4px ${alpha(colors.training, 0.3)}` }} />
    <T w={700} s={10.5} lh={1} tr={0.13} c={colors.training} style={{ textTransform: 'uppercase' }}>{label}</T>
  </View>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** The 270 degree gauge with ticks (`INS.vz.gauge`). */
export function Gauge({ frac, from, size, sw, color, colors, fs, us, value, unit, label }: {
  frac: number; from?: number; size: number; sw: number; color: string; colors: ThemeColors; fs: number; us: number; value: string; unit?: string; label: string;
}) {
  const tk = size >= 110 ? 8 : size >= 100 ? 6 : 5, R = size / 2 - sw / 2 - tk - 3, cx = size / 2, cy = size / 2 + R * 0.1;
  const f = Math.max(0, Math.min(1, frac || 0));
  const pt = (tt: number, rr: number) => { const a = (135 + 270 * tt) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const arc = (t0: number, t1: number) => { const a = pt(t0, R), b = pt(t1, R); return `M${r2(a[0])} ${r2(a[1])}A${R} ${R} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${r2(b[0])} ${r2(b[1])}`; };
  const ticks: ReactNode[] = [];
  for (let k = 0; k <= 20; k++) {
    const major = k % 5 === 0; if (size < 100 && !major) continue;
    const a = pt(k / 20, R + sw / 2 + 3), b = pt(k / 20, R + sw / 2 + 3 + (major ? tk : tk * 0.6)), lit = k / 20 <= f + 1e-6 && f > 0;
    ticks.push(<Line key={k} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={lit ? color : major ? colors['text-muted'] : colors['hair-2']} strokeWidth={major ? 1.5 : 1} strokeLinecap="round" opacity={lit && !major ? 0.7 : 1} />);
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      {ticks}
      <Path d={arc(0, 1)} fill="none" stroke={mix(color, colors['surface-2'], 0.16)} strokeWidth={sw} strokeLinecap="round" />
      {f > 0.004 ? <Path d={arc(0, Math.max(f, 0.012))} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" /> : null}
      {from != null && from > 0.004 && from < f ? <Path d={arc(0, from)} fill="none" stroke={mix(color, colors.surface, 0.45)} strokeWidth={sw} strokeLinecap="round" /> : null}
    </Svg>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: Math.round(R * 0.2) }}>
      <T w={700} s={fs} lh={1} tr={-0.035} c={colors.text} num>{value}</T>
      {unit ? <T w={600} s={us} lh={1.2} c={colors['text-muted']} style={{ marginTop: 3 }}>{unit}</T> : null}
    </View>
  </View>;
}
/** A row of small cells (`INS.vz.cells`): 1 on, 0 off, 'now' outlined; groups add a wider gap. */
export function Cells({ states, w, h, gap, r, groups, color, colors, mode, label }: {
  states: (0 | 1 | 'now')[]; w: number; h: number; gap: number; r: number; groups?: number[] | null; color: string; colors: ThemeColors; mode: ThemeMode; label?: string;
}) {
  const GG = 7, breaks = groups ? groups.length - 1 : 0;
  const cw = Math.max(1, (w - gap * (states.length - 1 + breaks) - (GG) * breaks) / Math.max(1, states.length));
  const off = mode === 'light' ? mix(color, mix(colors.text, colors.bg, 0.06), 0.14) : mix(color, colors['surface-2'], 0.15);
  const out: ReactNode[] = []; let gi = 0, gc = 0;
  states.forEach((v, i) => {
    if (groups && i && gc === groups[gi]) { out.push(<View key={`g${i}`} style={{ width: GG }} />); gi++; gc = 0; }
    gc++;
    out.push(<View key={i} style={{ width: cw, height: h, borderRadius: r, backgroundColor: v === 1 ? color : v === 'now' ? 'transparent' : off, borderWidth: v === 'now' ? 1.5 : 0, borderColor: color }} />);
  });
  return <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap }}>{out}</View>;
}
/** A dashed estimate line with dots, as the e1rm and records tiles draw it. */
export function DashLine({ vals, w, h, color, colors, labels, ylab, dots = true, id, label }: {
  vals: number[]; w: number; h: number; color: string; colors: ThemeColors; labels?: string[]; ylab?: boolean; dots?: boolean; id: string; label: string;
}) {
  if (!vals.length) return <View style={{ width: w, height: h }} />;
  const pl = ylab ? 30 : 4, pr = 6, pt = 8, pb = labels ? 18 : 6;
  let lo = Math.min(...vals), hi = Math.max(...vals); let span = hi - lo || 1; lo -= span * 0.18; hi += span * 0.12; span = hi - lo;
  const X = (i: number) => pl + (w - pl - pr) * (vals.length === 1 ? 1 : i / (vals.length - 1)), Y = (v: number) => pt + (h - pt - pb) * (1 - (v - lo) / span);
  const d = vals.map((v, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const area = `${d}L${X(vals.length - 1).toFixed(1)} ${h - pb}L${X(0).toFixed(1)} ${h - pb}Z`;
  const ex = X(vals.length - 1), ey = Y(vals[vals.length - 1]);
  const tf = { fontFamily: tokens.font.bodyStrong, fontSize: 10.5 };
  return <View accessible accessibilityRole="image" accessibilityLabel={label}><Svg width={w} height={h}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.28} /><Stop offset="1" stopColor={color} stopOpacity={0} /></LinearGradient></Defs>
    {ylab ? [hi - span * 0.12, lo + span * 0.18].map((v, k) => <Line key={k} x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke={colors.hair} strokeWidth={1} />) : null}
    {ylab ? [hi - span * 0.12, lo + span * 0.18].map((v, k) => <SvgText key={`t${k}`} x={0} y={Y(v) + 3.5} fill={colors['text-muted']} {...tf} fontFamily={tokens.font.heading}>{String(Math.round(v))}</SvgText>) : null}
    <Path d={area} fill={`url(#${id})`} />
    <Path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
    {dots ? vals.slice(0, -1).map((v, i) => <Circle key={i} cx={X(i)} cy={Y(v)} r={2.6} fill={colors.surface} stroke={color} strokeWidth={1.6} />) : null}
    <Circle cx={ex} cy={ey} r={8} fill={color} opacity={0.18} />
    <Circle cx={ex} cy={ey} r={4.2} fill={color} stroke={colors.surface} strokeWidth={1.5} />
    {labels?.map((l, k) => l ? <SvgText key={`l${k}`} x={X(k)} y={h - 3} textAnchor={k === 0 ? 'start' : k === vals.length - 1 ? 'end' : 'middle'} fill={colors['text-muted']} {...tf}>{l}</SvgText> : null)}
  </Svg></View>;
}
/** The session tile's soft training glow from the top left corner. */
export function Glow({ w, h, color, inset = 16 }: { w: number; h: number; color: string; inset?: number }) {
  // Drawn from the tile's own corner (the body sits 16 pt in); the tile's rounded clip trims it.
  return <Svg width={w} height={h} style={{ position: 'absolute', left: -inset, top: -inset }} pointerEvents="none">
    <Defs><RadialGradient id="trtGlow" cx="0" cy="0" rx={w * 1.2} ry={h * 0.9} fx="0" fy="0" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor={color} stopOpacity={0.16} /><Stop offset="0.62" stopColor={color} stopOpacity={0} />
    </RadialGradient></Defs>
    <Rect x={0} y={0} width={w} height={h} fill="url(#trtGlow)" />
  </Svg>;
}

/* ---------- live data for the tiles ---------- */
let cached: { key: string; data: TrainingData } | null = null;
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let minute = Math.floor(Date.now() / 60000);
function subscribeMinute(cb: () => void) {
  minuteListeners.add(cb);
  if (!minuteTimer) minuteTimer = setInterval(() => { const m = Math.floor(Date.now() / 60000); if (m !== minute) { minute = m; minuteListeners.forEach(l => l()); } }, 5000);
  return () => { minuteListeners.delete(cb); if (!minuteListeners.size && minuteTimer) { clearInterval(minuteTimer); minuteTimer = null; } };
}
/** Training data for the signed-in person, shared by every tile and redrawn when the data changes or a minute passes. */
export function useTrainingData(): TrainingData | null {
  const { repository } = useAuth();
  const revision = useSyncExternalStore(cb => repository?.subscribe(cb) ?? (() => {}), () => repository?.getRevision() ?? 0, () => repository?.getRevision() ?? 0);
  const m = useSyncExternalStore(subscribeMinute, () => minute, () => minute);
  return useMemo(() => {
    if (!repository) return null;
    const key = `${repository.owner}:${revision}:${m}`;
    if (cached?.key !== key) cached = { key, data: new TrainingData(liveReads(repository), Date.now(), t('workoutName')) };
    return cached.data;
  }, [repository, revision, m]);
}
/** The time, ticking every second while `on`. */
export function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}
