import { fireEvent, render, screen } from '@testing-library/react-native';
import Svg from 'react-native-svg';
import { ThemeProvider } from '../src/design/theme-provider';
import { DEFAULT_APPEARANCE, formatAppearance, parseAppearance, RING_LOOKS } from '../src/design/looks';
import { arcPath, RingArc } from '../src/components/ring-arc';
import Appearance from '../src/features/settings/appearance';
import { CalorieRing } from '../src/features/food/ring';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

function settingsRepository(initial?: Row['data']) {
  let saved: Row[] = initial ? [{ ...syntheticRow('settings'), data: initial }] : [];
  const listeners = new Set<() => void>();
  return {
    list: () => saved,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save: (_table: unknown, data: Row['data']) => { saved = [{ ...syntheticRow('settings'), data }]; listeners.forEach(l => l()); return saved[0]; },
  } as unknown as Repository;
}
// Made-up day: 1,400 of 2,000 kcal.
const total = { energy_kj: 1400 * 4.184, protein_g: 90, carbs_g: 150, fat_g: 40 } as never;
const target = { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 220, fat_g: 70 } as never;

describe('saved appearance text', () => {
  test('a plain palette id or an old accent still reads, with the default ring', () => {
    expect(parseAppearance('goldenHour')).toEqual({ palette: 'goldenHour', ring: 'contour' });
    expect(parseAppearance('dusk')).toEqual({ palette: 'moonlightDusk', ring: 'contour' });
    for (const junk of [null, undefined, 4, '', 'nope;ring=nope']) expect(parseAppearance(junk)).toEqual(DEFAULT_APPEARANCE);
  });
  test('round-trips every look and writes only what differs from the default', () => {
    expect(formatAppearance(DEFAULT_APPEARANCE)).toBe('seaGlassTide');
    expect(formatAppearance({ palette: 'goldenHour', ring: 'liquid' })).toBe('goldenHour;ring=liquid');
    for (const ring of RING_LOOKS) expect(parseAppearance(formatAppearance({ palette: 'berryMeadow', ring }))).toEqual({ palette: 'berryMeadow', ring });
  });
  test('an unknown look falls back alone and unknown keys are ignored', () => {
    expect(parseAppearance('forestEmber;ring=swarm;bar=glass')).toEqual({ palette: 'forestEmber', ring: 'contour' });
    expect(parseAppearance('sand;ring=glass')).toEqual({ palette: 'desertMirage', ring: 'glass' });
  });
});

test('arcs start at 12 o\'clock, flip the large-arc flag past half and never close into nothing', () => {
  expect(arcPath(50, 50, 40, 0.25)).toBe('M50.00 10.00 A40 40 0 0 1 90.00 50.00');
  expect(arcPath(50, 50, 40, 0.75)).toBe('M50.00 10.00 A40 40 0 1 1 10.00 50.00');
  expect(arcPath(50, 50, 40, 1)).not.toBe(arcPath(50, 50, 40, 0));
});

test.each(RING_LOOKS)('%s draws a track with no arc at zero and an arc once there is progress', async look => {
  const ring = (progress: number) => <ThemeProvider><Svg><RingArc testID="ring" look={look} cx={50} cy={50} r={40} width={12} progress={progress}
    color="#112233" track="#EEEEEE" ink="#000000" dark={false} /></Svg></ThemeProvider>;
  const paths = () => screen.getByTestId('ring').queryAll(node => (node.type as unknown as string) === 'RNSVGPath' && node.props.strokeWidth > 2);
  const view = await render(ring(0));
  expect(paths()).toHaveLength(0);
  await view.rerender(ring(0.6));
  expect(paths().length).toBeGreaterThan(0);
});

test('picking a ring look saves beside the theme and survives a restart', async () => {
  const repo = settingsRepository({ theme_override: 'dark', accent: 'goldenHour', rest_seconds: 90 });
  let view = await render(<ThemeProvider repository={repo}><Appearance /></ThemeProvider>);
  expect(screen.getByRole('button', { name: 'Contour' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Liquid' }));
  expect(repo.list('settings')[0].data).toMatchObject({ theme_override: 'dark', accent: 'goldenHour;ring=liquid', rest_seconds: 90 });
  await view.unmount();
  view = await render(<ThemeProvider repository={repo}><Appearance /></ThemeProvider>);
  expect(screen.getByRole('button', { name: 'Liquid' })).toBeSelected();
  expect(screen.getByRole('button', { name: 'Golden Hour' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Berry Meadow' }));
  expect(repo.list('settings')[0].data.accent).toBe('berryMeadow;ring=liquid');
  await fireEvent.press(screen.getByRole('button', { name: 'Contour' }));
  expect(repo.list('settings')[0].data.accent).toBe('berryMeadow');
});

test.each(RING_LOOKS)('the food ring follows the %s look and keeps its spoken summary', async look => {
  const repo = settingsRepository({ accent: `seaGlassTide;ring=${look}` });
  await render(<ThemeProvider repository={repo}><CalorieRing total={total} target={target} /></ThemeProvider>);
  for (const key of ['energy_kj', 'protein_g', 'carbs_g', 'fat_g']) expect(screen.getByTestId(`food-ring-${key}`).props.id ?? screen.getByTestId(`food-ring-${key}`).props.name).toBe(`ring-look-${look}`);
  expect(screen.getByRole('image').props.accessibilityLabel).toContain('1400');
  expect(screen.getByText('600')).toBeTruthy();
});

test('an estimated day stays dashed in every look', async () => {
  for (const look of RING_LOOKS) {
    const view = await render(<ThemeProvider repository={settingsRepository({ accent: `seaGlassTide;ring=${look}` })}><CalorieRing total={total} target={target} estimated /></ThemeProvider>);
    const dashed = screen.getByTestId('food-ring-energy_kj').queryAll(node => (node.type as unknown as string) === 'RNSVGPath' && !!node.props.strokeDasharray);
    expect(dashed.length).toBeGreaterThan(0);
    await view.unmount();
  }
});
