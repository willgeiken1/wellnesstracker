import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { Eyebrow, IconButton, List, ListRow, NavButton, SectionHeader, SegmentedControl, font, mix, useKit } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { compareRows } from '@/data/rows';
import { appleHealth } from '@/features/health/apple';
import { refreshWeights } from '@/features/health/weights';
import { deleteWeighIn } from '@/features/body/model';
import { showToast } from '@/features/shell/toast';
import { readWeightFromHealth } from '../local';
import { MEASURE_KEYS, addDays, change30, dLong, dShort, finite, goalEta, lastIndex, series, type MeasureKey, type ProgressData, type Range } from '../model';
import { fill, fmt, lenS, lenU, wGoal, wtN, wtS, wtV } from '../format';
import { metricView, rangeLong } from '../metric';
import { useProgress } from '../use-progress';
import { measureName as tileName } from '../tiles/body';

/** A measure's name on the screens, where the arm is the upper arm. */
export const measureName = (key: MeasureKey) => key === 'arm' ? t('progressMeasArmLong') : tileName(key);
import { Chart, SVG_LABEL } from '../viz';
import { Big, Cap, Card, Divider, Page, Split, Src } from './parts';

/** "today", "yesterday" or "Nov 20", for a weigh-in or a measurement. */
export function dayWord(d: ProgressData, day: string) {
  return day === d.today ? t('progressTodayLower') : day === addDays(d.today, -1) ? t('progressYesterdayLower') : dShort(day);
}

/** Start to goal on one rule, with today's weight on it and the estimated date at the end (the mockup's goal ruler). */
function GoalRuler({ d }: { d: ProgressData }) {
  const k = useKit(), u = d.unit, w = d.weight, eta = goalEta(d);
  if (w.kg == null || w.startKg == null || w.goalKg == null || w.startKg === w.goalKg) return null;
  const W = 329, H = 56, L = 6, R = W - 6, y = 26, start = w.startKg, goal = w.goalKg;
  const x = (kg: number) => L + Math.max(0, Math.min(1, (start - kg) / (start - goal))) * (R - L);
  const lo = Math.ceil(Math.min(wtV(goal, u), wtV(start, u)) - 1e-9), hi = Math.floor(Math.max(wtV(goal, u), wtV(start, u)) + 1e-9);
  const marks = [];
  for (let n = lo; n <= hi && hi - lo < 80; n++) {
    const tx = x(u === 'lb' ? n / 2.2046226218487757 : n), major = u === 'kg' || n % 2 === 0;
    marks.push(<Line key={`l${n}`} x1={tx} x2={tx} y1={y + 7} y2={y + (major ? 13 : 10)} stroke={major ? k.c['text-muted'] : k.c['hair-2']} strokeWidth={1} />);
    if (major) marks.push(<SvgText key={`t${n}`} x={tx} y={H - 2} textAnchor="middle" {...SVG_LABEL} fill={k.c['text-muted']}>{n}</SvgText>);
  }
  const nx = x(w.kg);
  const aria = fill(t('progressGoalRulerAria'), { start: wtS(start, u), goal: wtS(goal, u), now: wtS(w.kg, u) }) + (eta ? ' ' + fill(t('progressGoalRulerEta'), { when: dShort(eta) }) : '');
  return <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ width: '100%', aspectRatio: W / H, marginTop: 10, marginBottom: 2 }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {marks}
      <Line x1={L} x2={R} y1={y} y2={y} stroke={mix(k.c.recovery, k.c['surface-2'], 0.18)} strokeWidth={6} strokeLinecap="round" />
      <Line x1={L} x2={nx} y1={y} y2={y} stroke={k.c.recovery} strokeWidth={6} strokeLinecap="round" />
      {eta ? <Line x1={nx + 8} x2={R - 6} y1={y} y2={y} stroke={k.c.recovery} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" opacity={0.8} /> : null}
      <Circle cx={R} cy={y} r={4.5} fill={k.c.surface} stroke={k.c.recovery} strokeWidth={2} />
      <Circle cx={nx} cy={y} r={7} fill={k.c.recovery} stroke={k.c.surface} strokeWidth={2.5} />
      <SvgText x={nx} y={y - 12} textAnchor="middle" fontFamily={font(700, 12).fontFamily} fontSize={12} fill={k.c.text}>{wtN(w.kg, u)}</SvgText>
      {eta ? <SvgText x={R} y={y - 12} textAnchor="end" {...SVG_LABEL} fontSize={11} fill={k.c['text-muted']}>{fill(t('progressEstDate'), { date: dShort(eta) })}</SvgText> : null}
    </Svg>
  </View>;
}

/** A small card in the two-up grid: a caption, a number and when it was measured. */
function Comp({ label, value, unit, sub, aria, onPress }: { label: string; value: string | null; unit?: string; sub: string; aria: string; onPress: () => void }) {
  const k = useKit();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={aria}
    style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 16, borderRadius: 20, backgroundColor: k.cardBg, boxShadow: k.cardEdge, opacity: pressed ? 0.7 : 1 })}>
    <Cap>{label}</Cap>
    <View style={{ marginTop: 6 }}>{value == null ? <Big size="mid" v={t('progressNoData')} color={k.c['text-muted']} /> : <Big size="mid" v={value} unit={unit} />}</View>
    <Cap style={[font(500, 12.5, 1.35), { marginTop: 4 }]}>{sub}</Cap>
  </Pressable>;
}

/** Weigh-ins typed here, newest first, each with a delete button that asks first. Apple Health readings are not listed:
 * they are removed in Apple Health. */
function Typed({ d }: { d: ProgressData }) {
  const auth = useAuth(), repo = auth.repository, u = d.unit;
  const [all, setAll] = useState(false);
  if (!repo || d.demo) return null;
  const rows = repo.list('weigh_ins').filter(r => r.deleted_at === null && r.data.source === 'app' && Number(r.data.weight_kg) > 0)
    .sort((a, b) => String(b.data.day).localeCompare(String(a.data.day)) || compareRows(b, a) || b.id.localeCompare(a.id));
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 5);
  const ask = (id: string, label: string) => Alert.alert(fill(t('progressDeleteWeighInQ'), { what: label }), undefined, [
    { text: t('cancel'), style: 'cancel' },
    { text: t('progressDelete'), style: 'destructive', onPress: () => { if (!deleteWeighIn(repo, id)) showToast(t('progressDeleteFailed'), { color: 'warning' }); } },
  ]);
  return <>
    <SectionHeader title={t('progressTypedWeighIns')} aside={rows.length > 5 ? t(all ? 'progressShowFewer' : 'progressShowAll') : undefined} onAside={() => setAll(!all)} />
    <List footer={t('progressTypedFoot')}>
      {shown.map(r => { const label = `${dLong(String(r.data.day))}, ${wtS(Number(r.data.weight_kg), u)}`;
        return <ListRow key={r.id} title={dLong(String(r.data.day))} value={wtS(Number(r.data.weight_kg), u)}
          right={<IconButton icon="trash" label={fill(t('progressDeleteWeighIn'), { what: label })} onPress={() => ask(r.id, label)} />} />; })}
    </List>
  </>;
}

export function BodyScreen() {
  const d = useProgress(), k = useKit(), u = d.unit, w = d.weight, auth = useAuth(), repo = auth.repository;
  // Opening Body quietly picks up new Apple Health weigh-ins once Health is connected and the person has not turned it off.
  // It never prompts, and does nothing in Look around first.
  useEffect(() => {
    if (!repo || auth.demo || !readWeightFromHealth(repo)) return;
    let live = true; void refreshWeights(repo, appleHealth(), new Date(), () => live).catch(() => {});
    return () => { live = false; };
  }, [repo, auth.demo]);
  const [range, setRange] = useState<Range>('month');
  const se = series(d, 'weight', range), v = se.v, li = lastIndex(v), mv = metricView(d, 'weight');
  const [sel, setSel] = useState<number | null>(null), at = sel ?? li;
  const fv = (x: number | null) => x == null ? t('progressNoData') : `${fmt(x, 1)} ${u}`;
  const eta = goalEta(d), c30 = change30(d);
  const done = w.kg != null && w.startKg != null ? w.startKg - w.kg : null, total = w.startKg != null && w.goalKg != null ? w.startKg - w.goalKg : null;
  // Tape: the newest reading of each measure, and the day of the newest set.
  const ms = d.measures, lastDay = ms.length ? ms[ms.length - 1].day : null;
  const val = (key: MeasureKey) => { for (let i = ms.length - 1; i >= 0; i--) { const x = ms[i].cm[key]; if (finite(x)) return x; } return null; };
  const fat = d.bodyFat.length ? d.bodyFat[d.bodyFat.length - 1] : null, waist = val('waist');
  const edit = () => router.push('/progress/measurements');
  const lastPhoto = d.photos.length ? d.photos[d.photos.length - 1] : null;
  const weighIn = w.day ? (w.time ? fill(t('progressLastWeighInAt'), { day: dayWord(d, w.day), time: w.time }) : fill(t('progressLastWeighIn'), { day: dayWord(d, w.day) })) : t('progressNoWeighIns');
  return <Page back={t('progress')} title={t('progressBody')} right={<NavButton label={t('progressLog')} onPress={() => router.push('/progress/log-weight')} />}>
    <View style={{ paddingTop: 6, paddingBottom: 6 }}>
      <Eyebrow style={{ marginBottom: 8 }}>{se.labels[at] ?? ''}</Eyebrow>
      {finite(v[at]) ? <Big v={fmt(v[at] as number, 1)} unit={u} /> : <Big v={t('progressNoData')} color={k.c['text-muted']} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><Src text={mv.src} /><Cap style={{ flex: 1 }}>{weighIn}</Cap></View>
    </View>
    <SegmentedControl label={t('progressTimeRange')} value={range} onChange={r => { setRange(r); setSel(null); }}
      options={[{ value: 'week', label: t('progressWeek') }, { value: 'month', label: t('progressMonth') }, { value: 'year', label: t('progressYear') }]} />
    <Card style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 10 }}>
      <Chart key={range} values={v} kind="line" color="recovery" H={210} axis ticks={se.ticks} labels={se.labels} sl={range === 'month' ? se.sl : null} fmt={fv}
        goal={mv.goal} goalL={w.goalKg != null ? fill(t('progressGoalIs'), { v: wGoal(w.goalKg, u) }) : undefined} sel={li} tick={mv.tick}
        label={`${t('progressMWeight')}, ${rangeLong(range).toLowerCase()}`} onSel={i => setSel(i)} />
    </Card>

    <SectionHeader title={t('progressGoal')} aside={w.goalKg != null ? `${wGoal(w.goalKg, u)} ${u}` : undefined} />
    <Card>
      {done != null && total != null && total !== 0 && w.goalKg != null ? <>
        <Split><Big size="sm" v={wtN(done, u)} unit={fill(t('progressOfTotal'), { total: wtS(total, u) })} /><Cap>{fill(t('progressOfTheWay'), { n: Math.max(0, Math.round(done / total * 100)) })}</Cap></Split>
        <GoalRuler d={d} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {([[t('progressStart'), wtN(w.startKg!, u)], [t('progressNow'), wtN(w.kg!, u)], [t('progressGoal'), wGoal(w.goalKg, u)]] as const).map(([l, n]) =>
            <Text key={l} style={[font(600, 12), { color: k.c['text-muted'] }]}>{l} <Text style={[font(700, 12), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{n}</Text></Text>)}
        </View>
        {eta && c30 != null ? <><Divider />
          <Split style={{ marginBottom: 0, alignItems: 'center' }}><Cap style={{ flex: 1 }}>{fill(t('progressPaceWeek'), { v: wtS(-c30 / 30 * 7, u) })}</Cap>
            <Text style={[font(700, 17, 1.1, -0.03), { color: k.c.text }]}>{fill(t('progressEstDate'), { date: dShort(eta) })}</Text></Split></> : null}
      </> : <Cap>{w.goalKg == null ? t('progressNoGoal') : t('progressWeightEmpty')}</Cap>}
    </Card>

    <SectionHeader title={t('progressComposition')} />
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Comp label={t('progressBodyFat')} value={fat ? fmt(fat.pct, 1) : null} unit="%" sub={fat ? fill(t('progressMeasuredOn'), { day: dLong(fat.day) }) : t('progressNotMeasured')}
        aria={fat ? fill(t('progressBodyFatEditAria'), { v: fmt(fat.pct, 1) }) : t('progressAddMeasurements')} onPress={edit} />
      <Comp label={measureName('waist')} value={waist != null ? fmt(u === 'lb' ? waist / 2.54 : waist, 1) : null} unit={lenU(u)} sub={lastDay ? fill(t('progressMeasuredOn'), { day: dLong(lastDay) }) : t('progressNotMeasured')}
        aria={waist != null ? fill(t('progressWaistEditAria'), { v: lenS(waist, u) }) : t('progressAddMeasurements')} onPress={edit} />
    </View>

    <SectionHeader title={t('progressMeasurements')} aside={t('progressEdit')} onAside={edit} asideLabel={t('progressEditMeasurements')} />
    <List footer={lastDay ? fill(t(u === 'lb' ? 'progressTapeFootIn' : 'progressTapeFootCm'), { day: dLong(lastDay) }) : t('progressMeasureEmpty')}>
      {MEASURE_KEYS.map(key => { const x = val(key); return <ListRow key={key} title={measureName(key)} value={x != null ? lenS(x, u) : t('progressNoData')} strong onPress={edit} />; })}
    </List>

    <SectionHeader title={t('progressPhotos')} />
    <List>
      <ListRow icon="camera" color="sleep" title={t('progressProgressPhotos')} sub={lastPhoto ? fill(t('progressNPhotosLast'), { n: d.photos.length, day: dShort(lastPhoto.day) }) : t('progressNoPhotos')} onPress={() => router.push('/progress/photos')} />
      <ListRow icon="plus" color="sleep" title={t('progressTakeAPhoto')} sub={t('progressFrontSideBack')} onPress={() => router.push('/progress/photo-capture')} />
    </List>
    <Typed d={d} />
  </Page>;
}
