import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useKit } from '../src/components/kit';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { tintedColors } from '../src/features/tiles/look';
import { tilePage } from '../src/features/tiles/registry';
import { TileFrame } from '../src/features/tiles/tile-frame';
import type { TileDef } from '../src/features/tiles/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// A body that reads its colours from the theme, as Progress's charts and gauges do.
function Reads() { const k = useKit(); return <Text testID="reads">{k.tok('recovery')}</Text>; }
function Probe({ tint }: { tint?: string }) {
  const { colors, mode } = useTheme(), cfg = tilePage('progress');
  const real = cfg.tiles.find(d => d.id === 'weight')!;
  const def = { ...real, styles: undefined, render: () => <Reads /> } as unknown as TileDef;
  return <>
    <Text testID="water">{colors.water}</Text>
    <TileFrame cfg={cfg} def={def} entry={{ size: 'M', style: 'A', options: tint ? { tint } : {} }} colors={colors} mode={mode} reduceMotion />
  </>;
}

describe('a tile with a colour of its own', () => {
  it('draws bodies that read the theme in that colour', async () => {
    await render(<ThemeProvider><Probe tint="water" /></ThemeProvider>);
    expect(screen.getByTestId('reads').props.children).toBe(screen.getByTestId('water').props.children);
  });
  it('leaves the theme as it is without one', async () => {
    await render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('reads').props.children).not.toBe(screen.getByTestId('water').props.children);
  });
  it('gives the Goal tile\'s gauge the same colour whichever goal it shows', () => {
    const cfg = tilePage('progress'), def = cfg.tiles.find(d => d.id === 'goal')!;
    const base = { recovery: '#111111', training: '#222222', sleep: '#333333', water: '#444444' } as unknown as Parameters<typeof tintedColors>[2];
    const out = tintedColors(cfg, def, base, 'water');
    expect([out.recovery, out.training, out.sleep]).toEqual(['#444444', '#444444', '#444444']);
  });
});
