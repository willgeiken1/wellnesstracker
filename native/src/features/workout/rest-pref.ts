import type { Repository } from "@/data/repository";

/** How the rest timer appears when a set is logged. Saved on this phone only, like the other logger preferences. */
export const REST_OPENS = ["bar", "full"] as const;
export type RestOpens = (typeof REST_OPENS)[number];
export const REST_OPENS_KEY = "restOpens";
/** The bar is the default: it keeps the workout in view. Anything unknown reads as the bar. */
export const restOpens = (repo: Repository): RestOpens => (repo.localGet<string>(REST_OPENS_KEY) === "full" ? "full" : "bar");
export const setRestOpens = (repo: Repository, value: RestOpens) => repo.localSave(REST_OPENS_KEY, value);
