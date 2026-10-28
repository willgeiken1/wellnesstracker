// DRAFT ONLY, not deployed. User JWT + public publishable key; no service-role client.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  normalizePwa,
  importId,
  type ImportPlan,
} from "../_shared/pwa-import.ts";
import { pwaExerciseBank } from "../_shared/pwa-bank.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({});
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return reply({ error: "Sign in required." }, 401);
    // Standard runtime-injected public configuration only. Never a service-role key.
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      req.headers.get("apikey") ?? "",
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return reply({ error: "Sign in required." }, 401);
    const body = await req.json();
    if (!["preview", "commit"].includes(body.action))
      return reply({ error: "Invalid action." }, 400);
    const { data, error } = await client.rpc("native_pwa_snapshot");
    if (error) throw Error();
    if (data.completed) return reply({ plan: data.plan, completed: true });
    const mapping = body.mapping ?? {};
    if (
      typeof mapping !== "object" ||
      Array.isArray(mapping) ||
      Object.values(mapping).some((v) => typeof v !== "string")
    )
      return reply({ error: "Invalid mapping." }, 400);
    const plan: ImportPlan = normalizePwa(
      data.snapshot.blob,
      pwaExerciseBank,
      mapping,
    );
    for (const photo of data.snapshot.photos) {
      // Metadata only. No storage request and no OAuth/token access.
      if (
        typeof photo.path !== "string" ||
        !photo.path.startsWith(user.id + "/")
      )
        throw Error();
      const captured = Date.parse(photo.taken_at);
      const photoId = importId("pwa:photo:" + photo.id);
      plan.legacy[photoId] = photo;
      plan.issues.push({
        path: "photos:" + photo.id,
        reason: "legacy-photo-details",
        raw: photo,
      });
      plan.rows.push({
        table: "photos",
        id: photoId,
        data: {
          file_name: photo.path,
          captured_at: Number.isFinite(captured) ? captured : null,
        },
      });
    }
    if (body.action === "commit") {
      if (body.confirmed !== true)
        return reply({ error: "Preview confirmation required." }, 400);
      const rows = plan.rows.map((row) => ({
        ...row,
        owner_id: user.id,
        device_id: "00000000-0000-4000-8000-000000000019",
        updated_at: 1,
        deleted_at: null,
        // syncedV1Columns remains OFF: preserve extra values in the plan for local restore.
        data:
          row.table === "sets"
            ? Object.fromEntries(
                Object.entries(row.data).filter(([k]) => k !== "tag"),
              )
            : row.data,
      }));
      const { error } = await client.rpc("native_pwa_commit", {
        import_plan: plan,
        rows,
      });
      if (error) throw Error();
      // Another device may have committed a different mapping while this request
      // waited for the owner lock. Every caller must use the winning plan.
      const { data: committed, error: readError } = await client.rpc(
        "native_pwa_snapshot",
      );
      if (readError || !committed?.completed || !committed.plan) throw Error();
      return reply({ plan: committed.plan, completed: true });
    }
    return reply({ plan, completed: false });
  } catch {
    return reply(
      { error: "Import unavailable. Your original backup is unchanged." },
      503,
    );
  }
});
