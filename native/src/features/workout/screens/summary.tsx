import { useState } from 'react';
import { TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { List, ListRow } from '@/components/list-row';
import { NavBar, NavButton } from '@/components/nav-bar';
import { SectionHeader } from '@/components/section';
import { KitText } from '@/components/themed-text';
import { alpha, font, mix, useKit } from '@/components/kit-style';
import { showToast } from '@/features/shell/toast';
import { useTheme } from '@/design/theme-provider';
import { setText } from '../set-text';
import { clockTime, fmt } from '../training-data';
import { tr, trCount } from '../tr';
import { Cells, Gauge, useTrainingData } from '../training-viz';
import { exLabel } from '../logger/model';
import { leaveLogger } from '../logger/screen';
import { trainingNav } from '../nav';
import { alsoText, fullDate, sessionResult, type SessionResult } from './model';
import { ColorEyebrow, Page, StatsCard } from './page';

/** The workout summary (`workout-summary`): the person's own numbers for the workout just finished. No written recap. */
export function WorkoutSummary() {
  const { id, just } = useLocalSearchParams<{ id?: string; just?: string }>();
  const data = useTrainingData();
  const res = data && id ? sessionResult(data, id) : null;
  const done = (notes?: string) => {
    if (data && res && notes != null && notes.trim() !== res.notes) {
      const s = data.repo.get('sessions', res.id);
      if (s) data.repo.save('sessions', { ...s.data, notes: notes.trim().slice(0, 2000) || null }, res.id);
    }
    leaveLogger();
    if (just) showToast(tr('trainingSavedHistory'), { color: 'training' });
  };
  if (!data || !res) return <Page nav={<NavBar title={tr('trainingSummary')} right={<NavButton label={tr('trainingDone')} onPress={() => leaveLogger()} />} />}>
    <EmptyState title={tr('trainingWorkoutNotFound')} description={tr('trainingNotFoundSub')} icon="workouts" color="training" />
  </Page>;
  return <SummaryBody res={res} perWeek={data.plan().perWeek} weekDone={data.week().done} planName={data.plans.read().days.length ? data.planName() || tr('trainingPlanDefault') : ''} onDone={done} />;
}

function SummaryBody({ res, perWeek, weekDone, planName, onDone }: { res: SessionResult; perWeek: number; weekDone: number; planName: string; onDone: (notes: string) => void }) {
  const k = useKit(), { colors } = useTheme(), { width } = useWindowDimensions();
  const [notes, setNotes] = useState(res.notes);
  const u = res.unit, g = res.goal, gained = Math.max(0, res.after - res.before), planDone = Math.min(perWeek, weekDone);
  const maxSets = Math.max(1, ...res.muscles.map(m => m.sets)), cellsW = Math.max(40, Math.min(width, 430) - 64 - 92 - 52 - 24);
  return <Page testID="workout-summary" nav={<NavBar title={tr('trainingSummary')} right={<NavButton label={tr('trainingDone')} onPress={() => onDone(notes)} testID="summary-done" />} />}>
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, marginBottom: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.18) }}>
        <Icon name="check" size={40} color={k.c.training} />
      </View>
      <ColorEyebrow color={k.c.training}>{tr('trainingWorkoutComplete')}</ColorEyebrow>
      <KitText weight={700} size={32} lineHeight={1.1} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 8, marginBottom: 4, textAlign: 'center' }}>{res.name}</KitText>
      <KitText weight={500} size={14.5} color="text-muted" style={{ textAlign: 'center' }}>
        {tr('trainingDayTimes', { date: fullDate(res.day), a: clockTime(res.startedAt), b: clockTime(res.finishedAt) })}</KitText>
    </View>
    <StatsCard min={res.min} sets={res.sets} volume={res.volume} unit={u} style={{ marginTop: 4 }} />

    <SectionHeader title={tr('trainingGoalTitle')} />
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Gauge frac={Math.min(1, res.after / g)} from={Math.min(1, res.before / g)} size={112} sw={9} color={k.c.training} colors={colors} fs={30} us={12.5}
          value={String(res.after)} unit={tr('trainingOfGoalMin', { goal: g })} label={tr('trainingGoalMoved', { a: res.before, b: res.after, goal: g })} />
        <View style={{ flex: 1, gap: 10, alignItems: 'flex-start' }}>
          <Badge label={res.after >= g ? tr('trainingGoalMet') : tr('trainingMinToGo', { n: g - res.after })} color={res.after >= g ? 'success' : 'training'} />
          <Legend color={mix(k.c.training, k.c.surface, 0.45)} strong={tr('trainingBeforeMin', { n: res.before })} rest={tr('trainingBeforeWorkout')} />
          <Legend color={k.c.training} strong={tr('trainingPlusMin', { n: gained })} rest={tr('trainingFromName', { name: res.name })} />
        </View>
      </View>
      {planName ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <View style={{ flexShrink: 1 }}>
          <KitText weight={600} size={15}>{planName}</KitText>
          <KitText weight={500} size={13} color="text-muted">{tr('trainingPlanDaysWeek', { done: planDone, per: perWeek })}</KitText>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }} accessible={false} importantForAccessibility="no-hide-descendants">
          {Array.from({ length: perWeek }, (_, i) => <View key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i < planDone ? k.c.training : mix(k.c.training, k.c['surface-2'], 0.2) }} />)}
        </View>
      </View> : null}
    </Card>

    {res.prs.length ? <>
      <SectionHeader title={tr('trainingRecords')} aside={tr('trainingNewCount', { n: res.prs.length })} />
      <List>{res.prs.map(p => <ListRow key={p.name} icon="trophy" color="warning" title={p.name} sub={tr('trainingPreviousBest', { set: setText(p.was.w, p.was.r, u) })}
        value={setText(p.w, p.r, u)} strong onPress={() => trainingNav.exercise(p.name)} />)}</List>
    </> : null}

    {res.muscles.length ? <>
      <SectionHeader title={tr('trainingMusclesWorked')} aside={tr('trainingWorkingSets')} />
      <Card>
        {res.muscles.map(m => <View key={m.m} accessible accessibilityLabel={tr('trainingMuscleSets', { m: m.m, n: m.sets })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 }}>
          <KitText weight={600} size={14} style={{ width: 92 }} numberOfLines={1}>{m.m}</KitText>
          <View style={{ flex: 1 }}><Cells states={Array.from({ length: maxSets }, (_, i) => i < m.sets ? 1 : 0)} w={cellsW} h={14} gap={3} r={3} color={k.c.training} colors={colors} mode={k.dark ? 'dark' : 'light'} /></View>
          <KitText weight={700} size={13} color="text-muted" numeric style={{ width: 52, textAlign: 'right' }}>{trCount('trainingSetCount', m.sets)}</KitText>
        </View>)}
        {res.also.length ? <KitText weight={500} size={12.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 10 }}>{tr('trainingAlsoWorked', { list: alsoText(res.also) })}</KitText> : null}
      </Card>
    </> : null}

    <SectionHeader title={tr('trainingExercises')} />
    <List>{res.exercises.map((e, i) => {
      const sets = trCount('trainingSetCount', e.sets.length), set = setText(e.top.w, e.top.r, u);
      return <ListRow key={`${e.name}-${i}`} title={exLabel(e.name)} sub={e.warm ? tr('trainingExSubWarm', { sets, warm: e.warm, set }) : tr('trainingExSub', { sets, set })}
        value={`${fmt(e.volume)} ${u}`} />;
    })}</List>

    <SectionHeader title={tr('trainingNotes')} />
    <TextInput value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder={tr('trainingNotesPlaceholder')} placeholderTextColor={k.c['text-muted']}
      accessibilityLabel={tr('trainingWorkoutNotes')} testID="summary-notes"
      style={[font(500, 15, 1.4), { minHeight: 76, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, color: k.c.text, backgroundColor: k.c.surface,
        boxShadow: k.dark ? undefined : `0px 0px 0px 1px ${k.c.hair}`, textAlignVertical: 'top' }]} />
    <View style={{ marginTop: 8 }}><Button label={tr('trainingDone')} full color="training" onPress={() => onDone(notes)} /></View>
  </Page>;
}

function Legend({ color, strong, rest }: { color: string; strong: string; rest: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
    <KitText weight={500} size={13} lineHeight={1.3} color="text-muted" numeric style={{ flexShrink: 1 }}>
      <KitText weight={600} size={13} color="text">{strong}</KitText>{rest}
    </KitText>
  </View>;
}
