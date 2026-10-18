import { render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import LoggerFixtureRoute from "../src/app/dev/logger-fixture";
import { useWorkout } from "../src/features/workout/use-workout";
import { WorkoutStore } from "../src/data/workout/store";
import { memoryRepository } from "./workout-repository";
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
  { demo: false, session: null },
  { demo: true, session: { user: { id: "synthetic-account" } } },
])("route never seeds outside a signed-out demo: %p", async (auth) => {
  const store = new WorkoutStore(memoryRepository());
  jest
    .mocked(useWorkout)
    .mockReturnValue({ store, auth: { ready: true, ...auth } } as ReturnType<
      typeof useWorkout
    >);
  await render(<LoggerFixtureRoute />);
  expect(store.repo.list("sessions")).toHaveLength(0);
  expect(router.replace).toHaveBeenCalledWith("/");
});
test("guarded demo route opens the requested keypad state", async () => {
  const store = new WorkoutStore(memoryRepository());
  jest.mocked(useWorkout).mockReturnValue({
    store,
    auth: { ready: true, demo: true, session: null },
  } as ReturnType<typeof useWorkout>);
  await render(<LoggerFixtureRoute />);
  await waitFor(() => expect(store.active()?.data.name).toBe("Push Day A"));
  expect(router.replace).not.toHaveBeenCalled();
  expect(store.active()?.data.name).toBe("Push Day A");
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
