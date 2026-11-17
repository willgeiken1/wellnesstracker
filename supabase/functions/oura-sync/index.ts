// oura-sync: pulls the signed-in user's Oura data and stores one row per day.
// Body: { "days": 14 } -> how far back to fetch (the first sync uses 120).
// Deploy with JWT verification OFF; this function checks the user's sign-in itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { connectionMark, OuraUnauthorized, readWithAccess, saveDays } from "../_shared/oura-store.js";

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
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Asks Oura's token endpoint for a new login. oura-store decides what the answer means. */
const exchange = (refreshToken: string) => fetch("https://api.ouraring.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: Deno.env.get("OURA_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("OURA_CLIENT_SECRET") ?? "",
  }),
});

async function fetchAll(path: string, token: string, start: string, end: string) {
  const out: any[] = [];
  let next: string | null = null;
  do {
    const q = new URLSearchParams({ start_date: start, end_date: end });
    if (next) q.set("next_token", next);
    const res = await fetch(`${API}/${path}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    // A 401 means Oura turned the token down; oura-store gets a new one, or forgets the data if access was revoked.
    if (res.status === 401) throw new OuraUnauthorized(`Oura ${path} request failed (401)`);
    if (!res.ok) throw new Error(`Oura ${path} request failed (${res.status})`);
    const body = await res.json();
    out.push(...(body.data ?? []));
    next = body.next_token ?? null;
  } while (next);
  return out;
}

async function syncUser(userId: string, daysBack: number) {
  // The connection this sync belongs to. If it is disconnected while Oura is being read, nothing is kept.
  const mark = await connectionMark(admin, userId);
  if (!mark) throw new Error("Oura isn't connected");
  const start = isoDay(new Date(Date.now() - daysBack * 86400_000));
  const end = isoDay(new Date(Date.now() + 86400_000));
  const [readiness, dailySleep, sleep, activity] = await readWithAccess(admin, userId, mark, exchange, (token: string) => Promise.all([
    fetchAll("daily_readiness", token, start, end),
    fetchAll("daily_sleep", token, start, end),
    fetchAll("sleep", token, start, end),
    fetchAll("daily_activity", token, start, end),
  ]));

  const days: Record<string, any> = {};
  const day = (d: string) => (days[d] ??= { date: d });
  for (const r of readiness) { day(r.day).readiness = r.score; day(r.day).temp = r.temperature_deviation ?? null; }
  for (const s of dailySleep) day(s.day).sleepScore = s.score;
  // Several sleep periods can share a day (naps); keep the main one.
  const main: Record<string, any> = {};
  for (const p of sleep) if (!main[p.day] || (p.total_sleep_duration ?? 0) > (main[p.day].total_sleep_duration ?? 0)) main[p.day] = p;
  for (const [d, p] of Object.entries(main)) Object.assign(day(d), {
    total: p.total_sleep_duration ?? null, deep: p.deep_sleep_duration ?? null, rem: p.rem_sleep_duration ?? null,
    light: p.light_sleep_duration ?? null, awake: p.awake_time ?? null,
    hrv: p.average_hrv != null ? Math.round(p.average_hrv) : null, rhr: p.lowest_heart_rate ?? null,
  });
  for (const a of activity) day(a.day).steps = a.steps ?? null;

  // A privacy date-range delete must stay deleted. Skip those days and drop any copy already stored.
  let blocked: { from?: string; to?: string }[] = [];
  try {
    const { data: ud } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
    blocked = Array.isArray(ud?.data?.purges) ? ud.data.purges : [];
  } catch { /* still save the rest of the sync */ }
  const purged = (day: string) => blocked.some((p) => p && p.from && p.to && day >= p.from && day <= p.to);
  for (const p of blocked) {
    if (p && p.from && p.to) await admin.from("oura_days").delete().eq("user_id", userId).gte("day", p.from).lte("day", p.to);
  }

  const now = new Date().toISOString();
  const rows = Object.values(days).filter((d: any) => !purged(d.date)).map((d: any) => ({ user_id: userId, day: d.date, data: d, updated_at: now }));
  const kept = await saveDays(admin, userId, mark, rows);
  await admin.from("oura_connections").update({ last_sync: now, last_error: null }).eq("user_id", userId).eq("connected_at", mark);
  return kept;
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
    const n = await syncUser(user.id, daysBack);
    return json({ ok: true, days: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (userId) await admin.from("oura_connections").update({ last_error: msg }).eq("user_id", userId);
    return json({ error: msg }, 500);
  }
});
