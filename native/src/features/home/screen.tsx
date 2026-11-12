import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { fromKg, localDay } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { entryVolumeKg } from '@/features/workout/volume';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { dailyWeights } from '@/features/body/model';
import { attributedDay, foodTargets, totals } from '@/features/food/model';
import { useFoodRevision } from '@/features/food/use-food-revision';
import { PlanStore } from '@/features/plans/store';
import { useWorkout } from '@/features/workout/use-workout';
import { pluralize, t } from '@/i18n/en';
import { MINI, terrain } from './contour';
import { EditHome } from './edit-sheet';
import { type HealthDays } from '../health/days';
import { useHealthDays } from '../health/use-health-days';
import { HOME_TILES_KEY, isSmall, loadTiles, type HomeTiles, type TileId } from './tiles';

export const greeting = (hour: number) => t(hour >= 5 && hour < 12 ? 'goodMorning' : hour >= 12 && hour < 18 ? 'goodAfternoon' : 'goodEvening');
const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const heading = { fontFamily: tokens.font.heading } as const;
const semibold = { fontWeight: '600' } as const;
// The prototype's card: softer corners and tighter padding than the shared Card default.
const card: ViewStyle = { borderRadius: 18, padding: tokens.spacing[2] };
// Two hills until a recovery source exists in this build; the prototype's third hill sits below these.
const HILLS = [[0.36, 0.42], [0.63, 0.60]] as const;
// Wider, wobblier hills than the prototype default so two hills still merge into one piece of terrain.
const SHAPE = { positions: HILLS, sd: 0.2, wobble: 0.22 } as const;
type Pillar = 'training' | 'food';
const PILLARS: Pillar[] = ['training', 'food'];

interface DayFacts { kcal: number | null; protein: number | null; logged: boolean; trained: boolean; volumeKg: number }
const NONE: DayFacts = { kcal: null, protein: null, logged: false, trained: false, volumeKg: 0 };

// These take the store facade, which is new on every repository revision, so compiled
// memoization re-reads after a save instead of holding the first answer.
function nextRoutine(store: WorkoutStore) {
  const plans = new PlanStore(store.repo), days = plans.read().days;
  return days.length ? store.templates().find(r => r.id === days[plans.nextIndex()]?.routineId) : undefined;
}
/** What was logged on each local day. Today's food uses the food screen's own day rule. */
function readDays(store: WorkoutStore, days: string[], today: string, foodDay: string, _revision: number) {
  const wanted = new Set(days), out = new Map<string, DayFacts>();
  const food = store.repo.list('food_entries');
  for (const day of days) {
    // Before 4 a.m. the food screen still files food under yesterday. Home shows that food under today, to agree
    // with the Food tab, so yesterday's column must not show the same entries a second time.
    // Food filed under the calendar day itself in those hours (the Food tab lets you pick it) still counts for today.
    const sources = day === today ? [foodDay, today] : day === foodDay ? [] : [day];
    const rows = food.filter(r => sources.includes(String(r.data.day))), sum = totals(rows);
    out.set(day, { ...NONE, logged: rows.length > 0, kcal: sum.energy_kj === null ? null : sum.energy_kj / 4.184, protein: sum.protein_g });
  }
  // Only workouts with a counted set: a past-day draft that was opened and left empty is not a workout.
  for (const session of store.trainingHistory()) {
    const day = String(session.data.day), facts = out.get(day);
    if (!wanted.has(day) || !facts) continue;
    facts.trained = true;
    for (const entry of store.entries(session.id)) facts.volumeKg += entryVolumeKg(store, entry);
  }
  return out;
}
function readTargets(store: WorkoutStore, day: string, _revision: number) {
  const targets = foodTargets(store.repo, day).targets;
  return targets ? { kcal: targets.energy_kj / 4.184, protein: targets.protein_g } : null;
}
/** Each day is measured against its own target, so changing today's target never redraws earlier days. */
function readDayTargets(store: WorkoutStore, days: string[], today: string, foodDay: string, revision: number) {
  return new Map(days.map(day => [day, readTargets(store, day === today ? foodDay : day, revision)]));
}
function readWeights(store: WorkoutStore) { return dailyWeights(store.repo.list('weigh_ins')).slice(-14).map(w => w.kg); }
function hasAnything(store: WorkoutStore, _revision: number) {
  return !!store.active() || store.history().length > 0 || store.repo.list('food_entries').length > 0 || readWeights(store).length > 0;
}

/** How far along each pillar is, 0 to 1.05. A finished workout fills training; food follows the calorie target. */
function progress(facts: DayFacts, goalKcal: number | null, active: boolean): Record<Pillar, number> {
  return {
    training: facts.trained ? 1 : active ? 0.4 : 0,
    food: !facts.logged ? 0 : goalKcal && facts.kcal !== null ? clamp(facts.kcal / goalKcal, 0.08, 1.05) : 0.5,
  };
}
const percent = (p: Record<Pillar, number>) => Math.round(100 * (Math.min(1, p.training) + Math.min(1, p.food)) / 2);

function usePillarColors(): Record<Pillar, string> {
  const { colors } = useTheme();
  return { training: colors.training, food: colors.food };
}

/** Data shapes from the prototype: training is a circle, food a triangle. Colour is never the only cue. */
function Shape({ kind, color, size = 9 }: { kind: Pillar; color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 10 10" accessible={false}>
    {kind === 'training' ? <Circle cx={5} cy={5} r={4.2} fill={color} /> : <Path d="M5 .8L9.4 9H.6z" fill={color} />}
  </Svg>;
}

function Contours({ values, width, height, mini }: { values: Record<Pillar, number>; width: number; height: number; mini?: boolean }) {
  const colors = usePillarColors(), { training, food } = values;
  const map = useMemo(() => terrain([training, food], width, height, mini ? { ...MINI, positions: HILLS } : SHAPE), [training, food, width, height, mini]);
  return <>
    {map.lines.map((line, i) => <Path key={i} d={line.d} fill="none" stroke={colors[PILLARS[line.hill]]} strokeWidth={line.width} opacity={line.opacity} strokeLinecap="round" />)}
    {map.markers.map(m => m.summit
      ? <Path key={m.hill} d={`M${m.x.toFixed(1)} ${(m.y - 7).toFixed(1)} l-6 10.5 h12 z`} fill={colors[PILLARS[m.hill]]} />
      : <Circle key={m.hill} cx={m.x} cy={m.y} r={2} fill={colors[PILLARS[m.hill]]} />)}
  </>;
}

function SmallButton({ label, accessibilityLabel, onPress, ghost }: { label: string; accessibilityLabel?: string; onPress: () => void; ghost?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} hitSlop={{ top: 4, bottom: 4 }}
    style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: tokens.radii.card,
      backgroundColor: ghost ? colors['surface-2'] : colors.accent, opacity: pressed ? 0.8 : 1 })}>
    <ThemedText style={[semibold, { fontSize: 14, color: ghost ? colors.text : colors['on-accent'] }]}>{label}</ThemedText>
  </Pressable>;
}

/** Home, ported from the prototype: header, contour map of today, week of mini maps, one card for
 * what's next, tiles, and the + button. Read-only apart from starting or resuming a workout through
 * the existing stores. Recovery and Score are left out until this build has data for them. */
export function Home() {
  const { store, auth } = useWorkout();
  const { colors } = useTheme();
  const now = new Date(), today = localDay(now);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const repo = store?.repo;
  // The saved layout is read once per repository; edits update this state and the saved copy together.
  const [layout, setLayout] = useState<{ repo: typeof repo; tiles: HomeTiles }>(() => ({ repo, tiles: loadTiles(repo) }));
  const tiles = layout.repo === repo ? layout.tiles : loadTiles(repo);
  const change = (next: HomeTiles) => {
    setLayout({ repo, tiles: next });
    // Home still shows the new layout this session if the local write fails.
    try { repo?.localSave(HOME_TILES_KEY, next); } catch { /* saved again on the next change */ }
  };
  // Inside the tabs the bottom inset includes the floating tab bar, so the + button sits above it, not over a tab.
  const insets = useSafeAreaInsets();
  const selected = picked && picked <= today ? picked : today;
  return <View style={{ flex: 1 }}>
    <Screen tabHeader>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('openSettings')} onPress={() => router.push('/settings')} hitSlop={4}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
          <Icon name="avatar" size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ThemedText muted variant="caption">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</ThemedText>
            {auth.demo && <ThemedText muted style={{ fontSize: tokens.type.caption, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: colors['surface-2'] }}>{t('exampleData')}</ThemedText>}
          </View>
          <ThemedText variant="title" accessibilityRole="header" style={semibold}>{greeting(now.getHours())}</ThemedText>
        </View>
        {store && <Pressable testID="home-edit" accessibilityRole="button" accessibilityLabel={t('homeEdit')} onPress={() => setEditing(true)} hitSlop={4}
          style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}>
          <ThemedText style={[semibold, { fontSize: 14 }]}>{t('edit')}</ThemedText>
        </Pressable>}
      </View>
      {store ? <Body store={store} now={now} selected={selected} onPick={setPicked} tiles={tiles} onEdit={() => setEditing(true)} /> : <Next />}
    </Screen>
    <EditHome visible={editing} tiles={tiles} onChange={change} onClose={() => setEditing(false)} />
    {adding && <Pressable accessibilityLabel={t('close')} onPress={() => setAdding(false)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />}
    <View pointerEvents="box-none" testID="home-add-dock" style={{ position: 'absolute', right: tokens.spacing[3], bottom: tokens.spacing[3] + insets.bottom, alignItems: 'flex-end', gap: tokens.spacing[1] }}>
      {adding && <>
        <SmallButton label={t('logFood')} onPress={() => { setAdding(false); router.push('/food'); }} />
        <SmallButton label={t('homeStartWorkout')} onPress={() => { setAdding(false); router.push('/workout'); }} />
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel={t('homeAdd')} accessibilityState={{ expanded: adding }} onPress={() => setAdding(open => !open)}
        style={({ pressed }) => [{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }, tokens.elevation.ios]}>
        <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
          <Path d="M12 5v14M5 12h14" stroke={colors['on-accent']} strokeWidth={2} strokeLinecap="round" transform={adding ? 'rotate(45 12 12)' : undefined} />
        </Svg>
      </Pressable>
    </View>
  </View>;
}

function Body({ store, now, selected, onPick, tiles, onEdit }: { store: WorkoutStore; now: Date; selected: string; onPick: (day: string) => void; tiles: HomeTiles; onEdit: () => void }) {
  const revision = useFoodRevision(store.repo), today = localDay(now), foodDay = attributedDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const recent = Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)));
  const days = [...new Set([...week.map(d => localDay(d)).filter(day => day <= today), ...recent])];
  const facts = readDays(store, days, today, foodDay, revision), targets = readTargets(store, foodDay, revision);
  // Steps and sleep come straight from Apple Health once connected. They live in memory here and nowhere else.
  const health = useHealthDays(recent);
  const active = !!store.active();
  const pillar = usePillarColors(), palette = useTheme().colors, accent = palette.accent;
  const dayTargets = readDayTargets(store, days, today, foodDay, revision);
  const of = (day: string) => progress(facts.get(day) ?? NONE, dayTargets.get(day)?.kcal ?? null, active && day === today);
  if (!tiles.order.length) return <Card style={[card, { alignItems: 'center', gap: tokens.spacing[1], paddingVertical: tokens.spacing[4] }]} testID="home-nothing-on">
    <ThemedText variant="headline" style={semibold}>{t('homeNothingOn')}</ThemedText>
    <ThemedText muted variant="caption" style={{ textAlign: 'center' }}>{t('homeNothingOnBody')}</ThemedText>
    <View style={{ marginTop: tokens.spacing[1] }}><SmallButton label={t('homeEdit')} onPress={onEdit} /></View>
  </Card>;
  // A new account has nothing to draw yet, but the layout the person chose still applies: only what they kept
  // on Home shows, in their order. The week strip waits for data, like the number tiles.
  if (!hasAnything(store, revision) && !health) return <>
    {tiles.order.map(id => id === 'map' ? <EmptyMap key={id} />
      : id === 'next' ? <Next key={id} store={store} facts={facts.get(today) ?? NONE} targets={targets} hour={now.getHours()} /> : null)}
    {tiles.order.some(id => id !== 'map' && id !== 'next') && <>
      <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('homeTiles')}</ThemedText>
      <ThemedText muted variant="caption">{t('homeTilesEmpty')}</ThemedText>
    </>}
  </>;
  const numbers = numberTiles(store, recent.map(day => facts.get(day) ?? NONE), pillar, accent, health, palette.sleep);
  const wanted = tiles.order.filter(isSmall), shownNumbers = wanted.filter(id => numbers[id]);
  // One wrapping row keeps the saved order: sections and wide tiles take the full row, small tiles pair up.
  return <View testID="home-tiles" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: tokens.spacing[3], paddingBottom: 72 }}>
    {tiles.order.map(id => {
      const full = { width: '100%' } as const;
      if (id === 'map') return <View key={id} style={full}><MapCard day={selected} today={today} values={of(selected)} /></View>;
      if (id === 'week') return <View key={id} style={full}><Week week={week} today={today} selected={selected} onPick={onPick} of={of} /></View>;
      if (id === 'next') return <View key={id} style={full}><Next store={store} facts={facts.get(today) ?? NONE} targets={targets} hour={now.getHours()} /></View>;
      const tile = numbers[id];
      return tile ? <NumberTile key={id} tile={tile} wide={tiles.wide.includes(id)} /> : null;
    })}
    {wanted.length > 0 && !shownNumbers.length && <ThemedText muted variant="caption" style={{ width: '100%' }}>{t('homeTilesEmpty')}</ThemedText>}
  </View>;
}

function EmptyMap() {
  const { colors } = useTheme();
  return <Card style={[card, { alignItems: 'center', gap: tokens.spacing[1], paddingVertical: tokens.spacing[4] }]} testID="home-empty-map">
    <Svg width={200} height={48} viewBox="0 0 200 48" accessible={false}>
      <Path d="M10 30 Q100 6 190 30" fill="none" stroke={colors['text-muted']} strokeWidth={1.4} strokeDasharray="3 4" strokeLinecap="round" />
      <Path d="M40 40 Q100 24 160 40" fill="none" stroke={colors['text-muted']} strokeWidth={1.4} strokeDasharray="3 4" strokeLinecap="round" opacity={0.5} />
    </Svg>
    <ThemedText variant="headline" style={semibold}>{t('homeMapEmpty')}</ThemedText>
    <ThemedText muted variant="caption" style={{ textAlign: 'center' }}>{t('homeMapEmptyBody')}</ThemedText>
    <View style={{ marginTop: tokens.spacing[1] }}><SmallButton label={t('homeFirstMeal')} onPress={() => router.push('/food')} /></View>
  </Card>;
}

function dayName(day: string, today: string) {
  return day === today ? t('today') : new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function spoken(values: Record<Pillar, number>) {
  return `${t('homeTraining')} ${Math.round(Math.min(1, values.training) * 100)}%, ${t('homeFood')} ${Math.round(Math.min(1, values.food) * 100)}%`;
}

function MapCard({ day, today, values }: { day: string; today: string; values: Record<Pillar, number> }) {
  const colors = usePillarColors(), { colors: theme } = useTheme();
  const empty = values.training === 0 && values.food === 0;
  const amount = (day === today ? t('homePercentToday') : '{n}%').replace('{n}', String(percent(values)));
  return <Card style={card} testID="home-map">
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <ThemedText muted variant="caption">{dayName(day, today)}</ThemedText>
      <ThemedText muted numeric variant="caption">{amount}</ThemedText>
    </View>
    <View accessible accessibilityRole="image" accessibilityLabel={`${dayName(day, today)}. ${empty ? t('nothingLogged') : spoken(values)}`} style={{ width: '100%', aspectRatio: 2 }}>
      <Svg width="100%" height="100%" viewBox="0 0 340 170" accessible={false}>
        {empty
          ? <Path d="M34 85 Q170 71 306 85" fill="none" stroke={theme['text-muted']} strokeDasharray="3 4" opacity={0.6} />
          : <Contours values={values} width={340} height={170} />}
      </Svg>
    </View>
    <View style={{ flexDirection: 'row', gap: tokens.spacing[2] }}>
      {PILLARS.map(kind => <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Shape kind={kind} color={colors[kind]} />
        <ThemedText muted variant="caption">{t(kind === 'training' ? 'homeTraining' : 'homeFood')}</ThemedText>
      </View>)}
    </View>
  </Card>;
}

/** Monday to Sunday as mini maps. Tapping a day shows it on the big map; days ahead are dimmed. */
function Week({ week, today, selected, onPick, of }: { week: Date[]; today: string; selected: string; onPick: (day: string) => void; of: (day: string) => Record<Pillar, number> }) {
  const { colors } = useTheme();
  return <View accessibilityLabel={t('homeThisWeek')} style={{ flexDirection: 'row', gap: 4 }}>
    {week.map(date => {
      const day = localDay(date), future = day > today, isSelected = day === selected, values = future ? null : of(day);
      const name = date.toLocaleDateString('en-US', { weekday: 'long' });
      return <Pressable key={day} accessibilityRole="button" disabled={future} onPress={() => onPick(day)}
        accessibilityLabel={`${name}${day === today ? `, ${t('today')}` : ''}${values ? `, ${spoken(values)}` : ''}`}
        accessibilityState={{ selected: isSelected, disabled: future }}
        style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: tokens.radii.card, opacity: future ? 0.35 : 1,
          backgroundColor: isSelected ? colors['surface-2'] : 'transparent', borderWidth: 1.5, borderColor: day === today ? colors.accent : 'transparent' }}>
        <Svg width={38} height={28} viewBox="0 0 40 30" accessible={false}>
          {values && (values.training > 0 || values.food > 0)
            ? <Contours values={values} width={40} height={30} mini />
            : <Circle cx={20} cy={15} r={2} fill={colors['text-muted']} opacity={0.5} />}
        </Svg>
        <ThemedText muted={!isSelected} variant="caption" style={{ fontWeight: isSelected ? '700' : '400' }}>{name.slice(0, 1)}</ThemedText>
      </Pressable>;
    })}
  </View>;
}

function Brief({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return <Card style={[card, { padding: tokens.spacing[3], gap: tokens.spacing[1] }]} testID="home-next">
    <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
    <ThemedText muted variant="caption" style={{ lineHeight: 19 }}>{body}</ThemedText>
    <View style={{ marginTop: 6 }}>{action}</View>
  </Card>;
}

/** One card for what's next: resume, today's planned workout, or the evening food check-in.
 * Without a store (local data still opening) it still offers a start, so that is never out of reach. */
function Next({ store, facts = NONE, targets = null, hour = 12 }: { store?: WorkoutStore; facts?: DayFacts; targets?: { kcal: number; protein: number } | null; hour?: number }) {
  const [error, setError] = useState(false);
  const freestyle = <Brief title={t('todayWorkout')} body={t('noRoutinePlanned')}
    action={<SmallButton label={t('start')} accessibilityLabel={t('startFreestyle')} onPress={() => router.push('/workout')} />} />;
  if (!store) return freestyle;
  if (store.active()) return <Brief title={t('workoutInProgress')} body={t('homePickUp')}
    action={<SmallButton label={t('resume')} accessibilityLabel={t('resumeWorkout')} onPress={() => router.push('/workout')} />} />;
  if (facts.trained || (hour >= 17 && facts.logged)) {
    const body = !facts.logged ? t('nothingLogged')
      : targets && facts.kcal !== null ? t('homeLeft').replace('{kcal}', whole(Math.max(0, targets.kcal - facts.kcal))).replace('{protein}', whole(Math.max(0, targets.protein - (facts.protein ?? 0))))
        : t('homeLoggedSoFar').replace('{kcal}', facts.kcal === null ? '0' : whole(facts.kcal));
    return <Brief title={t(hour >= 17 ? 'homeEvening' : 'homeFoodToday')} body={body} action={<SmallButton ghost label={t('logFood')} onPress={() => router.push('/food')} />} />;
  }
  const next = nextRoutine(store);
  if (!next) return freestyle;
  const name = String(next.data.name);
  return <Brief title={t('todayWorkout')} body={error ? t('workoutSaveError') : `${name} · ${pluralize(store.templateExercises(next.id).length, 'exercise')}`}
    action={<SmallButton label={t('homeStartWorkout')} accessibilityLabel={t('startTemplate').replace('{name}', name)} onPress={() => {
      try { new PlanStore(store.repo).startDay(next.id); setError(false); router.push('/workout'); } catch { setError(true); }
    }} />} />;
}

function Spark({ values, color, bars }: { values: number[]; color: string; bars?: boolean }) {
  const w = 140, h = 30, list = values.length > 1 ? values : [...values, ...values];
  const max = Math.max(...list, 1), min = bars ? 0 : Math.min(...list), span = max - min || 1;
  if (bars) {
    const bw = w / list.length;
    return <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" accessible={false}>
      {list.map((v, i) => <Rect key={i} x={i * bw + 1} y={h - (v / max) * (h - 2)} width={bw - 2} height={(v / max) * (h - 2)} rx={1.5} fill={color} opacity={i === list.length - 1 ? 1 : 0.45} />)}
    </Svg>;
  }
  const d = list.map((v, i) => `${i ? 'L' : 'M'}${(i / (list.length - 1) * w).toFixed(1)} ${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`).join('');
  return <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" accessible={false}>
    <Path d={`${d} L${w} ${h} L0 ${h}Z`} fill={color} opacity={0.12} />
    <Path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
  </Svg>;
}

interface TileData { id: TileId; label: string; kind?: Pillar; color: string; value: string; unit: string; series: number[]; bars?: boolean; to: '/food' | '/workouts' | '/progress' }

/** The number tiles that have something to show, by id, as in the prototype. A tile with no data is left out. */
function numberTiles(store: WorkoutStore, facts: DayFacts[], pillar: Record<Pillar, string>, accent: string, health: HealthDays | null = null, sleepColor = accent): Partial<Record<TileId, TileData>> {
  const unit = store.unit(), last = facts[facts.length - 1], weights = readWeights(store).map(kg => fromKg(kg, unit));
  const volumes = facts.map(f => fromKg(f.volumeKg, unit));
  const all: TileData[] = [
    { id: 'calories', label: t('homeCalories'), kind: 'food', color: pillar.food, value: whole(last.kcal ?? 0), unit: 'kcal', series: facts.map(f => f.kcal ?? 0), to: '/food' },
    { id: 'protein', label: t('homeProtein'), kind: 'food', color: pillar.food, value: whole(last.protein ?? 0), unit: 'g', series: facts.map(f => f.protein ?? 0), to: '/food' },
    { id: 'volume', label: t('volume'), kind: 'training', color: pillar.training, value: whole(volumes.reduce((a, b) => a + b, 0)), unit: `${unit} · ${t('homeSevenDays')}`, series: volumes, bars: true, to: '/workouts' },
    { id: 'weight', label: t('weight'), color: accent, value: weights.length ? weights[weights.length - 1].toFixed(1) : '0', unit, series: weights, to: '/progress' },
  ];
  if (health) {
    const steps = health.steps, sleep = health.sleepHours, night = sleep[sleep.length - 1] ?? 0, minutes = Math.round(night * 60);
    all.push(
      { id: 'steps', label: t('homeSteps'), color: pillar.training, value: whole(steps[steps.length - 1] ?? 0), unit: t('homeToday'), series: steps, bars: true, to: '/progress' },
      { id: 'sleep', label: t('homeSleep'), color: sleepColor, value: minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : '0', unit: minutes ? 'min' : 'h', series: sleep, bars: true, to: '/progress' },
    );
  }
  return Object.fromEntries(all.filter(tile => tile.series.some(v => v > 0)).map(tile => [tile.id, tile]));
}
function NumberTile({ tile, wide }: { tile: TileData; wide: boolean }) {
  return <Pressable testID={`home-tile-${tile.id}`} accessibilityRole="button"
    accessibilityLabel={`${tile.label}, ${tile.value} ${tile.unit}`} onPress={() => router.navigate(tile.to)}
    style={({ pressed }) => ({ width: wide ? '100%' : '48.5%', opacity: pressed ? 0.85 : 1 })}>
    <Card style={[card, { minHeight: 108, gap: 2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {tile.kind ? <Shape kind={tile.kind} color={tile.color} /> : <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: tile.color }} />}
        <ThemedText muted variant="caption">{tile.label}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <ThemedText style={[heading, { fontSize: 24, fontVariant: ['tabular-nums'] }]}>{tile.value}</ThemedText>
        <ThemedText muted variant="caption">{tile.unit}</ThemedText>
      </View>
      <View style={{ marginTop: 'auto' }}><Spark values={tile.series} color={tile.color} bars={tile.bars} /></View>
    </Card>
  </Pressable>;
}
