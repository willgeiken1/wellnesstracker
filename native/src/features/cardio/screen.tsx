import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import type { Repository } from '../../data/repository';
import { Icon } from '../../components/icon';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { t, type MessageKey } from '../../i18n/en';
import { bodyWeight, elapsedMs, kcalPerMin, localDay, machines, weeklyMinutes, type Machine, type Settings } from '../../core/cardio/rules';
import { clock, layout } from '../workout/primitives';
import { Field as Input, Pick, Primary, Secondary, SectionTitle, Trouble, card, dayLabel, semibold } from '../workout/parts';
import { useWorkoutStore } from '../workout/use-workout';
import { CardioStore, machineDefaults } from './store';
import type { HealthSource } from '../health/source';
import { healthWeek } from './health';
import { useHealthWorkouts } from './use-health-workouts';
import { useFocused } from '../home/use-focused';

const machineName = (machine: Machine) => t(`cardio_${machine}`);
function MachineIcon({ machine, color }: { machine: Machine; color?: string }) {
  return <Icon name={machine} size={28} color={color} />;
}
function Field({ label, value, onChangeText, decimal = false, grow = false }: { label: string; value: string; onChangeText: (value: string) => void; decimal?: boolean; grow?: boolean }) {
  return <Input style={grow ? { flex: 1 } : undefined} label={label} value={value} onChangeText={onChangeText} keyboardType={decimal ? 'decimal-pad' : 'default'} autoCapitalize="none" />;
}
function WeeklyRing({ minutes, goal }: { minutes: number; goal: number }) {
  const { colors } = useTheme();
  const circumference = Math.PI * 60;
  const label = t('cardioWeekSummary').replace('{minutes}', String(Math.round(minutes))).replace('{goal}', String(goal));
  // Deliberately static, including on goal changes: no animation under Reduce Motion.
  return <View accessible style={[layout.row, { gap: tokens.spacing[3] }]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: goal, now: Math.min(minutes, goal), text: label }}>
    <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
      <Svg accessible={false} width={96} height={96} viewBox="0 0 76 76" style={{ position: 'absolute' }}>
        <Circle cx={38} cy={38} r={30} fill="none" stroke={colors['surface-2']} strokeWidth={8} />
        <Circle cx={38} cy={38} r={30} fill="none" stroke={colors.training} strokeWidth={8} strokeLinecap="round" strokeDasharray={[circumference * Math.min(1, minutes / goal), circumference]} rotation={-90} origin="38,38" />
      </Svg>
      <ThemedText numeric style={{ fontSize: 22, lineHeight: 26 }}>{Math.round(minutes)}</ThemedText>
      <ThemedText muted variant="caption">{t('cardioMin')}</ThemedText>
    </View>
    <View style={{ flex: 1, gap: 2 }}><ThemedText variant="headline" style={semibold}>{t('cardioWeeklyGoal')}</ThemedText><ThemedText muted>{label}</ThemedText></View>
  </View>;
}
/** `health` replaces Apple Health in tests; null turns it off. */
export function Cardio({ repository, health }: { repository: Repository; health?: HealthSource | null }) {
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
  // Typed weigh-ins only. A saved session syncs, so its calorie estimate must not come from an Apple Health reading.
  const weight = bodyWeight(repository.list('weigh_ins').filter(row => row.data.source === 'app'), localDay(now));
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
  const sessions = store.sessions();
  const pauses = repository.list('pauses');
  // Read again each time Cardio comes back to the front, so connecting Health in Settings shows up here.
  const healthWorkouts = useHealthWorkouts(useFocused(), health);
  // Apple Health workouts stay in memory: they add to the ring here and are never written to a cardio row.
  const fromHealth = healthWorkouts ? healthWeek(healthWorkouts, sessions, pauses, localDay(now)) : null;
  return <View style={layout.stack}>
    <Card testID="cardio-week" style={[card, { gap: tokens.spacing[2] }]}><WeeklyRing minutes={weeklyMinutes(sessions, pauses, localDay(now)) + (fromHealth?.minutes ?? 0)} goal={store.goal()} />
      {!!fromHealth && fromHealth.minutes > 0 && <ThemedText muted variant="caption">{t('cardioHealthIncluded').replace('{minutes}', String(Math.round(fromHealth.minutes)))}</ThemedText>}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing[1] }}>
        <Field grow label={t('cardioGoalMinutes')} value={goal} onChangeText={setGoal} decimal />
        <View style={{ minHeight: 48, justifyContent: 'center' }}><Pick onSurface text={t('cardioSaveGoal')} onPress={() => run(() => store.setGoal(Number(goal)), 'cardioGoalError')} /></View>
      </View>
    </Card>
    {error && <Trouble text={t(error)} />}
    <SectionTitle>{t(live ? 'cardioNow' : 'cardioChoose')}</SectionTitle>
    <Card testID="cardio-session" style={[card, { gap: tokens.spacing[2] }]}>
      {!live && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>{machines.map(value => { const on = machine === value; return <Pressable key={value} accessibilityRole="button" accessibilityLabel={machineName(value)} accessibilityState={{ selected: on }} onPress={() => { setMachine(value); fillSettings(machineDefaults(value)); }} style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minHeight: 76, padding: 12, gap: 6, borderRadius: 14, backgroundColor: colors['surface-2'], borderWidth: 2, borderColor: on ? colors.accent : colors['surface-2'], opacity: pressed ? 0.7 : 1 })}><MachineIcon machine={value} color={on ? colors.accent : undefined} /><ThemedText style={on ? semibold : undefined}>{machineName(value)}</ThemedText></Pressable>; })}</View>}
      {live && <View style={{ alignItems: 'center', gap: 2 }}>
        <View style={[layout.row, { gap: tokens.spacing[1] }]}><MachineIcon machine={live.machine} /><ThemedText variant="headline" style={semibold}>{machineName(live.machine)}</ThemedText></View>
        <ThemedText accessibilityLabel={t('cardioElapsed')} variant="headline" style={{ fontSize: 48, lineHeight: 56, fontVariant: ['tabular-nums'] }}>{clock(elapsedMs(live, now) / 1000)}</ThemedText>
        <ThemedText muted>{t(live.pausedAt === null ? 'cardioInProgress' : 'cardioPaused')}</ThemedText>
      </View>}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[2] }}>
        {currentMachine === 'treadmill' && <Field grow label={t(metric ? 'cardioSpeedKmh' : 'cardioSpeedMph')} value={speed} onChangeText={setSpeed} decimal />}
        {currentMachine !== 'treadmill' && <Field grow label={t('cardioLevel')} value={level} onChangeText={setLevel} decimal />}
        {(['treadmill', 'stair', 'elliptical'] as Machine[]).includes(currentMachine) && <Field grow label={t('cardioIncline')} value={incline} onChangeText={setIncline} decimal />}
      </View>
      <View style={{ gap: 2 }}>
        {Number.isFinite(estimate) && <ThemedText numeric style={semibold}>{kcalText(estimate)}</ThemedText>}
        <ThemedText muted variant="caption">{t(weight.fallback ? 'cardioFallback' : 'cardioEstimateHint')}</ThemedText>
      </View>
      {live ? <>
        <Primary label={t('finish')} onPress={() => run(() => { store.finish(); setNow(Date.now()); })} />
        <View style={{ flexDirection: 'row', gap: tokens.spacing[1] }}>
          <View style={{ flex: 1 }}><Secondary onSurface label={t(live.pausedAt === null ? 'cardioPause' : 'cardioResume')} onPress={() => run(() => live.pausedAt === null ? store.pause() : store.resume())} /></View>
          <View style={{ flex: 1 }}><Secondary onSurface label={t('cardioApplySettings')} onPress={() => run(() => store.change(settings))} /></View>
        </View>
        <View style={{ alignSelf: 'center' }}><Pick onSurface text={t('cardioCancel')} onPress={() => Alert.alert(t('cardioCancelTitle'), t('cardioCancelBody'), [{ text: t('cancel'), style: 'cancel' }, { text: t('cardioCancel'), style: 'destructive', onPress: () => run(() => store.cancel()) }])} /></View>
      </> : logging ? <>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[2] }}>
          <Field grow label={t('cardioDate')} value={day} onChangeText={setDay} />
          <Field grow label={t('cardioMinutes')} value={minutes} onChangeText={setMinutes} decimal />
        </View>
        <Field label={t('notes')} value={notes} onChangeText={setNotes} />
        <Primary label={t('cardioSave')} onPress={() => run(() => { store.logFinished({ day, machine, durationMs: Math.round(Number(minutes) * 60000), settings, notes }); setLogging(false); })} />
        <Secondary onSurface label={t('cancel')} onPress={() => { setLogging(false); setError(null); }} />
      </> : <>
        <Primary label={t('cardioStart')} onPress={() => run(() => { store.start(machine, settings); setNow(Date.now()); })} />
        <Secondary onSurface label={t('cardioLogFinished')} onPress={() => { setDay(localDay()); setLogging(true); }} />
      </>}
    </Card>
    <ThemedText muted variant="caption">{t('cardioLocalSettings')}</ThemedText>
    {!!fromHealth && fromHealth.workouts.length > 0 && <>
      <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { marginTop: tokens.spacing[1] }]}>{t('cardioHealthTitle')}</ThemedText>
      {fromHealth.workouts.map(w => <Card key={w.id} testID={`cardio-health-${w.id}`} style={[card, { gap: 2 }]}>
        <ThemedText variant="headline" style={semibold}>{t(`workoutKind_${w.kind}`)}</ThemedText>
        <ThemedText muted numeric variant="caption">{t('cardioHealthSummary').replace('{day}', dayLabel(w.day)).replace('{minutes}', String(Math.round(w.minutes)))}</ThemedText>
        {w.kcal !== null && <ThemedText numeric>{t('cardioHealthKcal').replace('{kcal}', String(Math.round(w.kcal)))}</ThemedText>}
        {!!w.app && <ThemedText muted variant="caption">{t('cardioHealthFrom').replace('{app}', w.app)}</ThemedText>}
        <ThemedText muted={w.status !== 'counted'} variant="caption">{t(`cardioHealthStatus_${w.status}`)}</ThemedText>
      </Card>)}
      <ThemedText muted variant="caption">{t('cardioHealthNote')}</ThemedText>
    </>}
    <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { marginTop: tokens.spacing[1] }]}>{t('cardioSaved')}</ThemedText>
    {sessions.length === 0 && <Card testID="cardio-empty" style={card}>
      <ThemedText style={semibold}>{t('cardioEmptyTitle')}</ThemedText>
      <ThemedText muted>{t('cardioEmpty')}</ThemedText>
    </Card>}
    {sessions.map(row => {
      const kind = row.data.kind as Machine;
      const known = machines.includes(kind);
      const kcal = store.sessionKcal(row, weight.kg);
      return <Card key={row.id} testID={`cardio-session-${row.id}`} style={[card, { gap: tokens.spacing[1] }]}>
        <View style={[layout.row, { gap: tokens.spacing[2] }]}>
          {known && <View style={{ width: 44, height: 44, borderRadius: tokens.radii.card, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}><MachineIcon machine={kind} /></View>}
          <View style={{ flex: 1 }}>
            <ThemedText variant="headline" style={semibold}>{known ? machineName(kind) : t('cardio')}</ThemedText>
            <ThemedText muted numeric variant="caption">{t('cardioSessionSummary').replace('{day}', dayLabel(row.data.day)).replace('{minutes}', String(Math.round(Number(row.data.duration_ms) / 60000)))}</ThemedText>
          </View>
        </View>
        <ThemedText muted={kcal === null} numeric={kcal !== null}>{kcal === null ? t('cardioUnknownKcal') : kcalText(kcal)}</ThemedText>
        {!!row.data.notes && <ThemedText>{row.data.notes}</ThemedText>}
        {known && !live && <View style={{ alignSelf: 'flex-start' }}><Pick onSurface text={t('cardioAgain')} label={t('cardioRestart').replace('{machine}', machineName(kind))} onPress={() => run(() => { const settings = store.segments(row.id)?.[0]?.settings ?? machineDefaults(kind); fillSettings(settings); setMachine(kind); store.start(kind, settings); setNow(Date.now()); })} /></View>}
      </Card>;
    })}
  </View>;
}
