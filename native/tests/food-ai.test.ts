import vectors from "../fixtures/food-ai-guard.json";
import {
  assertFoodAiPayload,
  callFoodModel,
} from "../src/features/food/ai/guard";
import {
  mealPayload,
  parseEstimates,
  FoodAiService,
  setConsent,
  aiState,
  FoodAiRateLimitError,
  FoodAiCancelledError,
  stopFoodAiRequests,
} from "../src/features/food/ai/service";
import { memoryRepository } from "./workout-repository";
const response = [
  {
    name: "Synthetic rice",
    energy_kj: 418.4,
    amount_g: 100,
    origin: "named",
    unsure: false,
  },
];
test.each(vectors)("shared guard: %s", async (text, allowed) => {
  const client = jest.fn(async () => response),
    payload = mealPayload(String(text));
  if (allowed) await callFoodModel(payload, client);
  else await expect(callFoodModel(payload, client)).rejects.toThrow();
  expect(client).toHaveBeenCalledTimes(allowed ? 1 : 0);
});
test.each(vectors)("model food-name guard: %s", (name, allowed) => {
  const parse = () => parseEstimates([{ ...response[0], name }]);
  if (allowed) expect(parse).not.toThrow();
  else expect(parse).toThrow();
});

test("unknown nested and top-level health values fail closed before client", () => {
  for (const extra of [
    { oura: 978654 },
    { healthkit: { steps: 978654 } },
    { profile: { weight: 978654 } },
    { stress: 978654 },
  ])
    expect(() =>
      assertFoodAiPayload({ ...mealPayload("rice"), ...extra }),
    ).toThrow();
});
test("consent gates every send, quotas persist and reset by local day", async () => {
  const repo = memoryRepository(),
    client = jest.fn(async () => response);
  let day = "2026-10-27";
  const service = new FoodAiService(repo, client, () => day);
  await expect(service.describe("rice")).rejects.toThrow();
  expect(client).not.toHaveBeenCalled();
  setConsent(repo, true);
  for (let i = 0; i < 20; i++) await service.describe("rice");
  await expect(service.describe("rice")).rejects.toThrow("limit");
  expect(client).toHaveBeenCalledTimes(20);
  day = "2026-10-28";
  await service.describe("rice");
  expect(client).toHaveBeenCalledTimes(21);
  setConsent(repo, false);
  await expect(service.describe("rice")).rejects.toThrow();
});
test("photo quota is 10; retains thumbnail and routes without uploading the eleventh", async () => {
  const repo = memoryRepository(),
    client = jest.fn(async () => response),
    service = new FoodAiService(repo, client, () => "2026-10-27");
  setConsent(repo, true);
  for (let i = 0; i < 11; i++) {
    service.enqueue({ jpeg: "YWJj", thumbnail: "YWJj" }, "2026-10-27", "meal");
    await service.drain();
  }
  await service.drain();
  expect(client).toHaveBeenCalledTimes(10);
  expect(aiState(repo).queue).toHaveLength(0);
  expect(aiState(repo).fallback).toHaveLength(1);
});
test("revocation during an outstanding call discards response and clears queued photo bytes", async () => {
  const repo = memoryRepository();
  let resolve!: (v: unknown) => void;
  const client = jest.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  setConsent(repo, true);
  const service = new FoodAiService(repo, client);
  const pending = service.describe("rice");
  setConsent(repo, false);
  resolve(response);
  await expect(pending).rejects.toThrow();
  expect(aiState(repo).queue).toEqual([]);
});
test("no profile, Health, Oura, or derived values can join meal egress", async () => {
  const repo = memoryRepository();
  repo.localSave("syntheticHealth", {
    oura: 978654,
    healthkit: 978653,
    healthConnect: 978652,
    weight: 978651,
    derivedCalories: 978650,
  });
  setConsent(repo, true);
  const client = jest.fn(async () => response),
    service = new FoodAiService(repo, client);
  await service.describe("Synthetic rice");
  expect(JSON.stringify(client.mock.calls)).not.toMatch(
    /97865[0-4]|oura|healthkit|healthConnect|derivedCalories|weight/,
  );
  for (const text of [
    "stress 5 rice",
    "mood 6 toast",
    "HealthKit 978653",
    "Health Connect 978652",
    "Oura 978654",
    "body weight 82 kg",
  ])
    await expect(service.describe(text)).rejects.toThrow();
  expect(client).toHaveBeenCalledTimes(1);
});
test("thumbnail switch removes existing bytes, does not restore them, revocation clears waiting photos", () => {
  const repo = memoryRepository(),
    service = new FoodAiService(repo);
  setConsent(repo, true);
  service.enqueue(
    { jpeg: "YWJj", thumbnail: "dGh1bWI=" },
    "2026-10-27",
    "meal",
  );
  const { setThumbnails } = require("../src/features/food/ai/service");
  setThumbnails(repo, false);
  expect(aiState(repo).queue[0].thumbnail).toBeUndefined();
  setThumbnails(repo, true);
  expect(aiState(repo).queue[0].thumbnail).toBeUndefined();
  setConsent(repo, false);
  expect(aiState(repo).queue).toEqual([]);
  expect(JSON.stringify(aiState(repo))).not.toContain("YWJj");
});
test("one busy request cannot race quotas or a second queue worker", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  let resolve!: (v: unknown) => void;
  const client = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
    service = new FoodAiService(repo, client);
  service.enqueue({ jpeg: "YWJj" }, "2026-10-27", "meal");
  const drain = service.drain();
  await service.drain();
  await expect(service.describe("rice")).rejects.toThrow();
  expect(client).toHaveBeenCalledTimes(1);
  resolve(response);
  await drain;
  expect(aiState(repo).ready).toHaveLength(1);
});
test("portion bounds and grams/ounces confirmation preserve nutrient ratios", () => {
  const {
    adjustEstimate,
    parseEstimates,
  } = require("../src/features/food/ai/service");
  const item = parseEstimates(response)[0];
  expect(adjustEstimate(item, 0.5).food.energy_kj).toBeCloseTo(209.2);
  expect(adjustEstimate(item, 2).food.amount_g).toBe(200);
  for (const m of [0.49, 2.01, NaN, Infinity])
    expect(() => adjustEstimate(item, m)).toThrow();
  expect(adjustEstimate(item, 1, "50", "g")).toMatchObject({
    confirmed: true,
    food: { amount_g: 50, energy_kj: 209.2 },
  });
  expect(adjustEstimate(item, 1, "1", "oz").food.amount_g).toBeCloseTo(
    28.349523125,
  );
  for (const weight of ["-1", "NaN", "0", "1x"])
    expect(() => adjustEstimate(item, 1, weight)).toThrow();
});
test("untrusted model output cannot store prompt instructions, health labels, or invalid nutrition", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  for (const item of [
    { ...response[0], name: "Oura readiness 80" },
    { ...response[0], energy_kj: Infinity },
    { ...response[0], origin: "unknown" },
  ]) {
    await expect(
      new FoodAiService(repo, async () => [item]).describe("rice"),
    ).rejects.toThrow();
  }
  expect(repo.list("food_entries")).toEqual([]);
});

test("revocation by a quota-write subscriber still sends nothing", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  const client = jest.fn(async () => response);
  const unsubscribe = repo.subscribe(() => {
    unsubscribe();
    setConsent(repo, false);
  });
  await expect(
    new FoodAiService(repo, client).describe("Synthetic rice"),
  ).rejects.toThrow();
  expect(client).not.toHaveBeenCalled();
});

 test("model names containing stress or mood fail closed", () => {
  const { parseEstimates } = require("../src/features/food/ai/service");
  for (const name of ["stressed cookies", "Stressless bar", "moodboost latte", "s-t-r-e-s-s", "ѕtrеѕѕ tea", "mооd bar"])
    expect(() => parseEstimates([{...response[0], name}])).toThrow();
 });
 test("failed photos back off and fall back after three attempts", async () => {
  const repo = memoryRepository(); setConsent(repo, true);
  let now = Date.now(); const client = jest.fn(async () => { throw new Error("synthetic failure"); });
  const service = new FoodAiService(repo, client, () => "2026-10-28", () => now);
  service.enqueue({jpeg:"YWJj"}, "2026-10-28", "meal");
  await service.drain(); await service.drain();
  expect(client).toHaveBeenCalledTimes(1);
  now += 30000; await service.drain(); await service.drain();
  expect(client).toHaveBeenCalledTimes(2);
  now += 60000; await service.drain();
  expect(client).toHaveBeenCalledTimes(3);
  expect(aiState(repo).queue).toEqual([]); expect(aiState(repo).fallback).toHaveLength(1);
 });
 test("thumbnail default, consent version and revocation remove stored thumbnail bytes", () => {
  const repo = memoryRepository(); expect(aiState(repo).thumbnails).toBe(false);
  setConsent(repo, true); expect(aiState(repo).consentVersion).toBe(1);
  repo.localSave("foodAi", {...aiState(repo), entries:{synthetic:{confirmed:true,thumbnail:"dGh1bWI="}}});
  setConsent(repo,false); expect(JSON.stringify(aiState(repo))).not.toContain("dGh1bWI=");
  repo.localSave("foodAi", {...aiState(repo), consent:true, consentVersion:0});
  expect(aiState(repo).consent).toBe(false);
 });
 test("expired photos are removed before any retry", async () => {
  const repo = memoryRepository(); setConsent(repo,true);
  let now = Date.now(); const client = jest.fn(async () => response);
  const service = new FoodAiService(repo,client,()=>"2026-10-28",()=>now);
  service.enqueue({jpeg:"YWJj"},"2026-10-28","meal");
  now += 24*60*60*1000; await service.drain();
  expect(client).not.toHaveBeenCalled(); expect(JSON.stringify(repo.localGet("foodAi"))).not.toContain("YWJj");
 });


test.each([FoodAiRateLimitError, FoodAiCancelledError])("%p does not consume photo failure attempts", async (ErrorType) => {
  const repo = memoryRepository();
  setConsent(repo, true);
  const client = jest.fn(async () => { throw new ErrorType(); });
  const service = new FoodAiService(repo, client);
  service.enqueue({ jpeg: "YWJj" }, "2026-10-28", "meal");
  for (let i = 0; i < 3; i++) await service.drain();
  expect(client).toHaveBeenCalledTimes(3);
  expect(aiState(repo).queue[0].attempts).toBe(0);
  expect(aiState(repo).fallback).toEqual([]);
});

test("aborting a drain preserves its failure count; consent abort clears the job", async () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  let finish!: (value: unknown) => void;
  const client = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const service = new FoodAiService(repo, client);
  service.enqueue({ jpeg: "YWJj" }, "2026-10-28", "meal");
  const pending = service.drain();
  stopFoodAiRequests(repo);
  finish(response);
  await pending;
  expect(aiState(repo).queue[0].attempts).toBe(0);
  const saved: number[] = [];
  const unsubscribe = repo.subscribe(() => {
    saved.push(...aiState(repo).queue.map(job => job.attempts));
  });
  const revoked = service.drain();
  setConsent(repo, false);
  finish(response);
  await revoked;
  unsubscribe();
  expect(saved.every(attempts => attempts === 0)).toBe(true);
  expect(aiState(repo).queue).toEqual([]);
  expect(aiState(repo).ready).toEqual([]);
});

test("8000-character mixed stress/mood digit runs finish under 50 ms", () => {
  for (const prefix of ["m", "5"]) {
    const payload = {
      model: "food-model",
      max_tokens: 1500,
      messages: [{ role: "user", content: [{ type: "text", text: prefix + "0".repeat(7999) }] }],
    };
    const start = performance.now();
    assertFoodAiPayload(payload);
    const elapsed = performance.now() - start;
    console.log(`native guard ${prefix} digit run: ${elapsed.toFixed(3)} ms`);
    expect(elapsed).toBeLessThan(50);
  }
});
