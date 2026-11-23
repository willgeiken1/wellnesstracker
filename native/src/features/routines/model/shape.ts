/* The shape the ported routine logic reads and writes: the web app's
   dailyRoutines object, with rows instead of one blob. The phone keeps each
   row in its own table (data/catalog.ts); features/routines/store.ts turns
   rows into this shape and back.

   A row is live unless deletedAt is a positive stamp. An undone log is kept
   with its amount, unit and note, and shows here as not live with
   undone: true, so a restore can bring those fields back.

   Ported from the web app's shared/daily-routines-store.js. The merge, the
   future-stamp carry and the move tombstones are not here: the phone's row
   engine does last-write-wins per row. */

import { routineDayRolloverHour, routineMinuteOfDay, DEFAULT_DAY_ROLLOVER_HOUR } from "./dose";
import { attachSupply } from "./supply";

export interface Stamped { id: string; updatedAt: number; deletedAt: number | null }
export interface RoutineBlock extends Stamped { name: string; color: string; order: number; startMin?: number; endMin?: number; days?: number[]; hidden?: boolean }
export interface RoutineItem extends Stamped {
  name: string; kind: string; compoundId: string | null; note?: string; type?: string; timeMin?: number; startDate?: string;
  onHand?: number; onHandDay?: string; onHandAt?: number; mixedOn?: string; calcVial?: number; calcVialUnit?: string; calcWater?: number;
}
export interface RoutinePlacement extends Stamped { blockId: string; itemId: string; order: number }
export interface RoutineCompound extends Stamped { name: string; amount: number | null; unit: string; startDate: string | null; archivedAt: number | null; chartLine: boolean }
export interface RoutineLog extends Stamped {
  itemId: string | null; compoundId: string | null; day: string; status: string; amount: number | null; unit: string; at: number;
  note?: string; site?: string; rest?: boolean; undone?: boolean;
}
export interface RoutineCustomType { id: string; name: string }
export type SetupAnswers = Record<string, string | string[]>;
export interface RoutineSetup { v: number; status: "done" | "skipped"; answers: SetupAnswers; updatedAt: number }
export interface RoutinePrefs {
  lastBlockId: string | null; updatedAt: number; setup?: RoutineSetup; added?: string[]; typeTabs?: string[]; customTypes?: RoutineCustomType[];
  focusMode?: boolean; tipsHidden?: boolean; historyGraph?: string; homeNextHidden?: boolean; collapsedBlocks?: string[]; revealBlocks?: string[];
}
export interface RoutineSettings { dayRolloverHour: number; updatedAt: number }
export interface RoutineStore {
  blocks: RoutineBlock[]; items: RoutineItem[]; placements: RoutinePlacement[]; compounds: RoutineCompound[]; logs: RoutineLog[];
  prefs: RoutinePrefs; settings: RoutineSettings;
}
/** What a screen reads: live rows only, shown routines in page order, hidden ones apart. */
export interface RoutineView extends RoutineStore { hiddenBlocks: RoutineBlock[] }

/* The ported logic is defensive about what it is handed, as the web code is. */
export type BlockLike = Partial<RoutineBlock>;
export type ItemLike = Partial<RoutineItem>;
export type PlacementLike = Partial<RoutinePlacement>;
export type CompoundLike = Partial<RoutineCompound>;
export type LogLike = Partial<RoutineLog>;
export type PrefsLike = Partial<RoutinePrefs>;
export interface ViewLike {
  blocks?: readonly BlockLike[]; hiddenBlocks?: readonly BlockLike[]; items?: readonly ItemLike[]; placements?: readonly PlacementLike[];
  compounds?: readonly CompoundLike[]; logs?: readonly LogLike[]; prefs?: PrefsLike | null; settings?: Partial<RoutineSettings> | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const ITEM_NOTE_MAX = 500;
export const LOG_NOTE_MAX = 280;
const KINDS = new Set(["check", "dose"]);

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
const SITE_IDS = new Set<string>(ROUTINE_SITES.map((site) => site.id));

export function routineSiteId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return SITE_IDS.has(id) ? id : "";
}

export function routineSiteLabel(id: unknown): string {
  const site = ROUTINE_SITES.find((row) => row.id === id);
  return site ? site.label : "";
}

/* Only real routines are seeded. Supplements, peptides and medications are
   item types with their own tabs, not blocks. */
export const DEFAULT_ROUTINE_BLOCKS = Object.freeze([
  Object.freeze({ key: "morning", name: "Morning routine", color: "citrus" }),
  Object.freeze({ key: "night", name: "Night routine", color: "pink" }),
] as const);

/* One type per item. A custom type is "type_" plus the id of its row. */
export const ROUTINE_ITEM_TYPES = Object.freeze(["supplement", "medication", "peptide", "enhancer", "other"] as const);
const ITEM_TYPE_SET = new Set<string>(ROUTINE_ITEM_TYPES);
const CUSTOM_TYPE = /^type_[A-Za-z0-9_-]{1,60}$/;

export function routineItemTypeId(value: unknown): string {
  if (typeof value !== "string") return "";
  if (ITEM_TYPE_SET.has(value) || CUSTOM_TYPE.test(value)) return value;
  return "";
}

export function isCustomRoutineType(value: unknown): value is string {
  return typeof value === "string" && CUSTOM_TYPE.test(value);
}

/* Seeded rows carry this stamp, not the seed time. Any real edit or delete of
   a default is newer, so another phone's later seed cannot undo it.
   Two seeds tie and are the same row. */
export const DEFAULT_BLOCK_STAMP = 1;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/* A lone surrogate becomes U+FFFD. Postgres rejects an unpaired \uD8xx escape, so one
   broken character would make every later push from this phone fail. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function wellFormed(text: string): string;
export function wellFormed<T>(text: T): T;
export function wellFormed(text: unknown): unknown {
  if (typeof text !== "string") return text;
  const native = (text as string & { toWellFormed?: () => string }).toWellFormed;
  if (typeof native === "function") return native.call(text);
  return text.replace(LONE_SURROGATE, "�");
}

type Segmenter = { segment(text: string): Iterable<{ segment: string }> };
let graphemes: Segmenter | false | null = null;
function graphemeSegmenter(): Segmenter | false {
  if (graphemes === null) {
    try {
      const make = (Intl as unknown as { Segmenter?: new (locale: undefined, options: { granularity: "grapheme" }) => Segmenter }).Segmenter;
      graphemes = typeof Intl === "object" && typeof make === "function" ? new make(undefined, { granularity: "grapheme" }) : false;
    } catch {
      graphemes = false;
    }
  }
  return graphemes;
}
/** Tests only: read Intl.Segmenter again on the next clip. */
export function forgetGraphemeSegmenter() { graphemes = null; }

/* Cuts to at most max UTF-16 units without splitting a character: whole graphemes (emoji, ZWJ
   sequences, flags) where Intl.Segmenter exists, else whole code points. */
export function clipText(value: unknown, max: number): string {
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

export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function amountOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function itemKind(value: unknown): string {
  if (typeof value === "string" && KINDS.has(value)) return value;
  if (typeof value === "string" && value.trim()) return clipText(value, 24);
  return "check";
}

type Raw = Record<string, unknown>;
function record(raw: unknown): Raw | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Raw) : null;
}

function entityBase(raw: Raw | null): Stamped | null {
  if (!raw || typeof raw.id !== "string" || !raw.id || raw.id.length > 80) return null;
  const deletedAt = typeof raw.deletedAt === "number" && raw.deletedAt > 0 ? raw.deletedAt : null;
  let updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0;
  if (deletedAt && updatedAt < deletedAt) updatedAt = deletedAt;
  return { id: raw.id, updatedAt, deletedAt };
}

/* A window the user picked, the weekdays it runs (Monday 0 to Sunday 6),
   and hidden. A hidden block keeps its placements and logs and can be
   restored; it is not a tombstone. */
export function normalizeBlock(input: unknown): RoutineBlock | null {
  const raw = record(input);
  const base = entityBase(raw);
  if (!raw || !base) return null;
  const row: RoutineBlock = { ...base, name: clipText(raw.name, 80), color: clipText(raw.color, 24) || "citrus", order: num(raw.order) };
  const start = routineMinuteOfDay(raw.startMin);
  if (start != null) {
    row.startMin = start;
    row.endMin = typeof raw.endMin === "number" && Number.isInteger(raw.endMin) && raw.endMin > start && raw.endMin <= start + 24 * 60 ? raw.endMin : start + 60;
  }
  if (Array.isArray(raw.days)) {
    const days = [...new Set((raw.days as unknown[]).filter((day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
    if (days.length && days.length < 7) row.days = days;
  }
  if (raw.hidden === true) row.hidden = true;
  return row;
}

/* Only the fields below are kept. A feeling, a seller or a price has nowhere to go. */
export function normalizeItem(input: unknown): RoutineItem | null {
  const raw = record(input);
  const base = entityBase(raw);
  if (!raw || !base) return null;
  const next: RoutineItem = { ...base, name: clipText(raw.name, 80), kind: itemKind(raw.kind), compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null };
  const note = clipText(typeof raw.note === "string" ? raw.note : "", ITEM_NOTE_MAX);
  if (note) next.note = note;
  const type = routineItemTypeId(raw.type);
  if (type) next.type = type;
  const timeMin = routineMinuteOfDay(raw.timeMin);
  if (timeMin != null) next.timeMin = timeMin;
  if (validDay(raw.startDate)) next.startDate = raw.startDate;
  const supplied = attachSupply<RoutineItem>({ ...next, onHand: raw.onHand as number, onHandDay: raw.onHandDay as string, mixedOn: raw.mixedOn as string });
  /* The time the count was typed only means something beside its day. */
  if (supplied.onHandDay && typeof raw.onHandAt === "number" && Number.isFinite(raw.onHandAt) && raw.onHandAt > 0) supplied.onHandAt = raw.onHandAt;
  if (typeof raw.calcVial === "number" && Number.isFinite(raw.calcVial) && typeof raw.calcWater === "number" && Number.isFinite(raw.calcWater)) {
    supplied.calcVial = raw.calcVial;
    supplied.calcWater = raw.calcWater;
    const unit = clipText(raw.calcVialUnit, 16);
    if (unit) supplied.calcVialUnit = unit;
  }
  return supplied;
}

export function normalizePlacement(input: unknown): RoutinePlacement | null {
  const raw = record(input);
  const base = entityBase(raw);
  if (!raw || !base || typeof raw.blockId !== "string" || !raw.blockId || typeof raw.itemId !== "string" || !raw.itemId) return null;
  return { ...base, blockId: raw.blockId, itemId: raw.itemId, order: num(raw.order) };
}

export function normalizeCompound(input: unknown): RoutineCompound | null {
  const raw = record(input);
  const base = entityBase(raw);
  if (!raw || !base) return null;
  return {
    ...base,
    name: clipText(raw.name, 80),
    amount: amountOf(raw.amount),
    unit: clipText(raw.unit, 16),
    startDate: validDay(raw.startDate) ? raw.startDate : null,
    archivedAt: typeof raw.archivedAt === "number" && raw.archivedAt > 0 ? raw.archivedAt : null,
    chartLine: raw.chartLine === true,
  };
}

/* A log needs a real day and a status. A site is kept only on a taken dose.
   An undone log keeps its amount, unit and note and is not live. */
export function normalizeLog(input: unknown): RoutineLog | null {
  const raw = record(input);
  const base = entityBase(raw);
  const status = raw && typeof raw.status === "string" ? clipText(raw.status, 24) : "";
  if (!raw || !base || !validDay(raw.day) || !status) return null;
  const row: RoutineLog = {
    ...base,
    itemId: typeof raw.itemId === "string" && raw.itemId ? raw.itemId : null,
    compoundId: typeof raw.compoundId === "string" && raw.compoundId ? raw.compoundId : null,
    day: raw.day,
    status,
    amount: amountOf(raw.amount),
    unit: clipText(raw.unit, 16),
    at: num(raw.at),
  };
  const note = clipText(typeof raw.note === "string" ? raw.note : "", LOG_NOTE_MAX);
  if (note) row.note = note;
  if (raw.rest === true) row.rest = true;
  const taken = (status === "done" || status === "partial") && raw.rest !== true;
  const site = taken ? routineSiteId(raw.site) : "";
  if (site) row.site = site;
  if (raw.undone === true && base.deletedAt) row.undone = true;
  return row;
}

function idList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = [...new Set(value.filter((id): id is string => typeof id === "string" && !!id && id.length <= 80))];
  return list.length ? list : undefined;
}

/* Only the known prefs survive. Setup answers are picks from a fixed list, kept as short words. */
export function normalizePrefs(input: unknown): RoutinePrefs {
  const raw = record(input) ?? {};
  const prefs: RoutinePrefs = { lastBlockId: typeof raw.lastBlockId === "string" && raw.lastBlockId ? raw.lastBlockId : null, updatedAt: num(raw.updatedAt) };
  const setup = record(raw.setup);
  if (setup && (setup.status === "done" || setup.status === "skipped")) {
    const answers: SetupAnswers = {};
    for (const [key, value] of Object.entries(record(setup.answers) ?? {})) {
      if (typeof value === "string" && value) answers[key] = clipText(value, 80);
      else if (Array.isArray(value)) answers[key] = value.filter((word): word is string => typeof word === "string" && !!word).map((word) => clipText(word, 80));
    }
    prefs.setup = { v: 1, status: setup.status, answers, updatedAt: num(setup.updatedAt) };
  }
  for (const key of ["added", "typeTabs", "collapsedBlocks", "revealBlocks"] as const) {
    const list = idList(raw[key]);
    if (list) prefs[key] = list;
  }
  if (Array.isArray(raw.customTypes)) {
    const types: RoutineCustomType[] = [];
    for (const entry of raw.customTypes as unknown[]) {
      const row = record(entry);
      const name = row ? clipText(row.name, 40) : "";
      if (row && isCustomRoutineType(row.id) && name && !types.some((type) => type.id === row.id)) types.push({ id: row.id, name });
    }
    if (types.length) prefs.customTypes = types;
  }
  if (raw.focusMode === true) prefs.focusMode = true;
  if (raw.tipsHidden === true) prefs.tipsHidden = true;
  if (raw.homeNextHidden === true) prefs.homeNextHidden = true;
  if (typeof raw.historyGraph === "string" && raw.historyGraph) prefs.historyGraph = clipText(raw.historyGraph, 24);
  return prefs;
}

export function emptyRoutineStore(): RoutineStore {
  return { blocks: [], items: [], placements: [], compounds: [], logs: [], prefs: { lastBlockId: null, updatedAt: 0 }, settings: { dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR, updatedAt: 0 } };
}

function list<T>(value: unknown, normalize: (raw: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const row = normalize(raw);
    if (row) out.push(row);
  }
  return out;
}

/* A clean copy. Bad rows drop out, text is clipped, and nothing outside the known fields survives. */
export function normalizeRoutineStore(input: unknown): RoutineStore | null {
  const raw = record(input);
  if (!raw) return null;
  const prefs = record(raw.prefs) ?? {};
  const settings = record(raw.settings) ?? {};
  return {
    blocks: list(raw.blocks, normalizeBlock),
    items: list(raw.items, normalizeItem),
    placements: list(raw.placements, normalizePlacement),
    compounds: list(raw.compounds, normalizeCompound),
    logs: list(raw.logs, normalizeLog),
    prefs: normalizePrefs(prefs),
    settings: { dayRolloverHour: routineDayRolloverHour(settings.dayRolloverHour), updatedAt: num(settings.updatedAt) },
  };
}

export function isLive(entity: { deletedAt?: number | null } | null | undefined): boolean {
  return !!(entity && !(typeof entity.deletedAt === "number" && entity.deletedAt > 0));
}

export function liveOf<T extends { deletedAt?: number | null }>(rows: readonly T[] | null | undefined): T[] {
  return (Array.isArray(rows) ? rows : []).filter(isLive);
}

export function rowStamp(entity: { updatedAt?: number; deletedAt?: number | null } | null | undefined): number {
  const updated = entity && typeof entity.updatedAt === "number" && entity.updatedAt > 0 ? entity.updatedAt : 0;
  const deleted = entity && typeof entity.deletedAt === "number" && entity.deletedAt > 0 ? entity.deletedAt : 0;
  return Math.max(updated, deleted);
}

function byId(a: { id: string }, b: { id: string }) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

/* One live row per key in the view: one log per item and day, one rest per
   day. Ids are made from those same parts, so a second row can only come
   from an older build or a hand-edited backup. The newer stamp shows. */
function oneLivePer<T extends Stamped>(rows: T[], keyOf: (row: T) => string): T[] {
  const winners = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const current = winners.get(key);
    if (!current || rowStamp(row) > rowStamp(current) || (rowStamp(row) === rowStamp(current) && row.id < current.id)) winners.set(key, row);
  }
  return rows.filter((row) => {
    const key = keyOf(row);
    return !key || winners.get(key) === row;
  });
}

export function projectRoutineStore(store: unknown): RoutineView | null {
  const normalized = normalizeRoutineStore(store);
  if (!normalized) return null;
  const ordered = liveOf(normalized.blocks).slice().sort((a, b) => a.order - b.order || byId(a, b));
  return {
    ...normalized,
    blocks: ordered.filter((block) => block.hidden !== true),
    hiddenBlocks: ordered.filter((block) => block.hidden === true),
    items: liveOf(normalized.items),
    placements: oneLivePer(liveOf(normalized.placements), (row) => `${row.blockId}\0${row.itemId}`),
    compounds: liveOf(normalized.compounds),
    logs: oneLivePer(liveOf(normalized.logs), (log) => (log.rest === true ? `rest\0${log.day}` : log.itemId ? `item\0${log.itemId}\0${log.day}` : "")),
  };
}

/* The newest other taken log for this item that still has a site.
   A skip, a rest, and an undone log do not count. The log being edited
   is excluded so it is not its own last site. */
export function lastRoutineSite(store: unknown, itemId: unknown, exceptLogId?: string): string {
  const view = projectRoutineStore(store);
  if (!view || typeof itemId !== "string" || !itemId) return "";
  const rows = view.logs.filter((log) => {
    if (log.itemId !== itemId || log.rest === true) return false;
    if (exceptLogId && log.id === exceptLogId) return false;
    if (log.status !== "done" && log.status !== "partial") return false;
    return !!routineSiteId(log.site);
  });
  rows.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    const at = (b.at || 0) - (a.at || 0);
    if (at) return at;
    return byId(a, b);
  });
  return rows[0] ? routineSiteId(rows[0].site) : "";
}
