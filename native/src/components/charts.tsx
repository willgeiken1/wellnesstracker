import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { tokens } from '@/design/tokens';
import { MIN_TEXT, useKit } from './kit-style';

/* The kit's two small charts (`ui.bars`, `ui.line`). Each is drawn in a `w` x `h` box and scaled to the width it is
   given, as `.chart { width: 100% }` does. Axis labels are 600 11 pt muted (10.5 in the mockup; 11 is the floor). */

const LABEL = { fontFamily: tokens.font.bodyStrong, fontSize: MIN_TEXT } as const;

/** Columns for `values`, the highlighted one (`hi`, the last unless given) solid and the rest at 42 percent, with an
 * optional dashed goal line and labels under the columns. */
export function BarChart({ values, labels, color, goal, w = 358, h = 120, hi, label, testID }: {
  values: number[]; labels?: string[]; color?: string; goal?: number; w?: number; h?: number; hi?: number; /** Spoken summary. */ label: string; testID?: string;
}) {
  const k = useKit();
  const n = values.length, pad = labels ? 18 : 0, max = Math.max(...values, goal ?? 0) * 1.08 || 1;
  const bw = Math.min(28, (w / n) * 0.56), gap = w / n, sel = hi ?? n - 1, col = k.tok(color);
  return <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: w / (h + pad) }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h + pad}`} style={{ overflow: 'visible' }}>
      {goal ? <Line x1={0} x2={w} y1={h - (goal / max) * h} y2={h - (goal / max) * h} stroke={k.c['hair-2']} strokeDasharray="3 4" /> : null}
      {values.map((x, i) => {
        const bh = Math.max(x > 0 ? 3 : 0, (x / max) * h), cx = gap * i + gap / 2;
        return <Rect key={i} x={cx - bw / 2} y={h - bh} width={bw} height={bh} rx={Math.min(6, bw / 2)} fill={col} opacity={i === sel ? 1 : 0.42} />;
      })}
      {labels?.map((l, i) => <SvgText key={`l${i}`} x={gap * i + gap / 2} y={h + 14} textAnchor="middle" {...LABEL} fill={i === sel ? k.c.text : k.c['text-muted']}>{l}</SvgText>)}
    </Svg>
  </View>;
}

/** A line through `values` with an optional soft fill, dashed goal, dots, labels and the last `dashedLast` points drawn
 * dashed as an estimate. The last point is marked. `min` and `max` fix the scale. */
export function LineChart({ values, color, w = 358, h = 120, fill = false, goal, dots = false, labels, min, max, dashedLast = 0, label, testID }: {
  values: number[]; color?: string; w?: number; h?: number; fill?: boolean; goal?: number; dots?: boolean; labels?: (string | undefined)[];
  min?: number; max?: number; dashedLast?: number; /** Spoken summary. */ label: string; testID?: string;
}) {
  const k = useKit();
  const n = values.length, pad = labels ? 18 : 0, col = k.tok(color);
  let lo = min ?? Math.min(...values), top = max ?? Math.max(...values);
  if (goal != null) { lo = Math.min(lo, goal); top = Math.max(top, goal); }
  let span = (top - lo) || 1; lo -= span * 0.12; top += span * 0.12; span = top - lo;
  const X = (i: number) => n < 2 ? w / 2 : 4 + (w - 8) * i / (n - 1);
  const Y = (v: number) => 6 + (h - 12) * (1 - (v - lo) / span);
  const pts = values.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`);
  const solid = pts.slice(0, n - dashedLast), dash = dashedLast ? pts.slice(n - dashedLast - 1) : [];
  return <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: w / (h + pad) }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h + pad}`} style={{ overflow: 'visible' }}>
      {goal != null && <Line x1={0} x2={w} y1={Y(goal)} y2={Y(goal)} stroke={k.c['hair-2']} strokeDasharray="3 4" />}
      {fill && n > 0 && <Path d={`M${pts.join('L')}L${X(n - 1).toFixed(1)} ${h}L${X(0).toFixed(1)} ${h}Z`} fill={col} opacity={0.12} />}
      {solid.length > 0 && <Path d={`M${solid.join('L')}`} fill="none" stroke={col} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
      {dash.length > 0 && <Path d={`M${dash.join('L')}`} fill="none" stroke={col} strokeWidth={2.25} strokeDasharray="4 5" strokeLinecap="round" />}
      {dots ? values.map((v, i) => <Circle key={i} cx={X(i)} cy={Y(v)} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? col : k.c.surface} stroke={col} strokeWidth={2} />)
        : n > 0 && <Circle cx={X(n - 1)} cy={Y(values[n - 1])} r={4} fill={col} stroke={k.c.surface} strokeWidth={2} />}
      {labels?.map((l, i) => l ? <SvgText key={`l${i}`} x={X(i)} y={h + 14} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} {...LABEL} fill={k.c['text-muted']}>{l}</SvgText> : null)}
    </Svg>
  </View>;
}
