import type { Draft } from "../../data/workout/store";
import type { Repository } from "../../data/repository";
import { syncedTables, validateRow, type Table } from "../../data/rows";
import {
  type ImportPlan,
  stableJson,
} from "../../../../supabase/functions/_shared/pwa-import";
export type { ImportPlan } from "../../../../supabase/functions/_shared/pwa-import";
export { normalizePwa } from "../../../../supabase/functions/_shared/pwa-import";
/**
 * Tables a restore from this app's own backup file may write: every synced table but the purge markers. Custom exercises,
 * the split and breaks are kept too, so a Replace restore brings them back instead of deleting them.
 */
const RESTORE_TABLES = syncedTables.filter((t) => t !== "purges");
export interface ImportPreview {
  plan: ImportPlan;
  owner: string;
  revision: number;
  mode: "merge" | "replace";
  /** Built from this app's own backup file, so its own tables (custom exercises, the split, breaks) come back too. */
  native?: boolean;
  counts: Record<string, number>;
  existing: number;
  removed: number;
}
/** Capture preview identity; a changing repository needs a fresh preview. */
export function previewImport(
  repo: Repository,
  plan: ImportPlan,
  mode: "merge" | "replace" = "merge",
  native = false,
): ImportPreview {
  if (
    !plan ||
    plan.version !== 1 ||
    !Array.isArray(plan.rows) ||
    !Array.isArray(plan.issues) ||
    !Array.isArray(plan.unmapped) ||
    !plan.legacy ||
    typeof plan.legacy !== "object" ||
    Array.isArray(plan.legacy) ||
    plan.unmapped.some((n) => typeof n !== "string") ||
    plan.issues.some(
      (i) => !i || typeof i.path !== "string" || typeof i.reason !== "string",
    )
  )
    throw new Error("Invalid import plan.");
  const allowed = native
    ? RESTORE_TABLES
    : syncedTables.filter(
        (t) => !["purges", "custom_exercises", "plans", "pauses"].includes(t),
      );
  const counts: Record<string, number> = {};
  let existing = 0;
  for (const row of plan.rows) {
    if (!allowed.includes(row.table as Table))
      throw new Error("Invalid import table.");
    const syncRow = { ...row };
    delete syncRow.source_created_at;
    validateRow({
      ...syncRow,
      owner_id: repo.owner,
      device_id: repo.device,
      updated_at: 1,
      deleted_at: null,
    });
    counts[row.table] = (counts[row.table] ?? 0) + 1;
    if (repo.get(row.table as Table, row.id)) existing++;
  }
  return {
    plan: JSON.parse(stableJson(plan)),
    owner: repo.owner,
    revision: repo.getRevision(),
    mode,
    ...(native ? { native: true } : {}),
    counts,
    existing,
    removed:
      mode === "replace"
        ? syncedTables
            .filter((t) => t !== "purges" && t !== "home_layout")
            .reduce(
              (n, t) =>
                n +
                repo
                  .list(t)
                  .filter(
                    (r) =>
                      !plan.rows.some((p) => p.table === t && p.id === r.id),
                  ).length,
              0,
            )
        : 0,
  };
}
export function commitImport(
  repo: Repository,
  preview: ImportPreview,
  confirmed: boolean,
  replaceConfirmed = false,
): number {
  if (
    !confirmed ||
    preview.owner !== repo.owner ||
    preview.revision !== repo.getRevision() ||
    (preview.mode === "replace" && !replaceConfirmed)
  )
    throw new Error("Import confirmation required.");
  let added = 0;
  repo.atomic(() => {
    if (repo.owner === "guest")
      repo.localSave("pwaPendingAccountPlan", preview.plan);
    if (preview.mode === "replace")
      for (const table of syncedTables.filter(
        (t) => t !== "purges" && t !== "home_layout",
      ))
        for (const row of repo.list(table))
          if (
            !preview.plan.rows.some((p) => p.table === table && p.id === row.id)
          )
            repo.remove(table, row.id);
    const imported = new Set(repo.localGet<string[]>("pwaImportedIds") ?? []);
    const hadHome =
      repo.localGet("pwaHomeImported") === true ||
      repo.list("home_layout", true).length > 0;
    const custom =
      repo.localGet<{ name: string; helpers: string[]; equipment: string }[]>(
        "customLifts",
      ) ?? [];
    for (const row of preview.plan.rows) {
      if (row.table === "home_layout" && hadHome) continue;
      // Values gated off on the wire are retained even if row sync already pulled this ID.
      repo.localSave("pwaOriginal:" + row.id, row);
      if (Object.hasOwn(preview.plan.legacy, row.id))
        repo.localSave("pwaLegacy:" + row.id, preview.plan.legacy[row.id]);
      if (
        row.table === "sets" &&
        !repo.syncFlags.syncedV1Columns &&
        ["warmup", "failure", "drop"].includes(String(row.data.tag))
      ) {
        const entry = String(row.data.entry_id),
          position = Number(row.data.position),
          key = "draft:" + entry;
        const drafts = repo.localGet<Draft[]>(key) ?? [];
        if (
          Number.isInteger(position) &&
          position >= 0 &&
          position < 100 &&
          !drafts[position]
        ) {
          while (drafts.length <= position)
            drafts.push({ weight: "", reps: "" });
          drafts[position] = {
            weight: "",
            reps: "",
            setId: row.id,
            tag: row.data.tag as Draft["tag"],
            warmup: row.data.tag === "warmup",
          };
          repo.localSave(key, drafts);
        }
      }
      if (
        preview.mode === "merge" &&
        (imported.has(row.table + ":" + row.id) ||
          repo.get(row.table as Table, row.id) ||
          (["profile", "settings"].includes(row.table) &&
            repo.list(row.table as Table, true).length))
      )
        continue;
      repo.save(row.table as Table, row.data, row.id);
      imported.add(row.table + ":" + row.id);
      added++;
    }
    for (const name of preview.plan.unmapped)
      if (!custom.some((e) => e.name.toLowerCase() === name.toLowerCase()))
        custom.push({ name, helpers: [], equipment: "other" });
    const importedProfile = preview.plan.rows.find(
      (r) => r.table === "profile",
    );
    if (
      importedProfile &&
      preview.plan.legacy[importedProfile.id] &&
      !repo.localGet("profileExtras")
    ) {
      const old = preview.plan.legacy[importedProfile.id] as {
        sex?: string;
        activity?: string;
      };
      repo.localSave("profileExtras", {
        sex: ["male", "female"].includes(old.sex ?? "") ? old.sex : "",
        activity: ["sitting", "light", "active", "very"].includes(
          old.activity ?? "",
        )
          ? old.activity
          : "light",
      });
    }
    repo.localSave("customLifts", custom);
    repo.localSave("pwaImportedIds", [...imported]);
    const prior = repo.localGet<ImportPlan["issues"]>("pwaImportIssues") ?? [];
    const issues = new Map(
      [...prior, ...preview.plan.issues].map((i) => [stableJson(i), i]),
    );
    repo.localSave("pwaImportIssues", [...issues.values()]);
    if (preview.plan.home && !hadHome) {
      repo.localSave("pwaHomeImported", true);
      repo.localSave("pwaHomeV2", preview.plan.home);
    }
  });
  return added;
}

type NativeBackup = { format: "insight-phone-only" | "insight-account"; version: 1; rows: Record<string, unknown>; local: Record<string, unknown> };
/** A file from Settings › Save a backup file (this app's own format), or null for any other file. */
export function nativeBackup(input: unknown): NativeBackup | null {
  const v = input as Partial<NativeBackup> | null;
  if (!v || typeof v !== "object" || (v.format !== "insight-phone-only" && v.format !== "insight-account") || v.version !== 1) return null;
  if (!v.rows || typeof v.rows !== "object" || Array.isArray(v.rows)) throw new Error("Invalid backup.");
  return { format: v.format, version: 1, rows: v.rows, local: v.local && typeof v.local === "object" && !Array.isArray(v.local) ? v.local : {} };
}
/** The import plan for one of this app's backup files: every row still kept in it, removed ones left out. */
export function nativeBackupPlan(backup: NativeBackup): ImportPlan {
  const rows: ImportPlan["rows"] = [];
  for (const table of RESTORE_TABLES) {
    const list = backup.rows[table];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error("Invalid backup.");
    for (const r of list as { id?: unknown; data?: unknown; deleted_at?: unknown }[]) {
      if (!r || typeof r.id !== "string" || !r.data || typeof r.data !== "object" || Array.isArray(r.data)) throw new Error("Invalid backup.");
      if (r.deleted_at != null) continue;
      rows.push({ table, id: r.id, data: r.data as ImportPlan["rows"][number]["data"] });
    }
  }
  return { version: 1, rows, issues: [], unmapped: [], legacy: {} };
}
/**
 * After a restore, the phone-side details saved with it (a workout's unsaved set rows, RPE, sides, settings). A merge adds
 * any the phone does not have yet, and the set rows of a workout the restore brought back; Replace writes every one of them.
 * The importer's own bookkeeping is left alone.
 */
/**
 * The phone's kept photo files, which the restore must not lose track of: `names` reads which files the stored addresses
 * point at, and `settle` deletes the ones no address names after the restore, keeping the address of any it can't delete.
 */
export interface RestorePhotos<T> {
  names(repo: Repository): T;
  settle(repo: Repository, before: T): void;
}
export function restoreNativeLocal<T>(
  repo: Repository,
  backup: NativeBackup,
  newEntries: ReadonlySet<string>,
  mode: "merge" | "replace",
  photos: RestorePhotos<T>,
) {
  repo.atomic(() => {
    const before = photos.names(repo);
    for (const [key, value] of Object.entries(backup.local)) {
      if (key.startsWith("pwa") || key === "foodAi" || key.startsWith("barcode:")) continue;
      const fresh = key.startsWith("draft:") && newEntries.has(key.slice(6));
      // Replace puts the file's details back over the phone's; a merge only fills in what the phone does not have.
      if (mode === "merge" && repo.localGet(key) !== undefined && !fresh) continue;
      repo.localSave(key, value);
    }
    // A Replace can write over photo addresses; their files go too, and one that won't delete keeps its address.
    photos.settle(repo, before);
  });
}
