import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { fromKg } from '@/core/workout/rules';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { printData, workoutPrint, type PrintData } from '@/features/home/contour';
import { PlansPanel } from '@/features/plans/panel';
import { PlanStore } from '@/features/plans/store';
import { pluralize, t } from '@/i18n/en';
import { layout } from './primitives';
import { entryVolumeKg } from './volume';

const semibold = { fontWeight: '600' } as const;
const card = { borderRadius: 18, padding: tokens.spacing[3] } as const;
const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const dayLabel = (day: unknown, weekday = true) => {
  const date = new Date(`${String(day)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(day) : date.toLocaleDateString('en-US', { ...(weekday ? { weekday: 'short' } : {}), month: 'short', day: 'numeric' });
};

/** Volume per exercise for a finished session, in kg. A set without weight still counts by its reps. */
function sessionPrint(store: WorkoutStore, session: Row) {
  let total = 0;
  const exercises = store.entries(session.id).map(entry => {
    // Weighted volume counts both sides of a one-arm or one-leg set, the same way Home and the summary do.
    const volume = entryVolumeKg(store, entry);
    let body = 0;
    for (const set of store.working(entry)) {
      if (set.warmup || !Number.isFinite(set.reps)) continue;
      if (!(Number.isFinite(set.weight) && set.weight > 0)) body += set.reps;
    }
    total += volume;
    return { name: String(entry.data.exercise), volume: volume + body * 20 };
  });
  return { data: printData(session.id, exercises), totalKg: total };
}
/** A routine's print: its last finished session, or an even print of its exercises before the first one. */
function routinePrint(store: WorkoutStore, routine: Row, last: Row | undefined): PrintData {
  if (last) return sessionPrint(store, last).data;
  return printData(routine.id, store.templateExercises(routine.id).map(e => ({ name: String(e.data.exercise), volume: 1 })));
}
function nextRoutine(store: WorkoutStore, routines: Row[]) {
  const plans = new PlanStore(store.repo), days = plans.read().days;
  return (days.length ? routines.find(r => r.id === days[plans.nextIndex()]?.routineId) : undefined) ?? routines[0];
}
function startRoutine(store: WorkoutStore, id: string) {
  const plans = new PlanStore(store.repo);
  if (!store.active() && plans.read().days.some(day => day.routineId === id)) plans.startDay(id);
  else store.start(id);
  router.push('/workout');
}

function Print({ data, width, height }: { data: PrintData; width: number; height: number }) {
  const { mode } = useTheme(), color = tokens.color.pillar.training[mode];
  const lines = useMemo(() => workoutPrint(data, width, height), [data, width, height]);
  return <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} accessible={false}>
    {lines.map((line, i) => <Path key={i} d={line.d} fill="none" stroke={color} strokeWidth={line.width} opacity={line.opacity} strokeLinecap="round" />)}
  </Svg>;
}

/** The Routines segment of the Workouts tab, laid out after the prototype: latest print, up next,
 * the plan, then the routines. Every action the old list had is still here; edit, reorder and
 * delete sit behind each routine's row. */
export function Routines({ store, run, undo, onUndo }: { store: WorkoutStore | null; run: (action: () => void) => void; undo: (() => void) | null; onUndo: (restore: (() => void) | null) => void }) {
  const { colors, mode } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const routines = store?.templates() ?? [], history = store?.history() ?? [];
  const latest = history[0], next = store ? nextRoutine(store, routines) : undefined;
  const training = tokens.color.pillar.training[mode];
  const lastOf = (id: string) => history.find(s => s.data.routine_id === id);
  return <>
    {store && latest && <LatestPrint store={store} session={latest} />}
    {store && next && !store.active() && <Card style={[card, { gap: tokens.spacing[1] }]} testID="workouts-up-next">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
        <View style={{ flex: 1 }}>
          <ThemedText muted variant="caption">{t('upNext')}</ThemedText>
          <ThemedText variant="title" style={semibold}>{String(next.data.name)}</ThemedText>
        </View>
        <View style={{ width: 54, height: 44 }}><Print data={routinePrint(store, next, lastOf(next.id))} width={54} height={44} /></View>
      </View>
      <ThemedText muted variant="caption" style={{ lineHeight: 20 }}>{store.templateExercises(next.id).map(e => String(e.data.exercise)).join(' · ')}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('upNextStart').replace('{name}', String(next.data.name))} onPress={() => run(() => startRoutine(store, next.id))}
        style={({ pressed }) => ({ marginTop: tokens.spacing[1], minHeight: 48, borderRadius: tokens.radii.card, alignItems: 'center', justifyContent: 'center', backgroundColor: training, opacity: pressed ? 0.8 : 1 })}>
        <ThemedText style={[semibold, { color: colors['on-accent'] }]}>{t('startTemplate').replace('{name}', String(next.data.name))}</ThemedText>
      </Pressable>
    </Card>}
    {store && <PlansPanel store={store} />}
    <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('routines')}</ThemedText>
    <Card style={[card, { paddingVertical: tokens.spacing[0], gap: 0 }]}>
      {store && routines.map(r => {
        const name = String(r.data.name), last = lastOf(r.id), expanded = open === r.id;
        return <View key={r.id} style={{ borderBottomWidth: 1, borderBottomColor: colors['surface-2'], paddingVertical: tokens.spacing[1], gap: tokens.spacing[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('routineActions').replace('{name}', name)} accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : r.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 52 }}>
              <View style={{ width: 44, height: 44, borderRadius: tokens.radii.card, backgroundColor: colors['surface-2'], padding: 4 }}>
                <Print data={routinePrint(store, r, last)} width={36} height={36} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="headline">{name}</ThemedText>
                <ThemedText muted variant="caption">{pluralize(store.templateExercises(r.id).length, 'exercise')} · {last ? `${t('lastDone')} ${dayLabel(last.data.day, false)}` : t('notYetDone')}</ThemedText>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('startTemplate').replace('{name}', name)} onPress={() => run(() => startRoutine(store, r.id))}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}><Path d="M8 5.5v13l11-6.5z" fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinejoin="round" /></Svg>
            </Pressable>
          </View>
          {expanded && <View style={[layout.row, { flexWrap: 'wrap', paddingBottom: tokens.spacing[1] }]}>
            <Button label={t('edit')} variant="secondary" onPress={() => router.push({ pathname: '/workout/template', params: { id: r.id } })} />
            <Button label={t('moveUp')} variant="secondary" onPress={() => run(() => store.moveTemplate(r.id, -1))} />
            <Button label={t('moveDown')} variant="secondary" onPress={() => run(() => store.moveTemplate(r.id, 1))} />
            <Button label={t('delete')} variant="secondary" onPress={() => Alert.alert(t('deleteTemplate'), name, [{ text: t('cancel'), style: 'cancel' },
              { text: t('delete'), onPress: () => run(() => { const restore = store.deleteTemplate(r.id); onUndo(restore); }) }])} />
          </View>}
        </View>;
      })}
      <RowLink label={t('newTemplate')} onPress={() => router.push('/workout/template')} />
      <RowLink label={t('startEmpty')} last onPress={() => run(() => { store?.start(); router.push('/workout'); })} />
    </Card>
    {undo && <Button label={t('undoDelete')} variant="secondary" onPress={() => run(() => { undo(); onUndo(null); })} />}
  </>;
}

function RowLink({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: last ? 0 : 1, borderBottomColor: colors['surface-2'] }}>
    <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
    <Icon name="chevron" size={18} color={colors['text-muted']} />
  </Pressable>;
}

function LatestPrint({ store, session }: { store: WorkoutStore; session: Row }) {
  const print = sessionPrint(store, session), unit = store.unit(), name = String(session.data.name ?? t('workoutName'));
  const volume = `${whole(fromKg(print.totalKg, unit))} ${unit}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${t('latestPrint')}: ${name}, ${dayLabel(session.data.day)}, ${volume}`}
    onPress={() => router.push({ pathname: '/workout/summary', params: { id: session.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
    <Card style={[card, { gap: tokens.spacing[1] }]} testID="workouts-latest-print">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <ThemedText muted variant="caption">{t('latestPrint')}</ThemedText>
          <ThemedText variant="title" style={semibold}>{name}</ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText muted variant="caption">{dayLabel(session.data.day)}</ThemedText>
          <ThemedText muted numeric variant="caption">{volume}</ThemedText>
        </View>
      </View>
      <View style={{ width: '100%', aspectRatio: 2 }}><Print data={print.data} width={300} height={150} /></View>
      <ThemedText muted variant="caption">{t('printCaption')}</ThemedText>
    </Card>
  </Pressable>;
}
