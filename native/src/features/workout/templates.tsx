import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import type { TemplateExercise, WorkoutStore } from '@/data/workout/store';
import { useWorkout } from './use-workout';
import { layout, Panel } from './primitives';
import { ExercisePicker } from './picker';
export function Workouts() {
  const {
      store
    } = useWorkout(),
    [segment, setSegment] = useState<'routines' | 'history' | 'cardio'>('routines'),
    [undo, setUndo] = useState<(() => void) | null>(null),
    [error, setError] = useState(false);
  function run(action: () => void) {
    try {
      action();
      setError(false);
    } catch {
      setError(true);
    }
  }
  return <Screen title={t('workouts')} tabHeader>
    <SegmentedControl label={t('segments')} options={(['routines', 'history', 'cardio'] as const).map(value => ({
      value,
      label: t(value)
    }))} value={segment} onChange={setSegment} />
    {error && <ThemedText accessibilityRole="alert">{t('workoutSaveError')}</ThemedText>}
    {store?.active() && <Button label={t('resumeWorkout')} onPress={() => router.push('/workout')} />}
    {segment === 'routines' && <>
      <Button label={t('startEmpty')} onPress={() => run(() => {
        store?.start();
        router.push('/workout');
      })} />
      <Button label={t('newTemplate')} variant="secondary" onPress={() => router.push('/workout/template')} />
      {store?.templates().map(r => {
        const last = store.history().find(s => s.data.routine_id === r.id);
        return <Panel key={r.id}>
        <ThemedText variant="headline">{String(r.data.name)}</ThemedText><ThemedText muted variant="caption">{store.templateExercises(r.id).length} {t('exercises')} · {last ? `${t('lastDone')} ${last.data.day}` : t('notYetDone')}</ThemedText>
        <View style={layout.row}><View style={{
              flex: 1
            }}><Button label={t('startTemplate').replace('{name}', String(r.data.name))} onPress={() => run(() => {
                store.start(r.id);
                router.push('/workout');
              })} /></View><Button label={t('edit')} variant="secondary" onPress={() => router.push({
              pathname: '/workout/template',
              params: {
                id: r.id
              }
            })} /></View>
        <View style={layout.row}><Button label={t('moveUp')} variant="secondary" onPress={() => run(() => store.moveTemplate(r.id, -1))} /><Button label={t('moveDown')} variant="secondary" onPress={() => run(() => store.moveTemplate(r.id, 1))} /><Button label={t('delete')} variant="secondary" onPress={() => Alert.alert(t('deleteTemplate'), String(r.data.name), [{
              text: t('cancel'),
              style: 'cancel'
            }, {
              text: t('delete'),
              onPress: () => run(() => {
                const restore = store.deleteTemplate(r.id);
                setUndo(() => restore);
              })
            }])} /></View>
      </Panel>;
      })}
      {undo && <Button label={t('undoDelete')} variant="secondary" onPress={() => run(() => {
        undo();
        setUndo(null);
      })} />}
    </>}
    {segment === 'history' && <>{store?.history().length === 0 && <ThemedText muted>{t('historyEmpty')}</ThemedText>}{store?.history().map(s => <Button key={s.id} label={`${s.data.name ?? t('workoutName')} · ${s.data.day}`} variant="secondary" onPress={() => router.push({
        pathname: '/workout/summary',
        params: {
          id: s.id
        }
      })} />)}</>}
    {segment === 'cardio' && <ThemedText muted>{t('cardioLater')}</ThemedText>}
    <Button label={t('backHome')} variant="secondary" onPress={() => router.navigate('/')} />
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
  return store ? <Editor key={id ?? 'new'} store={store} id={id} /> : <Screen><ThemedText>{t('localError')}</ThemedText></Screen>;
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
  const [name, setName] = useState(id ? String(store.repo.get('routines', id)?.data.name ?? '') : ''),
    [exercises, setExercises] = useState<TemplateExercise[]>(id ? store.templateExercises(id).map(e => ({
      id: e.id,
      exercise: String(e.data.exercise),
      target_sets: Number(e.data.target_sets) || 3,
      target_reps: Number(e.data.target_reps) || 8
    })) : []),
    [picker, setPicker] = useState(false),
    [error, setError] = useState(false);
  const inputStyle = [layout.input, {
    color: colors.text,
    backgroundColor: colors['surface-2']
  }];
  function move(i: number, by: number) {
    const next = [...exercises];
    if (i + by < 0 || i + by >= next.length) return;
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setExercises(next);
  }
  return <Screen title={id ? t('editTemplate') : t('newTemplate')}>
    <Button label={t('cancel')} variant="secondary" onPress={() => {
      if (router.canGoBack()) router.back();else router.replace('/workouts');
    }} />
    <TextInput accessibilityLabel={t('templateName')} placeholder={t('templateName')} placeholderTextColor={colors['text-muted']} style={inputStyle} value={name} onChangeText={setName} />
    {exercises.map((e, i) => <Panel key={e.id ?? i}><ThemedText variant="headline">{e.exercise}</ThemedText><View style={layout.row}>
      {(['target_sets', 'target_reps'] as const).map(field => <View key={field} style={{
          flex: 1
        }}><ThemedText muted variant="caption">{t(field === 'target_sets' ? 'targetSets' : 'targetReps')}</ThemedText><TextInput accessibilityLabel={`${e.exercise} ${t(field === 'target_sets' ? 'targetSets' : 'targetReps')}`} keyboardType="number-pad" style={inputStyle} value={Number.isNaN(e[field]) ? '' : String(e[field])} onChangeText={text => setExercises(es => es.map((v, j) => j === i ? {
            ...v,
            [field]: text === '' ? NaN : Number(text)
          } : v))} /></View>)}
    </View><View style={layout.row}><Button label={t('moveUp')} variant="secondary" onPress={() => move(i, -1)} /><Button label={t('moveDown')} variant="secondary" onPress={() => move(i, 1)} /><Button label={t('remove')} variant="secondary" onPress={() => setExercises(es => es.filter((_, j) => j !== i))} /></View></Panel>)}
    {error && <ThemedText accessibilityRole="alert">{t('invalidTemplate')}</ThemedText>}
    <Button label={t('addExercise')} variant="secondary" onPress={() => setPicker(true)} />
    <Button label={t('saveTemplate')} onPress={() => {
      try {
        store.saveTemplate(name, exercises, id);
        router.back();
      } catch {
        setError(true);
      }
    }} />
    {picker && <ExercisePicker onClose={() => setPicker(false)} onPick={exercise => {
      setExercises(es => [...es, {
        exercise,
        target_sets: 3,
        target_reps: 8
      }]);
      setPicker(false);
    }} />}
  </Screen>;
}
