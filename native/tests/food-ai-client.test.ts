import {
  createFoodEndpointClient,
  createLocalFoodAiClient,
  FOOD_ENDPOINT_FIELDS,
} from "../src/features/food/ai/client";
import {
  mealPayload,
  FoodAiService,
  aiState,
  setConsent,
  setThumbnails,
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
      () => true,
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
    client = createFoodEndpointClient(request, undefined, undefined, () => true),
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
    createLocalFoodAiClient(memoryRepository())(mealPayload("rice"), new AbortController().signal),
  ).rejects.toThrow();
  expect(getAuthClient).not.toHaveBeenCalled();
});
test("server photo quota routes to fallback and removes photo upload bytes without another call", async () => {
  const request = jest.fn(async () => ({ code: "limit" })),
    client = createFoodEndpointClient(request, undefined, undefined, () => true),
    repo = memoryRepository();
  setConsent(repo, true);
  setThumbnails(repo, true);
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

test("adapter requires consent itself, including when called outside the service", async () => {
 const request = jest.fn(async () => reply);
 await expect(createFoodEndpointClient(request)(mealPayload("rice"),new AbortController().signal)).rejects.toThrow();
 expect(request).not.toHaveBeenCalled();
});
test("wire body has exactly the documented fields for each endpoint", async () => {
 const request = jest.fn(async (_name: string, _body: Record<string,string>, _signal: AbortSignal) => reply);
 const client = createFoodEndpointClient(request,undefined,undefined,()=>true);
 for(const photo of [false,true]) {
  await client(mealPayload("rice",photo ? "YWJj" : undefined),new AbortController().signal);
  expect(Object.keys(request.mock.calls.at(-1)![1]).sort()).toEqual([photo ? "image":"text", "localDate", "timeZone"].sort());
 }
});
test("a transient rate limit does not consume the daily cap", async () => {
 const repo = memoryRepository(); setConsent(repo,true);
 const request = jest.fn(async () => ({code:"rate_limit"}));
 const client = createFoodEndpointClient(request,undefined,undefined,()=>true);
 const service = new FoodAiService(repo,client);
 await expect(service.describe("rice")).rejects.toThrow("Too many requests");
 expect(aiState(repo).usage.descriptions).toBe(0);
});

test.each([null, "rate_limit", "limit"])("HTTP 429 uses the structured code %s, never status alone", async code => {
 const repo = memoryRepository(); setConsent(repo,true);
 const invoke = jest.fn(async () => ({data:null,error:{context:{status:429,json:async()=>({code})}}}));
 jest.mocked(getAuthClient).mockReturnValueOnce({functions:{invoke}} as unknown as NonNullable<ReturnType<typeof getAuthClient>>);
 await expect(new FoodAiService(repo,createLocalFoodAiClient(repo)).describe("rice")).rejects.toThrow(code === "limit" ? "Daily AI limit" : "Too many requests");
 expect(aiState(repo).usage.descriptions).toBe(code === "limit" ? 20 : 0);
});

test("wire body keys sent by the client equal the FOOD_ENDPOINT_FIELDS allowlist", async () => {
  const request = jest.fn(async (_name: string, _body: Record<string, string>) => reply),
    client = createFoodEndpointClient(request, () => "2026-10-27", () => "UTC", () => true);
  await client(mealPayload("rice"), new AbortController().signal);
  await client(mealPayload("rice", "YWJj"), new AbortController().signal);
  expect(request).toHaveBeenCalledTimes(2);
  for (const [name, body] of request.mock.calls) {
    const allowed = FOOD_ENDPOINT_FIELDS[name as keyof typeof FOOD_ENDPOINT_FIELDS];
    expect(Object.keys(JSON.parse(JSON.stringify(body))).sort()).toEqual([...allowed].sort());
  }
  expect(request.mock.calls.map(([name]) => name)).toEqual(["food-describe", "food-photo"]);
});
