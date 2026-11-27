import type { Repository } from '@/data/repository';
import { showToast } from '@/features/shell/toast';
import { actionSheet, type SheetAction } from '../workout/action-sheet';
import { trainingNav } from '../workout/nav';
import { startTraining } from '../workout/start-workout';
import { tr } from '../workout/tr';
import { SplitStore, type SplitView, type Undo } from './store';

/*
 * The Split tile's Change menu and the actions it shares with the Split screen (Insight Mockup v21, splits.js `menu`,
 * `swapSheet`, `skip`). Each change says what happened in a toast, with Undo where it can be taken back.
 */

/** The weekday a session falls on, in words, for Set weekdays (Rotate in order never names one). */
export function nextWhen(v: SplitView): string {
  if (v.def.mode === 'rotate' || v.state.carry !== null || v.now.kind === 'skipped') return tr('splitTomorrow');
  const day = v.now.nextDay;
  if (!day || day <= v.today) return tr('splitTomorrow');
  const tomorrow = new Date(`${v.today}T12:00:00`); tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(`${day}T12:00:00`), wd = (d.getDay() + 6) % 7;
  return d.toDateString() === tomorrow.toDateString() ? tr('splitTomorrow') : tr('splitWeekdayLong').split(',')[wd] ?? tr('splitTomorrow');
}
/** The line above a day that is not today's: rotate splits never name a weekday. */
export function statusLine(v: SplitView): string {
  const k = v.now.kind;
  if (v.def.mode === 'rotate') return k === 'done' ? tr('splitDoneUpNext') : k === 'skipped' ? tr('splitSkippedWaits') : tr('splitUpNext');
  const when = nextWhen(v);
  return k === 'done' ? tr('splitDoneNext', { when }) : k === 'skipped' ? tr('splitSkippedWaitsFor', { when }) : tr('splitRestNext', { when });
}
/** The day after today's (or after the one going now): the next session. */
export function nextIndex(v: SplitView): number {
  return v.now.kind === 'planned' || v.now.kind === 'live' ? v.now.then[0] ?? v.now.focus : v.now.focus;
}
const toastUndo = (text: string, undo: Undo) => showToast(text, { color: 'training', action: { label: tr('splitUndo'), onAction: undo } });

/** Start a split day: the logger opens with its exercises. While another workout is going, it offers to resume that one. */
export function startSplitDay(repo: Repository, routineId: string) {
  const store = new SplitStore(repo);
  if (store.workout.active()) return startTraining(repo);
  const session = store.startDay(routineId);
  trainingNav.logger();
  return session;
}
/** A freestyle workout: an empty one, where exercises are picked as you go. It never moves the split. */
export function freestyle(repo: Repository) { return startTraining(repo); }

/** Swap today's day (or the next session's) for another split day. */
export function swapSheet(repo: Repository, forNext: boolean, reduceMotion: boolean) {
  const store = new SplitStore(repo), v = store.view();
  if (!v) return;
  const cur = forNext ? nextIndex(v) : v.now.focus, curName = v.days[cur]?.name ?? '';
  const actions: SheetAction[] = v.days.filter(d => d.index !== cur).map(d => ({ label: d.name, run: () => {
    const undo = store.swap(d.index);
    toastUndo(tr(forNext ? 'splitToastSwapNext' : 'splitToastSwap', { to: d.name, name: curName }), undo);
  } }));
  // The first sheet slides away before the second rises, as the system's own sheets do.
  setTimeout(() => actionSheet({ title: forNext ? tr('splitSwapTitleNext') : tr('splitToday'),
    message: tr(forNext ? 'splitSwapBodyNext' : 'splitSwapBody', { name: curName }), actions }), reduceMotion ? 0 : 280);
}
export function skipToday(repo: Repository) {
  const store = new SplitStore(repo), v = store.view();
  if (!v || v.now.kind !== 'planned') return;
  const name = v.days[v.now.focus]?.name ?? '';
  toastUndo(tr('splitToastSkip', { name }), store.skip());
}
export function trainNow(repo: Repository) {
  const store = new SplitStore(repo), v = store.view();
  if (!v) return;
  const undo = store.trainToday(), after = store.view();
  const name = after && after.now.kind === 'planned' ? after.days[after.now.focus]?.name ?? '' : '';
  if (name) toastUndo(tr('splitToastTrain', { name }), undo);
}

/** The Change menu: what today can become, then Edit and Change split. */
export function splitMenu(repo: Repository, reduceMotion: boolean) {
  const store = new SplitStore(repo), v = store.view();
  if (!v) { trainingNav.splitLibrary(); return; }
  const t = v.now, name = (i: number) => v.days[i]?.name ?? '';
  const next = nextIndex(v), actions: SheetAction[] = [];
  if (t.kind === 'live') {
    const live = v.live!;
    actions.push({ label: tr('splitResume', { name: live.name || name(t.focus) }), run: () => trainingNav.logger() });
    if (next >= 0) actions.push({ label: tr('splitChangeNextName', { name: name(next) }), run: () => swapSheet(repo, true, reduceMotion) });
  } else if (t.kind === 'planned') {
    actions.push({ label: tr('splitSwapAnother'), run: () => swapSheet(repo, false, reduceMotion) });
    actions.push({ label: tr('splitSkipName', { name: name(t.focus) }), run: () => skipToday(repo) });
    actions.push({ label: tr('splitFreestyleInstead'), run: () => freestyle(repo) });
  } else {
    if (t.focus >= 0) actions.push({ label: tr('splitTrainToday', { name: name(t.focus) }), run: () => trainNow(repo) });
    if (t.focus >= 0) actions.push({ label: tr('splitChangeNext'), run: () => swapSheet(repo, true, reduceMotion) });
    actions.push({ label: tr('splitFreestyleToday'), run: () => freestyle(repo) });
  }
  actions.push({ label: tr('splitEditName', { name: v.def.name }), run: () => trainingNav.plan() });
  actions.push({ label: tr('splitChangeSplit'), run: () => trainingNav.splitLibrary() });
  const message = t.kind === 'live' ? tr('splitMenuLive', { name: v.live?.name || name(t.focus) })
    : t.kind === 'planned' ? tr('splitMenuToday', { name: name(t.focus), n: v.days[t.focus]?.exercises.length ?? 0 })
      : tr('splitMenuNext', { name: name(t.focus), when: nextWhen(v).toLowerCase() });
  actionSheet({ title: v.def.name, message, actions });
}
