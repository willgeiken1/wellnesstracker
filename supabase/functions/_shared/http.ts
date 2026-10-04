// Shared auth boilerplate for privacy edge functions.
// Deploy those functions with JWT verification OFF; they check the sign-in themselves.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch { /* fall back to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

export const admin: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false } });

export async function requireUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  return user;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validDay(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

export async function userStillExists(id: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (data?.user) return true;
  if (error && /not found/i.test(error.message || "")) return false;
  if (error) throw new Error(error.message);
  return false;
}

/** Delete every object under progress/{userId}/. Empty is success. */
export async function wipeStoragePrefix(userId: string) {
  const bucket = admin.storage.from("progress");
  for (let guard = 0; guard < 40; guard++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) {
      if (/not found|does not exist|bucket/i.test(error.message || "")) return;
      throw new Error(error.message);
    }
    if (!data || data.length === 0) return;
    const paths = data.filter((f) => f && f.name && f.name !== ".emptyFolderPlaceholder").map((f) => `${userId}/${f.name}`);
    if (!paths.length) return;
    const { error: rm } = await bucket.remove(paths);
    if (rm) throw new Error(rm.message);
    if (data.length < 100) return;
  }
}
