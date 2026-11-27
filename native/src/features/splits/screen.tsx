import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { List, ListFooter } from '@/components/list-row';
import { NavBar, NavButton } from '@/components/nav-bar';
import { SectionHeader } from '@/components/section';
import { Tappable } from '@/components/tappable';
import { KitText } from '@/components/themed-text';
import { capitals, font, mix, useKit } from '@/components/kit-style';
import { useTheme } from '@/design/theme-provider';
import type { TemplateExercise } from '@/data/workout/store';
import { showToast } from '@/features/shell/toast';
import { actionSheet } from '../workout/action-sheet';
import { exLabel } from '../workout/logger/model';
import { trainingNav } from '../workout/nav';
import { Page } from '../workout/screens/page';
import { ExerciseRow, dayRows, undoDay, writeDay } from '../workout/screens/plan';
import { MUSCLE_GROUPS, type MuscleGroup } from '../workout/training-data';
import { tr, trCount } from '../workout/tr';
import { freestyle, nextIndex, skipToday, startSplitDay, statusLine, swapSheet, trainNow } from './menu';
import { ControlRow, CoverageCard, DayNumber, ModeControl, MusclePills, PerWeekStepper } from './parts';
import type { SplitStore, SplitView } from './store';
import { scheduleLine, useSplit } from './tile';

/** The Split screen (`plan` in v21): today, how the split runs, its days and their exercises, and sets per muscle. */
export function SplitScreen() {
  const split = useSplit();
  const nav = (right?: React.ReactNode) => <NavBar back={tr('trainingTitle')} title={tr('splitTitle')} right={right} />;
  if (!split) return <Page nav={nav()}><View /></Page>;
  if (!split.view) return <NoSplit store={split.store} nav={nav()} />;
  return <SplitBody store={split.store} v={split.view} nav={nav(<NavButton label={tr('splitDone')} testID="split-done"
    onPress={() => { router.back(); showToast(tr('splitSaved', { name: split.view!.def.name }), { color: 'training' }); }} />)} />;
}

function NoSplit({ store, nav }: { store: SplitStore; nav: React.ReactNode }) {
  const hasPlan = store.plans.read().days.length > 0;
  return <Page nav={nav} testID="split-none">
    <View style={{ marginTop: 24 }}>
      <EmptyState title={tr('splitNoneTitle')} description={tr('splitNoneBody')} icon="sp-split" color="training"
        action={{ label: tr('splitChooseASplit'), onPress: () => trainingNav.splitLibrary() }} />
    </View>
    {hasPlan ? <Button label={tr('splitKeepDays')} variant="quiet" full onPress={() => {
      const undo = store.adoptPlan(tr('splitTitle'));
      const v = store.view();
      if (undo && v) showToast(tr('splitToastMine', { name: v.def.name }), { color: 'training' });
    }} /> : null}
  </Page>;
}

function Kicker({ v }: { v: SplitView }) {
  const k = useKit(), t = v.now;
  const text = t.kind === 'live' ? tr('splitInProgress') : t.kind === 'planned' ? (v.def.mode === 'rotate' ? tr('splitUpNext') : tr('splitToday')) : statusLine(v);
  const on = t.kind === 'live' || t.kind === 'planned';
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    {t.kind === 'live' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: k.c.training }} /> : null}
    <KitText weight={700} size={10.5} lineHeight={1} tracking={0.12} color={on ? 'training' : 'text-muted'} style={capitals}>{text}</KitText>
  </View>;
}

function SplitBody({ store, v, nav }: { store: SplitStore; v: SplitView; nav: React.ReactNode }) {
  const k = useKit(), { reduceMotion } = useTheme(), repo = store.repo;
  const [open, setOpen] = useState<string | null>(() => v.days[0]?.routineId ?? null);
  const t = v.now, rotate = v.def.mode === 'rotate';
  const fd = t.kind === 'live' ? (t.focus >= 0 ? v.days[t.focus] : null) : v.days[t.focus] ?? null;
  const next = v.days[nextIndex(v)] ?? null;
  const dayName = t.kind === 'live' ? (v.live?.name || fd?.name || tr('splitFreestyle')) : fd?.name ?? tr('splitRest');
  const safe = (fn: () => void) => { try { fn(); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); } };
  const actions = t.kind === 'live' ? <>
    <View style={{ flex: 1 }}><Button label={tr('splitResumeShort')} icon="play" color="training" full onPress={() => trainingNav.logger()} /></View>
    <View style={{ flex: 1 }}><Button label={tr('splitChangeNext')} variant="secondary" color="training" icon="swap" full onPress={() => swapSheet(repo, true, reduceMotion)} /></View>
  </> : t.kind === 'planned' && fd ? <>
    <View style={{ flex: 1 }}><Button label={tr('splitStart')} accessibilityLabel={tr('splitStartName', { name: fd.name })} icon="play" color="training" full testID="split-start"
      onPress={() => startSplitDay(repo, fd.routineId)} /></View>
    <View style={{ flex: 1 }}><Button label={tr('splitSwap')} variant="secondary" color="training" icon="swap" full onPress={() => swapSheet(repo, false, reduceMotion)} /></View>
    <View style={{ flex: 1 }}><Button label={tr('splitSkip')} variant="quiet" icon="sp-skip" full testID="split-skip" onPress={() => skipToday(repo)} /></View>
  </> : <>
    <View style={{ flex: 1 }}><Button label={tr('splitTrainTodayShort')} icon="play" color="training" full testID="split-train-now" onPress={() => trainNow(repo)} /></View>
    <View style={{ flex: 1 }}><Button label={tr('splitFreestyle')} variant="quiet" icon="sp-free" full onPress={() => freestyle(repo)} /></View>
  </>;
  const foot = t.kind === 'planned' ? tr('splitFootSkip') : t.kind === 'live' ? tr('splitFootFinish', { name: dayName, next: next?.name ?? '' }) : tr('splitFootFree');
  const weekdays = tr('splitWeekdayLong').split(','), abbr = tr('splitWeekdayAbbr').split(',');
  const pickWeekday = (i: number) => actionSheet({ title: weekdays[i], actions: [
    ...v.days.map(d => ({ label: d.name + (v.def.week[i] === d.index ? '  ✓' : ''), run: () => safe(() => store.setWeekday(i, d.index)) })),
    { label: tr('splitRest') + (v.def.week[i] < 0 ? '  ✓' : ''), run: () => safe(() => store.setWeekday(i, -1)) },
  ] });
  const addDay = () => safe(() => {
    const i = store.addDay(tr('splitNewDay', { n: v.days.length + 1 }));
    const id = store.def()?.days[i]?.routineId;
    if (id) setOpen(id);
  });

  return <Page testID="split-screen" nav={nav}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12, marginBottom: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header" numberOfLines={2}>{v.def.name}</KitText>
        <KitText weight={500} size={14.5} color="text-muted" style={{ marginTop: 4 }}>{`${trCount('splitDays', v.days.length)} · ${scheduleLine(v)}`}</KitText>
      </View>
      <Button label={tr('splitChange')} size="sm" variant="secondary" color="training" icon="swap" onPress={() => trainingNav.splitLibrary()} />
    </View>

    <Card style={{ padding: 18 }} testID="split-today">
      <Kicker v={v} />
      <KitText weight={700} size={30} lineHeight={1.05} tracking={-0.03} numberOfLines={1} style={{ marginTop: 8 }}>{dayName}</KitText>
      {fd ? <MusclePills muscles={fd.focus.slice(0, 8)} /> : null}
      {fd ? <KitText weight={500} size={13.5} color="text-muted" style={{ marginTop: 10 }}>
        {`${trCount('splitEx', fd.exercises.length)} · ${trCount('splitSets', fd.sets)} · ${tr('splitAboutMin', { n: fd.min })}`}</KitText> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>{actions}</View>
    </Card>
    <ListFooter>{foot}</ListFooter>

    <SectionHeader title={tr('splitSchedule')} />
    <List>
      <ControlRow title={tr('splitRunsBy')}><ModeControl value={v.def.mode} width={220} onChange={m => safe(() => store.setMode(m))} /></ControlRow>
      {rotate ? <ControlRow first={false} title={tr('splitDaysPerWeek')} sub={tr('splitWeeklyTarget')}>
        <PerWeekStepper value={v.def.perWeek} onChange={n => safe(() => store.setPerWeek(n))} />
      </ControlRow> : null}
    </List>
    {rotate ? null : <List>
      {weekdays.map((w, i) => {
        const di = v.def.week[i] ?? -1;
        return <Tappable key={w} dim="row" accessibilityRole="button" accessibilityLabel={`${w}, ${di < 0 ? tr('splitRest') : v.days[di]?.name ?? ''}`} onPress={() => pickWeekday(i)}
          testID={`split-wd-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingLeft: 16, paddingRight: 14,
            borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
          <KitText weight={600} size={15} style={{ width: 84 }}>{w}</KitText>
          <KitText weight={di < 0 ? 500 : 600} size={15} color={di < 0 ? 'text-muted' : 'training'} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
            {di < 0 ? tr('splitRest') : v.days[di]?.name ?? ''}</KitText>
          <Icon name="chevron-right" size={16} color={mix(k.c['text-muted'], k.c.bg, 0.6)} />
        </Tappable>;
      })}
    </List>}
    <ListFooter>{rotate ? tr('splitFootRotate') : tr('splitFootWeekdays')}</ListFooter>

    <SectionHeader title={tr('splitDaysTitle')} aside={tr('splitAddDay')} onAside={addDay} />
    {v.days.map(d => <DayCard key={d.routineId} store={store} v={v} index={d.index} open={open === d.routineId} abbr={abbr}
      onToggle={() => setOpen(open === d.routineId ? null : d.routineId)} />)}

    <SectionHeader title={tr('splitWeeklySets')} aside={tr('splitAim')} />
    <CoverageCard coverage={v.coverage} testID="split-coverage" />
    <ListFooter>{tr('splitCoverageFoot')}</ListFooter>
    <View style={{ marginTop: 8 }}><Button label={tr('splitChangeSplit')} variant="quiet" icon="swap" full onPress={() => trainingNav.splitLibrary()} /></View>
    <ListFooter>{tr('splitSyncFoot')}</ListFooter>
  </Page>;
}

function DayCard({ store, v, index, open, abbr, onToggle }: { store: SplitStore; v: SplitView; index: number; open: boolean; abbr: string[]; onToggle: () => void }) {
  const k = useKit(), d = v.days[index], t = v.now, nx = nextIndex(v);
  const isLive = t.kind === 'live' && t.focus === index, isToday = t.kind === 'planned' && t.focus === index;
  const isNext = !isLive && !isToday && t.kind !== 'planned' && nx === index;
  const when = v.def.mode === 'rotate' ? '' : d.weekdays.map(w => abbr[w]).join(', ');
  const sub = `${trCount('splitEx', d.exercises.length)} · ${trCount('splitSets', d.sets)}${when ? ` · ${when}` : ''}`;
  const rows = open ? dayRows(store.workout, d.routineId) : [];
  const change = (i: number, patch: Partial<TemplateExercise>) => {
    try { writeDay(store.workout, d.routineId, rows.map((r, j) => j === i ? { ...r, ...patch } : r)); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const remove = (i: number) => {
    const before = rows;
    try {
      writeDay(store.workout, d.routineId, rows.filter((_, j) => j !== i));
      showToast(tr('trainingRemoved', { name: exLabel(before[i].exercise) }), { action: { label: tr('splitUndo'), onAction: () => undoDay(store.workout, d.routineId, before) } });
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const toggleMuscle = (m: MuscleGroup) => {
    const cur = d.focus.includes(m) ? d.focus.filter(x => x !== m) : [...d.focus, m];
    try { store.setFocus(index, cur); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  return <Card style={{ padding: 0, overflow: 'hidden' }} testID={`split-day-${index}`}>
    <Tappable dim="row" accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${tr('splitDayLabel', { n: index + 1, name: d.name })}, ${sub}`} onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16 }}>
      <DayNumber n={index + 1} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={700} size={16.5} tracking={-0.015} numberOfLines={1}>{d.name}</KitText>
        <KitText weight={500} size={13} color="text-muted" numberOfLines={1} style={{ marginTop: 1 }}>{d.focus.join(', ') || tr('splitNoExercises')}</KitText>
        <KitText weight={500} size={13} color="text-muted" numberOfLines={1}>{sub}</KitText>
      </View>
      {isLive ? <Badge label={tr('splitBadgeNow')} color="training" /> : isToday ? <Badge label={tr('splitBadgeToday')} color="training" /> : isNext ? <Badge label={tr('splitBadgeNext')} color="training" /> : null}
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="tr-down" size={20} color={mix(k.c['text-muted'], k.c.bg, 0.6)} /></View>
    </Tappable>
    {open ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <KitText weight={600} size={13} color="text-muted">{tr('splitName')}</KitText>
        <DayNameInput value={d.name} onCommit={name => { try { store.renameDay(index, name || tr('splitNewDay', { n: index + 1 })); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); } }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}
        accessibilityLabel={tr('splitMuscles')}>
        <KitText weight={700} size={11} tracking={0.1} color="text-muted" style={[capitals, { width: '100%', marginBottom: 2 }]}>{tr('splitMuscles')}</KitText>
        {MUSCLE_GROUPS.map(m => <Chip key={m} label={m} selected={d.focus.includes(m)} color="training" onPress={() => toggleMuscle(m)} />)}
      </View>
      {rows.map((r, i) => <ExerciseRow key={r.id ?? `${r.exercise}-${i}`} row={r} onChange={p => change(i, p)} onRemove={() => remove(i)} />)}
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10, paddingBottom: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <View style={{ flex: 1 }}><Button label={tr('splitAddExercise')} size="sm" variant="secondary" color="training" icon="plus" full testID={`split-add-exercise-${index}`} onPress={() => trainingNav.picker({ mode: 'routine', routine: d.routineId })} /></View>
        <View style={{ flex: 1 }}><Button label={tr('splitStart')} accessibilityLabel={tr('splitStartName', { name: d.name })} size="sm" variant="quiet" icon="play" full onPress={() => startSplitDay(store.repo, d.routineId)} /></View>
      </View>
    </> : null}
  </Card>;
}

function DayNameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const k = useKit(), [text, setText] = useState<string | null>(null);
  return <TextInput value={text ?? value} onChangeText={setText} onFocus={() => setText(value)} onEndEditing={() => { if (text != null && text.trim() !== value) onCommit(text.trim()); setText(null); }}
    accessibilityLabel={tr('splitDayNameLabel')} maxLength={60} returnKeyType="done" testID="split-day-name"
    style={[font(600, 15), { flex: 1, minWidth: 0, height: 40, borderRadius: 12, paddingHorizontal: 12, color: k.c.text, backgroundColor: k.dark ? k.c['surface-2'] : k.c.bg }]} />;
}
