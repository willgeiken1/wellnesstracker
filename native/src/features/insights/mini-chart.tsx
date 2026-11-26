import { View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';

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
/**
 * A small chart for one number per day. Bars for totals, a line for daily values, an optional dashed goal.
 * Still on purpose: no animation, so it behaves the same with Reduce Motion on.
 */
export function MiniChart({ values, goal, bars = false, color, height = 120, first, last, testID }: {
  values: (number | null)[]; goal?: number | null; bars?: boolean; color: string; height?: number; first: string; last: string; testID?: string;
}) {
  const { colors } = useTheme();
  const known = values.filter((v): v is number => v !== null), top = Math.max(1, ...known, goal ?? 0) * 1.08;
  const slot = (W - PAD * 2) / Math.max(1, values.length), y = (value: number) => PAD + (height - PAD * 2) * (1 - value / top);
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  // A value with no logged day on either side cannot join a line, so it is drawn as a dot.
  const alone = (i: number) => !bars && values[i] !== null && (values[i - 1] ?? null) === null && (values[i + 1] ?? null) === null;
  return <View accessible={false}>
    <Svg testID={testID} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" accessible={false}>
      <Line x1={PAD} x2={W - PAD} y1={height - PAD} y2={height - PAD} stroke={colors['surface-2']} strokeWidth={1} />
      {goal != null && goal > 0 && <Line testID="chart-goal" x1={PAD} x2={W - PAD} y1={y(goal)} y2={y(goal)} stroke={colors['text-muted']} strokeWidth={1} strokeDasharray="4 4" />}
      {bars
        ? values.map((value, i) => value ? <Rect key={i} testID="chart-bar" x={PAD + i * slot + slot * 0.18} width={slot * 0.64} y={y(value)} height={Math.max(1, height - PAD - y(value))} rx={2} fill={color} /> : null)
        : <Path testID="chart-line" d={linePath(values, top, height)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {values.map((value, i) => value !== null && alone(i) ? <Rect key={i} testID="chart-dot" x={PAD + i * step - 3} y={y(value) - 3} width={6} height={6} rx={3} fill={color} /> : null)}
    </Svg>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <ThemedText muted numeric variant="caption">{first}</ThemedText><ThemedText muted numeric variant="caption">{last}</ThemedText>
    </View>
  </View>;
}
