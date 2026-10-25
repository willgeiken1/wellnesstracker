import { columns, syncedTables, type Table } from '../catalog';
import type { Row } from '../rows';

/** Immutable per repository/transport lifetime; no remote config or app-config changes. */
export interface SyncFlags { readonly syncedV1Columns: boolean }
export const DEFAULT_SYNC_FLAGS: Readonly<SyncFlags> = Object.freeze({ syncedV1Columns: false });
// Names only: types and constraints remain in the M1-03 catalog/rows validator.
const additions: Partial<Record<Table, readonly string[]>> = {
 sets:['tag'], routine_exercises:['rep_min','rep_max','superset_group'], entries:['superset_group'],
 machine_notes:['step','bar_weight','unit_override'], settings:['plate_set','rest_per_exercise','rest_style'],
 food_entries:['fiber_g','sugar_g','sodium_mg'], saved_foods:['fiber_g','sugar_g','sodium_mg'],
};
const addedTables: readonly Table[] = ['custom_exercises','plans','pauses'];
export function gatedColumns(table: Table): readonly string[] { return additions[table] ?? []; }
export function hasGatedColumns(table: Table) { return Object.hasOwn(additions,table); }
export function syncTables(flags: SyncFlags = DEFAULT_SYNC_FLAGS): Table[] {
 return syncedTables.filter(table=>flags.syncedV1Columns || !addedTables.includes(table));
}
export function syncFields(table: Table, flags: SyncFlags = DEFAULT_SYNC_FLAGS): Record<string,string> {
 if (!syncTables(flags).includes(table)) throw new Error('Sync feature disabled.');
 return Object.fromEntries(Object.entries(columns[table]).filter(([key])=>flags.syncedV1Columns || !additions[table]?.includes(key)));
}
/** Project before inbound validation so disabled/unknown columns cannot be accepted. */
export function projectSyncRow(row: Row, flags: SyncFlags = DEFAULT_SYNC_FLAGS): Row {
 if (!row?.data || typeof row.data !== 'object' || Array.isArray(row.data)) throw new Error('Invalid sync row.');
 return {...row,data:Object.fromEntries(Object.keys(syncFields(row.table,flags)).map(key=>[key,row.data[key]??null]))};
}
/** Disabled values already stored locally survive ordinary sync; tombstones wipe them. */
export function mergeSyncRow(row: Row, local: Row | undefined, flags: SyncFlags): Row {
 const projected=projectSyncRow(row,flags);
 return {...projected,data:{...Object.fromEntries(Object.keys(columns[row.table]).map(key=>[key,
  row.deleted_at !== null ? null : local?.data[key]??null])),...projected.data}};
}

/** Replay fills unauthored gated columns without changing the local row revision. */
export function hydrateSyncRow(row: Row, local: Row, fields = additions[row.table]): Row | undefined {
 if (!fields || row.deleted_at !== null || local.deleted_at !== null) return;
 return {...local,data:{...local.data,...Object.fromEntries(fields.map(key=>[key,row.data[key]??null]))}};
}
