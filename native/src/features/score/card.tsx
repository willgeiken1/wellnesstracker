import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useStacked } from '@/components/text-size';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { SCORE_PILLARS, type Score, type ScorePillar } from './model';
import { ScoreRing } from './ring';
import { PILLAR_NAME, headline, spokenScore } from './words';

const semibold = { fontWeight: '600' } as const;
export const openScore = () => router.push('/score');

export function PillarRow({ pillar, value }: { pillar: ScorePillar; value: number | null }) {
  const { colors } = useTheme();
  // At the largest text sizes the name and number sit on their own line above a full-width bar.
  const stacked = useStacked();
  const name = t(PILLAR_NAME[pillar]);
  const bar = <View style={{ flex: stacked ? undefined : 1, alignSelf: stacked ? 'stretch' : undefined, height: 6, borderRadius: 3, backgroundColor: colors['surface-2'], overflow: 'hidden' }}>
    {value !== null && value > 0 && <View style={{ width: `${Math.min(100, value)}%`, height: 6, borderRadius: 3, backgroundColor: colors[pillar] }} />}
  </View>;
  const number = <ThemedText muted={value === null} numeric variant="caption" style={{ minWidth: 28, textAlign: 'right' }}>{value === null ? '–' : String(value)}</ThemedText>;
  const label = `${name}, ${value === null ? t('scoreNoSleep') : t('scoreOutOf').replace('{n}', String(value))}`;
  if (stacked) return <View testID={`score-pillar-${pillar}`} accessible accessibilityLabel={label} style={{ gap: 4, paddingVertical: 2 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spacing[1] }}>
      <ThemedText variant="caption" style={{ flexShrink: 1 }}>{name}</ThemedText>
      {number}
    </View>
    {bar}
  </View>;
  return <View testID={`score-pillar-${pillar}`} accessible accessibilityLabel={label}
    style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: 24 }}>
    <ThemedText variant="caption" style={{ minWidth: 72 }}>{name}</ThemedText>
    {bar}
    {number}
  </View>;
}

/** The Insight Score card on Home: the ring, the score or the countdown, the three pillars, and the way to how it is worked out. */
export function ScoreCard({ score }: { score: Score }) {
  const { colors } = useTheme();
  const line = headline(score);
  return <Card testID="home-score" style={{ borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[2] }}>
    <View accessible accessibilityLabel={spokenScore(score)} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
      <ScoreRing score={score} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="headline" style={semibold}>{t('scoreTitle')}</ThemedText>
        <ThemedText muted variant="caption" style={{ fontSize: 13, fontWeight: '600' }}>{line}</ThemedText>
      </View>
    </View>
    <View style={{ gap: 6 }}>
      {SCORE_PILLARS.map(pillar => <PillarRow key={pillar} pillar={pillar} value={score.pillars[pillar]} />)}
    </View>
    <Pressable testID="home-score-how" accessibilityRole="button" accessibilityLabel={t('scoreHow')} onPress={openScore} hitSlop={{ top: 10, bottom: 10 }}
      style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <ThemedText variant="caption" style={{ color: colors.accent, fontWeight: '600' }}>{t('scoreHow')}</ThemedText>
    </Pressable>
  </Card>;
}

/** The small ring in Home's header. Opens the detail screen. */
export function HeaderScore({ score }: { score: Score }) {
  return <Pressable testID="home-score-ring" accessibilityRole="button" accessibilityLabel={spokenScore(score)} onPress={openScore} hitSlop={6}
    style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
    <ScoreRing score={score} size={32} stroke={3.5} />
  </Pressable>;
}
