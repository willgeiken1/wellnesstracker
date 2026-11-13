import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { arcPath } from '@/components/ring-arc';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { Score } from './model';

/** The Score ring. Before the score is ready the arc shows days logged toward the first 7; after, it shows the score with the number inside. */
export function ScoreRing({ score, size, stroke = Math.max(3, Math.round(size / 9)) }: { score: Score; size: number; stroke?: number }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  // Never under 13 pt, the smallest text size in the app.
  const type = Math.max(13, Math.round(size / 3));
  const fill = score.value !== null ? score.value / 100 : score.ready ? 0 : score.progress;
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} accessible={false} style={{ position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors['hair-2']} strokeWidth={stroke} />
      {/* The arc is drawn as its own path from 12 o'clock rather than a dashed circle, so no stray dash can show at the top. */}
      {fill >= 1 ? <Circle testID="score-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.accent} strokeWidth={stroke} />
        : fill > 0 && <Path testID="score-ring-arc" d={arcPath(size / 2, size / 2, r, fill)} fill="none" stroke={colors.accent} strokeWidth={stroke} strokeLinecap="round" />}
    </Svg>
    {/* The ring is a fixed size, so this number grows only a little with large text. The same score is always written
        out beside the ring at full size, and the ring's label speaks it. */}
    {score.value !== null && <Text allowFontScaling maxFontSizeMultiplier={1.2} style={{ color: colors.text, fontFamily: tokens.font.heading, fontSize: type, fontVariant: ['tabular-nums'] }}>{score.value}</Text>}
  </View>;
}
