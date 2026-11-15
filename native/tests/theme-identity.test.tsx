import { act, render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';

type Theme = ReturnType<typeof useTheme>;
/** Records the theme every time it draws, so a test can tell whether a write woke the theme's users. */
function probe() {
  const seen: Theme[] = [];
  function Probe() { seen.push(useTheme()); return null; }
  return { seen, Probe };
}
const sampleFood = { day: '2026-01-05', meal_id: 'm1', name: 'Sample oats', energy_kj: 418.4, protein_g: 5 };

test('a write that leaves the theme alone keeps the same theme value and draws no theme user again', async () => {
  const repo = memoryRepository(), { seen, Probe } = probe();
  repo.save('settings', { theme_override: 'dark', accent: 'goldenHour', rest_seconds: 90 });
  await render(<ThemeProvider repository={repo}><Probe /></ThemeProvider>);
  const first = seen.at(-1)!, draws = seen.length;
  expect(first.mode).toBe('dark');
  expect(first.palette).toBe('goldenHour');
  await act(async () => {
    repo.save('food_entries', sampleFood);
    repo.localSave('somethingElse', 1);
    // Rewriting the settings row with the same theme (another setting changed) is not a theme change either.
    repo.save('settings', { ...repo.list('settings')[0].data, rest_seconds: 120 }, repo.list('settings')[0].id);
  });
  expect(seen.length).toBe(draws);
  expect(seen.at(-1)).toBe(first);
});

test('the theme value changes when the saved theme changes, and stays put after the pick settles', async () => {
  const repo = memoryRepository(), { seen, Probe } = probe();
  repo.save('settings', { theme_override: 'dark', accent: 'goldenHour' });
  await render(<ThemeProvider repository={repo}><Probe /></ThemeProvider>);
  const first = seen.at(-1)!;
  await act(async () => { repo.save('settings', { theme_override: 'light', accent: 'goldenHour' }, repo.list('settings')[0].id); });
  const light = seen.at(-1)!;
  expect(light).not.toBe(first);
  expect(light.mode).toBe('light');
  expect(light.colors).not.toEqual(first.colors);
  // A pick made through the theme saves it and gives a new value once.
  await act(async () => { light.setPalette('berryMeadow'); });
  const picked = seen.at(-1)!;
  expect(picked).not.toBe(light);
  expect(picked.palette).toBe('berryMeadow');
  expect(repo.list('settings')[0].data).toMatchObject({ theme_override: 'light', accent: 'berryMeadow' });
  await act(async () => { repo.save('food_entries', sampleFood); });
  expect(seen.at(-1)!.palette).toBe('berryMeadow');
  const settled = seen.at(-1)!, draws = seen.length;
  await act(async () => { repo.save('food_entries', sampleFood); });
  expect(seen.length).toBe(draws);
  expect(seen.at(-1)).toBe(settled);
});

test('without a repository a pick is kept in memory, as before', async () => {
  const { seen, Probe } = probe();
  await render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(seen.at(-1)!.override).toBe('system');
  await act(async () => { seen.at(-1)!.setOverride('light'); });
  expect(seen.at(-1)!.override).toBe('light');
  expect(seen.at(-1)!.mode).toBe('light');
});

test('a failed save says so until the next change to the data, and keeps the theme it had', async () => {
  const repo = memoryRepository(), { seen, Probe } = probe();
  repo.save('settings', { theme_override: 'dark', accent: 'goldenHour' });
  const save = repo.save.bind(repo);
  await render(<ThemeProvider repository={repo}><Probe /></ThemeProvider>);
  const spy = jest.spyOn(repo, 'save').mockImplementation(() => { throw new Error('disk full'); });
  await act(async () => { seen.at(-1)!.setOverride('light'); });
  expect(seen.at(-1)!.persistenceError).toBe(true);
  expect(seen.at(-1)!.mode).toBe('dark');
  spy.mockRestore();
  await act(async () => { save('food_entries', sampleFood); });
  expect(seen.at(-1)!.persistenceError).toBe(false);
});
