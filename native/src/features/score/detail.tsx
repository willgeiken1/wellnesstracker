import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { WorkoutStore } from '@/data/workout/store';
import { cachedReads } from '@/data/read-cache';
import { useWorkout } from '@/features/workout/use-workout';
import { t } from '@/i18n/en';
import { useHealthDays } from '../health/use-health-days';
import { useFocused } from '../home/use-focused';
import { PillarRow } from './card';
import { DEFAULT_WEIGHTS, SCORE_PILLARS, STEP_GOAL, WEIGHT_MAX, nudgeWeight, sameWeights, shares, type Score, type ScorePillar, type Weights } from './model';
import { readScore, readWeights, saveWeights } from './read';
import { ScoreRing } from './ring';
import { PILLAR_NAME, headline, spokenScore } from './words';

const semibold = { fontWeight: '600' } as const;
const card = { borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[1] } as const;
const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);

/** Each pillar's sum in words, with the person's own numbers in it. */
function workings(pillar: ScorePillar, score: Score): string[] {
  const p = score.parts;
  if (pillar === 'training') return [
    fill(t(p.workouts >= p.workoutGoal ? 'scoreTrainingSumMet' : 'scoreTrainingSum'), { done: p.workouts, goal: p.workoutGoal }),
    p.stepsAverage === null ? t('scoreTrainingNoSteps') : fill(t('scoreTrainingSteps'), { steps: whole(p.stepsAverage), goal: whole(STEP_GOAL) }),
  ];
  if (pillar === 'food') return [
    fill(t('scoreFoodSum'), { logged: p.foodLogged, days: p.foodDays }),
    t('scoreFoodHow'), t(p.todayCounted ? 'scoreFoodTodayIn' : 'scoreFoodTodayOut'),
  ];
  const minutes = Math.round((p.sleepAverage ?? 0) * 60);
  return p.sleepAverage === null ? [t(p.lastNightCounted ? 'scoreRecoveryNone' : 'scoreRecoveryOpen')] : [
    fill(t(p.nights === 1 ? 'scoreRecoverySumOne' : 'scoreRecoverySum'), { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0'), nights: p.nights }),
    t('scoreRecoveryHow'), ...(p.lastNightCounted ? [] : [t('scoreRecoveryOpen')]),
  ];
}

function Step({ glyph, label, onPress, disabled }: { glyph: 'minus' | 'plus'; label: string; onPress: () => void; disabled: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'], opacity: disabled ? 0.35 : pressed ? 0.8 : 1 })}>
    <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
      <Path d={glyph === 'minus' ? 'M6 12h12' : 'M12 6v12M6 12h12'} fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  </Pressable>;
}

function Detail({ store }: { store: WorkoutStore }) {
  const { colors } = useTheme();
  const health = useHealthDays(useFocused());
  // The weights live in this screen while it is open and on the phone after each change.
  const [held, setHeld] = useState<{ store: WorkoutStore['repo']; weights: Weights } | null>(null);
  const weights = held && held.store === store.repo ? held.weights : readWeights(store);
  // Read once per change to the data, the weights or the minute, through a view that fetches each list once.
  const reader = useMemo(() => new WorkoutStore(cachedReads(store.repo), store.viewRevision), [store]);
  const minute = Math.floor(new Date().getTime() / 60_000);
  const score = useMemo(() => readScore(reader, new Date(minute * 60_000), health, weights), [reader, health, weights, minute]);
  const share = shares(weights, score.pillars), line = headline(score);
  const change = (next: Weights) => { if (next === weights) return; setHeld({ store: store.repo, weights: next }); saveWeights(store, next); };
  return <>
    <Card testID="score-summary" style={[card, { alignItems: 'center', gap: tokens.spacing[2], paddingVertical: tokens.spacing[4] }]}>
      <View accessible accessibilityLabel={spokenScore(score)} style={{ alignItems: 'center', gap: tokens.spacing[1] }}>
        <ScoreRing score={score} size={112} stroke={10} />
        <ThemedText muted variant="caption" style={{ fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{line}</ThemedText>
      </View>
      <View style={{ alignSelf: 'stretch', gap: 6 }}>
        {SCORE_PILLARS.map(pillar => <PillarRow key={pillar} pillar={pillar} value={score.pillars[pillar]} />)}
      </View>
    </Card>
    <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('scoreHow')}</ThemedText>
    <Card testID="score-equation" style={card}>
      <ThemedText style={semibold}>{t('scoreEquation')}</ThemedText>
      <ThemedText muted variant="caption" style={{ lineHeight: 19 }}>{t(score.ready ? 'scoreEquationBody' : 'scoreEquationWait')}</ThemedText>
    </Card>
    {SCORE_PILLARS.map(pillar => {
      const name = t(PILLAR_NAME[pillar]), value = score.pillars[pillar];
      return <Card key={pillar} testID={`score-detail-${pillar}`} style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[pillar] }} />
          <ThemedText style={[semibold, { flex: 1 }]}>{name}</ThemedText>
          <ThemedText numeric style={semibold}>{value === null ? '–' : `${value} / 100`}</ThemedText>
        </View>
        {workings(pillar, score).map(text => <ThemedText key={text} muted variant="caption" style={{ lineHeight: 19 }}>{text}</ThemedText>)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], marginTop: tokens.spacing[1] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="caption" style={semibold}>{fill(t('scoreWeight'), { n: weights[pillar] })}</ThemedText>
            <ThemedText muted variant="caption">{value === null ? t('scoreShareNone') : fill(t('scoreShare'), { n: share[pillar] })}</ThemedText>
          </View>
          <Step glyph="minus" label={fill(t('scoreWeightLess'), { name })} disabled={nudgeWeight(weights, pillar, -1) === weights} onPress={() => change(nudgeWeight(weights, pillar, -1))} />
          <Step glyph="plus" label={fill(t('scoreWeightMore'), { name })} disabled={weights[pillar] >= WEIGHT_MAX} onPress={() => change(nudgeWeight(weights, pillar, 1))} />
        </View>
      </Card>;
    })}
    {!sameWeights(weights, DEFAULT_WEIGHTS) && <Pressable testID="score-reset" accessibilityRole="button" accessibilityLabel={t('scoreReset')} onPress={() => change({ ...DEFAULT_WEIGHTS })}
      style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing[3], borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors['hair-2'], opacity: pressed ? 0.8 : 1 })}>
      <ThemedText style={semibold}>{t('scoreReset')}</ThemedText>
    </Pressable>}
    <ThemedText muted variant="caption" style={{ lineHeight: 19 }}>{t('scorePrivate')}</ThemedText>
    <ThemedText muted variant="caption" style={{ lineHeight: 19 }}>{t('scoreDisclaimer')}</ThemedText>
  </>;
}

/** How the Insight Score is worked out: the sums with the person's own numbers, the weights they can change, and the disclaimer. */
export function ScoreDetail() {
  const { store } = useWorkout();
  return <Screen title={t('scoreTitle')}>{store ? <Detail store={store} /> : <ThemedText muted>{t('scoreNoData')}</ThemedText>}</Screen>;
}
