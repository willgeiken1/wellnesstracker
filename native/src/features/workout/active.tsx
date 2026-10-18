import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { exerciseFor } from '@/core/workout/library';
import { displayWeight, nextField, validateSet } from '@/core/workout/rules';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { equipmentLabel, t } from '@/i18n/en';
import { useWorkout } from './use-workout';
import { SyncBadge } from './badge';
import { clock, IconButton, layout, Line, Panel } from './primitives';
import { Keypad, type Cursor } from './keypad';
import { ExercisePicker } from './picker';
import { SetRow } from './set-row';
import { RestTimer } from './timer';
import { FinishSheet } from './finish';
import { tick } from './haptics';
export function ActiveWorkout() {
  const {
      store,
      auth
    } = useWorkout(),
    {
      routine
    } = useLocalSearchParams<{
      routine?: string;
    }>(),
    [error, setError] = useState(false),
    started = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !store || started.current) return;
      started.current = true;
      try {
        store.start(routine);
      } catch {
        setError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [store, routine]);
  const session = store?.active();
  return store && session ? <Logger store={store} session={session} pending={auth.pending} status={auth.syncStatus} /> : <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{
    flex: 1
  }}><ThemedText>{error ? t('workoutSaveError') : t('workout')}</ThemedText><Button label={t('closeWorkout')} onPress={closeWorkout} /></SafeAreaView>;
}
function closeWorkout() {
  router.replace('/');
}
function Logger({
  store,
  session,
  pending,
  status
}: {
  store: WorkoutStore;
  session: Row;
  pending: number;
  status: 'idle' | 'syncing' | 'offline';
}) {
  useKeepAwake('workout');
  const {
    colors
  } = useTheme();
  const [now, setNow] = useState(() => Date.now()),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [value, setValue] = useState(''),
    [picker, setPicker] = useState(false),
    [finish, setFinish] = useState(false),
    [error, setError] = useState<string | null>(null),
    [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const entries = store.entries(session.id),
    drafts = entries.flatMap(e => store.drafts(e.id)),
    done = drafts.filter(d => d.setId).length,
    total = drafts.length;
  function run(action: () => void) {
    try {
      action();
      setError(null);
    } catch {
      setError(t('workoutSaveError'));
    }
  }
  function edit(entryId: string, index: number, field: 'weight' | 'reps') {
    const d = store.drafts(entryId)[index];
    setCursor({
      entryId,
      index,
      field
    });
    setValue(store.repo.localGet<string | null>(`input:${entryId}:${index}:${field}`) ?? d[field]);
  }
  function input(text: string) {
    if (!cursor) return;
    setValue(text);
    run(() => {
      store.repo.localSave(`input:${cursor.entryId}:${cursor.index}:${cursor.field}`, text);
      const d = store.drafts(cursor.entryId)[cursor.index];
      if (!d.setId) store.editDraft(cursor.entryId, cursor.index, {
        [cursor.field]: text
      });
    });
  }
  function next() {
    if (!cursor) return;
    const d = store.drafts(cursor.entryId)[cursor.index];
    if (d.setId && !validateSet(cursor.field === 'weight' ? value : d.weight, cursor.field === 'reps' ? value : d.reps, store.unit()).valid) {
      setError(t('invalidSet'));
      return;
    }
    const commit = () => {
      try {
        if (value !== d[cursor.field]) store.editDraft(cursor.entryId, cursor.index, {
          [cursor.field]: value
        });
        store.repo.localSave(`input:${cursor.entryId}:${cursor.index}:${cursor.field}`, null);
        const next = nextField(cursor.field, cursor.index, store.drafts(cursor.entryId).length);
        if (next) edit(cursor.entryId, next.index, next.field);else {
          const i = entries.findIndex(e => e.id === cursor.entryId);
          if (i + 1 < entries.length) edit(entries[i + 1].id, 0, 'weight');else setCursor(null);
        }
        setError(null);
      } catch {
        setError(t('workoutSaveError'));
      }
    };
    const baseline = store.sets(cursor.entryId).find(s => s.id === d.setId);
    const check = validateSet(cursor.field === 'weight' ? value : d.weight, cursor.field === 'reps' ? value : d.reps, store.unit(), baseline ? Number(baseline.data.weight_kg) : undefined);
    if (d.setId && value !== d[cursor.field] && check.warning) Alert.alert(t('checkSet'), t(check.warning), [{
      text: t('cancel'),
      style: 'cancel'
    }, {
      text: t('saveSet'),
      onPress: commit
    }]);else commit();
  }
  function mark(entry: Row, index: number) {
    const d = store.drafts(entry.id)[index],
      sg = store.suggestion(entry);
    const effective = {
      ...d,
      weight: d.weight || String(sg.weight ?? '')
    };
    const check = validateSet(effective.weight, effective.reps, store.unit(), store.previous(entry)[index] ? Number(store.previous(entry)[index].data.weight_kg) : undefined);
    if (!d.setId && !check.valid) {
      setError(t('invalidSet'));
      return;
    }
    const save = () => run(() => {
      if (!d.setId && !d.weight) store.editDraft(entry.id, index, {
        weight: effective.weight
      });
      if (store.toggleDone(entry.id, index)) tick(store.repo);
    });
    if (!d.setId && check.warning) Alert.alert(t('checkSet'), t(check.warning), [{
      text: t('cancel'),
      style: 'cancel'
    }, {
      text: t('saveSet'),
      onPress: save
    }]);else save();
  }
  const current = cursor ? entries.find(e => e.id === cursor.entryId) : undefined;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{
    flex: 1,
    backgroundColor: colors.bg
  }}>
    <View style={[layout.content, {
      paddingBottom: 8
    }]}>
      <View style={layout.row}><IconButton name="down" label={t('closeWorkout')} onPress={closeWorkout} /><View style={{
          flex: 1,
          alignItems: 'center'
        }}>{session.data.origin === 'template' && <ThemedText muted variant="caption">{t('template')}</ThemedText>}<ThemedText variant="headline">{String(session.data.name ?? t('workoutName'))}</ThemedText></View><Button testID="finish-button" label={t('finish')} onPress={() => {
          store.updateTimer({
            minimized: true
          });
          setFinish(true);
        }} /></View>
      <View style={[layout.row, {
        justifyContent: 'space-between',
        flexWrap: 'wrap'
      }]}><ThemedText muted numeric variant="caption">{clock((now - Number(session.data.started_at)) / 1000)} · {t('set')} {Math.min(done + 1, total)} {t('of')} {total}</ThemedText><SyncBadge local={['demo', 'guest'].includes(store.repo.owner)} pending={pending} status={status} /></View>
      <View accessibilityRole="progressbar" accessibilityValue={{
        min: 0,
        max: total,
        now: done
      }} style={{
        height: 4,
        borderRadius: 4,
        backgroundColor: colors['surface-2']
      }}><View style={{
          height: 4,
          borderRadius: 4,
          backgroundColor: colors.accent,
          width: `${total ? done / total * 100 : 0}%`
        }} /></View>
      {error && <ThemedText accessibilityRole="alert" variant="caption">{error}</ThemedText>}
    </View>
    <ScrollView contentContainerStyle={layout.content}>
      {entries.map((e, exerciseIndex) => {
        const ds = store.drafts(e.id),
          complete = ds.length > 0 && ds.every(d => d.setId),
          collapsed = complete && !open.includes(e.id),
          sg = store.suggestion(e),
          previous = store.previous(e);
        return <Panel key={e.id}>
          <View style={layout.row}>{complete && <Line name="check" color={colors.accent} />}<View style={{
              flex: 1
            }}><ThemedText variant="headline">{String(e.data.exercise)}</ThemedText><ThemedText muted variant="caption">{equipmentLabel(exerciseFor(String(e.data.exercise)).equipment)} · {ds.length} {t('sets')}</ThemedText></View>
            {complete && <IconButton name="down" label={t(collapsed ? 'expandExercise' : 'collapseExercise')} onPress={() => setOpen(ids => ids.includes(e.id) ? ids.filter(id => id !== e.id) : [...ids, e.id])} />}
            <IconButton name="more" label={`${e.data.exercise}, ${t('exerciseOptions')}`} onPress={() => Alert.alert(String(e.data.exercise), undefined, [{
              text: t('addSet'),
              onPress: () => run(() => store.addSet(e.id))
            }, {
              text: t('moveUp'),
              onPress: () => run(() => store.moveEntry(e.id, -1))
            }, {
              text: t('moveDown'),
              onPress: () => run(() => store.moveEntry(e.id, 1))
            }, {
              text: t('removeExercise'),
              onPress: () => Alert.alert(t('removeExercise'), t('removeExerciseBody'), [{
                text: t('cancel'),
                style: 'cancel'
              }, {
                text: t('remove'),
                onPress: () => run(() => store.removeExercise(e.id))
              }])
            }, {
              text: t('cancel'),
              style: 'cancel'
            }])} />
          </View>
          {!collapsed && <>
            <View style={layout.row}><ThemedText muted variant="caption" style={{
                width: 36
              }}>{t('setHeader')}</ThemedText><ThemedText muted variant="caption" style={{
                flex: 1
              }}>{t('previous')}</ThemedText><ThemedText muted variant="caption" style={{
                flex: 1,
                textAlign: 'center'
              }}>{store.unit().toUpperCase()}</ThemedText><ThemedText muted variant="caption" style={{
                flex: 1,
                textAlign: 'center'
              }}>{t('repsHeader')}</ThemedText><View style={{
                width: 44
              }}><Line name="check" color={colors['text-muted']} /></View></View>
            {ds.map((d, i) => <SetRow key={d.setId ?? i} exerciseIndex={exerciseIndex} exercise={String(e.data.exercise)} index={i} draft={d} previous={previous.find(s => Number(s.data.position) === i) ? `${displayWeight(Number(previous.find(s => Number(s.data.position) === i)!.data.weight_kg), store.unit())} × ${previous.find(s => Number(s.data.position) === i)!.data.reps}` : ''} hint={sg.jump && sg.weight !== null ? String(sg.weight) : previous.find(s => Number(s.data.position) === i) ? String(displayWeight(Number(previous.find(s => Number(s.data.position) === i)!.data.weight_kg), store.unit())) : sg.weight === null ? '' : String(sg.weight)} onEdit={field => edit(e.id, i, field)} onDone={() => mark(e, i)} onRemove={() => Alert.alert(t('removeSet'), undefined, [{
              text: t('cancel'),
              style: 'cancel'
            }, {
              text: t('remove'),
              onPress: () => run(() => store.removeSet(e.id, i))
            }])} />)}
            <JumpCard store={store} entry={e} />
          </>}
        </Panel>;
      })}
      {!entries.length && <ThemedText muted>{t('emptyWorkout')}</ThemedText>}
      <Button label={t('addExercise')} variant="secondary" onPress={() => {
        store.updateTimer({
          minimized: true
        });
        setPicker(true);
      }} />
    </ScrollView>
    <RestTimer store={store} hidden={!!cursor || finish || picker} />
    {picker && <ExercisePicker onClose={() => setPicker(false)} onPick={name => run(() => {
      store.addExercise(session.id, name);
      setPicker(false);
    })} />}
    {cursor && current && <Keypad inputId={`${cursor.entryId}:${cursor.index}:${cursor.field}`} label={`${current.data.exercise} · ${t('set')} ${cursor.index + 1} · ${t(cursor.field)}`} field={cursor.field} unit={store.unit()} equipment={exerciseFor(String(current.data.exercise)).equipment} value={value} previous={store.previous(current)[cursor.index] ? `${displayWeight(Number(store.previous(current)[cursor.index].data.weight_kg), store.unit())} × ${store.previous(current)[cursor.index].data.reps}` : ''} onChange={input} onNext={next} onClose={() => setCursor(null)} />}
    {finish && <FinishSheet store={store} session={session} onClose={() => setFinish(false)} />}
  </SafeAreaView>;
}
function JumpCard({
  store,
  entry
}: {
  store: WorkoutStore;
  entry: Row;
}) {
  const [visible, setVisible] = useState(() => store.showCard(entry));
  const {
    colors
  } = useTheme();
  const entryId = entry.id;
  useEffect(() => {
    if (visible) {
      const current = store.repo.get('entries', entryId);
      if (current && store.showCard(current)) store.markCard(current);
    }
  }, [store, entryId, visible]);
  const sg = store.suggestion(entry);
  if (!visible || !sg.jump) return null;
  return <View style={[layout.card, {
    backgroundColor: `${colors.accent}22`
  }]}><View style={layout.row}><Line name="trend" color={colors.accent} /><ThemedText style={{
        flex: 1
      }}>{t('jumpExplanation').replace('{weight}', String(sg.weight)).replace('{unit}', store.unit()).replace('{reps}', String(sg.target)).replace('{previous}', String(sg.previous)).replace('{count}', String(sg.count))}</ThemedText><IconButton name="close" label={t('dismissSuggestion')} onPress={() => setVisible(false)} /></View></View>;
}
