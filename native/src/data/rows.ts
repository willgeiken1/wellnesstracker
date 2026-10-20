import { columns, syncedTables, type Table } from './catalog';
export { columns, syncedTables, type Table } from './catalog';
export type Scalar = string | number | null;
export interface Row {
  table: Table; owner_id: string; id: string; updated_at: number; deleted_at: number | null; device_id: string;
  data: Record<string, Scalar>;
}
export interface ServerRow { row: Row; server_seq: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function compareRows(a: Row, b: Row): number {
  return a.updated_at === b.updated_at ? (a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0) : a.updated_at < b.updated_at ? -1 : 1;
}
export function validateRow(input: unknown): asserts input is Row {
  const r = input as Row;
  const bad = () => { throw new Error('Invalid sync row.'); };
  if (!r || !syncedTables.includes(r.table) || !uuid.test(r.id) || !uuid.test(r.device_id) || typeof r.owner_id !== 'string' || !r.owner_id || !Number.isSafeInteger(r.updated_at) || r.updated_at < 0 || (r.deleted_at !== null && (!Number.isSafeInteger(r.deleted_at) || r.deleted_at < 0)) || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return bad();
  if (Object.keys(r).some(key => !['table','owner_id','id','updated_at','deleted_at','device_id','data'].includes(key))) return bad();
  const fields = columns[r.table] as Record<string,string>;
  for (const [key, value] of Object.entries(r.data)) {
    if (!Object.hasOwn(fields, key)) return bad();
    if (value === null) continue;
    if (['day','target_day','start_day','end_day','from_day','to_day'].includes(key) &&
        (typeof value !== 'string' || value.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))) return bad();
    if (fields[key] === 'text' ? typeof value !== 'string' : typeof value !== 'number' || !Number.isFinite(value) || (fields[key] === 'integer' && !Number.isSafeInteger(value))) return bad();
  }
  if (r.table === 'plans') {
    if (r.data.mode != null && !['rotation','fixed'].includes(String(r.data.mode))) return bad();
    if (r.data.days_per_week != null && (Number(r.data.days_per_week)<1 || Number(r.data.days_per_week)>7)) return bad();
  }
  if (r.table === 'machine_notes' && r.data.unit_override != null && !['kg','lb'].includes(String(r.data.unit_override))) return bad();
  if (r.table === 'pauses' && r.data.start_day != null && r.data.end_day != null && r.data.start_day > r.data.end_day) return bad();
  if (r.table === 'purges' && ((r.data.from_day != null && r.data.to_day != null && r.data.from_day > r.data.to_day) || (r.data.cutoff_ms != null && Number(r.data.cutoff_ms)<0))) return bad();
  if (r.table === 'weigh_ins' && r.data.source !== 'app') return bad();
}
export function revision(row: Row) { return `${row.updated_at}:${row.device_id}`; }
export function canonicalRow(row: Row): Row {
  validateRow(row);
  return { ...row, data: Object.fromEntries(Object.keys(columns[row.table]).map(k => [k, row.deleted_at !== null && !(row.table === 'weigh_ins' && k === 'source') ? null : row.data[k] ?? null])) };
}
/** Only allowlisted physical columns cross the transport boundary. */
export function fromWire(table: Table, wire: Record<string, unknown>): ServerRow {
  const row = { table, owner_id: wire.owner_id, id: wire.id, updated_at: Number(wire.updated_at), deleted_at: wire.deleted_at === null ? null : Number(wire.deleted_at), device_id: wire.device_id,
    data: Object.fromEntries(Object.keys(columns[table]).map(k => [k, wire[k] ?? null])) };
  validateRow(row);
  if (typeof wire.server_seq !== 'string' || !/^\d+$/.test(wire.server_seq)) throw new Error('Invalid sync cursor.');
  return { row, server_seq: wire.server_seq };
}

/** Tombstones carry identity plus immutable provenance only. Validate before stripping. */
export function pushRow(row: Row): Row {
  if (row.table === 'purges') throw new Error('purges is pull-only.');
  validateRow(row);
  return row.deleted_at === null ? row : {...row, data: row.table === 'weigh_ins' ? {source: row.data.source} : {}};
}

/** A newer server may acknowledge columns this client does not yet know. */
export function fromAcknowledgment(input: unknown): Row {
  const row=input as Row;
  if (!row || !Object.hasOwn(columns,row.table) || !row.data || typeof row.data!=='object' || Array.isArray(row.data)) throw new Error('Invalid sync acknowledgment.');
  return canonicalRow({...row,data:Object.fromEntries(Object.keys(columns[row.table]).map(key=>[key,row.data[key]??null]))});
}
