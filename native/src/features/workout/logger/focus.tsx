import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { capitals } from '@/components/kit-style';
import { Icon } from '@/components/icon';
import { SegmentedControl } from '@/components/segmented-control';
import { t } from '@/i18n/en';
import { Tappable } from '@/components/tappable';
import type { WorkoutStore } from '@/data/workout/store';
import { clock } from '../training-data';
import { tr } from '../tr';
import { ElapsedClock, useRest } from './chrome';
import { stepWeight, type ExerciseView, type LoggerView, type SetField, type SetView } from './model';
import { LT, RpeRow, TagRow, type LoggerColors } from './parts';

/** Focus mode (`.tr-fo`): the set that is up next in large type, with steppers, set type, RPE and Log set. */
export function FocusMode({ store, view, sessionId, startedAt, col, plates, onClose, onFinish, onField, onTag, onRpe, onLog }: {
  store: WorkoutStore; view: LoggerView; sessionId: string; startedAt: number; col: LoggerColors; plates: (e: ExerciseView, s: SetView) => string | null;
  onClose: () => void; onFinish: () => void; onField: (e: ExerciseView, s: SetView, field: SetField, v: string) => void;
  onTag: (e: ExerciseView, s: SetView, t: 'warmup' | 'failure') => void; onRpe: (e: ExerciseView, s: SetView, v: number) => void; onLog: (e: ExerciseView, s: SetView) => void;
}) {
  const insets = useSafeAreaInsets(), { c, train } = col;
  const rest = useRest(store, sessionId);
  const e = view.current ? view.exercises.find(x => x.entry.id === view.current!.entryId) : undefined;
  const s = e?.sets[view.current!.index];
  // A one-side-at-a-time exercise is logged a side at a time here too: Left first, then Right, each with its own numbers.
  // The side belongs to the set it was picked on, so the next set starts on Left again.
  const key = view.current ? `${view.current.entryId}:${view.current.index}` : '';
  const [picked, setPicked] = useState({ key, side: 'left' as 'left' | 'right' });
  const side = picked.key === key ? picked.side : 'left', setSide = (v: 'left' | 'right') => setPicked({ key, side: v });
  const stepper = (label: string, icon: 'minus' | 'plus', run: () => void) => <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} onPress={run}
    style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, boxShadow: col.ring }}>
    <Icon name={icon} size={26} color={c.text} />
  </Tappable>;
  const big = (value: string, hint: boolean, unit: string, less: string, more: string, step: (d: 1 | -1) => void) =>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {stepper(less, 'minus', () => step(-1))}
      <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${value} ${unit}`}>
        <LT w={700} s={76} lh={1} tr={-0.05} num color={hint ? col.ghost : c.text}>{value}</LT>
        <LT w={600} s={13} tr={0.08} color={c['text-muted']} style={capitals}>{unit}</LT>
      </View>
      {stepper(more, 'plus', () => step(1))}
    </View>;
  let body;
  if (e && s) {
    const right = e.unilateral && side === 'right';
    const leftWeight = s.draft.weight || s.weightHint, leftReps = s.draft.reps || s.repsHint;
    const weight = right ? s.draft.rightWeight || leftWeight : leftWeight, reps = right ? s.draft.rightReps || leftReps : leftReps;
    const typedWeight = right ? !!s.draft.rightWeight : !!s.draft.weight, typedReps = right ? !!s.draft.rightReps : !!s.draft.reps;
    const wField: SetField = right ? 'rightWeight' : 'weight', rField: SetField = right ? 'rightReps' : 'reps';
    const working = e.sets.filter(x => !x.warm).length;
    const eyebrow = s.warm ? tr('trainingFocusWarm', { n: working })
      : tr(s.failure ? 'trainingFocusSetFail' : 'trainingFocusSet', { n: s.num, of: working, k: view.done + 1, total: view.total });
    const lastSet = `${s.weightHint} ${e.unit} × ${s.repsHint}`;
    const prevLine = !s.weightHint || !s.repsHint || !e.prev ? tr('trainingNotBefore')
      : s.lastRpe != null ? tr('trainingLastTimeRpe', { set: lastSet, rpe: s.lastRpe }) : tr('trainingLastTime', { set: lastSet });
    const plateLine = plates(e, s);
    body = <>
      <View style={{ marginTop: 18 }}>
        <LT w={700} s={10.5} lh={1} tr={0.14} color={train} style={capitals}>{eyebrow}</LT>
        <LT w={700} s={30} lh={1.1} tr={-0.03} lines={2} color={c.text} style={{ marginTop: 8 }}>{e.label}</LT>
        <LT w={500} s={15} num color={c['text-muted']} style={{ marginTop: 6 }}>{prevLine}</LT>
        {e.unilateral && <View style={{ marginTop: 14 }}>
          <SegmentedControl label={tr('trainingFocusSide')} value={side} onChange={setSide}
            options={[{ value: 'left', label: t('leftSide') }, { value: 'right', label: t('rightSide') }]} />
        </View>}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        {big(weight, !typedWeight, e.unit, tr('trainingLessWeight'), tr('trainingMoreWeight'), d => onField(e, s, wField, String(stepWeight(Number(weight) || 0, e.unit, d))))}
        {plateLine && <LT w={500} s={14} num lines={2} color={c['text-muted']} style={{ textAlign: 'center', marginTop: -8 }}>{`${tr('trainingPlates')} ${plateLine}`}</LT>}
        {big(reps, !typedReps, tr('trainingRepsUnit'), tr('trainingFewerReps'), tr('trainingMoreReps'), d => onField(e, s, rField, String(Math.max(0, (Number(reps) || 0) + d))))}
      </View>
      <View style={{ gap: 12, marginBottom: 16 }}>
        <TagRow s={s} col={col} onTag={t => onTag(e, s, t)} style={{ marginLeft: 0, marginTop: 0, justifyContent: 'center' }} />
        <RpeRow value={s.rpe} last={s.lastRpe} col={col} size={44} onPick={v => onRpe(e, s, v)} />
      </View>
      {rest && <View accessibilityRole="timer" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingRight: 10, paddingLeft: 16, borderRadius: 16,
        backgroundColor: c.surface, marginBottom: 12 }}>
        <LT w={700} s={22} num color={train}>{rest.done ? '0:00' : clock(Math.ceil(rest.left) * 1000)}</LT>
        <LT w={600} s={13} color={c['text-muted']} style={{ flex: 1 }}>{rest.done ? tr('trainingRestDone') : tr('trainingRestLabel', { name: e.label })}</LT>
        <Button label={tr('trainingSkip')} size="sm" variant="quiet" onPress={() => store.skipTimer()} />
      </View>}
      {e.unilateral && !right
        ? <Button label={tr('trainingFocusRightNext')} full color="training" icon="chevron-right" onPress={() => setSide('right')} style={{ minHeight: 60 }} />
        : <Button label={tr(s.warm ? 'trainingLogWarm' : 'trainingLogSet')} full color="training" icon="check" onPress={() => onLog(e, s)} style={{ minHeight: 60 }} />}
    </>;
  } else {
    body = <>
      <View style={{ flex: 1, justifyContent: 'center' }}><EmptyState icon="check" color="training" title={tr('trainingAllChecked')} description={tr('trainingAllCheckedSub')} /></View>
      <Button label={tr('trainingFinishWorkout')} full color="training" onPress={onFinish} style={{ minHeight: 60 }} />
    </>;
  }
  return <View accessibilityViewIsModal accessibilityLabel={tr('trainingFocusMode')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 7, backgroundColor: c.bg,
    paddingTop: Math.max(54, insets.top + 8), paddingHorizontal: 20, paddingBottom: Math.max(34, insets.bottom + 8) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
      <IconButton icon="close" label={tr('trainingCloseFocus')} onPress={onClose} />
      <ElapsedClock startedAt={startedAt} color={train} size={15} />
      <View style={{ width: 40 }} />
    </View>
    {body}
  </View>;
}
