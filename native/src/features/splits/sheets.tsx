import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip, Chips } from '@/components/chip';
import { Icon } from '@/components/icon';
import { KIT, alpha, font, useKit } from '@/components/kit-style';
import { List, ListFooter, ListRow } from '@/components/list-row';
import { Sheet, SheetHeader } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { Switch } from '@/components/switch';
import { Tappable } from '@/components/tappable';
import { TextField } from '@/components/text-field';
import { KitText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { showToast } from '@/features/shell/toast';
import { trainingNav } from '../workout/nav';
import { MUSCLE_GROUPS, type MuscleGroup } from '../workout/training-data';
import { tr, trCount } from '../workout/tr';
import { timesPerWeek, weeklySets, type SplitMode } from './model';
import { ControlRow, CoverageCard, DayNumber, ModeControl, PerWeekStepper, SheetEyebrow, WeekdayChips } from './parts';
import { SPLIT_PRESETS, spreadWeek, type SplitPreset } from './presets';
import { presetFor, type DayDraft, type SplitStore, type Undo } from './store';
import { presetFrequency, scheduleLine, useSplit } from './tile';

/** Close every sheet back to Training; with `then`, open the Split screen once they have gone. */
function closeAll(reduceMotion: boolean, then?: () => void) {
  if (router.canDismiss()) router.dismissAll(); else router.back();
  if (then) setTimeout(then, reduceMotion ? 0 : 320);
}
/** "Push Pull Legs is your split. Push A is up today." with Undo when it replaced another split. */
function chosenToast(store: SplitStore, had: boolean, undo: Undo) {
  const v = store.view();
  if (!v) return;
  const t = v.now, name = v.days[t.focus]?.name ?? '';
  const text = t.kind === 'planned' ? tr('splitToastChosenToday', { split: v.def.name, name }) : tr('splitToastChosenNext', { split: v.def.name, name });
  showToast(text, { color: 'training', ms: 3400, action: had ? { label: tr('splitUndo'), onAction: undo } : undefined });
}

/* ---------- Change split: the library ---------- */
export function SplitLibrarySheet() {
  const split = useSplit(), k = useKit(), { reduceMotion } = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null), [presetsY, setPresetsY] = useState(0);
  if (!split) return <Sheet header={<SheetHeader title={tr('splitChooseASplit')} />}><View /></Sheet>;
  const v = split.view;
  return <Sheet scroll={false} testID="split-library" header={<SheetHeader title={v ? tr('splitLibraryTitle') : tr('splitChooseASplit')} />}>
    <ScrollView ref={scroll} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: KIT.gap, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
      {v ? <>
        <SheetEyebrow first>{tr('splitYourSplit')}</SheetEyebrow>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.15) }}>
            <Icon name="sp-split" size={20} color={k.c.training} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <KitText weight={700} size={16} lineHeight={1.2} tracking={-0.01} numberOfLines={1}>{v.def.name}</KitText>
            <KitText weight={500} size={12.5} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{`${trCount('splitDays', v.days.length)} · ${scheduleLine(v)}`}</KitText>
          </View>
          <Button label={tr('splitEdit')} size="sm" variant="quiet" onPress={() => closeAll(reduceMotion, () => trainingNav.plan())} />
        </Card>
      </> : null}
      <SheetEyebrow first={!v}>{tr('splitBuildOwn')}</SheetEyebrow>
      <List>
        <ListRow icon="plus" color="training" title={tr('splitStartBlank')} sub={tr('splitStartBlankSub')} onPress={() => trainingNav.splitNew()} testID="split-start-blank" />
        <ListRow icon="copy" color="training" title={tr('splitFromPreset')} sub={tr('splitFromPresetSub')} onPress={() => scroll.current?.scrollTo({ y: presetsY, animated: !reduceMotion })} />
      </List>
      <View onLayout={e => setPresetsY(e.nativeEvent.layout.y)}><SheetEyebrow>{tr('splitPresets')}</SheetEyebrow></View>
      {SPLIT_PRESETS.map(p => <PresetRow key={p.key} preset={p} store={split.store} current={!!v && v.def.key === p.key} />)}
      <ListFooter>{tr('splitLibraryFoot')}</ListFooter>
    </ScrollView>
  </Sheet>;
}
function PresetRow({ preset, store, current }: { preset: SplitPreset; store: SplitStore; current: boolean }) {
  const k = useKit(), freq = presetFrequency(store, preset);
  return <Tappable dim="row" accessibilityRole="button" onPress={() => trainingNav.splitSetup(preset.key)} testID={`split-preset-${preset.key}`}
    accessibilityLabel={`${preset.name}. ${preset.blurb}`}>
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <KitText weight={700} size={17} lineHeight={1.2} tracking={-0.015} style={{ flex: 1 }}>{preset.name}</KitText>
        {current ? <Badge label={tr('splitCurrent')} color="training" /> : <Badge label={tr('splitNAWeek', { n: preset.perWeek })} />}
      </View>
      <KitText weight={500} size={13} lineHeight={1.4} color="text-muted" style={{ marginTop: 5, marginBottom: 12 }}>{preset.blurb}</KitText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {preset.days.map(d => <View key={d.name} style={{ height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.12) }}>
          <KitText weight={600} size={12} color="training">{d.name}</KitText>
        </View>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
        {([['sp-split', trCount('splitDays', preset.days.length)], ['repeat', tr(freq === 2 ? 'splitFreq2' : 'splitFreq1').replace(/^Each muscle /, '')], ['person', preset.level]] as const)
          .map(([icon, text]) => <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name={icon} size={14} color={k.c['text-muted']} />
            <KitText weight={600} size={12} color="text-muted" numberOfLines={1}>{text}</KitText>
          </View>)}
      </View>
    </Card>
  </Tappable>;
}

/* ---------- one preset, set up before it is used ---------- */
export function SplitSetupSheet({ presetKey }: { presetKey?: string }) {
  const split = useSplit(), k = useKit(), { reduceMotion } = useTheme();
  const splitStore = split?.store;
  const ready = useMemo(() => splitStore ? presetFor(splitStore, presetKey ?? 'ul') ?? presetFor(splitStore, 'ul') : null, [splitStore, presetKey]);
  const [mode, setMode] = useState<SplitMode>('rotate');
  const [perWeek, setPerWeek] = useState<number | null>(null);
  const [week, setWeek] = useState<number[] | null>(null);
  const [start, setStart] = useState<number | null>(null);
  if (!split || !ready) return <Sheet header={<SheetHeader title={tr('splitTitle')} />}><View /></Sheet>;
  const { preset, drafts } = ready, store = split.store;
  const pw = perWeek ?? preset.perWeek, wk = week ?? [...preset.week], first = start ?? ready.start;
  const days = drafts.map(d => d.exercises.map(e => ({ name: e.exercise, sets: e.target_sets })));
  const coverage = weeklySets(days, timesPerWeek({ mode, perWeek: pw, week: wk }, drafts.length), store.muscles);
  const abbr = tr('splitWeekdayAbbr').split(',');
  const use = (custom: boolean) => {
    try {
      const had = store.chosen();
      const undo = store.choose({ key: preset.key, name: preset.name, mode, perWeek: mode === 'rotate' ? pw : wk.filter(x => x >= 0).length, week: wk, days: drafts, start: first });
      closeAll(reduceMotion, custom ? () => trainingNav.plan() : undefined);
      chosenToast(store, had, undo);
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  return <Sheet testID="split-setup" header={<SheetHeader title={preset.name} right={tr('splitUse')} onRight={() => use(false)} testID="split-setup-head" />}>
    <KitText weight={500} size={14.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 4, marginHorizontal: 4 }}>{preset.blurb}</KitText>
    <SheetEyebrow>{tr('splitHowItRuns')}</SheetEyebrow>
    <ModeControl value={mode} onChange={setMode} />
    {mode === 'rotate' ? <>
      <List><ControlRow title={tr('splitDaysPerWeek')} sub={tr('splitWeeklyTarget')}><PerWeekStepper value={pw} onChange={setPerWeek} /></ControlRow></List>
      <ListFooter>{tr('splitSetupFootRotate')}</ListFooter>
    </> : <>
      <WeekdayChips on={wk.map(x => x >= 0)} onToggle={i => { const on = wk.map(x => x >= 0); on[i] = !on[i]; setWeek(spreadWeek(on, drafts.length)); }} />
      <ListFooter>{tr('splitSetupFootWeekdays', { n: wk.filter(x => x >= 0).length })}</ListFooter>
    </>}
    <SheetEyebrow>{tr('splitStartWith')}</SheetEyebrow>
    <Chips testID="split-start-with">
      {drafts.map((d, i) => <Chip key={d.name} label={d.name} selected={i === first} color="training" onPress={() => setStart(i)} />)}
    </Chips>
    <SheetEyebrow>{tr('splitTheDays')}</SheetEyebrow>
    <Card style={{ padding: 0 }}>
      {drafts.map((d, i) => {
        const when = mode === 'weekdays' ? wk.map((y, j) => y === i ? abbr[j] : null).filter(Boolean).join(', ') : '';
        return <View key={d.name} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
          <DayNumber n={i + 1} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <KitText weight={700} size={15} lineHeight={1.25}>{d.name}</KitText>
            <KitText weight={500} size={12.5} lineHeight={1.4} color="text-muted" style={{ marginTop: 2 }}>{d.exercises.map(e => e.exercise).join(', ')}</KitText>
          </View>
          {when ? <KitText weight={600} size={12.5} color="training" style={{ paddingTop: 2 }}>{when}</KitText> : null}
        </View>;
      })}
    </Card>
    <SheetEyebrow>{tr('splitSetsPerMuscle')}</SheetEyebrow>
    <CoverageCard coverage={coverage} />
    <View style={{ gap: 10, marginTop: 10 }}>
      <Button label={tr('splitUseName', { name: preset.name })} full color="training" onPress={() => use(false)} testID="split-use" />
      <Button label={tr('splitCustomize')} full variant="quiet" icon="edit" onPress={() => use(true)} testID="split-customize" />
    </View>
    <ListFooter>{tr('splitSetupFoot')}</ListFooter>
  </Sheet>;
}

/* ---------- build your own from blank ---------- */
interface NewDay { name: string; focus: MuscleGroup[] }
export function SplitNewSheet() {
  const split = useSplit(), k = useKit(), { reduceMotion } = useTheme();
  const [name, setName] = useState(''), [mode, setMode] = useState<SplitMode>('rotate'), [pw, setPw] = useState(3), [fill, setFill] = useState(false);
  const [days, setDays] = useState<NewDay[]>(() => [1, 2, 3].map(n => ({ name: tr('splitNewDay', { n }), focus: [] })));
  const [week, setWeek] = useState<number[]>([0, -1, 1, -1, 2, -1, -1]);
  if (!split) return <Sheet header={<SheetHeader title={tr('splitNewTitle')} />}><View /></Sheet>;
  const store = split.store;
  const resize = (n: number) => {
    const next = days.slice(0, n);
    while (next.length < n) next.push({ name: tr('splitNewDay', { n: next.length + 1 }), focus: [] });
    setDays(next);
    setWeek(spreadWeek(week.map(x => x >= 0), n));
  };
  const create = () => {
    try {
      const had = store.chosen(), title = name.trim() || tr('splitNamePlaceholder');
      const drafts: DayDraft[] = store.blankDrafts(days.map((d, i) => ({ name: d.name.trim() || tr('splitNewDay', { n: i + 1 }), focus: d.focus })), fill);
      const undo = store.choose({ key: 'custom', name: title, mode, perWeek: mode === 'rotate' ? pw : week.filter(x => x >= 0).length, week, days: drafts, start: 0 });
      closeAll(reduceMotion, () => trainingNav.plan());
      showToast(tr('splitToastMine', { name: title }), { color: 'training', action: had ? { label: tr('splitUndo'), onAction: undo } : undefined });
    } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  return <Sheet testID="split-new" header={<SheetHeader title={tr('splitNewTitle')} right={tr('splitCreate')} onRight={create} testID="split-new-head" />}>
    <View style={{ marginTop: 6 }}><TextField label={tr('splitName')} placeholder={tr('splitNamePlaceholder')} value={name} onChangeText={setName} maxLength={60} testID="split-new-name" /></View>
    <List>
      <ControlRow title={tr('splitDaysIn')} sub={tr('splitRestNotDays')}>
        <Stepper value={days.length} min={1} max={7} label={tr('splitDaysIn')} onChange={resize} testID="split-new-days" />
      </ControlRow>
    </List>
    <SheetEyebrow>{tr('splitDaysTitle')}</SheetEyebrow>
    <Card style={{ padding: 0 }}>
      {days.map((d, i) => <View key={i} style={{ paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DayNumber n={i + 1} />
          <TextInput value={d.name} onChangeText={text => setDays(days.map((x, j) => j === i ? { ...x, name: text } : x))} maxLength={60}
            accessibilityLabel={tr('splitDayName', { n: i + 1 })} testID={`split-new-day-${i}`}
            style={[font(600, 15), { flex: 1, minWidth: 0, height: 40, borderRadius: 12, paddingHorizontal: 12, color: k.c.text, backgroundColor: k.dark ? alpha(k.c.text, 0.06) : k.c.bg }]} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {MUSCLE_GROUPS.map(m => <Chip key={m} label={m} selected={d.focus.includes(m)} color="training"
            onPress={() => setDays(days.map((x, j) => j === i ? { ...x, focus: MUSCLE_GROUPS.filter(y => y === m ? !x.focus.includes(m) : x.focus.includes(y)) } : x))} />)}
        </View>
      </View>)}
    </Card>
    <SheetEyebrow>{tr('splitHowItRuns')}</SheetEyebrow>
    <ModeControl value={mode} onChange={setMode} />
    {mode === 'rotate'
      ? <List><ControlRow title={tr('splitDaysPerWeek')} sub={tr('splitWeeklyTarget')}><PerWeekStepper value={pw} onChange={setPw} /></ControlRow></List>
      : <WeekdayChips on={week.map(x => x >= 0)} onToggle={i => { const on = week.map(x => x >= 0); on[i] = !on[i]; setWeek(spreadWeek(on, days.length)); }} />}
    <List>
      <ControlRow title={tr('splitSuggest')} sub={tr('splitSuggestSub')}><Switch value={fill} onValueChange={setFill} label={tr('splitSuggest')} testID="split-new-suggest" /></ControlRow>
    </List>
    <ListFooter>{fill ? tr('splitNewFootSuggest') : tr('splitNewFootEmpty')}</ListFooter>
  </Sheet>;
}
