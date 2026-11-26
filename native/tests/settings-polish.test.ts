import { segmentWidths } from '@/components/segmented-control';
import { ROW_DENSITY, readRowDensity } from '@/components/row-density';
import { saveWorkoutRest, workoutRest } from '@/features/settings/workout-data';
import type { Repository } from '@/data/repository';

describe('segmented control widths', () => {
  it('shares the track equally when every label fits', () => {
    expect(segmentWidths([20, 30, 25], 300, 10)).toEqual([100, 100, 100]);
  });
  it('gives a long label the room it needs and shares the rest', () => {
    const w = segmentWidths([20, 110, 20], 300, 10)!;
    expect(w).toEqual([85, 130, 85]);
    expect(w.reduce((a, b) => a + b, 0)).toBe(300);
  });
  it('waits until the track and every label are measured', () => {
    expect(segmentWidths([20, undefined], 300, 10)).toBeNull();
    expect(segmentWidths([20, 30], 0, 10)).toBeNull();
  });
});

describe('list density', () => {
  const source = (density?: unknown) => ({ localGet: <T,>() => (density === undefined ? undefined : { look: { density } }) as T });
  it('reads the Settings choice and falls back to balanced', () => {
    expect(readRowDensity(source('airy'))).toBe('airy');
    expect(readRowDensity(source('dense'))).toBe('dense');
    expect(readRowDensity(source('huge'))).toBe('balanced');
    expect(readRowDensity(source())).toBe('balanced');
    expect(readRowDensity(null)).toBe('balanced');
    expect(readRowDensity({ localGet: () => { throw new Error('closed'); } })).toBe('balanced');
  });
  it('keeps the design row heights', () => {
    expect([ROW_DENSITY.airy.minHeight, ROW_DENSITY.balanced.minHeight, ROW_DENSITY.dense.minHeight]).toEqual([62, 56, 46]);
  });
});

describe('default rest shared with workouts', () => {
  type Row = { id: string; data: Record<string, unknown>; updated_at: number; created_at: number };
  function repo(rows: Row[]) {
    const saved: { data: Record<string, unknown>; id?: string }[] = [];
    const r = { list: () => rows.slice(), save: (_t: string, data: Record<string, unknown>, id?: string) => { saved.push({ data, id }); } };
    return { r: r as unknown as Repository, saved };
  }
  it('reads the saved rest, or the fallback when none is saved or it is out of range', () => {
    expect(workoutRest(repo([{ id: 'a', data: { rest_seconds: 150 }, updated_at: 1, created_at: 1 }]).r, 120)).toBe(150);
    expect(workoutRest(repo([]).r, 120)).toBe(120);
    expect(workoutRest(repo([{ id: 'a', data: { rest_seconds: 5 }, updated_at: 1, created_at: 1 }]).r, 120)).toBe(120);
    expect(workoutRest(null, 90)).toBe(90);
  });
  it('saves the rest on the same row and keeps its other settings', () => {
    const { r, saved } = repo([{ id: 'a', data: { rest_seconds: 150, unit: 'lb' }, updated_at: 1, created_at: 1 }]);
    saveWorkoutRest(r, 90);
    expect(saved).toEqual([{ data: { rest_seconds: 90, unit: 'lb' }, id: 'a' }]);
  });
});
