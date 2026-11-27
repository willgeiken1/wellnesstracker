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
/**
 * A file opened while signed out follows the first account on this device: its plan, kept by the guest's import, goes
 * into the account once, as a merge, with the same tables it was read with. Returns how many rows it added, or null when
 * nothing was waiting.
 */
export function commitPendingAccountImport(guest: Repository, account: Repository): number | null {
  const plan = guest.localGet<ImportPlan>("pwaPendingAccountPlan");
  if (!plan) return null;
  const native = guest.localGet<boolean>("pwaPendingAccountNative") === true;
  const local = guest.localGet<Record<string, unknown>>("pwaPendingAccountLocal");
  // The rows come as the guest has them now: one deleted since the restore stays deleted, and one changed comes with its
  // changes. Values the guest never stored (columns not synced yet) stay as the file had them.
  const tables = new Set<string>(syncedTables);
  const current: ImportPlan = {
    ...plan,
    rows: plan.rows.flatMap((row) => {
      const now = tables.has(row.table) ? guest.get(row.table as Table, row.id) : undefined;
      if (!now) return [row];
      if (now.deleted_at !== null) return [];
      return [{ ...row, data: { ...row.data, ...(now.data as ImportPlan["rows"][number]["data"]) } }];
    }),
  };
  return account.atomic(() => {
    const newEntries = new Set(current.rows.filter((r) => r.table === "entries" && !account.get("entries", r.id)).map((r) => r.id));
    const added = commitImport(account, previewImport(account, current, "merge", native), true);
    // The phone-side details of a backup restored while signed out (water, routines, a workout's set rows) come too,
    // merged like any restore; photo addresses were never kept for the account, so no photo file changes hands.
    // They come as the guest has them now, so a drink or check-off removed since the restore stays removed.
    if (native && local && typeof local === "object" && !Array.isArray(local)) {
      const now = Object.fromEntries(
        Object.keys(local).flatMap((key) => {
          // A workout removed since the restore takes its unsaved set rows with it.
          if (key.startsWith("draft:") && guest.get("entries", key.slice(6))?.deleted_at !== null) return [];
          const value = guest.localGet<unknown>(key);
          return value === undefined || value === null ? [] : [[key, value]];
        }),
      );
      restoreNativeLocal(account, { format: "insight-phone-only", version: 1, rows: {}, local: now }, newEntries, "merge", { names: () => null, settle: () => {} });
    }
    guest.localSave("pwaPendingAccountPlan", null);
    guest.localSave("pwaPendingAccountNative", null);
    guest.localSave("pwaPendingAccountLocal", null);
    return added;
  });
}
/** Two plans waiting for the account as one: a row both hold keeps the first file's copy, as the guest's merge did. */
function joinPlans(first: ImportPlan, second: ImportPlan): ImportPlan {
  const held = new Set(first.rows.map((r) => r.table + ":" + r.id));
  return {
    ...first,
    rows: [...first.rows, ...second.rows.filter((r) => !held.has(r.table + ":" + r.id))],
    issues: [...first.issues, ...second.issues],
    unmapped: [...new Set([...first.unmapped, ...second.unmapped])],
    legacy: { ...second.legacy, ...first.legacy },
    ...(first.home !== undefined || second.home !== undefined ? { home: first.home ?? second.home } : {}),
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
    if (repo.owner === "guest") {
      // A second file merged in while signed out joins the first one waiting for the account, as it joined the
      // guest's rows; a Replace leaves only its own file waiting.
      const prior = preview.mode === "merge" ? repo.localGet<ImportPlan>("pwaPendingAccountPlan") : null;
      repo.localSave("pwaPendingAccountPlan", prior ? joinPlans(prior, preview.plan) : preview.plan);
      // A plan from this app's own backup holds tables a web app import can't, so the account import must know it.
      repo.localSave(
        "pwaPendingAccountNative",
        preview.native === true || (!!prior && repo.localGet<boolean>("pwaPendingAccountNative") === true),
      );
    }
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
 * The phone's kept photo files, which the restore must not lose track of: `names` reads which files the stored addresses
 * point at, and `settle` deletes the ones no address names after the restore, keeping the address of any it can't delete.
 */
export interface RestorePhotos<T> {
  names(repo: Repository): T;
  settle(repo: Repository, before: T): void;
}
/** Photo addresses (as src/core/owner-files.ts keeps them). Their files belong to one person on this phone, so a
 * signed-out restore never hands them on to an account. */
export const PHOTO_ADDRESS_KEYS = ["profilePhoto", "profilePhotoLeftovers", "progressPhotos", "progressPhotosPending"];
/**
 * What a Replace restore clears when the file doesn't hold it: the histories kept in local storage, the split and the
 * plan's days (whose templates the Replace may have removed) and the photo lists. A workout's unsaved set rows go too.
 */
const REPLACE_CLEARS = ["foodWater", "routines", "progressNeck", "progressBodyFat", "split:def", "split:state", "plans:definition", "plans:name",
  ...PHOTO_ADDRESS_KEYS];
/** Details a restore never takes from the file: the importer's own bookkeeping, AI photos and barcode caches. */
const skipped = (key: string) => key.startsWith("pwa") || key === "foodAi" || key.startsWith("barcode:");

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** Adds the file's entries the phone's list doesn't have, matched by `id`; the phone's own stay as they are. */
function byId(mine: unknown, theirs: unknown): unknown[] {
  const a = Array.isArray(mine) ? mine : [], b = Array.isArray(theirs) ? theirs : [];
  const have = new Set(a.map((x) => (isObj(x) ? x.id : undefined)).filter((x) => x !== undefined));
  return [...a, ...b.filter((x) => isObj(x) && x.id !== undefined && !have.has(x.id))];
}
/** Adds the file's days the phone's list doesn't have; a day the phone already has keeps the phone's value. */
function byDay(mine: unknown, theirs: unknown): unknown[] {
  const a = Array.isArray(mine) ? mine : [], b = Array.isArray(theirs) ? theirs : [];
  const have = new Set(a.map((x) => (isObj(x) ? x.day : undefined)));
  return [...a, ...b.filter((x) => isObj(x) && typeof x.day === "string" && !have.has(x.day))];
}
/** Day → entries: each day takes the file's entries the phone's day doesn't have. */
function nested(mine: unknown, theirs: unknown, inner: (m: unknown, t: unknown) => unknown): Obj {
  const a = isObj(mine) ? mine : {}, b = isObj(theirs) ? theirs : {}, out: Obj = { ...a };
  for (const [day, v] of Object.entries(b)) out[day] = Object.hasOwn(a, day) ? inner(a[day], v) : v;
  return out;
}
/** Keys: the file's ones the phone's object doesn't have; the phone's own values stay. */
const keys = (mine: unknown, theirs: unknown): Obj => ({ ...(isObj(theirs) ? theirs : {}), ...(isObj(mine) ? mine : {}) });
/**
 * A merge of a history kept in local storage (water, routine check-offs, neck and manual body fat): the phone's history
 * gains every record that is only in the file, and its own records and settings stay. Null for a key that isn't a
 * history, or a history whose shape can't be read, which a merge leaves as the phone has it.
 */
function mergeHistory(key: string, mine: unknown, theirs: unknown): unknown {
  if (key === "progressNeck" || key === "progressBodyFat") return Array.isArray(mine) && Array.isArray(theirs) ? byDay(mine, theirs) : null;
  if (!isObj(mine) || !isObj(theirs)) return null;
  if (key === "foodWater") return { ...mine, log: nested(mine.log, theirs.log, byId) };
  if (key === "routines") {
    // A routine is one routine whether it is shown or hidden: one the phone has in either list stays where the phone has
    // it, so a routine since brought back is never added again as hidden, or the other way round.
    const list = (l: unknown) => (Array.isArray(l) ? l : []);
    const taken = new Set([...list(mine.routines), ...list(mine.hidden)].map((r) => (isObj(r) ? r.id : undefined)));
    const fresh = (l: unknown) => list(l).filter((r) => isObj(r) && r.id !== undefined && !taken.has(r.id) && !!taken.add(r.id));
    const routines = [...list(mine.routines), ...fresh(theirs.routines)];
    const hidden = [...list(mine.hidden), ...fresh(theirs.hidden)];
    return {
      ...mine,
      routines,
      hidden,
      items: byId(mine.items, theirs.items),
      log: nested(mine.log, theirs.log, keys),
      ...(mine.used !== undefined || theirs.used !== undefined ? { used: nested(mine.used, theirs.used, keys) } : {}),
    };
  }
  return null;
}
/**
 * After a restore, the phone-side details saved with it (a workout's unsaved set rows, RPE, sides, water, routines,
 * settings). A merge adds any the phone does not have yet, the records of a history that only the file has, and the set
 * rows of a workout the restore brought back; Replace writes every one of them. A restore made while signed out keeps
 * these details, photo addresses aside, for the first account on this phone, as it keeps the rows.
 */
export function restoreNativeLocal<T>(
  repo: Repository,
  backup: NativeBackup,
  newEntries: ReadonlySet<string>,
  mode: "merge" | "replace",
  photos: RestorePhotos<T>,
) {
  repo.atomic(() => {
    const before = photos.names(repo);
    // Replace puts the phone back as the file has it, so a history or photo list the file never had goes too, and the
    // photo files it named go with it below.
    if (mode === "replace") {
      const drafts = typeof repo.localSnapshot === "function" ? Object.keys(repo.localSnapshot()).filter((key) => key.startsWith("draft:")) : [];
      for (const key of [...REPLACE_CLEARS, ...drafts]) if (!Object.hasOwn(backup.local, key) && repo.localGet(key) != null) repo.localSave(key, null);
    }
    for (const [key, value] of Object.entries(backup.local)) {
      if (skipped(key)) continue;
      const fresh = key.startsWith("draft:") && newEntries.has(key.slice(6));
      // Replace puts the file's details back over the phone's; a merge only fills in what the phone does not have.
      const mine = mode === "merge" && !fresh ? repo.localGet(key) : undefined;
      // A history a Replace cleared is kept as null: nothing there, so the file's history comes in whole.
      if (mine !== undefined && mine !== null) {
        const merged = mergeHistory(key, mine, value);
        if (merged != null) repo.localSave(key, merged);
        continue;
      }
      repo.localSave(key, value);
    }
    // A Replace can write over photo addresses; their files go too, and one that won't delete keeps its address.
    photos.settle(repo, before);
    if (repo.owner === "guest") {
      const kept = Object.entries(backup.local).filter(([key]) => !skipped(key) && !PHOTO_ADDRESS_KEYS.includes(key));
      // A merge while signed out adds to what an earlier file left waiting, record by record as on the phone; a
      // Replace leaves only this file's details waiting.
      const prior = mode === "merge" ? repo.localGet<unknown>("pwaPendingAccountLocal") : null;
      const waiting: Record<string, unknown> = isObj(prior) ? { ...prior } : {};
      for (const [key, value] of kept) {
        const fresh = key.startsWith("draft:") && newEntries.has(key.slice(6));
        if (!isObj(prior) || fresh || waiting[key] === undefined || waiting[key] === null) waiting[key] = value;
        else waiting[key] = mergeHistory(key, waiting[key], value) ?? waiting[key];
      }
      repo.localSave("pwaPendingAccountLocal", waiting);
    }
  });
}
