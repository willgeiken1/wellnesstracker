import { useMemo, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { KitText } from '@/components/themed-text';
import { capitals, font, KIT, mix, SurfaceContext, useKit } from '@/components/kit-style';
import { List, ListFooter, ListRow } from '@/components/list-row';
import { SectionHeader } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet, SheetHeader } from '@/components/sheet';
import { PressScale } from '@/components/press-scale';
import { Stepper } from '@/components/stepper';
import { TextField } from '@/components/text-field';
import { localDay } from '@/core/workout/rules';
import { CardioStore, MANUAL_KINDS, type Effort, type ManualKind } from '@/features/cardio/store';
import { useHealthWorkouts } from '@/features/cardio/use-health-workouts';
import { showToast } from '@/features/shell/toast';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { cardioName, clockTime, dayLabel, TrainingData } from '../training-data';
import { tr } from '../tr';

const EFFORTS: readonly Effort[] = ['easy', 'light', 'moderate', 'hard', 'max'];
const EFFORT_NAME: Record<Effort, string> = { easy: 'Easy', light: 'Light', moderate: 'Moderate', hard: 'Hard', max: 'Max' };
const MI = 1609.344, KM = 1000;
const OUTDOOR: Record<string, string> = { run: 'Outdoor run', walk: 'Outdoor walk', cycle: 'Outdoor cycle', hike: 'Hike', swim: 'Swim' };

/** The Log cardio sheet (`cardio-log`): type, duration, distance, start time, effort, notes, and this week's Apple Health workouts. */
export function CardioLogSheet({ at }: { at?: number }) {
  const k = useKit(), { repository } = useAuth();
  const [now] = useState(() => at ?? Date.now());
  // Distance is typed in the unit from Settings and kept in metres.
  const [{ units: { distance: du } }] = useSettingsPrefs(), km = du === 'km';
  const [kind, setKind] = useState<ManualKind>('run'), [min, setMin] = useState(30), [mi, setMi] = useState(() => km ? 5 : 3);
  const [effort, setEffort] = useState<Effort>('moderate'), [notes, setNotes] = useState(''), [saving, setSaving] = useState(false);
  const health = useHealthWorkouts();
  const imported = useMemo(() => (health ?? []).filter(w => !['strength', 'yoga', 'other'].includes(w.kind)).slice(0, 6), [health]);
  const hasDistance = kind !== 'elliptical' && kind !== 'stairs';
  const save = () => {
    if (!repository || saving) return;
    setSaving(true);
    try {
      new CardioStore(repository).logManual({ kind, day: localDay(new Date(now)), durationMs: min * 60_000, distanceM: hasDistance && mi > 0 ? Math.round(mi * (km ? KM : MI)) : null,
        notes: notes.trim(), effort, startedAt: now });
      const data = new TrainingData(repository, Date.now());
      showToast(tr('trainingCardioSaved', { name: cardioName(kind), min: data.todayMin(), goal: data.goalMin() }), { color: 'training' });
      router.back();
    } catch { setSaving(false); showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const typeBg = k.dark ? k.c['surface-2'] : k.c.surface;
  const eyebrow = (text: string, top: number) => <Text style={[font(700, 10.5, 1, 0.14), capitals, { color: k.c['text-muted'], marginTop: top, marginHorizontal: 4, marginBottom: 10 }]}>{text}</Text>;
  const field = (title: string, sub: string, right: ReactNode, first = false) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <View style={{ flexShrink: 1 }}>
      <KitText weight={600} size={15.5} lineHeight={21 / 15.5}>{title}</KitText>
      <KitText weight={500} size={12.5} lineHeight={16 / 12.5} color="text-muted" lineBreakStrategyIOS="push-out">{sub}</KitText>
    </View>
    {right}
  </View>;
  return <SurfaceContext.Provider value="sheet"><Sheet gap={0} header={<SheetHeader title={tr('trainingLogCardio')} right={tr('trainingSave')} onRight={save} rightDisabled={saving} />}>
    {eyebrow(tr('trainingType'), 8)}
    <View accessibilityLabel={tr('trainingCardioType')} style={{ gap: 8 }}>
      {[MANUAL_KINDS.slice(0, 3), MANUAL_KINDS.slice(3)].map((line, r) => <View key={r} style={{ flexDirection: 'row', gap: 8 }}>{line.map(t => {
        const on = t === kind;
        return <PressScale key={t} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={cardioName(t)} onPress={() => setKind(t)}
          style={{ flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
            backgroundColor: on ? mix(k.c.training, typeBg, k.dark ? 0.22 : 0.18) : typeBg,
            boxShadow: on ? `inset 0px 0px 0px 1.5px ${k.c.training}` : k.cardEdge }}>
          <KitText weight={600} size={14.5} color={on ? 'training' : 'text'}>{cardioName(t)}</KitText>
        </PressScale>;
      })}</View>)}
    </View>
    <View style={{ marginTop: 20, borderRadius: KIT.radius.list, overflow: 'hidden', backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
      <SurfaceContext.Provider value="sheet-inset">
        {field(tr('trainingDuration'), tr('trainingDurationSub'), <Stepper value={min} onChange={setMin} step={5} min={5} max={360} unit="min" label={tr('trainingDurationLabel')}
          lessLabel={tr('trainingLess', { what: tr('trainingDurationLabel') })} moreLabel={tr('trainingMore', { what: tr('trainingDurationLabel') })} />, true)}
        {hasDistance && field(tr('trainingDistance'), tr('trainingOptional'), <Stepper value={mi} onChange={setMi} step={0.1} dec={1} min={0} max={km ? 160 : 100} unit={km ? 'km' : 'mi'} label={tr(km ? 'trainingDistanceLabelKm' : 'trainingDistanceLabel')}
          lessLabel={tr('trainingLess', { what: tr(km ? 'trainingDistanceLabelKm' : 'trainingDistanceLabel') })} moreLabel={tr('trainingMore', { what: tr(km ? 'trainingDistanceLabelKm' : 'trainingDistanceLabel') })} />)}
        {field(tr('trainingStartedRow'), tr('trainingToday'), <KitText weight={600} size={12.5} lineHeight={1.26} tracking={-0.02} numeric color="text-muted" style={{ paddingRight: 8 }}>{clockTime(now)}</KitText>)}
      </SurfaceContext.Provider>
    </View>
    {eyebrow(tr('trainingEffort'), 22)}
    <SegmentedControl label={tr('trainingEffort')} options={EFFORTS.map(e => ({ value: e, label: EFFORT_NAME[e] }))} value={effort} onChange={setEffort} />
    <ListFooter>{tr(`trainingEffort_${effort}`)}</ListFooter>
    <View style={{ marginTop: 20 }}><TextField label={tr('trainingNotes')} placeholder={tr('trainingOptional')} value={notes} onChangeText={setNotes} maxLength={2000} /></View>
    {health && <>
      <SectionHeader title={tr('trainingFromHealth')} aside={tr('trainingImported')} />
      <List footer={tr('trainingHealthFoot')}>
        {imported.length ? imported.map(w => <ListRow key={w.id} icon="heart" color="danger" title={OUTDOOR[w.kind] ?? cardioName(w.kind)}
          sub={[dayLabel(localDay(w.start)), w.app].filter(Boolean).join(' · ')} value={tr('trainingMinShort', { n: Math.round(w.minutes) })} />)
          : <ListRow title={tr('trainingNoHealthWorkouts')} />}
      </List>
    </>}
  </Sheet></SurfaceContext.Provider>;
}
