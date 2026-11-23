/* Routines on this phone, read from and written to their own tables.

   The logic in model/ works on one shape (model/shape.ts). This file turns
   rows into that shape and saves a changed shape back as the rows that
   differ, in one transaction. Nothing here leaves the phone: the tables are
   not in the sync list, and this file imports no network, analytics or
   crash-report code.

   A removed row keeps no values, so a deleted item cannot be read back
   later. An undone log is different: it stays a row, marked undone, with
   its amount, unit and note, so it can be restored. */

import type { Repository } from '@/data/repository';
import type { Row, Scalar } from '@/data/rows';
import { DEFAULT_DAY_ROLLOVER_HOUR, routineDayRolloverHour } from './model/dose';
import { customTypeId, customTypeRowId, DEFAULT_BLOCK_IDS, isRoutineRowId, ROUTINE_PREFS_ID } from './model/ids';
import {
  clipText, DEFAULT_BLOCK_STAMP, DEFAULT_ROUTINE_BLOCKS, isLive, normalizeRoutineStore,
  type RoutineBlock, type RoutineCompound, type RoutineItem, type RoutineLog, type RoutinePlacement, type RoutinePrefs, type RoutineStore, type SetupAnswers,
} from './model/shape';

type Data = Row['data'];
type RoutineTable = 'daily_blocks' | 'daily_items' | 'daily_placements' | 'daily_compounds' | 'daily_logs' | 'daily_types' | 'daily_prefs';

const text = (value: Scalar | undefined): string | undefined => (typeof value === 'string' && value ? value : undefined);
const numberOf = (value: Scalar | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const flag = (value: boolean | undefined): number => (value === true ? 1 : 0);
const orNull = <T extends Scalar>(value: T | undefined): T | null => (value === undefined ? null : value);

const WORD = /^[A-Za-z0-9_-]{1,80}$/;
function words(value: Scalar | undefined): string[] | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const list = raw.split(',').filter(word => WORD.test(word));
  return list.length ? list : undefined;
}
function joined(list: readonly string[] | undefined): string | null {
  const kept = (Array.isArray(list) ? list : []).filter(word => typeof word === 'string' && WORD.test(word));
  return kept.length ? [...new Set(kept)].join(',') : null;
}

/* Setup answers are picks from a fixed list, never typed text: "goal=sleep;types=[peptide,supplement]".
   Two picks end in a plus ("5+", "9+"), so a pick may. */
const PICK = /^[A-Za-z0-9_-]{1,40}\+?$/;
function encodeAnswers(answers: SetupAnswers | undefined): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (!WORD.test(key)) continue;
    if (typeof value === 'string' && PICK.test(value)) parts.push(`${key}=${value}`);
    else if (Array.isArray(value)) parts.push(`${key}=[${value.filter(word => typeof word === 'string' && PICK.test(word)).join(',')}]`);
  }
  return parts.length ? parts.join(';') : null;
}
function decodeAnswers(raw: string | undefined): SetupAnswers {
  const answers: SetupAnswers = {};
  for (const part of (raw ?? '').split(';')) {
    const at = part.indexOf('=');
    const key = at > 0 ? part.slice(0, at) : '';
    const value = part.slice(at + 1);
    if (!WORD.test(key)) continue;
    if (value.startsWith('[') && value.endsWith(']')) answers[key] = value.slice(1, -1).split(',').filter(word => PICK.test(word));
    else if (PICK.test(value)) answers[key] = value;
  }
  return answers;
}

/* Monday is bit 0 and Sunday bit 6. Every day, or none picked, is stored as no mask. */
function daysMask(days: readonly number[] | undefined): number | null {
  if (!days || !days.length || days.length >= 7) return null;
  return days.reduce((mask, day) => mask | (1 << day), 0);
}
function maskDays(mask: number | undefined): number[] | undefined {
  if (mask === undefined || mask <= 0 || mask >= 127) return undefined;
  return [0, 1, 2, 3, 4, 5, 6].filter(day => (mask & (1 << day)) !== 0);
}

const encodeBlock = (row: RoutineBlock): Data => ({
  name: row.name, color: row.color, position: Math.round(row.order), start_min: orNull(row.startMin), end_min: orNull(row.startMin === undefined ? undefined : row.endMin),
  days_mask: daysMask(row.days), hidden: flag(row.hidden),
});
const encodeItem = (row: RoutineItem): Data => ({
  name: row.name, kind: row.kind, type: orNull(row.type), compound_id: row.compoundId, note: orNull(row.note), time_min: orNull(row.timeMin), start_day: orNull(row.startDate),
  on_hand: orNull(row.onHand), on_hand_day: orNull(row.onHandDay), on_hand_at: orNull(row.onHandAt), mixed_day: orNull(row.mixedOn),
  calc_vial: orNull(row.calcVial), calc_vial_unit: orNull(row.calcVialUnit), calc_water: orNull(row.calcWater),
});
const encodePlacement = (row: RoutinePlacement): Data => ({ block_id: row.blockId, item_id: row.itemId, position: Math.round(row.order) });
const encodeCompound = (row: RoutineCompound): Data => ({
  name: row.name, amount: row.amount, unit: row.unit || null, start_day: row.startDate, archived_at: row.archivedAt, chart_line: flag(row.chartLine),
});
const encodeLog = (row: RoutineLog): Data => ({
  item_id: row.itemId, compound_id: row.compoundId, day: row.day, status: row.status, amount: row.amount, unit: row.unit || null, note: orNull(row.note),
  at: Math.round(row.at), site: orNull(row.site), rest: flag(row.rest), undone: flag(row.undone === true && !isLive(row)),
});
function encodePrefs(store: RoutineStore): Data {
  const prefs = store.prefs;
  return {
    last_block_id: prefs.lastBlockId, day_rollover_hour: routineDayRolloverHour(store.settings.dayRolloverHour), focus_mode: flag(prefs.focusMode), tips_hidden: flag(prefs.tipsHidden),
    history_graph: typeof prefs.historyGraph === 'string' && WORD.test(prefs.historyGraph) ? prefs.historyGraph : null, home_next_hidden: flag(prefs.homeNextHidden),
    setup_status: prefs.setup ? prefs.setup.status : null, setup_answers: prefs.setup ? encodeAnswers(prefs.setup.answers) : null, setup_at: prefs.setup ? Math.round(prefs.setup.updatedAt) : null,
    added: joined(prefs.added), type_tabs: joined(prefs.typeTabs), collapsed_blocks: joined(prefs.collapsedBlocks), reveal_blocks: joined(prefs.revealBlocks),
  };
}

const stamps = (row: Row) => ({ id: row.id, updatedAt: row.updated_at, deletedAt: null });

/** Everything this owner has, as the shape the logic reads. Removed rows are left out; undone logs are kept, not live. */
export function readRoutineStore(repo: Repository): RoutineStore {
  const prefsRow = repo.get('daily_prefs', ROUTINE_PREFS_ID);
  const saved = prefsRow && prefsRow.deleted_at === null ? prefsRow.data : undefined;
  const types = repo.list('daily_types').slice().sort((a, b) => (numberOf(a.data.position) ?? 0) - (numberOf(b.data.position) ?? 0) || (a.id < b.id ? -1 : 1));
  const prefs: RoutinePrefs = { lastBlockId: (saved && text(saved.last_block_id)) ?? null, updatedAt: prefsRow ? prefsRow.updated_at : 0 };
  if (saved) {
    const status = text(saved.setup_status);
    if (status === 'done' || status === 'skipped') prefs.setup = { v: 1, status, answers: decodeAnswers(text(saved.setup_answers)), updatedAt: numberOf(saved.setup_at) ?? 0 };
    for (const [key, column] of [['added', 'added'], ['typeTabs', 'type_tabs'], ['collapsedBlocks', 'collapsed_blocks'], ['revealBlocks', 'reveal_blocks']] as const) {
      const list = words(saved[column]);
      if (list) prefs[key] = list;
    }
    if (saved.focus_mode === 1) prefs.focusMode = true;
    if (saved.tips_hidden === 1) prefs.tipsHidden = true;
    if (saved.home_next_hidden === 1) prefs.homeNextHidden = true;
    const graph = text(saved.history_graph);
    if (graph) prefs.historyGraph = graph;
  }
  if (types.length) prefs.customTypes = types.map(row => ({ id: customTypeId(row.id), name: text(row.data.name) ?? '' }));
  const store = normalizeRoutineStore({
    blocks: repo.list('daily_blocks').map(row => ({
      ...stamps(row), name: row.data.name, color: row.data.color, order: row.data.position, startMin: numberOf(row.data.start_min), endMin: numberOf(row.data.end_min),
      days: maskDays(numberOf(row.data.days_mask)), hidden: row.data.hidden === 1,
    })),
    items: repo.list('daily_items').map(row => ({
      ...stamps(row), name: row.data.name, kind: row.data.kind, type: text(row.data.type), compoundId: text(row.data.compound_id) ?? null, note: text(row.data.note),
      timeMin: numberOf(row.data.time_min), startDate: text(row.data.start_day), onHand: numberOf(row.data.on_hand), onHandDay: text(row.data.on_hand_day), onHandAt: numberOf(row.data.on_hand_at),
      mixedOn: text(row.data.mixed_day), calcVial: numberOf(row.data.calc_vial), calcVialUnit: text(row.data.calc_vial_unit), calcWater: numberOf(row.data.calc_water),
    })),
    placements: repo.list('daily_placements').map(row => ({ ...stamps(row), blockId: row.data.block_id, itemId: row.data.item_id, order: row.data.position })),
    compounds: repo.list('daily_compounds').map(row => ({
      ...stamps(row), name: row.data.name, amount: row.data.amount, unit: row.data.unit ?? '', startDate: row.data.start_day, archivedAt: row.data.archived_at, chartLine: row.data.chart_line === 1,
    })),
    logs: repo.list('daily_logs').map(row => ({
      ...stamps(row), itemId: row.data.item_id, compoundId: row.data.compound_id, day: row.data.day, status: row.data.status, amount: row.data.amount, unit: row.data.unit ?? '',
      note: text(row.data.note), at: row.data.at, site: text(row.data.site), rest: row.data.rest === 1, undone: row.data.undone === 1, deletedAt: row.data.undone === 1 ? row.updated_at : null,
    })),
    prefs,
    settings: { dayRolloverHour: saved ? numberOf(saved.day_rollover_hour) ?? DEFAULT_DAY_ROLLOVER_HOUR : DEFAULT_DAY_ROLLOVER_HOUR, updatedAt: prefsRow ? prefsRow.updated_at : 0 },
  });
  if (!store) throw new Error('Local data is unavailable.');
  return store;
}

/* An on/off column reads the same empty as off. */
const FLAGS = new Set(['hidden', 'chart_line', 'rest', 'undone', 'focus_mode', 'tips_hidden', 'home_next_hidden']);
function same(a: Data, b: Data): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key] ?? (FLAGS.has(key) ? 0 : null);
    const right = b[key] ?? (FLAGS.has(key) ? 0 : null);
    if (left !== right) return false;
  }
  return true;
}

/* Saves what differs between the shape and the rows, in one transaction, and
   returns how many rows were written. A row marked deleted is removed and
   keeps no values, except an undone log. A row the shape does not mention is
   left alone. An id that is not a row id refuses the whole save. */
export function commitRoutineStore(repo: Repository, input: RoutineStore, now = Date.now()): number {
  const next = normalizeRoutineStore(input);
  if (!next) throw new Error('Local data is unavailable.');
  const custom = next.prefs.customTypes ?? [];
  const every = [...next.blocks, ...next.items, ...next.placements, ...next.compounds, ...next.logs];
  if (every.some(row => !isRoutineRowId(row.id)) || custom.some(row => !customTypeRowId(row.id))) throw new Error('Local data is unavailable.');
  return repo.atomic(() => {
    let written = 0;
    const put = (table: RoutineTable, id: string, data: Data, live: boolean) => {
      const current = repo.get(table, id);
      if (!live) {
        if (current && current.deleted_at === null) { repo.remove(table, id, now); written += 1; }
        return;
      }
      if (current && current.deleted_at === null && same(current.data, data)) return;
      repo.save(table, data, id, now);
      written += 1;
    };
    for (const row of next.blocks) put('daily_blocks', row.id, encodeBlock(row), isLive(row));
    for (const row of next.items) put('daily_items', row.id, encodeItem(row), isLive(row));
    for (const row of next.placements) put('daily_placements', row.id, encodePlacement(row), isLive(row));
    for (const row of next.compounds) put('daily_compounds', row.id, encodeCompound(row), isLive(row));
    for (const row of next.logs) put('daily_logs', row.id, encodeLog(row), isLive(row) || row.undone === true);
    custom.forEach((row, position) => {
      const name = clipText(row.name, 40);
      if (name) put('daily_types', customTypeRowId(row.id), { name, position }, true);
    });
    const prefs = encodePrefs(next);
    const blank = encodePrefs({ ...next, prefs: { lastBlockId: null, updatedAt: 0 }, settings: { dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR, updatedAt: 0 } });
    if (repo.get('daily_prefs', ROUTINE_PREFS_ID) || !same(prefs, blank)) put('daily_prefs', ROUTINE_PREFS_ID, prefs, true);
    return written;
  });
}

/* Morning and Night, once, with fixed ids. A default the user deleted keeps
   its removed row, so it is not seeded again. Nothing is written when any
   routine is live. Returns how many were added. */
export function seedDefaultRoutines(repo: Repository): number {
  if (repo.list('daily_blocks').length) return 0;
  return repo.atomic(() => {
    let added = 0;
    DEFAULT_ROUTINE_BLOCKS.forEach((block, position) => {
      const id = DEFAULT_BLOCK_IDS[block.key];
      if (repo.get('daily_blocks', id)) return;
      repo.putLocal({ table: 'daily_blocks', owner_id: repo.owner, device_id: repo.device, id, updated_at: DEFAULT_BLOCK_STAMP, deleted_at: null, data: { name: block.name, color: block.color, position, hidden: 0 } });
      added += 1;
    });
    return added;
  });
}

/* The default routines the user deleted. A removed row keeps no values and
   is not in the shape, so a setup asks here before it adds Morning or Night
   and leaves a deleted one deleted. */
export function removedDefaultRoutines(repo: Repository): string[] {
  return Object.values(DEFAULT_BLOCK_IDS).filter((id) => {
    const row = repo.get('daily_blocks', id);
    return !!row && row.deleted_at !== null;
  });
}
