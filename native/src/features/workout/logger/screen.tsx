import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { useLayoutMotion } from '@/components/layout-motion';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { ShellToast, showToast } from '@/features/shell/toast';
import { actionSheet } from '../action-sheet';
import { FinishSheet } from '../finish';
import { tick } from '../haptics';
import { trainingNav } from '../nav';
import { SheetHost } from '../primitives';
import { tr, trCount } from '../tr';
import { useWorkout } from '../use-workout';
import { useRestLiveActivity } from '../live-activity';
import { RestBar, JumpStrip, StatusCard, TopBar } from './chrome';
import { FocusMode } from './focus';
import { checkSet, deleteSet, exLabel, discardSession, loggerView, noteOpenKey, plateText, removeExercise, rpeKey, type ExerciseView, type SetView } from './model';
import { ExerciseFooter, ExerciseHeader, LT, NoteField, SetCard, useLoggerColors, type SetHandlers } from './parts';

/** Leave the logger for the Training tab; the workout keeps going. */
export function leaveLogger() {
  if (router.canGoBack()) router.back();
  else router.replace('/workouts');
}

/** The live logger (`workout-active`): starts or resumes the session named by the route, then logs it. */
export function TrainingLogger() {
  const { store } = useWorkout();
  const { routine, id, day } = useLocalSearchParams<{ id?: string; day?: string; routine?: string }>();
  const [error, setError] = useState(false), [pastId, setPastId] = useState<string | null>(null), started = useRef(false);
  const col = useLoggerColors();
  // The rest timer follows the person onto the Lock Screen and into the Dynamic Island.
  useRestLiveActivity();
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !store || started.current) return;
      started.current = true;
      try {
        if (id) store.beginEditing(id);
        else if (day) setPastId(store.startPast(day).id);
        else store.start(routine);
      } catch { setError(true); }
    });
    return () => { active = false; };
  }, [store, routine, id, day]);
  const session = id ? store?.repo.get('sessions', id) : day ? (pastId ? store?.repo.get('sessions', pastId) : undefined) : store?.active();
  if (store && session && session.deleted_at === null) return <Logger key={session.id} store={store} session={session} />;
  return <View style={{ flex: 1, backgroundColor: col.c.bg, justifyContent: 'center', padding: 16 }}>
    {/* With nothing to log into (no workout store, or the workout could not start) the page still offers a way out. */}
    {(error || !store) && <EmptyState icon="workouts" color="training" title={tr('trainingNoWorkout')} action={{ label: tr('trainingCloseWorkout'), onPress: leaveLogger }} />}
  </View>;
}

function Logger({ store, session }: { store: WorkoutStore; session: Row }) {
  useKeepAwake('workout');
  const insets = useSafeAreaInsets(), col = useLoggerColors(), { reduceMotion } = useTheme(), glide = useLayoutMotion();
  const past = store.pastMode(session.id), editing = session.data.finished_at != null;
  const view = loggerView(store, session);
  const [xo, setXo] = useState<string | null | 'none'>(null);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState(false), [reorder, setReorder] = useState(false), [finishSheet, setFinishSheet] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null), cardY = useRef<Record<string, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ids = view.exercises.map(e => e.entry.id);
  const followed = view.current?.entryId ?? null;
  const openId = xo === 'none' ? null : xo && ids.includes(xo) ? xo : followed;
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, reduceMotion ? 0 : ms)); };
  const scrollTo = (entryId: string) => later(() => {
    const y = cardY.current[entryId];
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 10), animated: !reduceMotion });
  }, 60);
  const run = (fn: () => void) => { try { fn(); } catch { showToast(tr('trainingSaveError'), { color: 'warning' }); } };

  const key = (e: ExerciseView, s: SetView, field: 'weight' | 'reps') => `${e.entry.id}:${s.index}:${field}`;
  const withEdits = (e: ExerciseView, s: SetView): SetView => {
    const w = edits[key(e, s, 'weight')], r = edits[key(e, s, 'reps')];
    return w == null && r == null ? s : { ...s, draft: { ...s.draft, weight: w ?? s.draft.weight, reps: r ?? s.draft.reps } };
  };
  const field = (e: ExerciseView, s: SetView, f: 'weight' | 'reps', v: string) => {
    if (s.done) setEdits(m => ({ ...m, [key(e, s, f)]: v }));
    else run(() => store.editDraft(e.entry.id, s.index, { [f]: v }));
  };
  const endEdit = (e: ExerciseView, s: SetView) => {
    if (!s.done) return;
    const w = edits[key(e, s, 'weight')], r = edits[key(e, s, 'reps')];
    setEdits(m => { const n = { ...m }; delete n[key(e, s, 'weight')]; delete n[key(e, s, 'reps')]; return n; });
    if (w == null && r == null) return;
    run(() => store.editDraft(e.entry.id, s.index, { ...(w != null && w !== s.draft.weight ? { weight: w } : {}), ...(r != null && r !== s.draft.reps ? { reps: r } : {}) }));
  };
  const check = (e: ExerciseView, s: SetView) => {
    const wasOpen = openId === e.entry.id;
    let result: ReturnType<typeof checkSet> = 'invalid';
    run(() => { result = checkSet(store, e, s); });
    if (result === 'invalid') { showToast(tr('trainingSetInvalid'), { color: 'warning' }); return; }
    setOpenSet(null);
    if (result !== 'done') return;
    tick(store.repo);
    const after = loggerView(store, session), ex = after.exercises.find(x => x.entry.id === e.entry.id), set = ex?.sets[s.index];
    if (ex && set?.pr) showToast(tr('trainingNewPr', { name: ex.label, set: `${set.draft.weight} ${ex.unit} × ${set.draft.reps}` }), { color: 'warning' });
    const nextId = after.current?.entryId;
    if (wasOpen && ex?.all && nextId && nextId !== e.entry.id) {
      setXo(e.entry.id);
      later(() => { glide(); setXo(null); scrollTo(nextId); }, 420);
    }
  };
  const tag = (e: ExerciseView, s: SetView, t: 'warmup' | 'failure') => run(() => store.editDraft(e.entry.id, s.index, { tag: (t === 'warmup' ? s.warm : s.failure) ? null : t }));
  const rpe = (e: ExerciseView, s: SetView, v: number) => store.repo.localSave(rpeKey(e.entry.id, s.index), s.rpe === v ? null : v);
  const plates = (e: ExerciseView, s: SetView) => {
    if (!e.barbell || s.done) return null;
    const w = Number(s.draft.weight || s.weightHint);
    if (!w) return null;
    const prefs = store.preferences();
    return plateText(w, e.unit, prefs.machine(e.name).bar_weight, prefs.plateSet(e.unit));
  };
  const handlers = (e: ExerciseView): SetHandlers => ({
    onField: (s, f, v) => field(e, s, f, v), onEnd: s => endEdit(e, s), onCheck: s => check(e, s), onTag: (s, t) => tag(e, s, t), onRpe: (s, v) => rpe(e, s, v),
    onToggleOpen: s => { glide(); setOpenSet(o => o === `${e.entry.id}:${s.index}` ? null : `${e.entry.id}:${s.index}`); },
    onMore: (s, label) => actionSheet({ title: s.warm ? tr('trainingWarmTitle', { name: e.label }) : tr('trainingSetTitle', { name: e.label, n: s.num }), actions: [
      { label: tr('trainingDeleteSet'), destructive: true, run: () => run(() => {
        glide(); setOpenSet(null);
        const undo = deleteSet(store, e.entry.id, s.index);
        showToast(tr('trainingSetDeleted'), { color: 'training', action: { label: tr('trainingUndo'), onAction: () => run(undo) } });
      }) },
    ] }),
  });
  const toggle = (id: string) => {
    glide();
    if (openId === id) setXo('none');
    else { setXo(id); scrollTo(id); }
  };
  const exerciseMore = (e: ExerciseView) => actionSheet({ title: e.label, actions: [
    { label: tr('trainingExHistory'), run: () => trainingNav.exercise(e.name) },
    { label: e.note == null ? tr('trainingAddNote') : tr('trainingRemoveNote'), run: () => e.note == null ? store.repo.localSave(noteOpenKey(e.entry.id), true) : saveNote(e, null) },
    ...(past ? [] : [{ label: tr('trainingRestFor'), run: () => trainingNav.rest(e.entry.id) }]),
    { label: tr('trainingReplace'), run: () => trainingNav.picker({ mode: 'replace', entry: e.entry.id }) },
    { label: tr('trainingReorderTitle'), run: () => setReorder(true) },
    { label: tr('trainingRemoveExercise'), destructive: true, run: () => run(() => {
      glide();
      const undo = removeExercise(store, e.entry.id);
      showToast(tr('trainingRemoved', { name: e.label }), { color: 'training', action: { label: tr('trainingUndo'), onAction: () => run(undo) } });
    }) },
  ] });
  const saveNote = (e: ExerciseView, text: string | null) => run(() => {
    const row = store.repo.get('entries', e.entry.id);
    if (!row) return;
    store.repo.atomic(() => {
      store.repo.save('entries', { ...row.data, notes: text == null ? null : text.trim().slice(0, 2000) || null }, row.id);
      store.repo.localSave(noteOpenKey(row.id), text != null);
    });
  });
  const discard = () => actionSheet({ title: tr('trainingDiscardTitle'), message: tr('trainingDiscardBody'), cancel: tr('trainingKeepLogging'), actions: [
    { label: tr('trainingDiscardWorkout'), destructive: true, run: () => run(() => {
      discardSession(store, session.id); leaveLogger(); showToast(tr('trainingDiscarded'));
    }) },
  ] });
  const finish = () => {
    if (past || editing) { setFinishSheet(true); return; }
    if (!view.done) {
      actionSheet({ title: tr('trainingNoneChecked'), message: tr('trainingNoneCheckedBody'), cancel: tr('trainingKeepLogging'),
        actions: [{ label: tr('trainingDiscardWorkout'), destructive: true, run: () => run(() => { discardSession(store, session.id); leaveLogger(); showToast(tr('trainingDiscarded')); }) }] });
      return;
    }
    const go = () => run(() => {
      store.finish(session.id, { startedAt: Number(session.data.started_at), finishedAt: Date.now(), notes: String(session.data.notes ?? '') });
      router.replace({ pathname: '/workout/summary', params: { id: session.id, just: '1' } });
    });
    const left = view.total - view.done;
    if (left) actionSheet({ title: trCount('trainingUnchecked', left), message: tr('trainingUncheckedBody'), cancel: tr('trainingKeepLogging'),
      actions: [{ label: tr('trainingFinishWorkout'), run: go }] });
    else go();
  };
  const addExercise = () => trainingNav.picker({ mode: 'add' });
  const name = String(session.data.name ?? '') || tr('trainingEmptyWorkout');

  return <View style={{ flex: 1, backgroundColor: col.c.bg, paddingTop: insets.top }}>
    <View testID="logger-header" style={{ paddingBottom: 6 }}>
      <TopBar name={name} startedAt={Number(session.data.started_at)} past={past ? String(session.data.day) : undefined} col={col} onBack={leaveLogger} onFinish={finish} />
      {!reorder && <JumpStrip view={view} openId={openId} col={col} onJump={id => { glide(); setXo(id); scrollTo(id); }} />}
    </View>
    <ScrollView ref={scroll} testID="logger-exercises" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 132 + insets.bottom }}>
      {reorder ? <Reorder store={store} exercises={view.exercises} col={col} onDone={() => setReorder(false)} /> : <>
        {view.exercises.length > 0 ? <StatusCard view={view} col={col} onFocus={() => setFocus(true)} />
          : <View style={{ marginTop: 12, borderRadius: 20, padding: 16, backgroundColor: col.k.cardBg, boxShadow: col.k.cardEdge }}>
            <EmptyState icon="workouts" color="training" title={tr('trainingEmptyWorkout')} description={tr('trainingEmptyWorkoutSub')} />
          </View>}
        {view.exercises.map((e, ei) => {
          const open = e.entry.id === openId, cu = view.current?.entryId === e.entry.id;
          const h = handlers(e);
          return <View key={e.entry.id} testID={`logger-card-${ei}`} onLayout={ev => { cardY.current[e.entry.id] = ev.nativeEvent.layout.y; }}
            style={{ marginTop: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: col.k.cardBg, boxShadow: col.k.cardEdge }}>
            <ExerciseHeader e={e} ei={ei} open={open} current={cu} col={col} onToggle={() => toggle(e.entry.id)} onMore={() => exerciseMore(e)} />
            {open && <View>
              {e.note != null && <NoteField value={e.note} name={e.label} col={col} onSave={text => saveNote(e, text)} />}
              <View style={{ gap: 8, paddingTop: 2, paddingHorizontal: 10 }}>
                {e.sets.map(s => {
                  const shown = withEdits(e, s), isCur = cu && view.current?.index === s.index;
                  return <SetCard key={s.index} e={e} s={shown} ei={ei} current={isCur} open={!s.done || openSet === `${e.entry.id}:${s.index}`}
                    plates={isCur ? plates(e, shown) : null} col={col} h={h} />;
                })}
              </View>
              <ExerciseFooter ei={ei} name={e.label} hasNote={e.note != null} col={col} onAdd={() => run(() => { glide(); store.addSet(e.entry.id); })}
                onNote={() => store.repo.localSave(noteOpenKey(e.entry.id), true)} />
            </View>}
          </View>;
        })}
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button label={tr('trainingAddExercise')} full variant="secondary" color="training" icon="plus" onPress={addExercise} />
          {editing ? null : view.exercises.length > 1 ? <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label={tr('trainingReorder')} full variant="quiet" icon="reorder" onPress={() => setReorder(true)} /></View>
            <View style={{ flex: 1 }}><Button label={tr('trainingDiscard')} full variant="destructive" icon="trash" onPress={discard} /></View>
          </View> : <Button label={tr('trainingDiscardWorkout')} full variant="destructive" icon="trash" onPress={discard} />}
        </View>
      </>}
    </ScrollView>
    {!past && !focus && <RestBar store={store} sessionId={session.id} name={exName(store, session.id)} bottom={Math.max(12, insets.bottom - 8)} col={col}
      onExpand={() => trainingNav.rest(store.timer()?.entryId)} />}
    {focus && <FocusMode store={store} view={view} sessionId={session.id} startedAt={Number(session.data.started_at)} col={col} plates={plates}
      onClose={() => { setFocus(false); setXo(null); }} onFinish={() => { setFocus(false); finish(); }}
      onField={(e, s, f, v) => field(e, s, f, v)} onTag={tag} onRpe={rpe} onLog={(e, s) => check(e, s)} />}
    <ShellToast bottom={Math.max(0, insets.bottom - 8)} />
    <SheetHost visible={finishSheet} onClose={() => setFinishSheet(false)}>
      {finishSheet && <FinishSheet store={store} session={session} onClose={() => setFinishSheet(false)} />}
    </SheetHost>
  </View>;
}

/** The exercise the running rest belongs to, by its display name. */
function exName(store: WorkoutStore, sessionId: string) {
  const t = store.timer(), entry = t?.sessionId === sessionId ? store.repo.get('entries', t.entryId) : undefined;
  return entry ? exLabel(String(entry.data.exercise)) : '';
}

/** Reorder mode: each exercise with up and down. */
function Reorder({ store, exercises, col, onDone }: { store: WorkoutStore; exercises: ExerciseView[]; col: ReturnType<typeof useLoggerColors>; onDone: () => void }) {
  const glide = useLayoutMotion(), { c } = col;
  const move = (id: string, d: number) => { glide(); store.moveEntry(id, d); };
  return <>
    <LT w={700} s={24} lh={1.1} tr={-0.03} color={c.text} style={{ marginTop: 12, marginBottom: 12 }}>{tr('trainingReorderTitle')}</LT>
    <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: col.k.cardBg, boxShadow: col.k.cardEdge }}>
      {exercises.map((e, i) => <View key={e.entry.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingLeft: 16, paddingRight: 6,
        borderTopWidth: i ? 1 : 0, borderColor: c.hair }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <LT w={600} s={16} color={c.text}>{e.label}</LT>
          <LT w={500} s={13} color={c['text-muted']}>{trCount('trainingSetCount', e.sets.length)}</LT>
        </View>
        {([[-1, 'tr-up', 'trainingMoveUp', i === 0], [1, 'tr-down', 'trainingMoveDown', i === exercises.length - 1]] as const).map(([d, icon, label, off]) =>
          <Tappable key={d} dim="fill" disabled={off} accessibilityRole="button" accessibilityLabel={tr(label, { name: e.label })} accessibilityState={{ disabled: off }}
            onPress={() => move(e.entry.id, d)} style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.5 : 1 }}>
            <Icon name={icon} size={20} color={off ? col.ghost : c.text} />
          </Tappable>)}
      </View>)}
    </View>
    <LT w={500} s={13} lines={2} color={c['text-muted']} style={{ marginTop: 8, marginHorizontal: 16 }}>{tr('trainingReorderFoot')}</LT>
    <View style={{ marginTop: 20 }}><Button label={tr('trainingDone')} full color="training" onPress={onDone} /></View>
  </>;
}
