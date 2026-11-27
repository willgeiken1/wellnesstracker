import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { List, ListFooter } from '@/components/list-row';
import { NavBar, NavButton } from '@/components/nav-bar';
import { SectionHeader } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { Stepper } from '@/components/stepper';
import { Tappable } from '@/components/tappable';
import { KitText } from '@/components/themed-text';
import { alpha, font, mix, tabular, useKit } from '@/components/kit-style';
import type { TemplateExercise, WorkoutStore } from '@/data/workout/store';
import { showToast } from '@/features/shell/toast';
import type { Plan } from '@/features/plans/schedule';
import { exLabel } from '../logger/model';
import { trainingNav } from '../nav';
import { startTraining } from '../start-workout';
import { tr, trCount } from '../tr';
import { useTrainingData } from '../training-viz';
import { Page } from './page';

/** The weekday each new day gets in Fixed weekdays, in the mockup's order (Monday is 0). */
const DEFAULT_WEEKDAYS = [0, 1, 3, 4, 5, 6, 2];
const weekdayName = (d: number | undefined) => d == null ? tr('trainingNotScheduled') : tr('trainingWeekdayNames').split(',')[d] ?? tr('trainingNotScheduled');

/** A day's template as rows to save back: kept ids, rep ranges and supersets, with a superset left with one exercise undone. */
export function dayRows(store: WorkoutStore, routineId: string): TemplateExercise[] {
  return store.templateExercises(routineId).map(e => ({ id: e.id, exercise: String(e.data.exercise), target_sets: Number(e.data.target_sets) || 3,
    target_reps: Number(e.data.target_reps) || 8, rep_min: (e.data.rep_min as number | null) ?? undefined, rep_max: (e.data.rep_max as number | null) ?? undefined,
    superset_group: (e.data.superset_group as string | null) ?? undefined }));
}
export function writeDay(store: WorkoutStore, routineId: string, rows: TemplateExercise[]) {
  const count = new Map<string, number>();
  for (const r of rows) if (r.superset_group) count.set(r.superset_group, (count.get(r.superset_group) ?? 0) + 1);
  const clean = rows.map(r => r.superset_group && (count.get(r.superset_group) ?? 0) < 2 ? { ...r, superset_group: undefined } : r);
  store.saveTemplate(String(store.repo.get('routines', routineId)?.data.name ?? ''), clean, routineId);
}
/** Undo of a removed exercise: the day as it was, with the same exercise rows, so their settings (one side at a time,
 * superset) and links from earlier workouts stay with them. */
export function undoDay(store: WorkoutStore, routineId: string, before: TemplateExercise[]) {
  try { writeDay(store, routineId, before); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
}
/** Give every day without a weekday the next free one, for Fixed weekdays. Null when there are more days than weekdays. */
export function fillWeekdays(days: string[], weekdays: Record<string, number[]>): Record<string, number[]> | null {
  if (days.length > 7) return null;
  const out: Record<string, number[]> = {}, used = new Set<number>();
  for (const id of days) { const w = (weekdays[id] ?? []).filter(d => !used.has(d)); out[id] = w; w.forEach(d => used.add(d)); }
  for (const id of days) if (!out[id].length) { const d = DEFAULT_WEEKDAYS.find(x => !used.has(x))!; out[id] = [d]; used.add(d); }
  return out;
}

/** The plan builder (`plan`): rotation or fixed weekdays, the weekly target, and each day's exercises, sets and rep range. */
export function PlanBuilder() {
  const data = useTrainingData(), k = useKit();
  const [draft, setDraft] = useState<{ mode: Plan['mode']; perWeek: number; days: string[]; weekdays: Record<string, number[]> } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Page nav={<NavBar back={tr('trainingTitle')} title={tr('trainingPlanTitle')} />}><View /></Page>;
  const store = data.workout, saved = data.plans.read();
  const live = data.repo.list('routines').filter(r => r.deleted_at === null).map(r => r.id);
  const base = draft ?? { mode: saved.mode, perWeek: saved.daysPerWeek, days: saved.days.length ? saved.days.map(d => d.routineId) : store.templates().map(r => r.id),
    weekdays: Object.fromEntries(saved.days.map(d => [d.routineId, d.weekdays])) };
  const plan = { ...base, days: base.days.filter(id => live.includes(id)) };
  const set = (patch: Partial<typeof plan>) => setDraft({ ...plan, ...patch });
  const setMode = (mode: Plan['mode']) => {
    if (mode === 'fixed') { const w = fillWeekdays(plan.days, plan.weekdays); if (!w) { showToast(tr('trainingPlanTooMany'), { color: 'warning' }); return; } set({ mode, weekdays: w }); }
    else set({ mode });
  };
  const nextId = data.plan().next?.routineId, nextName = data.plan().next?.name;
  const save = () => {
    try {
      const weekdays = plan.mode === 'fixed' ? fillWeekdays(plan.days, plan.weekdays) : plan.weekdays;
      if (!weekdays) { showToast(tr('trainingPlanTooMany'), { color: 'warning' }); return; }
      data.plans.save({ mode: plan.mode, daysPerWeek: plan.perWeek, days: plan.days.map(id => ({ routineId: id, weekdays: plan.mode === 'fixed' ? weekdays[id] ?? [] : [] })) });
      router.back();
      showToast(tr('trainingPlanSaved'), { color: 'training' });
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const addDay = () => {
    try {
      const r = store.saveTemplate(tr('trainingNewDay', { n: plan.days.length + 1 }), []);
      const w = plan.mode === 'fixed' ? fillWeekdays([...plan.days, r.id], plan.weekdays) : plan.weekdays;
      if (!w) { showToast(tr('trainingPlanTooMany'), { color: 'warning' }); return; }
      set({ days: [...plan.days, r.id], weekdays: w });
      setOpen(r.id);
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const name = data.planName() || tr('trainingPlanDefault'), modeWord = tr(plan.mode === 'fixed' ? 'trainingModeFixedLower' : 'trainingModeRotationLower');
  return <Page testID="plan-builder" nav={<NavBar back={tr('trainingTitle')} title={tr('trainingPlanTitle')} right={<NavButton label={tr('trainingSave')} onPress={save} testID="plan-save" />} />}>
    <View style={{ marginTop: 8 }}>
      <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header">{name}</KitText>
      <KitText weight={500} size={14.5} color="text-muted" style={{ marginTop: 4, marginBottom: 4 }}>
        {plan.days.length === 1 ? tr('trainingPlanSubOne', { mode: modeWord, per: plan.perWeek }) : tr('trainingPlanSub', { n: plan.days.length, mode: modeWord, per: plan.perWeek })}</KitText>
    </View>
    <List>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 }}>
        <KitText weight={600} size={15.5}>{tr('trainingPlanMode')}</KitText>
        <View style={{ width: 210 }}>
          <SegmentedControl label={tr('trainingPlanMode')} value={plan.mode} onChange={setMode}
            options={[{ value: 'rotation', label: tr('trainingRotation') }, { value: 'fixed', label: tr('trainingFixedWeekdays') }]} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 8,
        borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <View style={{ flexShrink: 1 }}>
          <KitText weight={600} size={15.5}>{tr('trainingDaysPerWeek')}</KitText>
          <KitText weight={500} size={12.5} color="text-muted">{tr('trainingWeeklyTarget')}</KitText>
        </View>
        <Stepper value={plan.perWeek} min={1} max={7} label={tr('trainingDaysPerWeek')} onChange={v => set({ perWeek: v })} testID="plan-per-week" />
      </View>
    </List>
    <ListFooter>{tr(plan.mode === 'fixed' ? 'trainingFixedFoot' : 'trainingRotationFoot')}</ListFooter>
    <SectionHeader title={tr('trainingDays')} aside={nextName ? tr('trainingUpNextName', { name: nextName }) : undefined} />
    {plan.days.length ? plan.days.map((id, di) => <DayCard key={id} store={store} id={id} index={di} open={open === id} next={id === nextId}
      weekday={plan.mode === 'fixed' ? weekdayName(plan.weekdays[id]?.[0]) : null} onToggle={() => setOpen(open === id ? null : id)}
      onStart={() => startTraining(data.repo, id)} />)
      : <EmptyState title={tr('trainingNoDaysYet')} description={tr('trainingNoDaysSub')} icon="cal" color="training" />}
    <View style={{ marginTop: 8 }}><Button label={tr('trainingAddDay')} variant="quiet" icon="plus" full onPress={addDay} /></View>
    <ListFooter>{tr('trainingPlanFootTemplates')}</ListFooter>
  </Page>;
}

function DayCard({ store, id, index, open, next, weekday, onToggle, onStart }: {
  store: WorkoutStore; id: string; index: number; open: boolean; next: boolean; weekday: string | null; onToggle: () => void; onStart: () => void;
}) {
  const k = useKit();
  const name = String(store.repo.get('routines', id)?.data.name ?? ''), rows = dayRows(store, id);
  const ex = trCount('trainingExercisesCount', rows.length), sets = trCount('trainingSetCount', rows.reduce((n, r) => n + r.target_sets, 0));
  const sub = weekday ? tr('trainingDaySubFixed', { ex, sets, day: weekday }) : tr('trainingDaySub', { ex, sets });
  const change = (i: number, patch: Partial<TemplateExercise>) => {
    try { writeDay(store, id, rows.map((r, j) => j === i ? { ...r, ...patch } : r)); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const remove = (i: number) => {
    const before = rows;
    try {
      writeDay(store, id, rows.filter((_, j) => j !== i));
      showToast(tr('trainingRemoved', { name: exLabel(before[i].exercise) }), { action: { label: tr('trainingUndo'), onAction: () => undoDay(store, id, before) } });
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  return <Card style={{ padding: 0, overflow: 'hidden' }}>
    <Tappable dim="row" accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={tr('trainingDayToggle', { name, sub })} onPress={onToggle}
      testID={`plan-day-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.14) }}>
        <KitText weight={700} size={15} color="training" numeric>{index + 1}</KitText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={700} size={16.5} tracking={-0.015} color="text-muted" numberOfLines={1}>{name}</KitText>
        <KitText weight={500} size={13} color="text-muted" numberOfLines={1} style={{ marginTop: 1 }}>{sub}</KitText>
      </View>
      {next ? <Badge label={tr('trainingNext')} color="training" /> : null}
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
        <Icon name="tr-down" size={20} color={mix(k.c['text-muted'], k.c.bg, 0.6)} />
      </View>
    </Tappable>
    {open ? <>
      {rows.map((r, i) => <ExerciseRow key={r.id ?? `${r.exercise}-${i}`} row={r} onChange={p => change(i, p)} onRemove={() => remove(i)} />)}
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10, paddingBottom: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <View style={{ flex: 1 }}><Button label={tr('trainingAddExercise')} size="sm" variant="secondary" color="training" icon="plus" full onPress={() => trainingNav.picker({ mode: 'routine', routine: id })} /></View>
        <View style={{ flex: 1 }}><Button label={tr('trainingStart')} accessibilityLabel={tr('trainingStartDay', { name })} size="sm" variant="quiet" icon="play" full onPress={onStart} /></View>
      </View>
    </> : null}
  </Card>;
}

export function ExerciseRow({ row, onChange, onRemove }: { row: TemplateExercise; onChange: (p: Partial<TemplateExercise>) => void; onRemove: () => void }) {
  const k = useKit(), label = exLabel(row.exercise);
  const lo = row.rep_min ?? row.target_reps, hi = row.rep_max ?? row.target_reps;
  const commit = (which: 'lo' | 'hi', text: string) => {
    const v = Math.max(1, Math.min(100, parseInt(text, 10) || 1));
    let a = which === 'lo' ? v : lo, b = which === 'hi' ? v : hi;
    if (a > b) { if (which === 'lo') b = a; else a = b; }
    onChange({ rep_min: a, rep_max: b, target_reps: b });
  };
  return <View style={{ paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Tappable dim="text" accessibilityRole="button" onPress={() => trainingNav.exercise(row.exercise)} style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
        <KitText weight={600} size={15} numberOfLines={1}>{label}</KitText>
      </Tappable>
      <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={tr('trainingRemoveName', { name: label })} onPress={onRemove}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={18} color={mix(k.c['text-muted'], k.c.bg, 0.6)} />
      </Tappable>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
      <Stepper value={row.target_sets} min={1} max={10} unit={tr('trainingUnitSets')} label={tr('trainingSetsFor', { name: label })} onChange={v => onChange({ target_sets: v })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <KitText weight={600} size={13} color="text-muted">{tr('trainingRepsLabel')}</KitText>
        <RepInput value={lo} label={tr('trainingFewestReps', { name: label })} onCommit={t => commit('lo', t)} />
        <KitText weight={600} size={13} color="text-muted">–</KitText>
        <RepInput value={hi} label={tr('trainingMostReps', { name: label })} onCommit={t => commit('hi', t)} />
      </View>
    </View>
  </View>;
}

function RepInput({ value, label, onCommit }: { value: number; label: string; onCommit: (text: string) => void }) {
  const k = useKit(), [text, setText] = useState<string | null>(null);
  return <TextInput value={text ?? String(value)} onChangeText={setText} onFocus={() => setText(String(value))} onEndEditing={() => { if (text != null) onCommit(text); setText(null); }}
    keyboardType="number-pad" inputMode="numeric" maxLength={3} selectTextOnFocus accessibilityLabel={label}
    style={[font(700, 16.5), tabular, { width: 46, height: 40, borderRadius: 10, textAlign: 'center', padding: 0, color: k.c.text, backgroundColor: k.c['surface-2'] }]} />;
}
