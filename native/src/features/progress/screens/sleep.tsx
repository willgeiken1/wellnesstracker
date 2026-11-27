import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Eyebrow, List, ListRow, SectionHeader, font, mix, useKit, Tappable } from '@/components/kit';
import { t } from '@/i18n/en';
import { addDays, avg, finite, weekday, type Night, type Stage } from '../model';
import { clock, fill, hm } from '../format';
import { useProgress } from '../use-progress';
import { SVG_LABEL } from '../viz';
import { HRV_NAME } from '../metric';
import { Big, Cap, Card, Page, Src, hmUnits } from './parts';

const STAGES: Record<Stage, [name: Parameters<typeof t>[0], color: string]> = { awake: ['progressAwake', 'food'], rem: ['recoveryRem', 'recovery'], core: ['progressCore', 'accent'], deep: ['progressDeep', 'sleep'] };
const ORDER: Stage[] = ['deep', 'rem', 'core', 'awake'];

/** The night as blocks on four lanes; tap a block to read it. */
function Hypnogram({ night, sel, onSel }: { night: Night; sel: number | null; onSel: (i: number) => void }) {
  const k = useKit(), segs = night.segments!, W = 329, H = 150, lanes: Stage[] = ['awake', 'rem', 'core', 'deep'], lh = 30, x0 = 46, PW = W - x0, tot = segs.reduce((a, s) => a + s[1], 0), start = night.bed ?? 0;
  const [w, setW] = useState(W);
  const laneY = (st: Stage) => lanes.indexOf(st) * lh + 5;
  const starts = segs.reduce<number[]>((a, _s, i) => [...a, i ? a[i - 1] + segs[i - 1][1] : 0], []);
  const blocks = segs.map(([st, min], i) => {
    const acc = starts[i], prevY = i ? laneY(segs[i - 1][0]) : null;
    const x = x0 + PW * acc / tot, bw = PW * min / tot, y = laneY(st), link = prevY != null ? <Line key={`l${i}`} x1={x} x2={x} y1={Math.min(prevY, y) + 10} y2={Math.max(prevY, y) + 10} stroke={k.c['hair-2']} strokeWidth={1} /> : null;
    return <G key={i}>{link}<Rect x={x} y={y} width={Math.max(2, bw - 0.6)} height={20} rx={4} fill={k.tok(STAGES[st][1])} opacity={sel == null || sel === i ? 1 : 0.35} /></G>;
  });
  /* inner ticks on whole even hours that sit well inside the night, as on a clock face */
  const inner: [number, string][] = [];
  for (let m = Math.ceil(start / 120) * 120; m < start + tot && inner.length < 2; m += 120) { const f = (m - start) / tot; if (f >= 0.2 && f <= 0.8) inner.push([m - start, clock(m)]); }
  const ticks: [number, string][] = [[0, clock(start)], ...inner, [tot, clock(start + tot)]];
  const pick = (px: number) => { const tm = ((px * W / w) - x0) / PW * tot; if (tm < 0) return; let a = 0; for (let i = 0; i < segs.length; i++) { a += segs[i][1]; if (a >= tm) return onSel(i); } onSel(segs.length - 1); };
  return <Tappable dim="none" onLayout={e => setW(e.nativeEvent.layout.width)} onPress={e => pick(e.nativeEvent.locationX)} accessibilityRole="image"
    accessibilityLabel={fill(t('progressHypAria'), { from: clock(start), to: clock(start + tot), deep: night.deep, rem: night.rem, core: night.core, awake: night.awake })} style={{ width: '100%', aspectRatio: W / H }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {lanes.map((l, i) => <G key={l}><SvgText x={0} y={i * lh + 19} {...SVG_LABEL} fill={k.c['text-muted']}>{t(STAGES[l][0])}</SvgText><Line x1={x0} x2={W} y1={i * lh + 15} y2={i * lh + 15} stroke={k.c.hair} /></G>)}
      {blocks}
      {ticks.map(([m, l], i) => <SvgText key={`t${i}`} x={x0 + PW * m / tot} y={H - 2} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} {...SVG_LABEL} fill={k.c['text-muted']}>{l}</SvgText>)}
    </Svg>
  </Tappable>;
}

/** Sleep and recovery: last night's stages, the last 7 nights on one clock, heart readings and where they come from. */
export function SleepScreen() {
  const d = useProgress(), k = useKit(), S = d.night, goal = d.sleepGoalMin;
  const [seg, setSeg] = useState<number | null>(null), [night, setNight] = useState(6);
  const sw = d.days.sleep.slice(-7), wake = d.wake.slice(-7), days = Array.from({ length: 7 }, (_, i) => addDays(d.today, i - 6));
  const hrv = d.days.hrv[d.days.hrv.length - 1], rhr = d.days.rhr[d.days.rhr.length - 1], src = S?.source ?? (d.sources.oura || d.demo ? 'Oura' : 'Apple Health');
  const A0 = -180, A1 = 540, pos = (m: number) => `${(m - A0) / (A1 - A0) * 100}%` as const;
  const win = sw.map((h, i) => { const wk = wake[i]; return finite(h) && finite(wk) ? { bed: wk - Math.round(h * 60), wake: wk, h } : finite(h) ? { bed: null, wake: null, h } : null; });
  const dayName = (i: number) => i === 6 ? t('progressLastNight') : fill(t('progressMorning'), { day: weekday(days[i]) });
  const dot = (c: string) => <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.tok(c) }} />;
  const readLine = (left: ReactNode, right?: string) => <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>{left}{right ? <Cap>{right}</Cap> : null}</View>;
  const segRead = () => {
    if (!S?.segments || seg == null) return readLine(<Cap>{t('progressTapBlock')}</Cap>);
    let a = 0; for (let i = 0; i < seg; i++) a += S.segments[i][1];
    const [st, min] = S.segments[seg], from = (S.bed ?? 0) + a;
    return readLine(<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{dot(STAGES[st][1])}<Text style={[font(600, 14), { color: k.c.text }]}>{t(STAGES[st][0])}, {min} {t('progressMinUnit')}</Text></View>, `${clock(from)} ${t('progressTo')} ${clock(from + min)}`);
  };
  const nx = win[night];
  const hrRow = (key: 'hrv' | 'rhr', v: number | null, band: readonly [number, number] | null, unit: string) => {
    const inside = v != null && band ? v >= band[0] && v <= band[1] : null;
    const sub = band ? fill(t(inside == null ? 'progressUsualUnit' : inside ? 'progressUsualInside' : 'progressUsualOutside'), { a: band[0], b: band[1], u: unit }) : t('progressNoUsualYetCap');
    return <ListRow key={key} title={key === 'hrv' ? HRV_NAME : t('progressMRhr')} sub={sub} icon="heart" color="recovery" chevron
      right={<Text style={[font(700, 15), { color: k.c.text, fontVariant: ['tabular-nums'] }]}>{v ?? t('progressNoData')} <Text style={[font(600, 12.5), { color: k.c['text-muted'] }]}>{v != null ? unit : ''}</Text></Text>}
      onPress={() => router.push(`/progress/trend?metric=${key}&range=week`)} />;
  };
  return <Page back={t('progress')} title={t('progressMSleep')}>
    <View style={{ paddingTop: 6, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}><Eyebrow>{t('progressLastNight')}</Eyebrow><Src text={src} /></View>
      {S ? <Big units={hmUnits(S.min)} /> : <Big v={t('progressNoData')} color={k.c['text-muted']} />}
      {S ? <Cap style={{ marginTop: 6 }}>{S.bed != null && S.wake != null ? `${clock(S.bed)} ${t('progressTo')} ${clock(S.wake)} · ` : ''}{fill(t('progressAsleepAwake'), { asleep: hm((S.min - S.awake) / 60), awake: S.awake })}</Cap> : <Cap style={{ marginTop: 6 }}>{t('progressRecoveryEmpty')}</Cap>}
    </View>
    {S ? <Card>
      {S.segments ? <>{segRead()}<Hypnogram night={S} sel={seg} onSel={setSeg} /></> : <Cap>{t('progressNoStages')}</Cap>}
      {S.deep || S.rem || S.core ? <>
        <View style={{ flexDirection: 'row', height: 10, marginTop: 16, borderRadius: 7, overflow: 'hidden', gap: 2, backgroundColor: k.c['surface-2'] }}>{ORDER.map(st => <View key={st} style={{ width: `${S[st] / S.min * 100}%`, backgroundColor: k.tok(STAGES[st][1]) }} />)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, marginTop: 16 }}>{ORDER.map((st, i) => <View key={st} style={{ width: '50%', flexDirection: 'row', gap: 10, paddingLeft: i % 2 ? 8 : 0, paddingRight: i % 2 ? 0 : 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, marginTop: 5, backgroundColor: k.tok(STAGES[st][1]) }} />
          <View><Big size="sm" fs={18} v={S[st]} unit={t('progressMinUnit')} /><Cap>{t(STAGES[st][0])}, {Math.round(S[st] / S.min * 100)}%</Cap></View></View>)}</View>
      </> : null}
    </Card> : null}
    <SectionHeader title={t('progressLast7')} aside={avg(sw) != null ? `${t('progressAvgLower')} ${hm(avg(sw)!)}` : undefined} />
    <Card style={{ paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 }}>
      {readLine(<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{dot('sleep')}<Text style={[font(600, 14), { color: k.c.text }]}>{dayName(night)}, {nx ? hm(nx.h) : t('progressNoData')}</Text></View>,
        nx?.bed != null && nx.wake != null ? `${clock(nx.bed)} ${t('progressTo')} ${clock(nx.wake)}` : undefined)}
      {/* .pg-win's 10 pt top margin folds into the read line's 8 pt bottom margin on the web, so 2 pt more here. */}
      <View style={{ gap: 2, marginTop: 2 }}>
        {win.map((x, i) => { const on = i === night; return <Tappable dim="fill" key={i} onPress={() => setNight(i)} accessibilityRole="button" accessibilityState={{ selected: on }}
          accessibilityLabel={`${dayName(i)}, ${x?.bed != null && x.wake != null ? `${clock(x.bed)} ${t('progressTo')} ${clock(x.wake)}, ` : ''}${x ? hm(x.h) : t('progressNoData')}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, borderRadius: 8 }}>
          <Text style={[font(600, 12), { width: 34, color: on ? k.c.text : k.c['text-muted'] }]}>{weekday(days[i])}</Text>
          <View style={{ flex: 1, height: 12 }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 1, backgroundColor: k.c.hair }} />
            {x?.bed != null && x.wake != null ? <>
              <View style={{ position: 'absolute', top: -1, bottom: -1, left: pos(x.bed), width: `${(goal / (A1 - A0)) * 100}%`, borderRadius: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: mix(k.c.sleep, 'transparent', 0.55) }} />
              <View style={{ position: 'absolute', top: 1, bottom: 1, left: pos(x.bed), width: `${(x.wake - x.bed) / (A1 - A0) * 100}%`, borderRadius: 6, backgroundColor: on ? k.c.sleep : mix(k.c.sleep, k.c['surface-2'], 0.5) }} />
            </> : null}
          </View>
          <Text style={[font(700, 12.5, undefined, -0.02), { width: 52, textAlign: 'right', color: on ? k.c.text : k.c['text-muted'] }]}>{x ? hm(x.h) : ''}</Text>
        </Tappable>; })}
        <View style={{ flexDirection: 'row', gap: 8, minHeight: 18 }} importantForAccessibility="no-hide-descendants"><View style={{ width: 34 }} />
          <View style={{ flex: 1 }}>{[-120, 0, 120, 240, 360, 480].map(m => <Text key={m} style={[font(600, 11), { position: 'absolute', top: 0, left: pos(m), transform: [{ translateX: -10 }], color: k.c['text-muted'] }]}>{m === 0 ? '12a' : m < 0 ? `${12 + m / 60}p` : `${m / 60}a`}</Text>)}</View><View style={{ width: 52 }} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 8, borderRadius: 4, backgroundColor: k.c.sleep }} /><Cap size={11.5}>{t('progressAsleepBedWake')}</Cap></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 8, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: mix(k.c.sleep, 'transparent', 0.55) }} /><Cap size={11.5}>{fill(t('progressHoursFromBed'), { n: goal / 60 })}</Cap></View>
      </View>
    </Card>
    <SectionHeader title={t('progressHeart')} aside={fill(t('progressFromSrcCap'), { src })} />
    <List>{[hrRow('hrv', finite(hrv) ? hrv : null, d.hrvBand, 'ms'), hrRow('rhr', finite(rhr) ? rhr : null, d.rhrBand, 'bpm')]}</List>
    <SectionHeader title={t('progressSources')} />
    <List>
      <ListRow title="Oura" sub={t('progressOuraSub')} icon="ring" color="sleep" value={d.sources.oura || d.demo ? (d.sources.ouraSynced ? fill(t('progressSynced'), { at: d.sources.ouraSynced }) : t('progressConnected')) : t('progressNotConnected')} />
      <ListRow title="Apple Health" sub={t('progressAppleSub')} icon="apple" color="recovery" value={d.sources.apple || d.demo ? t('progressLive') : t('progressNotConnected')} />
    </List>
  </Page>;
}
