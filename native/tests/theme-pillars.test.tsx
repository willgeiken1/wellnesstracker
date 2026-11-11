import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { UpNext } from '../src/features/workout/up-next';
import { ConnectedServices } from '../src/features/connections/screen';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const themed = (accent: string) => ({
  list: () => [{ ...syntheticRow('settings'), data: { theme_override: 'dark', accent } } as Row],
  subscribe: () => () => {}, save: jest.fn(),
}) as unknown as Repository;
const drawn = () => JSON.stringify(screen.toJSON());

test('no screen reads the fixed pillar colours any more; they come from the theme', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : /\.tsx?$/.test(name) ? [file] : [];
  });
  const offenders = walk(path.join(__dirname, '..', 'src')).filter(file => /tokens\.color\.pillar/.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});

test.each(['seaGlassTide', 'goldenHour', 'berryMeadow'] as const)('connected services uses %s pillar colours', async palette => {
  const theme = createTheme('dark', palette);
  await render(<ThemeProvider repository={themed(palette)}><ConnectedServices /></ThemeProvider>);
  const all = drawn();
  expect([theme.training, theme.food, theme.sleep].some(color => all.includes(color))).toBe(true);
  if (palette !== 'seaGlassTide') {
    const base = createTheme('dark', 'seaGlassTide');
    for (const pillar of ['training', 'food', 'sleep'] as const) if (base[pillar] !== theme[pillar]) expect(all).not.toContain(base[pillar]);
  }
});

test('the Up next card takes its training colour from the theme', async () => {
  const theme = createTheme('dark', 'goldenHour'), base = createTheme('dark', 'seaGlassTide');
  expect(theme.training).not.toBe(base.training);
  await render(<ThemeProvider repository={themed('goldenHour')}><UpNext name="Bench Press" detail="3 sets" onPress={() => {}} onSwap={() => {}} /></ThemeProvider>);
  // The gradient reaches the native layer as [offset, colour, offset, colour] with opacity folded into each colour.
  const stops: number[] = JSON.parse(/"gradient":(\[[^\]]*\])/.exec(drawn())![1]);
  const rgb = (hex: string) => parseInt(hex.slice(1), 16);
  expect([stops[1], stops[3]].map(colour => colour & 0xffffff)).toEqual([rgb(theme.training), rgb(theme.training)]);
});
