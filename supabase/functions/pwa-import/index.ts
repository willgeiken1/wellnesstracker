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
// Limits bound normalization and the raw archive; errors never include payloads.
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const emptyPlan: ImportPlan = {
  version: 1,
  rows: [],
  issues: [],
  unmapped: [],
  legacy: {},
};
class ImportTooLarge extends Error {}
async function requestBody(req: Request) {
  if (Number(req.headers.get("Content-Length")) > MAX_REQUEST_BYTES)
    throw new ImportTooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw Error();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ImportTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
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
    const body = await requestBody(req);
    if (!["preview", "commit"].includes(body.action))
      return reply({ error: "Invalid action." }, 400);
    const { data, error } = await client.rpc("native_pwa_snapshot", {
      refresh_expired: body.action === "preview",
    });
    if (error?.message === "Import too large") throw new ImportTooLarge();
    if (error) throw Error();
    if (data.completed) return reply({ plan: emptyPlan, completed: true });
    if (
      new TextEncoder().encode(JSON.stringify(data.snapshot)).byteLength >
      MAX_IMPORT_BYTES
    )
      throw new ImportTooLarge();
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
    plan.previewId = data.preview_id;
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
      if (body.expected_preview !== data.preview_id)
        return reply(
          { error: "Import preview changed. Preview again before confirming." },
          409,
        );
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
      const { data: won, error } = await client.rpc("native_pwa_commit", {
        import_plan: plan,
        expected_preview: body.expected_preview,
        rows,
      });
      if (error) throw Error();
      // Raw archives are erased atomically in SQL. Only the winner returns its
      // in-memory plan. Retries/other devices receive rows through normal sync.
      return reply({ plan: won ? plan : emptyPlan, completed: true });
    }
    return reply({ plan, completed: false });
  } catch (error) {
    if (error instanceof ImportTooLarge)
      return reply(
        {
          error:
            "Import too large. Maximum backup size is 5 MiB; request limit is 64 KiB.",
        },
        413,
      );
    return reply(
      { error: "Import unavailable. Your original backup is unchanged." },
      503,
    );
  }
});
