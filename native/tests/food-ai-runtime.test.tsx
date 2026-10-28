import { act, render } from "@testing-library/react-native";
import * as Network from "expo-network";
import {
  FoodAiRuntime,
  FoodAiClientProvider,
} from "../src/features/food/ai/runtime";
import {
  aiState,
  FoodAiService,
  setConsent,
} from "../src/features/food/ai/service";
import { memoryRepository } from "./workout-repository";
let mockListener: (state: {
  isConnected: boolean;
  isInternetReachable: boolean;
}) => void;
jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: false,
    isInternetReachable: false,
  })),
  addNetworkStateListener: jest.fn((fn) => {
    mockListener = fn;
    return { remove: jest.fn() };
  }),
}));
test("cold runtime leaves offline job durable, connectivity drains once using only the stub", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  new FoodAiService(repo).enqueue({ jpeg: "YWJj" }, "2026-10-27", "meal");
  const client = jest.fn(async () => [
    {
      name: "Synthetic rice",
      energy_kj: 418.4,
      amount_g: 100,
      origin: "added",
      unsure: true,
    },
  ]);
  await render(
    <FoodAiClientProvider client={client}>
      <FoodAiRuntime repo={repo} />
    </FoodAiClientProvider>,
  );
  expect(client).not.toHaveBeenCalled();
  expect(aiState(repo).queue).toHaveLength(1);
  jest
    .mocked(Network.getNetworkStateAsync)
    .mockResolvedValue({
      type: Network.NetworkStateType?.WIFI,
      isConnected: true,
      isInternetReachable: true,
    });
  await act(async () => {
    mockListener({ isConnected: true, isInternetReachable: true });
  });
  expect(client).toHaveBeenCalledTimes(1);
  expect(aiState(repo).queue).toEqual([]);
  expect(aiState(repo).ready).toHaveLength(1);
});
