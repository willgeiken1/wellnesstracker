import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ThemedText } from '../../../components/themed-text';
import { useTheme } from '../../../design/theme-provider';
import type { WorkoutStore } from '../../../data/workout/store';
import { t } from '../../../i18n/en';
import { FoodAiConsent } from '../../food/ai/privacy';
import { aiState, setConsent } from '../../food/ai/service';
import { useFoodRevision } from '../../food/use-food-revision';
import { createLocalWorkoutAiClient, WorkoutSummaryLimitError } from './client';
import type { WorkoutAiClient } from './client';
import { WorkoutSummaryService, savedWorkoutSummary, rateWorkoutSummary } from './service';
import { SummaryLengthPicker } from './length-picker';
export const WorkoutAiClientContext = createContext<WorkoutAiClient | null>(null);
/** Explicit user action only; static styling respects Reduce Motion by construction.
 * The same screen is opened from Finish and History; local summaries survive it. */
export function WorkoutAiCard({ store, id }: {
    store: WorkoutStore;
    id: string;
}) {
    'use no memo';
    const repo = store.repo;
    useFoodRevision(repo);
    const { colors } = useTheme(), injected = useContext(WorkoutAiClientContext);
    const client = useMemo(() => injected ?? createLocalWorkoutAiClient(repo), [repo, injected]);
    const service = useMemo(() => new WorkoutSummaryService(repo, client), [repo, client]);
    const [busy, setBusy] = useState(false), [consent, setSheet] = useState(false), [error, setError] = useState<string | null>(null), [showFacts, setShowFacts] = useState(false);
    const mounted = useRef(true), inFlight = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; service.cancel(); };
    }, [service, id]);
    const saved = savedWorkoutSummary(repo, id);
    const run = async () => {
        if (inFlight.current)
            return;
        inFlight.current = true;
        setBusy(true);
        setError(null);
        try {
            await service.generate(id);
        }
        catch (error) {
            if (mounted.current)
                setError(error instanceof WorkoutSummaryLimitError ? t('workoutAiLimit') : error instanceof Error && error.message === t('workoutAiChanged') ? t('workoutAiChanged') : t('workoutAiFailure'));
        }
        finally {
            inFlight.current = false;
            if (mounted.current)
                setBusy(false);
        }
    };
    return <View testID="workout-ai-card" style={{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: colors['accent-tint'] }}>
    <ThemedText style={{ color: colors['accent-2'], fontWeight: '600' }}>{t('workoutAiTitle')}</ThemedText>
    {saved && <>
      <ThemedText testID="workout-ai-text" accessibilityLabel={`${t('workoutAiTitle')}: ${saved.summary}`} style={{ color: colors['accent-2'] }}>{saved.summary}</ThemedText>
      <ThemedText variant="caption">{t('workoutAiSaved')}</ThemedText>
      <View style={{ gap: 8 }}>
        <Button label={t('workoutAiThumbsUp')} variant="secondary" selected={saved.feedback === 'up'} onPress={() => rateWorkoutSummary(repo, id, 'up')}/>
        <Button label={t('workoutAiThumbsDown')} variant="secondary" selected={saved.feedback === 'down'} onPress={() => rateWorkoutSummary(repo, id, 'down')}/>
      </View>
      <ThemedText variant="caption">{t('workoutAiFeedbackHint')}</ThemedText>
    </>}
    <ThemedText variant="caption">{t('workoutAiSaw')}</ThemedText>
    {saved && <>
      <Button label={t('workoutAiShowFacts')} variant="secondary" selected={showFacts} onPress={() => setShowFacts(value => !value)}/>
      {showFacts && saved.facts.exercises.map((exercise, index) => <ThemedText key={index} variant="caption">{t('workoutAiFact').replace('{name}', exercise.name).replace('{sets}', String(exercise.sets)).replace('{reps}', String(exercise.reps)).replace('{volume}', String(Math.round(exercise.volume * 100) / 100))}</ThemedText>)}
    </>}
    <SummaryLengthPicker repo={repo} disabled={busy}/>
    <ThemedText variant="caption">{t('workoutAiLimitHint')}</ThemedText>
    {busy && <ThemedText accessibilityLiveRegion="polite">{t('workoutAiReading')}</ThemedText>}
    {error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    <Button label={t(saved ? 'workoutAiRegenerate' : 'workoutAiGenerate')} disabled={busy} onPress={() => {
            if (aiState(repo).consent)
                void run();
            else
                setSheet(true);
        }}/>
    {consent && <FoodAiConsent onCancel={() => setSheet(false)} onAccept={() => {
                try {
                    setConsent(repo, true);
                    setSheet(false);
                    void run();
                }
                catch {
                    setError(t('workoutAiFailure'));
                }
            }}/>}
  </View>;
}
