import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import WorkoutLayout from '../src/app/workout/_layout';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

const seen: { options?: any } = {};
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Stack: (props: any) => { (globalThis as any).__stackOptions = props.screenOptions; return React.createElement(View, null); } };
});
const saved = (theme: 'dark' | 'light') => ({
  list: () => [{ ...syntheticRow('settings'), data: { theme_override: theme, accent: 'goldenHour' } } as Row],
  subscribe: () => () => {}, save: jest.fn(),
}) as unknown as Repository;

// The logger opens as a full-screen modal, which takes its status bar from its own screen. A dark theme chosen in
// the app while the phone is in light mode showed dark clock text on a dark page.
test.each([['dark', 'light'], ['light', 'dark']] as const)('in a %s theme the workout screens ask for %s status bar text', async (theme, style) => {
  await render(<ThemeProvider repository={saved(theme)}><WorkoutLayout /></ThemeProvider>);
  seen.options = (globalThis as any).__stackOptions;
  expect(seen.options.statusBarStyle).toBe(style);
});
