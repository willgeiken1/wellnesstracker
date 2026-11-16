import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import Svg from 'react-native-svg';
import { ThemeProvider } from '../src/design/theme-provider';
import { DEFAULT_APPEARANCE, formatAppearance, parseAppearance, PRESET_IDS, PRESETS, presetOf } from '../src/design/looks';
import { arcPath, RingArc } from '../src/components/ring-arc';
import { sweepAt, sweepDuration } from '../src/components/use-sweep';
import Appearance from '../src/features/settings/appearance';
import { CalorieRing } from '../src/features/food/ring';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

function settingsRepository(accent?: string) {
  let saved: Row[] = accent ? [{ ...syntheticRow('settings'), data: { accent } }] : [];
  const listeners = new Set<() => void>();
  return {
    list: () => saved,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save: (_table: unknown, data: Row['data']) => { saved = [{ ...syntheticRow('settings'), data }]; listeners.forEach(l => l()); return saved[0]; },
  } as unknown as Repository;
}
const savedAccent = (repository: Repository) => repository.list('settings')[0]?.data.accent;
const reduceMotion = (on: boolean) => jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
// Made-up day: 1,400 of 2,000 kcal.
const total = { energy_kj: 1400 * 4.184, protein_g: 90, carbs_g: 150, fat_g: 40 } as never;
const target = { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 220, fat_g: 70 } as never;
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('saved motion and strength', () => {
  test('older saved text reads with calm motion at medium strength', () => {
    for (const saved of ['goldenHour', 'dusk', 'seaGlassTide;ring=liquid']) expect(parseAppearance(saved)).toMatchObject({ motion: 'calm', intensity: 2 });
  });
  test('round-trips and writes only what differs from the default', () => {
    expect(formatAppearance({ ...DEFAULT_APPEARANCE, motion: 'lively', intensity: 3 })).toBe('seaGlassTide;motion=lively;strength=3');
    expect(parseAppearance('seaGlassTide;ring=glass;motion=basic;strength=1')).toEqual({ ...DEFAULT_APPEARANCE, ring: 'glass', motion: 'basic', intensity: 1 });
  });
  test('an unknown motion or strength falls back alone', () => {
    expect(parseAppearance('goldenHour;ring=liquid;motion=wild;strength=9')).toEqual({ ...DEFAULT_APPEARANCE, palette: 'goldenHour', ring: 'liquid' });
    expect(parseAppearance('goldenHour;strength=__proto__;motion=constructor')).toMatchObject({ motion: 'calm', intensity: 2 });
  });
});

describe('presets', () => {
  test('each preset is recognised from the looks it sets, and a mix of two is none of them', () => {
    for (const id of PRESET_IDS) expect(presetOf(PRESETS[id])).toBe(id);
    expect(presetOf({ ...DEFAULT_APPEARANCE, ring: 'liquid', motion: 'calm' })).toBeNull();
    expect(presetOf(DEFAULT_APPEARANCE)).toBe('calm');
  });
  test('tapping a preset saves its rings and motion and keeps the theme and strength', async () => {
    const repository = settingsRepository('goldenHour;strength=3');
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    expect(screen.getByTestId('preset-calm').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('preset-fluid'));
    expect(savedAccent(repository)).toBe('goldenHour;ring=liquid;motion=lively;strength=3');
    expect(screen.getByTestId('preset-fluid').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('ring-look-liquid').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('preset-basic'));
    expect(savedAccent(repository)).toBe('goldenHour;motion=basic;strength=3');
  });
  test('changing one part by hand shows it as your own mix, with no preset marked', async () => {
    const repository = settingsRepository('seaGlassTide;ring=liquid;motion=lively');
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    expect(screen.queryByText('Your own mix. Pick a style to go back to a starting point.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Calm'));
    expect(savedAccent(repository)).toBe('seaGlassTide;ring=liquid');
    expect(screen.getByText('Your own mix. Pick a style to go back to a starting point.')).toBeTruthy();
    for (const id of PRESET_IDS) expect(screen.getByTestId(`preset-${id}`).props.accessibilityState.selected).toBe(false);
  });
  test('strength saves on its own', async () => {
    const repository = settingsRepository();
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByLabelText('Full'));
    expect(savedAccent(repository)).toBe('seaGlassTide;strength=3');
    expect(screen.getByLabelText('Full').props.accessibilityState.selected).toBe(true);
  });
});

describe('the sweep', () => {
  test('with motion off the ring is at its value at every moment', () => {
    for (const k of [0, 0.3, 1]) expect(sweepAt(0, 0.7, k, 'basic', 2)).toBe(0.7);
    expect(sweepDuration('basic', 3)).toBe(0);
  });
  test('calm rises steadily and stops on the value', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(k => sweepAt(0.2, 0.8, k, 'calm', 2));
    expect(steps[0]).toBeCloseTo(0.2);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps.at(-1)).toBe(0.8);
    expect(Math.max(...steps)).toBe(0.8);
  });
  test('lively runs a little past the value, further at full strength, then settles on it', () => {
    const peak = (strength: 1 | 2 | 3) => Math.max(...Array.from({ length: 101 }, (_, i) => sweepAt(0, 0.5, i / 100, 'lively', strength)));
    expect(peak(1)).toBeGreaterThan(0.5);
    expect(peak(3)).toBeGreaterThan(peak(1));
    expect(peak(3)).toBeLessThan(0.6);
    expect(sweepAt(0, 0.5, 1, 'lively', 3)).toBe(0.5);
    expect(sweepAt(0, 0.5, 0, 'lively', 3)).toBeCloseTo(0);
  });
  test('a ring that appears with motion on starts empty and ends on its value', async () => {
    jest.useFakeTimers();
    const ring = (progress: number) => <Svg><RingArc look="contour" cx={50} cy={50} r={40} width={12} progress={progress} color="#112233" track="#000000" ink="#FFFFFF" dark motion="calm" /></Svg>;
    const paths = () => JSON.stringify(screen.toJSON());
    const view = await render(ring(0.5));
    expect(paths()).not.toContain(arcPath(50, 50, 40, 0.5));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(paths()).toContain(arcPath(50, 50, 40, 0.5));
    await view.rerender(ring(0.9));
    expect(paths()).not.toContain(arcPath(50, 50, 40, 0.9));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(paths()).toContain(arcPath(50, 50, 40, 0.9));
  });
});

describe('Reduce Motion', () => {
  const food = (accent: string) => <ThemeProvider repository={settingsRepository(accent)}><CalorieRing total={total} target={target} /></ThemeProvider>;
  test('with it on, a lively liquid ring is drawn still and at its value, and Appearance says why', async () => {
    reduceMotion(true);
    await render(<ThemeProvider repository={settingsRepository('seaGlassTide;ring=liquid;motion=lively')}><Appearance /><CalorieRing total={total} target={target} /></ThemeProvider>);
    expect(screen.getByTestId('motion-reduced')).toBeTruthy();
    expect(screen.queryAllByTestId('ring-drop-pulsing')).toHaveLength(0);
    expect(JSON.stringify(screen.toJSON())).toContain(arcPath(100, 100, 88, 0.7));
    // The saved choice is kept, so it comes back when Reduce Motion is turned off.
    expect(screen.getByLabelText('Lively').props.accessibilityState.selected).toBe(true);
  });
  test('with it off, the same ring has a breathing drop and no notice', async () => {
    reduceMotion(false);
    await render(<ThemeProvider repository={settingsRepository('seaGlassTide;ring=liquid;motion=lively')}><Appearance /></ThemeProvider>);
    expect(screen.queryByTestId('motion-reduced')).toBeNull();
    const view = await render(food('seaGlassTide;ring=liquid;motion=lively'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    expect(screen.queryAllByTestId('ring-drop-pulsing').length).toBeGreaterThan(0);
    view.unmount();
  });
  test('calm motion never adds the breathing drop', async () => {
    reduceMotion(false);
    await render(food('seaGlassTide;ring=liquid'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(screen.queryAllByTestId('ring-drop-pulsing')).toHaveLength(0);
    expect(screen.queryAllByTestId('ring-drop').length).toBeGreaterThan(0);
  });
});

describe('tab bar and keypad looks', () => {
  test('both save on their own and read back, and older saved text gets the standard bar and plain keys', async () => {
    expect(parseAppearance('goldenHour;ring=liquid')).toMatchObject({ bar: 'standard', keypad: 'plain' });
    expect(parseAppearance('goldenHour;bar=mirror;keypad=chrome')).toMatchObject({ bar: 'standard', keypad: 'plain' });
    const repository = settingsRepository();
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getAllByLabelText('Glass').find(node => node.props.accessibilityRole === 'tab')!);
    expect(savedAccent(repository)).toBe('seaGlassTide;bar=glass');
    expect(parseAppearance(savedAccent(repository))).toMatchObject({ bar: 'glass', keypad: 'plain' });    // Floating is the third choice: the open tab stands apart in the accent colour.
    await fireEvent.press(screen.getByRole('tab', { name: 'Floating' }));
    expect(savedAccent(repository)).toBe('seaGlassTide;bar=floating');
    expect(parseAppearance('goldenHour;bar=floating').bar).toBe('floating');
  });
  test('the Glass preset turns on glass rings, bar and keys together, and Calm turns them all back', async () => {
    const repository = settingsRepository('berryMeadow');
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByTestId('preset-glass'));
    expect(savedAccent(repository)).toBe('berryMeadow;ring=glass;motion=lively;bar=glass;keypad=glass');
    await fireEvent.press(screen.getByTestId('preset-calm'));
    expect(savedAccent(repository)).toBe('berryMeadow');
  });
  test('choice buttons save on their own as Pills, keep the preset, and older saved text stays Standard', async () => {
    expect(parseAppearance('goldenHour;bar=floating').selector).toBe('standard');
    expect(parseAppearance('goldenHour;selector=chips').selector).toBe('standard');
    const repository = settingsRepository('berryMeadow');
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('tab', { name: 'Pills' }));
    expect(savedAccent(repository)).toBe('berryMeadow;selector=pills');
    expect(parseAppearance(savedAccent(repository)).selector).toBe('pills');
    // Appearance itself now shows its choices as pills.
    expect(screen.getAllByTestId('selector-pills').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('preset-glass'));
    expect(savedAccent(repository)).toBe('berryMeadow;ring=glass;motion=lively;bar=glass;keypad=glass;selector=pills');
  });
  test('a glass ring with a standard bar is your own mix', () => {
    expect(presetOf({ ...PRESETS.glass, bar: 'standard' })).toBeNull();
  });
});
