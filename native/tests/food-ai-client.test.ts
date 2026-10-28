import {
  createFoodEndpointClient,
  localFoodAiClient,
} from "../src/features/food/ai/client";
import {
  mealPayload,
  FoodAiService,
  aiState,
  setConsent,
} from "../src/features/food/ai/service";
import { getAuthClient } from "../src/auth/client";
import { memoryRepository } from "./workout-repository";
jest.mock("../src/auth/client", () => ({ getAuthClient: jest.fn(() => null) }));
const reply = {
  items: [
    {
      name: "Synthetic rice",
      calories: 100,
      grams: 100,
      protein: 5,
      carbs: 20,
      fat: 2,
    },
  ],
  notes: "",
};
test("description and photo adapters project food-only bodies and normalize the existing response", async () => {
  const request = jest.fn(async () => reply),
    client = createFoodEndpointClient(
      request,
      () => "2026-10-27",
      () => "America/Chicago",
    ),
    signal = new AbortController().signal;
  const result = await client(mealPayload("Synthetic rice"), signal);
  expect(request).toHaveBeenLastCalledWith(
    "food-describe",
    {
      text: "Synthetic rice",
      localDate: "2026-10-27",
      timeZone: "America/Chicago",
    },
    signal,
  );
  expect(result).toEqual([
    expect.objectContaining({
      origin: "named",
      unsure: false,
    }),
  ]);
  expect((result as {energy_kj:number}[])[0].energy_kj).toBeCloseTo(418.4);
  await client(mealPayload("meal", "YWJj"), signal);
  expect(request).toHaveBeenLastCalledWith(
    "food-photo",
    { image: "YWJj", localDate: "2026-10-27", timeZone: "America/Chicago" },
    signal,
  );
  expect(JSON.stringify(request.mock.calls)).not.toMatch(
    /model|max_tokens|health|oura|profile|thumbnail/,
  );
});
test("unknown health values and an aborted request never reach endpoint; unavailable local config fails closed", async () => {
  const request = jest.fn(async () => reply),
    client = createFoodEndpointClient(request),
    controller = new AbortController();
  await expect(
    client({ ...mealPayload("rice"), oura: 978654 }, controller.signal),
  ).rejects.toThrow();
  controller.abort();
  await expect(
    client(mealPayload("rice"), controller.signal),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await expect(
    localFoodAiClient(mealPayload("rice"), new AbortController().signal),
  ).rejects.toThrow();
  expect(getAuthClient).toHaveBeenCalledTimes(1);
});
test("server photo quota routes to fallback and removes photo upload bytes without another call", async () => {
  const request = jest.fn(async () => ({ code: "limit" })),
    client = createFoodEndpointClient(request),
    repo = memoryRepository();
  setConsent(repo, true);
  const service = new FoodAiService(repo, client);
  service.enqueue(
    { jpeg: "YWJj", thumbnail: "dGh1bWI=" },
    "2026-10-27",
    "meal",
  );
  await service.drain();
  expect(request).toHaveBeenCalledTimes(1);
  expect(aiState(repo).queue).toEqual([]);
  expect(aiState(repo).fallback).toHaveLength(1);
  expect(aiState(repo).fallback[0].thumbnail).toBe("dGh1bWI=");
});
