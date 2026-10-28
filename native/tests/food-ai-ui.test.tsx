import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "../src/design/theme-provider";
import { FoodScreen } from "../src/features/food/screen";
import { FoodAiEntry } from "../src/features/food/ai/entry";
import { FoodAiPrivacy } from "../src/features/food/ai/privacy";
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
test("Cancel sends nothing and requests no camera; Privacy consent uses same sheet and revoke clears queue", async () => {
  const repo = memoryRepository(),
    client = jest.fn(async () => response);
  await render(
    <FoodAiClientProvider client={client}>
      <FoodScreen repository={repo} />
    </FoodAiClientProvider>,
    { wrapper },
  );
  await fireEvent.press(screen.getByRole("button", { name: "Snap" }));
  expect(screen.getByText(/Anthropic receives/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(client).not.toHaveBeenCalled();
  expect(pickMealPhoto).not.toHaveBeenCalled();
  expect(aiState(repo).consent).toBe(false);
  await render(<FoodAiPrivacy repo={repo} />, { wrapper });
  await fireEvent(
    screen.getByRole("switch", {
      name: "Allow meal photos and descriptions to be sent to Anthropic",
    }),
    "valueChange",
    true,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Allow meal estimates" }),
  );
  await act(() => {
    new FoodAiService(repo).enqueue({ jpeg: "YWJj" }, "2026-10-27", "meal");
  });
  await fireEvent(
    screen.getByRole("switch", {
      name: "Allow meal photos and descriptions to be sent to Anthropic",
    }),
    "valueChange",
    false,
  );
  expect(aiState(repo).consent).toBe(false);
  expect(aiState(repo).queue).toEqual([]);
});
test("Describe reveals items, separates added foods, ounces confirms item and unconfirmed calories count", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  const client = jest.fn(async () => response);
  await render(
    <FoodAiClientProvider client={client}>
      <FoodScreen repository={repo} />
    </FoodAiClientProvider>,
    { wrapper },
  );
  await fireEvent.press(screen.getByRole("button", { name: "Describe" }));
  await fireEvent.changeText(
    screen.getByLabelText("Describe the foods and portions"),
    "Synthetic rice",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Estimate meal" }));
  expect(screen.getByText("Foods you named")).toBeTruthy();
  expect(screen.getByText("AI-added foods")).toBeTruthy();
  expect(screen.queryByText("Synthetic oil")).toBeNull();
  await act(() => jest.advanceTimersByTime(250));
  expect(screen.getByText("Unsure — please review")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ounces · Synthetic rice" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Food weight for Synthetic rice (oz)"),
    "3.527396195",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Log these items" }),
  );
  expect(repo.list("food_entries")).toHaveLength(2);
  expect(
    Object.values(aiState(repo).entries).filter((e) => e.confirmed),
  ).toHaveLength(1);
  expect(screen.getByText("Dashed arcs indicate AI estimates.")).toBeTruthy();
});
test("Snap offline persists chosen image and thumbnail without calling AI", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  const client = jest.fn(async () => response);
  await render(
    <FoodAiClientProvider client={client}>
      <FoodScreen repository={repo} />
    </FoodAiClientProvider>,
    { wrapper },
  );
  await fireEvent.press(screen.getByRole("button", { name: "Snap" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Choose meal photo" }),
  );
  expect(aiState(repo).queue).toHaveLength(1);
  expect(client).not.toHaveBeenCalled();
  expect(screen.getByText(/Photo saved on this phone/)).toBeTruthy();
});

test("Reduce Motion reveals every item immediately and valid food grams confirm an estimate", async () => {
  const motion = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  const repo = memoryRepository();
  setConsent(repo, true);
  const client = jest.fn(async () => response);
  await render(
    <FoodAiClientProvider client={client}>
      <FoodScreen repository={repo} />
    </FoodAiClientProvider>,
    { wrapper },
  );
  await fireEvent.press(screen.getByRole("button", { name: "Describe" }));
  await fireEvent.changeText(
    screen.getByLabelText("Describe the foods and portions"),
    "Synthetic rice",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Estimate meal" }));
  expect(screen.getByText("Synthetic oil")).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Food weight for Synthetic rice (g)"),
    "50",
  );
  expect(
    screen.getByRole("button", { name: "Confirmed · Synthetic rice" }),
  ).toBeTruthy();
  motion.mockRestore();
});

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
