import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { font, useKit } from '@/components/kit';
import { implementTile, type TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { finite, lastIndex, series, stats, weekday, type Pillars } from '../model';
import { clock, fill, hm } from '../format';
import { HRV_NAME, rangeShort, shortTicks } from '../metric';
import { rangeOf, usePageRange, useProgressData, pageRange } from '../store';
import { Cells, Chart, Gauge, meter } from '../viz';
import { B, Bar, Cols, HM, Hair, K, Legend, Num, NoData, Row, Scale, Spacer, Stack, Sub, T } from './ui';

export const PIL = [['training', 'progressPTraining', 'training'], ['food', 'progressPFood', 'food'], ['sleep', 'progressPSleep', 'recovery']] as const;

/** The number and its word inside a gauge. */
export function GaugeIn({ v, u, fs, us = 11 }: { v: string; u: string; fs: number; us?: number }) {
  const k = useKit();
  return <View style={{ alignItems: 'center' }}>
    <Text style={[font(700, fs, 1, -0.03), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{v}</Text>
    <Text style={[font(600, us, 1.2), { color: k.c['text-muted'], marginTop: 2 }]}>{u}</Text>
  </View>;
}

/** The day score line: against yesterday or your usual. */
export function scoreLine(today: number | null, ref: number | null, usual: boolean) {
  if (today == null) return t('progressNoScore');
  if (ref == null) return usual ? t('progressNoUsual') : t('progressNoYesterday');
  const diff = Math.round(today - ref), n = Math.abs(diff);
  return usual ? fill(t(diff < 0 ? 'progressUnderUsual' : 'progressOverUsual'), { n, usual: Math.round(ref) })
    : fill(t(diff < 0 ? 'progressDownYesterday' : 'progressUpYesterday'), { n });
}

/* ---------- 1. day score with its pillars ---------- */
function ScoreTile({ size, options }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), sc = d.days.score, today = sc[sc.length - 1], yest = d.yesterdayScore;
  const p: Pillars = d.pillars, Bs = d.baseline, usual = options.cmp === 'usual', ref = usual ? Bs.score : yest;
  const line = scoreLine(today, ref, usual);
  const pv = (x: number | null) => x == null ? t('progressNoData') : String(Math.round(x));
  const aria = today == null ? line : fill(t('progressScoreAria'), { score: Math.round(today), line, tr: pv(p.training), food: pv(p.food), sleep: pv(p.sleep) });
  const gauge = (sz: number, fs: number, sw: number) => <Gauge frac={(today ?? 0) / 100} notch={ref != null ? ref / 100 : null} size={sz} sw={sw} color="accent" label={aria}>
    <GaugeIn v={today == null ? '' : String(Math.round(today))} u={today == null ? t('progressNoScoreShort') : t('progressTodayLower')} fs={fs} />
  </Gauge>;
  if (size === 'S') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>{gauge(100, 28, 8)}<Sub style={{ marginTop: -4 }}>{line}</Sub></View>;
  const pils = PIL.map(([key, label, color]) => {
    const v = p[key], b = Bs[key];
    return <View key={key} style={{ gap: 5 }}>
      <Row style={{ gap: 8, alignItems: 'baseline' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: k.tok(color) }} />
          <Text style={[font(600, 13), { color: k.c.text }]}>{t(label)}</Text>
        </View>
        <Text style={[font(700, 15, 1), { color: v == null ? k.c['text-muted'] : k.c.text, fontVariant: ['tabular-nums'] }]}>{v == null ? t('progressNoData') : Math.round(v)}
          {size === 'L' && b != null ? <Text style={[font(600, 11), { color: k.c['text-muted'] }]}>{'  '}{fill(t('progressUsualN'), { n: Math.round(b) })}</Text> : null}</Text>
      </Row>
      {size === 'L' ? <Bar frac={(v ?? 0) / 100} color={color} mark={b != null ? b / 100 : null} h={6} /> : <Cells states={meter((v ?? 0) / 100, 10)} color={color} h={6} gap={2} r={2} />}
    </View>;
  });
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }}>{gauge(118, 32, 9)}<View style={{ flex: 1, gap: 9 }}>{pils}</View></View>;
  const known = PIL.filter(([key]) => p[key] != null), low = known.slice().sort((a, b) => (p[a[0]] ?? 0) - (p[b[0]] ?? 0))[0];
  const why = !low ? t('progressScoreWhyNone') : low[0] === 'training' && d.training.active
    ? fill(t('progressScoreWhyGoing'), { n: Math.round(p.training!), name: d.training.active.name })
    : fill(t('progressScoreWhy'), { name: t(low[1]), n: Math.round(p[low[0]]!) });
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={`${aria} ${why}`}>
    <Row style={{ gap: 14 }}>{gauge(120, 32, 9)}<View style={{ flex: 1 }}><T wrap size={16} style={font(700, 16, 1.25)}>{line}</T><Sub wrap style={{ marginTop: 6 }}>{why}</Sub></View></Row>
    <Hair style={{ marginTop: 12 }} />
    <View style={{ gap: 10, marginTop: 'auto' }}>{pils}</View>
  </View>;
}

/* ---------- 2. day score over the range ---------- */
function HistoryTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), r = rangeOf(options, usePageRange()), se = series(d, 'score', r), S0 = stats(se.v), B0 = d.baseline.score, w = body.w;
  if (S0.n === 0) return <View style={{ flex: 1 }}><NoData fs={size === 'S' ? 24 : 28} text={t('progressNoData')} /><Sub wrap style={{ marginTop: 6 }}>{t('progressHistoryEmpty')}</Sub></View>;
  const bi = se.v.indexOf(S0.max), lo = se.v.indexOf(S0.min), li = lastIndex(se.v);
  const above = B0 == null ? null : se.v.filter(x => finite(x) && x >= B0).length;
  const aria = fill(t('progressHistoryAria'), { range: rangeShort(r), avg: Math.round(S0.avg!), best: S0.max!, when: se.labels[bi] === 'Today' ? 'today' : se.labels[bi] });
  const form = options.form === 'pillars' && r !== 'week' ? 'cols' : options.form ?? 'heat';
  const viz = (W: number, H: number, labels: boolean) => {
    if (form === 'pillars') {
      const cols = ['training', 'food', 'recovery'] as const, hmax = H - (labels ? 32 : 16);
      return <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: H }}>
        {d.weekPillars.map((pp, i) => {
          const now = i === 6, vals = [pp.training, pp.food, pp.sleep];
          return <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
            <Text style={[font(700, 11.5, 1), { color: now ? k.c.text : k.c['text-muted'], fontVariant: ['tabular-nums'] }]}>{se.v[i] == null ? '' : Math.round(se.v[i]!)}</Text>
            <View style={{ flexDirection: 'column-reverse', gap: 2, width: W > 200 ? 26 : 14 }}>
              {vals.map((v, j) => <View key={j} style={{ borderRadius: 3, backgroundColor: k.tok(cols[j]), opacity: now ? 0.55 : 1, height: Math.max(2, (v ?? 0) / 3 / 100 * hmax - 2) }} />)}
            </View>
            {labels ? <Text style={[font(700, 11, 1), { color: now ? k.c.text : k.c['text-muted'] }]}>{weekday(se.keys[i]).charAt(0)}</Text> : null}
          </View>;
        })}
      </View>;
    }
    return <View accessible accessibilityRole="image" accessibilityLabel={aria}>
      <Chart values={se.v} kind={form === 'cols' ? 'bar' : 'heat'} color="accent" mini W={W} H={H} live={r !== 'year'} partial={r !== 'year' ? se.v.length - 1 : -1}
        goal={form === 'cols' ? B0 : null} ticks={labels ? shortTicks(se, r, r === 'month') : null} />
    </View>;
  };
  if (size === 'S') return <View style={{ flex: 1 }}><Num v={Math.round(S0.avg!)} fs={32} /><Sub style={{ marginTop: 4 }}>{t('progressAverageBest')} <B>{S0.max}</B></Sub><View style={{ marginTop: 'auto' }}>{viz(w, 48, false)}</View></View>;
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
    <View style={{ width: 84 }}><Num v={Math.round(S0.avg!)} fs={30} /><Sub style={{ marginTop: 4 }}>{t('progressAverageLower')}</Sub>
      <Sub style={{ marginTop: 'auto' }}>{t('progressBest')} <B>{S0.max}</B></Sub><Sub>{r === 'week' ? weekday(se.keys[bi]) : se.sl[bi]}</Sub></View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>{viz(w - 96, 104, true)}</View>
  </View>;
  const legend = form === 'pillars'
    ? <Legend style={{ marginTop: 10 }} items={PIL.map(([, l, c]) => ({ color: k.tok(c), label: t(l) }))} />
    : <Sub style={{ marginTop: 10 }}>{form === 'cols' && B0 != null ? fill(t('progressLineUsual'), { n: Math.round(B0) }) : t('progressBrighter')}{r !== 'year' ? ` ${t('progressTodayGoing')}` : ''}</Sub>;
  return <View style={{ flex: 1 }}>
    <Cols>{[
      <View key="a"><Num v={Math.round(S0.avg!)} fs={30} /><Sub>{t('progressAverage')}</Sub></View>,
      <View key="b"><Num v={S0.max!} fs={30} /><Sub>{t('progressBest')}, {se.sl[bi]}</Sub></View>,
      <View key="c"><Num v={S0.min!} fs={30} /><Sub>{t('progressLowest')}, {li === lo && r !== 'year' ? t('progressTodayLower') : se.sl[lo]}</Sub></View>,
    ]}</Cols>
    <View style={{ marginTop: 'auto' }}>{viz(w, 118, true)}{legend}
      {above != null ? <Sub style={{ marginTop: 5 }}>{t('progressAboveUsual')} <B>{above}</B> {fill(t(r === 'year' ? 'progressOfMonths' : 'progressOfDays'), { n: S0.n })}</Sub> : null}</View>
  </View>;
}

/* ---------- 3. recovery: sleep, HRV, resting heart rate ---------- */
const last = (v: (number | null)[]) => { const x = v[v.length - 1]; return finite(x) ? x : null; };
function RecoveryTile({ size, options, body }: TileRenderProps) {
  const d = useProgressData(), k = useKit(), S = d.night, h = last(d.days.hrv), rh = last(d.days.rhr), hb = d.hrvBand, rb = d.rhrBand, goal = d.sleepGoalMin;
  const src = S?.source ?? (d.sources.oura || d.demo ? 'Oura' : 'Apple Health');
  if (!S && h == null && rh == null) return <View style={{ flex: 1 }}><NoData fs={size === 'S' ? 24 : 28} text={t('progressNoData')} /><Sub wrap style={{ marginTop: 6 }}>{t('progressRecoveryEmpty')}</Sub></View>;
  const usual = (b: readonly [number, number] | null) => b ? fill(t('progressUsualRange'), { a: b[0], b: b[1] }) : t('progressNoUsualYet');
  const sleepCells = (hgt = 6) => <Cells states={meter((S?.min ?? 0) / goal, goal / 60)} color="sleep" h={hgt} gap={2} r={2} />;
  const scaleH = () => h != null ? <Scale v={h} lo={36} hi={72} band={hb} /> : null, scaleR = () => rh != null ? <Scale v={rh} lo={48} hi={66} band={rb} /> : null;
  const col = (num: ReactNode, title: string, sub: string, viz: ReactNode) => <View>{num}<Sub style={{ marginTop: 3 }} color={k.c.text}>{title}</Sub><Sub size={11.5}>{sub}</Sub><View style={{ marginTop: 9 }}>{viz}</View></View>;
  const nd = (fs: number) => <NoData fs={fs * 0.8} text={t('progressNoData')} />;
  const cols = {
    sleep: (fs: number) => col(S ? <HM min={S.min} fs={fs} /> : nd(fs), t('progressPSleep'), fill(t('progressGoalLower'), { v: `${goal / 60}h` }), sleepCells()),
    hrv: (fs: number) => col(h != null ? <Num v={h} unit="ms" fs={fs} /> : nd(fs), HRV_NAME, usual(hb), scaleH()),
    rhr: (fs: number) => col(rh != null ? <Num v={rh} unit="bpm" fs={fs} /> : nd(fs), t('progressRhrShort'), usual(rb), scaleR()),
  };
  const aria = fill(t('progressRecoveryAria'), { src, sleep: S ? hm(S.min / 60) : t('progressNoData'), hrv: h ?? t('progressNoData'), rhr: rh ?? t('progressNoData') });
  const lead = (options.lead ?? 'sleep') as keyof typeof cols;
  if (size === 'S') {
    const num = lead === 'sleep' ? (S ? <HM min={S.min} fs={30} /> : nd(30)) : lead === 'hrv' ? (h != null ? <Num v={h} unit="ms" fs={30} /> : nd(30)) : (rh != null ? <Num v={rh} unit="bpm" fs={30} /> : nd(30));
    const short = S ? goal - S.min : 0;
    const note = lead === 'sleep' ? (!S ? '' : short > 0 ? fill(t('progressMinShort'), { n: short, goal: `${goal / 60}h` }) : t('progressGoalMet')) : usual(lead === 'hrv' ? hb : rb);
    return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{num}
      <Sub style={{ marginTop: 4 }}>{lead === 'sleep' ? t('progressPSleep') : lead === 'hrv' ? HRV_NAME : t('progressMRhr')}</Sub><Sub>{note}</Sub>
      <View style={{ marginTop: 'auto' }}>{lead === 'sleep' ? sleepCells(8) : lead === 'hrv' ? scaleH() : scaleR()}</View></View>;
  }
  const order = [lead, ...(['sleep', 'hrv', 'rhr'] as const).filter(x => x !== lead)];
  const top = <Cols>{order.map(x => <View key={x}>{cols[x](22)}</View>)}</Cols>;
  const bedWake = S && S.bed != null && S.wake != null ? [clock(S.bed), clock(S.wake)] : null;
  if (size === 'M') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{top}<Hair style={{ marginTop: 'auto' }} />
    <Sub style={{ marginTop: 9 }}>{bedWake ? <>{t('progressInBed')} <B>{bedWake[0]}</B> {t('progressTo')} <B>{bedWake[1]}</B>, {fill(t('progressFromSrc'), { src })}</> : fill(t('progressFromSrcCap'), { src })}</Sub></View>;
  const ST = [['deep', 'progressDeep', 'sleep'], ['rem', 'recoveryRem', 'recovery'], ['core', 'progressCore', 'accent'], ['awake', 'progressAwake', 'food']] as const;
  const se = series(d, 'sleep', 'week');
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>{top}
    <Hair style={{ marginTop: 12, marginBottom: 10 }} />
    {S && S.min > 0 && (S.deep || S.rem || S.core) ? <>
      <Row style={{ marginBottom: 8 }}><K>{t('progressStages')}</K><Spacer />{bedWake ? <Sub>{bedWake[0]} {t('progressTo')} {bedWake[1]}</Sub> : null}</Row>
      <Stack parts={ST.map(([key, , c]) => ({ color: k.tok(c), frac: S[key] / S.min }))} />
      <Legend style={{ marginTop: 8 }} items={[...ST.map(([key, l, c]) => ({ color: k.tok(c), label: t(l), value: String(S[key]) })), { label: t('progressMinUnit') }]} />
    </> : <Sub wrap>{t('progressNoStages')}</Sub>}
    <Row style={{ marginTop: 'auto' }}><K>{t('progressNightsWeek')}</K><Spacer /><Sub>{fill(t('progressLineAt'), { v: `${goal / 60}h` })}</Sub></Row>
    <View style={{ marginTop: 4 }}><Chart values={se.v} kind="bar" color="sleep" mini W={body.w} H={70} goal={goal / 60} ticks={se.ticks.map(x => x.charAt(0))} /></View>
  </View>;
}

implementTile('progress', 'score', { render: p => <ScoreTile {...p} />, meta: () => t('progressTodaySoFar'), open: () => router.push('/score') });
implementTile('progress', 'history', { render: p => <HistoryTile {...p} />, meta: ({ options }) => rangeShort(rangeOf(options, pageRange())), open: () => router.push('/score') });
implementTile('progress', 'recovery', { render: p => <RecoveryTile {...p} />, meta: () => t('progressLastNight'), open: () => router.push('/progress/sleep') });
