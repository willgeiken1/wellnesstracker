import { View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';

const W = 300, PAD = 6;
/** Line segments through the known values; a day with no value leaves a gap instead of dropping to zero. */
export function linePath(values: (number | null)[], top: number, height: number) {
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  let d = '', pen = false;
  values.forEach((value, i) => {
    if (value === null) { pen = false; return; }
    const x = PAD + i * step, y = PAD + (height - PAD * 2) * (1 - value / top);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}
/** A round step for two or three gridlines up to `max`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(max: number) {
  if (!(max > 0)) return 1;
  const raw = max / 3, power = 10 ** Math.floor(Math.log10(raw)), unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}
/** Short axis numbers: 2,500 stays 2,500; 12,000 reads 12k so the column stays narrow. */
export const axisNumber = (n: number) => n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString('en-US');
const AXIS = 40, LABEL = 18;

/**
 * A small chart for one number per day. Bars for totals, a line for daily values, an optional dashed goal.
 * A scale on the right (0 and round gridlines) says how big the numbers are, and the goal line carries its own
 * label, so the chart reads without the hint below it.
 * Still on purpose: no animation, so it behaves the same with Reduce Motion on.
 */
export function MiniChart({ values, goal, bars = false, color, height = 120, first, last, testID, unit = '' }: {
  values: (number | null)[]; goal?: number | null; bars?: boolean; color: string; height?: number; first: string; last: string; testID?: string; unit?: string;
}) {
  const { colors } = useTheme();
  const known = values.filter((v): v is number => v !== null), top = Math.max(1, ...known, goal ?? 0) * 1.08;
  const slot = (W - PAD * 2) / Math.max(1, values.length), y = (value: number) => PAD + (height - PAD * 2) * (1 - value / top);
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const tick = niceStep(top / 1.08), ticks = Array.from({ length: Math.floor(top / tick) + 1 }, (_, i) => i * tick);
  const showGoal = goal != null && goal > 0;
  // The goal label sits just above its line, or below it when the line is near the top.
  const goalTop = showGoal ? (y(goal) - LABEL - 1 < 0 ? y(goal) + 2 : y(goal) - LABEL - 1) : 0;
  // A scale label that would sit on the goal line's label row is left out; the goal is the number that matters.
  const clear = (value: number) => !showGoal || Math.abs(y(value) - y(goal)) >= LABEL * 0.75;
  // A value with no logged day on either side cannot join a line, so it is drawn as a dot.
  const alone = (i: number) => !bars && values[i] !== null && (values[i - 1] ?? null) === null && (values[i + 1] ?? null) === null;
  return <View accessible={false}>
    <View style={{ flexDirection: 'row' }}>
      <View style={{ flex: 1, height }}>
        <Svg testID={testID} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" accessible={false}>
          {ticks.slice(1).map(value => <Line key={value} testID="chart-grid" x1={PAD} x2={W - PAD} y1={y(value)} y2={y(value)} stroke={colors.hair} strokeWidth={1} />)}
          <Line x1={PAD} x2={W - PAD} y1={height - PAD} y2={height - PAD} stroke={colors['hair-2']} strokeWidth={1} />
          {showGoal && <Line testID="chart-goal" x1={PAD} x2={W - PAD} y1={y(goal)} y2={y(goal)} stroke={colors['text-muted']} strokeWidth={1} strokeDasharray="4 4" />}
          {bars
            ? values.map((value, i) => value ? <Rect key={i} testID="chart-bar" x={PAD + i * slot + slot * 0.18} width={slot * 0.64} y={y(value)} height={Math.max(1, height - PAD - y(value))} rx={2} fill={color} /> : null)
            : <Path testID="chart-line" d={linePath(values, top, height)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          {values.map((value, i) => value !== null && alone(i) ? <Rect key={i} testID="chart-dot" x={PAD + i * step - 3} y={y(value) - 3} width={6} height={6} rx={3} fill={color} /> : null)}
        </Svg>
        {showGoal && <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: goalTop, height: LABEL, justifyContent: 'center' }}>
          <ThemedText testID="chart-goal-label" muted numeric variant="caption" style={{ fontWeight: '600', lineHeight: LABEL, paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surface }}>
            {t('chartGoal').replace('{value}', `${axisNumber(goal)}${unit ? ` ${unit}` : ''}`)}
          </ThemedText>
        </View>}
      </View>
      <View testID="chart-axis" style={{ width: AXIS, height }}>
        {ticks.filter(clear).map(value => <ThemedText key={value} muted numeric variant="caption" style={{ position: 'absolute', right: 0, top: Math.min(height - LABEL, Math.max(0, y(value) - LABEL / 2)), lineHeight: LABEL }}>{axisNumber(value)}</ThemedText>)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginRight: AXIS }}>
      <ThemedText muted numeric variant="caption">{first}</ThemedText><ThemedText muted numeric variant="caption">{last}</ThemedText>
    </View>
  </View>;
}
