import { normalizePwa } from "../../../supabase/functions/_shared/pwa-import";
import { legacyV1, legacyV2 } from "../../fixtures/pwa-import";
import { exerciseLibrary } from "../../src/core/workout/library";
import { previewImport, commitImport } from "../../src/features/importer/local";
import { localDatabase } from "./sqlite";
const bank = exerciseLibrary.map((e) => e.name);
test("v1 templates, aliases, pounds, unilateral BW, and old note strings", () => {
  const p = normalizePwa(legacyV1, bank);
  expect(p.rows.filter((r) => r.table === "sets")).toHaveLength(2);
  expect(p.rows.find((r) => r.table === "sets")?.data.weight_kg).toBeCloseTo(
    45.3592,
    3,
  );
  expect(p.rows.find((r) => r.table === "entries")?.data.exercise).toBe(
    "Bench Press",
  );
  expect(p.unmapped).toEqual(["Fixture pulley"]);
  expect(p.rows.find((r) => r.table === "machine_notes")?.data.text).toBe(
    "Seat 3",
  );
});
test("v2 SI golden domains, flagged unknowns, checkins and consent excluded", () => {
  const p = normalizePwa(legacyV2, bank);
  expect(
    p.rows.find((r) => r.table === "food_entries")?.data.energy_kj,
  ).toBeCloseTo(836.8, 6);
  expect(p.rows.find((r) => r.table === "food_entries")?.data.protein_g).toBe(
    10,
  );
  expect(
    p.rows.find((r) => r.table === "cardio_sessions")?.data.duration_ms,
  ).toBe(600000);
  expect(p.rows.find((r) => r.table === "measurements")?.data).toMatchObject({
    waist_m: 0.8,
    arm_m: 0.3,
  });
  expect(p.rows.filter((r) => r.table === "home_layout")).toHaveLength(3);
  expect(JSON.stringify(p)).not.toMatch(/ignored-fixture|analytics|appLock/);
  expect(p.issues.length).toBeGreaterThan(0);
});
test("preview read-only, confirmation required, twice adds nothing after local edit", async () => {
  const l = await localDatabase();
  try {
    const p = normalizePwa(legacyV2, bank),
      v = previewImport(l.repo, p);
    expect(l.repo.list("sets")).toHaveLength(0);
    expect(() => commitImport(l.repo, v, false)).toThrow();
    expect(commitImport(l.repo, v, true)).toBeGreaterThan(0);
    const row = l.repo.list("sessions")[0];
    l.repo.save("sessions", { ...row.data, name: "Edited" }, row.id);
    expect(commitImport(l.repo, previewImport(l.repo, p), true)).toBe(0);
    expect(l.repo.list("sessions")[0].data.name).toBe("Edited");
    expect(l.repo.localGet("pwaImportIssues")).toBeDefined();
  } finally {
    l.sqlite.close();
  }
});
test("replace requires separate confirmation, rejects stale preview", async () => {
  const l = await localDatabase();
  try {
    const p = normalizePwa(legacyV2, bank),
      v = previewImport(l.repo, p, "replace");
    expect(() => commitImport(l.repo, v, true)).toThrow();
    l.repo.save("sessions", { name: "New" });
    expect(() => commitImport(l.repo, v, true, true)).toThrow();
    expect(
      commitImport(l.repo, previewImport(l.repo, p, "replace"), true, true),
    ).toBeGreaterThan(0);
    expect(l.repo.list("sessions")).toHaveLength(1);
  } finally {
    l.sqlite.close();
  }
});
test("odd rows retained with raw payload and flags", () => {
  const p = normalizePwa(
    {
      sessions: [
        null,
        {
          date: "bad",
          entries: [{ exercise: "Fixture", sets: [{ w: "bad", r: -1 }] }],
        },
      ],
    },
    bank,
  );
  expect(p.rows.filter((r) => r.table === "sessions")).toHaveLength(2);
  expect(p.rows.filter((r) => r.table === "sets")).toHaveLength(1);
  expect(p.issues.length).toBeGreaterThan(2);
  expect(p.issues.some((i) => JSON.stringify(i.raw).includes("bad"))).toBe(
    true,
  );
});

test("server and native exercise bank stay identical", async () => {
  const { pwaExerciseBank } = await import(
    "../../../supabase/functions/_shared/pwa-bank"
  );
  expect(pwaExerciseBank).toEqual(bank);
});
test("measurement vals wrapper and mapping to custom preserve legacy details", () => {
  const p = normalizePwa(
    {
      ...legacyV2,
      measurements: { "2026-01-02": { vals: { waist: 80, neck: 35 }, at: 1 } },
    },
    bank,
  );
  expect(p.rows.find((r) => r.table === "measurements")?.data.waist_m).toBe(
    0.8,
  );
  const id = p.rows.find((r) => r.table === "measurements")!.id;
  expect(p.legacy[id]).toEqual({ vals: { waist: 80, neck: 35 }, at: 1 });
  expect(
    normalizePwa(legacyV1, bank, { "Fixture pulley": "Dips" }).unmapped,
  ).toEqual([]);
  expect(
    normalizePwa(legacyV1, bank, { "bench-press": "custom" }).unmapped,
  ).toContain("bench-press");
  expect(() =>
    normalizePwa(legacyV1, bank, { "Fixture pulley": "No such bank name" }),
  ).toThrow();
});
test("merging preserves an edited home layout and gated values stay off the wire", async () => {
  const l = await localDatabase();
  try {
    l.repo.save("home_layout", {
      widget: "native-first",
      position: 0,
      hidden: 0,
    });
    commitImport(
      l.repo,
      previewImport(l.repo, normalizePwa(legacyV2, bank)),
      true,
    );
    expect(l.repo.list("home_layout")).toHaveLength(1);
    expect(l.repo.list("sets")[0].data.tag).toBeNull();
    const set = l.repo.list("sets")[0];
    expect(
      l.repo.localGet<{ data: { tag: string } }>("pwaOriginal:" + set.id)?.data
        .tag,
    ).toBe("warmup");
    expect(l.repo.syncFlags.syncedV1Columns).toBe(false);
    expect(
      l.repo.localGet<{ warmup: boolean }[]>("draft:" + set.data.entry_id)?.[0]
        .warmup,
    ).toBe(true);
  } finally {
    l.sqlite.close();
  }
});
test("account mismatch refuses import and a failed write rolls the entire import back", async () => {
  const l = await localDatabase();
  try {
    const v = previewImport(l.repo, normalizePwa(legacyV2, bank));
    expect(() =>
      commitImport(l.repo, { ...v, owner: "other" }, true),
    ).toThrow();
    const save = l.repo.save.bind(l.repo);
    let writes = 0;
    const write = jest.spyOn(l.repo, "save").mockImplementation((...args) => {
      if (++writes === 3) throw Error("synthetic partial write failure");
      return save(...args);
    });
    expect(() => commitImport(l.repo, v, true)).toThrow();
    write.mockRestore();
    expect(l.repo.list("sessions")).toHaveLength(0);
    expect(l.repo.localGet("pwaImportedIds")).toBeUndefined();
    expect(commitImport(l.repo, v, true)).toBeGreaterThan(0);
  } finally {
    l.sqlite.close();
  }
});
test("photos fetch only on explicit view and reject remote or cross-owner paths", async () => {
  const { downloadImportedPhoto } = await import(
    "../../src/features/importer/photos"
  );
  const l = await localDatabase(),
    download = jest.fn(async () => new Blob(["synthetic photo"]));
  try {
    const r = l.repo.save("photos", {
      file_name: l.repo.owner + "/fixture.jpg",
    });
    expect(download).not.toHaveBeenCalled();
    await downloadImportedPhoto(l.repo, r.id, download);
    expect(download).toHaveBeenCalledTimes(1);
    l.repo.save(
      "photos",
      { file_name: "https://example.invalid/fixture.jpg" },
      r.id,
    );
    await expect(
      downloadImportedPhoto(l.repo, r.id, download),
    ).rejects.toThrow();
    l.repo.save("photos", { file_name: "other/fixture.jpg" }, r.id);
    await expect(
      downloadImportedPhoto(l.repo, r.id, download),
    ).rejects.toThrow();
    expect(download).toHaveBeenCalledTimes(1);
  } finally {
    l.sqlite.close();
  }
});
test("legacy tombstones and purge ranges never resurrect deleted logs", () => {
  const p = normalizePwa(
    {
      ...legacyV2,
      deleted: ["fixture-session"],
      food: { ...legacyV2.food, deleted: ["fixture-food"] },
      cardio: { ...legacyV2.cardio, deleted: ["fixture-cardio"] },
      purges: [{ from: "2026-01-02", to: "2026-01-02", at: 1800000000000 }],
    },
    bank,
  );
  expect(
    p.rows.some((r) =>
      [
        "sessions",
        "food_entries",
        "cardio_sessions",
        "weigh_ins",
        "measurements",
      ].includes(r.table),
    ),
  ).toBe(false);
  expect(p.issues.length).toBeGreaterThan(0);
});
test("malformed nested containers still produce flagged rows, rather than discarding data", () => {
  const p = normalizePwa(
    {
      sessions: [
        {
          date: "2026-01-01",
          entries: { exercise: "Dips", sets: { w: null, r: 5 } },
        },
      ],
    },
    bank,
  );
  expect(p.rows.filter((r) => r.table === "entries")).toHaveLength(1);
  expect(p.rows.filter((r) => r.table === "sets")).toHaveLength(1);
  expect(p.issues.filter((i) => i.reason === "collection")).toHaveLength(2);
});
test("unique close bank names link automatically, custom decisions still win", () => {
  const fixture = {
    sessions: [
      { date: "2026-01-01", entries: [{ exercise: "Bench presss", sets: [] }] },
    ],
  };
  expect(
    normalizePwa(fixture, bank).rows.find((r) => r.table === "entries")?.data
      .exercise,
  ).toBe("Bench Press");
  expect(
    normalizePwa(fixture, bank, { "Bench presss": "custom" }).unmapped,
  ).toEqual(["Bench presss"]);
});
test("preview rejects malformed or pull-only server plans before any writes", async () => {
  const l = await localDatabase();
  try {
    const p = normalizePwa(legacyV2, bank);
    expect(() =>
      previewImport(l.repo, { ...p, legacy: null } as unknown as typeof p),
    ).toThrow();
    expect(() =>
      previewImport(l.repo, {
        ...p,
        rows: [{ table: "purges", id: p.rows[0].id, data: {} }],
      }),
    ).toThrow();
    expect(l.repo.list("sessions")).toHaveLength(0);
  } finally {
    l.sqlite.close();
  }
});
test("implicit v1 routines and timestamps normalize once, while an explicit empty v2 stays empty", () => {
  const p = normalizePwa(
    {
      sessions: [
        {
          date: "2026-01-01",
          entries: [
            {
              exercise: "Dips",
              sets: [{ w: null, r: 5, at: "2026-01-01T10:00:00Z" }],
            },
          ],
        },
      ],
      restSeconds: 90,
    },
    bank,
  );
  expect(p.rows.filter((r) => r.table === "routines")).toHaveLength(3);
  expect(p.rows.find((r) => r.table === "sessions")?.data).toMatchObject({
    started_at: 1767261600000,
    finished_at: 1767261600000,
  });
  expect(p.rows.find((r) => r.table === "settings")?.data.rest_seconds).toBe(
    90,
  );
  expect(
    normalizePwa({ version: 2, sessions: [], workouts: [] }, bank).rows,
  ).toEqual([]);
});
test("unrepresentable legacy domains and duplicate source ids are retained flagged", () => {
  const p = normalizePwa(
    {
      sessions: [
        { id: "same", date: "2026-01-01" },
        { id: "same", date: "2026-01-01" },
      ],
      workouts: [],
      layout: { home: { order: ["today"] } },
      food: { days: "odd-fixture" },
    },
    bank,
  );
  expect(p.rows.filter((r) => r.table === "sessions")).toHaveLength(2);
  expect(p.issues.map((i) => i.reason)).toEqual(
    expect.arrayContaining([
      "duplicate-source-id",
      "legacy-home-layout",
      "shape",
    ]),
  );
  expect(p.issues.some((i) => i.raw === "odd-fixture")).toBe(true);
});
test("a backup imported during demo preserves review archives and account Home when carried over", async () => {
  const { Repository } = await import("../../src/data/repository");
  const { seedDemo } = await import("../../fixtures/demo");
  const { promoteDemo } = await import(
    "../../src/features/onboarding/demo-transfer"
  );
  const l = await localDatabase();
  try {
    const source = new Repository(
      l.db,
      "demo",
      l.repo.device,
      () => "40000000-0000-4000-8000-000000000099",
    );
    seedDemo(source);
    commitImport(
      source,
      previewImport(source, normalizePwa(legacyV2, bank)),
      true,
    );
    l.repo.save("home_layout", {
      widget: "native-first",
      position: 0,
      hidden: 0,
    });
    promoteDemo(source, l.repo);
    expect(
      l.repo.localGet<unknown[]>("pwaImportIssues")?.length,
    ).toBeGreaterThan(0);
    expect(l.repo.list("home_layout")).toHaveLength(1);
    expect(l.repo.localGet("pwaHomeImported")).toBe(true);
  } finally {
    l.sqlite.close();
  }
});
test("merge keeps existing singleton settings while preserving the imported originals", async () => {
  const l = await localDatabase();
  try {
    const row = l.repo.save("settings", { rest_seconds: 150 });
    const p = normalizePwa(
      { version: 2, sessions: [], workouts: [], restSeconds: 90 },
      bank,
    );
    commitImport(l.repo, previewImport(l.repo, p), true);
    expect(l.repo.list("settings")).toHaveLength(1);
    expect(l.repo.get("settings", row.id)?.data.rest_seconds).toBe(150);
    expect(l.repo.localGet("pwaOriginal:" + p.rows[0].id)).toBeDefined();
  } finally {
    l.sqlite.close();
  }
});

test("demo import does not recreate Home widgets after account layout deletion", async () => {
  const { Repository } = await import("../../src/data/repository");
  const { seedDemo } = await import("../../fixtures/demo");
  const { promoteDemo } = await import("../../src/features/onboarding/demo-transfer");
  const l = await localDatabase();
  try {
    const source = new Repository(l.db, "demo", l.repo.device,
      () => "40000000-0000-4000-8000-000000000099");
    seedDemo(source);
    commitImport(source, previewImport(source, normalizePwa(legacyV2, bank)), true);
    const home = l.repo.save("home_layout", { widget: "native-first", position: 0, hidden: 0 });
    l.repo.remove("home_layout", home.id);
    promoteDemo(source, l.repo);
    expect(l.repo.list("home_layout")).toHaveLength(0);
    expect(l.repo.list("home_layout", true)).toHaveLength(1);
  } finally {
    l.sqlite.close();
  }
});
