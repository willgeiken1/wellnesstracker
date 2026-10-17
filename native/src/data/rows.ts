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
    if (fields[key] === 'text' ? typeof value !== 'string' : typeof value !== 'number' || !Number.isFinite(value) || (fields[key] === 'integer' && !Number.isSafeInteger(value))) return bad();
  }
  if (r.table === 'weigh_ins' && r.data.source !== 'app') return bad();
}
export function revision(row: Row) { return `${row.updated_at}:${row.device_id}`; }
export function canonicalRow(row: Row): Row {
  validateRow(row);
  return { ...row, data: Object.fromEntries(Object.keys(columns[row.table]).map(k => [k, row.data[k] ?? null])) };
}
/** Only allowlisted physical columns cross the transport boundary. */
export function fromWire(table: Table, wire: Record<string, unknown>): ServerRow {
  const row = { table, owner_id: wire.owner_id, id: wire.id, updated_at: Number(wire.updated_at), deleted_at: wire.deleted_at === null ? null : Number(wire.deleted_at), device_id: wire.device_id,
    data: Object.fromEntries(Object.keys(columns[table]).map(k => [k, wire[k] ?? null])) };
  validateRow(row);
  if (typeof wire.server_seq !== 'string' || !/^\d+$/.test(wire.server_seq)) throw new Error('Invalid sync cursor.');
  return { row, server_seq: wire.server_seq };
}
