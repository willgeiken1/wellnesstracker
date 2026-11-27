import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as LiveActivity from 'expo-live-activity';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { WorkoutStore, type TimerState } from '@/data/workout/store';
import { createTheme } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { exLabel } from './logger/model';
import { tr } from './tr';

/*
 * The rest timer on the Lock Screen and in the Dynamic Island. One Live Activity follows the workout's rest: it
 * starts when a rest starts, moves its end on +15, −15 or a new length, and ends when the rest runs out, is
 * skipped, or the workout ends or is discarded. Everything else in the app keeps working from the rest timer saved
 * in the repository; this file only mirrors it. iOS 16.2 and later only: web, Android and older iOS do nothing.
 */

/** The opened activity's id, kept so a restarted app ends or keeps the activity it left instead of opening a second. */
export const REST_ACTIVITY_KEY = 'liveActivity:rest';
/** `insight://workout/start`: the logger, which resumes the workout that is under way. */
export const REST_ACTIVITY_LINK = 'workout/start';

/** Live Activities need iOS 16.2 or later, and a build that carries the native module (not Expo Go or a test). */
export function liveActivitiesSupported(os: string = Platform.OS, version: string | number = Platform.Version, native = () => requireOptionalNativeModule('ExpoLiveActivity') != null) {
  if (os !== 'ios') return false;
  const [major = 0, minor = 0] = String(version).split('.').map(n => Number(n) || 0);
  return (major > 16 || (major === 16 && minor >= 2)) && native();
}

export interface RestActivityContent { title: string; subtitle?: string; endAt: number }

/** What the activity should show for the saved rest timer now, or null when no rest is counting down. */
export function restActivityContent(repo: Repository, timer: TimerState | null | undefined, now = Date.now()): RestActivityContent | null {
  if (!timer || timer.ended || timer.endAt <= now) return null;
  const session = timer.sessionId ? repo.get('sessions', timer.sessionId) : undefined;
  if (!session || session.deleted_at !== null || session.data.finished_at !== null) return null;
  const store = new WorkoutStore(repo);
  const name = (id: string | undefined) => {
    const entry = id ? repo.get('entries', id) : undefined;
    return entry ? exLabel(String(entry.data.exercise)) : '';
  };
  const current = name(timer.entryId), next = name(store.nextSet(timer.sessionId)?.entryId);
  return {
    title: current ? tr('trainingRestLabel', { name: current }) : tr('trainingRestTimer'),
    ...(next ? { subtitle: tr('trainingRestNext', { name: next }) } : {}),
    endAt: timer.endAt,
  };
}

function state(content: RestActivityContent): LiveActivity.LiveActivityState {
  return { title: content.title, ...(content.subtitle ? { subtitle: content.subtitle } : {}), progressBar: { date: content.endAt } };
}

/** The training colour of the person's palette, as drawn on a dark surface (the Dynamic Island is always black). */
export function restActivityTint(palette: Parameters<typeof createTheme>[1]) {
  return createTheme('dark', palette).training;
}

/**
 * Keeps one Live Activity in step with the repository's rest timer. `sync` is safe to call as often as anything
 * changes: it starts, updates or stops only when what the activity shows would differ.
 */
export class RestActivity {
  private id: string | null;
  private shown: RestActivityContent | null = null;
  private busy = false;
  private again = false;
  private wake: ReturnType<typeof setTimeout> | null = null;
  /** The saved timer the activity last matched: most changes (a typed weight) leave it alone, and cost nothing here. */
  private seen: string | null = null;

  constructor(readonly repo: Repository, public tint: string, private readonly supported = liveActivitiesSupported()) {
    this.id = supported ? repo.localGet<string>(REST_ACTIVITY_KEY) ?? null : null;
  }

  sync(now = Date.now()) {
    if (!this.supported) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      do { this.again = false; this.step(now); now = Date.now(); } while (this.again);
    } finally { this.busy = false; }
  }

  /** Ends the activity, whatever the timer says (signing out, another account). */
  end() {
    if (this.wake) clearTimeout(this.wake);
    this.wake = null;
    if (this.supported && this.id) this.stop(this.shown);
  }

  private step(now: number) {
    const timer = this.repo.localGet<TimerState | null>('timer'), seen = JSON.stringify(timer ?? null);
    if (this.id && this.shown && seen === this.seen && this.shown.endAt > now) return;
    const want = restActivityContent(this.repo, timer, now);
    this.seen = want ? seen : null;
    if (this.wake) clearTimeout(this.wake);
    // A rest that runs out while the app is open ends the activity at zero; in the background, on the way back.
    this.wake = want ? setTimeout(() => this.sync(), want.endAt - now + 50) : null;
    if (!want) { if (this.id) this.stop(this.shown); return; }
    if (!this.id) { this.start(want); return; }
    const shown = this.shown;
    if (shown && shown.title === want.title && shown.subtitle === want.subtitle && shown.endAt === want.endAt) return;
    try {
      LiveActivity.updateActivity(this.id, state(want));
      this.shown = want;
    } catch {
      // The person or the system ended it (swiped away, Live Activities turned off): open a fresh one.
      this.forget();
      this.start(want);
    }
  }

  private start(content: RestActivityContent) {
    let id: string | undefined;
    try {
      id = LiveActivity.startActivity(state(content), {
        progressViewTint: this.tint,
        deepLinkUrl: REST_ACTIVITY_LINK,
        timerType: 'digital',
      }) ?? undefined;
    } catch { id = undefined; } // Live Activities are off for Insight in Settings, or the system refused.
    if (!id) return;
    this.id = id;
    this.shown = content;
    this.repo.localSave(REST_ACTIVITY_KEY, id);
  }

  private stop(last: RestActivityContent | null) {
    const id = this.id!;
    this.forget();
    try {
      LiveActivity.stopActivity(id, last ? state({ ...last, endAt: Math.min(last.endAt, Date.now()) }) : { title: tr('trainingRestTimer') });
    } catch { /* Already gone. */ }
  }

  private forget() {
    this.id = null;
    this.shown = null;
    if (this.repo.localGet(REST_ACTIVITY_KEY) != null) this.repo.localSave(REST_ACTIVITY_KEY, null);
  }
}

let current: { activity: RestActivity; detach: () => void } | null = null;

/**
 * Follows the rest timer of this repository from now on. Stays attached when the screen that asked goes away, so a
 * rest keeps its activity while the person moves around the app; a different repository (another account) takes over.
 */
export function watchRestActivity(repo: Repository, tint: string) {
  if (current?.activity.repo === repo) {
    current.activity.tint = tint;
    current.activity.sync();
    return current.activity;
  }
  stopWatchingRestActivity();
  if (!liveActivitiesSupported()) return null;
  const activity = new RestActivity(repo, tint);
  const unsubscribe = repo.subscribe(() => activity.sync());
  const app = AppState.addEventListener('change', (s: AppStateStatus) => { if (s === 'active') activity.sync(); });
  current = { activity, detach: () => { unsubscribe(); app.remove(); activity.end(); } };
  activity.sync();
  return activity;
}

/** Stops following and ends any open activity. */
export function stopWatchingRestActivity() {
  const was = current;
  current = null;
  was?.detach();
}

/** Mount on the screens that run a rest (the logger and the rest timer sheet). */
export function useRestLiveActivity() {
  const { repository } = useAuth();
  const { palette } = useTheme();
  const tint = restActivityTint(palette);
  useEffect(() => { if (repository) watchRestActivity(repository, tint); }, [repository, tint]);
}
