import { getAuthClient } from "../../../auth/client";
import { t } from "../../../i18n/en";
import { today } from "../../onboarding/model";
import { assertFoodAiPayload } from "./guard";
import { FoodAiDailyLimitError, type FoodAiClient } from "./service";

export interface MealEndpointRequest {
  (
    name: "food-photo" | "food-describe",
    body: Record<string, string>,
    signal: AbortSignal,
  ): Promise<unknown>;
}
const mealMarker = "The meal: ";
/** Adapter for the existing endpoints; receives no repository or profile data. */
export function createFoodEndpointClient(
  request: MealEndpointRequest,
  day: () => string = today,
  timeZone: () => string = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
): FoodAiClient {
  return async (payload, signal) => {
    assertFoodAiPayload(payload);
    if (signal.aborted) throw new Error(t("foodAiConsentRequired"));
    const content = (
      payload as {
        messages: {
          content: (
            | { type: "text"; text: string }
            | { type: "image"; source: { data: string } }
          )[];
        }[];
      }
    ).messages[0].content;
    const image = content.find((block) => block.type === "image");
    const text = content.find((block) => block.type === "text");
    if (!text || text.type !== "text") throw new Error(t("foodAiBlocked"));
    const start = text.text.indexOf(mealMarker);
    if (start < 0) throw new Error(t("foodAiBlocked"));
    const description = text.text.slice(start + mealMarker.length);
    const photo = image?.type === "image",
      kind = photo ? "photos" : "descriptions";
    // Each request is freshly projected. No original object is spread onto the wire.
    const body: Record<string, string> = {
      localDate: day(),
      timeZone: timeZone(),
    };
    if (photo) body.image = image.source.data;
    else body.text = description;
    const response = await request(
      photo ? "food-photo" : "food-describe",
      body,
      signal,
    );
    if (signal.aborted) throw new Error(t("foodAiConsentRequired"));
    if (!response || typeof response !== "object")
      throw new Error(t("foodAiFailure"));
    const result = response as {
      code?: unknown;
      items?: unknown;
      notes?: unknown;
    };
    if (result.code === "limit") throw new FoodAiDailyLimitError(kind);
    if (!Array.isArray(result.items)) throw new Error(t("foodAiFailure"));
    const words = (value: string) =>
      value
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? [];
    const named = new Set(words(description));
    const nutrient = (value: unknown) => {
      if (value == null) return null;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error(t("foodAiFailure"));
      return value;
    };
    return result.items.map((item) => {
      if (!item || typeof item !== "object" || typeof item.name !== "string")
        throw new Error(t("foodAiFailure"));
      // Older endpoint responses have no confidence/origin fields. Treat unmatched
      // names and any uncertainty note conservatively; never display raw notes.
      const origin =
        !photo && words(item.name).some((w) => named.has(w))
          ? "named"
          : "added";
      const calories = nutrient(item.calories);
      return {
        name: item.name,
        energy_kj: calories === null ? null : calories * 4.184,
        amount_g: nutrient(item.grams),
        protein_g: nutrient(item.protein),
        carbs_g: nutrient(item.carbs),
        fat_g: nutrient(item.fat),
        origin,
        unsure:
          origin === "added" ||
          (typeof result.notes === "string" && result.notes.trim().length > 0),
      };
    });
  };
}
/** Existing authConfig only accepts local loopback URLs and blocks production.
 * No client/config is read until a consented request actually reaches this function. */
export const localFoodAiClient: FoodAiClient = createFoodEndpointClient(
  async (name, body, signal) => {
    const client = getAuthClient();
    if (!client) throw new Error(t("foodAiUnavailable"));
    const { data, error } = await client.functions.invoke(name, {
      body,
      signal,
    });
    if (error) {
      // Supabase's response context may carry a structured quota response.
      // Consume only the public status, never log or expose its raw body/message.
      if (error.context?.status === 429)
        throw new FoodAiDailyLimitError(
          name === "food-photo" ? "photos" : "descriptions",
        );
      throw new Error(t("foodAiFailure"));
    }
    return data;
  },
);
