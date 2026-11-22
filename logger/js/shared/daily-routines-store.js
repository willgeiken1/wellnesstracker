import { app } from "../runtime.js";
import { DEFAULT_DAY_ROLLOVER_HOUR, routineDayRolloverHour, routineMinuteOfDay } from "./routine-dose.js";
import { attachSupply } from "./routine-supply.js";

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
const NOTE_MAX = 500;
const FEELING_KEYS = ["mood", "energy", "stress", "feeling", "felt"];
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
/* Optional injection site on a dose log. Only these ids are kept.
   The list is the whole picker. There is no body map. */
export const ROUTINE_SITES = Object.freeze([
  Object.freeze({ id: "left-belly", label: "Left belly" }),
  Object.freeze({ id: "right-belly", label: "Right belly" }),
  Object.freeze({ id: "left-thigh", label: "Left thigh" }),
  Object.freeze({ id: "right-thigh", label: "Right thigh" }),
  Object.freeze({ id: "left-arm", label: "Left arm" }),
  Object.freeze({ id: "right-arm", label: "Right arm" }),
  Object.freeze({ id: "left-glute", label: "Left glute" }),
  Object.freeze({ id: "right-glute", label: "Right glute" }),
]);
const SITE_IDS = new Set(ROUTINE_SITES.map((site) => site.id));

export function routineSiteId(value) {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return SITE_IDS.has(id) ? id : "";
}

export function routineSiteLabel(id) {
  const site = ROUTINE_SITES.find((row) => row.id === id);
  return site ? site.label : "";
}

/* Only real routines are seeded. Supplements, peptides and medications are
   item types with their own tabs, not blocks. */
export const DEFAULT_ROUTINE_BLOCKS = Object.freeze([
  Object.freeze({ id: "block_default_morning", name: "Morning routine", color: "citrus" }),
  Object.freeze({ id: "block_default_night", name: "Night routine", color: "pink" }),
]);

/* One type per item. A custom type is an id from prefs.customTypes. */
export const ROUTINE_ITEM_TYPES = Object.freeze(["supplement", "medication", "peptide", "enhancer", "other"]);
const ITEM_TYPE_SET = new Set(ROUTINE_ITEM_TYPES);
const CUSTOM_TYPE = /^type_[A-Za-z0-9_-]{1,60}$/;

export function routineItemTypeId(value) {
  if (typeof value !== "string") return "";
  if (ITEM_TYPE_SET.has(value) || CUSTOM_TYPE.test(value)) return value;
  return "";
}

export function isCustomRoutineType(value) {
  return typeof value === "string" && CUSTOM_TYPE.test(value);
}

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

/* A window the user picked, the weekdays it runs (Monday 0 to Sunday 6),
   and hidden. A hidden block keeps its placements and logs and can be
   restored; it is not a tombstone. */
function blockSchedule(row) {
  const start = routineMinuteOfDay(row.startMin);
  if (start == null) {
    delete row.startMin;
    delete row.endMin;
  } else {
    row.startMin = start;
    const end = typeof row.endMin === "number" && Number.isInteger(row.endMin) && row.endMin > start && row.endMin <= start + 24 * 60 ? row.endMin : start + 60;
    row.endMin = end;
  }
  if (Array.isArray(row.days)) {
    const days = [...new Set(row.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
    if (days.length && days.length < 7) row.days = days;
    else delete row.days;
  } else delete row.days;
  if (row.hidden === true) row.hidden = true;
  else delete row.hidden;
  return row;
}

function normalizeBlock(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  return withOrderAt(raw, blockSchedule({ ...plainFields(raw), ...base, name: clip(raw.name, 80), color: clip(raw.color, 24) || "citrus", order: num(raw.order) }), now);
}

function normalizeItem(raw, now = Date.now()) {
  const base = entityBase(raw, now);
  if (!base) return null;
  const next = {
    ...plainFields(raw),
    ...base,
    name: clip(raw.name, 80),
    kind: itemKind(raw.kind),
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
  };
  const note = clip(typeof raw.note === "string" ? raw.note : "", NOTE_MAX);
  if (note) next.note = note;
  else delete next.note;
  const type = routineItemTypeId(raw.type);
  if (type) next.type = type;
  else delete next.type;
  const timeMin = routineMinuteOfDay(raw.timeMin);
  if (timeMin != null) next.timeMin = timeMin;
  else delete next.timeMin;
  for (const key of FEELING_KEYS) delete next[key];
  const supplied = attachSupply(next);
  /* The time the count was typed only means something beside its day. */
  if (!supplied.onHandDay || !(typeof raw.onHandAt === "number" && Number.isFinite(raw.onHandAt) && raw.onHandAt > 0)) delete supplied.onHandAt;
  else supplied.onHandAt = raw.onHandAt;
  return supplied;
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
    chartLine: raw.chartLine === true,
  };
}

function reducedLogTombstone(log, deletedAt, updatedAt) {
  const status = logStatus(log && log.status) || "done";
  const at = Math.max(num(updatedAt), num(deletedAt));
  const row = { id: log.id, day: log.day, status, updatedAt: at, deletedAt: num(deletedAt) || at };
  /* A day move of a days-ahead log has to stay ahead of the other phone's
     copy of that same row. The five keys stay the marker when there is none. */
  if (typeof log.sourceAt === "number" && log.sourceAt > at) {
    row.sourceAt = log.sourceAt;
    const step = futureStep(log) + 1;
    if (step > 0) row.sourceStep = step;
  }
  return row;
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

const TOMBSTONE_EXTRA_KEYS = new Set(["movedAt", "movedDay", "sourceAt", "sourceStep"]);

function isReducedLog(log) {
  if (!log || typeof log !== "object") return false;
  const keys = Object.keys(log).filter((key) => !TOMBSTONE_EXTRA_KEYS.has(key));
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
    if (validDay(raw.movedDay) && typeof raw.movedAt === "number" && Number.isFinite(raw.movedAt)) {
      reduced.movedDay = raw.movedDay;
      reduced.movedAt = raw.movedAt;
    }
    return reduced;
  }
  const row = {
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
  const taken = (status === "done" || status === "partial") && raw.rest !== true;
  const site = taken ? routineSiteId(raw.site) : "";
  if (site) row.site = site;
  else delete row.site;
  return row;
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
   those match, the newer stored stamp wins. An undone log at that same stored
   stamp beats a five-key marker: the marker is the lossy copy of the undo.
   A remaining tie keeps the tombstone, then the greater stable JSON. */
function orderStamp(entity) {
  const stored = rowStamp(entity);
  const src = typeof entity.sourceAt === "number" && entity.sourceAt > stored ? entity.sourceAt : stored;
  if (!(src > stored)) return stored;
  return src + futureStep(entity);
}

function keptUndo(entity) {
  return !!(entity && entity.undone === true && typeof entity.deletedAt === "number" && entity.deletedAt > 0 && !isReducedLog(entity));
}

function beats(candidate, current) {
  const stampC = orderStamp(candidate);
  const stampP = orderStamp(current);
  if (stampC !== stampP) return stampC > stampP;
  const rowC = rowStamp(candidate);
  const rowP = rowStamp(current);
  if (rowC !== rowP) return rowC > rowP;
  const undoC = keptUndo(candidate);
  const undoP = keptUndo(current);
  if (undoC !== undoP) return undoC;
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

/* PR 8 owns the rest of this object. The day-start hour lives here so that
   sheet can read it. updatedAt 0 means the user has not chosen an hour, and
   a later explicit choice wins the merge. */
function normalizeSettings(raw, now = Date.now()) {
  const fields = plainFields(raw);
  return {
    ...fields,
    dayRolloverHour: routineDayRolloverHour(fields.dayRolloverHour),
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
    settings: { dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR, updatedAt: 0 },
  };
}

export function normalizeDailyRoutines(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = normalizePrefs(raw.prefs, now);
  const settings = normalizeSettings(raw.settings, now);
  return wellFormedDeep({
    updatedAt: clampStamp(raw.updatedAt, now),
    blocks: normalizeList(raw.blocks, normalizeBlock, now),
    items: normalizeList(raw.items, normalizeItem, now),
    placements: normalizeList(raw.placements, normalizePlacement, now),
    compounds: normalizeList(raw.compounds, normalizeCompound, now),
    logs: normalizeList(raw.logs, normalizeLog, now),
    prefs,
    settings,
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
  const ordered = liveOf(normalized.blocks).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const blocks = ordered.filter((block) => block.hidden !== true);
  const settled = followParentEdits(normalized);
  return {
    ...normalized,
    blocks,
    hiddenBlocks: ordered.filter((block) => block.hidden === true),
    items: liveOf(normalized.items),
    placements: oneLivePer(liveOf(settled.placements), placementKey),
    compounds: liveOf(normalized.compounds),
    logs: oneLivePer(liveOf(normalized.logs), checkOffKey),
  };
}

/* The newest other taken log for this item that still has a site.
   A skip, a rest, and a tombstone do not count. The log being edited
   is excluded so it is not its own last site. */
export function lastRoutineSite(store, itemId, exceptLogId) {
  const view = projectDailyRoutines(store);
  if (!view || typeof itemId !== "string" || !itemId) return "";
  const rows = (view.logs || []).filter((log) => {
    if (!log || log.itemId !== itemId || log.rest === true) return false;
    if (exceptLogId && log.id === exceptLogId) return false;
    if (log.status !== "done" && log.status !== "partial") return false;
    return !!routineSiteId(log.site);
  });
  rows.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    const at = (b.at || 0) - (a.at || 0);
    if (at) return at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows[0] ? routineSiteId(rows[0].site) : "";
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

function mergeSettings(local, remote) {
  if (num(local && local.updatedAt) >= num(remote && remote.updatedAt)) return { ...normalizeSettings(local) };
  return { ...normalizeSettings(remote) };
}

/* Stamp of a saved Routines setup, or -1 when there is none. */
function setupStamp(setup, now) {
  if (!setup || typeof setup !== "object" || Array.isArray(setup)) return -1;
  if (setup.status !== "done" && setup.status !== "skipped") return -1;
  return clampStamp(setup.updatedAt, now);
}

/* prefs merge whole, newest first. The setup answers and the parts added
   from Routines settings are kept apart from that: a phone that saves a
   prefs change from a copy pulled before the other phone's setup must not
   drop the setup, or the quiz shows again. The newer setup wins by its own
   stamp, and added parts, type tabs and custom types only ever grow. The server merge
   (daily_routines_merge_prefs) does the same. */
function keepSetupParts(winner, other, now) {
  let out = winner;
  if (setupStamp(other.setup, now) > setupStamp(winner.setup, now)) out = { ...out, setup: other.setup };
  out = growList(out, other, "added", (key) => typeof key === "string", (a, b) => a === b);
  out = growList(out, other, "typeTabs", (key) => typeof key === "string", (a, b) => a === b);
  out = growList(out, other, "customTypes", (row) => !!row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string" && row.id !== "",
    (a, b) => !!a && typeof a === "object" && a.id === b.id);
  return out;
}

/* A list that only grows: the winner's entries first, then the other
   side's new ones in their order. Custom types match by id, so a type made
   on one phone survives a newer prefs save from the other. */
function growList(out, other, key, accept, same) {
  if (!Array.isArray(other[key])) return out;
  const base = Array.isArray(out[key]) ? out[key] : [];
  const extras = [];
  for (const entry of other[key]) {
    if (accept(entry) && !base.some((row) => same(row, entry)) && !extras.some((row) => same(row, entry))) extras.push(entry);
  }
  return extras.length ? { ...out, [key]: [...base, ...extras] } : out;
}

function mergePrefs(local, remote, now) {
  const left = normalizePrefs(local, now);
  const right = normalizePrefs(remote, now);
  let leftWins;
  if (left.updatedAt !== right.updatedAt) leftWins = left.updatedAt > right.updatedAt;
  else leftWins = stableStringify(left) >= stableStringify(right);
  return leftWins ? keepSetupParts(left, right, now) : keepSetupParts(right, left, now);
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

function isMoveTombstone(log) {
  return !!(log && typeof log.deletedAt === "number" && log.deletedAt > 0 && validDay(log.movedDay) && typeof log.movedAt === "number" && Number.isFinite(log.movedAt));
}

function freshLogSuffix(base, ids) {
  for (let n = 2; n < 100; n += 1) {
    const id = `${base}_${n}`;
    if (!ids.has(id)) return id;
  }
  return null;
}

/* A move tombstone and a fresh log of the vacated day share an id until
   they sync. Give the fresh log the next suffix when its dose time is not
   the moved dose, so both rows survive either merge order. */
export function retargetFreshMoveLogs(localLogs, remoteLogs) {
  const local = (Array.isArray(localLogs) ? localLogs : []).map((log) => (log && typeof log === "object" ? { ...log } : log));
  const remote = (Array.isArray(remoteLogs) ? remoteLogs : []).map((log) => (log && typeof log === "object" ? { ...log } : log));
  const ids = new Set();
  for (const log of [...local, ...remote]) {
    if (log && typeof log.id === "string") ids.add(log.id);
  }
  const remoteBy = new Map();
  for (const log of remote) {
    if (log && typeof log.id === "string" && !remoteBy.has(log.id)) remoteBy.set(log.id, log);
  }
  const localBy = new Map();
  for (const log of local) {
    if (log && typeof log.id === "string" && !localBy.has(log.id)) localBy.set(log.id, log);
  }
  for (const id of localBy.keys()) {
    const left = localBy.get(id);
    const right = remoteBy.get(id);
    if (!right) continue;
    const tomb = isMoveTombstone(left) ? left : isMoveTombstone(right) ? right : null;
    const live = tomb === left ? right : tomb === right ? left : null;
    if (!tomb || !live || (typeof live.deletedAt === "number" && live.deletedAt > 0)) continue;
    const at = typeof live.at === "number" && Number.isFinite(live.at) ? live.at : null;
    if (at == null || at === tomb.movedAt) continue;
    const next = freshLogSuffix(id, ids);
    if (!next) continue;
    live.id = next;
    ids.add(next);
  }
  return [local, remote];
}

export function mergeDailyRoutines(local, remote, now = Date.now()) {
  const split = retargetFreshMoveLogs(local && local.logs, remote && remote.logs);
  const left = normalizeDailyRoutines(local ? { ...local, logs: split[0] } : local, now);
  const right = normalizeDailyRoutines(remote ? { ...remote, logs: split[1] } : remote, now);
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

/* Local midnight of `from` through the rollover hour, as absolute times.
   A new purge stores this window. An old purge has no window, so it keeps
   the exact from..to days. */
export function routineEarlyWindow(from, hour) {
  if (!validDay(from)) return null;
  const selected = Math.min(Math.max(Math.trunc(Number(hour)), 0), 6);
  const hourOf = Number.isFinite(Number(hour)) ? selected : 4;
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const date = Number(from.slice(8, 10));
  return {
    routineEarlyFrom: new Date(year, month - 1, date, 0, 0, 0, 0).getTime(),
    routineEarlyTo: new Date(year, month - 1, date, hourOf, 0, 0, 0).getTime(),
  };
}

/* The exact from..to days always match. The day before matches only when
   the purge carries a window and the log's `at` falls inside it. */
export function routineLogMatchesPurge(log, purge) {
  const day = log && log.day;
  const from = purge && purge.from;
  const to = purge && purge.to;
  if (!validDay(day) || !validDay(from) || !validDay(to) || from > to) return false;
  if (day >= from && day <= to) return true;
  if (day !== dayBefore(from)) return false;
  const start = purge.routineEarlyFrom;
  const end = purge.routineEarlyTo;
  if (typeof start !== "number" || typeof end !== "number" || !(end > start)) return false;
  const at = typeof log.at === "number" && Number.isFinite(log.at) ? log.at : null;
  if (at == null) return false;
  return at >= start && at < end;
}

export function routineLogDayInPurge(day, from, to, early = null) {
  return routineLogMatchesPurge({ day, at: early && early.at }, { from, to, ...early });
}

/* Tombstones logs whose day is inside the widened range. Blocks, items,
   placements, and compounds stay. The tombstone is what stops the other
   phone's older live log from coming back on the next merge. */
export function purgeDailyRoutineRange(data, from, to, before, now = Date.now(), early = null) {
  if (!data || typeof data !== "object" || !validDay(from) || !validDay(to) || from > to) return false;
  const routines = data.dailyRoutines;
  if (!routines || typeof routines !== "object" || Array.isArray(routines) || !Array.isArray(routines.logs)) return false;
  const cutoff = tombstoneAt(before, now);
  const purge = { from, to, ...(early || {}) };
  let changed = false;
  routines.logs = routines.logs.map((log) => {
    if (!log || typeof log !== "object" || !routineLogMatchesPurge(log, purge)) return log;
    const gone = typeof log.deletedAt === "number" && log.deletedAt > 0;
    /* A later undo is inside the dates but did not exist when this delete
       was made. Leave it, amount and note included. */
    if (!dropBefore(latestStamp(log), before, now)) return log;
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

const LOG_ID_LIMIT = 80;
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

/* Sync SHA-256. The browser has no sync digest, and this file runs there. */
function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const paddedLen = ((data.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = data.length * 8;
  view.setUint32(paddedLen - 8, Math.floor(bits / 0x100000000), false);
  view.setUint32(paddedLen - 4, bits >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

/* One check-off row per item and day, and one rest row per day. Two phones
   that log the same item before a sync write the same id, so the merge keeps
   one row. The readable form is log_<itemId>_<day>. An item id of 66–80
   characters would push that past the 80-character id limit, and both the
   client and the account merge would drop the log. The long form is
   log_<sha256>_<day>, which still fits and is the same on every phone. */
export function routineLogId(itemId, day) {
  const dayText = typeof day === "string" ? day : "";
  const readable = typeof itemId === "string" && itemId ? `log_${itemId}_${dayText}` : `rest_${dayText}`;
  if (readable.length <= LOG_ID_LIMIT) return readable;
  const digest = sha256Hex(readable);
  const prefix = readable.startsWith("rest_") ? "rest_" : "log_";
  const withDay = `${prefix}${digest}_${dayText}`;
  if (withDay.length <= LOG_ID_LIMIT) return withDay;
  return `${prefix}${digest}`.slice(0, LOG_ID_LIMIT);
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

/* A placement removed with its block or item (removedWith is that parent's
   id) follows the parent. When the parent is live with a newer stamp than
   the removal, another phone edited it after the delete, so the placement
   is live again at the parent's stamp. The view and every write start from
   this, so the merge itself can stay per-row last write wins. */
export function followParentEdits(store) {
  if (!store || !Array.isArray(store.placements)) return store;
  const parents = new Map();
  for (const row of [...(store.blocks || []), ...(store.items || [])]) if (row && typeof row.id === "string") parents.set(row.id, row);
  return {
    ...store,
    placements: store.placements.map((row) => {
      if (!row || isLive(row) || typeof row.removedWith !== "string") return row;
      if (row.removedWith !== row.blockId && row.removedWith !== row.itemId) return row;
      const parent = parents.get(row.removedWith);
      if (!parent || !isLive(parent) || rowStamp(parent) <= rowStamp(row)) return row;
      return { ...row, deletedAt: null, removedWith: null, updatedAt: rowStamp(parent) };
    }),
  };
}

function placementKey(row) {
  if (!isLive(row) || typeof row.blockId !== "string" || typeof row.itemId !== "string") return "";
  return `${row.blockId}\0${row.itemId}`;
}

function checkOffKey(log) {
  if (!isLive(log) || !validDay(log.day)) return "";
  if (log.rest === true) return `rest\0${log.day}`;
  return typeof log.itemId === "string" && log.itemId ? `item\0${log.itemId}\0${log.day}` : "";
}

/* One live row per key in the view: one placement per block and item, one
   log per item and day, one rest per day. The stamp winner shows. Older
   random-id rows, or a moved log that lands on a day the other phone checked
   off, can hold two. The other rows stay in the store as they are, so a log
   shows again once the winner moves to another day, and any order of merges
   ends in the same rows. */
function oneLivePer(list, keyOf) {
  const winners = new Map();
  for (const row of list) {
    const key = keyOf(row);
    if (!key) continue;
    const current = winners.get(key);
    if (!current || beats(row, current)) winners.set(key, row);
  }
  return list.filter((row) => {
    const key = keyOf(row);
    return !key || winners.get(key) === row;
  });
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

/* An edit of a row that still carries a future stamp keeps that stamp, and
   the clamp can store the edit at the same millisecond as the copy it
   replaces. One more step keeps the edit ahead of that copy. A write that
   already took the step (a log replacement) is left as it is, and so is a
   reorder, which keeps the row's stamp so a delete still beats it. */
function aheadOf(next, previous) {
  if (!next || !previous || typeof previous.sourceAt !== "number" || next.sourceAt !== previous.sourceAt) return next;
  const step = futureStep(previous) + 1;
  if (futureStep(next) >= step) return next;
  return { ...next, sourceStep: step };
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
  const orderOnly = Object.keys(patchFields).every((key) => key === "order" || key === "orderAt");
  normalized[collection] = normalized[collection].map((entity) => {
    if (!entity || entity.id !== id) return entity;
    const next = normalize({ ...entity, ...patchFields, id, updatedAt: now, deletedAt: entity.deletedAt });
    if (!next) return entity;
    return orderOnly ? next : aheadOf(next, entity);
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
  const fields = { ...plainFields(entity), updatedAt: now };
  const previous = normalized[collection].find((row) => row && row.id === fields.id);
  /* A write that rebuilds a row from its fields still replaces that row's
     future-dated copy, so it keeps the row's future stamp and steps above it. */
  if (previous && typeof previous.sourceAt === "number" && typeof fields.sourceAt !== "number") {
    fields.sourceAt = previous.sourceAt;
    if (typeof previous.sourceStep === "number") fields.sourceStep = previous.sourceStep;
  }
  const next = NORMALIZE[collection](fields, now);
  if (!next) return normalized;
  const index = normalized[collection].findIndex((row) => row.id === next.id);
  if (index >= 0) normalized[collection][index] = aheadOf(next, normalized[collection][index]);
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
app.followParentEdits = followParentEdits;
