// These tests cover the AI features, which stay in the code for a later update; the launch build hides them.
jest.mock('../src/features/ai-launch', () => ({ AI_FEATURES_ENABLED: true }));
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "../src/design/theme-provider";
import { FoodAiEntry } from "../src/features/food/ai/entry";
import { FoodAiClientProvider } from "../src/features/food/ai/runtime";
import {
  aiState,
  FoodAiService,
  setConsent,
} from "../src/features/food/ai/service";
import { memoryRepository } from "./workout-repository";
import { pickMealPhoto } from "../src/features/food/ai/photos";
jest.mock("../src/features/food/ai/photos", () => ({
  pickMealPhoto: jest.fn(async () => ({ jpeg: "YWJj", thumbnail: "dGh1bWI=" })),
}));
jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: false,
    isInternetReachable: false,
  })),
}));
const response = [
  {
    name: "Synthetic rice",
    energy_kj: 418.4,
    amount_g: 100,
    origin: "named",
    unsure: false,
  },
  {
    name: "Synthetic oil",
    energy_kj: 209.2,
    amount_g: 10,
    origin: "added",
    unsure: true,
  },
];
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-27T17:00:00Z"));
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());
test("unmount during Describe aborts and discards a late result", async () => {
 jest.spyOn(AccessibilityInfo,"isReduceMotionEnabled").mockResolvedValue(false);
 const repo = memoryRepository(); setConsent(repo,true);
 let finish!: (v:unknown)=>void; let signal!:AbortSignal;
 const client = jest.fn((_payload:unknown,s:AbortSignal) => { signal=s; return new Promise(resolve=>{finish=resolve;}); });
 const view = await render(<FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode="describe" day="2026-10-27" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></FoodAiClientProvider>,{wrapper});
 await fireEvent.changeText(view.getByLabelText("Describe the foods and portions"),"rice");
 // The press handler starts the request without awaiting its network promise.
 await fireEvent.press(view.getByRole("button",{name:"Estimate meal"}));
 await view.unmount(); expect(signal.aborted).toBe(true);
 await act(async()=>{finish(response);});
 expect(repo.list("food_entries")).toEqual([]); expect(aiState(repo).ready).toEqual([]);
});


test("unmount while choosing a photo leaves a background drain running", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  let pick!: (value: { jpeg: string }) => void;
  jest.mocked(pickMealPhoto).mockImplementationOnce(() => new Promise(resolve => { pick = resolve; }));
  const view = await render(<FoodAiEntry repo={repo} mode="snap" day="2026-10-27" meal="meal" onClose={jest.fn()} onManual={jest.fn()} />, { wrapper });
  await fireEvent.press(view.getByRole("button", { name: "Choose meal photo" }));
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  const client = jest.fn((_payload: unknown, requestSignal: AbortSignal) => {
    signal = requestSignal;
    return new Promise(resolve => { finish = resolve; });
  });
  const background = new FoodAiService(repo, client);
  let pending!: Promise<void>;
  await act(() => {
    background.enqueue({ jpeg: "YWJj" }, "2026-10-27", "meal");
    pending = background.drain();
  });
  await view.unmount();
  expect(signal.aborted).toBe(false);
  await act(async () => { pick({ jpeg: "YWJj" }); finish(response); await pending; });
  expect(aiState(repo).ready).toHaveLength(1);
  expect(aiState(repo).queue).toEqual([]);
});
