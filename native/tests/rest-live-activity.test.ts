import { AppState, Platform } from 'react-native';
import * as LiveActivity from 'expo-live-activity';
import { WorkoutStore } from '../src/data/workout/store';
import { restFootKey, startRest } from '../src/features/workout/sheets/rest';
import { tr } from '../src/features/workout/tr';
import {
  REST_ACTIVITY_KEY, RestActivity, liveActivitiesSupported, restActivityContent, restActivityTint, stopWatchingRestActivity, watchRestActivity,
} from '../src/features/workout/live-activity';
import { memoryRepository } from './workout-repository';

jest.mock('expo-live-activity', () => ({ startActivity: jest.fn(), updateActivity: jest.fn(), stopActivity: jest.fn() }));
// The watcher looks for the native module before it does anything; this build "has" it.
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: (name: string) => name === 'ExpoLiveActivity' ? {} : null }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn(() => jest.fn()) }));

const start = LiveActivity.startActivity as jest.Mock, update = LiveActivity.updateActivity as jest.Mock, stop = LiveActivity.stopActivity as jest.Mock;
const NOW = 1_800_000_000_000;
let ids = 0;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue('17.0');
  start.mockReset().mockImplementation(() => `activity-${++ids}`);
  update.mockReset(); stop.mockReset();
});
afterEach(() => { stopWatchingRestActivity(); jest.useRealTimers(); jest.restoreAllMocks(); });

/** A made-up workout: a squat with two sets filled in and a lunge after it. */
function workout() {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const session = store.start(undefined, NOW - 600_000);
  const squat = store.addExercise(session.id, 'Squat', 2), lunge = store.addExercise(session.id, 'Dumbbell Walking Lunge', 1);
  for (const i of [0, 1]) store.editDraft(squat.id, i, { weight: '135', reps: '5' });
  return { repo, store, session, squat, lunge };
}

describe('Live Activity support', () => {
  test('only iOS 16.2 and later with the native module', () => {
    const has = () => true;
    expect(liveActivitiesSupported('web', '1', has)).toBe(false);
    expect(liveActivitiesSupported('android', 34, has)).toBe(false);
    expect(liveActivitiesSupported('ios', '16.1', has)).toBe(false);
    expect(liveActivitiesSupported('ios', '16.2', has)).toBe(true);
    expect(liveActivitiesSupported('ios', '16.10', has)).toBe(true);
    expect(liveActivitiesSupported('ios', '17.0', has)).toBe(true);
    expect(liveActivitiesSupported('ios', '18.1', () => false)).toBe(false);
  });
  test('an unsupported phone never touches the module', () => {
    const { repo, store, squat } = workout();
    const activity = new RestActivity(repo, '#F38F81', false);
    store.toggleDone(squat.id, 0, NOW);
    activity.sync(NOW);
    expect(start).not.toHaveBeenCalled();
  });
  test('the tint is the palette’s training colour on dark', () => {
    expect(restActivityTint('orchidEvening')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('rest Live Activity', () => {
  test('a checked set starts it with the exercise, the next set and a countdown to the rest end, and links back to the workout', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    expect(start).not.toHaveBeenCalled();
    store.toggleDone(squat.id, 0, NOW);
    const endAt = store.timer()!.endAt;
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      { title: 'Rest · Squat', subtitle: 'Next: Squat', progressBar: { date: endAt } },
      { progressViewTint: '#F38F81', deepLinkUrl: 'workout/start', timerType: 'digital' },
    );
    expect(repo.localGet(REST_ACTIVITY_KEY)).toBe('activity-' + ids);
  });

  test('+15 and −15 move the end; nothing else re-sends it', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    const id = start.mock.results[0].value as string, endAt = store.timer()!.endAt;
    store.adjustTimer(15);
    expect(update).toHaveBeenLastCalledWith(id, expect.objectContaining({ progressBar: { date: endAt + 15_000 } }));
    store.adjustTimer(-15);
    expect(update).toHaveBeenLastCalledWith(id, expect.objectContaining({ progressBar: { date: endAt } }));
    store.updateTimer({ minimized: true });
    expect(update).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('a new length picked in the sheet keeps the same activity and moves its end', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    startRest(store, 180, squat.id, NOW);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(start.mock.results[0].value, expect.objectContaining({ progressBar: { date: NOW + 180_000 } }));
  });

  test('skipping the rest ends it', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    store.skipTimer();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0][0]).toBe(start.mock.results[0].value);
    expect(repo.localGet(REST_ACTIVITY_KEY)).toBeNull();
  });

  test('the rest running out ends it at zero', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    const seconds = store.timer()!.duration;
    jest.advanceTimersByTime(seconds * 1000 - 1000);
    expect(stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1100);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a rest that ran out in the background ends when the app comes back', () => {
    const { repo, store, squat } = workout();
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => { listeners.push(fn as (s: string) => void); return { remove: jest.fn() }; });
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    jest.setSystemTime(NOW + 10 * 60_000); // timers do not run while the app is away
    listeners.forEach(l => l('active'));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('finishing or discarding the workout ends it', () => {
    const { repo, store, session, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    store.finish(session.id, { startedAt: NOW - 600_000, finishedAt: NOW, notes: '' });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('the next rest opens a new activity after the last one ended', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    store.skipTimer();
    store.toggleDone(squat.id, 1, NOW + 60_000);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][0]).toEqual(expect.objectContaining({ title: 'Rest · Squat', subtitle: 'Next: Dumbbell walking lunge' }));
  });

  test('an activity the person dismissed is opened again on the next change', () => {
    const { repo, store, squat } = workout();
    watchRestActivity(repo, '#F38F81');
    store.toggleDone(squat.id, 0, NOW);
    update.mockImplementationOnce(() => { throw new Error('Activity not found'); });
    store.adjustTimer(15);
    expect(start).toHaveBeenCalledTimes(2);
  });

  test('Live Activities turned off in Settings: the workout carries on without one', () => {
    const { repo, store, squat } = workout();
    start.mockImplementation(() => { throw new Error('Live Activities are not enabled'); });
    watchRestActivity(repo, '#F38F81');
    expect(() => store.toggleDone(squat.id, 0, NOW)).not.toThrow();
    expect(store.timer()).toBeTruthy();
    store.skipTimer();
    expect(stop).not.toHaveBeenCalled();
  });

  test('after a restart it keeps the activity it left for a rest still running, and ends one whose rest is over', () => {
    const first = workout();
    first.store.toggleDone(first.squat.id, 0, NOW);
    first.repo.localSave(REST_ACTIVITY_KEY, 'left-open');
    watchRestActivity(first.repo, '#F38F81');
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('left-open', expect.objectContaining({ title: 'Rest · Squat' }));
    stopWatchingRestActivity();
    stop.mockReset();

    const second = workout();
    second.repo.localSave(REST_ACTIVITY_KEY, 'stale');
    watchRestActivity(second.repo, '#F38F81');
    expect(stop).toHaveBeenCalledWith('stale', expect.anything());
    expect(start).not.toHaveBeenCalled();
  });

  test('another account takes over: the old activity ends', () => {
    const a = workout();
    watchRestActivity(a.repo, '#F38F81');
    a.store.toggleDone(a.squat.id, 0, NOW);
    const b = workout();
    watchRestActivity(b.repo, '#F38F81');
    expect(stop).toHaveBeenCalledWith(start.mock.results[0].value, expect.anything());
    a.store.adjustTimer(15);
    expect(update).not.toHaveBeenCalled();
  });

  test('a hand-started rest with no exercise reads Rest timer', () => {
    const { repo, store } = workout();
    startRest(store, 90, '', NOW);
    expect(restActivityContent(repo, store.timer(), NOW)).toMatchObject({ title: 'Rest timer', endAt: NOW + 90_000 });
  });
});

test('the rest timer footnote is the design line wherever the Live Activity runs', () => {
  expect(tr(restFootKey('ios', () => true))).toBe('The timer keeps running on the Lock Screen and in the Dynamic Island, with a gentle buzz at zero.');
  expect(restFootKey('ios', () => false)).toBe('trainingRestFoot');
  expect(restFootKey('android', () => true)).toBe('trainingRestFoot');
  // This build has the native module and the phone runs iOS 17.
  expect(restFootKey('ios')).toBe('trainingRestFootLive');
});
