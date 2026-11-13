import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
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
  const name = t(PILLAR_NAME[pillar]);
  return <View testID={`score-pillar-${pillar}`} accessible accessibilityLabel={`${name}, ${value === null ? t('scoreNoSleep') : t('scoreOutOf').replace('{n}', String(value))}`}
    style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: 24 }}>
    <ThemedText variant="caption" style={{ width: 72 }}>{name}</ThemedText>
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors['surface-2'], overflow: 'hidden' }}>
      {value !== null && value > 0 && <View style={{ width: `${Math.min(100, value)}%`, height: 6, borderRadius: 3, backgroundColor: colors[pillar] }} />}
    </View>
    <ThemedText muted={value === null} numeric variant="caption" style={{ minWidth: 28, textAlign: 'right' }}>{value === null ? '–' : String(value)}</ThemedText>
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
        <ThemedText muted variant="caption" style={line ? { fontSize: 13, fontWeight: '600' } : undefined}>{line || t('scoreLastSeven')}</ThemedText>
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
