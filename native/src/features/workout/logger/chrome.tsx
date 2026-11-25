import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { alpha, mix } from '@/components/kit-style';
import { ProgressBar } from '@/components/progress-bar';
import { Tappable } from '@/components/tappable';
import type { WorkoutStore } from '@/data/workout/store';
import { clock, fmt } from '../training-data';
import { restBuzz } from '../haptics';
import { tr } from '../tr';
import { LT, type LoggerColors } from './parts';
import type { LoggerView } from './model';

/** The elapsed clock ticks on its own, so the sets don't redraw every second. */
export function ElapsedClock({ startedAt, color, size = 13 }: { startedAt: number; color: string; size?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()); }, 1000);
    return () => clearInterval(id);
  }, []);
  return <LT w={700} s={size} num color={color} style={{ textAlign: 'center' }}>{clock(now - startedAt)}</LT>;
}

/** The top bar (`.tr-nb`): minimize back to Training, the workout's name and clock, Finish. */
export function TopBar({ name, startedAt, past, col, onBack, onFinish }: {
  name: string; startedAt: number; past?: string; col: LoggerColors; onBack: () => void; onFinish: () => void;
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8 }}>
    <View style={{ flex: 1, alignItems: 'flex-start' }}>
      <Tappable dim="text" testID="logger-back" accessibilityRole="button" accessibilityLabel={tr('trainingMinimize')} onPress={onBack}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingRight: 8 }}>
        <Icon name="tr-down" size={22} color={col.c.accent} />
        <LT w={500} s={17} tr={-0.01} color={col.c.accent}>{tr('trainingTitle')}</LT>
      </Tappable>
    </View>
    <View style={{ maxWidth: 170, alignItems: 'center' }} accessibilityRole="header">
      <LT w={700} s={15.5} lh={1.15} tr={-0.015} color={col.c.text}>{name}</LT>
      {past ? <LT w={700} s={13} num color={col.train}>{past}</LT>
        : <View accessible accessibilityLabel={tr('trainingElapsedTime')}><ElapsedClock startedAt={startedAt} color={col.train} /></View>}
    </View>
    <View style={{ flex: 1, alignItems: 'flex-end' }}>
      <Tappable dim="fill" testID="finish-button" accessibilityRole="button" accessibilityLabel={tr('trainingFinish')} onPress={onFinish} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
        style={{ minHeight: 34, paddingHorizontal: 16, marginRight: 6, borderRadius: 999, justifyContent: 'center', backgroundColor: col.train }}>
        <LT w={700} s={15} tr={-0.01} color={col.c['on-accent']}>{tr('trainingFinish')}</LT>
      </Tappable>
    </View>
  </View>;
}

/** The quick jump strip (`.tr-jump`): one chip per exercise, the open one marked, kept in view. */
export function JumpStrip({ view, openId, col, onJump }: { view: LoggerView; openId: string | null; col: LoggerColors; onJump: (id: string) => void }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null), xs = useRef<Record<string, { x: number; w: number }>>({}), width = useRef(0), at = useRef(0);
  const ids = view.exercises.map(e => e.entry.id).join();
  useEffect(() => {
    const box = openId ? xs.current[openId] : undefined;
    if (!box || !ref.current) return;
    const index = view.exercises.findIndex(e => e.entry.id === openId);
    const left = box.x - 16 - (index > 0 ? 28 : 0), right = box.x + box.w + 16 - width.current;
    const x = at.current > left ? left : at.current < right ? right : at.current;
    if (x !== at.current) ref.current.scrollTo({ x: Math.max(0, x), animated: true });
  }, [openId, ids, view.exercises]);
  if (view.exercises.length < 2) return null;
  const { c, train } = col;
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={tr('trainingJump')}
    onLayout={e => { width.current = e.nativeEvent.layout.width; }} onScroll={e => { at.current = e.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}
    contentContainerStyle={{ gap: 6, paddingTop: 4, paddingBottom: 2, paddingHorizontal: 16 }} style={{ flexGrow: 0, marginTop: 4 }}>
    {view.exercises.map((e, i) => {
      const cu = view.current?.entryId === e.entry.id && !e.all, on = e.entry.id === openId;
      return <Tappable key={e.entry.id} dim="fill" accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={tr(e.all ? 'trainingJumpDone' : cu ? 'trainingJumpNow' : 'trainingJumpSets', { name: e.label, done: e.done, total: e.total })}
        onLayout={ev => { xs.current[e.entry.id] = { x: ev.nativeEvent.layout.x, w: ev.nativeEvent.layout.width }; }} onPress={() => onJump(e.entry.id)}
        hitSlop={{ top: 6, bottom: 6 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, maxWidth: 170, paddingLeft: 9, paddingRight: 13, borderRadius: 999,
          backgroundColor: on ? mix(train, c.surface, 0.15) : c.surface,
          boxShadow: on ? `inset 0px 0px 0px 1.5px ${alpha(train, 0.55)}` : col.ring }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
          backgroundColor: e.all ? alpha(train, 0.16) : 'transparent', boxShadow: cu ? `inset 0px 0px 0px 1.5px ${train}` : undefined }}>
          {e.all ? <Icon name="check" size={14} color={train} /> : <LT w={700} s={11.5} num color={cu ? train : c['text-muted']}>{i + 1}</LT>}
        </View>
        <LT w={600} s={13} color={on ? train : e.all ? c['text-muted'] : c.text} style={{ flexShrink: 1 }}>{e.label}</LT>
      </Tappable>;
    })}
  </ScrollView>;
}

/** The strip card (`.tr-strip`): sets checked off, volume, what's next, and Focus. */
export function StatusCard({ view, col, onFocus }: { view: LoggerView; col: LoggerColors; onFocus: () => void }) {
  const { c } = col, next = view.current ? view.exercises.find(e => e.entry.id === view.current!.entryId) : undefined;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 8, borderRadius: 20,
    backgroundColor: col.k.cardBg, boxShadow: col.k.cardEdge }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <LT w={700} s={20} tr={-0.025} num color={c.text}>{view.done}<LT w={600} s={13} color={c['text-muted']}>{` ${tr('trainingOfSetsSmall', { total: view.total })}`}</LT></LT>
      <LT w={500} s={12.5} num color={c['text-muted']} style={{ marginTop: 2, marginBottom: 8 }}>
        {next ? tr('trainingVolumeNext', { vol: fmt(view.volume), unit: view.unit, name: next.label }) : tr('trainingVolumeOnly', { vol: fmt(view.volume), unit: view.unit })}
      </LT>
      <ProgressBar value={view.total ? view.done / view.total : 0} color="training" label={tr('trainingSetsDoneLabel', { done: view.done, total: view.total })} />
    </View>
    {view.total > 0 && <Button label={tr('trainingFocus')} accessibilityLabel={tr('trainingFocusLabel')} size="sm" variant="secondary" color="training" icon="tr-focus" onPress={onFocus} />}
  </View>;
}

/** Seconds left on the running rest, ticking; null when no rest is running for this session. */
export function useRest(store: WorkoutStore, sessionId: string) {
  const timer = store.timer();
  const mine = timer && timer.sessionId === sessionId ? timer : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!mine) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [mine]);
  const left = mine ? Math.max(0, (mine.endAt - now) / 1000) : 0, done = !!mine && left <= 0;
  useEffect(() => { if (done) restBuzz(store.repo); }, [done, mine?.setId, store.repo]);
  if (!mine) return null;
  return { timer: mine, left, done, total: Math.max(1, mine.duration) };
}

/** The rest bar (`.tr-rest`) pinned above the bottom: time left, which exercise, −15, +15 and Skip. */
export function RestBar({ store, sessionId, name, bottom, col, onExpand }: {
  store: WorkoutStore; sessionId: string; name: string; bottom: number; col: LoggerColors; onExpand: () => void;
}) {
  const rest = useRest(store, sessionId);
  useEffect(() => {
    if (!rest?.done) return;
    const id = setTimeout(() => { if (store.timer()?.setId === rest.timer.setId) store.skipTimer(); }, 3200);
    return () => clearTimeout(id);
  }, [rest?.done, rest?.timer.setId, store]);
  if (!rest) return null;
  const { c, train } = col, f = rest.done ? 0 : rest.left / rest.total;
  const button = (label: string, spoken: string, run: () => void, skip = false) => <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={spoken} onPress={run}
    style={{ minWidth: 48, height: 44, paddingHorizontal: skip ? 14 : 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: skip ? train : alpha(c.text, 0.07) }}>
    <LT w={700} s={14} num color={skip ? c['on-accent'] : c.text}>{label}</LT>
  </Tappable>;
  return <View testID="rest-bar" accessibilityRole="timer" accessibilityLabel={tr('trainingRestTimer')}
    style={{ position: 'absolute', left: 12, right: 12, bottom, zIndex: 6, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 68,
      paddingVertical: 8, paddingLeft: 6, paddingRight: 8, borderRadius: 22, overflow: 'hidden', backgroundColor: col.dark ? c['surface-2'] : c.surface, boxShadow: col.k.lift }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${f * 100}%`, backgroundColor: alpha(train, 0.18) }} />
    <Tappable dim="text" accessibilityRole="button" accessibilityLabel={tr('trainingExpandRest')} onPress={onExpand}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 6, borderRadius: 16 }}>
      <LT w={700} s={26} lh={1} tr={-0.03} num color={c.text} style={{ minWidth: 62 }}>{rest.done ? '0:00' : clock(Math.ceil(rest.left) * 1000)}</LT>
      <LT w={600} s={12.5} lh={1.3} color={rest.done ? train : c['text-muted']} style={{ flexShrink: 1 }}>{rest.done ? tr('trainingRestDone') : tr('trainingRestLabel', { name })}</LT>
    </Tappable>
    {button('−15', tr('trainingLess15'), () => { if (rest.left <= 15) store.skipTimer(); else store.adjustTimer(-15); })}
    {button('+15', tr('trainingMore15'), () => store.adjustTimer(15))}
    {button(tr('trainingSkip'), tr('trainingSkip'), () => store.skipTimer(), true)}
  </View>;
}
