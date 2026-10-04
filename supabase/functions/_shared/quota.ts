// Daily AI caps. photo is 10, describe is 20. Limits live in consume_ai_quota.
import { admin } from "./http.ts";
import { resolveQuotaDay } from "./quota-day.js";

export { resolveQuotaDay, serverLocalDay, validDay } from "./quota-day.js";

export const PHOTO_KIND = "photo";
export const DESCRIBE_KIND = "describe";

export type Quota = {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  kind: string;
};

function asQuota(data: unknown): Quota {
  const q = (data ?? {}) as Partial<Quota>;
  return {
    allowed: !!q.allowed,
    used: Number(q.used) || 0,
    remaining: Number(q.remaining) || 0,
    limit: Number(q.limit) || 0,
    kind: String(q.kind || ""),
  };
}

export async function consumeQuota(userId: string, day: string, kind: string): Promise<Quota> {
  const { data, error } = await admin.rpc("consume_ai_quota", { p_user: userId, p_day: day, p_kind: kind });
  if (error) throw new Error(error.message);
  return asQuota(data);
}

export async function releaseQuota(userId: string, day: string, kind: string): Promise<void> {
  const { error } = await admin.rpc("release_ai_quota", { p_user: userId, p_day: day, p_kind: kind });
  if (error) console.error("release_ai_quota", error.message);
}
