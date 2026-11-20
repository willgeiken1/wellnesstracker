import { app } from "../runtime.js";

/* Daily routines live on the liftlog-v1 blob under `dailyRoutines`.
   `routines` is already the workout-template list. Do not reuse that key.

   Plan rows (blocks, items, placements, compounds) and logs are separate
   collections. A plan edit changes one plan row. It does not rewrite a log.

   Each row is last-write-wins on max(updatedAt, deletedAt). A missing or
   malformed stamp is 0. A stamp more than a day ahead is pulled back to
   now + 1 day. The same stamp keeps the tombstone, then the greater stable
   JSON, so two phones pick the same row. `deletedAt` > 0 is a tombstone.
   A log tombstone keeps only id, day, status, updatedAt, and deletedAt.
   A newer live row is how a delete is undone.

   Creating or replacing the store requires the compile-time flag and a
   signed-in session. Reading, merging, purging, and backup still round-trip
   a store that is already on the phone. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_SKEW_MS = 60_000;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const LOG_TOMBSTONE_KEYS = ["id", "day", "status", "updatedAt", "deletedAt"];
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

function amountOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function itemKind(value) {
  if (KINDS.has(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 24);
  return "check";
}

function logStatus(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text ? text.slice(0, 24) : "";
}

/* A stamp more than a day ahead is stored as now + 1 day, same window as homeV2. */
function clampStamp(value, now) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  const clock = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const cap = clock + FUTURE_SLACK_MS;
  return value > cap ? cap : value;
}

function entityBase(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 80) return null;
  const deletedAt = typeof raw.deletedAt === "number" && raw.deletedAt > 0 ? clampStamp(raw.deletedAt, now) : null;
  let updatedAt = clampStamp(raw.updatedAt, now);
  if (deletedAt && updatedAt < deletedAt) updatedAt = deletedAt;
  return { id: raw.id, updatedAt, deletedAt };
}

function normalizeBlock(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  return { ...plainFields(raw), ...base, name: clip(raw.name, 80), color: clip(raw.color, 24) || "citrus", order: num(raw.order) };
}

function normalizeItem(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  return {
    ...plainFields(raw),
    ...base,
    name: clip(raw.name, 80),
    kind: itemKind(raw.kind),
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
  };
}

function normalizePlacement(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base || typeof raw.blockId !== "string" || !raw.blockId || typeof raw.itemId !== "string" || !raw.itemId) return null;
  return { ...plainFields(raw), ...base, blockId: raw.blockId, itemId: raw.itemId, order: num(raw.order) };
}

function normalizeCompound(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  return {
    ...plainFields(raw),
    ...base,
    name: clip(raw.name, 80),
    amount: amountOf(raw.amount),
    unit: clip(raw.unit, 16),
    startDate: validDay(raw.startDate) ? raw.startDate : null,
    archivedAt: typeof raw.archivedAt === "number" && raw.archivedAt > 0 ? clampStamp(raw.archivedAt, now) : null,
  };
}

function reducedLogTombstone(log, deletedAt, updatedAt) {
  const status = logStatus(log && log.status) || "done";
  const at = Math.max(num(updatedAt), num(deletedAt));
  return { id: log.id, day: log.day, status, updatedAt: at, deletedAt: num(deletedAt) || at };
}

function isReducedLog(log) {
  if (!log || typeof log !== "object") return false;
  const keys = Object.keys(log);
  return keys.length === LOG_TOMBSTONE_KEYS.length && LOG_TOMBSTONE_KEYS.every((key) => keys.includes(key));
}

function normalizeLog(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  const status = logStatus(raw && raw.status);
  if (!base || !validDay(raw.day) || !status) return null;
  if (base.deletedAt) return reducedLogTombstone({ ...raw, status }, base.deletedAt, base.updatedAt);
  return {
    ...plainFields(raw),
    ...base,
    itemId: typeof raw.itemId === "string" && raw.itemId ? raw.itemId : null,
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
    day: raw.day,
    status,
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

function rowStamp(entity) {
  const updated = typeof entity.updatedAt === "number" && entity.updatedAt > 0 ? entity.updatedAt : 0;
  const deleted = typeof entity.deletedAt === "number" && entity.deletedAt > 0 ? entity.deletedAt : 0;
  return Math.max(updated, deleted);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/* Higher stamp wins. A tie keeps the tombstone, then the greater stable JSON. */
function beats(candidate, current) {
  const stampC = rowStamp(candidate);
  const stampP = rowStamp(current);
  if (stampC !== stampP) return stampC > stampP;
  const tombC = typeof candidate.deletedAt === "number" && candidate.deletedAt > 0;
  const tombP = typeof current.deletedAt === "number" && current.deletedAt > 0;
  if (tombC !== tombP) return tombC;
  return stableStringify(candidate) > stableStringify(current);
}

function normalizeList(list, normalize, now) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  for (const raw of list) {
    const entity = normalize(raw, now);
    if (!entity) continue;
    const prev = byId.get(entity.id);
    if (!prev || beats(entity, prev)) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

function normalizePrefs(raw, now = Date.now()) {
  const fields = plainFields(raw);
  return {
    ...fields,
    lastBlockId: typeof fields.lastBlockId === "string" && fields.lastBlockId ? fields.lastBlockId : null,
    updatedAt: clampStamp(fields.updatedAt, now),
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
  };
}

export function normalizeDailyRoutines(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = normalizePrefs(raw.prefs, now);
  return {
    updatedAt: clampStamp(raw.updatedAt, now),
    blocks: normalizeList(raw.blocks, normalizeBlock, now),
    items: normalizeList(raw.items, normalizeItem, now),
    placements: normalizeList(raw.placements, normalizePlacement, now),
    compounds: normalizeList(raw.compounds, normalizeCompound, now),
    logs: normalizeList(raw.logs, normalizeLog, now),
    prefs,
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

/* Both phones run the same comparison, so the order of the two lists does not matter. */
export function mergeEntityLists(local, remote, now = Date.now()) {
  const byId = new Map();
  const incoming = [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])];
  for (const raw of incoming) {
    if (!raw || typeof raw.id !== "string" || !raw.id) continue;
    const entity = copyEntity(raw);
    entity.updatedAt = clampStamp(entity.updatedAt, now);
    if (typeof entity.deletedAt === "number" && entity.deletedAt > 0) {
      entity.deletedAt = clampStamp(entity.deletedAt, now);
      if (entity.updatedAt < entity.deletedAt) entity.updatedAt = entity.deletedAt;
    }
    const current = byId.get(entity.id);
    if (!current || beats(entity, current)) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

function mergePrefs(local, remote, now) {
  const left = normalizePrefs(local, now);
  const right = normalizePrefs(remote, now);
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  return stableStringify(left) >= stableStringify(right) ? left : right;
}

export function mergeDailyRoutines(local, remote, now = Date.now()) {
  const left = normalizeDailyRoutines(local, now);
  const right = normalizeDailyRoutines(remote, now);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return {
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    blocks: mergeEntityLists(left.blocks, right.blocks, now),
    items: mergeEntityLists(left.items, right.items, now),
    placements: mergeEntityLists(left.placements, right.placements, now),
    compounds: mergeEntityLists(left.compounds, right.compounds, now),
    logs: mergeEntityLists(left.logs, right.logs, now),
    prefs: mergePrefs(left.prefs, right.prefs, now),
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

/* Tombstones logs whose day is inside the range. Blocks, items, placements,
   and compounds stay. The tombstone is what stops the other phone's older
   live log from coming back on the next merge. */
export function purgeDailyRoutineRange(data, from, to, before, now = Date.now()) {
  if (!data || typeof data !== "object" || !validDay(from) || !validDay(to) || from > to) return false;
  const routines = data.dailyRoutines;
  if (!routines || typeof routines !== "object" || Array.isArray(routines) || !Array.isArray(routines.logs)) return false;
  const cutoff = tombstoneAt(before, now);
  let changed = false;
  routines.logs = routines.logs.map((log) => {
    if (!log || typeof log !== "object" || !validDay(log.day) || log.day < from || log.day > to) return log;
    const gone = typeof log.deletedAt === "number" && log.deletedAt > 0;
    if (!gone && !dropBefore(latestStamp(log), before, now)) return log;
    if (gone && isReducedLog(log)) return log;
    const deletedAt = gone ? clampStamp(log.deletedAt, now) : cutoff;
    const updatedAt = Math.max(rowStamp(log), deletedAt);
    changed = true;
    return reducedLogTombstone(log, deletedAt, updatedAt);
  });
  if (changed) routines.updatedAt = Math.max(num(routines.updatedAt), cutoff);
  return changed;
}

/* Undo of a logged dose. The row stays so an older live copy cannot return,
   and the dose fields do not. */
export function tombstoneLog(store, id, now = Date.now()) {
  const normalized = normalizeDailyRoutines(store, now);
  if (!normalized || typeof id !== "string") return normalized;
  let changed = false;
  normalized.logs = normalized.logs.map((log) => {
    if (!log || log.id !== id || !isLive(log)) return log;
    changed = true;
    const deletedAt = clampStamp(now, now) || now;
    return reducedLogTombstone(log, deletedAt, Math.max(rowStamp(log), deletedAt));
  });
  if (changed) normalized.updatedAt = Math.max(num(normalized.updatedAt), clampStamp(now, now));
  return normalized;
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

export function seedDefaultBlocks(store, now, newId = () => routineId("block")) {
  const normalized = normalizeDailyRoutines(store) || emptyDailyRoutines(now);
  if (liveOf(normalized.blocks).length) return normalized;
  const at = num(now);
  const known = new Set(normalized.blocks.map((block) => block.id));
  const fresh = [];
  for (const [index, block] of DEFAULT_ROUTINE_BLOCKS.entries()) {
    const id = newId(block.name, index);
    if (typeof id !== "string" || !id || known.has(id)) continue;
    known.add(id);
    fresh.push({
      id,
      name: block.name,
      color: block.color,
      order: index,
      updatedAt: at,
      deletedAt: null,
    });
  }
  if (!fresh.length) return normalized;
  normalized.blocks = [...normalized.blocks, ...fresh];
  normalized.updatedAt = at;
  return normalized;
}

export function upsertEntity(store, collection, entity, now) {
  const normalized = normalizeDailyRoutines(store) || emptyDailyRoutines(now);
  if (!COLLECTIONS.has(collection)) return normalized;
  const next = NORMALIZE[collection]({ ...plainFields(entity), updatedAt: now }, now);
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
app.tombstoneLog = tombstoneLog;
app.canMutateRoutines = canMutateRoutines;
app.putDailyRoutines = putDailyRoutines;
app.revisePlanEntity = revisePlanEntity;
app.seedDefaultBlocks = seedDefaultBlocks;
app.projectDailyRoutines = projectDailyRoutines;
