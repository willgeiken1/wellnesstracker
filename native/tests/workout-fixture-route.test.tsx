import { render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import LoggerFixtureRoute from "../src/app/dev/logger-fixture";
import { useWorkout } from "../src/features/workout/use-workout";
import { WorkoutStore } from "../src/data/workout/store";
import { randomUUID } from 'node:crypto';
import { localDatabase } from './server/sqlite';
import { Repository } from '../src/data/repository';
import { syncedTables } from '../src/data/rows';
import { OWNER_A, DEVICE_A } from '../fixtures/sync';
import { createLoggerFixture } from '../src/features/workout/devFixture';
import { memoryRepository } from "./workout-repository";
jest.mock('expo-sqlite', () => require('./server/expo-sqlite-stub'));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ state: "keypad", offline: "1" }),
}));
jest.mock("../src/features/workout/use-workout", () => ({
  useWorkout: jest.fn(),
}));
jest.mock("../src/features/workout/active", () => ({ ActiveWorkout: () => null }));
jest.mock("../src/features/workout/summary", () => ({ WorkoutSummary: () => null }));
beforeEach(() => jest.clearAllMocks());
test.each([
  { label: 'release', isDev: false, demo: true, session: null, owner: 'demo', ready: true },
  { label: 'non-demo', isDev: true, demo: false, session: null, owner: 'demo', ready: true },
  { label: 'signed-in', isDev: true, demo: true, session: { user: { id: OWNER_A } }, owner: 'demo', ready: true },
  { label: 'account repository', isDev: true, demo: true, session: null, owner: OWNER_A, ready: true },
  { label: 'development alone allowed', isDev: true, demo: false, session: { user: { id: OWNER_A } }, owner: 'demo', ready: true },
  { label: 'demo alone allowed', isDev: false, demo: true, session: { user: { id: OWNER_A } }, owner: 'demo', ready: true },
  { label: 'signed-out alone allowed', isDev: false, demo: false, session: null, owner: 'demo', ready: true },
  { label: 'auth pending', isDev: true, demo: true, session: null, owner: 'demo', ready: false },
])('route cannot seed: $label', async ({ isDev, demo, session, owner, ready }) => {
  const { db, sqlite } = await localDatabase();
  const original = __DEV__;
  try {
    Object.defineProperty(globalThis, '__DEV__', { value: isDev, configurable: true, writable: true });
    const store = new WorkoutStore(new Repository(db, owner, DEVICE_A, randomUUID));
    jest.mocked(useWorkout).mockReturnValue({ store, auth: { ready, demo, session } } as ReturnType<typeof useWorkout>);
    const view = await render(<LoggerFixtureRoute />);
    for (const table of [...syncedTables, 'workout_local', 'workout_weekly', 'workout_milestones', 'sync_state', 'sync_outbox']) {
      expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
    if (ready) expect(router.replace).toHaveBeenCalledWith('/');
    else expect(router.replace).not.toHaveBeenCalled();
    await view.unmount();
  } finally {
    Object.defineProperty(globalThis, '__DEV__', { value: original, configurable: true, writable: true });
    sqlite.close();
  }
});

test('createLoggerFixture rejects OWNER_A even with demo enabled and writes no SQLite rows', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const store = new WorkoutStore(repo);
    expect(createLoggerFixture(store, { isDev: true, demo: true, signedIn: false }, 'summary')).toBeNull();
    for (const table of [...syncedTables, 'workout_local', 'workout_weekly', 'workout_milestones', 'sync_state', 'sync_outbox']) {
      expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
    expect(repo.pending()).toEqual([]);
  } finally { sqlite.close(); }
});
test("guarded demo route opens the requested keypad state without outbox rows", async () => {
  const { db, sqlite } = await localDatabase();
  try {
    const store = new WorkoutStore(new Repository(db, 'demo', DEVICE_A, randomUUID));
    jest.mocked(useWorkout).mockReturnValue({
      store,
      auth: { ready: true, demo: true, session: null },
    } as ReturnType<typeof useWorkout>);
    const view = await render(<LoggerFixtureRoute />);
    await waitFor(() => expect(store.active()?.data.name).toBe("Push Day A"));
    expect(router.replace).not.toHaveBeenCalled();
    expect(store.repo.pending()).toEqual([]);
    expect(sqlite.prepare('SELECT count(*) AS n FROM sync_outbox').get()?.n).toBe(0);
    await view.unmount();
  } finally { sqlite.close(); }
});

test("a repository revision before navigation cannot seed a second fixture", async () => {
  const repo = memoryRepository();
  const auth = { ready: true, demo: true, session: null };
  jest
    .mocked(useWorkout)
    .mockReturnValue({ store: new WorkoutStore(repo), auth } as ReturnType<
      typeof useWorkout
    >);
  const view = await render(<LoggerFixtureRoute />);
  await waitFor(() => expect(new WorkoutStore(repo).active()).toBeTruthy());
  const session = new WorkoutStore(repo).active()!.id,
    count = repo.list("sessions").length;
  jest
    .mocked(useWorkout)
    .mockReturnValue({ store: new WorkoutStore(repo, 1), auth } as ReturnType<
      typeof useWorkout
    >);
  await view.rerender(<LoggerFixtureRoute />);
  expect(new WorkoutStore(repo).active()!.id).toBe(session);
  expect(repo.list("sessions")).toHaveLength(count);
  expect(router.replace).not.toHaveBeenCalled();
});
