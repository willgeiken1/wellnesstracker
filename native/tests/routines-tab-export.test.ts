import { buildCsvs } from '../src/features/progress/export';
import { emptyProgress } from '../src/features/progress/model';
import { emptyState, type RoutinesState } from '../src/features/routines/model';
import { ROUTINES_KEY } from '../src/features/routines/store';
import { memoryRepository } from './workout-repository';

const TODAY = '2026-11-20';
const lines = (s: string) => s.trim().split('\r\n');

/** Made-up routines and items only. */
function tabState(): RoutinesState {
  const s = emptyState();
  s.routines = [{ id: 'r1', name: 'Synthetic morning', from: 7, to: 9.5, color: s.routines[0]?.color ?? ('teal' as never), days: [1, 2, 3, 4, 5], remind: true, pauses: [] }];
  s.hidden = [];
  s.items = [{ id: 'n1', name: 'Synthetic stretch', amt: null, unit: '', dose: 'Tick when done', type: 'Other' as never, kind: 'tick' as never,
    routines: ['r1'], h: 7.5, days: null, created: '2026-01-01', note: null }];
  s.log = { '2026-11-19': { n1: 'd' }, '2026-11-18': { n1: 's' }, '2026-08-01': { n1: 'd' } };
  return s;
}

describe('the Routines export', () => {
  test('includes the Routines tab, its items and its dated check-offs, with the range applied to the history', () => {
    const repo = memoryRepository();
    repo.localSave(ROUTINES_KEY, tabState());
    const files = buildCsvs(repo, emptyProgress(TODAY, 'kg'), ['rout'], '30');
    expect(files.map(f => f.name)).toEqual(['routines.csv', 'routine-items.csv', 'routine-history.csv']);
    const items = lines(files[1].csv);
    expect(items[0]).toBe('routine,routine_from,routine_to,routine_days,routine_state,item,type,dose,time,item_days,on_hand,note');
    expect(items[1]).toBe('Synthetic morning,07:00,09:30,Mon Tue Wed Thu Fri,on,Synthetic stretch,Other,Tick when done,07:30,every day,,');
    expect(lines(files[2].csv)).toEqual(['date,item,routines,status,used_from_on_hand',
      '2026-11-18,Synthetic stretch,Synthetic morning,skipped,', '2026-11-19,Synthetic stretch,Synthetic morning,done,']);
    expect(lines(buildCsvs(repo, emptyProgress(TODAY, 'kg'), ['rout'], 'all')[2].csv)).toHaveLength(4);
  });

  test('writes only the workout routines when the Routines tab has nothing saved', () => {
    expect(buildCsvs(memoryRepository(), emptyProgress(TODAY, 'kg'), ['rout'], 'all').map(f => f.name)).toEqual(['routines.csv']);
  });
});
