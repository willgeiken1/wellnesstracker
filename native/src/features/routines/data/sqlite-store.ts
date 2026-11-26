/* Routines kept in the phone's daily_* tables, behind the store the screens use.

   The screens and tiles read one RoutinesState (model.ts) and change it only through RoutinesStore (store.ts). This
   file is the storage under that store: it reads the rows into a state, and saves a changed state back as the rows
   that differ, in one transaction. Nothing here leaves the phone: the tables are not in the sync list while routine
   sync is off, no daily_* row is queued for upload, and this file imports no network, analytics or crash-report code.

   How the state maps to rows:
   - a routine, shown or hidden, is a daily_blocks row; its pauses are daily_pauses rows;
   - an item is a daily_items row; what the person typed as its amount and unit is a daily_compounds row;
   - an item in a routine is a daily_placements row, item_rank keeping which routine leads;
   - a check-off is a daily_logs row, one per item and day. Taking a check-off away keeps the row, marked undone,
     so it can be put back; a day older than the history the store keeps is removed and keeps no values.
   The screens' own ids (like "morning" or "n1abc") are kept in app_id; row ids are UUIDs made from them.

   The app never works out an amount: an item's amount is only what the person typed, stored as typed. */

import type { Repository } from '@/data/repository';
import type { Row, Scalar, Table } from '@/data/rows';
import {
  ALL_DAYS, addDays, dayKey, normalize, nowOf, pretty, ROUTINE_COLORS,
  type HiddenRoutine, type Item, type ItemKind, type ItemType, type Mark, type Pause, type Routine, type RoutineColor, type RoutinesState,
} from '../model';
import { isRoutineRowId, routineLogId, routinePlacementId, routineUuid } from '../model/ids';
import type { NewItem, NewRoutine, RoutinesStore } from '../store';

type Data = Row['data'];
/** History older than this many days is dropped by the store on write; its rows are removed rather than kept undone. */
const KEEP_DAYS = 120;

/* ---------- ids ---------- */

/** The row id for a screen id. A screen id that is already a row id (a routine made before app_id) is kept. */
export const blockRowId = (id: string) => (isRoutineRowId(id) ? id : routineUuid('block', id));
export const itemRowId = (id: string) => (isRoutineRowId(id) ? id : routineUuid('item', id));
const compoundRowId = (itemRow: string) => routineUuid('compound', itemRow);
const pauseRowId = (blockRow: string, k: number) => routineUuid('pause', blockRow, String(k));

/* ---------- values ---------- */

const text = (v: Scalar | undefined): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: Scalar | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const orNull = <T>(v: T | undefined | null): T | null => (v === undefined || v === null ? null : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const minutes = (h: number, lo: number, hi: number) => clamp(Math.round(h * 60), lo, hi);

/* Weekdays as a mask, Monday bit 0 to Sunday bit 6, the order the web app's rows use. The screens count 0 as Sunday. */
const bit = (wd: number) => 1 << ((wd + 6) % 7);
function maskOf(days: readonly number[]): number { return [...new Set(days)].filter(d => d >= 0 && d <= 6).reduce((m, d) => m | bit(d), 0); }
function daysOf(mask: number): number[] { return ALL_DAYS.filter(d => (mask & bit(d)) !== 0); }
/** A routine's days: every day is stored as no mask. */
const blockMask = (days: readonly number[]) => { const m = maskOf(days); return m === 0 || m === 127 ? null : m; };
/** An item's days: null is every day; a list keeps its exact days, all seven (127) and none (0) included. */
const itemMask = (days: readonly number[] | null) => (days ? maskOf(days) : null);

const TYPE_ROW: Record<ItemType, string> = { Supplement: 'supplement', Peptide: 'peptide', Medication: 'medication', Enhancer: 'enhancer', Other: 'other' };
const TYPE_OF: Record<string, ItemType> = Object.fromEntries(Object.entries(TYPE_ROW).map(([k, v]) => [v, k as ItemType]));
const isColor = (v: unknown): v is RoutineColor => typeof v === 'string' && (ROUTINE_COLORS as readonly string[]).includes(v);

/* ---------- reading ---------- */

const byPosition = (a: Row, b: Row) => (num(a.data.position) ?? 0) - (num(b.data.position) ?? 0) || (a.id < b.id ? -1 : 1);
const dayOfStamp = (ms: number) => dayKey(new Date(ms));

/** The state the rows hold, or null when this account has no routine rows yet. */
export function readRoutinesState(repo: Repository): RoutinesState | null {
  const blocks = repo.list('daily_blocks'), items = repo.list('daily_items');
  if (!blocks.length && !items.length) return null;
  const pauses = repo.list('daily_pauses'), placements = repo.list('daily_placements'), compounds = repo.list('daily_compounds'), logs = repo.list('daily_logs');

  const appId = new Map<string, string>();
  for (const row of blocks) appId.set(row.id, text(row.data.app_id) ?? row.id);
  const pausesOf = new Map<string, Row[]>();
  for (const row of pauses) { const b = text(row.data.block_id); if (b) pausesOf.set(b, [...(pausesOf.get(b) ?? []), row]); }
  const toRoutine = (row: Row): Routine => {
    const from = num(row.data.start_min) !== undefined ? num(row.data.start_min)! / 60 : 8;
    const to = num(row.data.end_min) !== undefined ? num(row.data.end_min)! / 60 : Math.min(24, from + 1);
    const mask = num(row.data.days_mask);
    return {
      id: appId.get(row.id)!, name: text(row.data.name) ?? '', from, to, color: isColor(row.data.color) ? row.data.color : 'sleep',
      days: mask === undefined ? [...ALL_DAYS] : daysOf(mask), remind: row.data.remind !== 0,
      pauses: (pausesOf.get(row.id) ?? []).sort(byPosition).flatMap((p): Pause[] => {
        const from = text(p.data.from_day), until = text(p.data.until_day);
        return from && until ? [{ from, until, why: text(p.data.why) ?? null }] : [];
      }),
    };
  };
  const shown = blocks.filter(r => r.data.hidden !== 1).sort(byPosition), hiddenRows = blocks.filter(r => r.data.hidden === 1).sort(byPosition);
  const routines = shown.map(toRoutine);
  const hidden: HiddenRoutine[] = hiddenRows.map(r => ({ ...toRoutine(r), sub: text(r.data.hidden_sub) ?? '' }));

  const compoundById = new Map(compounds.map(r => [r.id, r]));
  const placed = new Map<string, Row[]>();
  for (const row of placements) { const i = text(row.data.item_id); if (i && text(row.data.block_id)) placed.set(i, [...(placed.get(i) ?? []), row]); }
  const rank = (r: Row) => num(r.data.item_rank) ?? num(r.data.position) ?? 0;
  const firstFrom = (rids: string[]) => routines.find(r => r.id === rids[0])?.from ?? hidden.find(r => r.id === rids[0])?.from;
  const itemId = new Map<string, string>();
  const outItems: Item[] = items.sort(byPosition).map(row => {
    const id = text(row.data.app_id) ?? row.id;
    itemId.set(row.id, id);
    const c = compoundById.get(text(row.data.compound_id) ?? '');
    const amt = c ? orNull(num(c.data.amount)) : null, unit = c ? text(c.data.unit) ?? '' : '';
    const kind: ItemKind = row.data.kind === 'dose' ? 'dose' : 'check';
    const rids = (placed.get(row.id) ?? []).sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1)).map(p => appId.get(String(p.data.block_id)) ?? String(p.data.block_id));
    const mask = num(row.data.days_mask);
    const time = num(row.data.time_min);
    const item: Item = {
      id, name: text(row.data.name) ?? '', amt, unit,
      dose: text(row.data.dose) ?? (kind === 'dose' && amt !== null ? `${pretty(amt)} ${unit}`.trim() : 'Tick when done'),
      type: TYPE_OF[String(row.data.type)] ?? 'Other', kind, routines: rids,
      h: time !== undefined ? time / 60 : firstFrom(rids) ?? 9,
      days: mask === undefined ? null : daysOf(mask),
      created: text(row.data.start_day) ?? dayOfStamp(row.updated_at),
    };
    const left = num(row.data.on_hand), perDay = num(row.data.per_day), vial = num(row.data.vial);
    if (left !== undefined) item.left = left;
    if (perDay !== undefined) item.perDay = perDay;
    if (vial !== undefined) item.vial = vial;
    const sup = text(row.data.supply_word), site = text(row.data.site), note = text(row.data.note), mixed = text(row.data.mixed);
    if (sup) item.sup = sup;
    if (site) item.site = site;
    if (note) item.note = note;
    if (mixed) item.mixed = mixed;
    return item;
  });

  const log: RoutinesState['log'] = {};
  for (const row of logs) {
    const mark = markOfRow(row), day = text(row.data.day), item = text(row.data.item_id);
    if (!mark || !day || !item) continue;
    (log[day] ??= {})[itemId.get(item) ?? item] = mark;
  }
  return normalize({ v: 1, routines, hidden, items: outItems, log });
}
/** A live check-off: done or skipped, not undone, on an item (a rest day is not a check-off). */
function markOfRow(row: Row): Mark | null {
  if (row.deleted_at !== null || row.data.undone === 1 || !text(row.data.item_id)) return null;
  return row.data.status === 'done' ? 'd' : row.data.status === 'skipped' ? 's' : null;
}

/* ---------- writing ---------- */

function encodeBlock(r: Routine, position: number, hiddenSub: string | null): Data {
  const start = minutes(r.from, 0, 1439);
  return {
    app_id: r.id, name: r.name, color: r.color, position, start_min: start, end_min: Math.max(start + 1, minutes(r.to, 1, 2879)),
    days_mask: blockMask(r.days), hidden: hiddenSub === null ? 0 : 1, hidden_sub: hiddenSub, remind: r.remind ? 1 : 0,
  };
}
function encodeItem(i: Item, position: number, compoundId: string | null): Data {
  return {
    app_id: i.id, name: i.name, kind: i.kind, type: TYPE_ROW[i.type] ?? 'other', compound_id: compoundId, note: orNull(i.note), dose: i.dose,
    time_min: minutes(i.h, 0, 1439), start_day: i.created, days_mask: itemMask(i.days), position,
    on_hand: orNull(i.left), per_day: orNull(i.perDay), vial: orNull(i.vial), supply_word: orNull(i.sup), site: orNull(i.site), mixed: orNull(i.mixed),
  };
}
const hasAmount = (i: Item) => i.amt !== null || !!i.unit;

/** Rows by table and id, as the state wants them. Logs are handled on their own. */
function desiredRows(s: RoutinesState, itemRows: Map<string, Row>): Map<Table, Map<string, Data>> {
  const out = new Map<Table, Map<string, Data>>((['daily_blocks', 'daily_pauses', 'daily_items', 'daily_compounds', 'daily_placements'] as Table[]).map(t => [t, new Map()]));
  const put = (t: Table, id: string, d: Data) => out.get(t)!.set(id, d);
  const block = (r: Routine, k: number, sub: string | null) => {
    const id = blockRowId(r.id);
    put('daily_blocks', id, encodeBlock(r, k, sub));
    r.pauses.forEach((p, n) => put('daily_pauses', pauseRowId(id, n), { block_id: id, from_day: p.from, until_day: p.until, why: orNull(p.why), position: n }));
  };
  s.routines.forEach((r, k) => block(r, k, null));
  s.hidden.forEach((r, k) => block(r, k, r.sub ?? ''));
  const inBlock = new Map<string, number>();
  s.items.forEach((i, k) => {
    const id = itemRowId(i.id), current = itemRows.get(id);
    const compound = hasAmount(i) ? text(current?.data.compound_id) ?? compoundRowId(id) : null;
    put('daily_items', id, encodeItem(i, k, compound));
    if (compound) put('daily_compounds', compound, { name: i.name, amount: i.amt, unit: i.unit || null, start_day: i.created });
    [...new Set(i.routines)].forEach((rid, rankAt) => {
      const b = blockRowId(rid), at = inBlock.get(b) ?? 0;
      inBlock.set(b, at + 1);
      put('daily_placements', routinePlacementId(b, id), { block_id: b, item_id: id, position: at, item_rank: rankAt });
    });
  });
  return out;
}

/* An on/off column reads the same empty as off; any other empty is null. */
const FLAGS = new Set(['hidden', 'chart_line', 'rest', 'undone']);
function sameValues(want: Data, have: Data): boolean {
  return Object.keys(want).every(k => (want[k] ?? (FLAGS.has(k) ? 0 : null)) === (have[k] ?? (FLAGS.has(k) ? 0 : null)));
}


/** Makes the rows match the state, writing only what differs, in one transaction. `prev` is the state the rows held
 *  before, when known: then only the check-offs that changed are looked at. Returns how many rows were written. */
export function commitRoutinesState(repo: Repository, next: RoutinesState, prev: RoutinesState | null, now = Date.now()): number {
  return repo.atomic(() => {
    let written = 0;
    const save = (t: Table, id: string, want: Data, have: Row | undefined) => {
      if (have && have.deleted_at === null && sameValues(want, have.data)) return;
      // Columns this state does not speak for (from rows made before this store) are kept as they are.
      repo.save(t, { ...(have && have.deleted_at === null ? have.data : {}), ...want }, id, now); written++;
    };
    const itemRows = new Map(repo.list('daily_items').map(r => [r.id, r]));
    const want = desiredRows(next, itemRows);
    // A compound this store made, or one an item pointed at, goes when no item points at it any more.
    const ownCompounds = new Set<string>([...itemRows.values()].flatMap(r => [compoundRowId(r.id), text(r.data.compound_id) ?? '']).filter(Boolean));
    for (const [table, rows] of want) {
      const have = new Map(repo.list(table).map(r => [r.id, r]));
      for (const [id, data] of rows) save(table, id, data, have.get(id) ?? repo.get(table, id));
      for (const row of have.values()) {
        if (rows.has(row.id) || (table === 'daily_compounds' && !ownCompounds.has(row.id))) continue;
        repo.remove(table, row.id, now); written++;
      }
    }

    // Check-offs: one row per item and day.
    const keepFrom = addDays(nowOf().day, -KEEP_DAYS);
    const touch = new Map<string, [string, string]>();
    const add = (day: string, id: string) => touch.set(`${day}\u0000${id}`, [day, id]);
    const markIn = (log: RoutinesState['log'], day: string, id: string) => log[day]?.[id] ?? null;
    if (prev) {
      // Only what changed since the state the rows held.
      for (const log of [prev.log, next.log]) for (const [day, marks] of Object.entries(log)) for (const id of Object.keys(marks)) {
        if (markIn(prev.log, day, id) !== markIn(next.log, day, id)) add(day, id);
      }
    } else {
      // Nothing known about the rows: every check-off in the state, and every live check-off row.
      for (const [day, marks] of Object.entries(next.log)) for (const id of Object.keys(marks)) add(day, id);
      const appOf = new Map([...itemRows.values()].map(r => [r.id, text(r.data.app_id) ?? r.id]));
      for (const row of repo.list('daily_logs')) {
        const item = text(row.data.item_id), day = text(row.data.day);
        if (markOfRow(row) && item && day) add(day, appOf.get(item) ?? item);
      }
    }
    for (const [day, id] of touch.values()) {
      const item = itemRowId(id), rowId = routineLogId(item, day);
      const mark = next.log[day]?.[id] ?? null, have = repo.get('daily_logs', rowId);
      if (mark) {
        const status = mark === 'd' ? 'done' : 'skipped';
        if (have && have.deleted_at === null && have.data.status === status && have.data.undone !== 1) continue;
        repo.save('daily_logs', { item_id: item, compound_id: null, day, status, amount: null, unit: null, note: null, at: now, site: null, rest: 0, undone: 0 }, rowId, now); written++;
      } else if (have && have.deleted_at === null) {
        if (day < keepFrom) { repo.remove('daily_logs', rowId, now); written++; }
        else if (have.data.undone !== 1) { repo.save('daily_logs', { ...have.data, undone: 1 }, rowId, now); written++; }
      }
    }
    return written;
  });
}

/* ---------- the store over the tables ---------- */

export interface TablesIoOptions {
  /** Where an earlier build kept the whole state as one JSON document. A document found there is taken into the
   *  tables once and the key is cleared, so it is never read again. */
  legacyKey: string;
  /** The demo's sample state, written the first time the demo opens. */
  seed?: () => RoutinesState;
}

/** The get, save and subscribe that createRoutinesStore runs on, kept in the daily_* tables. */
export function routineTablesIo(repo: Repository, options: TablesIoOptions) {
  let prev: RoutinesState | null = null;
  let writing = false;
  const stampOf = () => (typeof repo.routineTablesStamp === 'function' ? repo.routineTablesStamp() : null);
  let seen: string | null = null;
  const write = (fn: () => void) => {
    writing = true;
    try { fn(); } finally { writing = false; seen = stampOf(); }
  };
  const takeLegacy = () => {
    const raw = repo.localGet<unknown>(options.legacyKey);
    if (raw === undefined || raw === null) return;
    const doc = normalize(raw);
    write(() => repo.atomic(() => {
      if (doc) commitRoutinesState(repo, doc, null);
      repo.localSave(options.legacyKey, null);
    }));
    prev = null;
  };
  return {
    get(): RoutinesState | null {
      takeLegacy();
      prev = readRoutinesState(repo);
      return prev;
    },
    save(s: RoutinesState) {
      const before = prev;
      write(() => { commitRoutinesState(repo, s, before); });
      prev = s;
    },
    subscribe(listener: () => void) {
      seen = stampOf();
      return repo.subscribe(() => {
        if (writing) return;
        const legacy = repo.localGet<unknown>(options.legacyKey);
        const stamp = stampOf();
        // Another writer: a new document under the old key (setup writes one), or rows changed outside this store.
        if ((legacy !== undefined && legacy !== null) || stamp === null || stamp !== seen) { seen = stamp; listener(); }
      });
    },
    seed: options.seed,
  };
}

/* ---------- guards the screens lean on ---------- */

/** How long a second identical Save counts as the same press. */
const DOUBLE_TAP_MS = 1500;

/** Wraps a store so that Save pressed twice adds one item or routine, not two. An add that was undone can be made again. */
export function guardRoutinesStore(store: RoutinesStore, now: () => number = () => Date.now()): RoutinesStore {
  let item: { key: string; at: number; result: ReturnType<RoutinesStore['addItem']> } | null = null;
  let routine: { key: string; at: number; result: Routine } | null = null;
  const fresh = (last: { key: string; at: number } | null, key: string) => !!last && last.key === key && now() - last.at < DOUBLE_TAP_MS;
  return {
    ...store,
    addItem(draft: NewItem) {
      const key = JSON.stringify(draft);
      if (item && fresh(item, key) && store.read().items.some(i => i.id === item!.result.item.id)) return item.result;
      const result = store.addItem(draft);
      item = { key, at: now(), result };
      return result;
    },
    addRoutine(draft: NewRoutine) {
      const key = JSON.stringify(draft);
      if (routine && fresh(routine, key) && store.read().routines.some(r => r.id === routine!.result.id)) return routine.result;
      const result = store.addRoutine(draft);
      routine = { key, at: now(), result };
      return result;
    },
  };
}
