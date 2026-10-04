// Oura token and day deletion for a revoked grant or an in-app disconnect.
// TODO(#16): PR #16 (privacy-delete, branch cursor/privacy-delete-fixes-5339)
// owns account and range deletion. Point deleteOuraData at that PR's helpers
// when it merges, instead of deleting oura_tokens and oura_days here.
import { admin } from "./http.ts";

export async function deleteOuraData(userId: string) {
  const tokens = await admin.from("oura_tokens").delete().eq("user_id", userId);
  if (tokens.error) throw new Error(tokens.error.message);
  const days = await admin.from("oura_days").delete().eq("user_id", userId);
  if (days.error) throw new Error(days.error.message);
}

export async function markOuraDisconnected(userId: string) {
  await deleteOuraData(userId);
  const { error } = await admin.from("oura_connections").update({
    status: "disconnected",
    last_error: "Reconnect Oura",
  }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function markMembershipInactive(userId: string) {
  const { error } = await admin.from("oura_connections").update({
    status: "membership_inactive",
    last_error: "Oura membership inactive",
  }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/* Insight has no subscriptions yet. When billing exists, cancellation must
   call deleteOuraData within 72 hours (§5(f)). This stays a no-op until then. */
export async function onSubscriptionCancelled(_userId: string) {
  // TODO: wire deleteOuraData here when an Insight subscription is cancelled.
}
