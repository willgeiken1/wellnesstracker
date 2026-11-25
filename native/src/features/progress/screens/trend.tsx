import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Chip, Chips, Eyebrow, List, ListRow, SectionHeader, SegmentedControl, useKit, type IconName } from '@/components/kit';
import { t } from '@/i18n/en';
import { METRICS, TREND_KEYS, avg, finite, lastIndex, series, shown, type MetricKey, type ProgressData, type Range } from '../model';
import { fill, fmt, signed } from '../format';
import { metricView, rangeLong, vText } from '../metric';
import { useProgress } from '../use-progress';
import { Chart } from '../viz';
import { Big, Card, Cap, Foot, Page, Src, StatV, Stats, Txt, hmUnits } from './parts';

const ACTIONS: Partial<Record<MetricKey, [label: Parameters<typeof t>[0], href: string, icon: string][]>> = {
  weight: [['progressQaWeigh', '/progress/log-weight', 'plus'], ['progressBodyMeasures', '/progress/body', 'ruler']],
  sleep: [['progressLastNightDetail', '/progress/sleep', 'sleep']], hrv: [['progressSleepRecovery', '/progress/sleep', 'heart']], rhr: [['progressSleepRecovery', '/progress/sleep', 'heart']],
  steps: [['progressMScore', '/score', 'score']], kcal: [['progressOpenFood', '/food', 'food']], training: [['progressOpenTraining', '/workouts', 'workouts']],
};

/** One metric over a week, 30 days or 12 months: read any day on the chart, the average, the best and the change. */
/** The big number at the top, in the screen style (44 pt with a 15 pt unit). */
function HeroValue({ d, mkey: key, v }: { d: ProgressData; mkey: MetricKey; v: number | null | undefined }) {
  const k = useKit();
  if (v == null || !Number.isFinite(v)) return <Big v={t('progressNoData')} color={k.c['text-muted']} />;
  if (key === 'sleep') return <Big units={hmUnits(v * 60)} />;
  return <Big v={fmt(v, METRICS[key].dec === 2 ? 1 : METRICS[key].dec)} unit={metricView(d, key).unit || undefined} />;
}

export function TrendScreen({ metric, range: start }: { metric?: string; range?: string }) {
  const d = useProgress();
  const key: MetricKey = (TREND_KEYS as readonly string[]).includes(metric ?? '') ? metric as MetricKey : 'weight';
  const [range, setRange] = useState<Range>(start === 'week' || start === 'month' || start === 'year' ? start : key === 'weight' ? 'month' : 'week');
  const m = METRICS[key], mv = metricView(d, key), se = series(d, key, range), v = se.v, nn = v.filter(finite), a = avg(v);
  const best = nn.length ? (m.best === 'min' ? Math.min : Math.max)(...nn) : null, bi = best == null ? -1 : v.indexOf(best);
  const fi = v.findIndex(finite), li = lastIndex(v);
  const [sel, setSel] = useState<number | null>(null), at = sel ?? li;
  // The change: for a line, first to last; for a bar, the average against the same span just before.
  let chg: number | null = null, chgSub: string;
  if (m.line) { chg = fi >= 0 && finite(v[li]) && finite(v[fi]) ? (v[li] as number) - (v[fi] as number) : null; chgSub = fi >= 0 ? `${t('progressSince')} ${se.sl[fi]}` : ''; }
  else {
    const span = range === 'week' ? 7 : range === 'month' ? 30 : 365, prev = d.days[key].slice(-2 * span, -span).map(x => shown(key, x, d.unit));
    const pa = avg(prev); chg = a != null && pa != null && range !== 'year' ? a - pa : null;
    chgSub = t(range === 'week' ? 'progressVsLastWeek' : range === 'month' ? 'progressVs30Before' : 'progressVsYearBefore');
  }
  const unitTxt = mv.unit || undefined;
  const chgV = chg == null ? <StatV v={t('progressNotYet')} /> : key === 'sleep' ? <StatV v={`${chg < 0 ? '−' : '+'}${Math.abs(Math.round(chg * 60))}`} unit="min" /> : <StatV v={signed(chg, m.dec === 2 ? 1 : m.dec)} unit={unitTxt} />;
  const statV = (x: number | null) => x == null ? <StatV v={t('progressNoData')} /> : key === 'sleep' ? <StatV v={vText(d, key, x)} /> : <StatV v={fmt(x, m.dec === 2 ? 1 : m.dec)} unit={unitTxt} />;
  const fv = (x: number | null) => vText(d, key, x);
  const others = TREND_KEYS.filter(x => x !== key);
  return <Page back={t('progress')} title={mv.name}>
    <View style={{ paddingTop: 6, paddingBottom: 6 }}>
      <Eyebrow style={{ marginBottom: 8 }}>{se.labels[at] + (at === se.partial ? `, ${t('progressSoFarLower')}` : '')}</Eyebrow>
      <HeroValue d={d} mkey={key} v={v[at]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><Src text={mv.src} /><Cap style={{ flex: 1 }}>{t(range === 'year' ? 'progressTapMonth' : 'progressTapDayChart')}</Cap></View>
    </View>
    <SegmentedControl label={t('progressTimeRange')} value={range} onChange={r => { setRange(r); setSel(null); }}
      options={[{ value: 'week', label: t('progressWeek') }, { value: 'month', label: t('progressMonth') }, { value: 'year', label: t('progressYear') }]} />
    <Card style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 10 }}>
      <Chart key={`${key}${range}`} values={v} kind={m.kind} color={m.color} H={236} axis ticks={se.ticks} labels={se.labels} sl={range === 'month' ? se.sl : null} fmt={fv}
        goal={mv.goal} goalL={mv.goalL} band={mv.band} partial={se.partial} sel={li} tick={mv.tick}
        label={`${mv.name}, ${rangeLong(range).toLowerCase()}. ${t('progressAverage')} ${fv(a)}`} onSel={i => setSel(i)} />
    </Card>
    <Stats items={[
      { l: t('progressAverage'), v: statV(a), s: range === 'year' ? t('progressPerMonth') : rangeLong(range).toLowerCase() },
      { l: t(m.best === 'min' ? 'progressLowest' : 'progressBest'), v: statV(best), s: bi >= 0 ? se.sl[bi] : '' },
      { l: t('progressChange'), v: chgV, s: chgSub },
    ]} />
    {range === 'year' && key === 'training' ? <Foot>{t('progressYearMinMonth')}</Foot> : null}
    <SectionHeader title={t('progressAbout')} />
    <Card><Txt>{mv.about}</Txt></Card>
    {ACTIONS[key] ? <List>{ACTIONS[key]!.map(([l, href, icon]) => <ListRow key={href} title={t(l)} icon={icon as IconName} color={m.color} chevron onPress={() => router.push(href as never)} accessibilityHint={fill(t('progressOpens'), { name: t(l) })} />)}</List> : null}
    <SectionHeader title={t('progressOtherTrends')} />
    <Chips>{others.map(x => <Chip key={x} label={metricView(d, x).short} icon={METRICS[x].icon as IconName} onPress={() => router.push(`/progress/trend?metric=${x}&range=${range}`)} />)}</Chips>
  </Page>;
}
