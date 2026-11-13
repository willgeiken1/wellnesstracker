import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { Keypad } from '../src/features/workout/keypad';
import AppTabs from '../src/components/app-tabs';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

const tabsProps = (): any => (globalThis as any).__tabsProps;
jest.mock('expo-router/native-tabs', () => {
  const React = require('react');
  const { View } = require('react-native');
  const NativeTabs = (props: any) => { (globalThis as any).__tabsProps = props; return React.createElement(View, null, props.children); };
  const Trigger = ({ children }: any) => React.createElement(View, null, children);
  Trigger.Label = () => null; Trigger.Icon = () => null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
// The floating bar is covered in floating-tabs.test; here only the system bar's looks are checked.
jest.mock('expo-router', () => ({ Tabs: () => null }));
const mockLiquid = jest.fn(() => false);
jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { GlassView: (props: any) => React.createElement(View, props), isLiquidGlassAvailable: () => mockLiquid() };
});
const saved = (accent: string) => ({
  list: () => [{ ...syntheticRow('settings'), data: { theme_override: 'dark', accent } } as Row],
  subscribe: () => () => {}, save: jest.fn(),
}) as unknown as Repository;
const keypad = (accent: string) => <ThemeProvider repository={saved(accent)}>
  <Keypad label="Bench Press" field="weight" equipment="barbell" unit="lb" value="135" previous="130" onChange={() => {}} onNext={() => {}} onClose={() => {}} />
</ThemeProvider>;
const key = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const dark = createTheme('dark', 'seaGlassTide');
beforeEach(() => { (globalThis as any).__tabsProps = undefined; mockLiquid.mockReturnValue(false); });

test('plain keys are solid, with no rim and no glass layer', async () => {
  await render(keypad('seaGlassTide'));
  expect(key('keypad-key-5')).toMatchObject({ backgroundColor: dark['surface-2'], borderWidth: 0 });
  expect(screen.queryAllByTestId('keypad-glass')).toHaveLength(0);
});

test('glass keys are see-through with a light rim, and the Next key keeps the accent', async () => {
  await render(keypad('seaGlassTide;keypad=glass'));
  expect(key('keypad-key-5').backgroundColor).toBe(`${dark.text}14`);
  expect(key('keypad-key-5').borderWidth).toBeGreaterThan(0);
  expect(key('keypad-next').backgroundColor).toBe(dark.accent);
  // No liquid glass on this device, so no native glass layer is asked for.
  expect(screen.queryAllByTestId('keypad-glass')).toHaveLength(0);
  expect(screen.getByRole('button', { name: '5' })).toBeTruthy();
});

test('where iOS has liquid glass, every number key gets a glass layer and Next does not', async () => {
  mockLiquid.mockReturnValue(true);
  await render(keypad('seaGlassTide;keypad=glass'));
  expect(screen.queryAllByTestId('keypad-glass').length).toBeGreaterThanOrEqual(13);
  mockLiquid.mockReturnValue(true);
  await screen.unmount();
  await render(keypad('seaGlassTide'));
  expect(screen.queryAllByTestId('keypad-glass')).toHaveLength(0);
});

test('the standard tab bar is tinted with the theme and stays solid at the scroll edge', async () => {
  await render(<ThemeProvider repository={saved('seaGlassTide')}><AppTabs /></ThemeProvider>);
  expect(tabsProps()).toMatchObject({ backgroundColor: dark.bg, disableTransparentOnScrollEdge: true });
  expect(tabsProps().blurEffect).toBeUndefined();
});

test('the glass tab bar drops the tint and lets the screen show through', async () => {
  await render(<ThemeProvider repository={saved('seaGlassTide;bar=glass')}><AppTabs /></ThemeProvider>);
  const props = tabsProps();
  expect(props.backgroundColor).toBeUndefined();
  expect(props).toMatchObject({ blurEffect: 'systemUltraThinMaterial', disableTransparentOnScrollEdge: false, tintColor: dark.accent });
});

test('the Hold to scroll and Next keys shrink or wrap to fit, so a label is never cut off', async () => {
  await render(keypad('seaGlassTide'));
  for (const name of ['Hold to scroll', 'Next: Reps']) {
    const label = screen.getByText(name);
    expect(label.props).toMatchObject({ numberOfLines: 2, adjustsFontSizeToFit: true });
  }
  // Number keys stay on one line at full size.
  expect(screen.getByText('5').props.adjustsFontSizeToFit).toBe(false);
});
