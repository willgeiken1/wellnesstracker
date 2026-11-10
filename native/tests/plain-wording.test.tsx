import { foodDayLabel, t } from '../src/i18n/en';

test('unfinished screens say so in plain words, without milestone codes', () => {
  expect(t('placeholder')).toBe('Coming soon');
  expect(t('placeholderBody')).not.toMatch(/M2|M3/);
});
test('the food day header reads as a day, not a raw date', () => {
  expect(foodDayLabel('2026-11-10', '2026-11-10')).toBe('Today');
  expect(foodDayLabel('2026-11-09', '2026-11-10')).toBe('Yesterday');
  expect(foodDayLabel('2026-11-03', '2026-11-10')).toBe('Tue, Nov 3');
  expect(foodDayLabel('2025-12-31', '2026-11-10')).toBe('Wed, Dec 31, 2025');
});
test('body map copy avoids engineering terms', () => {
  for (const key of ['atlasWindow', 'atlasHint', 'atlasLegend'] as const) expect(t(key)).not.toMatch(/inherit|attribution|schematic|projection/i);
});
test('burned calories say why they are missing', () => {
  expect(t('foodBurned')).toBe('Burned: no data from Health yet');
});
