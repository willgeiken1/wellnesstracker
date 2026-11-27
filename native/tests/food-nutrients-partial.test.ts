import { nutrients, nuNote } from '../src/features/food/tiles/tiles';
import type { DayView } from '../src/features/food/day';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

/** Made-up foods only: what each lists of sugar and sodium. */
const day = (items: { sugar: number | null; sodium: number | null }[]) =>
  ({ items, fib: null, goals: { fib: 28 } } as unknown as DayView);
const sodium = (v: DayView) => nutrients(v).limit[2];

test('a day where one food lists no sodium never says the day is under the sodium limit', () => {
  // A food with no sodium listed beside a calorie-only quick add: the 0 is only what the first food lists.
  const x = sodium(day([{ sugar: null, sodium: 0 }, { sugar: null, sodium: null }]));
  expect(x).toMatchObject({ v: 0, partial: true });
  expect(nuNote(x)).toBe('Some foods don’t list it, so the total may be higher');
});

test('a partial total already over the limit still says so, and a full one says how far under it is', () => {
  expect(nuNote(sodium(day([{ sugar: null, sodium: 2500 }, { sugar: null, sodium: null }])))).toBe('200 mg over the limit');
  expect(nuNote(sodium(day([{ sugar: 10, sodium: 300 }, { sugar: 5, sodium: 200 }])))).toBe('1,800 mg under the limit');
  expect(nuNote(nutrients(day([{ sugar: 10, sodium: 300 }, { sugar: 5, sodium: 200 }])).limit[0])).toBe('35 g under the limit');
});
