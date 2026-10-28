import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import * as importer from "../../../supabase/functions/_shared/pwa-import";
import * as bank from "../../../supabase/functions/_shared/pwa-bank";
import { legacyV2 } from "../../fixtures/pwa-import";
import { OWNER_A } from "../../fixtures/sync";
const empty = { version: 1, rows: [], issues: [], unmapped: [], legacy: {} };
function edge(
  snapshot: unknown = { blob: legacyV2, photos: [] },
  committed = true,
  completed = false,
) {
  const rpc = jest.fn(async (name: string) =>
    name === "native_pwa_snapshot"
      ? {
          data: { snapshot, completed, plan: null, preview_id: OWNER_A },
          error: null,
        }
      : { data: committed, error: null },
  );
  const client = {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: OWNER_A } },
        error: null,
      })),
    },
    rpc,
  };
  let handler!: (request: Request) => Promise<Response>;
  const code = ts.transpileModule(
    readFileSync(
      join(__dirname, "../../../supabase/functions/pwa-import/index.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("require", "Deno", "exports", code)(
    (name: string) => {
      if (name.startsWith("npm:")) return { createClient: () => client };
      if (name.endsWith("pwa-import.ts")) return importer;
      if (name.endsWith("pwa-bank.ts")) return bank;
      throw Error("Unexpected module");
    },
    {
      serve: (fn: typeof handler) => {
        handler = fn;
      },
      env: { get: () => "https://synthetic.invalid" },
    },
    {},
  );
  const request = (body: string) =>
    handler(
      new Request("https://synthetic.invalid/import", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
        body,
      }),
    );
  return { request, rpc };
}
test("edge caps streamed request bytes without relying on Content-Length", async () => {
  const { request, rpc } = edge();
  const response = await request(
    JSON.stringify({
      action: "preview",
      mapping: { fixture: "x".repeat(65536) },
    }),
  );
  expect(response.status).toBe(413);
  expect((await response.json()).error).toMatch(/too large/i);
  expect(rpc).not.toHaveBeenCalled();
});
test("edge rejects oversized frozen imports before normalization or commit", async () => {
  const { request, rpc } = edge({
    blob: {
      sessions: [],
      machineNotes: { fixture: "x".repeat(5 * 1024 * 1024) },
    },
    photos: [],
  });
  const response = await request(
    JSON.stringify({
      action: "commit",
      confirmed: true,
      expected_preview: OWNER_A,
    }),
  );
  expect(response.status).toBe(413);
  expect((await response.json()).error).toMatch(/too large/i);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(["native_pwa_snapshot"]);
});
test("winning commit returns its in-memory plan without retaining a server archive", async () => {
  const { request, rpc } = edge();
  const response = await request(
    JSON.stringify({
      action: "commit",
      confirmed: true,
      expected_preview: OWNER_A,
    }),
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.completed).toBe(true);
  expect(rpc).toHaveBeenCalledWith(
    "native_pwa_commit",
    expect.objectContaining({ expected_preview: OWNER_A }),
  );
  expect(rpc).toHaveBeenCalledWith("native_pwa_snapshot", {
    refresh_expired: false,
  });
  expect(data.plan.rows.length).toBeGreaterThan(0);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "native_pwa_snapshot",
    "native_pwa_commit",
  ]);
});
test("a losing concurrent commit returns an empty receipt instead of replaying its mapping", async () => {
  const { request } = edge(undefined, false);
  const response = await request(
    JSON.stringify({
      action: "commit",
      confirmed: true,
      expected_preview: OWNER_A,
    }),
  );
  expect(await response.json()).toEqual({ plan: empty, completed: true });
});
test("completed retries return an empty receipt after server archive cleanup", async () => {
  const { request, rpc } = edge({}, false, true);
  const response = await request(JSON.stringify({ action: "preview" }));
  expect(await response.json()).toEqual({ plan: empty, completed: true });
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(["native_pwa_snapshot"]);
});

test("snapshot SQL size refusal becomes a clear 413 response", async () => {
  const { request, rpc } = edge();
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Import too large" },
  } as never);
  const response = await request(JSON.stringify({ action: "preview" }));
  expect(response.status).toBe(413);
  expect((await response.json()).error).toMatch(/too large/i);
});

test("edge binds confirmation to the preview the user actually reviewed", async () => {
  const { request, rpc } = edge();
  const response = await request(
    JSON.stringify({
      action: "commit",
      confirmed: true,
      expected_preview: "expired-preview",
    }),
  );
  expect(response.status).toBe(409);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(["native_pwa_snapshot"]);
});
test("preview carries its UUID back to the client for later confirmation", async () => {
  const { request } = edge();
  const response = await request(JSON.stringify({ action: "preview" }));
  expect((await response.json()).plan.previewId).toBe(OWNER_A);
});
