import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { KitText } from '@/components/themed-text';
import { capitals, font, mix, SurfaceContext, tabular, useKit } from '@/components/kit-style';
import { List, ListFooter, ListRow } from '@/components/list-row';
import { SectionHeader } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet, SheetHeader } from '@/components/sheet';
import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { TextField } from '@/components/text-field';
import { localDay } from '@/core/workout/rules';
import { CardioStore, MANUAL_KINDS, type Effort, type ManualKind } from '@/features/cardio/store';
import { useHealthWorkouts } from '@/features/cardio/use-health-workouts';
import { showToast } from '@/features/shell/toast';
import { cardioName, clockTime, dayLabel, TrainingData } from '../training-data';
import { tr } from '../tr';

const EFFORTS: readonly Effort[] = ['easy', 'light', 'moderate', 'hard', 'max'];
const EFFORT_NAME: Record<Effort, string> = { easy: 'Easy', light: 'Light', moderate: 'Moderate', hard: 'Hard', max: 'Max' };
const MI = 1609.344;
const OUTDOOR: Record<string, string> = { run: 'Outdoor run', walk: 'Outdoor walk', cycle: 'Outdoor cycle', hike: 'Hike', swim: 'Swim' };

/** The Log cardio sheet (`cardio-log`): type, duration, distance, start time, effort, notes, and this week's Apple Health workouts. */
export function CardioLogSheet({ at }: { at?: number }) {
  const k = useKit(), { repository } = useAuth();
  const [now] = useState(() => at ?? Date.now());
  const [kind, setKind] = useState<ManualKind>('run'), [min, setMin] = useState(30), [mi, setMi] = useState(3);
  const [effort, setEffort] = useState<Effort>('moderate'), [notes, setNotes] = useState(''), [saving, setSaving] = useState(false);
  const health = useHealthWorkouts();
  const imported = useMemo(() => (health ?? []).filter(w => !['strength', 'yoga', 'other'].includes(w.kind)).slice(0, 6), [health]);
  const hasDistance = kind !== 'elliptical' && kind !== 'stairs';
  const save = () => {
    if (!repository || saving) return;
    setSaving(true);
    try {
      new CardioStore(repository).logManual({ kind, day: localDay(new Date(now)), durationMs: min * 60_000, distanceM: hasDistance && mi > 0 ? Math.round(mi * MI) : null,
        notes: notes.trim(), effort, startedAt: now });
      const data = new TrainingData(repository, Date.now());
      showToast(tr('trainingCardioSaved', { name: cardioName(kind), min: data.todayMin(), goal: data.goalMin() }), { color: 'training' });
      router.back();
    } catch { setSaving(false); showToast(tr('trainingSaveError'), { color: 'warning' }); }
  };
  const typeBg = k.dark ? k.c['surface-2'] : k.c.surface;
  return <SurfaceContext.Provider value="sheet"><Sheet header={<SheetHeader title={tr('trainingLogCardio')} right={tr('trainingSave')} onRight={save} rightDisabled={saving} />}>
    <Text style={[font(700, 10.5, 1, 0.14), capitals, { color: k.c['text-muted'], marginTop: 8, marginHorizontal: 4 }]}>{tr('trainingType')}</Text>
    <View accessibilityLabel={tr('trainingCardioType')} style={{ gap: 8, marginTop: -2 }}>
      {[MANUAL_KINDS.slice(0, 3), MANUAL_KINDS.slice(3)].map((line, r) => <View key={r} style={{ flexDirection: 'row', gap: 8 }}>{line.map(t => {
        const on = t === kind;
        return <Tappable key={t} dim="fill" accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={cardioName(t)} onPress={() => setKind(t)}
          style={{ flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
            backgroundColor: on ? mix(k.c.training, typeBg, k.dark ? 0.22 : 0.18) : typeBg,
            boxShadow: on ? `inset 0px 0px 0px 1.5px ${k.c.training}` : k.cardEdge }}>
          <KitText weight={600} size={14.5} color={on ? 'training' : 'text'}>{cardioName(t)}</KitText>
        </Tappable>;
      })}</View>)}
    </View>
    <List style={{ marginTop: 8 }}>
      <ListRow title={tr('trainingDuration')} sub={tr('trainingDurationSub')} right={<Step value={min} onChange={setMin} step={5} min={5} max={360} unit="min" dec={0} label={tr('trainingDurationLabel')} />} />
      {hasDistance && <ListRow title={tr('trainingDistance')} sub={tr('trainingOptional')} right={<Step value={mi} onChange={setMi} step={0.1} dec={1} min={0} max={100} unit="mi" label={tr('trainingDistanceLabel')} />} />}
      <ListRow title={tr('trainingStartedRow')} sub={tr('trainingToday')} value={clockTime(now)} />
    </List>
    <Text style={[font(700, 10.5, 1, 0.14), capitals, { color: k.c['text-muted'], marginTop: 10, marginHorizontal: 4 }]}>{tr('trainingEffort')}</Text>
    <View style={{ marginTop: -2 }}>
      <SegmentedControl label={tr('trainingEffort')} options={EFFORTS.map(e => ({ value: e, label: EFFORT_NAME[e] }))} value={effort} onChange={setEffort} />
      <ListFooter>{tr(`trainingEffort_${effort}`)}</ListFooter>
    </View>
    <View style={{ marginTop: 8 }}><TextField label={tr('trainingNotes')} placeholder={tr('trainingOptional')} value={notes} onChangeText={setNotes} maxLength={2000} /></View>
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

/** The mockup's stepper on a sheet list (`.tr-cl .list .stepper`): minus, the value with its unit, plus. */
function Step({ value, onChange, step, min, max, dec, unit, label }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; dec: number; unit: string; label: string }) {
  const k = useKit(), set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const text = `${value.toFixed(dec)} ${unit}`;
  const button = (icon: 'minus' | 'plus', d: number, spoken: string) => <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={spoken}
    disabled={d < 0 ? value <= min : value >= max} onPress={() => set(value + d * step)}
    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
    <Icon name={icon} size={18} color={k.c.text} />
  </Tappable>;
  return <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, backgroundColor: k.dark ? mix(k.c.text, k.c['surface-2'], 0.08) : k.c['surface-2'] }}>
    {button('minus', -1, tr('trainingLess', { what: label }))}
    <KitText weight={700} size={17} numeric style={[{ minWidth: 72, textAlign: 'center' }, tabular]}>{text}</KitText>
    {button('plus', 1, tr('trainingMore', { what: label }))}
  </View>;
}
