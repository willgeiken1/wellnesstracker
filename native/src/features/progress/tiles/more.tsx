import type { ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, font, mix, useKit, Tappable } from '@/components/kit';
import { implementTile, type TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { METRICS, addDays, daysBetween, dLong, dShort, finite, lastIndex, r1, series, stats, sum, weekReport, type MetricKey, type ProgressData, type ProgressPhoto } from '../model';
import { fill, fmt, hm, lenU, lenV, signed, wtN, wtS, wtV } from '../format';
import { metricView, rangeShort, shortTicks, vText } from '../metric';
import { pageRange, rangeOf, readProgress, usePageRange, useProgressData } from '../store';
import { Chart } from '../viz';
import { B, Cols, Figure, HM, Hair, Head, IconTile, K, NoData, Num, PhotoBack, Row, Spacer, Sub, T, V } from './ui';

/* ---------- 8. training minutes and volume ---------- */
function TrainingTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), T0 = d.training, r = rangeOf(options, usePageRange()), se = series(d, 'training', r), mins = sum(se.v), yr = r === 'year', u = d.unit;
  if (!se.v.some(finite)) return <View style={{ flex: 1 }}><NoData fs={size === 'S' ? 24 : 28} text={t('progressNoData')} /><Sub wrap style={{ marginTop: 6 }}>{t('progressTrainingEmpty')}</Sub></View>;
  const going = T0.active ? 1 : 0, sess = sum(T0.perDay.slice(-(r === 'week' ? 7 : 30)));
  const vol = wtV(T0.weekVolumeKg, u), lastV = wtV(T0.lastWeekVolumeKg, u), vd = T0.lastWeekVolumeKg > 0 ? Math.round((T0.weekVolumeKg / T0.lastWeekVolumeKg - 1) * 100) : null;
  const aria = fill(t('progressTrainingAria'), { range: rangeShort(r), min: fmt(mins), sess }) + ' ' + fill(t('progressVolumeAria'), { vol: `${fmt(vol)} ${u}` }) + (vd != null ? ' ' + fill(t('progressVolumePctAria'), { pct: signed(vd) }) : '');
  const volLead = options.lead === 'vol';
  const lead = (fs: number) => volLead ? <Num v={fmt(vol)} unit={u} fs={fs} /> : <Num v={fmt(mins)} unit="min" fs={fs} />;
  const leadS = volLead ? (vd != null ? fill(t('progressOnLastWeek'), { pct: signed(vd) }) : t('progressThisWeek')) : yr ? t('progressSinceStarted') : going ? fill(t('progressSessionsGoing'), { n: sess }) : fill(t('progressSessions'), { n: sess });
  const bars = (W: number, H: number, tk: boolean, goal = false) => <Chart values={se.v} kind="bar" color="training" mini W={W} H={H} partial={se.partial} goal={goal && !yr ? T0.goalMin : null} ticks={tk ? shortTicks(se, r, r === 'month') : null} />;
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{lead(30)}<Sub style={{ marginTop: 4 }}>{leadS}</Sub><View style={{ marginTop: 'auto' }}>{bars(body.w, 46, false)}</View></View>;
  const months = se.v.filter(finite).length || 1;
  const cols = <Cols>{[
    yr ? <View key="a"><Num v={fmt(Math.round(mins / months))} unit="min" fs={22} /><Sub style={{ marginTop: 3 }} size={12}>{t('progressAMonth')}</Sub></View>
      : <View key="a"><Num v={sess} unit={going ? '+1' : undefined} fs={22} /><Sub style={{ marginTop: 3 }} size={12}>{t('progressSessionsLabel')}</Sub></View>,
    <View key="b"><Num v={fmt(mins)} unit="min" fs={22} /><Sub style={{ marginTop: 3 }} size={12}>{t('progressTime')}</Sub></View>,
    <View key="c"><Num v={`${r1(vol / 1000).toFixed(1)}k`} unit={u} fs={22} /><Sub style={{ marginTop: 3 }} size={12}>{t('progressVolume')}{vd != null ? `, ${signed(vd)}%` : ''}</Sub></View>,
  ]}</Cols>;
  if (size === 'M') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{cols}<View style={{ marginTop: 'auto' }}>{bars(body.w, 58, true)}</View></View>;
  const mx = Math.max(vol, lastV) || 1;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{cols}
    <View style={{ marginTop: 14 }}>{bars(body.w, 100, true, true)}</View>
    <Hair style={{ marginTop: 'auto', marginBottom: 10 }} />
    <Row style={{ marginBottom: 8 }}><K>{t('progressVolume')}</K><Spacer />{T0.active ? <Sub>{fill(t('progressNotCounted'), { name: T0.active.name })}</Sub> : null}</Row>
    <View style={{ gap: 7 }}>{([[t('progressThisWeek'), vol, true], [t('progressLastWeek'), lastV, false]] as const).map(([l, x, on]) =>
      <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Sub style={{ width: 72 }} color={k.c.text}>{l}</Sub>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: mix(k.c.training, k.c['surface-2'], 0.14) }}><View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, width: `${x / mx * 100}%`, backgroundColor: on ? k.c.training : mix(k.c.training, k.c['surface-2'], 0.4) }} /></View>
        <Text style={[font(700, 13.5, 1), { width: 72, textAlign: 'right', color: k.c.text, fontVariant: ['tabular-nums'] }]}>{fmt(x)}<Text style={[font(600, 11), { color: k.c['text-muted'] }]}>{'\u200A'}{u}</Text></Text>
      </View>)}</View>
  </View>;
}

/* ---------- 9. one metric over the range ---------- */
export function bigValue(d: ProgressData, key: MetricKey, v: number | null | undefined, fs: number) {
  if (v == null || !Number.isFinite(v)) return <NoData fs={fs} text={t('progressNoData')} />;
  if (key === 'sleep') return <HM min={v * 60} fs={fs} />;
  const mv = metricView(d, key);
  return <Num v={fmt(v, METRICS[key].dec === 2 ? 1 : METRICS[key].dec)} unit={mv.unit || undefined} fs={fs} />;
}
export function whenWord(key: MetricKey, r: string) {
  return t(r === 'year' ? 'progressThisMonth' : key === 'steps' || key === 'kcal' || key === 'training' ? 'progressTodaySoFar' : key === 'sleep' ? 'progressLastNight' : key === 'weight' ? 'today' : 'progressThisMorning');
}
function TrendTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), key = (options.metric ?? 'steps') as MetricKey, m = METRICS[key], mv = metricView(d, key), r = rangeOf(options, usePageRange());
  const se = series(d, key, r), li = lastIndex(se.v), now = se.v[li], S0 = stats(se.v), col = k.tok(m.color);
  // An older reading, when today (or this month) has none yet, is labelled with its own date, never as today's.
  const when = finite(now) && li !== se.v.length - 1 ? se.labels[li] : whenWord(key, r), vt = (x: number | null) => vText(d, key, x);
  const aria = `${mv.short}, ${vt(now)}, ${when.toLowerCase()}. ${fill(t('progressRangeAvg'), { range: rangeShort(r), v: vt(S0.avg) })}`;
  const kind = size === 'S' ? (m.mini ?? m.kind) : m.kind;
  const ch = (W: number, H: number, tk: boolean) => <Chart values={se.v} kind={kind} color={m.color} mini W={W} H={H} partial={se.partial} band={mv.band}
    goal={kind === 'dots' ? null : mv.goal} base={kind === 'dots' ? (mv.band ? null : mv.goal) : null} ticks={tk ? shortTicks(se, r, r === 'month' || r === 'year') : null} />;
  const hd = <Head icon={m.icon} title={mv.short} meta={size === 'S' ? '' : rangeShort(r)} color={col} />;
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{hd}{bigValue(d, key, now, 28)}
    <Sub style={{ marginTop: 4 }}>{t('progressAvgLower')} {vText(d, key, S0.avg, false)}</Sub><View style={{ marginTop: 'auto' }}>{ch(body.w, 40, false)}</View></View>;
  const ref = mv.band ? `${fill(t('progressUsualRangeCap'), { a: mv.band[0], b: mv.band[1] })} ${mv.unit}` : mv.goalL ?? '';
  if (size === 'M') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{hd}
    <View style={{ flex: 1, flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 104 }}>{bigValue(d, key, now, 26)}<Sub style={{ marginTop: 4 }}>{when}</Sub><Sub style={{ marginTop: 'auto' }}>{t('progressAverage')}</Sub><T style={font(700, 14, 1.25)}>{vt(S0.avg)}</T></View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>{ch(body.w - 118, 104, true)}</View>
    </View></View>;
  const minBest = m.best === 'min', hiV = minBest ? S0.min : S0.max, loV = minBest ? S0.max : S0.min;
  const small = (x: number | null) => x == null ? <V v={t('progressNoData')} /> : key === 'sleep' ? <V v={hm(x)} /> : <V v={fmt(x, METRICS[key].dec === 2 ? 1 : METRICS[key].dec)} unit={mv.unit || undefined} />;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{hd}
    {bigValue(d, key, now, 32)}<Sub style={{ marginTop: 5 }}>{when}{ref ? ` · ${ref}` : ''}</Sub>
    <View style={{ marginTop: 'auto' }}>{ch(body.w, 136, true)}</View>
    <Hair style={{ marginTop: 12, marginBottom: 10 }} />
    <Cols>{[[S0.avg, t('progressAverage')], [hiV, t(minBest ? 'progressLowest' : 'progressBest')], [loV, t(minBest ? 'progressHighest' : 'progressLowest')]].map(([x, l], i) =>
      <View key={i}>{small(x as number | null)}<Sub>{l as string}</Sub></View>)}</Cols>
  </View>;
}

/* ---------- 10. weekly report ---------- */
export function weekLines(d: ProgressData) {
  const R = weekReport(d), Bs = d.baseline.score, out: [string, string, string][] = [];
  if (R.avgScore != null) out.push(['score', 'accent', Bs != null ? fill(t(R.avgScore >= Bs ? 'progressHlScoreAbove' : 'progressHlScoreBelow'), { n: R.avgScore, usual: Math.round(Bs) }) : fill(t('progressHlScore'), { n: R.avgScore })]);
  out.push(['workouts', 'training', R.volPct != null ? fill(t('progressHlWorkoutsVol'), { n: R.workouts, pct: signed(R.volPct) }) : fill(t('progressHlWorkouts'), { n: R.workouts })]);
  if (R.sleepAvg != null) out.push(['sleep', 'sleep', fill(t('progressHlSleep'), { v: hm(R.sleepAvg) })]);
  if (R.prs.length) out.push(['trophy', 'warning', fill(t(R.prs.length === 1 ? 'progressHlRecord' : 'progressHlRecords'), { n: R.prs.length, names: R.prs.map(x => x.name.toLowerCase()).join(` ${t('progressAnd')} `) })]);
  return { R, lines: out };
}
function WeeklyTile({ size, options }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), { R, lines } = weekLines(d), u = d.unit;
  const hl = (n: number) => <View style={{ gap: 8 }}>{lines.slice(0, n).map(([icon, c, text]) => <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <Icon name={icon as 'score'} size={16} color={k.tok(c)} /><Text numberOfLines={1} style={[font(600, 13.5, 1.3), { color: k.c.text, flex: 1 }]}>{text}</Text></View>)}</View>;
  const cell = (n: ReactNode, l: string) => <View style={{ width: '31%' }}>{n}<Sub size={11.5} style={{ marginTop: 3 }}>{l}</Sub></View>;
  const nd = <NoData fs={16} text={t('progressNoData')} />;
  const grid = <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 12, justifyContent: 'space-between' }}>
    {cell(R.avgScore != null ? <Num v={R.avgScore} fs={20} /> : nd, t('progressDayScore'))}
    {cell(<Num v={R.workouts} fs={20} />, t('progressWorkouts'))}
    {cell(R.sleepAvg != null ? <HM min={R.sleepAvg * 60} fs={20} /> : nd, t('progressSleepANight'))}
    {cell(R.kcalAvg != null ? <Num v={fmt(R.kcalAvg)} unit="kcal" fs={20} /> : nd, fill(t('progressADayOnTarget'), { n: R.onTarget }))}
    {cell(R.wDeltaKg != null ? <Num v={signed(wtV(R.wDeltaKg, u), 1)} unit={u} fs={20} /> : nd, t('progressMWeight'))}
    {cell(<Num v={fmt(R.minutes)} unit="min" fs={20} />, t('progressMTraining'))}
  </View>;
  const aria = fill(t('progressWeeklyAria'), { from: dShort(R.from), to: dShort(R.to) }) + ' ' + lines.map(x => x[2]).join('. ') + '.';
  const more = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={[font(700, 13), { color: k.c.accent }]}>{t('progressReadReport')}</Text><Icon name="arrowr" size={14} color={k.c.accent} /></View>;
  if (size === 'M') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{options.show === 'numbers' ? grid : <>{hl(3)}<View style={{ marginTop: 'auto' }}>{more}</View></>}</View>;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{hl(4)}<Hair style={{ marginTop: 14, marginBottom: 12 }} />{grid}<View style={{ marginTop: 'auto' }}>{more}</View></View>;
}

/* ---------- 11. records ---------- */
interface Rec { icon: string; c: string; t: string; s: string; v: string; unit?: string; go: string }
export function records(d: ProgressData, lifts: boolean): Rec[] {
  const from = addDays(d.today, -6), u = d.unit;
  const out: Rec[] = d.training.records.filter(x => x.day >= from).map(x => ({ icon: 'trophy', c: 'warning', t: x.name, s: dLong(x.day), v: `${wtN(x.kg, u, 0)}${x.reps ? ` × ${x.reps}` : ''}`, unit: u, go: '/progress/trend?metric=training' }));
  if (lifts) return out;
  const sc = d.days.score.slice(-7), st = d.days.steps.slice(-7), days = Array.from({ length: 7 }, (_, i) => addDays(d.today, i - 6));
  const best = Math.max(...sc.filter(finite)), bi = sc.indexOf(best), ms = Math.max(...st.filter(finite)), si = st.indexOf(ms);
  if (Number.isFinite(best)) out.push({ icon: 'score', c: 'accent', t: t('progressBestDayScore'), s: dLong(days[bi]), v: String(Math.round(best)), go: '/score' });
  if (Number.isFinite(ms)) out.push({ icon: 'steps', c: 'training', t: t('progressMostSteps'), s: dLong(days[si]), v: fmt(ms), go: '/progress/trend?metric=steps' });
  if (d.training.streak > 1) out.push({ icon: 'flame', c: 'warning', t: t('progressLongestStreak'), s: t('progressGoingNow'), v: String(d.training.streak), unit: t('progressDays'), go: '/progress/trend?metric=training' });
  return out;
}
function RecordsTile({ size, options, preview, editing }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), list = records(d, options.kind === 'lifts'), lifts = records(d, true);
  if (!list.length) return <View style={{ flex: 1 }}><NoData fs={size === 'S' ? 24 : 28} text={t('progressNoRecords')} /><Sub wrap style={{ marginTop: 6 }}>{t('progressRecordsEmpty')}</Sub></View>;
  const aria = `${t('progressRecordsAria')} ${list.map(x => `${x.t}, ${x.v}${x.unit ? ` ${x.unit}` : ''}, ${x.s}`).join('. ')}.`;
  if (size === 'S') {
    const top = lifts[0] ?? list[0], n = options.kind === 'lifts' ? lifts.length : list.length;
    return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}><Num v={n} unit={t(options.kind === 'lifts' ? 'progressLiftBests' : 'progressRecordsUnit')} fs={32} /><Sub style={{ marginTop: 4 }}>{t('progressThisWeekLower')}</Sub>
      <View style={{ marginTop: 'auto' }}><K color={k.c.warning}>{t('progressNewest')}</K><View style={{ height: 5 }} /><T size={13.5}>{top.t}</T><Sub style={font(500, 12.5, 1.35)}>{top.v}{top.unit ? ` ${top.unit}` : ''}</Sub></View></View>;
  }
  const n = size === 'M' ? 3 : 5, rh = size === 'M' ? 39 : 52, live = !preview && !editing;
  return <View style={{ flex: 1 }} accessibilityLabel={aria} accessibilityRole="list">{list.slice(0, n).map((x, i) =>
    <Tappable dim="row" key={x.t} disabled={!live} onPress={() => router.push(x.go as never)} accessibilityRole="button" accessibilityLabel={`${x.t}, ${x.v}${x.unit ? ` ${x.unit}` : ''}, ${x.s}`}
      style={{ height: rh, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
      {size === 'L' ? <IconTile icon={x.icon} color={x.c} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}><T size={13.5}>{x.t}</T>{size === 'L' ? <Sub size={11.5}>{x.s}</Sub> : null}</View>
      {size === 'M' ? <Sub>{x.s.replace(/^\w+, /, '')}</Sub> : null}
      <Text style={[font(700, 14.5, 1), { minWidth: 64, textAlign: 'right', color: k.c.text, fontVariant: ['tabular-nums'] }]}>{x.v}{x.unit ? <Text style={[font(600, 11), { color: k.c['text-muted'] }]}>{'\u200A'}{x.unit}</Text> : null}</Text>
    </Tappable>)}</View>;
}

/* ---------- 12. progress photos ---------- */
/** One progress photo: the picture on this phone, or the placeholder figure for the sample ones. */
export function PhotoBox({ p, w, h, pose, date = true, radius = 12 }: { p: ProgressPhoto; w: number | `${number}%`; h?: number; pose?: string; date?: boolean; radius?: number }) {
  const k = useKit();
  return <View style={{ width: w, height: h, aspectRatio: h ? undefined : 3 / 4, borderRadius: radius, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants">
    {p.uri ? <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      : <><PhotoBack id={`ph${p.id}`} /><Figure pose={(pose ?? p.pose) as 'Front'} w={p.fig} style={{ position: 'absolute', left: 0, right: 0, top: '8%', bottom: 0 }} /></>}
    {date ? <View style={{ position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: mix(k.c.surface, 'transparent', 0.72) }}>
      <Text style={[font(700, 11), { color: k.c.text }]}>{dShort(p.day)}</Text></View> : null}
  </View>;
}
function AddPhoto({ w, h, live }: { w: number; h: number; live: boolean }) {
  const k = useKit(), c = k.c.sleep;
  return <Tappable dim="fill" disabled={!live} onPress={() => router.push('/progress/photo-capture')} accessibilityRole="button" accessibilityLabel={t('progressTakePhoto')}
    style={{ width: w, height: h, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(c, k.dark ? k.c['surface-2'] : k.c.bg, k.dark ? 0.12 : 0.1) }}>
    <Icon name="camera" size={22} color={c} /></Tappable>;
}
function PhotosTile({ size, options, body, preview, editing }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), all = d.photos, pose = (options.pose ?? 'Front'), live = !preview && !editing, u = d.unit;
  const ph = all.filter(p => p.pose === pose).length ? all.filter(p => p.pose === pose || !p.uri) : all;
  const lock = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="lock2" size={13} color={k.c['text-muted']} /><Sub>{t('progressOnPhoneOnly')}</Sub></View>;
  if (!ph.length) return <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}><AddPhoto w={76} h={body.h} live={live} />
    <View style={{ flex: 1 }}><T>{t('progressNoPhotos')}</T><Sub wrap style={{ marginTop: 4 }}>{t('progressPhotosEmpty')}</Sub><View style={{ marginTop: 'auto' }}>{lock}</View></View></View>;
  const first = ph[0], last = ph[ph.length - 1], cmp = options.show === 'compare';
  const dkg = first.kg != null && last.kg != null ? last.kg - first.kg : null, dTxt = dkg != null ? signed(wtV(dkg, u), 1) : '';
  const aria = fill(t('progressPhotosAria'), { n: ph.length, last: dShort(last.day) }) + (dkg != null ? ` ${dShort(first.day)} ${t('progressTo')} ${dShort(last.day)}: ${dTxt} ${u}.` : '') + ` ${t('progressPhotosStay')}`;
  const wrap = (child: ReactNode, style?: object) => <View style={[{ flex: 1 }, style]} accessible accessibilityRole="image" accessibilityLabel={aria}>{child}</View>;
  if (size === 'S') {
    if (cmp) return wrap(<><Row style={{ gap: 7 }}><PhotoBox p={first} pose={pose} w={67} h={90} /><PhotoBox p={last} pose={pose} w={67} h={90} /></Row>
      <Sub style={{ marginTop: 'auto' }}>{dkg != null ? <><B>{dTxt} {u}</B> {t('progressSince')} {dShort(first.day)}</> : `${ph.length} ${t('progressPhotosLower')}`}</Sub></>);
    return <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}><PhotoBox p={last} pose={pose} w={76} h={118} date={false} />
      <View style={{ flex: 1 }}><Num v={ph.length} fs={28} /><Sub>{t('progressPhotosLower')}</Sub><Sub size={11.5} style={{ marginTop: 6 }}>{t('progressLast')}</Sub><Sub size={11.5} color={k.c.text}>{dShort(last.day)}</Sub>
        <View style={{ marginTop: 'auto' }}><AddPhoto w={55} h={38} live={live} /></View></View></View>;
  }
  if (size === 'M') {
    if (cmp) return wrap(<><PhotoBox p={first} pose={pose} w={88} h={118} /><PhotoBox p={last} pose={pose} w={88} h={118} />
      <View style={{ flex: 1, paddingLeft: 6 }}>{dkg != null ? <Num v={dTxt} unit={u} fs={24} /> : null}<Sub>{t('progressSince')} {dShort(first.day)}</Sub><Sub style={{ marginTop: 6 }}><B>{ph.length}</B> {t('progressPhotosLower')}</Sub><View style={{ marginTop: 'auto' }}>{lock}</View></View></>, { flexDirection: 'row', gap: 8 });
    return <View style={{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>{ph.slice(-3).map(p => <PhotoBox key={p.id} p={p} pose={pose} w={76} h={118} />)}<AddPhoto w={76} h={118} live={live} /></View>;
  }
  if (cmp) {
    const wf = d.measures[0]?.cm.waist, wl = d.measures[d.measures.length - 1]?.cm.waist;
    return wrap(<><Row style={{ gap: 10 }}><PhotoBox p={first} pose={pose} w={158} h={200} /><PhotoBox p={last} pose={pose} w={158} h={200} /></Row>
      <Cols style={{ marginTop: 'auto' }}>{[
        <View key="a">{dkg != null ? <Num v={dTxt} unit={u} fs={20} /> : <NoData fs={18} text={t('progressNoData')} />}<Sub>{t('progressMWeight')}</Sub></View>,
        <View key="b">{finite(wf) && finite(wl) ? <Num v={signed(lenV(r1(wl - wf), u), 1)} unit={lenU(u)} fs={20} /> : <NoData fs={18} text={t('progressNoData')} />}<Sub>{t('progressMeasWaist')}</Sub></View>,
        <View key="c"><Num v={daysBetween(first.day, last.day)} unit={t('progressDays')} fs={20} /><Sub>{t('progressApart')}</Sub></View>,
      ]}</Cols></>);
  }
  return <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ph.slice(-5).map(p => <PhotoBox key={p.id} p={p} pose={pose} w={(body.w - 16) / 3} h={116} />)}<AddPhoto w={(body.w - 16) / 3} h={116} live={live} /></View><View style={{ marginTop: 'auto' }}>{lock}</View></View>;
}

implementTile('progress', 'training', { render: p => <TrainingTile {...p} />, meta: ({ options }) => rangeShort(rangeOf(options, pageRange())), open: () => router.push('/progress/trend?metric=training') });
implementTile('progress', 'trend', { render: p => <TrendTile {...p} />, open: o => router.push(`/progress/trend?metric=${o.metric ?? 'steps'}&range=${rangeOf(o, pageRange())}`) });
implementTile('progress', 'weekly', { render: p => <WeeklyTile {...p} />, meta: () => { const R = weekReport(readProgress()); return `${dShort(R.from)} ${t('progressTo')} ${dShort(R.to)}`; }, open: () => router.push('/progress/weekly') });
implementTile('progress', 'records', { render: p => <RecordsTile {...p} />, meta: () => t('progressThisWeek'), open: () => { const r = records(readProgress(), false)[0]; router.push((r?.go ?? '/progress/trend?metric=training') as never); } });
implementTile('progress', 'photos', { render: p => <PhotosTile {...p} />, meta: () => fill(t('progressNPhotos'), { n: readProgress().photos.length }), open: () => router.push('/progress/photos') });
