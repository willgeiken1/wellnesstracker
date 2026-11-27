import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { AuroraHero, loadAuroraCanvas } from '../src/features/home/hero/aurora';
import { heroView, type HeroInput } from '../src/features/home/hero/model';
import { PlainHero } from '../src/features/home/hero/plain';
import { skyTokens } from '../src/features/home/hero/tones';
import { HeroWeek } from '../src/features/home/hero/week';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const NOW = new Date(2026, 10, 22, 14, 0);
const full = { trainMin: 45, kcal: 2000, sleepMin: 450 };
const input = (today: HeroInput['days'][number]): HeroInput =>
  ({ now: NOW, days: [...Array.from({ length: 6 }, () => full), today], goals: { kcal: 2200, trainMin: 60, sleepMin: 480 }, energy: 'kcal', hide: false });
const colors = createTheme('dark') as unknown as Record<string, string>;
const sky = skyTokens(colors, 'dark');

function Aurora({ view, focus = -1, onFocus = () => {} }: { view: ReturnType<typeof heroView>; focus?: number; onFocus?: (pi: number) => void }) {
  return <ThemeProvider><AuroraHero view={view} width={393} colors={colors} mode="dark" sky={sky} reduceMotion calm={false} paused={false} animate={false}
    levels={9} glow={1} labels focus={focus} onFocus={onFocus} onTouch={() => {}} onFail={() => {}} /></ThemeProvider>;
}

test('without Skia (a check off the phone) the canvas simply stays out', () => {
  expect(loadAuroraCanvas()).toBeNull();
});

test('the apex shows the day score, and each arc is a button that says its real value', async () => {
  const onFocus = jest.fn();
  await render(<Aurora view={heroView(input({ trainMin: 24, kcal: 1364, sleepMin: 413 }))} onFocus={onFocus} />);
  expect(screen.getByText('63')).toBeTruthy();
  expect(screen.getByText('Today')).toBeTruthy();
  const food = screen.getByTestId('home-hero-arc-food');
  expect(food.props.accessibilityLabel).toBe('Food, 1,364 of 2,200 kcal, 62%. Show details.');
  expect(screen.getByTestId('home-hero-arc-sleep').props.accessibilityLabel).toBe('Sleep, 6h 53m of 8h sleep, 86%. Show details.');
  await fireEvent.press(food);
  expect(onFocus).toHaveBeenCalledWith(1);
});

test('a focused arc turns the apex into that pillar\'s full readout', async () => {
  await render(<Aurora view={heroView(input({ trainMin: 24, kcal: 1364, sleepMin: 413 }))} focus={1} />);
  expect(screen.getByText('836 kcal left · 62%')).toBeTruthy();
  expect(screen.getByText('2,200 kcal')).toBeTruthy();
});

test('an empty day is a clear sky with no score drawn as 0', async () => {
  await render(<Aurora view={heroView(input({ trainMin: 0, kcal: null, sleepMin: null }))} />);
  expect(screen.getByText('A clear sky')).toBeTruthy();
  expect(screen.getByText('Nothing logged yet')).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
});

test('numbers only: the score and each pillar\'s value and goal', async () => {
  await render(<ThemeProvider><PlainHero view={heroView(input({ trainMin: 0, kcal: 2200, sleepMin: 480 }))} colors={colors} reduceMotion /></ThemeProvider>);
  expect(screen.getByText('100')).toBeTruthy();
  expect(screen.getByText('Rest day')).toBeTruthy();
  expect(screen.getByText('of 2,200 kcal')).toBeTruthy();
});

test('the week: seven days to tap, today marked, each saying its numbers', async () => {
  const onSelect = jest.fn(), view = heroView(input({ trainMin: 24, kcal: 1364, sleepMin: 413 }));
  await render(<ThemeProvider><HeroWeek width={393} week={view.week} sel={6} colors={colors} sky={sky} dark glow={1} reduceMotion build={false} onSelect={onSelect} /></ThemeProvider>);
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Mon')).toBeTruthy();
  const tue = screen.getByTestId('home-hero-day-1');
  expect(tue.props.accessibilityLabel).toBe('Tuesday. Training 75%, Food 91%, Sleep 94%.');
  await fireEvent.press(tue);
  expect(onSelect).toHaveBeenCalledWith(1);
  await fireEvent.press(screen.getByTestId('home-hero-day-6'));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
