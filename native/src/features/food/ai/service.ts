import type { Repository } from "../../../data/repository";
import { t } from "../../../i18n/en";
import { today } from "../../onboarding/model";
import { portion, saveFood, shiftDay, type Food } from "../model";
import { assertFoodAiPayload } from "./guard";

export interface Estimate {
  food: Food;
  origin: "named" | "added";
  unsure: boolean;
  confirmed: boolean;
}
export interface Photo {
  jpeg: string;
  thumbnail?: string;
}
interface Job extends Photo {
  id: number;
  day: string;
  meal: string;
}
interface Ready {
  id: number;
  day: string;
  meal: string;
  items: Estimate[];
  thumbnail?: string;
}
export interface AiState {
  consent: boolean;
  generation: number;
  thumbnails: boolean;
  sequence: number;
  usage: { day: string; photos: number; descriptions: number };
  queue: Job[];
  ready: Ready[];
  fallback: Omit<Ready, "items">[];
  entries: Record<string, { confirmed: boolean; thumbnail?: string }>;
  reviewed: string[];
}
const key = "foodAi";
export function aiState(repo: Repository): AiState {
  return (
    repo.localGet<AiState>(key) ?? {
      consent: false,
      generation: 0,
      thumbnails: true,
      sequence: 0,
      usage: { day: "", photos: 0, descriptions: 0 },
      queue: [],
      ready: [],
      fallback: [],
      entries: {},
      reviewed: [],
    }
  );
}
function update(repo: Repository, change: (s: AiState) => AiState) {
  repo.localSave(key, change(aiState(repo)));
}
export function setConsent(repo: Repository, consent: boolean) {
  update(repo, (s) => ({
    ...s,
    consent,
    generation: s.generation + 1,
    queue: [],
    ready: [],
    fallback: [],
  }));
  active.get(repo)?.abort();
}
export function setThumbnails(repo: Repository, thumbnails: boolean) {
  update(repo, (s) => ({
    ...s,
    thumbnails,
    entries: Object.fromEntries(
      Object.entries(s.entries).map(([id, item]) => [
        id,
        { ...item, thumbnail: thumbnails ? item.thumbnail : undefined },
      ]),
    ),
    queue: s.queue.map((j) => ({
      ...j,
      thumbnail: thumbnails ? j.thumbnail : undefined,
    })),
    ready: s.ready.map((j) => ({
      ...j,
      thumbnail: thumbnails ? j.thumbnail : undefined,
    })),
    fallback: s.fallback.map((j) => ({
      ...j,
      thumbnail: thumbnails ? j.thumbnail : undefined,
    })),
  }));
}
// This interface receives only a guarded body. The endpoint adapter supplies
// authentication outside that body; CI always substitutes a stub.
export class FoodAiDailyLimitError extends Error {
  constructor(readonly kind: "photos" | "descriptions") {
    super(t("foodAiLimit"));
  }
}
export type FoodAiClient = (
  payload: unknown,
  signal: AbortSignal,
) => Promise<unknown>;
export function mealPayload(text: string, jpeg?: string) {
  const content: unknown[] = [];
  if (jpeg)
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg },
    });
  content.push({
    type: "text",
    text:
      "Estimate meal items. Return name, energy_kj, amount_g, protein_g, carbs_g, fat_g, origin (named or added), unsure. The meal: " +
      text,
  });
  return {
    model: "food-estimate",
    max_tokens: 1500,
    messages: [{ role: "user", content }],
  };
}
function guard(payload: ReturnType<typeof mealPayload>) {
  assertFoodAiPayload(payload);
  // Additional platform aliases; the server mirror already blocks health metrics.
  const text = JSON.stringify(
    payload.messages[0].content.filter(
      (b) => (b as { type: string }).type === "text",
    ),
  )
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\p{M}\p{Cf}\p{Default_Ignorable_Code_Point}\s_-]/gu, "")
    .toLowerCase();
  if (/healthkit|healthconnect|applehealth/.test(text))
    throw new Error(t("foodAiBlocked"));
}
export function parseEstimates(value: unknown): Estimate[] {
  if (!Array.isArray(value) || !value.length || value.length > 30)
    throw new Error(t("foodAiFailure"));
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      item.name.length > 200 ||
      !["named", "added"].includes(item.origin) ||
      typeof item.unsure !== "boolean"
    )
      throw new Error(t("foodAiFailure"));
    guard(mealPayload(item.name));
    const food: Food = { name: item.name };
    for (const field of [
      "energy_kj",
      "amount_g",
      "protein_g",
      "carbs_g",
      "fat_g",
    ] as const) {
      const n = item[field];
      if (
        n != null &&
        (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100000)
      )
        throw new Error(t("foodAiFailure"));
      food[field] = n ?? null;
    }
    if (food.energy_kj == null) throw new Error(t("foodAiFailure"));
    return {
      food: portion(food, 1),
      origin: item.origin,
      unsure: item.unsure,
      confirmed: false,
    };
  });
}
export function stopFoodAiRequests(repo: Repository) {
  active.get(repo)?.abort();
}
const active = new WeakMap<Repository, AbortController>();
export class FoodAiService {
  constructor(
    readonly repo: Repository,
    private client: FoodAiClient | null = null,
    private clock: () => string = today,
  ) {}
  private permission() {
    const s = aiState(this.repo);
    if (!s.consent) throw new Error(t("foodAiConsentRequired"));
    return s.generation;
  }
  private reserve(kind: "photos" | "descriptions") {
    const s = aiState(this.repo),
      day = this.clock(),
      usage =
        s.usage.day === day ? s.usage : { day, photos: 0, descriptions: 0 };
    if (usage[kind] >= (kind === "photos" ? 10 : 20))
      throw new Error(t("foodAiLimit"));
    update(this.repo, (s) => ({
      ...s,
      usage: { ...usage, [kind]: usage[kind] + 1 },
    }));
  }
  private async send(text: string, jpeg?: string) {
    const generation = this.permission(),
      payload = mealPayload(text, jpeg);
    guard(payload);
    if (!this.client) throw new Error(t("foodAiUnavailable"));
    const controller = new AbortController();
    // Queue worker and Describe share a single in-flight request per repository.
    if (active.has(this.repo)) throw new Error(t("foodAiBusy"));
    active.set(this.repo, controller);
    try {
      this.reserve(jpeg ? "photos" : "descriptions");
      // A local-save subscriber can revoke consent while quota is reserved.
      // Check again at the exact egress boundary, before calling the client.
      if (
        controller.signal.aborted ||
        !aiState(this.repo).consent ||
        generation !== aiState(this.repo).generation
      )
        throw new Error(t("foodAiConsentRequired"));
      const result = await this.client(payload, controller.signal);
      if (
        controller.signal.aborted ||
        !aiState(this.repo).consent ||
        generation !== aiState(this.repo).generation
      )
        throw new Error(t("foodAiConsentRequired"));
      return parseEstimates(result);
    } catch (error) {
      if (error instanceof FoodAiDailyLimitError) {
        update(this.repo, (s) => ({
          ...s,
          usage: {
            ...s.usage,
            [error.kind]: error.kind === "photos" ? 10 : 20,
          },
        }));
      }
      throw error;
    } finally {
      if (active.get(this.repo) === controller) active.delete(this.repo);
    }
  }
  describe(text: string) {
    if (!text.trim() || text.length > 800)
      return Promise.reject(new Error(t("foodAiBlocked")));
    return this.send(text);
  }
  enqueue(photo: Photo, day: string, meal: string) {
    this.permission();
    if (
      !photo.jpeg ||
      photo.jpeg.length > 2_000_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.jpeg) ||
      !meal
    )
      throw new Error(t("foodAiFailure"));
    if (photo.thumbnail && photo.thumbnail.length > 40960)
      throw new Error(t("foodAiFailure"));
    update(this.repo, (s) => {
      if (s.usage.day === this.clock() && s.usage.photos >= 10)
        return {
          ...s,
          sequence: s.sequence + 1,
          fallback: [
            ...s.fallback,
            {
              id: s.sequence + 1,
              day,
              meal,
              thumbnail: s.thumbnails ? photo.thumbnail : undefined,
            },
          ],
        };
      if (s.queue.length >= 10) throw new Error(t("foodAiQueueFull"));
      return {
        ...s,
        sequence: s.sequence + 1,
        queue: [
          ...s.queue,
          {
            id: s.sequence + 1,
            day,
            meal,
            jpeg: photo.jpeg,
            thumbnail: s.thumbnails ? photo.thumbnail : undefined,
          },
        ],
      };
    });
  }
  async drain() {
    if (!this.client || active.has(this.repo)) return;
    while (aiState(this.repo).queue.length && aiState(this.repo).consent) {
      const job = aiState(this.repo).queue[0],
        s = aiState(this.repo);
      if (s.usage.day === this.clock() && s.usage.photos >= 10) {
        update(this.repo, (s) => ({
          ...s,
          queue: s.queue.filter((j) => j.id !== job.id),
          fallback: [
            ...s.fallback,
            {
              id: job.id,
              day: job.day,
              meal: job.meal,
              thumbnail: s.thumbnails ? job.thumbnail : undefined,
            },
          ],
        }));
        continue;
      }
      try {
        const items = await this.send(
          "Identify the foods on this plate.",
          job.jpeg,
        );
        update(this.repo, (s) => ({
          ...s,
          queue: s.queue.filter((j) => j.id !== job.id),
          ready: [
            ...s.ready,
            {
              id: job.id,
              day: job.day,
              meal: job.meal,
              items,
              thumbnail: s.thumbnails ? job.thumbnail : undefined,
            },
          ],
        }));
      } catch (error) {
        if (error instanceof FoodAiDailyLimitError) continue;
        return;
      } // Keep the durable job. Retry on the next connection/resume.
    }
  }
}
export function adjustEstimate(
  item: Estimate,
  multiple: number,
  weight?: string,
  unit: "g" | "oz" = "g",
): Estimate {
  if (multiple < 0.5 || multiple > 2 || !Number.isFinite(multiple))
    throw new Error(t("foodInvalid"));
  let scale = multiple,
    confirmed = item.confirmed;
  if (weight !== undefined && weight.trim() !== "") {
    if (
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weight) ||
      Number(weight) <= 0 ||
      !Number.isFinite(Number(weight))
    )
      throw new Error(t("foodInvalid"));
    const grams = Number(weight) * (unit === "oz" ? 28.349523125 : 1);
    if (!Number(item.food.amount_g))
      return {
        ...item,
        food: { ...portion(item.food, multiple), amount_g: grams },
        confirmed: true,
      };
    scale = grams / Number(item.food.amount_g);
    confirmed = true;
  }
  return { ...item, food: portion(item.food, scale), confirmed };
}
export function logEstimates(
  repo: Repository,
  day: string,
  meal: string,
  items: Estimate[],
  readyId?: number,
) {
  repo.atomic(() => {
    const s = aiState(repo),
      ready =
        s.ready.find((j) => j.id === readyId) ??
        s.fallback.find((j) => j.id === readyId),
      entries = { ...s.entries };
    for (const item of items) {
      const row = saveFood(repo, day, meal, item.food);
      entries[row.id] = {
        confirmed: item.confirmed,
        thumbnail: s.thumbnails ? ready?.thumbnail : undefined,
      };
    }
    repo.localSave(key, {
      ...s,
      entries,
      ready: s.ready.filter((j) => j.id !== readyId),
      fallback: s.fallback.filter((j) => j.id !== readyId),
    });
  });
}
export function confirmEstimate(repo: Repository, id: string) {
  update(repo, (s) => ({
    ...s,
    entries: { ...s.entries, [id]: { ...s.entries[id], confirmed: true } },
  }));
}
export function yesterdayReview(repo: Repository, day = today()) {
  const s = aiState(repo);
  return s.reviewed.includes(day)
    ? []
    : repo
        .list("food_entries")
        .filter(
          (r) =>
            r.data.day === shiftDay(day, -1) &&
            s.entries[r.id]?.confirmed === false,
        );
}
export function dismissReview(repo: Repository, day = today()) {
  update(repo, (s) => ({ ...s, reviewed: [...s.reviewed.slice(-30), day] }));
}

export function attachFallback(
  repo: Repository,
  rowId: string,
  fallbackId: number,
) {
  update(repo, (s) => ({
    ...s,
    entries: {
      ...s.entries,
      [rowId]: {
        confirmed: true,
        thumbnail: s.thumbnails
          ? s.fallback.find((j) => j.id === fallbackId)?.thumbnail
          : undefined,
      },
    },
    fallback: s.fallback.filter((j) => j.id !== fallbackId),
  }));
}
