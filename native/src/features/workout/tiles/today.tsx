import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '@/auth/provider';
import { mix } from '@/components/kit-style';
import type { TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { clockMs } from '@/features/settings/clock';
import { useClockUnit } from '@/features/settings/prefs';
import { clock, DAY_LETTERS } from '../training-data';
import { startTraining } from '../start-workout';
import { trainingNav } from '../nav';
import { tr } from '../tr';
import { setText } from '../set-text';
import { Cells, Gauge, Glow, IconChip, K, LiveDot, Material, N, S, B, T, TileButton, useNow, useTrainingData } from './parts';

/** 1. The workout going now, or the next plan day to start. */
export function SessionTile(p: TileRenderProps) {
  const { colors, mode, body, size, options, editing, preview } = p;
  const data = useTrainingData(), { repository } = useAuth(), ck = useClockUnit();
  const live = data?.live() ?? null;
  const now = useNow(!!live && !editing && !preview);
  const tint = colors.training, W = body.w;
  if (!data || !live) {
    const next = data?.plan().next ?? null;
    const name = next?.name || t('trainingEmptyWorkout');
    return <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <Glow w={p.frame.w} h={p.frame.h} color={tint} />
      <View>
        <K colors={colors}>{t('trainingNothingInProgress')}</K>
        <T w={700} s={20} lh={1.2} c={colors.text} style={{ marginTop: 8 }}>{name}</T>
        {next ? <S colors={colors} style={{ marginTop: 3 }}>{tr('trainingNextLine', { when: data!.today === next.last ? t('trainingTomorrow') : t('trainingToday'), n: next.exercises.length, min: data!.estimate(next) })}</S> : null}
      </View>
      <TileButton label={tr('trainingStartName', { name })} icon="play" small={size === 'S'} w={size === 'S' ? W : W} tint={tint} colors={colors} mode={mode}
        onPress={() => repository && startTraining(repository, next?.routineId)} />
    </View>;
  }
  const elapsed = clock(Math.max(0, now - live.startedAt));
  const cellsLabel = tr('trainingSetsDoneLabel', { done: live.done, total: live.total });
  const resume = (small: boolean, w: number, h?: number) => <TileButton label={small ? t('trainingResume') : t('trainingResumeWorkout')} icon="play" small={small} w={w} h={h}
    tint={tint} colors={colors} mode={mode} a11y={tr('trainingResumeName', { name: live.name })} onPress={() => trainingNav.logger()} />;
  if (size === 'S') {
    return <View style={{ flex: 1 }}>
      <LiveDot label={t('trainingLive')} colors={colors} />
      <T w={600} s={15} lh={1.25} c={colors.text} style={{ marginTop: 9 }}>{live.name}</T>
      <T w={700} s={30} lh={1} tr={-0.04} c={colors.text} num style={{ marginTop: 4 }}>{elapsed}</T>
      <S colors={colors} style={{ marginTop: 3, marginBottom: 8 }}><B colors={colors}>{live.done}</B>{tr('trainingOfSets', { total: live.total })}</S>
      <Cells states={live.matrix} w={W} h={8} gap={2} r={2} color={tint} colors={colors} mode={mode} label={cellsLabel} />
      <View style={{ marginTop: 'auto' }}>{resume(true, 96)}</View>
    </View>;
  }
  const head = <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <LiveDot label={t('trainingInProgress')} colors={colors} />
    <View style={{ flex: 1 }} />
    <S colors={colors}>{tr('trainingStarted', { time: clockMs(live.startedAt, ck) })}</S>
  </View>;
  const cells = <Cells states={live.matrix} w={W} h={11} gap={3} r={3} groups={live.groups} color={tint} colors={colors} mode={mode} label={cellsLabel} />;
  if (size === 'M') {
    return <View style={{ flex: 1 }}>
      {head}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700} s={19} lh={1.15} tr={-0.02} c={colors.text}>{live.name}</T>
          <S colors={colors} style={{ marginTop: 3 }}><B colors={colors}>{live.done}</B>{tr('trainingOfSetsDone', { total: live.total })}</S>
        </View>
        <T w={700} s={36} lh={1} tr={-0.04} c={colors.text} num>{elapsed}</T>
      </View>
      <View style={{ marginTop: 12 }}>{cells}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
        {live.next ? <View style={{ flex: 1, minWidth: 0 }}>
          <S colors={colors}>{t('trainingNext')}</S>
          <T w={600} s={13.5} lh={1.25} c={colors.text} num>{`${live.next.name} · ${setText(live.next.weight, live.next.reps, data.unit)}`}</T>
        </View> : <S colors={colors} style={{ flex: 1 }}>{t('trainingAllSetsDoneShort')}</S>}
        {resume(true, 104)}
      </View>
    </View>;
  }
  const under = options.show === 'exs'
    ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 }}>
      {live.exercises.map(e => <View key={e.entryId} style={{ width: (W - 14) / 2, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.done >= e.total ? tint : 'transparent', borderWidth: e.done >= e.total ? 0 : e.done ? 2 : 1.5, borderColor: e.done ? tint : colors['hair-2'] }} />
        <T w={600} s={12.5} lh={1.2} c={colors.text} style={{ flex: 1 }}>{e.name}</T>
        <T w={700} s={12} c={colors['text-muted']} num>{`${e.done}/${e.total}`}</T>
      </View>)}
    </View>
    : live.next ? <Material kind="plate" mode={mode} colors={colors} w={W} h={54}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}>
        <IconChip name="up-next" color={tint} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={600} s={14.5} lh={1.25} c={colors.text}>{tr('trainingNextSet', { name: live.next.name, n: live.next.set })}</T>
          <S colors={colors} style={{ fontVariant: ['tabular-nums'] }}>{setText(live.next.weight, live.next.reps, data.unit) + (live.next.same ? t('trainingSameAsLast') : '')}</S>
        </View>
      </View>
    </Material> : <S colors={colors}>{t('trainingAllSetsDone')}</S>;
  return <View style={{ flex: 1 }}>
    <Glow w={p.frame.w} h={p.frame.h} color={tint} />
    {head}
    <T w={700} s={24} lh={1.15} tr={-0.025} c={colors.text} style={{ marginTop: 10 }}>{live.name}</T>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
      <View style={{ flex: 1 }}>
        <T w={700} s={44} lh={1} tr={-0.04} c={colors.text} num>{elapsed}</T>
        <S colors={colors} style={{ marginTop: 4 }}>{t('trainingElapsed')}</S>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <N v={live.done} unit={tr('trainingOf', { total: live.total })} size={22} colors={colors} />
        <S colors={colors} style={{ marginTop: 4 }}>{t('trainingSetsDone')}</S>
      </View>
    </View>
    <View style={{ marginTop: 12 }}>{cells}</View>
    <View style={{ marginTop: 12 }}>{under}</View>
    <View style={{ marginTop: 'auto' }}>{resume(false, W, 44)}</View>
  </View>;
}

/** 2. Today's training minutes (or this workout's sets) against the daily goal. */
export function GoalTile(p: TileRenderProps) {
  const { colors, size, options } = p;
  const data = useTrainingData();
  if (!data) return null;
  const live = data.live(), sets = options.track === 'sets';
  const v = sets ? live?.done ?? 0 : data.todayMin(), g = sets ? live?.total || 18 : data.goalMin(), u = sets ? t('trainingUnitSets') : t('trainingUnitMin');
  const label = tr(sets ? 'trainingGoalSetsLabel' : 'trainingGoalMinLabel', { v, g });
  const gauge = (sz: number, fs: number) => <Gauge frac={v / g} size={sz} sw={sz > 100 ? 8 : 7} color={colors.training} colors={colors} fs={fs} us={10.5} value={String(v)} unit={u} label={label} />;
  const where = sets ? tr('trainingInName', { name: live?.name ?? t('trainingThisWorkout') }) : t('trainingTodaySuffix');
  if (size === 'S') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
    {gauge(100, 24)}
    <S colors={colors} style={{ marginTop: -6 }}>{tr('trainingOfGoal', { g, u }) + where}</S>
  </View>;
  const left = Math.max(0, g - v), goal = data.goalMin();
  const week = data.week().days, met = week.filter(d => d.min >= goal).length;
  const C = 2 * Math.PI * 9;
  return <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
    {gauge(112, 26)}
    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
      <N v={v} unit={tr('trainingOfGoal', { g, u })} size={22} colors={colors} />
      <S colors={colors} lines={2} style={{ marginTop: 4 }}>{left ? (sets ? tr('trainingToGoIn', { left, u, name: live?.name ?? t('trainingThisWorkout') }) : tr('trainingToGoWeek', { left, u, met })) : t('trainingGoalMetToday')}</S>
      {sets ? null : <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        {week.map((d, i) => { const f = Math.min(1, d.min / goal);
          return <View key={d.date} style={{ alignItems: 'center', gap: 5 }}>
            <Svg width={24} height={24}>
              <Circle cx={12} cy={12} r={9} fill="none" stroke={mix(colors.training, colors['surface-2'], 0.16)} strokeWidth={3.5} />
              {f > 0 ? <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.training} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} rotation={-90} origin="12, 12" opacity={f < 1 ? 0.75 : 1} /> : null}
              {f >= 1 ? <Path d="M8.4 12.2l2.4 2.3 4.8-4.8" fill="none" stroke={colors.training} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /> : null}
            </Svg>
            <K colors={colors} size={9.5} color={d.today ? colors.training : undefined}>{DAY_LETTERS[i]}</K>
          </View>; })}
      </View>}
    </View>
  </View>;
}
