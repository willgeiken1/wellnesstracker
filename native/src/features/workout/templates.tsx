import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icon';
import { localDay } from '@/core/workout/rules';
import { RoutineMenu } from './routine-menu';
import { ContourThumbnail } from './summary';
import { WorkoutError, WorkoutUnavailable } from './view-state';
import { useRef, useState } from 'react';
import { Platform, Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { pluralize, t } from '@/i18n/en';
import type { TemplateExercise, WorkoutStore } from '@/data/workout/store';
import { useWorkout } from './use-workout';
import { layout, WorkoutPanel as Panel } from './primitives';
import { SupersetControls } from './superset-controls';
import { RepRangeInput } from './rep-range-input';
import { RestOptions } from './rest-options';
import { ExercisePicker } from './picker';
import { PlansPanel } from '../plans/panel';
import { PlanStore } from '../plans/store';
import { PastDayChoice } from './days';
import { Cardio } from '../cardio/screen';
export function Workouts() {
  const {store, auth} = useWorkout();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<'routines' | 'history' | 'cardio'>('routines');
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [error, setError] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const retry = useRef<() => void>(() => {});
  function run(action: () => void) {
    retry.current = () => run(action);
    try { action(); setError(false); } catch { setError(true); }
  }
  function start(id?: string) {
    if (!store) return;
    run(() => {
      const plans = new PlanStore(store.repo);
      if (id && !store.active() && plans.read().days.some(day => day.routineId === id)) plans.startDay(id);
      else store.start(id);
      router.push('/workout');
    });
  }
  const routines = store?.templates() ?? [];
  const plan = store ? new PlanStore(store.repo) : null;
  const nextId = plan?.read().days[plan.nextIndex()]?.routineId;
  const next = routines.find(r => r.id === nextId) ?? routines[0];
  const history = store?.history() ?? [];
  const rows = segment === 'routines' ? routines : segment === 'history' ? history : [];
  const unavailable = !store;
  const header = <View style={{gap:16, paddingBottom:16}}>
    {auth?.demo && <ThemedText variant="caption" style={{alignSelf:'flex-start',backgroundColor:colors['surface-2'],borderRadius:8,padding:8}}>Example data</ThemedText>}
    {auth?.syncStatus === 'offline' && <ThemedText muted variant="caption">Offline · logs save here and sync when you reconnect.</ThemedText>}
    <SegmentedControl label={t('segments')} options={(['routines','history','cardio'] as const).map(value => ({value,label:t(value)}))} value={segment} onChange={setSegment}/>
    {error && <WorkoutError onRetry={() => retry.current()}/>}
    {unavailable ? <WorkoutUnavailable auth={auth}/> : <>
      {store.active() && <Button label={t('resumeWorkout')} onPress={() => router.push('/workout')}/>}
      {segment === 'routines' && <>
        {next ? <Panel testID="up-next"><ThemedText style={trainStyles.label}>Up next</ThemedText>
          <ThemedText style={trainStyles.label}>{String(next.data.name)}</ThemedText>
          <ThemedText muted>{pluralize(store.templateExercises(next.id).length,'exercise')}</ThemedText>
          <Button label={t('startTemplate').replace('{name}',String(next.data.name))} onPress={() => start(next.id)}/>
        </Panel> : <Panel><Icon name="workouts"/><ThemedText>No routines yet</ThemedText></Panel>}
        <ThemedText style={trainStyles.label}>Routines</ThemedText>
      </>}
      {segment === 'history' && <><PastDayChoice/>{!history.length && <Panel><ThemedText>Your finished workouts show here</ThemedText></Panel>}</>}
      {segment === 'cardio' && <Cardio key={store.repo.owner} repository={store.repo}/>}
    </>}
  </View>;
  return <SafeAreaView edges={['left','right']} style={{flex:1,backgroundColor:colors.bg}}>
    <FlatList testID={segment === 'routines' ? 'routine-list' : 'history-list'} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
      contentContainerStyle={{padding:16,paddingBottom:32 + (Platform.OS === 'ios' ? 0 : insets.bottom)}} data={unavailable ? [] : rows} keyExtractor={row => row.id} ListHeaderComponent={header}
      renderItem={({item,index}) => {
        if (!store) return null;
        const name=String(item.data.name ?? t('workoutName'));
        if (segment === 'history') {
          const summary=store.summary(item.id);
          const date=new Date(`${item.data.day}T12:00:00`); date.setDate(date.getDate() - (date.getDay()+6)%7);
          const week=localDay(date);
          const prior=history[index-1];
          const priorDate=prior ? new Date(`${prior.data.day}T12:00:00`) : null;
          if (priorDate) priorDate.setDate(priorDate.getDate() - (priorDate.getDay()+6)%7);
          return <View>{(!priorDate || localDay(priorDate) !== week) && <ThemedText style={[trainStyles.label,{paddingVertical:12}]}>Week of {week}</ThemedText>}
            <TrainRow label={`${name} · ${item.data.day}${store.edited(item.id) ? ` · ${t('edited')}` : ''}`} onPress={() => router.push({pathname:'/workout/summary',params:{id:item.id}})}>
              <View style={{flex:1}}><ThemedText style={trainStyles.label}>{name}</ThemedText><ThemedText muted>{String(item.data.day)}</ThemedText><ThemedText muted numeric>{Math.round(summary.volume).toLocaleString()} {store.unit()} · {summary.prs.length} PRs</ThemedText></View>
              <ContourThumbnail compact/>
            </TrainRow></View>;
        }
        const last=history.find(s => s.data.routine_id === item.id);
        return <RoutineMenu edit={() => router.push({pathname:'/workout/template',params:{id:item.id}})} duplicate={() => run(() => {
          const exercises=store.templateExercises(item.id).map(e => ({exercise:String(e.data.exercise),target_sets:Number(e.data.target_sets),target_reps:Number(e.data.target_reps),rep_min:e.data.rep_min as number|null,rep_max:e.data.rep_max as number|null,superset_group:e.data.superset_group as string|null,restSeconds:store.rest(String(e.data.exercise)).seconds,restStyle:store.rest(String(e.data.exercise)).style}));
          store.saveTemplate(`${name} copy`,exercises);
        })} remove={() => Alert.alert('Delete routine',name,[{text:t('cancel'),style:'cancel'},{text:t('delete'),style:'destructive',onPress:() => run(() => {const restore=store.deleteTemplate(item.id);setUndo(() => restore);})}])}>
          {onLongPress => <TrainRow onLongPress={onLongPress} label={`${t('startTemplate').replace('{name}',name)} · ${last ? `${t('lastDone')} ${last.data.day}` : t('notYetDone')}`} onPress={() => start(item.id)}>
            <Icon name="workouts" color={colors.accent}/><View style={{flex:1}}><ThemedText style={trainStyles.label}>{name}</ThemedText><ThemedText muted variant="caption">{last ? `${t('lastDone')} ${last.data.day}` : t('notYetDone')}</ThemedText></View><Icon name="chevron" size={20}/>
          </TrainRow>}
        </RoutineMenu>;
      }}
      ListFooterComponent={<View style={{gap:16}}>{!unavailable && segment === 'routines' && <View style={{gap:16}}>
        <View><TrainRow label="New routine" onPress={() => router.push('/workout/template')}/><TrainRow label="Start empty workout" onPress={() => start()}/></View>
        {undo && <Button label={t('undoDelete')} variant="secondary" onPress={() => run(() => {undo();setUndo(null);})}/>}
        <Button label={t('editPlan')} variant="secondary" onPress={() => setShowPlan(!showPlan)}/>
        {showPlan && store && <PlansPanel store={store}/>}
      </View>}<Button label={t('backHome')} variant="secondary" onPress={() => router.navigate('/')}/></View>}/>
  </SafeAreaView>;
}
const trainStyles = {label:{fontSize:15,fontWeight:'600' as const}};
function TrainRow({label,onPress,onLongPress,children}: React.PropsWithChildren<{label:string;onPress:() => void;onLongPress?:() => void}>) {
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress} style={{minHeight:44,padding:12,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors['surface-2'],borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.bg}}>
  {children ?? <ThemedText style={trainStyles.label}>{label}</ThemedText>}
 </Pressable>;
}
export function TemplateEditor() {
  const {
      store, auth
    } = useWorkout(),
    {
      id
    } = useLocalSearchParams<{
      id?: string;
    }>();
  return store ? <Editor key={id ?? 'new'} store={store} id={id} /> : <Screen topInset><WorkoutUnavailable auth={auth}/><Button label={t('cancel')} variant="secondary" onPress={() => {if (router.canGoBack()) router.back(); else router.replace('/workouts');}}/></Screen>;
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
    [error, setError] = useState<'invalid' | 'save' | null>(null);
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
  return <Screen topInset title={id ? t('editTemplate') : t('newTemplate')}>
    <Button label={t('cancel')} variant="secondary" onPress={() => {
      if (router.canGoBack()) router.back();else router.replace('/workouts');
    }} />
    <TextInput accessibilityLabel={t('templateName')} placeholder={t('templateName')} placeholderTextColor={colors['text-muted']} style={inputStyle} value={name} onChangeText={setName} />
    {!exercises.length && <ThemedText muted>No exercises yet</ThemedText>}
    {exercises.map((e, i) => <Panel key={e.id ?? i}><ThemedText variant="headline">{e.exercise}</ThemedText><View style={layout.row}>
      {(['target_sets', 'target_reps'] as const).map(field => <View key={field} style={{
          flex: 1
        }}><ThemedText muted variant="caption">{t(field === 'target_sets' ? 'targetSets' : 'targetReps')}</ThemedText><TextInput accessibilityLabel={`${e.exercise} ${t(field === 'target_sets' ? 'targetSets' : 'targetReps')}`} keyboardType="number-pad" style={inputStyle} value={Number.isNaN(e[field]) ? '' : String(e[field])} onChangeText={text => setExercises(es => es.map((v, j) => j === i ? {
            ...v,
            [field]: text === '' ? NaN : Number(text)
          } : v))} /></View>)}
    </View><RepRangeInput exercise={e.exercise} value={e} onChange={value => setExercises(es => es.map((v,j) => j === i ? {...v,...value} : v))} />
    <SupersetControls currentId={String(i)} items={exercises.map((v,j) => ({id:String(j),name:v.exercise,group:v.superset_group ?? null}))} onUnlink={() => setExercises(es => es.map(v => v.superset_group === e.superset_group ? {...v,superset_group:null} : v))} onLink={ids => setExercises(es => {
      const group = `superset:${Date.now()}:${++groupSequence.current}`;
      const oldGroups = new Set(es.filter((_,j) => ids.includes(String(j))).map(v => v.superset_group).filter(Boolean));
      return es.map((v,j) => ({...v,superset_group:ids.includes(String(j)) ? group : oldGroups.has(v.superset_group) ? null : v.superset_group}));
    })} />
    <RestOptions value={{seconds:e.restSeconds ?? store.rest(e.exercise).seconds, style:e.restStyle ?? store.rest(e.exercise).style}} onChange={value => setExercises(es => es.map((v,j) => j === i ? {...v,restSeconds:value.seconds,restStyle:value.style} : v))} /><View style={layout.row}><Button label={t('moveUp')} variant="secondary" onPress={() => move(i, -1)} /><Button label={t('moveDown')} variant="secondary" onPress={() => move(i, 1)} /><Button label={t('remove')} variant="secondary" onPress={() => setExercises(es => es.filter((_, j) => j !== i).map(v => v.superset_group && es.filter(x => x.superset_group === v.superset_group).length === 2 && v.superset_group === e.superset_group ? {...v,superset_group:null} : v))} /></View></Panel>)}
    {error && <ThemedText accessibilityRole="alert">{error === 'invalid' ? t('invalidTemplate') : 'Could not save this routine.'}</ThemedText>}
    <Button label={t('addExercise')} variant="secondary" onPress={() => setPicker(true)} />
    <Button label={error ? 'Try again' : t('saveTemplate')} onPress={() => {
      try {
        store.saveTemplate(name, exercises, id);
        router.back();
      } catch (failure) {
        setError(failure instanceof Error && ['Invalid template.','Invalid rep range.','Invalid superset.'].includes(failure.message) ? 'invalid' : 'save');
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
