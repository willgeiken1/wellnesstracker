import { app } from "../runtime.js";
import { DEFAULT_DAY_ROLLOVER_HOUR, routineDayRolloverHour } from "./routine-dose.js";

/* Daily routines live on the liftlog-v1 blob under `dailyRoutines`.
   `routines` is already the workout-template list. Do not reuse that key.

   Plan rows (blocks, items, placements, compounds) and logs are separate
   collections. A plan edit changes one plan row. It does not rewrite a log.

   Each row is last-write-wins on `updatedAt`. The same `updatedAt` keeps the
   copy already on this phone. `deletedAt` > 0 is a tombstone: the winning row
   stays gone, and an older live copy cannot bring it back. A newer row with
   `deletedAt` null is how a delete is undone.

   Creating or replacing the store requires the compile-time flag and a
   signed-in session. Reading, merging, purging, and backup still round-trip
   a store that is already on the phone. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_SKEW_MS = 60_000;
const PLAN = new Set(["blocks", "items", "placements", "compounds"]);
const COLLECTIONS = new Set([...PLAN, "logs"]);
const KINDS = new Set(["check", "dose"]);
const STATUSES = new Set(["done", "skipped", "partial"]);
const LOG_STAMPS = ["loggedAt", "updatedAt", "createdAt", "at", "mod"];

export const DEFAULT_ROUTINE_BLOCKS = Object.freeze([
  Object.freeze({ name: "Morning routine", color: "citrus" }),
  Object.freeze({ name: "Supplement & enhancer stack", color: "lavender" }),
  Object.freeze({ name: "Night routine", color: "pink" }),
]);

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clip(value, max) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function plainFields(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = raw[key];
  }
  return out;
}

function entityBase(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 80) return null;
  const deletedAt = typeof raw.deletedAt === "number" && raw.deletedAt > 0 ? raw.deletedAt : null;
  return { id: raw.id, updatedAt: num(raw.updatedAt), deletedAt };
}

function amountOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBlock(raw) {
  const base = entityBase(raw);
  if (!base) return null;
  return { ...plainFields(raw), ...base, name: clip(raw.name, 80), color: clip(raw.color, 24) || "citrus", order: num(raw.order) };
}

function normalizeItem(raw) {
  const base = entityBase(raw);
  if (!base) return null;
  return {
    ...plainFields(raw),
    ...base,
    name: clip(raw.name, 80),
    kind: KINDS.has(raw.kind) ? raw.kind : "check",
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
  };
}

function normalizePlacement(raw) {
  const base = entityBase(raw);
  if (!base || typeof raw.blockId !== "string" || !raw.blockId || typeof raw.itemId !== "string" || !raw.itemId) return null;
  return { ...plainFields(raw), ...base, blockId: raw.blockId, itemId: raw.itemId, order: num(raw.order) };
}

function normalizeCompound(raw) {
  const base = entityBase(raw);
  if (!base) return null;
  return {
    ...plainFields(raw),
    ...base,
    name: clip(raw.name, 80),
    amount: amountOf(raw.amount),
    unit: clip(raw.unit, 16),
    startDate: validDay(raw.startDate) ? raw.startDate : null,
    archivedAt: typeof raw.archivedAt === "number" && raw.archivedAt > 0 ? raw.archivedAt : null,
  };
}

function normalizeLog(raw) {
  const base = entityBase(raw);
  if (!base || !validDay(raw.day) || !STATUSES.has(raw.status)) return null;
  return {
    ...plainFields(raw),
    ...base,
    itemId: typeof raw.itemId === "string" && raw.itemId ? raw.itemId : null,
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
    day: raw.day,
    status: raw.status,
    amount: amountOf(raw.amount),
    unit: clip(raw.unit, 16),
    at: num(raw.at),
  };
}

const NORMALIZE = {
  blocks: normalizeBlock,
  items: normalizeItem,
  placements: normalizePlacement,
  compounds: normalizeCompound,
  logs: normalizeLog,
};

function normalizeList(list, normalize) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  for (const raw of list) {
    const entity = normalize(raw);
    if (!entity) continue;
    const prev = byId.get(entity.id);
    if (!prev || entity.updatedAt >= prev.updatedAt) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

function normalizePrefs(raw) {
  const fields = plainFields(raw);
  return {
    ...fields,
    lastBlockId: typeof fields.lastBlockId === "string" && fields.lastBlockId ? fields.lastBlockId : null,
    updatedAt: num(fields.updatedAt),
  };
}

/* PR 8 owns the rest of this object. The day-start hour lives here so that
   sheet can read it. updatedAt 0 means the user has not chosen an hour, and
   a later explicit choice wins the merge. */
function normalizeSettings(raw) {
  const fields = plainFields(raw);
  return {
    ...fields,
    dayRolloverHour: routineDayRolloverHour(fields.dayRolloverHour),
    updatedAt: num(fields.updatedAt),
  };
}

export function emptyDailyRoutines(now = 0) {
  return {
    updatedAt: num(now),
    blocks: [],
    items: [],
    placements: [],
    compounds: [],
    logs: [],
    prefs: { lastBlockId: null, updatedAt: num(now) },
    settings: { dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR, updatedAt: 0 },
  };
}

export function normalizeDailyRoutines(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = normalizePrefs(raw.prefs);
  const settings = normalizeSettings(raw.settings);
  return {
    updatedAt: num(raw.updatedAt),
    blocks: normalizeList(raw.blocks, normalizeBlock),
    items: normalizeList(raw.items, normalizeItem),
    placements: normalizeList(raw.placements, normalizePlacement),
    compounds: normalizeList(raw.compounds, normalizeCompound),
    logs: normalizeList(raw.logs, normalizeLog),
    prefs,
    settings,
  };
}

export function isLive(entity) {
  return !!(entity && !(typeof entity.deletedAt === "number" && entity.deletedAt > 0));
}

export function liveOf(list) {
  return (Array.isArray(list) ? list : []).filter(isLive);
}

export function projectDailyRoutines(store) {
  const normalized = normalizeDailyRoutines(store);
  if (!normalized) return null;
  const blocks = liveOf(normalized.blocks).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    ...normalized,
    blocks,
    items: liveOf(normalized.items),
    placements: liveOf(normalized.placements),
    compounds: liveOf(normalized.compounds),
    logs: liveOf(normalized.logs),
  };
}

function copyEntity(entity) {
  return JSON.parse(JSON.stringify(entity));
}

/* Remote is applied first. This phone wins a tie, including a tie at 0. */
export function mergeEntityLists(local, remote) {
  const byId = new Map();
  const incoming = [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])];
  for (const entity of incoming) {
    if (!entity || typeof entity.id !== "string" || !entity.id) continue;
    const current = byId.get(entity.id);
    if (!current || num(entity.updatedAt) >= num(current.updatedAt)) byId.set(entity.id, copyEntity(entity));
  }
  return [...byId.values()];
}

function mergePrefs(local, remote) {
  if (num(local && local.updatedAt) >= num(remote && remote.updatedAt)) return { ...normalizePrefs(local) };
  return { ...normalizePrefs(remote) };
}

function mergeSettings(local, remote) {
  if (num(local && local.updatedAt) >= num(remote && remote.updatedAt)) return { ...normalizeSettings(local) };
  return { ...normalizeSettings(remote) };
}

export function mergeDailyRoutines(local, remote) {
  const left = normalizeDailyRoutines(local);
  const right = normalizeDailyRoutines(remote);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return {
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    blocks: mergeEntityLists(left.blocks, right.blocks),
    items: mergeEntityLists(left.items, right.items),
    placements: mergeEntityLists(left.placements, right.placements),
    compounds: mergeEntityLists(left.compounds, right.compounds),
    logs: mergeEntityLists(left.logs, right.logs),
    prefs: mergePrefs(left.prefs, right.prefs),
    settings: mergeSettings(left.settings, right.settings),
  };
}

function latestStamp(log) {
  let best = null;
  for (const key of LOG_STAMPS) {
    const stamp = typeof log[key] === "number" && Number.isFinite(log[key]) && log[key] > 0 ? log[key] : null;
    if (stamp != null && (best == null || stamp > best)) best = stamp;
  }
  return best;
}

/* Same rule as purge.js dropBefore: no cutoff clears the range; a missing
   stamp or a stamp more than a minute ahead is cleared; a stamp after the
   delete stays. */
function dropBefore(stamp, before, now) {
  if (before == null) return true;
  return stamp == null || stamp > now + CLOCK_SKEW_MS || stamp <= before;
}

function tombstoneAt(before, now) {
  if (typeof before === "number" && Number.isFinite(before) && before > 0) return before;
  if (typeof now === "number" && Number.isFinite(now) && now > 0) return now;
  return Date.now();
}

/* Calendar step for a YYYY-MM-DD string. UTC is only the calculator. */
function dayBefore(day) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

/* A 1:30 AM dose on the first selected calendar day is stored on the previous
   routine day. The match starts one day before `from` so that dose is removed.
   The day after `to` stays. The extra previous afternoon can go too; deleting
   more is the privacy-safe direction. The edge strip uses the same window. */
export function routineLogDayInPurge(day, from, to) {
  if (!validDay(day) || !validDay(from) || !validDay(to) || from > to) return false;
  return day >= dayBefore(from) && day <= to;
}

/* Tombstones logs whose day is inside the widened range. Blocks, items,
   placements, and compounds stay. The tombstone is what stops the other
   phone's older live log from coming back on the next merge. */
export function purgeDailyRoutineRange(data, from, to, before, now = Date.now()) {
  if (!data || typeof data !== "object" || !validDay(from) || !validDay(to) || from > to) return false;
  const routines = data.dailyRoutines;
  if (!routines || typeof routines !== "object" || Array.isArray(routines) || !Array.isArray(routines.logs)) return false;
  const cutoff = tombstoneAt(before, now);
  let changed = false;
  for (const log of routines.logs) {
    if (!log || typeof log !== "object") continue;
    if (typeof log.deletedAt === "number" && log.deletedAt > 0) continue;
    if (!routineLogDayInPurge(log.day, from, to)) continue;
    if (!dropBefore(latestStamp(log), before, now)) continue;
    log.deletedAt = cutoff;
    log.updatedAt = Math.max(num(log.updatedAt), cutoff);
    changed = true;
  }
  if (changed) routines.updatedAt = Math.max(num(routines.updatedAt), cutoff);
  return changed;
}

export function routineId(prefix) {
  return `${prefix || "r"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function canMutateRoutines() {
  return app.ROUTINES_ENABLED === true && !!(app.session && app.session.user);
}

export function putDailyRoutines(state, next) {
  if (!state || typeof state !== "object" || !canMutateRoutines()) return false;
  state.dailyRoutines = normalizeDailyRoutines(next) || emptyDailyRoutines(Date.now());
  return true;
}

/* Plan collections only. Logs are not a plan edit. */
export function revisePlanEntity(store, collection, id, patch, now) {
  const normalized = normalizeDailyRoutines(store);
  if (!normalized || !PLAN.has(collection) || typeof id !== "string") return normalized;
  const normalize = NORMALIZE[collection];
  const patchFields = plainFields(patch);
  delete patchFields.id;
  delete patchFields.updatedAt;
  delete patchFields.deletedAt;
  for (const key of COLLECTIONS) delete patchFields[key];
  normalized[collection] = normalized[collection].map((entity) => {
    if (!entity || entity.id !== id) return entity;
    const next = normalize({ ...entity, ...patchFields, id, updatedAt: now, deletedAt: entity.deletedAt });
    return next || entity;
  });
  normalized.updatedAt = num(now);
  return normalized;
}

/* A deleted block is still a block row. Seeding again would drop that
   tombstone and the placements that can restore it. */
export function seedDefaultBlocks(store, now, newId = () => routineId("block")) {
  const normalized = normalizeDailyRoutines(store) || emptyDailyRoutines(now);
  if (normalized.blocks.length) return normalized;
  const at = num(now);
  normalized.blocks = DEFAULT_ROUTINE_BLOCKS.map((block, index) => ({
    id: newId(block.name, index),
    name: block.name,
    color: block.color,
    order: index,
    updatedAt: at,
    deletedAt: null,
  }));
  normalized.updatedAt = at;
  return normalized;
}

export function upsertEntity(store, collection, entity, now) {
  const normalized = normalizeDailyRoutines(store) || emptyDailyRoutines(now);
  if (!COLLECTIONS.has(collection)) return normalized;
  const next = NORMALIZE[collection]({ ...plainFields(entity), updatedAt: now });
  if (!next) return normalized;
  const index = normalized[collection].findIndex((row) => row.id === next.id);
  if (index >= 0) normalized[collection][index] = next;
  else normalized[collection].push(next);
  normalized.updatedAt = num(now);
  return normalized;
}

app.normalizeDailyRoutines = normalizeDailyRoutines;
app.mergeDailyRoutines = mergeDailyRoutines;
app.purgeDailyRoutineRange = purgeDailyRoutineRange;
app.canMutateRoutines = canMutateRoutines;
app.putDailyRoutines = putDailyRoutines;
app.revisePlanEntity = revisePlanEntity;
app.seedDefaultBlocks = seedDefaultBlocks;
app.projectDailyRoutines = projectDailyRoutines;
