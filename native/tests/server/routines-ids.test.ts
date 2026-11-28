import { DEFAULT_BLOCK_IDS, isRoutineRowId, ROUTINE_PREFS_ID, routineLogId, routinePlacementId, routineUuid } from '../../src/features/routines/model/ids';

/* Row ids for daily routines. Synthetic parts only. */

test('ids are row ids, the same parts give the same id, and nothing about the parts can be read back', () => {
  expect(isRoutineRowId(routineLogId('item-a', '2026-11-19'))).toBe(true);
  expect(routineLogId('item-a', '2026-11-19')).toBe(routineLogId('item-a', '2026-11-19'));
  expect(routineLogId('item-a', '2026-11-19')).not.toBe(routineLogId('item-a', '2026-11-20'));
  expect(routineLogId(null, '2026-11-19')).not.toBe(routineLogId('item-a', '2026-11-19'));
  expect(routineUuid('a', 'bc')).not.toBe(routineUuid('ab', 'c'));
  expect(routinePlacementId('b', 'i')).not.toBe(routinePlacementId('i', 'b'));
  expect(routineLogId('Zzyq Example Compound', '2026-11-19')).not.toMatch(/Zzyq|2026/);
  // sha256("insight-daily-routines\0prefs") shaped as a v4 id: stable across phones and builds.
  expect(ROUTINE_PREFS_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(DEFAULT_BLOCK_IDS.morning).not.toBe(DEFAULT_BLOCK_IDS.night);
});

