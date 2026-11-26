import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Eyebrow, NavButton, SectionHeader, font, mix, useKit, Tappable } from '@/components/kit';
import { t } from '@/i18n/en';
import { addDays, dLong, dShort, finite, weekday, type Pillars } from '../model';
import { fill, fmt, hm } from '../format';
import { useProgress } from '../use-progress';
import { Gauge } from '../viz';
import { PIL, scoreLine } from '../tiles/today';
import { Big, Bold, Cap, Card, Divider, Foot, Ic, Page, Split, Three, Txt, type Scroller } from './parts';

const ICON = { training: 'workouts', food: 'food', sleep: 'sleep' } as const;

/** Day score: how today adds up, against your usual, and each day of the week. */
export function DayScoreScreen() {
  const d = useProgress(), k = useKit(), scroll = useRef<Scroller>(null), aboutY = useRef(0);
  const sc = d.days.score, today = sc[sc.length - 1], p = d.pillars, B = d.baseline, days = Array.from({ length: 7 }, (_, i) => addDays(d.today, i - 6));
  const [sel, setSel] = useState(6);
  const T0 = d.training, F = d.food, night = d.night, hrv = d.days.hrv[d.days.hrv.length - 1];
  const todayMin = d.days.training[d.days.training.length - 1];
  const sub = {
    training: T0.goalMin && finite(todayMin) ? fill(t(T0.active ? 'progressScoreTrGoing' : 'progressScoreTr'), { min: todayMin, goal: T0.goalMin, name: T0.active?.name ?? '' }) : p.training == null ? t('progressScoreTrNone') : t('progressScoreTrPlain'),
    food: F.eatenKcal != null && F.goalKcal ? fill(t(F.proteinG != null && F.proteinGoal ? 'progressScoreFoodP' : 'progressScoreFood'), { eaten: fmt(F.eatenKcal), goal: fmt(F.goalKcal), p: Math.round(F.proteinG ?? 0), pg: Math.round(F.proteinGoal ?? 0) }) : t('progressScoreFoodNone'),
    sleep: night ? fill(t(hrv != null && d.hrvBand && hrv >= d.hrvBand[0] && hrv <= d.hrvBand[1] ? 'progressScoreSleepIn' : 'progressScoreSleep'), { hm: hm(night.min / 60) }) : t('progressScoreSleepNone'),
  };
  const line = scoreLine(today, d.yesterdayScore, false);
  const known = PIL.filter(([key]) => p[key] != null);
  // Each square is one point: the score is the average of the pillars that have data, so each adds its share of that average.
  const share = known.length || 1;
  let cum = 0; const cuts = PIL.map(([key, , c]) => { cum += (p[key] ?? 0) / share; return [Math.round(cum), c] as const; });
  const adds = (key: keyof typeof p) => p[key] == null ? t('progressNoData') : fmt(p[key]! / share, 1);
  const cell = (i: number) => { const hit = cuts.find(c => i < c[0]); return hit ? k.tok(hit[1]) : mix(k.c.text, k.c['surface-2'], 0.08); };
  const W = 329, cw = (W - 19 * 3) / 20;
  return <Page scrollRef={scroll} back={t('progress')} title={t('progressMScore')}
    right={<NavButton icon="info" label={t('progressAboutScore')} onPress={() => scroll.current?.scrollTo({ y: Math.max(0, aboutY.current - 120), animated: !k.reduceMotion })} />}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 6, paddingBottom: 18 - 12 }}>
      <Gauge frac={(today ?? 0) / 100} notch={d.yesterdayScore != null ? d.yesterdayScore / 100 : null} size={136} sw={11} color="accent" label={fill(t('progressScoreHeroAria'), { score: today == null ? t('progressNoData') : Math.round(today), y: d.yesterdayScore ?? t('progressNoData') })}>
        <View style={{ alignItems: 'center' }}><Text style={[font(700, 40, 1, -0.04), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{today == null ? '' : Math.round(today)}</Text><Text style={[font(600, 11), { color: k.c['text-muted'], marginTop: 3 }]}>{t('progressTodayLower')}</Text></View>
      </Gauge>
      <View style={{ flex: 1 }}>
        <Eyebrow>{fill(t('progressSoFarEyebrow'), { day: dLong(d.today) })}</Eyebrow>
        <Cap size={14} style={[font(600, 14, 1.45), { marginTop: 8 }]}><Bold>{line}.</Bold>{T0.active && p.training != null ? ` ${t('progressCanRise')}` : ''}</Cap>
      </View>
    </View>
    <Card onLayout={e => { aboutY.current = e.nativeEvent.layout.y; }}><Txt><Bold>{t('progressScoreWhatTitle')}</Bold> {t('progressScoreWhat')}</Txt></Card>
    <SectionHeader title={t('progressHowAdds')} />
    <Card>
      <View accessible accessibilityRole="image" accessibilityLabel={fill(t('progressAddsAria'), { tr: adds('training'), food: adds('food'), sleep: adds('sleep'), total: today == null ? t('progressNoData') : Math.round(today) })}
        style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: 20 }, (_, c) => <View key={c} style={{ flex: 1, gap: 3 }}>{Array.from({ length: 5 }, (_, r) => <View key={r} style={{ aspectRatio: 1, width: '100%', maxWidth: cw + 4, borderRadius: 3, backgroundColor: cell(c * 5 + r) }} />)}</View>)}
      </View>
      <Cap style={{ marginTop: 8 }}>{t('progressEachSquare')}</Cap>
      <View style={{ marginTop: 6 }}>{PIL.map(([key, label, c], i) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, marginLeft: i ? 44 : 0 }}>
        {i ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: k.c.hair }} /> : null}
        <View style={{ marginLeft: i ? -44 : 0 }}><Ic icon={ICON[key]} color={c} size={32} /></View>
        <View style={{ flex: 1 }}><Text style={[font(600, 15.5, 1.25, -0.01), { color: k.c.text }]}>{t(label)} <Text style={[font(600, 15.5, 1.25, -0.02), { color: k.c['text-muted'], fontVariant: ['tabular-nums'] }]}>{p[key] == null ? t('progressNoData') : Math.round(p[key]!)}</Text></Text>
          <Text style={[font(500, 13, 1.35), { color: k.c['text-muted'], marginTop: 2 }]}>{sub[key]}</Text></View>
        <Text style={[font(700, 15, undefined, -0.01), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{p[key] == null ? '' : `+${adds(key)}`}</Text>
      </View>)}</View>
      <Divider style={{ marginTop: 6, marginBottom: 12 }} />
      <Split style={{ marginBottom: 0 }}><Cap>{known.length ? fill(t('progressDividedBy'), { sum: known.map(([key]) => Math.round(p[key]!)).join(' + '), n: known.length }) : t('progressScoreWhyNone')}</Cap>
        <Big size="sm" v={today == null ? '' : Math.round(today)} /></Split>
    </Card>
    <SectionHeader title={t('progressAgainstUsual')} aside={t('progressBaseline28')} />
    <Card>
      <Split style={{ marginBottom: 14 }}><Cap>{t('progressUsualScore')}</Cap><Big size="sm" v={B.score ?? t('progressNoData')} /></Split>
      <View style={{ gap: 14 }}>{PIL.map(([key, label, c]) => { const v = p[key], b = B[key]; return <View key={key} accessible accessibilityRole="image" accessibilityLabel={fill(t('progressVsAria'), { name: t(label), v: v == null ? t('progressNoData') : Math.round(v), b: b ?? t('progressNoData') })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[font(600, 13.5), { width: 74, color: k.c.text }]}>{t(label)}</Text>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: k.c['surface-2'] }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, width: `${v ?? 0}%`, backgroundColor: k.tok(c) }} />
          {b != null ? <View style={{ position: 'absolute', top: -4, width: 2, height: 16, marginLeft: -1, left: `${b}%`, borderRadius: 1, backgroundColor: k.c.text }} /> : null}
        </View>
        <Text style={[font(700, 13.5), { width: 64, textAlign: 'right', color: k.c.text, fontVariant: ['tabular-nums'] }]}>{v == null ? '' : Math.round(v)} <Text style={[font(600, 12), { color: k.c['text-muted'] }]}>/ {b ?? ''}</Text></Text>
      </View>; })}</View>
      <Cap style={{ marginTop: 14 }}>{t('progressUsualLine')}</Cap>
    </Card>
    <SectionHeader title={t('progressThisWeek')} aside={t('progressTapDay')} />
    <Card>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('progressWeekTapAria')} style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end' }}>
        {days.map((day, i) => { const v = sc[sc.length - 7 + i], on = i === sel; return <Tappable dim="fill" key={day} onPress={() => setSel(i)} accessibilityRole="radio" accessibilityState={{ selected: on }}
          accessibilityLabel={fill(t('progressDayAria'), { day: dLong(day), v: v == null ? t('progressNoData') : Math.round(v) })}
          style={{ flex: 1, alignItems: 'center', gap: 6, minHeight: 44, paddingTop: 6, paddingBottom: 4, borderRadius: 12, backgroundColor: on ? mix(k.c.accent, 'transparent', 0.14) : 'transparent' }}>
          <Text style={[font(700, 13), { color: on ? k.c.text : k.c['text-muted'], fontVariant: ['tabular-nums'] }]}>{v == null ? '' : Math.round(v)}</Text>
          <View style={{ width: 26, height: 96, borderRadius: 8, backgroundColor: k.c['surface-2'], overflow: 'hidden' }}><View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 8, height: `${v ?? 0}%`, backgroundColor: k.c.accent, opacity: on ? 1 : 0.5 }} /></View>
          <Text style={[font(600, 11.5), { color: on ? k.c.text : k.c['text-muted'] }]}>{weekday(day).charAt(0)}</Text>
        </Tappable>; })}
      </View>
      <Divider />
      <DayRead i={sel} day={days[sel]} v={sc[sc.length - 7 + sel]} dp={d.weekPillars[sel]} usual={B.score} note={d.dayNotes[sel] ?? ''} />
    </Card>
    <Foot>{t('progressScoreFoot')}</Foot>
  </Page>;
}

function DayRead({ i, day, v, dp, usual, note }: { i: number; day: string; v: number | null; dp: Pillars; usual: number | null; note: string }) {
  const k = useKit(), vals = PIL.map(([key]) => dp[key]), got = vals.filter(finite);
  const hiI = got.length ? vals.indexOf(Math.max(...got)) : -1, lo = got.length ? vals.indexOf(Math.min(...got)) : -1;
  const names = PIL.map(([, l]) => t(l));
  const close = hiI < 0 ? '' : (vals[hiI]! - vals[lo]! >= 10 ? fill(t('progressCarried'), { hi: names[hiI], lo: names[lo].toLowerCase() }) : t('progressAllClose'));
  return <View>
    <Split style={{ marginBottom: 12 }}>
      <View><Eyebrow>{i === 6 ? t('today') : `${weekday(day)}, ${dShort(day)}`}</Eyebrow><View style={{ marginTop: 6 }}><Big size="mid" v={v == null ? t('progressNoData') : Math.round(v)} /></View></View>
      {i < 6 ? (v != null && usual != null ? <Badge label={t(v >= usual ? 'progressAboveUsualBadge' : 'progressBelowUsualBadge')} color={v >= usual ? 'success' : 'warning'} /> : null) : <Badge label={t('progressSoFar')} color="accent" />}
    </Split>
    <Three>{PIL.map(([key, l, c], j) => <View key={key}><Big size="sm" v={vals[j] == null ? '' : Math.round(vals[j]!)} color={k.tok(c)} /><Cap>{t(l)}</Cap></View>)}</Three>
    <Divider />
    <Txt>{note}{close ? ` ${close}` : ''}</Txt>
  </View>;
}
