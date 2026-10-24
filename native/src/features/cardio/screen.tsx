import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import type { Repository } from '../../data/repository';
import { useTheme } from '../../design/theme-provider';
import { t, type MessageKey } from '../../i18n/en';
import { bodyWeight, elapsedMs, kcalPerMin, localDay, machines, weeklyMinutes, type Machine, type Settings } from '../../core/cardio/rules';
import { clock, layout, Panel } from '../workout/primitives';
import { useWorkoutStore } from '../workout/use-workout';
import { CardioStore, machineDefaults } from './store';

const machineName = (machine: Machine) => t(`cardio_${machine}`);
const iconPaths: Record<Machine, string> = {
  treadmill: 'M3 19L17 15H21V19ZM17 15L14 4H20M14 7H19',
  stair: 'M3 21V16H8V11H13V6H18V3M5 3H19V13',
  elliptical: 'M3 18C3 12 21 12 21 18C21 23 3 23 3 18ZM8 15L12 7L16 15M12 7V3M15 3H18',
  bike: 'M8 17A4 4 0 1 0 0 17A4 4 0 1 0 8 17M23 17A4 4 0 1 0 15 17A4 4 0 1 0 23 17M4 17L9 7L15 17H4M8 7H12M19 17L16 4H20',
  rower: 'M2 19H22M5 16H15L20 9M9 16L5 8M5 8L13 5M5 8L2 12M13 5L19 14',
};
function MachineIcon({ machine }: { machine: Machine }) {
  const { colors } = useTheme();
  return <Svg accessible={false} width={28} height={28} viewBox="0 0 24 24"><Path d={iconPaths[machine]} fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function Field({ label, value, onChangeText, decimal = false }: { label: string; value: string; onChangeText: (value: string) => void; decimal?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ gap: 4 }}><ThemedText muted variant="caption">{label}</ThemedText><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={decimal ? 'decimal-pad' : 'default'} autoCapitalize="none" style={[layout.input, { color: colors.text, backgroundColor: colors['surface-2'] }]} /></View>;
}
function WeeklyRing({ minutes, goal }: { minutes: number; goal: number }) {
  const { colors } = useTheme();
  const circumference = Math.PI * 60;
  const label = t('cardioWeekSummary').replace('{minutes}', String(Math.round(minutes))).replace('{goal}', String(goal));
  // Deliberately static, including on goal changes: no animation under Reduce Motion.
  return <View accessible style={layout.row} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: goal, now: Math.min(minutes, goal), text: label }}>
    <Svg accessible={false} width={108} height={108} viewBox="0 0 76 76">
      <Circle cx={38} cy={38} r={30} fill="none" stroke={colors['surface-2']} strokeWidth={8} />
      <Circle cx={38} cy={38} r={30} fill="none" stroke={colors.accent} strokeWidth={8} strokeDasharray={[circumference * Math.min(1, minutes / goal), circumference]} rotation={-90} origin="38,38" />
    </Svg>
    <View style={{ flex: 1 }}><ThemedText variant="headline">{t('cardioWeeklyGoal')}</ThemedText><ThemedText>{label}</ThemedText></View>
  </View>;
}
export function Cardio({ repository }: { repository: Repository }) {
  const facade = useWorkoutStore(repository);
  const store = useMemo(() => new CardioStore(facade.repo, facade.viewRevision), [facade]);
  const live = store.live();
  const { colors } = useTheme();
  const [machine, setMachine] = useState<Machine>(live?.machine ?? 'treadmill');
  const initial = live?.segments.at(-1)?.settings ?? machineDefaults(machine);
  const metric = repository.list('profile')[0]?.data.weight_unit === 'kg';
  const [speed, setSpeed] = useState(String(initial.mph * (metric ? 1.609344 : 1)));
  const [incline, setIncline] = useState(String(initial.incline));
  const [level, setLevel] = useState(String(initial.level));
  const [logging, setLogging] = useState(false);
  const [day, setDay] = useState(() => localDay());
  const [minutes, setMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [goal, setGoal] = useState(String(store.goal()));
  const [error, setError] = useState<MessageKey | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Wall-clock timer catches up after backgrounding; intervals are display-only.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const weight = bodyWeight(repository.list('weigh_ins'), localDay(now));
  const settings: Settings = { mph: speed.trim() ? Number(speed) / (metric ? 1.609344 : 1) : NaN, incline: incline.trim() ? Number(incline) : NaN, level: level.trim() ? Number(level) : NaN };
  function run(action: () => void, message: MessageKey = 'cardioValidation') {
    try { action(); setError(null); } catch { setError(message); }
  }
  function fillSettings(value: Settings) {
    setSpeed(String(value.mph * (metric ? 1.609344 : 1))); setIncline(String(value.incline)); setLevel(String(value.level));
  }
  const currentMachine = live?.machine ?? machine;
  const estimate = live ? store.liveKcal(weight.kg, now) : kcalPerMin(machine, settings, weight.kg) * (Number(minutes) || 0);
  const kcalText = (kcal: number) => t('cardioKcal').replace('{kcal}', String(Math.round(kcal)));
  return <View style={layout.stack}>
    <Panel><WeeklyRing minutes={weeklyMinutes(store.sessions(), repository.list('pauses'), localDay(now))} goal={store.goal()} />
      <Field label={t('cardioGoalMinutes')} value={goal} onChangeText={setGoal} decimal />
      <Button label={t('cardioSaveGoal')} variant="secondary" onPress={() => run(() => store.setGoal(Number(goal)), 'cardioGoalError')} />
    </Panel>
    {error && <ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Panel>
      {!live && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{machines.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={machineName(value)} accessibilityState={{ selected: machine === value }} onPress={() => { setMachine(value); fillSettings(machineDefaults(value)); }} style={{ width: '47%', minHeight: 72, padding: 12, gap: 4, borderRadius: 12, backgroundColor: machine === value ? colors['surface-2'] : colors.surface, borderWidth: 1, borderColor: machine === value ? colors.accent : colors['surface-2'] }}><MachineIcon machine={value} /><ThemedText>{machineName(value)}</ThemedText></Pressable>)}</View>}
      {live && <>
        <ThemedText variant="headline">{machineName(live.machine)}</ThemedText>
        <ThemedText muted>{t(live.pausedAt === null ? 'cardioInProgress' : 'cardioPaused')}</ThemedText>
        <ThemedText accessibilityLabel={t('cardioElapsed')} variant="headline" style={{ fontSize: 48, fontVariant: ['tabular-nums'] }}>{clock(elapsedMs(live, now) / 1000)}</ThemedText>
      </>}
      {currentMachine === 'treadmill' && <Field label={t(metric ? 'cardioSpeedKmh' : 'cardioSpeedMph')} value={speed} onChangeText={setSpeed} decimal />}
      {currentMachine !== 'treadmill' && <Field label={t('cardioLevel')} value={level} onChangeText={setLevel} decimal />}
      {(['treadmill', 'stair', 'elliptical'] as Machine[]).includes(currentMachine) && <Field label={t('cardioIncline')} value={incline} onChangeText={setIncline} decimal />}
      {Number.isFinite(estimate) && <ThemedText>{kcalText(estimate)}</ThemedText>}
      <ThemedText muted variant="caption">{t(weight.fallback ? 'cardioFallback' : 'cardioEstimateHint')}</ThemedText>
      {live ? <>
        <Button label={t('cardioApplySettings')} variant="secondary" onPress={() => run(() => store.change(settings))} />
        <Button label={t(live.pausedAt === null ? 'cardioPause' : 'cardioResume')} variant="secondary" onPress={() => run(() => live.pausedAt === null ? store.pause() : store.resume())} />
        <Button label={t('finish')} onPress={() => run(() => { store.finish(); setNow(Date.now()); })} />
        <Button label={t('cardioCancel')} variant="secondary" onPress={() => Alert.alert(t('cardioCancelTitle'), t('cardioCancelBody'), [{ text: t('cancel'), style: 'cancel' }, { text: t('cardioCancel'), style: 'destructive', onPress: () => run(() => store.cancel()) }])} />
      </> : logging ? <>
        <Field label={t('cardioDate')} value={day} onChangeText={setDay} />
        <Field label={t('cardioMinutes')} value={minutes} onChangeText={setMinutes} decimal />
        <Field label={t('notes')} value={notes} onChangeText={setNotes} />
        <Button label={t('cardioSave')} onPress={() => run(() => { store.logFinished({ day, machine, durationMs: Math.round(Number(minutes) * 60000), settings, notes }); setLogging(false); })} />
        <Button label={t('cancel')} variant="secondary" onPress={() => { setLogging(false); setError(null); }} />
      </> : <>
        <Button label={t('cardioStart')} onPress={() => run(() => { store.start(machine, settings); setNow(Date.now()); })} />
        <Button label={t('cardioLogFinished')} variant="secondary" onPress={() => { setDay(localDay()); setLogging(true); }} />
      </>}
    </Panel>
    <ThemedText muted variant="caption">{t('cardioLocalSettings')}</ThemedText>
    <ThemedText variant="headline" accessibilityRole="header">{t('cardioSaved')}</ThemedText>
    {store.sessions().length === 0 && <ThemedText muted>{t('cardioEmpty')}</ThemedText>}
    {store.sessions().map(row => {
      const kind = row.data.kind as Machine;
      const known = machines.includes(kind);
      const kcal = store.sessionKcal(row, weight.kg);
      return <Panel key={row.id} testID={`cardio-session-${row.id}`}>
        <ThemedText variant="headline">{known ? machineName(kind) : t('cardio')}</ThemedText>
        <ThemedText>{t('cardioSessionSummary').replace('{day}', String(row.data.day)).replace('{minutes}', String(Math.round(Number(row.data.duration_ms) / 60000)))}</ThemedText>
        <ThemedText muted>{kcal === null ? t('cardioUnknownKcal') : kcalText(kcal)}</ThemedText>
        {!!row.data.notes && <ThemedText>{row.data.notes}</ThemedText>}
        {known && !live && <Button label={t('cardioRestart').replace('{machine}', machineName(kind))} variant="secondary" onPress={() => run(() => { const settings = store.segments(row.id)?.[0]?.settings ?? machineDefaults(kind); fillSettings(settings); setMachine(kind); store.start(kind, settings); setNow(Date.now()); })} />}
      </Panel>;
    })}
  </View>;
}
