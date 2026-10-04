// oura-sync: pulls the signed-in user's Oura data and stores one row per day.
// Body: { "days": 14 } -> how far back to fetch (the first sync uses 120).
// A 403 marks the membership inactive and keeps stored days. invalid_grant,
// or a 401 that is still a 401 after one refresh, deletes tokens and days.
// Deploy with JWT verification OFF; this function checks the user's sign-in itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyCollection, classifyRefresh, planSync } from "../_shared/oura-policy.js";
import { markMembershipInactive, markOuraDisconnected } from "../_shared/oura-data.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch { /* fall back to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false } });
const API = "https://api.ouraring.com/v2/usercollection";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

class OuraCall extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

type Grant = { kind: string; token?: string };

async function refreshGrant(userId: string, row: { access_token: string; refresh_token: string }): Promise<Grant> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: Deno.env.get("OURA_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("OURA_CLIENT_SECRET") ?? "",
    }),
  });
  const text = await res.text();
  const kind = classifyRefresh(res.status, text);
  if (kind !== "ok") return { kind };
  const n = JSON.parse(text);
  await admin.from("oura_tokens").update({
    access_token: n.access_token,
    refresh_token: n.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + (n.expires_in ?? 86400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return { kind: "ok", token: n.access_token };
}

async function loadToken(userId: string, force: boolean): Promise<{ refresh: string; token: string }> {
  const { data: t } = await admin.from("oura_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!t) throw new OuraCall("missing", "Oura isn't connected");
  if (!force && new Date(t.expires_at).getTime() > Date.now() + 120_000) return { refresh: "skipped", token: t.access_token };
  const grant = await refreshGrant(userId, t);
  if (grant.kind === "revoked") {
    await markOuraDisconnected(userId);
    throw new OuraCall("revoked", "Reconnect Oura");
  }
  if (grant.kind !== "ok" || !grant.token) throw new OuraCall("refresh_failed", "Oura login expired. Reconnect Oura in the app.");
  return { refresh: "ok", token: grant.token };
}

async function fetchAll(path: string, token: string, start: string, end: string) {
  const out: any[] = [];
  let next: string | null = null;
  do {
    const q = new URLSearchParams({ start_date: start, end_date: end });
    if (next) q.set("next_token", next);
    const res = await fetch(`${API}/${path}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const kind = classifyCollection(res.status);
      if (kind === "unauthorized" || kind === "membership_inactive") throw new OuraCall(kind, `Oura ${path} ${res.status}`);
      throw new Error(`Oura ${path} request failed (${res.status})`);
    }
    const body = await res.json();
    out.push(...(body.data ?? []));
    next = body.next_token ?? null;
  } while (next);
  return out;
}

async function pull(token: string, start: string, end: string) {
  try {
    const data = await Promise.all([
      fetchAll("daily_readiness", token, start, end),
      fetchAll("daily_sleep", token, start, end),
      fetchAll("sleep", token, start, end),
      fetchAll("daily_activity", token, start, end),
    ]);
    return { kind: "ok", data };
  } catch (e) {
    if (e instanceof OuraCall) return { kind: e.kind, data: null };
    throw e;
  }
}

async function applyDecision(userId: string, decision: string) {
  if (decision === "delete") {
    await markOuraDisconnected(userId);
    return { status: "disconnected" as const };
  }
  if (decision === "inactive") {
    await markMembershipInactive(userId);
    return { status: "membership_inactive" as const };
  }
  return null;
}

async function syncUser(userId: string, daysBack: number) {
  const loaded = await loadToken(userId, false);
  const start = isoDay(new Date(Date.now() - daysBack * 86400_000));
  const end = isoDay(new Date(Date.now() + 86400_000));
  let got = await pull(loaded.token, start, end);
  let decision = planSync({ refresh: loaded.refresh, api: got.kind });
  if (decision === "retry") {
    let retryRefresh = "refresh_failed";
    let retryApi: string | null = null;
    try {
      const again = await loadToken(userId, true);
      retryRefresh = again.refresh === "skipped" ? "ok" : again.refresh;
      got = await pull(again.token, start, end);
      retryApi = got.kind;
    } catch (e) {
      if (e instanceof OuraCall && e.kind === "revoked") return { status: "disconnected" as const };
      retryRefresh = e instanceof OuraCall && e.kind === "revoked" ? "revoked" : "refresh_failed";
    }
    decision = planSync({ refresh: loaded.refresh, api: "unauthorized", retryRefresh, retryApi });
  }
  const stopped = await applyDecision(userId, decision);
  if (stopped) return stopped;
  if (decision !== "save" || !got.data) throw new Error("Oura sync didn't finish.");

  const [readiness, dailySleep, sleep, activity] = got.data;
  const days: Record<string, any> = {};
  const day = (d: string) => (days[d] ??= { date: d });
  for (const r of readiness) { day(r.day).readiness = r.score; day(r.day).temp = r.temperature_deviation ?? null; }
  for (const s of dailySleep) day(s.day).sleepScore = s.score;
  const main: Record<string, any> = {};
  for (const p of sleep) if (!main[p.day] || (p.total_sleep_duration ?? 0) > (main[p.day].total_sleep_duration ?? 0)) main[p.day] = p;
  for (const [d, p] of Object.entries(main)) Object.assign(day(d), {
    total: p.total_sleep_duration ?? null, deep: p.deep_sleep_duration ?? null, rem: p.rem_sleep_duration ?? null,
    light: p.light_sleep_duration ?? null, awake: p.awake_time ?? null,
    hrv: p.average_hrv != null ? Math.round(p.average_hrv) : null, rhr: p.lowest_heart_rate ?? null,
  });
  for (const a of activity) day(a.day).steps = a.steps ?? null;

  let blocked: { from?: string; to?: string }[] = [];
  try {
    const { data: ud } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
    blocked = Array.isArray(ud?.data?.purges) ? ud.data.purges : [];
  } catch { /* still save the rest of the sync */ }
  const purged = (dayKey: string) => blocked.some((p) => p && p.from && p.to && dayKey >= p.from && dayKey <= p.to);
  for (const p of blocked) {
    if (p && p.from && p.to) await admin.from("oura_days").delete().eq("user_id", userId).gte("day", p.from).lte("day", p.to);
  }

  const now = new Date().toISOString();
  const rows = Object.values(days).filter((d: any) => !purged(d.date)).map((d: any) => ({ user_id: userId, day: d.date, data: d, updated_at: now }));
  if (rows.length) {
    const { error } = await admin.from("oura_days").upsert(rows, { onConflict: "user_id,day" });
    if (error) throw new Error(error.message);
  }
  await admin.from("oura_connections").update({ last_sync: now, last_error: null, status: "connected" }).eq("user_id", userId);
  return { status: "connected" as const, days: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let userId: string | null = null;
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Not signed in" }, 401);
    userId = user.id;
    const body = await req.json().catch(() => ({}));
    const daysBack = Math.min(365, Math.max(2, Number(body.days) || 14));
    const result = await syncUser(user.id, daysBack);
    if (result.status === "disconnected") return json({ ok: true, status: "disconnected" });
    if (result.status === "membership_inactive") return json({ ok: true, status: "membership_inactive" });
    return json({ ok: true, days: result.days });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const handled = e instanceof OuraCall && (e.kind === "revoked" || e.kind === "missing");
    if (userId && !handled) await admin.from("oura_connections").update({ last_error: msg }).eq("user_id", userId);
    if (e instanceof OuraCall && e.kind === "revoked") return json({ ok: true, status: "disconnected" });
    return json({ error: msg }, e instanceof OuraCall && e.kind === "missing" ? 400 : 500);
  }
});
