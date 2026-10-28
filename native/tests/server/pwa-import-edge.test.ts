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

test.each(["Import preview expired", "Import preview changed", "Preview required"])("SQL %s maps to a safe 409", async message => {
  const { request, rpc } = edge();
  rpc.mockResolvedValueOnce({data:{snapshot:{blob:legacyV2,photos:[]},completed:false,preview_id:OWNER_A},error:null} as never);
  rpc.mockResolvedValueOnce({data:null,error:{message}} as never);
  const response = await request(JSON.stringify({action:"commit",confirmed:true,expected_preview:OWNER_A}));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatch(/Preview again/);
});

test.each(["lookup", "commit"])("missing or expired preview at %s maps to 409", async stage => {
  const { request, rpc } = edge();
  if (stage === "commit") rpc.mockResolvedValueOnce({data:{snapshot:{blob:legacyV2,photos:[]},completed:false,preview_id:OWNER_A},error:null} as never);
  rpc.mockResolvedValueOnce({data:null,error:null} as never);
  const response = await request(JSON.stringify({action:"commit",confirmed:true,expected_preview:OWNER_A}));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatch(/Preview again/);
});

test("preview and commit after purge omit old in-range rows and retain later creations", async () => {
  const cutoff = Date.now() - 10000;
  const blob = { version: 2, workouts: [], sessions: [
    { id: "old", date: "2026-01-02", createdAt: cutoff, mod: cutoff + 1, entries: [] },
    { id: "unknown", date: "2026-01-02", mod: cutoff + 1, entries: [] },
    { id: "outside", date: "2026-01-03", createdAt: cutoff, entries: [] },
    { id: "new", date: "2026-01-02", createdAt: cutoff + 1, entries: [] },
  ] };
  const { request, rpc } = edge({blob, photos: [], purges: [{from_day:"2026-01-02",to_day:"2026-01-02",cutoff_ms:cutoff,tz:"UTC"}]});
  const preview = await request(JSON.stringify({action:"preview"}));
  const plan = (await preview.json()).plan;
  expect(plan.rows.filter((r: importer.ImportRow) => r.table === "sessions")).toHaveLength(2);
  expect(Object.values(plan.legacy).map(v => (v as {id:string}).id)).not.toContain("old");
  const committed = await request(JSON.stringify({action:"commit",confirmed:true,expected_preview:OWNER_A}));
  expect(committed.status).toBe(200);
  const batch = (rpc.mock.calls as unknown[][]).find(c => c[0] === "native_pwa_commit")![1] as {rows: {updated_at:number}[]};
  expect(batch.rows.map(r => r.updated_at)).toEqual([cutoff, cutoff + 1]);
});

test("repeated purge preview filters every dated domain and session descendants", async () => {
  const cutoff = Date.UTC(2026, 0, 2, 12);
  const old = cutoff - 1, fresh = cutoff + 1;
  const blob = {...legacyV2,
    sessions: [
      {...legacyV2.sessions[0], id:"old", startedAt: old},
      {...legacyV2.sessions[0], id:"fresh", startedAt: fresh},
    ],
    profile: {...legacyV2.profile, weighIns:[{date:"2026-01-02",kg:75,at:old},{date:"2026-01-02",kg:76,at:fresh}]},
    food: {days:{"2026-01-02":[{...legacyV2.food.days["2026-01-02"][0],id:"old",loggedAt:old},{...legacyV2.food.days["2026-01-02"][0],id:"fresh",loggedAt:fresh}]}},
    cardio: {sessions:[{...legacyV2.cardio.sessions[0],id:"old",loggedAt:old},{...legacyV2.cardio.sessions[0],id:"fresh",loggedAt:fresh}]},
    measurements: {"2026-01-02":{at:old,vals:{waist:80}},"2026-01-03":{at:fresh,vals:{waist:81}}},
    plan:{"2026-01-02":"push","2026-01-03":"push"},planAt:{"2026-01-02":old,"2026-01-03":fresh},
  };
  const photos = [old, fresh].map((at,i) => ({id:String(i),day:"2026-01-02",taken_at:new Date(at).toISOString(),path:OWNER_A+"/fixture"+i}));
  const {request} = edge({blob,photos,purges:[
    {from_day:"2026-01-02",to_day:"2026-01-02",cutoff_ms:cutoff,tz:"UTC"},
    {from_day:"2026-01-03",to_day:"2026-01-03",cutoff_ms:cutoff,tz:"UTC"},
  ]});
  const response = await request(JSON.stringify({action:"preview"}));
  expect(response.status).toBe(200);
  const plan = (await response.json()).plan as importer.ImportPlan;
  for(const table of ["sessions","entries","sets","weigh_ins","food_entries","cardio_sessions","measurements","plan_days","photos"]){
    const matching = plan.rows.filter(r => r.table === table);
    expect(matching).toHaveLength(1);
    expect(matching[0].source_created_at).toBe(fresh);
  }
});
