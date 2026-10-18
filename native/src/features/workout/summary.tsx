import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { displayWeight, fromKg } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { t } from '@/i18n/en';
import { useWorkout, useWorkoutStore } from './use-workout';
import { Line, Panel, clock, layout } from './primitives';
import { signatureBuzz } from './haptics';
export function SummitToken({
  fresh = false
}: {
  fresh?: boolean;
}) {
  const {
    colors
  } = useTheme();
  return <View style={{
    width: 64,
    height: 64
  }}><Svg accessible={false} width={64} height={64} viewBox="0 0 64 64"><Circle cx={32} cy={32} r={30} fill={colors.accent} opacity={fresh ? .3 : .1} /><Circle cx={32} cy={32} r={23} fill={colors.accent} opacity={fresh ? .7 : .25} /><Circle cx={32} cy={32} r={18} fill="none" stroke={colors.accent} /><Path d="M18 43L32 19L46 43Z" fill="none" stroke={colors.text} strokeWidth={1.5} />{fresh && <Path d="M50 6V18M44 12H56" stroke={colors.accent} strokeWidth={2} />}</Svg></View>;
}
export function Summary() {
  const {
      store
    } = useWorkout(),
    {
      id
    } = useLocalSearchParams<{
      id: string;
    }>();
  return store && id && store.repo.get('sessions', id) ? <WorkoutSummary store={store} id={id} /> : <Screen topInset><Button testID="summary-done" label={t('done')} onPress={() => router.replace('/')} /></Screen>;
}
export function WorkoutSummary({
  store: source,
  id
}: {
  store: WorkoutStore;
  id: string;
}) {
  const store = useWorkoutStore(source.repo);
  const {
    colors,
    reduceMotion,
    reduceMotionReady
  } = useTheme();
  const repo = store.repo;
  const data = store.summary(id),
    s = data.session;
  useEffect(() => {
    if (!reduceMotionReady || !data.prs.length || repo.localGet(`buzz:${id}`)) return;
    repo.localSave(`buzz:${id}`, true);
    if (!reduceMotion) return signatureBuzz(repo);
  }, [repo, id, data.prs.length, reduceMotion, reduceMotionReady]);
  return <Screen topInset>
    <ThemedText muted style={{
      textAlign: 'center'
    }}>{t('savedHistory')}</ThemedText>
    <ThemedText muted variant="caption">{t('workoutComplete')}</ThemedText>
    <ThemedText variant="display">{String(s.data.name ?? t('workoutName'))}</ThemedText>
    <ThemedText muted>{new Date(Number(s.data.started_at)).toLocaleDateString()} · {new Date(Number(s.data.started_at)).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}–{new Date(Number(s.data.finished_at)).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}</ThemedText>
    <Panel><View style={[layout.row, {
        flexWrap: 'wrap',
        justifyContent: 'space-around'
      }]}>{[[clock(Number(s.data.duration_ms) / 1000), t('time')], [Math.round(data.volume).toLocaleString(), `${t('volume')}, ${store.unit()}`], [String(data.count), t('sets')], [String(data.prs.length), t('prs')]].map(([value, label]) => <View key={label} style={{
          alignItems: 'center',
          padding: 4
        }}><ThemedText numeric variant="title">{value}</ThemedText><ThemedText muted variant="caption">{label}</ThemedText></View>)}</View></Panel>
    {data.prs.map(pr => <Panel key={pr.exercise}><View style={layout.row}><SummitToken fresh /><View style={{
          flex: 1,
          gap: 8
        }}><View style={[layout.row, {
            alignSelf: 'flex-start',
            backgroundColor: colors.accent,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 5
          }]}><Line name="summit" color={colors['on-accent']} /><ThemedText style={{
              color: colors['on-accent']
            }}>{t('newPR')}</ThemedText></View><ThemedText variant="headline">{pr.exercise} · {displayWeight(pr.displayWeight, store.unit())} × {pr.bestReps} {store.unit()}</ThemedText><ThemedText muted>{t('est1RM')} ≈ {Math.round(fromKg(pr.bestE1rm, store.unit()))} {store.unit()}</ThemedText></View></View></Panel>)}
    <Panel><ThemedText variant="headline">{t('milestonesShelf')}</ThemedText><ThemedText muted variant="caption">{store.milestones().length} {t('tokens')}</ThemedText><View style={[layout.row, {
        flexWrap: 'wrap'
      }]}>{store.milestones().map(token => <View key={`${token.sessionId}:${token.exercise}`} accessible accessibilityLabel={`${token.exercise}, ${t('summitToken')}`}><SummitToken fresh={token.sessionId === id} /></View>)}</View>{data.prs.length > 0 && <ThemedText muted variant="caption">{t('added')}: {data.prs.map(p => p.exercise).join(', ')}</ThemedText>}</Panel>
    {!!s.data.notes && <Panel><ThemedText>{String(s.data.notes)}</ThemedText></Panel>}
    <Button testID="summary-done" label={t('done')} onPress={() => router.canDismiss() ? router.dismissAll() : router.replace('/')} />
  </Screen>;
}
