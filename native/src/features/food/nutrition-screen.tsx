import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { Badge, Card, Icon, KitText, List, ListFooter, ListRow, SectionHeader, SegmentedControl, Stat, Tappable, alpha, mix, useKit, proportional } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { dayView, daySums, known, macrosComplete, monthDay, num, weekDays, weekdayName } from './day';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { EnergyLegend } from './item-sheet';
import { FoodPage } from './meal-screen';
import { useFoodDay } from './selection';
import { RowLine } from './sheet';
import { nuNote, nutrients, type Nu } from './tiles/tiles';
import { Cells, MACRO_COLOR, SectionLabel, macroPercents, meter } from './ui';
import { useFoodRevision } from './use-food-revision';
import { enAmt, enLabel, enNum, enText, enValue, useEnergyUnit } from './energy';
import { litresOn, readWater, waterAmt } from './water';
import { capitals } from '@/components/kit-style';

/** Fifty squares, each a fiftieth of the calories, coloured by where they came from. */
export function waffleCells(p: number, c: number, f: number) {
  const kp = p * 4, kc = c * 4, kf = f * 9, tot = kp + kc + kf;
  if (!tot) return Array.from({ length: 50 }, () => null);
  const a = Math.round(kp / tot * 50), b = Math.round(kc / tot * 50);
  return Array.from({ length: 50 }, (_, i) => i < a ? 'p' as const : i < a + b ? 'c' as const : 'f' as const);
}
/** Days within 10% of the goal, among days that are over. */
export const onTarget = (vals: (number | null)[], goal: number) => vals.filter(v => v != null && Math.abs(v - goal) <= goal * 0.1).length;

/** Nutrition (`nutrition`): the day in detail (calories, where they came from, macros, other nutrients) or the week. */
export function NutritionScreen({ repo }: { repo: Repository }) {
  useFoodRevision(repo);
  const [view, setView] = useState<'day' | 'week'>('day');
  return <FoodPage testID="food-nutrition-screen" back={t('food')} title={t('foodNutrition')}>
    <View style={{ marginTop: 8, marginBottom: 16 }}>
      <SegmentedControl label={t('foodRange')} value={view} onChange={setView} options={[{ value: 'day', label: t('foodToday') }, { value: 'week', label: t('foodThisWeek') }]} />
    </View>
    {view === 'day' ? <DayPart repo={repo} /> : <WeekPart repo={repo} />}
  </FoodPage>;
}

function DayPart({ repo }: { repo: Repository }) {
  const k = useKit(), u = useEnergyUnit();
  const { day, today, isToday, burned } = useFoodDay();
  const v = dayView(repo, day, { today, burned });
  // A share of the calories needs all three macros: with any unknown, the split is unknown, never drawn or spoken as 0%.
  const whole = macrosComplete(v.items);
  const cells = whole ? waffleCells(v.p!, v.c!, v.f!) : waffleCells(0, 0, 0), N = nutrients(v), pcs = macroPercents(known(v.p), known(v.c), known(v.f)).pc;
  const round = (x: number | null) => x == null ? null : Math.round(x);
  const macros: Nu[] = [{ key: t('foodMacroProtein'), v: round(v.p), goal: Math.round(v.goals.p), u: 'g', color: MACRO_COLOR.p },
    { key: t('foodMacroCarbs'), v: round(v.c), goal: Math.round(v.goals.c), u: 'g', color: MACRO_COLOR.c },
    { key: t('foodMacroFat'), v: round(v.f), goal: Math.round(v.goals.f), u: 'g', color: MACRO_COLOR.f },
    { key: t('foodMacroFiber'), v: round(v.fib), goal: v.goals.fib, u: 'g', color: MACRO_COLOR.fib }];
  const more = [...N.limit, ...N.reach.slice(1)];
  return <>
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <View>
          <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{isToday ? t('foodEatenToday') : fill(t('foodEatenOn'), { day: weekdayName(day) })}</KitText>
          <KitText weight={700} size={24} lineHeight={1.1} tracking={-0.02} numeric style={{ marginTop: 6 }}>{enNum(v.eaten, u)}
            <KitText weight={600} tracking={0} size={13} color="text-muted" style={proportional}>{` ${fill(enText(t('foodOfGoalKcal'), u), { goal: enNum(v.goal, u) })}`}</KitText></KitText>
        </View>
        {v.burned != null ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: k.tint(k.c['text-muted'], 0.16) }}>
          <Icon name="apple" size={12} color={k.c['text-muted']} /><KitText weight={600} size={12} color="text-muted">{fill(t('foodNBurned'), { v: enNum(v.burned, u) })}</KitText>
        </View> : null}
      </View>
      <View accessible accessibilityLabel={fill(enText(t('foodOfGoalA11y'), u), { v: enNum(v.eaten, u), goal: enNum(v.goal, u) })}><Cells states={meter(known(v.eaten) / v.goal, 22)} color={k.c.food} h={14} gap={3} r={3} /></View>
      <SectionLabel inset title={t('foodWhereFrom')} aside={t('foodEachSquare')} />
      <Waffle cells={cells} label={whole ? fill(t('foodSplitA11y'), { p: pcs[0], c: pcs[1], f: pcs[2] }) : t('foodSplitUnavailable')} />
      {!whole && <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 8 }}>{t('foodSplitUnavailable')}</KitText>}
      <EnergyLegend p={v.p} c={v.c} f={v.f} complete={whole} />
    </Card>
    <SectionHeader title={t('foodMacrosTitle')} />
    <List>{macros.map((x, i) => <NuRow key={x.key} x={x} first={i === 0} />)}</List>
    <SectionHeader title={t('foodMoreNutrients')} />
    <List>{more.map((x, i) => <NuRow key={x.key} x={x} first={i === 0} />)}</List>
    <ListFooter>{t('foodNutritionFoot')}</ListFooter>
    <View style={{ height: 12 }} />
    <List><ListRow icon="sliders" color="food" title={t('foodTargets')} sub={`${enAmt(v.goal, u)} · ${num(v.goals.p)} g ${t('foodProteinLower')}`} onPress={() => router.push('/food/targets')} /></List>
  </>;
}

function Waffle({ cells, label }: { cells: ('p' | 'c' | 'f' | null)[]; label: string }) {
  const k = useKit(), [w, setW] = useState(0), gap = 3, size = w ? (w - gap * 24) / 25 : 0;
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={e => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
    {size ? cells.map((c, i) => <View key={i} style={{ width: size, height: size, borderRadius: 3, backgroundColor: c ? k.tok(MACRO_COLOR[c]) : k.c['surface-2'] }} />) : null}
  </View>;
}

/** A nutrient against its goal (a row of cells) or its limit (a bar with the limit marked). Unknown shows no meter. */
function NuRow({ x, first }: { x: Nu; first: boolean }) {
  const k = useKit(), known = x.v != null;
  const [w, setW] = useState(0), mx = x.goal * 1.2;
  return <View style={{ paddingVertical: 12, paddingHorizontal: 16 }} accessible
    accessibilityLabel={`${x.key}, ${known ? `${num(x.v!)} ${t('foodOf')} ${num(x.goal)} ${x.u}` : t('foodUnknownLower')}, ${nuNote(x)}`}>
    {!first && <RowLine />}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: known ? 8 : 0 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01}>{x.key}</KitText>
      {known ? <KitText weight={700} size={15} tracking={-0.01} numeric>{num(x.v!)}<KitText weight={600} tracking={0} size={12} color="text-muted" style={proportional}>{` / ${num(x.goal)} ${x.u}${x.limit ? ` ${t('foodMax')}` : ''}`}</KitText></KitText>
        : <KitText weight={700} size={15} color="text-muted">{t('foodUnknownVal')}</KitText>}
    </View>
    {known ? x.limit
      ? <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: 7, borderRadius: 2, backgroundColor: mix(k.c.food, k.c['surface-2'], 0.13) }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, width: `${Math.min(100, x.v! / mx * 100)}%`, backgroundColor: x.v! > x.goal ? k.c.warning : k.tok(x.color ?? 'food') }} />
          {w ? <View style={{ position: 'absolute', top: -4, bottom: -4, width: 2, marginLeft: -1, left: x.goal / mx * w, borderRadius: 1, backgroundColor: k.c.text, boxShadow: `0px 0px 0px 1.5px ${k.cardBg}` }} /> : null}
        </View>
      : <View><Cells states={meter(x.v! / x.goal, 20)} color={k.tok(x.color ?? 'food')} h={7} gap={2} r={2} /></View> : null}
    <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 6 }}>{nuNote(x)}</KitText>
  </View>;
}

function WeekPart({ repo }: { repo: Repository }) {
  const { day, today } = useFoodDay(), u = useEnergyUnit();
  const days = weekDays(day, useSettingsPrefs()[0].units.week), sums = daySums(repo, days), goal = dayView(repo, day, { today }).goal, pGoal = Math.round(dayView(repo, day, { today }).goals.p);
  const water = readWater(repo);
  // An unlogged day, or one whose food gave no protein, is unknown: it draws no stalk and stays out of the averages.
  const kc = sums.map(s => s.day > today ? null : s.kcal), pr = sums.map(s => s.day > today || s.p == null ? null : Math.round(s.p));
  const ti = Math.max(0, days.indexOf(today < days[6] ? today : days[6]));
  const [hi, setHi] = useState(ti), [phi, setPhi] = useState(ti);
  const past = (i: number) => days[i] < today, isNum = (v: number | null): v is number => v != null;
  const full = days.filter((d, i) => d < today && kc[i] != null), fullK = kc.filter((v, i) => past(i) && isNum(v)) as number[], fullP = pr.filter((v, i) => past(i) && isNum(v)) as number[];
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const label = (i: number) => days[i] === today ? t('foodTodaySoFar') : weekdayName(days[i]);
  const rangeSub = full.length ? `${weekdayName(full[0]).slice(0, 3)} ${t('foodTo')} ${weekdayName(full[full.length - 1]).slice(0, 3)}` : t('foodNoFullDays');
  return <>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Card style={{ flex: 1 }}><Stat value={avg(fullK) == null ? '–' : enNum(avg(fullK)!, u)} unit={enLabel(u)} label={t('foodDailyAverage')} sub={rangeSub} /></Card>
      <Card style={{ flex: 1 }}><Stat value={<>{onTarget(fullK, goal)}<KitText weight={600} size={14} color="text-muted">{` ${fill(t('foodOfN'), { n: full.length })}`}</KitText></>}
        label={t('foodDaysOnTarget')} sub={fill(t('foodWithinOf'), { v: enNum(goal, u) })} /></Card>
    </View>
    <SectionHeader title={t('foodCaloriesCap')} />
    <Card>
      <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{label(hi)}</KitText>
      <KitText weight={700} size={24} lineHeight={1.1} tracking={-0.02} numeric style={{ marginTop: 6, marginBottom: 12 }}>{kc[hi] == null ? '–' : enNum(kc[hi]!, u)}<KitText weight={600} tracking={0} size={13} color="text-muted">{` ${enLabel(u)}`}</KitText></KitText>
      <DevChart vals={kc.map(x => x == null ? null : enValue(x, u))} days={days} today={today} hi={hi} onPick={setHi} goal={enValue(goal, u)} unit="" word={enLabel(u)} goalText={`${enAmt(goal, u)} ${t('foodGoalWord')}`} label={t('foodCaloriesByDay')} />
    </Card>
    <SectionHeader title={t('foodMacroProtein')} />
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <View>
          <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{label(phi)}</KitText>
          <KitText weight={700} size={24} lineHeight={1.1} tracking={-0.02} numeric style={{ marginTop: 6 }}>{pr[phi] == null ? '–' : num(pr[phi]!)}<KitText weight={600} tracking={0} size={13} color="text-muted"> g</KitText></KitText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{t('foodDailyAverage')}</KitText>
          <KitText weight={700} size={16} numeric style={{ marginTop: 6 }}>{avg(fullP) == null ? '–' : num(avg(fullP)!)}<KitText weight={600} tracking={0} size={12} color="text-muted"> g</KitText></KitText>
        </View>
      </View>
      <DevChart vals={pr} days={days} today={today} hi={phi} onPick={setPhi} goal={pGoal} unit=" g" goalText={`${num(pGoal)} g ${t('foodGoalWord')}`} label={t('foodProteinByDayPlain')} />
    </Card>
    <SectionHeader title={t('foodByDay')} />
    <List>
      {days.map((d, i) => ({ d, i })).filter(x => x.d <= today).reverse().map(({ d, i }, n) => {
        const v = kc[i], ok = v != null && Math.abs(v - goal) <= goal * 0.1, part = d === today;
        return <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }}>
          {n > 0 && <RowLine />}
          <View style={{ width: 36, alignItems: 'center' }}>
            <KitText weight={700} size={13} color="text-muted">{weekdayName(d).slice(0, 3)}</KitText>
            <KitText weight={700} size={17} numeric>{monthDay(d).split(' ')[1]}</KitText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <KitText weight={600} size={15.5} numeric color={v == null ? 'text-muted' : undefined}>{v == null ? (sums[i].meals && d <= today ? enAmt(null, u) : t('foodNotLoggedCap')) : enAmt(v, u)}</KitText>
            <KitText weight={500} size={13} numeric color="text-muted" style={{ marginTop: 2 }}>{`${pr[i] == null ? '–' : num(pr[i]!)} g ${t('foodProteinLower')} · ${waterAmt(litresOn(water, d), water.unit)} ${t('foodWaterLower')}`}</KitText>
          </View>
          {v == null && !part ? null : <Badge label={part ? t('foodSoFarCap') : ok ? t('foodOnTarget') : v! > goal ? t('foodOverCap') : t('foodUnderCap')} color={part ? 'text-muted' : ok ? 'success' : 'warning'} />}
        </View>;
      })}
    </List>
  </>;
}

/** The week against the goal: a stalk from the goal line to each day, the goal band shaded, today dashed. Tap a day. */
function DevChart({ vals, days, today, hi, onPick, goal, unit, word, goalText, label }: {
  vals: (number | null)[]; days: string[]; today: string; hi: number; onPick: (i: number) => void; goal: number; unit: string; word?: string; goalText: string; label: string;
}) {
  const k = useKit(), { width } = useWindowDimensions();
  const W = Math.min(width, 430) - 64, H = 132, top = 22, bot = 30, c = k.c.food;
  const known = vals.filter((v): v is number => v != null), dev = known.map(v => v - goal), mn = goal * 0.16 || 1;
  const up = Math.max(mn, ...dev, 0) * 1.12, dn = Math.max(mn, ...dev.map(d => -d), 0) * 1.06, ph = H - top - bot, mid = top + ph * up / (up + dn);
  const Y = (v: number) => mid - (v - goal) / (up + dn) * ph, cw = W / 7, X = (i: number) => cw * i + cw / 2, band = goal * 0.1;
  return <View accessible={false}>
    <Svg width={W} height={H} accessibilityLabel={label}>
      <Rect x={0} y={Y(goal + band)} width={W} height={Y(goal - band) - Y(goal + band)} rx={6} fill={alpha(c, 0.09)} />
      <Line x1={0} x2={W} y1={mid} y2={mid} stroke={k.c['hair-2']} strokeWidth={1} />
      <SvgText x={2} y={Y(goal + band) - 5} fontSize={10} fontWeight="600" fill={k.c['text-muted']}>{goalText}</SvgText>
      {vals.map((v, i) => {
        const x = X(i), sel = i === hi, part = days[i] === today, lab = weekdayName(days[i]).slice(0, 1);
        const labEl = <SvgText key={`l${i}`} x={x} y={H - 4} textAnchor="middle" fontSize={10.5} fontWeight="600" fill={sel ? k.c.text : k.c['text-muted']}>{lab}</SvgText>;
        if (v == null) return labEl;
        const y = Y(v), off = Math.abs(v - goal) > band, d = Math.round(v - goal), rt = i < 5;
        return [<Line key={`s${i}`} x1={x} x2={x} y1={mid} y2={y} stroke={sel ? c : mix(c, k.c['surface-2'], 0.5)} strokeWidth={sel ? 2.5 : 2} strokeLinecap="round" strokeDasharray={part ? '2 4' : undefined} />,
          <Circle key={`c${i}`} cx={x} cy={y} r={sel ? 6 : 4.5} fill={part ? k.cardBg : sel ? c : off ? mix(c, k.c.surface, 0.55) : c} stroke={c} strokeWidth={part ? 2 : 0} />,
          sel ? <SvgText key={`t${i}`} x={rt ? x + 11 : x - 11} y={y + 4} textAnchor={rt ? 'start' : 'end'} fontSize={11.5} fontWeight="700" fill={k.c.text}>{`${d >= 0 ? '+' : '−'}${num(Math.abs(d))}${unit}${part ? ` ${t('foodSoFar')}` : ''}`}</SvgText> : null, labEl];
      })}
    </Svg>
    <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, flexDirection: 'row' }}>
      {vals.map((v, i) => <Tappable key={i} dim="fill" accessibilityRole="button" accessibilityState={{ selected: i === hi }} disabled={v == null}
        accessibilityLabel={`${weekdayName(days[i])}, ${v == null ? t('foodUnknownLower') : `${num(v)}${unit || ` ${word ?? t('foodKcal')}`}`}`} onPress={() => onPick(i)}
        style={{ flex: 1, minHeight: 44, borderRadius: 10 }} />)}
    </View>
  </View>;
}
