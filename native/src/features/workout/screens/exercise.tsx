import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { List, ListFooter, ListRow } from '@/components/list-row';
import { NavBar, NavButton } from '@/components/nav-bar';
import { SectionHeader } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { KitText } from '@/components/themed-text';
import { font, mix, useKit } from '@/components/kit-style';
import type { Unit } from '@/core/workout/rules';
import { tokens } from '@/design/tokens';
import { showToast } from '@/features/shell/toast';
import { actionSheet } from '../action-sheet';
import { setText, weightText } from '../set-text';
import { clock, dayLabel, equipmentName, fmt, monthDay, muscleGroup } from '../training-data';
import { tr, trCount } from '../tr';
import { useTrainingData } from '../training-viz';
import { exLabel } from '../logger/model';
import { trainingNav } from '../nav';
import { axisLabel, chartScale, exerciseHistory, type LiftSession } from './model';
import { EyebrowLine, Page } from './page';
import { Tappable } from '@/components/tappable';

const RESTS = [60, 90, 120, 150, 180];
type Mode = 'top' | 'vol';

/** An exercise's history (`exercise-detail`): estimated 1RM, a chart of top sets or volume, best sets and every session. */
export function ExerciseDetail() {
  const { name: raw } = useLocalSearchParams<{ name?: string }>();
  const data = useTrainingData(), k = useKit();
  const [mode, setMode] = useState<Mode>('top');
  const name = raw || '', label = exLabel(name);
  const editRest = () => data && actionSheet({ title: tr('trainingRestForName', { name: label }),
    actions: RESTS.map(sec => ({ label: clock(sec * 1000), run: () => { data.workout.setRest(name, { ...data.workout.rest(name), seconds: sec }); showToast(tr('trainingRestSet', { name: label, rest: clock(sec * 1000) }), { color: 'training' }); } })) });
  const nav = <NavBar back="" title={label} right={<NavButton label={tr('trainingEdit')} onPress={editRest} />} />;
  const hist = data && name ? exerciseHistory(data, name) : [];
  if (!data || !hist.length) return <Page nav={nav}>
    <EmptyState title={tr('trainingNoHistory', { name: label })} description={tr('trainingNoHistorySub')} icon="workouts" color="training" />
  </Page>;
  const u = data.unit, ex = data.workout.preferences().exercise(name);
  const groups = [...new Set([ex.main, ...ex.helpers].map(m => muscleGroup(m)).filter(Boolean))].slice(0, 2) as string[];
  const bestEst = hist.reduce((p, x) => x.est > p.est ? x : p), heavy = hist.reduce((p, x) => x.top.w > p.top.w || (x.top.w === p.top.w && x.top.r > p.top.r) ? x : p);
  const bestVol = hist.reduce((p, x) => x.volume > p.volume ? x : p), last = hist[hist.length - 1];
  const active = data.workout.active();
  const live = !!active && data.workout.entries(active.id).some(e => String(e.data.exercise).toLowerCase() === name.toLowerCase());
  const rest = clock(data.workout.rest(name).seconds * 1000);
  return <Page testID="exercise-detail" nav={nav}>
    <View style={{ marginTop: 8 }}>
      <EyebrowLine color={k.c['text-muted']}>{[...groups, equipmentName(ex.equipment)].join(' · ')}</EyebrowLine>
      <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header" style={{ marginTop: 4, marginBottom: 2 }}>{label}</KitText>
    </View>
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flexShrink: 1 }} accessible accessibilityLabel={`${tr('trainingEst1rm')}, ${fmt(bestEst.est)} ${u}`}>
          <EyebrowLine color={k.c['text-muted']}>{tr('trainingEst1rm')}</EyebrowLine>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
            <KitText weight={700} size={44} lineHeight={1} tracking={-0.045} numeric>{fmt(bestEst.est)}</KitText>
            <KitText weight={600} size={15} color="text-muted" style={{ paddingBottom: 5 }}>{u}</KitText>
          </View>
          <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 4 }}>{tr('trainingFromOn', { set: setText(bestEst.best.w, bestEst.best.r, u), day: monthDay(bestEst.day) })}</KitText>
        </View>
        <Badge label={tr('trainingEstimate')} color="training" />
      </View>
      <View style={{ marginTop: 16, marginBottom: 14 }}>
        <SegmentedControl label={tr('trainingChartMode')} value={mode} onChange={setMode} options={[{ value: 'top', label: tr('trainingTopAnd1rm') }, { value: 'vol', label: tr('trainingVolume') }]} />
      </View>
      <LiftChart hist={hist} mode={mode} unit={u} />
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
        {mode === 'vol' ? <LegendKey kind="blocks" label={tr('trainingLegendBlocks')} /> : <>
          <LegendKey kind="line" label={tr('trainingTopSet')} />
          <LegendKey kind="dash" label={tr('trainingEst1rm')} />
        </>}
      </View>
    </Card>
    <ListFooter>{tr('trainingEstChartFoot')}</ListFooter>
    <SectionHeader title={tr('trainingBestSets')} />
    <List>
      <ListRow title={tr('trainingHeaviest')} sub={dayLabel(heavy.day)} value={setText(heavy.top.w, heavy.top.r, u)} strong />
      <ListRow title={tr('trainingBestEst')} sub={tr('trainingDayFrom', { day: dayLabel(bestEst.day), set: pair(bestEst.best) })} value={`${fmt(bestEst.est)} ${u}`} strong />
      <ListRow title={tr('trainingBestVolume')} sub={tr('trainingDayDot', { day: dayLabel(bestVol.day), rest: trCount('trainingSetCount', bestVol.sets.length) })} value={`${fmt(bestVol.volume)} ${u}`} strong />
    </List>
    <SectionHeader title={tr('trainingHistory')} aside={trCount('trainingSessions', hist.length)} />
    <List>{hist.slice().reverse().map(x => <ListRow key={x.id} title={dayLabel(x.day)} sub={tr('trainingHistSub', { sets: trCount('trainingSetCount', x.sets.length), v: `${fmt(x.est)} ${u}` })}
      value={setText(x.top.w, x.top.r, u)} onPress={() => trainingNav.detail(x.id)} />)}</List>
    <View style={{ marginTop: 8 }}>
      {live ? <Button label={tr('trainingBackToWorkout')} variant="secondary" color="training" full onPress={() => trainingNav.logger()} />
        : <Button label={tr('trainingLastRest', { set: setText(last.top.w, last.top.r, u), rest })} variant="quiet" full onPress={editRest} />}
    </View>
  </Page>;
}

const pair = (s: { w: number; r: number }) => s.w > 0 ? `${weightText(s.w)} × ${s.r}` : `× ${s.r}`;

function LegendKey({ kind, label }: { kind: 'line' | 'dash' | 'blocks'; label: string }) {
  const k = useKit(), c = k.c.training;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    {kind === 'blocks' ? <Svg width={10} height={14}><Rect x={1} y={0} width={8} height={6} rx={2} fill={c} /><Rect x={1} y={8} width={8} height={6} rx={2} fill={c} /></Svg>
      : <Svg width={20} height={4}><Line x1={kind === 'dash' ? 1 : 0} x2={kind === 'dash' ? 19 : 18} y1={2} y2={2} stroke={c} strokeWidth={kind === 'dash' ? 2 : 3}
        strokeDasharray={kind === 'dash' ? '4 4' : undefined} strokeLinecap="round" /></Svg>}
    <KitText weight={600} size={12.5} color="text-muted">{label}</KitText>
  </View>;
}

/** The mockup's lift chart: top set line over a shaded area with the dashed estimated 1RM, or one column of set blocks per session. Tap to read a session. */
function LiftChart({ hist, mode, unit }: { hist: LiftSession[]; mode: Mode; unit: Unit }) {
  const k = useKit(), [W, setW] = useState(329), [pick, setPick] = useState<number | null>(null);
  const H = 150, PR = 34, n = hist.length, vol = mode === 'vol', c = k.c.training, muted = k.c['text-muted'];
  const top = hist.map(x => vol ? x.volume : x.top.w), est = hist.map(x => Math.round(x.est));
  const { lo, sp, lines } = chartScale(vol ? [...top, 0] : [...top, ...est], vol);
  const X = (i: number) => 14 + (W - PR - 28) * (n > 1 ? i / (n - 1) : 0.5), Y = (v: number) => 6 + (H - 12) * (1 - (v - lo) / sp);
  const path = (v: number[]) => 'M' + v.map((y, i) => `${X(i).toFixed(1)} ${Y(y).toFixed(1)}`).join('L');
  const small = { fontFamily: tokens.font.bodyStrong, fontSize: font(600, 10.5).fontSize };
  const bold = { fontFamily: tokens.font.heading, fontSize: font(700, 11).fontSize, fontWeight: '700' as const };
  const ex1 = X(n - 1), ey = Y(est[n - 1]), ty = Y(top[n - 1]);
  const bw = Math.min(22, (W - PR - 28) / Math.max(1, n - 1) * 0.56);
  const press = (x: number) => { let best = 0; hist.forEach((_, i) => { if (Math.abs(X(i) - x) < Math.abs(X(best) - x)) best = i; }); setPick(best); };
  const p = pick != null ? hist[pick] : null;
  return <View onLayout={e => setW(Math.round(e.nativeEvent.layout.width))}>
    <Tappable dim="none" accessibilityRole="image" accessibilityLabel={tr(vol ? 'trainingChartVolLabel' : 'trainingChartTopLabel', { n })} onPress={e => press(e.nativeEvent.locationX)}>
      <Svg width={W} height={H + 18}>
        {lines.map(g => <Line key={`g${g}`} x1={0} x2={W - PR + 4} y1={Y(g)} y2={Y(g)} stroke={k.c.hair} />)}
        {lines.map(g => <SvgText key={`t${g}`} x={W} y={Y(g) + 3.5} textAnchor="end" fill={muted} {...small}>{axisLabel(g)}</SvgText>)}
        {vol ? hist.map((x, i) => {
          let y = Y(0);
          const lastCol = i === n - 1, cx = X(i);
          const blocks = x.sets.map((s, j) => { const bh = (H - 12) * (s.w * s.r) / sp; y -= bh;
            return <Rect key={j} x={cx - bw / 2} y={y + 2} width={bw} height={Math.max(1, bh - 2)} rx={3} fill={lastCol ? c : mix(c, k.c['surface-2'], 0.42)} />; });
          return <G key={x.id}>{blocks}{lastCol ? <SvgText x={cx} y={y - 4} textAnchor="middle" fill={k.c.text} {...bold}>{fmt(top[i])}</SvgText> : null}</G>;
        }) : <>
          <Path d={path(est)} fill="none" stroke={c} strokeWidth={1.75} strokeDasharray="3 4" strokeLinecap="round" opacity={0.8} />
          <Path d={`${path(top)}L${X(n - 1).toFixed(1)} ${Y(lo)}L${X(0)} ${Y(lo)}Z`} fill={c} opacity={0.08} />
          <Path d={path(top)} fill="none" stroke={c} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {top.map((y, i) => <Circle key={i} cx={X(i)} cy={Y(y)} r={i === n - 1 ? 4.5 : 2.75} fill={i === n - 1 ? c : k.c.surface} stroke={c} strokeWidth={i === n - 1 ? 0 : 1.75} />)}
          <Circle cx={ex1} cy={ey} r={3} fill={k.c.surface} stroke={c} strokeWidth={1.5} strokeDasharray="2 1.6" />
          <SvgText x={ex1 - 8} y={ey - 7} textAnchor="end" fill={muted} {...bold}>{tr('trainingEstTag', { v: est[n - 1] })}</SvgText>
          <SvgText x={ex1 + 5} y={ty + 24} textAnchor="end" fill={k.c.text} {...bold}>{tr('trainingWeightUnit', { v: weightText(hist[n - 1].top.w), u: unit })}</SvgText>
        </>}
        {[...new Set([0, Math.floor((n - 1) / 2), n - 1])].map(i => <SvgText key={`d${i}`} x={X(i)} y={H + 14} fill={muted} {...small}
          textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}>{monthDay(hist[i].day)}</SvgText>)}
        {pick != null ? <Line x1={X(pick)} x2={X(pick)} y1={4} y2={H} stroke={muted} strokeWidth={1} opacity={0.5} /> : null}
      </Svg>
    </Tappable>
    {p ? <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: Math.max(60, Math.min(W - 60, X(pick!))), transform: [{ translateX: '-50%' }],
      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: k.pill, boxShadow: k.lift, alignItems: 'center' }}>
      <KitText weight={600} size={12} lineHeight={1.3} style={{ color: k.pillInk }}>{monthDay(p.day)}</KitText>
      <KitText weight={700} size={13} numeric style={{ color: k.pillInk }}>
        {vol ? `${fmt(p.volume)} ${unit}` : tr('trainingTipTop', { set: setText(p.top.w, p.top.r, unit), v: fmt(p.est) })}</KitText>
    </View> : null}
  </View>;
}
