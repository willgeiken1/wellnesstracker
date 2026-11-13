import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { Panel } from '@/components/card';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import type { TemplateExercise, WorkoutStore } from '@/data/workout/store';
import { useWorkout } from './use-workout';
import { layout } from './primitives';
import { Field, PageBar, Pick, Primary, Print, Round, Secondary, SectionTitle, Trouble, card, dayLabel, leave, minutesLabel, semibold, sessionPrint } from './parts';
import { SupersetControls } from './superset-controls';
import { RepRangeInput } from './rep-range-input';
import { RestOptions } from './rest-options';
import { ExercisePicker } from './picker';
import { Routines } from './routines';
import { PastDayChoice } from './days';
import { Cardio } from '../cardio/screen';
/** A finished workout's print at thumbnail size. Worked out once per saved change, not on every redraw of the list. */
function Thumb({ store, id }: { store: WorkoutStore; id: string }) {
  const data = useMemo(() => sessionPrint(store, id).data, [store, id]);
  return <Print data={data} width={36} height={36} />;
}
export function Workouts() {
  const {
      store
    } = useWorkout(),
    [segment, setSegment] = useState<'routines' | 'history' | 'cardio'>('routines'),
    [undo, setUndo] = useState<(() => void) | null>(null),
    [error, setError] = useState(false),
    { colors, radius } = useTheme();
  function run(action: () => void) {
    try {
      action();
      setError(false);
    } catch {
      setError(true);
    }
  }
  const history = store?.history() ?? [];
  return <Screen title={t('workouts')} tabHeader>
    <SegmentedControl label={t('segments')} options={(['routines', 'history', 'cardio'] as const).map(value => ({
      value,
      label: t(value)
    }))} value={segment} onChange={setSegment} />
    {error && <Trouble text={t('workoutSaveError')} />}
    {store?.active() && <Primary label={t('resumeWorkout')} onPress={() => router.push('/workout')} />}
    {segment === 'routines' && <Routines store={store} run={run} undo={undo} onUndo={restore => setUndo(() => restore)} />}
    {segment === 'history' && <>
      {store && history.length === 0 && <Panel testID="history-empty" style={card}>
        <ThemedText style={semibold}>{t('historyEmptyTitle')}</ThemedText>
        <ThemedText muted>{t('historyEmpty')}</ThemedText>
      </Panel>}
      {store && history.length > 0 && <Panel testID="history-list" style={[card, { gap: 0, paddingVertical: tokens.spacing[0] }]}>
        {history.map((s, index) => {
          const name = String(s.data.name ?? t('workoutName')), edited = store.edited(s.id);
          const facts = [dayLabel(s.data.day), minutesLabel(Number(s.data.duration_ms)), edited ? t('edited') : ''].filter(Boolean).join(' · ');
          return <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${name}, ${facts}`} onPress={() => router.push({
            pathname: '/workout/summary',
            params: {
              id: s.id
            }
          })} style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], paddingVertical: tokens.spacing[1], borderTopWidth: index ? 1 : 0, borderTopColor: colors['surface-2'], opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 44, height: 44, borderRadius: radius.card, backgroundColor: colors['surface-2'], padding: 4 }}>
              <Thumb store={store} id={s.id} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText variant="headline">{name}</ThemedText>
              <ThemedText muted numeric variant="caption">{facts}</ThemedText>
            </View>
            <Icon name="chevron" size={18} color={colors['text-muted']} />
          </Pressable>;
        })}
      </Panel>}
      <PastDayChoice />
    </>}
    {segment === 'cardio' && (store ? <Cardio key={store.repo.owner} repository={store.repo} /> : <Trouble text={t('localError')} />)}
  </Screen>;
}
export function TemplateEditor() {
  const {
      store
    } = useWorkout(),
    {
      id
    } = useLocalSearchParams<{
      id?: string;
    }>();
  return store ? <Editor key={id ?? 'new'} store={store} id={id} /> : <Screen topInset>
    <PageBar title={id ? t('editTemplate') : t('newTemplate')} left={<Round glyph="back" label={t('flowBack')} onPress={leave} />} />
    <Trouble text={t('localError')} />
  </Screen>;
}
function Editor({
  store,
  id
}: {
  store: WorkoutStore;
  id?: string;
}) {
  const {
    colors
  } = useTheme();
  const groupSequence = useRef(0);
  const [name, setName] = useState(id ? String(store.repo.get('routines', id)?.data.name ?? '') : ''),
    [exercises, setExercises] = useState<TemplateExercise[]>(id ? store.templateExercises(id).map(e => ({
      id: e.id,
      rep_min:e.data.rep_min as number | null, rep_max:e.data.rep_max as number | null, superset_group:e.data.superset_group as string | null,
      exercise: String(e.data.exercise),
      target_sets: Number(e.data.target_sets) || 3,
      target_reps: Number(e.data.target_reps) || 8
    })) : []),
    [picker, setPicker] = useState(false),
    [error, setError] = useState(false);
  function move(i: number, by: number) {
    const next = [...exercises];
    if (i + by < 0 || i + by >= next.length) return;
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setExercises(next);
  }
  const title = id ? t('editTemplate') : t('newTemplate');
  // Cancel sits in the bar with the title, where a sheet's Cancel always is; Save stays the one big button at the end.
  return <Screen topInset>
    <PageBar testID="template-bar" title={title} left={<Pick testID="template-cancel" text={t('cancel')} onPress={() => {
      if (router.canGoBack()) router.back();else router.replace('/workouts');
    }} />} />
    <Field onSurface={false} label={t('templateName')} placeholder={t('templateNameHint')} value={name} onChangeText={setName} />
    <SectionTitle>{t('summaryExercises')}</SectionTitle>
    {exercises.length === 0 && <Panel testID="template-empty" style={card}>
      <ThemedText style={semibold}>{t('templateEmpty')}</ThemedText>
      <ThemedText muted>{t('templateEmptyBody')}</ThemedText>
    </Panel>}
    {exercises.map((e, i) => <Panel key={e.id ?? i} testID={`template-exercise-${i}`} style={[card, { gap: tokens.spacing[2] }]}>
      <View style={[layout.row, { alignItems: 'flex-start' }]}>
        <View style={{ minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
          <ThemedText muted numeric variant="caption" style={semibold}>{i + 1}</ThemedText>
        </View>
        <ThemedText variant="headline" style={[semibold, { flex: 1, lineHeight: 28 }]}>{e.exercise}</ThemedText>
      </View>
      <View style={[layout.row, { alignItems: 'flex-start', gap: tokens.spacing[2] }]}>
      {(['target_sets', 'target_reps'] as const).map(field => <Field key={field} style={{
          flex: 1
        }} label={t(field === 'target_sets' ? 'targetSets' : 'targetReps')} accessibilityLabel={`${e.exercise} ${t(field === 'target_sets' ? 'targetSets' : 'targetReps')}`} keyboardType="number-pad" value={Number.isNaN(e[field]) ? '' : String(e[field])} onChangeText={text => setExercises(es => es.map((v, j) => j === i ? {
            ...v,
            [field]: text === '' ? NaN : Number(text)
          } : v))} />)}
    </View><RepRangeInput exercise={e.exercise} value={e} onChange={value => setExercises(es => es.map((v,j) => j === i ? {...v,...value} : v))} />
    <SupersetControls currentId={String(i)} items={exercises.map((v,j) => ({id:String(j),name:v.exercise,group:v.superset_group ?? null}))} onUnlink={() => setExercises(es => es.map(v => v.superset_group === e.superset_group ? {...v,superset_group:null} : v))} onLink={ids => setExercises(es => {
      const group = `superset:${Date.now()}:${++groupSequence.current}`;
      const oldGroups = new Set(es.filter((_,j) => ids.includes(String(j))).map(v => v.superset_group).filter(Boolean));
      return es.map((v,j) => ({...v,superset_group:ids.includes(String(j)) ? group : oldGroups.has(v.superset_group) ? null : v.superset_group}));
    })} />
    <RestOptions value={{seconds:e.restSeconds ?? store.rest(e.exercise).seconds, style:e.restStyle ?? store.rest(e.exercise).style}} onChange={value => setExercises(es => es.map((v,j) => j === i ? {...v,restSeconds:value.seconds,restStyle:value.style} : v))} />
    <View style={[layout.row, { flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors['surface-2'], paddingTop: tokens.spacing[0] }]}>
      <Pick onSurface text={t('moveUp')} label={`${t('moveUp')}, ${e.exercise}`} disabled={i === 0} onPress={() => move(i, -1)} />
      <Pick onSurface text={t('moveDown')} label={`${t('moveDown')}, ${e.exercise}`} disabled={i === exercises.length - 1} onPress={() => move(i, 1)} />
      <Pick onSurface text={t('remove')} label={`${t('remove')}, ${e.exercise}`} onPress={() => setExercises(es => es.filter((_, j) => j !== i).map(v => v.superset_group && es.filter(x => x.superset_group === v.superset_group).length === 2 && v.superset_group === e.superset_group ? {...v,superset_group:null} : v))} />
    </View></Panel>)}
    <Secondary label={t('addExercise')} onPress={() => setPicker(true)} />
    {error && <Trouble text={t('invalidTemplate')} />}
    <Primary label={t('saveTemplate')} onPress={() => {
      try {
        store.saveTemplate(name, exercises, id);
        router.back();
      } catch {
        setError(true);
      }
    }} />
    {picker && <ExercisePicker store={store} onClose={() => setPicker(false)} onPick={exercise => {
      setExercises(es => [...es, {
        exercise,
        target_sets: 3,
        target_reps: 8
      }]);
      setPicker(false);
    }} />}
  </Screen>;
}
