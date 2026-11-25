import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { font, mix, useKit } from '@/components/kit';
import { implementTile, type TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { addDays, avg, dShort, finite, goalEta, lastIndex, r1, series, type MeasureKey, type ProgressData } from '../model';
import { fill, fmt, hm, lenU, lenV, signed, wGoal, wtN, wtS, wtV } from '../format';
import { rangeShort, shortTicks } from '../metric';
import { pageRange, rangeOf, readProgress, usePageRange, useProgressData } from '../store';
import { Cells, Chart, Gauge, SVG_LABEL } from '../viz';
import { GaugeIn } from './today';
import { B, Chip, Head, Legend, NoData, Num, RB, Row, Ruler, RulerLabels, Stack, Sub, T } from './ui';

const Empty = ({ text, size }: { text: string; size: string }) => <View style={{ flex: 1 }}><NoData fs={size === 'S' ? 24 : 28} text={t('progressNoData')} /><Sub wrap style={{ marginTop: 6 }}>{text}</Sub></View>;
const rangeWords = (r: string) => t(r === 'week' ? 'progressThisWeekLower' : r === 'month' ? 'progressIn30' : 'progressIn12');

/** Weight numbers in the person's unit. */
export function weightNow(d: ProgressData) {
  const w = d.weight, u = d.unit;
  const done = w.startKg != null && w.kg != null ? r1(w.startKg - w.kg) : null, total = w.startKg != null && w.goalKg != null ? r1(w.startKg - w.goalKg) : null;
  return { w, u, done, total, frac: done != null && total ? Math.max(0, Math.min(1, done / total)) : 0, toGo: w.kg != null && w.goalKg != null ? fmt(wtV(w.kg - w.goalKg, u), 1) : null, eta: goalEta(d) };
}

/* ---------- 4. weight toward the goal ---------- */
function WeightTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), r = rangeOf(options, usePageRange()), se = series(d, 'weight', r), { w, u, done, total, frac, toGo, eta } = weightNow(d);
  if (w.kg == null) return <Empty size={size} text={t('progressWeightEmpty')} />;
  const li = lastIndex(se.v), first = se.v.find(finite), ch = finite(se.v[li]) && finite(first) ? r1((se.v[li] as number) - first) : 0;
  const gV = w.goalKg != null ? wtV(w.goalKg, u) : null, pace = options.show !== 'change' && gV != null;
  const chText = `${signed(ch, 1)} ${u} ${rangeWords(r)}`;
  const aria = fill(t('progressWeightAria'), { w: wtS(w.kg, u), ch: chText }) + (w.goalKg != null ? ' ' + fill(t('progressWeightAriaGoal'), { goal: wtS(w.goalKg, u), toGo: `${toGo}` }) : '') + (eta ? ' ' + fill(t('progressWeightAriaEta'), { when: dShort(eta) }) : '');
  const chart = (W: number, H: number, tk: boolean) => <Chart values={se.v} kind="line" color="recovery" mini W={W} H={H} goal={pace ? null : gV}
    project={pace && eta && gV != null ? { to: gV, label: `${wGoal(w.goalKg!, u)} ${u}`, tick: dShort(eta) } : null} ticks={tk ? shortTicks(se, r, true) : null} />;
  const goalTxt = w.goalKg != null ? `${toGo} ${u} ${t('progressToLower')} ${wGoal(w.goalKg, u)}` : chText;
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}><Num v={wtN(w.kg, u)} unit={u} fs={30} />
    <Sub style={{ marginTop: 4 }}>{pace ? goalTxt : chText}</Sub>
    <View style={{ marginTop: 'auto' }}><Chart values={se.v} kind="line" color="recovery" mini W={body.w} H={54} goal={gV} /></View></View>;
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 14 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ width: 100 }}><Num v={wtN(w.kg, u)} unit={u} fs={28} /><Sub style={{ marginTop: 4 }}>{signed(ch, 1)} {u}</Sub>
      {w.goalKg != null ? <><Sub style={{ marginTop: 'auto' }}>{t('progressGoal')} <B>{wGoal(w.goalKg, u)} {u}</B></Sub><Sub>{pace && eta ? fill(t('progressAround'), { when: dShort(eta) }) : `${toGo} ${u} ${t('progressToGo')}`}</Sub></>
        : <Sub wrap style={{ marginTop: 'auto' }}>{t('progressNoGoal')}</Sub>}</View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>{chart(body.w - 114, 112, true)}</View>
  </View>;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <Row style={{ alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}><Num v={wtN(w.kg, u)} unit={u} fs={32} /><Sub style={{ marginTop: 5 }}>{chText}</Sub></View>
      {toGo != null ? <View style={{ alignItems: 'flex-end' }}><Num v={toGo} unit={u} fs={18} /><Sub style={{ marginTop: 3 }}>{t('progressToYourGoal')}</Sub></View> : null}
    </Row>
    <View style={{ marginTop: 12 }}>{chart(body.w, 118, true)}</View>
    {done != null && total != null && w.goalKg != null && w.startKg != null ? <View style={{ marginTop: 'auto' }}><Ruler frac={frac} />
      <RulerLabels items={[<>{t('progressStart')} <RB>{wtN(w.startKg, u)}</RB></>, <><RB>{wtN(done, u)}</RB> {fill(t('progressOfLost'), { total: wtS(total, u) })}</>, <>{t('progressGoal')} <RB>{wGoal(w.goalKg, u)}</RB></>]} /></View>
      : <Sub wrap style={{ marginTop: 'auto' }}>{t('progressNoGoal')}</Sub>}
  </View>;
}

/* ---------- 5. body fat ---------- */
function BodyFatTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), log = d.bodyFat, u = d.unit, c = k.tok('recovery');
  if (!log.length) return <Empty size={size} text={t('progressFatEmpty')} />;
  const bf = log[log.length - 1].pct, kg = d.weight.kg, fat = kg != null ? kg * bf / 100 : null, lean = kg != null && fat != null ? kg - fat : null, ch = r1(bf - log[0].pct);
  const since = dShort(log[0].day);
  const aria = fill(t('progressFatAria'), { pct: fmt(bf, 1), ch: signed(ch, 1), since }) + (fat != null && lean != null ? ' ' + fill(t('progressFatAriaMass'), { fat: wtS(fat, u), lean: wtS(lean, u) }) : '');
  const dots = (W: number, H: number, lab: boolean) => {
    const v = log.map(x => x.pct), lo = Math.min(...v) - 0.3, hi = Math.max(...v) + 0.3, pb = lab ? 16 : 4, every = W / log.length < 46 ? 2 : 1;
    const X = (i: number) => v.length < 2 ? W / 2 : 6 + (W - 12) * i / (v.length - 1), Y = (x: number) => 6 + (H - 6 - pb) * (1 - (x - lo) / (hi - lo));
    return <Svg width={W} height={H} style={{ overflow: 'visible' }}>
      <Path d={v.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x).toFixed(1)}`).join('')} fill="none" stroke={c} strokeWidth={1.75} strokeOpacity={0.55} strokeLinejoin="round" />
      {v.map((x, i) => { const end = i === v.length - 1; return <Circle key={i} cx={X(i)} cy={Y(x)} r={end ? 4.5 : 3.2} fill={end ? c : k.c.surface} stroke={end ? k.c.surface : c} strokeWidth={end ? 2 : 1.75} />; })}
      {lab ? v.map((_, i) => { const end = i === v.length - 1; return end || i % every === 0 ? <SvgText key={`t${i}`} x={X(i)} y={H - 2} textAnchor={i === 0 ? 'start' : end ? 'end' : 'middle'} {...SVG_LABEL} fill={end ? k.c.text : k.c['text-muted']}>{dShort(log[i].day)}</SvgText> : null; }) : null}
    </Svg>;
  };
  const leanLead = options.show === 'lean' && lean != null;
  const lead = leanLead ? <Num v={wtN(lean!, u)} unit={u} fs={30} /> : <Num v={fmt(bf, 1)} unit="%" fs={30} />;
  const leadS = leanLead ? (size === 'S' ? fill(t('progressLeanFat'), { pct: fmt(bf, 1) }) : t('progressLeanMass')) : `${signed(ch, 1)} ${t('progressSince')} ${since}`;
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{lead}<Sub style={{ marginTop: 4 }}>{leadS}</Sub><View style={{ marginTop: 'auto' }}>{dots(body.w, 46, false)}</View></View>;
  const leanC = mix(c, k.c['surface-2'], 0.3);
  return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ width: 108 }}>{lead}<Sub wrap style={{ marginTop: 4 }}>{leadS}</Sub><Sub style={{ marginTop: 'auto' }}>{t('progressSmartScale')}</Sub></View>
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      {fat != null && lean != null ? <View><Stack h={12} parts={[{ color: c, frac: bf / 100 }, { color: leanC }]} />
        <Legend between style={{ marginTop: 7 }} items={[{ color: c, label: t('progressFat'), value: `${wtN(fat, u)}` }, { color: leanC, label: t('progressLean'), value: `${wtN(lean, u)}` }].map(x => ({ ...x, value: `${x.value} ${u}` }))} /></View> : <View />}
      {dots(body.w - 124, 62, true)}
    </View>
  </View>;
}

/* ---------- 6. tape measurements ---------- */
const MEAS_ORDER: MeasureKey[] = ['waist', 'chest', 'arm', 'hips', 'thigh', 'neck'];
export const measureName = (key: MeasureKey) => t(`progressMeas${key.charAt(0).toUpperCase()}${key.slice(1)}` as 'progressMeasWaist');
function MeasureTile({ size, options }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), u = d.unit, L = lenU(u), ms = d.measures;
  if (!ms.length) return <Empty size={size} text={t('progressMeasureEmpty')} />;
  const latest = ms[ms.length - 1], at = options.cmp === 'prev' ? ms[Math.max(0, ms.length - 2)] : ms[0];
  const val = (key: MeasureKey) => { for (let i = ms.length - 1; i >= 0; i--) { const v = ms[i].cm[key]; if (finite(v)) return v; } return null; };
  const rows = MEAS_ORDER.flatMap(key => { const v = val(key), a = at.cm[key]; return v == null ? [] : [{ key, name: measureName(key), v, dd: finite(a) ? r1(v - a) : 0 }]; });
  const sl = (cm: number) => fmt(lenV(cm, u), 1), sd = (cm: number) => signed(lenV(cm, u), 1);
  const aria = fill(t('progressMeasureAria'), { day: dShort(latest.day), since: dShort(at.day) }) + ' ' + rows.map(x => `${x.name} ${sl(x.v)} ${L}, ${sd(x.dd)}`).join(', ') + '.';
  if (size === 'S') {
    const top = rows[0];
    return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}><Num v={sl(top.v)} unit={L} fs={30} />
      <Sub style={{ marginTop: 4 }}>{top.name}, {sd(top.dd)} {L}</Sub><Sub>{t('progressSince')} {dShort(at.day)}</Sub>
      <View style={{ marginTop: 'auto' }}>{rows.slice(1, 3).map((x, i) => <Row key={x.key} style={{ height: 22, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
        <Text style={[font(600, 12), { color: k.c.text, flex: 1 }]}>{x.name}</Text>
        <Text style={[font(700, 13, 1), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{sl(x.v)}<Text style={[font(600, 11), { color: k.c['text-muted'] }]}> {L}</Text></Text></Row>)}</View></View>;
  }
  const max = Math.max(...rows.map(x => Math.abs(x.dd))) || 1;
  const diverge = (dd: number) => <View style={{ height: 8, width: 96 }}>
    <View style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, backgroundColor: k.c['hair-2'] }} />
    <View style={[{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, width: `${Math.max(dd ? 3 : 0, Math.abs(dd) / max * 50)}%`, backgroundColor: dd < 0 ? k.c.recovery : mix(k.c.recovery, k.c['surface-2'], 0.45) }, dd < 0 ? { right: '50%' } : { left: '50%' }]} />
  </View>;
  const list = size === 'M' ? rows.slice(0, 3) : rows, rh = size === 'M' ? 39 : 36;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    {list.map((x, i) => <Row key={x.key} style={{ height: rh, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
      <T size={13.5} style={{ flex: 1 }}>{x.name}</T>{size === 'L' ? diverge(x.dd) : null}<Chip text={sd(x.dd)} />
      <Text style={[font(700, 14.5, 1), { width: 62, textAlign: 'right', color: k.c.text, fontVariant: ['tabular-nums'] }]}>{sl(x.v)}<Text style={[font(600, 11), { color: k.c['text-muted'] }]}> {L}</Text></Text>
    </Row>)}
    {size === 'L' ? <Sub style={{ marginTop: 'auto' }}>{fill(t(L === 'cm' ? 'progressTapeCm' : 'progressTapeIn'), { since: dShort(at.day) })}</Sub> : null}
  </View>;
}

/* ---------- 7. goal progress ---------- */
function GoalTile({ size, options }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), g = options.goal ?? 'weight', u = d.unit;
  let c: string, title: string, frac: number, v: string, unit: string, line1: string, line2: string, aria: string, icon: string, meta: string, extra: ReactNode = null;
  if (g === 'plan') {
    const P = d.training.plan, nx = d.training.next; c = 'training'; icon = 'workouts'; title = t('progressPlanWeek'); frac = P.perWeek ? P.done / P.perWeek : 0;
    v = String(P.done); unit = fill(t('progressOfDaysUnit'), { n: P.perWeek }); line1 = P.name ?? t('progressYourPlan');
    line2 = nx ? fill(t('progressNextIs'), { name: nx.name, when: nx.when.toLowerCase() }) : t('progressNoNext');
    aria = fill(t('progressPlanAria'), { done: P.done, per: P.perWeek }) + ' ' + line2 + '.';
    meta = `${dShort(addDays(d.today, -6))} ${t('progressTo')} ${dShort(d.today)}`;
    extra = <View style={{ marginTop: 'auto' }}><Cells states={Array.from({ length: Math.max(1, P.perWeek) }, (_, i) => i < P.done ? 1 : i === P.done ? 'now' : 0)} color="training" h={10} gap={4} r={3} /></View>;
  } else if (g === 'sleep') {
    const sw = d.days.sleep.slice(-7), a = avg(sw), goalH = d.sleepGoalMin / 60, hit = sw.filter(x => finite(x) && x >= goalH).length; c = 'sleep'; icon = 'sleep'; title = t('progressSleepGoal');
    frac = a != null ? a / goalH : 0; v = a != null ? hm(a) : t('progressNoData'); unit = t('progressANight');
    line1 = fill(t('progressNightsAt'), { n: hit, goal: `${goalH}h` }); line2 = fill(t('progressAvgWeekGoal'), { goal: `${goalH}h` });
    aria = a != null ? fill(t('progressSleepAvgAria'), { v: hm(a) }) + ' ' + line1 + '.' : t('progressNoData'); meta = t('progressThisWeek');
    extra = <View style={{ marginTop: 'auto' }}><Cells states={sw.map(x => finite(x) && x >= goalH ? 1 : 'dim')} color="sleep" h={10} gap={4} r={3} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>{d.days.sleep.slice(-7).map((_, i) => <Text key={i} style={[font(600, 11), { width: 14, textAlign: 'center', color: k.c['text-muted'] }]}>{dShortDay(addDays(d.today, i - 6))}</Text>)}</View></View>;
  } else {
    const { w, done, total, frac: f, toGo, eta } = weightNow(d); c = 'recovery'; icon = 'rt-target'; title = t('progressWeightGoal'); frac = f;
    if (done == null || total == null || w.goalKg == null) { v = ''; unit = t('progressNoGoalShort'); line1 = t('progressNoGoalShort'); line2 = t('progressNoGoal'); aria = t('progressNoGoal'); }
    else {
      v = wtN(done, u); unit = fill(t('progressOfTotal'), { total: wtS(total, u) }); line1 = `${toGo} ${u} ${t('progressToLower')} ${wGoal(w.goalKg, u)}`;
      line2 = eta ? fill(t('progressAroundPace'), { when: dShort(eta) }) : t('progressKeepLogging');
      aria = fill(t('progressWeightGoalAria'), { done: wtN(done, u), total: wtS(total, u), goal: wtS(w.goalKg, u) }) + ' ' + line2 + '.';
      extra = <View style={{ marginTop: 'auto' }}><Ruler frac={f} ticks={false} /><RulerLabels items={[<RB key="a">{wtN(w.startKg!, u)}</RB>, <>{t('progressNow')} <RB>{wtN(w.kg!, u)}</RB></>, <RB key="c">{wGoal(w.goalKg, u)}</RB>]} /></View>;
    }
    meta = w.startDay ? `${t('progressSince')} ${dShort(w.startDay)}` : '';
  }
  const col = k.tok(c), small = size === 'S';
  const gauge = (sz: number, fs: number) => <Gauge frac={frac} size={sz} sw={sz > 100 ? 9 : 8} color={c} label={aria}><GaugeIn v={v} u={unit} fs={g === 'sleep' ? (small ? 17 : 19) : fs} us={10.5} /></Gauge>;
  const hd = <Head icon={icon} title={title} meta={small ? '' : meta} color={col} />;
  if (small) return <View style={{ flex: 1 }}>{hd}<View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>{gauge(100, 24)}<Sub style={{ marginTop: -4 }}>{line1}</Sub></View></View>;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{hd}
    <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>{gauge(112, 26)}
      <View style={{ flex: 1, paddingTop: 4 }}><T size={16} style={font(700, 16, 1.2)}>{line1}</T><Sub wrap style={{ marginTop: 4 }}>{line2}</Sub>{extra}</View></View></View>;
}
const dShortDay = (day: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${day}T12:00:00`).getDay()];

implementTile('progress', 'weight', { render: p => <WeightTile {...p} />, meta: ({ options }) => rangeShort(rangeOf(options, pageRange())), open: () => router.push('/progress/body') });
implementTile('progress', 'bodyfat', { render: p => <BodyFatTile {...p} />, meta: () => { const l = readProgress().bodyFat; return l.length ? dShort(l[l.length - 1].day) : ''; }, open: () => router.push('/progress/body') });
implementTile('progress', 'measure', { render: p => <MeasureTile {...p} />, meta: () => { const m = readProgress().measures; return m.length ? dShort(m[m.length - 1].day) : ''; }, open: () => router.push('/progress/measurements') });
implementTile('progress', 'goal', { render: p => <GoalTile {...p} />, open: o => router.push(o.goal === 'plan' ? '/progress/trend?metric=training' : o.goal === 'sleep' ? '/progress/sleep' : '/progress/body') });
