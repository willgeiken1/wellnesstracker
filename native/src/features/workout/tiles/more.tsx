import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { alpha, mix } from '@/components/kit-style';
import { Tappable } from '@/components/tappable';
import type { TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { DAY_LETTERS, dayLabel, fmt, monthDay } from '../training-data';
import { trainingNav } from '../nav';
import { setText, weightText } from '../set-text';
import { tr } from '../tr';
import { B, DashLine, IconChip, K, Material, N, PrBadge, S, T, TileButton, WellBar, useTrainingData } from './parts';

const signed = (v: number, u: string) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))} ${u}`;
const LIFT_SHORT: Record<string, string> = { 'Back squat': 'Squat', 'Bench press': 'Bench', Deadlift: 'Deadlift', 'Barbell row': 'Row', 'Overhead press': 'Press' };
export const liftShort = (lift: string) => LIFT_SHORT[lift] ?? lift;

/** 6. Muscle groups: working sets (or volume) this week against a 10 to 20 set range. */
export function MusclesTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData();
  if (!data) return null;
  const tint = colors.training, lb = options.measure === 'lb', u = data.unit;
  const rows = data.muscles(lb ? 'lb' : 'sets', options.count === 'both'), sorted = rows.slice().sort((a, b) => b.v - a.v);
  const LO = 10, HI = 20, inR = rows.filter(r => r.v >= LO && r.v <= HI).length;
  const mx = lb ? Math.max(1, sorted[0].v) * 1.05 : Math.max(24, sorted[0].v + 2), total = rows.reduce((n, r) => n + r.v, 0);
  const aria = rows.map(r => `${r.m} ${lb ? `${fmt(r.v)} ${u}` : `${r.v} ${t('trainingUnitSets')}`}`).join(', ');
  const kv = (v: number) => (v / 1000).toFixed(1);
  const barW = body.w - 76 - 46 - 20;
  const bar = (r: { m: string; v: number }) => <View key={r.m} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <T w={600} s={12} lh={1} c={r.v ? colors.text : colors['text-muted']} style={{ width: 76 }}>{r.m}</T>
    <View style={{ width: barW, height: 8 }}>
      <Material kind="well" mode={mode} colors={colors} w={barW} h={8} style={{ position: 'absolute' }} />
      {r.v ? <Material kind="fill" fill={tint} mode={mode} colors={colors} w={Math.max(3, Math.min(1, r.v / mx) * barW)} h={8} style={{ position: 'absolute', opacity: !lb && (r.v < LO || r.v > HI) ? 0.55 : 1 }} /> : null}
      {lb ? null : [LO, HI].map(x => <View key={x} style={{ position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, left: x / mx * barW, backgroundColor: alpha(colors.text, 0.42) }} />)}
    </View>
    <T w={700} s={13} lh={1} c={r.v ? colors.text : colors['text-muted']} num style={{ width: 46, textAlign: 'right' }}>{lb ? `${kv(r.v)}k` : String(r.v)}</T>
  </View>;
  const key = lb ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: tint }} />
    <T w={600} s={11} lh={1} c={colors['text-muted']}>{t('trainingRangeKey')}</T>
  </View>;
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    {lb ? <><N v={`${kv(sorted[0].v)}k`} unit={u} size={30} colors={colors} /><S colors={colors} style={{ marginTop: 4 }}>{tr('trainingLeads', { m: sorted[0].m })}</S></>
      : <><N v={inR} unit={tr('trainingOf', { total: 10 })} size={32} colors={colors} /><S colors={colors} style={{ marginTop: 4 }}>{t('trainingInRange')}</S></>}
    <View style={{ marginTop: 'auto' }}>
      <Svg width={141} height={44}>
        {lb ? null : <Rect x={0} y={44 - HI / mx * 44} width={141} height={(HI - LO) / mx * 44} rx={3} fill={alpha(colors.text, 0.06)} />}
        {rows.map((r, i) => { const h = Math.max(2, r.v / mx * 44); return <Rect key={r.m} x={i * 14.3 + 1} y={44 - h} width={10} height={h} rx={3} fill={!lb && r.v >= LO && r.v <= HI ? tint : mix(tint, colors['surface-2'], 0.45)} />; })}
      </Svg>
    </View>
  </View>;
  if (size === 'M') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ gap: 9 }}>{sorted.slice(0, 4).map(bar)}</View>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 'auto' }}>
      <S colors={colors} style={{ flex: 1 }}>{lb ? tr('trainingAcrossSessions', { v: fmt(total), u }) : tr('trainingGroupsInRange', { n: inR })}</S>{key}
    </View>
  </View>;
  const sessions = data.history().filter(s => String(s.data.day) >= data.monday).length;
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>{lb ? <N v={fmt(total)} unit={u} size={26} colors={colors} /> : <N v={inR} unit={t('trainingOfTenInRange')} size={26} colors={colors} />}</View>{key}
    </View>
    <View style={{ gap: 6.5, marginTop: 'auto' }}>{rows.map(bar)}</View>
    <S colors={colors} style={{ marginTop: 8 }}>{tr(sessions === 1 ? 'trainingFinishedSessions_one' : 'trainingFinishedSessions_other', { n: sessions }) + (options.count === 'both' ? t('trainingHelpersHalf') : '')}</S>
  </View>;
}

/** 7. One lift's estimated 1RM, trended from its top sets. */
export function E1rmTile(p: TileRenderProps) {
  const { colors, size, options, body, id } = p;
  const data = useTrainingData();
  if (!data) return null;
  const lift = options.lift || 'Back squat', wk = options.range === '4' ? 4 : 8, u = data.unit, tint = colors.training;
  const cutoff = new Date(data.now - wk * 7 * 86400000);
  const h = data.liftHistory(lift).filter(x => new Date(`${x.day}T12:00:00`) >= cutoff);
  if (!h.length) return <View style={{ flex: 1 }}>
    <T w={600} s={15} c={colors.text}>{size === 'S' ? liftShort(lift) : lift}</T>
    <S colors={colors} lines={3} style={{ marginTop: 4 }}>{tr('trainingNoLiftYet', { lift: lift.toLowerCase() })}</S>
  </View>;
  const vals = h.map(x => Math.round(x.est)), le = vals[vals.length - 1], dv = le - vals[0], last = h[h.length - 1];
  const label = tr('trainingE1rmLabel', { lift, v: le, u, d: `${dv >= 0 ? t('trainingUp') : t('trainingDown')} ${Math.abs(dv)}`, wk });
  const delta = <T w={600} s={12.5} c={tint}>{signed(dv, u)}</T>;
  if (size === 'S') return <View style={{ flex: 1 }}>
    <N v={le} unit={u} size={32} colors={colors} />
    <S colors={colors} style={{ marginTop: 4 }}>{liftShort(lift)} {delta}{tr('trainingInWk', { wk })}</S>
    <View style={{ marginTop: 'auto' }}><DashLine vals={vals} w={body.w} h={50} color={tint} colors={colors} dots={false} id={`${id}S`} label={label} /></View>
  </View>;
  const labs = h.map((x, i) => i === 0 || i === h.length - 1 || (h.length > 4 && i === Math.floor(h.length / 2)) ? monthDay(x.day) : '');
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 14 }}>
    <View style={{ width: 104 }}>
      <N v={le} unit={u} size={30} colors={colors} />
      <S colors={colors} style={{ marginTop: 5 }}>{delta}</S>
      <S colors={colors}>{tr('trainingInWeeks', { wk })}</S>
      <View style={{ marginTop: 'auto' }}>
        <S colors={colors}>{t('trainingTopSet')}</S>
        <T w={600} s={13.5} c={colors.text} num>{setText(last.weight, last.reps, u)}</T>
      </View>
    </View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}><DashLine vals={vals} w={body.w - 118} h={body.h} color={tint} colors={colors} labels={labs} id={`${id}M`} label={label} /></View>
  </View>;
  return <View style={{ flex: 1 }}>
    <N v={le} unit={u} size={34} colors={colors} />
    <S colors={colors} style={{ marginTop: 5 }}>{delta}{tr('trainingInWeeksEstimate', { wk })}</S>
    <View style={{ marginTop: 10 }}><DashLine vals={vals} w={body.w} h={106} color={tint} colors={colors} labels={labs} ylab id={`${id}L`} label={label} /></View>
    <View style={{ marginTop: 'auto' }}>
      {h.slice(-3).reverse().map((x, i) => <View key={x.day + i} style={{ height: 26, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair }}>
        <S colors={colors} style={{ flex: 1 }}>{dayLabel(x.day)}</S>
        <T w={600} s={12.5} c={colors.text} num>{setText(x.weight, x.reps, u)}</T>
        <N v={fmt(x.est)} unit={u} size={13.5} colors={colors} style={{ minWidth: 70, justifyContent: 'flex-end' }} />
      </View>)}
    </View>
  </View>;
}

/** 8. Recent workouts with records marked. */
export function RecentTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData();
  if (!data) return null;
  const R = data.recent(size === 'L' ? 4 : 3), u = data.unit;
  if (!R.length) return <S colors={colors} lines={3}>{t('trainingNoWorkoutsYet')}</S>;
  const num = (w: typeof R[number]) => options.value === 'min' ? w.min : options.value === 'sets' ? w.sets : w.volume;
  const unit = options.value === 'min' ? t('trainingUnitMin') : options.value === 'sets' ? t('trainingUnitSets') : u;
  const shown = (w: typeof R[number]) => options.value === 'lb' || !options.value ? fmt(w.volume) : String(num(w));
  const aria = (w: typeof R[number]) => tr('trainingRecentLabel', { name: w.name, day: dayLabel(w.day), min: w.min, sets: w.sets, v: fmt(w.volume), u }) + (w.pr ? t('trainingNewRecordSuffix') : '');
  if (size === 'S') { const w = R[0];
    return <Tappable dim="tile" style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={aria(w)} onPress={() => trainingNav.detail(w.id)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T w={600} s={15} c={colors.text} style={{ flexShrink: 1 }}>{w.name}</T>{w.pr ? <PrBadge colors={colors} /> : null}</View>
      <S colors={colors} style={{ marginTop: 2 }}>{dayLabel(w.day)}</S>
      <N v={shown(w)} unit={unit} size={26} colors={colors} style={{ marginTop: 'auto' }} />
      <S colors={colors} style={{ marginTop: 4 }}>{options.value === 'lb' || !options.value ? `${w.min} min · ${w.sets} ${t('trainingUnitSets')}` : `${fmt(w.volume)} ${u}`}</S>
    </Tappable>; }
  const mx = Math.max(1, ...R.map(num));
  return <View style={{ flex: 1, justifyContent: size === 'M' ? 'flex-end' : 'flex-start' }}>
    {R.map((w, i) => <Tappable dim="tile" key={w.id} accessibilityRole="button" accessibilityLabel={aria(w)} onPress={() => trainingNav.detail(w.id)}
      style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair, ...(size === 'M' ? { height: 38, flexDirection: 'row', alignItems: 'center', gap: 10 } : { paddingVertical: 9, gap: 6 }) }}>
      {size === 'M' ? <>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T w={600} s={14} c={colors.text} style={{ flexShrink: 1 }}>{w.name}</T>{w.pr ? <PrBadge colors={colors} /> : null}</View>
          <S colors={colors} size={11.5}>{dayLabel(w.day)}</S>
        </View>
        <N v={shown(w)} unit={unit} size={15} colors={colors} />
      </> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T w={600} s={14} c={colors.text} style={{ flex: 1 }}>{w.name}<T w={500} s={11.5} c={colors['text-muted']}>{` · ${dayLabel(w.day)}`}</T></T>
          <N v={shown(w)} unit={unit} size={15} colors={colors} />
        </View>
        <WellBar frac={num(w) / mx} h={6} w={body.w} colors={colors} mode={mode} tint={colors.training} />
        {w.pr ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><PrBadge colors={colors} /><S colors={colors} size={11.5}>{w.pr}</S></View> : null}
      </>}
    </Tappable>)}
  </View>;
}

/** 9. Records, newest first. */
export function RecordsTile(p: TileRenderProps) {
  const { colors, size, options, id } = p;
  const data = useTrainingData();
  if (!data) return null;
  const list = data.records().slice(0, 3), u = data.unit, warn = colors.warning;
  if (!list.length) return <S colors={colors} lines={3}>{t('trainingNoRecordsYet')}</S>;
  const top = options.show === 'top';
  const est = (r: typeof list[number]) => fmt(r.e1rm);
  if (size === 'S') { const r = list[0];
    return <Tappable dim="tile" style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${r.exercise}, ${setText(r.weight, r.reps, u)}`} onPress={() => trainingNav.exercise(r.exercise)}>
      <T w={600} s={15} c={colors.text}>{r.exercise}</T>
      <S colors={colors}>{dayLabel(r.day)}</S>
      <View style={{ marginTop: 'auto' }}>{top ? <N v={weightText(r.weight)} unit={`${u} × ${r.reps}`} size={28} colors={colors} /> : <N v={est(r)} unit={u} size={30} colors={colors} />}</View>
      <S colors={colors} style={{ marginTop: 4 }}>{top ? tr('trainingEstShort', { v: est(r), u }) : tr('trainingEstFrom', { set: setText(r.weight, r.reps, u) })}</S>
    </Tappable>; }
  const L = size === 'L';
  return <View style={{ flex: 1 }}>
    <View style={{ marginTop: L ? 0 : 'auto' }}>
      {list.map((r, i) => <Tappable dim="tile" key={r.exercise} accessibilityRole="button" accessibilityLabel={`${r.exercise}, ${setText(r.weight, r.reps, u)}, ${dayLabel(r.day)}`} onPress={() => trainingNav.exercise(r.exercise)}
        style={{ height: L ? 74 : 38, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair }}>
        {L ? <IconChip name="trophy" color={warn} icon={18} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={600} s={14} c={colors.text}>{r.exercise}</T>
          <S colors={colors} size={11.5}>{(L ? `${top ? tr('trainingEstShort', { v: est(r), u }) : setText(r.weight, r.reps, u)} · ` : '') + dayLabel(r.day)}</S>
        </View>
        {L ? <DashLine vals={data.liftHistory(r.exercise).map(x => x.est)} w={74} h={30} color={warn} colors={colors} dots={false} id={`${id}${i}`} label={r.exercise} /> : null}
        {top ? <T w={700} s={15} c={colors.text} num style={{ minWidth: 86, textAlign: 'right' }}>{setText(r.weight, r.reps, u)}</T>
          : <N v={est(r)} unit={u} size={15} colors={colors} style={{ minWidth: 56, justifyContent: 'flex-end' }} />}
      </Tappable>)}
    </View>
    {L ? <S colors={colors} lines={2} style={{ marginTop: 'auto' }}>{t('trainingEpleyFoot')}</S> : null}
  </View>;
}

/** 10. Consistency: plan days hit per week, or the last four weeks by day. */
export function StreakTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData();
  if (!data) return null;
  const tint = colors.training, W = data.weekHits(), per = data.plan().perWeek;
  let streak = 0;
  for (let i = W.length - 2; i >= 0 && W[i][1] >= per; i--) streak++;
  const avg = Math.round(W.reduce((n, w) => n + w[1], 0) / W.length * 10) / 10;
  const days = data.days28(), trained = days.filter(d => (d ?? 0) > 0).length, mxd = Math.max(1, ...days.map(d => d ?? 0));
  const off = mode === 'light' ? mix(tint, colors.bg, 0.12) : mix(tint, colors['surface-2'], 0.14);
  const weekCols = (cw: number, ch: number, gap: number, labels?: boolean) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
    {W.map((w, k) => { const cur = k === W.length - 1;
      return <View key={w[0]} style={{ alignItems: 'center', gap: 5 }}>
        <View style={{ flexDirection: 'column-reverse', gap }}>
          {Array.from({ length: per }, (_, j) => j < w[1]
            ? <Material key={j} kind="fill" fill={tint} mode={mode} colors={colors} w={cw} h={ch} radius={3} />
            : <View key={j} style={{ width: cw, height: ch, borderRadius: 3, backgroundColor: cur ? 'transparent' : off, borderWidth: cur ? 1.5 : 0, borderColor: tint }} />)}
        </View>
        {labels ? <K colors={colors} size={9} track={0} color={cur ? tint : undefined}>{cur ? t('trainingNow') : w[0].split(' ')[1]}</K> : null}
      </View>; })}
  </View>;
  const cal = (cell: number, gap: number, nums?: boolean, align?: boolean) => {
    const lead = 0, rows = 4, cw = (body.w - gap * 6) / 7;
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {days.slice(0, rows * 7 - lead).map((m, k) => { const today = k === days.findLastIndex(d => d !== null);
        const fill = m && !today ? mix(tint, colors['surface-2'], 0.35 + 0.65 * (m / mxd)) : undefined;
        return <View key={k} style={{ width: cw, height: cell, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: today ? 'transparent' : m === null ? 'transparent' : fill ?? mix(tint, colors['surface-2'], 0.08), borderWidth: today ? 1.5 : 0, borderColor: tint }}>
          {nums && m ? <T w={700} s={10.5} c={today ? tint : colors['on-accent']} num>{String(m)}</T> : null}
        </View>; })}
      {align ? null : null}
    </View>;
  };
  const aria = options.by === 'days' ? tr('trainingDaysLabel', { n: trained }) : tr('trainingStreakLabel', { n: streak });
  const byDays = options.by === 'days';
  if (size === 'S') return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    {byDays ? <><N v={trained} unit={t('trainingUnitDays')} size={30} colors={colors} /><S colors={colors} style={{ marginTop: 4 }}>{t('trainingTrainedIn4')}</S><View style={{ marginTop: 'auto' }}>{cal(10, 3)}</View></>
      : <><N v={streak} unit={streak === 1 ? t('trainingUnitWeek') : t('trainingUnitWeeks')} size={32} colors={colors} /><S colors={colors} style={{ marginTop: 4 }}>{t('trainingOnPlanInARow')}</S><View style={{ marginTop: 'auto' }}>{weekCols(12, 7, 3)}</View></>}
  </View>;
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 18 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ width: 96 }}>
      {byDays ? <><N v={trained} unit={t('trainingUnitDays')} size={30} colors={colors} /><S colors={colors} lines={2} style={{ marginTop: 4 }}>{t('trainingTrainedInLast4')}</S></>
        : <><N v={streak} unit={t('trainingUnitWeeks')} size={30} colors={colors} /><S colors={colors} lines={2} style={{ marginTop: 4 }}>{t('trainingOnPlanInARow')}</S>
          <S colors={colors} style={{ marginTop: 'auto' }}><B colors={colors}>{String(avg)}</B>{t('trainingAWeek')}</S></>}
    </View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>{byDays ? cal(19, 4) : weekCols(20, 11, 3, true)}</View>
  </View>;
  const total = days.reduce<number>((n, d) => n + (d ?? 0), 0);
  return <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    {byDays ? <><N v={trained} unit={t('trainingUnitDays')} size={34} colors={colors} /><S colors={colors} style={{ marginTop: 5 }}>{tr('trainingTrainedMin', { min: fmt(total) })}</S></>
      : <><N v={streak} unit={t('trainingUnitWeeks')} size={34} colors={colors} /><S colors={colors} style={{ marginTop: 5 }}>{tr('trainingAvgLine', { avg })}</S></>}
    <View style={{ marginTop: 'auto' }}>
      {byDays ? <View style={{ flexDirection: 'row', gap: 5, marginBottom: 6 }}>{DAY_LETTERS.map((l, i) => <K key={i} colors={colors} size={9.5} track={0.04} style={{ flex: 1, textAlign: 'center' }}>{l}</K>)}</View> : null}
      {byDays ? cal(32, 5, true, true) : weekCols(28, 22, 4, true)}
    </View>
    {byDays ? null : <S colors={colors} style={{ marginTop: 10 }}>{tr('trainingThisWeekHits', { n: W[W.length - 1][1], per, name: data.plan().next?.name ?? '' })}</S>}
  </View>;
}

/** 11. Cardio this week. */
export function CardioTile(p: TileRenderProps) {
  const { colors, mode, size, options } = p;
  const data = useTrainingData();
  if (!data) return null;
  const list = data.cardioWeek(), tint = colors.training;
  const min = list.reduce((n, c) => n + c.min, 0), mi = list.reduce((n, c) => n + c.mi, 0);
  const lead = options.lead === 'mi';
  const big = lead ? <N v={mi.toFixed(1)} unit={t('trainingUnitMi')} size={30} colors={colors} /> : <N v={min} unit={t('trainingUnitMin')} size={30} colors={colors} />;
  const second = lead ? `${min} ${t('trainingUnitMin')}` : `${mi.toFixed(1)} ${t('trainingUnitMi')}`;
  const log = <TileButton label={t('trainingLog')} icon="plus" small ghost w={76} a11y={t('trainingLogCardio')} tint={tint} colors={colors} mode={mode} onPress={() => trainingNav.cardio()} />;
  const count = tr(list.length === 1 ? 'trainingSessions_one' : 'trainingSessions_other', { n: list.length });
  if (size === 'S') return <View style={{ flex: 1 }}>
    {big}<S colors={colors} style={{ marginTop: 4 }}>{`${count} · ${second}`}</S>
    <View style={{ marginTop: 'auto' }}>{log}</View>
  </View>;
  return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
    <View style={{ width: 104 }}>{big}<S colors={colors} style={{ marginTop: 4 }}>{count}</S><S colors={colors}>{second}</S><View style={{ marginTop: 'auto' }}>{log}</View></View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      {list.length ? list.slice(0, 2).map((c, i) => <View key={c.id} style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair }}>
        <IconChip name="heart" color={colors.danger} size={32} icon={16} radius={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={600} s={13.5} c={colors.text}>{c.name}</T>
          <S colors={colors} size={11.5}>{monthDay(c.day) + (c.mi ? ` · ${c.mi.toFixed(1)} ${t('trainingUnitMi')}` : '')}</S>
        </View>
        <N v={c.min} unit={t('trainingUnitMin')} size={14} colors={colors} />
      </View>) : <S colors={colors} lines={2}>{t('trainingNoCardioYet')}</S>}
    </View>
  </View>;
}
