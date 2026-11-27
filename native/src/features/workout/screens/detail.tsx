import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { List, ListRow } from '@/components/list-row';
import { NavBar, NavButton } from '@/components/nav-bar';
import { SectionHeader } from '@/components/section';
import { Tappable } from '@/components/tappable';
import { KitText } from '@/components/themed-text';
import { useKit } from '@/components/kit-style';
import { useTheme } from '@/design/theme-provider';
import type { WorkoutStore } from '@/data/workout/store';
import type { Unit } from '@/core/workout/rules';
import { showToast } from '@/features/shell/toast';
import { actionSheet } from '../action-sheet';
import { setText, weightText } from '../set-text';
import { clockTime, dayLabel } from '../training-data';
import { tr, trCount } from '../tr';
import { PrBadge, useTrainingData } from '../training-viz';
import { discardSession, exLabel } from '../logger/model';
import { trainingNav, trainingRoutes } from '../nav';
import { repeatSession } from '../start-workout';
import { sessionResult, type ResultExercise } from './model';
import { EyebrowLine, Page, StatsCard } from './page';

/** A finished workout as a template: its exercises in order with the sets done, keeping a plan day's rows and rep ranges. */
export function templateFrom(store: WorkoutStore, sessionId: string, routineId?: string | null) {
  const prior = routineId ? store.templateExercises(routineId) : [], used = new Set<string>();
  const rows = store.entries(sessionId).flatMap(e => {
    const name = String(e.data.exercise), done = store.working(e).filter(s => !s.warmup && s.reps > 0);
    if (!done.length) return [];
    const row = prior.find(r => !used.has(r.id) && String(r.data.exercise).toLowerCase() === name.toLowerCase());
    if (row) used.add(row.id);
    // The template row already carries its own options (rep range, superset), read through the store.
    const num = (v: unknown) => v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
    const group = row ? (row.data.superset_group as string | null | undefined) ?? null : store.supersetGroup(e);
    return [{ id: row?.id, exercise: name, target_sets: Math.min(100, done.length), target_reps: row ? Number(row.data.target_reps) || 8 : Math.min(100, Math.max(...done.map(s => s.reps))),
      rep_min: row ? num(row.data.rep_min) : undefined, rep_max: row ? num(row.data.rep_max) : undefined, superset_group: group }];
  });
  // A superset left with one logged exercise is no superset.
  return rows.map(r => r.superset_group && rows.filter(x => x.superset_group === r.superset_group).length < 2 ? { ...r, superset_group: null } : r);
}

/** A past workout (`workout-detail`): its numbers, any record, notes, every exercise's sets, and start again, save as a template or delete. */
export function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useTrainingData(), k = useKit();
  const res = data && id ? sessionResult(data, id) : null;
  const back = <NavBar back={tr('trainingTitle')} />;
  if (!data || !res) return <Page nav={back}><EmptyState title={tr('trainingWorkoutNotFound')} description={tr('trainingNotFoundSub')} icon="workouts" color="training" /></Page>;
  const store = data.workout, u = res.unit, pr = res.prs[0];
  const routine = res.routineId ? data.repo.get('routines', res.routineId) : undefined;
  const template = routine && routine.deleted_at === null ? String(routine.data.name ?? '') : '';
  const saveTemplate = () => {
    try {
      store.saveTemplate(template || res.name, templateFrom(store, res.id, template ? res.routineId : null), template ? res.routineId! : undefined);
      showToast(template ? tr('trainingTemplateUpdated', { name: template }) : tr('trainingTemplateSaved'), { color: 'training' });
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const remove = () => actionSheet({ title: tr('trainingDeleteTitle', { name: res.name }), message: tr('trainingDeleteBody'),
    actions: [{ label: tr('trainingDeleteWorkout'), destructive: true, run: () => { discardSession(store, res.id); router.back(); showToast(tr('trainingWorkoutDeleted')); } }] });
  return <Page testID="workout-detail" nav={<NavBar back={tr('trainingTitle')} title={res.name}
    right={<NavButton label={tr('trainingEdit')} onPress={() => router.push({ pathname: trainingRoutes.logger, params: { id: res.id } })} />} />}>
    <View style={{ marginTop: 8 }}>
      <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header">{res.name}</KitText>
      <KitText weight={500} size={14.5} color="text-muted" style={{ marginTop: 4, marginBottom: 4 }}>
        {tr('trainingDayTimeMin', { day: dayLabel(res.day), time: clockTime(res.startedAt), min: res.min })}</KitText>
    </View>
    <StatsCard min={res.min} sets={res.sets} volume={res.volume} unit={u} />
    {pr ? <List><ListRow icon="trophy" color="warning" title={tr('trainingNewRecord')} sub={`${pr.name} ${setText(pr.w, pr.r, u)}`} onPress={() => trainingNav.exercise(pr.name)} /></List> : null}
    {res.notes ? <Card>
      <EyebrowLine color={k.c['text-muted']}>{tr('trainingNotes')}</EyebrowLine>
      <KitText weight={500} size={15} lineHeight={1.4} style={{ marginTop: 8 }}>{res.notes}</KitText>
    </Card> : null}
    <SectionHeader title={tr('trainingExercises')} aside={trCount('trainingExercisesCount', res.exercises.length)} />
    {res.exercises.map((e, i) => <ExerciseCard key={`${e.name}-${i}`} e={e} unit={u} />)}
    <SectionHeader title={tr('trainingActions')} />
    <List>
      <ListRow icon="repeat" color="training" title={tr('trainingStartAgain', { name: res.name })} chevron={false} onPress={() => repeatSession(data.repo, res.id)} />
      <ListRow icon="bookmark" color="accent" title={template ? tr('trainingUpdateTemplate', { name: template }) : tr('trainingSaveAsTemplate')} chevron={false} onPress={saveTemplate} />
      <ListRow icon="trash" title={tr('trainingDeleteWorkout')} danger chevron={false} onPress={remove} />
    </List>
  </Page>;
}

function ExerciseCard({ e, unit }: { e: ResultExercise; unit: Unit }) {
  const k = useKit(), { colors } = useTheme(), name = exLabel(e.name);
  return <Card>
    <Tappable dim="text" accessibilityRole="button" accessibilityLabel={tr('trainingOpenExercise', { name })} onPress={() => trainingNav.exercise(e.name)}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, marginBottom: 4 }}>
      <KitText weight={700} size={16} color="training" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</KitText>
      <Icon name="chevron-right" size={16} color={k.c.text} />
    </Tappable>
    {e.sets.map((s, j) => <View key={j} accessible accessibilityLabel={tr(s.pr ? 'trainingSetLinePr' : 'trainingSetLine', { n: j + 1, set: setText(s.w, s.r, unit) })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
      <KitText weight={700} size={13} color="text-muted" numeric style={{ width: 28, textAlign: 'center' }}>{j + 1}</KitText>
      <KitText weight={700} size={15} numeric style={{ flex: 1 }}>
        {s.w > 0 ? `${weightText(s.w)} × ${s.r}` : `× ${s.r}`}
        {s.w > 0 ? <KitText weight={500} size={13} color="text-muted">{` ${unit}`}</KitText> : null}
      </KitText>
      {s.pr ? <PrBadge colors={colors} /> : null}
    </View>)}
  </Card>;
}
