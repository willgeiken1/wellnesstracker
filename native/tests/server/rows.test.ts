import { compareRows, validateRow, syncedTables } from '../../src/data/rows';
import { syntheticRow } from '../../fixtures/sync';
test('LWW is timestamp then ASCII device id; exact retry is equal', () => {
  const a = syntheticRow();
  expect(compareRows(a, {...a, updated_at: a.updated_at + 1})).toBeLessThan(0);
  expect(compareRows(a, {...a, device_id: 'ffffffff-ffff-4fff-afff-ffffffffffff'})).toBeLessThan(0);
  expect(compareRows(a,a)).toBe(0);
});
test('source boundaries reject non-app weigh-ins, unknown fields and local-only tables', () => {
  expect(syncedTables).not.toContain('oura_days');
  expect(() => validateRow({...syntheticRow('weigh_ins'), data: {source: 'healthkit', weight_kg: 80}})).toThrow();
  expect(() => validateRow({...syntheticRow(), data: {access_token: 'fixture'}})).toThrow();
  expect(() => validateRow({...syntheticRow(), table: 'oura_days'})).toThrow();
});
