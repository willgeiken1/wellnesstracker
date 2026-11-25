import { Pressable, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { useAuth } from '@/auth/provider';
import { alpha, mix } from '@/components/kit-style';
import { tokens } from '@/design/tokens';
import { plate } from '@/features/tiles/depth';
import { TileSurface } from '@/features/tiles/tile-surface';
import type { TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { DAY_LETTERS, dayLabel, fmt, monthDay, type PlanDayView } from '../training-data';
import { startTraining } from '../start-workout';
import { trainingNav } from '../nav';
import { setText } from '../set-text';
import { tr } from '../tr';
import { B, IconChip, K, Material, N, Pips, S, T, TileButton, WellBar, useTrainingData } from './parts';

const signed = (v: number, u: string) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))} ${u}`;

/** 3. This week: plan days done, a capsule per day, and volume against last week. */
export function WeekTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData();
  if (!data) return null;
  const tint = colors.training, lb = options.by === 'lb', u = data.unit;
  const wk = data.week(), plan = data.plan(), per = plan.perWeek, done = Math.min(wk.done, per), live = data.live();
  const planName = data.planName() || t('trainingPlanDefault');
  if (size === 'S') return <View style={{ flex: 1 }}>
    <N v={done} unit={tr('trainingOf', { total: per })} size={34} colors={colors} />
    <S colors={colors} style={{ marginTop: 4 }}>{t('trainingPlanDaysDone')}</S>
    <View style={{ marginTop: 10 }}><Pips done={done} total={per} w={22} colors={colors} mode={mode} tint={tint} /></View>
    <S colors={colors} style={{ marginTop: 'auto' }}><B colors={colors}>{lb ? `${fmt(wk.volume)}` : `${wk.min}`}</B>{lb ? ` ${u}` : ` ${t('trainingUnitMin')}`}{t('trainingThisWeekSuffix')}</S>
    <S colors={colors}>{lb ? tr('trainingLastWeekVol', { v: fmt(wk.lastVolume), u }) : tr('trainingPlanDaysToGo', { n: Math.max(0, per - done) })}</S>
  </View>;
  const vals = wk.days.map(d => lb ? d.volume : d.min), goal = data.goalMin();
  const mx = lb ? Math.max(1, ...vals) * 1.08 : Math.max(75, Math.max(...vals) + 8), H = size === 'L' ? 70 : 62, cw = size === 'L' ? 30 : 26;
  const aria = `${lb ? t('trainingVolume') : t('trainingMinutes')} ${t('trainingThisWeekSuffix').trim()}: ${wk.days.map(d => `${dayLabel(d.date).split(',')[0]} ${vals[wk.days.indexOf(d)] ? (lb ? `${fmt(d.volume)} ${u}` : `${d.min} min`) : t('trainingRest')}`).join(', ')}`;
  const caps = <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
    {wk.days.map((d, i) => {
      const v = vals[i], h = Math.round(v / mx * H), liveToday = d.today && !!live;
      return <View key={d.date} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5 }}>
        <T w={700} s={11} lh={1} c={colors['text-muted']} num style={{ height: 11 }}>{v ? (lb ? `${(v / 1000).toFixed(1)}k` : String(v)) : ' '}</T>
        <Material kind="well" mode={mode} colors={colors} w={cw} h={H} radius={cw / 2} style={{ overflow: 'hidden', borderRadius: cw / 2 }}>
          {v ? (liveToday
            ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(cw, h), borderRadius: cw / 2, backgroundColor: alpha(tint, 0.42), borderWidth: 1.5, borderColor: tint }} />
            : <Material kind="fill" fill={tint} mode={mode} colors={colors} w={cw} h={Math.max(cw, h)} radius={cw / 2} style={{ position: 'absolute', left: 0, bottom: 0 }} />) : null}
          {lb ? null : <View style={{ position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, bottom: Math.round(goal / mx * H), backgroundColor: colors.text, opacity: 0.55 }} />}
        </Material>
        <T w={700} s={10.5} lh={1} c={d.today ? tint : colors['text-muted']}>{DAY_LETTERS[i]}</T>
        {size === 'L' ? <T w={600} s={9.5} lh={1} c={colors['text-muted']} style={{ opacity: 0.85, maxWidth: '100%' }}>{d.name || (d.future ? ' ' : t('trainingRest'))}</T> : null}
      </View>;
    })}
  </View>;
  if (size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
    <View style={{ width: 112 }}>
      <N v={done} unit={tr('trainingOf', { total: per })} size={30} colors={colors} />
      <S colors={colors} style={{ marginTop: 4 }}>{t('trainingPlanDays')}</S>
      <View style={{ marginTop: 8 }}><Pips done={done} total={per} w={16} colors={colors} mode={mode} tint={tint} /></View>
      <View style={{ marginTop: 'auto' }}>
        <N v={lb ? fmt(wk.volume) : wk.min} unit={lb ? u : t('trainingUnitMin')} size={17} colors={colors} />
        <S colors={colors} style={{ marginTop: 3 }}>{lb ? tr('trainingOnLastWeek', { v: signed(wk.volume - wk.lastVolume, u) }) : t('trainingThisWeekSuffix').trim()}</S>
      </View>
    </View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>{caps}</View>
  </View>;
  const dv = wk.volume - wk.lastVolume, mxv = Math.max(wk.volume, wk.lastVolume, 1) * 1.06;
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} s={15} lh={1.25} c={colors.text}>{planName}</T>
        <S colors={colors} style={{ marginTop: 2 }}>{tr('trainingPlanDaysDoneOf', { done, per })}</S>
      </View>
      <Pips done={done} total={per} w={18} colors={colors} mode={mode} tint={tint} />
    </View>
    <View style={{ marginTop: 12 }}>{caps}</View>
    <View style={{ marginTop: 'auto' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <N v={fmt(wk.volume)} unit={u} size={20} colors={colors} />
          <S colors={colors} style={{ marginTop: 3 }}>{tr(dv >= 0 ? 'trainingVolumeOver' : 'trainingVolumeUnder', { v: fmt(Math.abs(dv)), u })}</S>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <N v={wk.min} unit={t('trainingUnitMin')} size={20} colors={colors} />
          <S colors={colors} style={{ marginTop: 3 }}>{t('trainingTime')}</S>
        </View>
      </View>
      <View style={{ marginTop: 9 }}>
        <WellBar frac={wk.volume / mxv} h={8} w={body.w} colors={colors} mode={mode} tint={tint} />
        <View style={{ position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, backgroundColor: colors.text, opacity: 0.7, left: wk.lastVolume / mxv * body.w }} />
      </View>
      <S colors={colors} style={{ marginTop: 6, textAlign: 'right' }}>{tr('trainingLastWeekVol', { v: fmt(wk.lastVolume), u })}</S>
    </View>
  </View>;
}
export const weekMeta = () => {
  const d = new Date(), mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() + 6) % 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const md = (x: Date) => monthDay(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  return tr('trainingRange', { a: md(mon), b: mon.getMonth() === sun.getMonth() ? String(sun.getDate()) : md(sun) });
};

/** 4. Up next: the next plan day, its exercises and targets. */
export function NextTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData(), { repository } = useAuth();
  if (!data) return null;
  const next = data.plan().next, tint = colors.training;
  if (!next) return <View style={{ flex: 1, justifyContent: 'space-between' }}>
    <S colors={colors} lines={3}>{t('trainingNoPlanYet')}</S>
    <TileButton label={t('trainingSetUpPlan')} small w={body.w > 200 ? 150 : body.w} ghost tint={tint} colors={colors} mode={mode} onPress={() => trainingNav.plan()} />
  </View>;
  const start = (small: boolean, w: number) => <TileButton label={small ? t('trainingStart') : tr('trainingStartName', { name: next.name })} icon="play" small={small} w={w} h={40}
    a11y={tr('trainingStartName', { name: next.name })} tint={tint} colors={colors} mode={mode} onPress={() => repository && startTraining(repository, next.routineId)} />;
  const est = data.estimate(next);
  const line = (e: PlanDayView['exercises'][number]) => options.show === 'sets' ? `${e.sets} × ${e.repMin}${e.repMax !== e.repMin ? `–${e.repMax}` : ''}` : setText(e.weight, e.repMax, data.unit);
  const summary = tr('trainingDaySummary', { n: next.exercises.length, sets: next.sets });
  if (size === 'S') return <View style={{ flex: 1 }}>
    <T w={700} s={19} lh={1.15} tr={-0.02} c={colors.text} lines={2}>{next.name}</T>
    <S colors={colors} style={{ marginTop: 4 }}>{summary}</S>
    <S colors={colors}>{tr('trainingAbout', { min: est })}</S>
    <View style={{ marginTop: 'auto' }}>{start(true, 86)}</View>
  </View>;
  if (size === 'M') return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} s={18} lh={1.15} tr={-0.02} c={colors.text}>{next.name}</T>
        <S colors={colors} style={{ marginTop: 3 }}>{`${summary} · ${tr('trainingAboutLower', { min: est })}`}</S>
      </View>
      {start(true, 86)}
    </View>
    <View style={{ marginTop: 'auto' }}>
      {next.exercises.slice(0, 3).map((e, i) => <View key={i} style={{ height: 23, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair }}>
        <S colors={colors} style={{ flex: 1, color: colors.text, fontFamily: tokens.font.bodyStrong }}>{e.name}</S>
        <S colors={colors} style={{ fontVariant: ['tabular-nums'] }}>{line(e)}</S>
      </View>)}
    </View>
  </View>;
  const prefs = data.workout.preferences();
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconChip name="workouts" color={tint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} s={18} lh={1.15} tr={-0.02} c={colors.text}>{next.name}</T>
        <S colors={colors} style={{ marginTop: 3 }}>{`${summary} · ${tr('trainingAboutLower', { min: est })}`}</S>
      </View>
    </View>
    <View style={{ marginTop: 10 }}>
      {next.exercises.slice(0, 7).map((e, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={e.name} onPress={() => trainingNav.exercise(e.name)}
        style={({ pressed }) => ({ height: 25, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hair })}>
        <K colors={colors} size={11} style={{ width: 14, letterSpacing: 0 }}>{String(i + 1)}</K>
        <T w={600} s={13} c={colors.text} style={{ flex: 1 }}>{e.name}</T>
        <S colors={colors} size={11.5}>{muscleName(prefs.exercise(e.name).main)}</S>
        <T w={700} s={13} c={colors.text} num style={{ minWidth: 72, textAlign: 'right' }}>{line(e)}</T>
      </Pressable>)}
    </View>
    <View style={{ marginTop: 'auto' }}>{start(false, body.w)}</View>
  </View>;
}
const MUSCLE_NAMES: Record<string, string> = { chest: 'Chest', lats: 'Back', upperBack: 'Back', traps: 'Back', lowerBack: 'Lower back', frontDelts: 'Shoulders', sideDelts: 'Shoulders', rearDelts: 'Shoulders', biceps: 'Biceps', forearms: 'Forearms', triceps: 'Triceps', quads: 'Quads', adductors: 'Adductors', hamstrings: 'Hamstrings', glutes: 'Glutes', abductors: 'Glutes', calves: 'Calves', abs: 'Core', obliques: 'Core' };
export const muscleName = (m?: string) => (m && MUSCLE_NAMES[m]) || '';

/** 5. Plan days: every day of the plan, the one going now and the next one marked. */
export function PlanTile(p: TileRenderProps) {
  const { colors, mode, size, options, body } = p;
  const data = useTrainingData(), { repository } = useAuth();
  if (!data) return null;
  const plan = data.plan(), tint = colors.training, live = data.live();
  let list = plan.days.slice();
  if (!list.length) return <View style={{ flex: 1, justifyContent: 'space-between' }}>
    <S colors={colors} lines={3}>{t('trainingNoPlanYet')}</S>
    <TileButton label={t('trainingSetUpPlan')} small ghost w={Math.min(150, body.w)} tint={tint} colors={colors} mode={mode} onPress={() => trainingNav.plan()} />
  </View>;
  if (options.order === 'last') list.sort((a, b) => (b.kind === 'live' ? '9' : b.last ?? '') .localeCompare(a.kind === 'live' ? '9' : a.last ?? ''));
  const kl = (d: PlanDayView) => d.kind === 'live' ? t('trainingInProgress') : d.kind === 'next' ? t('trainingUpNext') : tr('trainingDayN', { n: d.index + 1 });
  if (size === 'S') {
    const R = 40, cx = 70, cy = 46, seg = 360 / plan.days.length, rad = Math.PI / 180;
    const center = live?.name ?? plan.next?.name ?? '';
    return <View style={{ flex: 1, alignItems: 'center' }}>
      <Svg width={140} height={94} accessibilityLabel={tr('trainingRotationLabel', { n: plan.days.length, name: plan.next?.name ?? '' })}>
        {plan.days.map((d, i) => {
          const a0 = -90 + i * seg + 4, a1 = -90 + (i + 1) * seg - 4;
          const x0 = cx + R * Math.cos(a0 * rad), y0 = cy + R * Math.sin(a0 * rad), x1 = cx + R * Math.cos(a1 * rad), y1 = cy + R * Math.sin(a1 * rad);
          const doneWeek = !!d.last && d.last >= data.monday && d.kind !== 'live';
          return <Path key={d.routineId} d={`M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`} fill="none"
            stroke={d.kind === 'live' ? tint : doneWeek ? mix(tint, colors.surface, 0.55) : mix(tint, colors['surface-2'], 0.14)} strokeWidth={d.kind ? 10 : 8} strokeLinecap="round" strokeDasharray={d.kind === 'next' ? '3 3' : undefined} />;
        })}
        <SvgText x={70} y={45} textAnchor="middle" fill={colors.text} fontFamily={tokens.font.heading} fontSize={14}>{center}</SvgText>
        <SvgText x={70} y={60} textAnchor="middle" fill={colors['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={10.5}>{live ? t('trainingInProgressLower') : t('trainingUpNextLower')}</SvgText>
      </Svg>
      <S colors={colors} style={{ marginTop: 'auto' }}>{t('trainingNextColon')}<B colors={colors}>{plan.next?.name ?? ''}</B></S>
    </View>;
  }
  const L = size === 'L', cols = L ? 2 : 3, ch = L ? 66 : 52, gap = 8, cw = (body.w - gap * (cols - 1)) / cols;
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, marginTop: L ? 0 : 'auto' }}>
      {list.slice(0, L ? 6 : 6).map(d => <Pressable key={d.routineId} accessibilityRole="button" accessibilityLabel={`${d.name}, ${kl(d)}${d.last && d.kind !== 'live' ? `, ${tr('trainingLastOn', { day: dayLabel(d.last) })}` : ''}`}
        onPress={() => repository && (d.kind === 'live' ? trainingNav.logger() : startTraining(repository, d.routineId))}
        style={({ pressed }) => ({ width: cw, height: ch, borderRadius: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <TileSurface spec={plate(colors, mode, 14)} width={cw} height={ch} />
        <View style={{ flex: 1, justifyContent: 'center', gap: 3, paddingHorizontal: 11, borderRadius: 14,
          backgroundColor: d.kind === 'next' ? alpha(tint, mode === 'light' ? 0.1 : 0.14) : undefined, borderWidth: d.kind === 'live' ? 1.5 : 0, borderColor: tint }}>
          <K colors={colors} size={9.5} color={d.kind ? tint : undefined}>{kl(d)}</K>
          <T w={600} s={13.5} lh={1.2} c={colors.text}>{d.name}</T>
          {L ? <>
            <S colors={colors} size={11.5}>{tr('trainingDaySummary', { n: d.exercises.length, sets: d.sets })}</S>
            <S colors={colors} size={11.5}>{d.kind === 'live' ? t('trainingStartedToday') : d.last ? tr('trainingLastOn', { day: dayLabel(d.last) }) : t('trainingNotYet')}</S>
          </> : <S colors={colors} size={11.5}>{d.kind === 'live' ? t('trainingToday') : d.last ? monthDay(d.last) : t('trainingNotYet')}</S>}
        </View>
      </Pressable>)}
    </View>
    {L ? <S colors={colors} style={{ marginTop: 'auto', paddingTop: 8 }}>{tr(plan.mode === 'fixed' ? 'trainingPlanFootFixed' : 'trainingPlanFoot', { n: plan.perWeek })}</S> : null}
  </View>;
}
