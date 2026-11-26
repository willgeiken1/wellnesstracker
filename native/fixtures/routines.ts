import type { Row, Table } from '../src/data/rows';
import { ROUTINE_PREFS_ID } from '../src/features/routines/model/ids';

/* Entirely synthetic. No real compound, dose or person. The strings are odd on purpose so a leak test can
   search any payload for them. */
export const ROUTINE_SENTINELS = [
  'Zzyq Example Compound', // item name
  'Zzyq Example Peptide', // compound name
  '13.25', // dose amount
  'zq-unit', // dose unit
  'qq4419-scribble-text', // note
  'right-thigh', // injection site
  '4417', // supply on hand
  'Zzyq Evening Block', // routine name
  'Zzyq Custom Type', // custom type name
] as const;

const id = (kind: number, n: number) => `8${kind}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const FIXTURE_IDS = { block: id(1, 1), item: id(2, 1), check: id(2, 2), placement: id(3, 1), compound: id(4, 1), log: id(5, 1), skip: id(5, 2), type: id(6, 1), pause: id(7, 1), prefs: ROUTINE_PREFS_ID } as const;

export function routineFixtureRows(): { table: Table; id: string; data: Row['data'] }[] {
  return [
    { table: 'daily_blocks', id: FIXTURE_IDS.block, data: { name: 'Zzyq Evening Block', color: 'pink', position: 0, start_min: 1260, end_min: 1380, days_mask: 31, hidden: 0 } },
    { table: 'daily_items', id: FIXTURE_IDS.item, data: { name: 'Zzyq Example Compound', kind: 'dose', type: 'peptide', compound_id: FIXTURE_IDS.compound, note: 'qq4419-scribble-text', time_min: 1275, start_day: '2026-11-01', on_hand: 4417, on_hand_day: '2026-11-18', on_hand_at: 1794000000000, mixed_day: '2026-11-17', calc_vial: 5, calc_vial_unit: 'mg', calc_water: 2 } },
    { table: 'daily_items', id: FIXTURE_IDS.check, data: { name: 'Zzyq Example Check', kind: 'check' } },
    { table: 'daily_placements', id: FIXTURE_IDS.placement, data: { block_id: FIXTURE_IDS.block, item_id: FIXTURE_IDS.item, position: 0 } },
    { table: 'daily_compounds', id: FIXTURE_IDS.compound, data: { name: 'Zzyq Example Peptide', amount: 13.25, unit: 'zq-unit', start_day: '2026-11-01', chart_line: 1 } },
    { table: 'daily_logs', id: FIXTURE_IDS.log, data: { item_id: FIXTURE_IDS.item, compound_id: FIXTURE_IDS.compound, day: '2026-11-19', status: 'done', amount: 13.25, unit: 'zq-unit', note: 'qq4419-scribble-text', at: 1794100000000, site: 'right-thigh', rest: 0, undone: 0 } },
    { table: 'daily_logs', id: FIXTURE_IDS.skip, data: { item_id: FIXTURE_IDS.check, day: '2026-11-19', status: 'skipped', at: 1794100000001 } },
    { table: 'daily_types', id: FIXTURE_IDS.type, data: { name: 'Zzyq Custom Type', position: 0 } },
    { table: 'daily_pauses', id: FIXTURE_IDS.pause, data: { block_id: FIXTURE_IDS.block, from_day: '2026-11-10', until_day: '2026-11-12', why: 'qq4419-scribble-text', position: 0 } },
    { table: 'daily_prefs', id: FIXTURE_IDS.prefs, data: { last_block_id: FIXTURE_IDS.block, day_rollover_hour: 4, focus_mode: 0, setup_status: 'done', setup_answers: 'goals=enhancers;inject=yes', setup_at: 1794000000000, added: 'doses,calculator', type_tabs: 'peptide' } },
  ];
}
