import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { Score } from './model';

/** The Score ring. Before the score is ready the arc shows days logged toward the first 7; after, it shows the score with the number inside. */
export function ScoreRing({ score, size, stroke = Math.max(3, Math.round(size / 9)) }: { score: Score; size: number; stroke?: number }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2, around = 2 * Math.PI * r;
  // Never under 13 pt, the smallest text size in the app.
  const type = Math.max(13, Math.round(size / 3));
  const fill = score.value !== null ? score.value / 100 : score.ready ? 0 : score.progress;
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} accessible={false} style={{ position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors['surface-2']} strokeWidth={stroke} />
      {fill > 0 && <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.accent} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${around * Math.min(1, fill)} ${around}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </Svg>
    {score.value !== null && <ThemedText style={{ fontFamily: tokens.font.heading, fontSize: type, fontVariant: ['tabular-nums'] }}>{score.value}</ThemedText>}
  </View>;
}
