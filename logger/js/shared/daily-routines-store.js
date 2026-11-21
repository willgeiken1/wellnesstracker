import { app } from "../runtime.js";

/* Daily routines live on the liftlog-v1 blob under `dailyRoutines`.
   `routines` is already the workout-template list. Do not reuse that key.

   Plan rows (blocks, items, placements, compounds) and logs are separate
   collections. A plan edit changes one plan row. It does not rewrite a log.

   Each row is last-write-wins on max(updatedAt, deletedAt). A missing or
   malformed stamp is 0. A stamp more than a day ahead is pulled back to
   now + 1 day. The same stamp keeps the tombstone, then the greater stable
   JSON, so two phones pick the same row. `deletedAt` > 0 is a tombstone.
   A date-range delete keeps only id, day, status, updatedAt, and deletedAt.
   Undo keeps the log, including its amount, unit, and note, and marks it
   undone so a restore can bring those fields back.

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

/* Default sections have fixed ids, so two phones that seed an empty store at
   the same time merge into one set. A default's tombstone keeps that id, so a
   deleted default is never seeded again. */
export const DEFAULT_ROUTINE_BLOCKS = Object.freeze([
  Object.freeze({ id: "block_default_morning", name: "Morning routine", color: "citrus" }),
  Object.freeze({ id: "block_default_stack", name: "Supplement & enhancer stack", color: "lavender" }),
  Object.freeze({ id: "block_default_night", name: "Night routine", color: "pink" }),
]);

/* Seeded rows carry this stamp, not the seed time. Any real edit or delete of
   a default is newer, so another phone's later seed cannot undo it in a merge.
   Two seeds tie and are the same row. */
export const DEFAULT_BLOCK_STAMP = 1;

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/* A lone surrogate becomes U+FFFD. Postgres jsonb rejects an unpaired \uD8xx escape, so one
   broken character would make every later push from this phone fail. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function wellFormed(text) {
  if (typeof text !== "string") return text;
  if (typeof text.toWellFormed === "function") return text.toWellFormed();
  return text.replace(LONE_SURROGATE, "\uFFFD");
}

export function wellFormedDeep(value) {
  if (typeof value === "string") return wellFormed(value);
  if (Array.isArray(value)) return value.map(wellFormedDeep);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[wellFormed(key)] = wellFormedDeep(value[key]);
  }
  return out;
}

let graphemes = null;
function graphemeSegmenter() {
  if (graphemes === null) {
    try {
      graphemes = typeof Intl === "object" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : false;
    } catch (e) {
      graphemes = false;
    }
  }
  return graphemes;
}

/* Cuts to at most max UTF-16 units without splitting a character: whole graphemes (emoji, ZWJ
   sequences, flags) where Intl.Segmenter exists, else whole code points. */
export function clipText(value, max) {
  if (typeof value !== "string") return "";
  const text = wellFormed(value.trim());
  if (text.length <= max) return text;
  let out = "";
  const segmenter = graphemeSegmenter();
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) {
      if (out.length + segment.length > max) break;
      out += segment;
    }
    if (out) return out.trimEnd();
  }
  for (const point of text) {
    if (out.length + point.length > max) break;
    out += point;
  }
  return out.trimEnd();
}

function clip(value, max) {
  return clipText(value, max);
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
  if (typeof value === "string" && value.trim()) return clipText(value, 24);
  return "check";
}

function logStatus(value) {
  if (typeof value !== "string") return "";
  return clipText(value, 24);
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
  const clock = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const cap = clock + FUTURE_SLACK_MS;
  const rawDeleted = typeof raw.deletedAt === "number" && raw.deletedAt > 0 ? raw.deletedAt : 0;
  const rawStamp = Math.max(num(raw.updatedAt), rawDeleted);
  const deletedAt = rawDeleted ? clampStamp(raw.deletedAt, clock) : null;
  let updatedAt = clampStamp(raw.updatedAt, clock);
  if (deletedAt && updatedAt < deletedAt) updatedAt = deletedAt;
  const base = { id: raw.id, updatedAt, deletedAt };
  const carried = typeof raw.sourceAt === "number" && raw.sourceAt > cap ? raw.sourceAt : 0;
  if (carried) base.sourceAt = carried;
  else if (rawStamp > cap) base.sourceAt = rawStamp;
  if (base.sourceAt) {
    const step = futureStep(raw);
    if (step > 0) base.sourceStep = step;
  }
  return base;
}

/* How many replacements sit above a remembered future stamp. A boolean
   supersedes from an older row counts as one step. */
function futureStep(entity) {
  if (typeof entity.sourceStep === "number" && entity.sourceStep > 0) return Math.floor(entity.sourceStep);
  return entity.supersedes === true ? 1 : 0;
}

/* The next write of a row whose raw stamp is still ahead of the stored one.
   The stored millisecond can clamp back onto the previous write, so the step
   is what keeps a later restore ahead of the undo it replaces. */
export function futureCarry(log, storedCeiling) {
  if (!log || typeof log.sourceAt !== "number" || !(log.sourceAt > storedCeiling)) return null;
  return { sourceAt: log.sourceAt, sourceStep: futureStep(log) + 1 };
}

function orderAtOf(raw, now) {
  return typeof raw.orderAt === "number" && raw.orderAt > 0 ? clampStamp(raw.orderAt, now) : 0;
}

function withOrderAt(raw, row, now) {
  const orderAt = orderAtOf(raw, now);
  if (orderAt) row.orderAt = orderAt;
  else delete row.orderAt;
  return row;
}

function normalizeBlock(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  return withOrderAt(raw, { ...plainFields(raw), ...base, name: clip(raw.name, 80), color: clip(raw.color, 24) || "citrus", order: num(raw.order) }, now);
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
  return withOrderAt(raw, { ...plainFields(raw), ...base, blockId: raw.blockId, itemId: raw.itemId, order: num(raw.order) }, now);
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

/* Undo hides the log without dropping the dose. A date-range delete still
   uses the five-key marker. undone is what tells those two apart. */
function undoneLog(log, deletedAt, updatedAt) {
  const status = logStatus(log && log.status) || "done";
  const at = Math.max(num(updatedAt), num(deletedAt));
  const row = {
    id: log.id,
    itemId: typeof log.itemId === "string" && log.itemId ? log.itemId : null,
    compoundId: typeof log.compoundId === "string" && log.compoundId ? log.compoundId : null,
    day: log.day,
    status,
    amount: amountOf(log.amount),
    unit: clip(log.unit, 16),
    note: typeof log.note === "string" ? clip(log.note, 280) : "",
    at: num(log.at),
    updatedAt: at,
    deletedAt: num(deletedAt) || at,
    undone: true,
  };
  if (log.rest === true) row.rest = true;
  /* Copy the step. Incrementing here would add one on every normalize. The
     writer bumps the step once, through futureCarry, before this runs. */
  if (typeof log.sourceAt === "number" && log.sourceAt > at) {
    row.sourceAt = log.sourceAt;
    const step = futureStep(log);
    if (step > 0) row.sourceStep = step;
  }
  return row;
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
  if (base.deletedAt) {
    if (raw.undone === true) return undoneLog({ ...raw, status }, base.deletedAt, base.updatedAt);
    const reduced = reducedLogTombstone({ ...raw, status }, base.deletedAt, base.updatedAt);
    if (base.sourceAt) reduced.sourceAt = base.sourceAt;
    if (base.sourceStep && reduced.sourceAt) reduced.sourceStep = base.sourceStep;
    return reduced;
  }
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

/* Higher stamp wins. A remembered future stamp sorts at sourceAt plus the
   number of replacements that already beat it, so a later restore stays ahead
   of an undo even when the clamp stores both at the same millisecond. When
   those match, the newer stored stamp wins. A remaining tie keeps the
   tombstone, then the greater stable JSON. */
function orderStamp(entity) {
  const stored = rowStamp(entity);
  const src = typeof entity.sourceAt === "number" && entity.sourceAt > stored ? entity.sourceAt : stored;
  if (!(src > stored)) return stored;
  return src + futureStep(entity);
}

function beats(candidate, current) {
  const stampC = orderStamp(candidate);
  const stampP = orderStamp(current);
  if (stampC !== stampP) return stampC > stampP;
  const rowC = rowStamp(candidate);
  const rowP = rowStamp(current);
  if (rowC !== rowP) return rowC > rowP;
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
    if (Object.hasOwn(entity, "supersedes")) delete entity.supersedes;
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
  return wellFormedDeep({
    updatedAt: clampStamp(raw.updatedAt, now),
    blocks: normalizeList(raw.blocks, normalizeBlock, now),
    items: normalizeList(raw.items, normalizeItem, now),
    placements: normalizeList(raw.placements, normalizePlacement, now),
    compounds: normalizeList(raw.compounds, normalizeCompound, now),
    logs: normalizeList(raw.logs, normalizeLog, now),
    prefs,
  });
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
    const rawDeleted = typeof entity.deletedAt === "number" && entity.deletedAt > 0 ? entity.deletedAt : 0;
    const rawStamp = Math.max(num(entity.updatedAt), rawDeleted);
    const cap = (typeof now === "number" && Number.isFinite(now) ? now : Date.now()) + FUTURE_SLACK_MS;
    if (!(typeof entity.sourceAt === "number" && entity.sourceAt > cap) && rawStamp > cap) entity.sourceAt = rawStamp;
    entity.updatedAt = clampStamp(entity.updatedAt, now);
    if (typeof entity.deletedAt === "number" && entity.deletedAt > 0) {
      entity.deletedAt = clampStamp(entity.deletedAt, now);
      if (entity.updatedAt < entity.deletedAt) entity.updatedAt = entity.deletedAt;
    }
    const current = byId.get(entity.id);
    if (!current) {
      byId.set(entity.id, entity);
      continue;
    }
    const winner = beats(entity, current) ? entity : current;
    const other = winner === entity ? current : entity;
    byId.set(entity.id, liveOrder(winner, other));
  }
  return [...byId.values()];
}

/* A reorder stamps orderAt and leaves updatedAt alone, so a delete's
   tombstone still beats it. Two live reorders keep the newer order. */
function liveOrder(winner, other) {
  if (!isLive(winner) || !other) return winner;
  const winAt = num(winner.orderAt);
  const otherAt = num(other.orderAt);
  if (otherAt > winAt && typeof other.order === "number") return { ...winner, order: other.order, orderAt: otherAt };
  return winner;
}

function mergePrefs(local, remote, now) {
  const left = normalizePrefs(local, now);
  const right = normalizePrefs(remote, now);
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  return stableStringify(left) >= stableStringify(right) ? left : right;
}

/* An item delete also tombstones its placements, tagged removedWith the item
   id. If the other phone's newer edit keeps the item, those placements come
   back with it. A placement removed on its own, or by a block delete, stays
   gone. The revive stamp is the item's stamp, so both phones agree. */
function reconcileItemPlacementTombstones(items, placements) {
  const liveItems = new Map();
  for (const item of items || []) {
    if (isLive(item)) liveItems.set(item.id, item);
  }
  return (placements || []).map((place) => {
    if (!place || isLive(place) || place.removedWith !== place.itemId) return place;
    const item = liveItems.get(place.itemId);
    if (!item || rowStamp(item) <= rowStamp(place)) return place;
    return { ...place, deletedAt: null, updatedAt: rowStamp(item) };
  });
}

/* A block delete tombstones that block's placements with removedWith set to
   the block id. A newer rename or recolor keeps the block, so those
   placements come back. A placement removed on its own stays gone. */
function reconcileBlockPlacementTombstones(blocks, placements) {
  const liveBlocks = new Map();
  for (const block of blocks || []) {
    if (isLive(block)) liveBlocks.set(block.id, block);
  }
  return (placements || []).map((place) => {
    if (!place || isLive(place) || place.removedWith !== place.blockId) return place;
    const block = liveBlocks.get(place.blockId);
    if (!block || rowStamp(block) <= rowStamp(place)) return place;
    return { ...place, deletedAt: null, updatedAt: rowStamp(block) };
  });
}

export function mergeDailyRoutines(local, remote, now = Date.now()) {
  const left = normalizeDailyRoutines(local, now);
  const right = normalizeDailyRoutines(remote, now);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  const items = mergeEntityLists(left.items, right.items, now);
  const blocks = mergeEntityLists(left.blocks, right.blocks, now);
  const reconciled = reconcileBlockPlacementTombstones(blocks, reconcileItemPlacementTombstones(items, collapsePlacementPairs(mergeEntityLists(left.placements, right.placements, now))));
  /* A revive can bring a duplicate-pair loser back to life. Dedupe again so
     one item still appears once in the block. */
  const placements = collapsePlacementPairs(reconciled);
  return {
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    blocks,
    items,
    placements,
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

/* Date-range delete and a day move. The row stays so an older live copy
   cannot return, and the dose fields do not. */
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

/* Undo. The log stays, with its amount, unit, and note, and is marked undone.
   A newer live row is still how the other phone wins. */
export function markLogUndone(store, id, now = Date.now()) {
  const normalized = normalizeDailyRoutines(store, now);
  if (!normalized || typeof id !== "string") return normalized;
  let changed = false;
  normalized.logs = normalized.logs.map((log) => {
    if (!log || log.id !== id || !isLive(log)) return log;
    changed = true;
    const deletedAt = clampStamp(now, now) || now;
    const at = Math.max(rowStamp(log), deletedAt);
    const carried = futureCarry(log, at);
    return undoneLog(carried ? { ...log, ...carried } : log, deletedAt, at);
  });
  if (changed) normalized.updatedAt = Math.max(num(normalized.updatedAt), clampStamp(now, now));
  return normalized;
}

export function routineId(prefix) {
  return `${prefix || "r"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* One check-off row per item and day, and one rest row per day. Two phones
   that log the same item before a sync write the same id, so the merge keeps
   one row. */
export function routineLogId(itemId, day) {
  return typeof itemId === "string" && itemId ? `log_${itemId}_${day}` : `rest_${day}`;
}

function placementHash(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x811c9dc5);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/* One placement per item and block. Two phones that add the same item to the
   same routine write the same id, so the merge cannot render it twice. */
export function routinePlacementId(blockId, itemId) {
  const plain = `place_${blockId}_${itemId}`;
  if (plain.length <= 80) return plain;
  return `place_${placementHash(`${blockId}\0${itemId}`)}`;
}

/* Different ids for one item in one block become one row. The winner follows
   the same stamp rule as every other merge. The rest are tombstones, so the
   other phone's older live copy cannot bring the duplicate back. */
function collapsePlacementPairs(list) {
  const groups = new Map();
  const order = [];
  for (const row of list) {
    if (!row || typeof row.blockId !== "string" || typeof row.itemId !== "string") {
      order.push({ row });
      continue;
    }
    const key = `${row.blockId}\0${row.itemId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push({ key });
    }
    groups.get(key).push(row);
  }
  const out = [];
  for (const slot of order) {
    if (!slot.key) {
      out.push(slot.row);
      continue;
    }
    const group = groups.get(slot.key);
    groups.delete(slot.key);
    if (!group || !group.length) continue;
    let winner = group[0];
    for (let i = 1; i < group.length; i += 1) if (beats(group[i], winner)) winner = group[i];
    const others = group.filter((row) => row.id !== winner.id);
    const loserStamp = others.reduce((max, row) => Math.max(max, rowStamp(row)), 0);
    /* A tombstone at the winner's stamp would beat the winner, because a tie
       keeps the tombstone. Stamp the loser at its own time, and move the
       live winner one past that only when the stamps are equal. */
    let kept = others.length && isLive(winner) && rowStamp(winner) <= loserStamp
      ? { ...winner, updatedAt: loserStamp + 1, deletedAt: null }
      : winner;
    const tombs = [];
    let ceiling = rowStamp(kept);
    for (const row of others) {
      const stamp = Math.max(rowStamp(row), 1);
      /* removedWith is this placement's own id, not the item or block. A later
         restore of that item or block must not bring the duplicate back. */
      const tomb = { ...row, deletedAt: stamp, updatedAt: Math.max(row.updatedAt || 0, stamp), removedWith: row.id };
      let written = tomb;
      if (row.removedWith !== row.id && beats(row, tomb)) {
        const bumped = Math.max(rowStamp(row), stamp) + 1;
        written = { ...row, deletedAt: bumped, updatedAt: bumped, removedWith: row.id };
      } else if (beats(row, tomb)) written = row;
      tombs.push(written);
      ceiling = Math.max(ceiling, rowStamp(written));
    }
    /* A bumped duplicate can land on the live row's stamp. A tie keeps the
       tombstone, so the next pass would drop the live row. Keep it strictly newer. */
    if (isLive(kept) && tombs.some((row) => !isLive(row)) && rowStamp(kept) <= ceiling) {
      kept = { ...kept, updatedAt: ceiling + 1, deletedAt: null };
    }
    out.push(kept, ...tombs);
  }
  return out;
}

export function dedupePlacementPairs(list) {
  return collapsePlacementPairs(Array.isArray(list) ? list : []);
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

/* A deleted default stays a row. Seeding only adds a default id that is
   missing, so a tombstone is not replaced and a later phone cannot duplicate it. */
export function seedDefaultBlocks(store, now) {
  const normalized = normalizeDailyRoutines(store) || emptyDailyRoutines(now);
  if (liveOf(normalized.blocks).length) return normalized;
  const known = new Set(normalized.blocks.map((block) => block.id));
  const missing = DEFAULT_ROUTINE_BLOCKS.map((block, index) => ({ block, index })).filter(({ block }) => !known.has(block.id));
  if (!missing.length) return normalized;
  for (const { block, index } of missing) {
    normalized.blocks.push({
      id: block.id,
      name: block.name,
      color: block.color,
      order: index,
      updatedAt: DEFAULT_BLOCK_STAMP,
      deletedAt: null,
    });
  }
  normalized.updatedAt = num(now);
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
app.markLogUndone = markLogUndone;
app.routineLogId = routineLogId;
app.routinePlacementId = routinePlacementId;
app.dedupePlacementPairs = dedupePlacementPairs;
app.canMutateRoutines = canMutateRoutines;
app.putDailyRoutines = putDailyRoutines;
app.revisePlanEntity = revisePlanEntity;
app.seedDefaultBlocks = seedDefaultBlocks;
app.projectDailyRoutines = projectDailyRoutines;
