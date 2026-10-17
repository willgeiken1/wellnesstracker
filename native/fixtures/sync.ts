import type { Row, Table } from '../src/data/rows';
export const OWNER_A = '10000000-0000-4000-8000-000000000001';
export const OWNER_B = '10000000-0000-4000-8000-000000000002';
export const DEVICE_A = '20000000-0000-4000-8000-000000000001';
export function syntheticRow(table: Table = 'sessions'): Row {
  return { table, owner_id: OWNER_A, id: '30000000-0000-4000-8000-000000000001', updated_at: 100, deleted_at: null, device_id: DEVICE_A,
    data: table === 'weigh_ins' ? { day: '2026-01-01', weight_kg: 80, entered_value: 80, entered_unit: 'kg', source: 'app' } : {} };
}
