// Shell-only fixtures have no signed-in repository; feature behavior is covered by body-ui.
jest.mock('../src/auth/provider',()=>({useAuth:()=>({repository:null})}));
jest.mock('../src/features/workout/use-workout',()=>({useWorkout:()=>({store:null,auth:{pending:0,syncStatus:'idle'}})}));
import type { TestInstance } from 'test-renderer';
import { renderRouter, screen, fireEvent } from 'expo-router/testing-library';
import { redirectSystemPath } from '../src/app/+native-intent';
import { ThemeProvider } from '../src/design/theme-provider';
import { NavigationShell } from '../src/app/_layout';
import WebTabs from '../src/components/app-tabs.web';
import Home from '../src/app/(tabs)/index';
import Workouts from '../src/app/(tabs)/workouts';
import Food from '../src/app/(tabs)/food';
import Progress from '../src/app/(tabs)/progress';
import Insights from '../src/app/(tabs)/insights';
import SettingsLayout from '../src/app/settings/_layout';
import Settings from '../src/app/settings/index';
import Appearance from '../src/app/settings/appearance';
import Section from '../src/app/settings/[section]';
import WorkoutLayout from '../src/app/workout/_layout';
import Workout from '../src/app/workout/index';
import Start from '../src/app/workout/start';
import FoodLog from '../src/app/food/log';

// Exercise real routing with the JS fallback; native tab declarations are covered separately.
const routes = {
  'sign-in': () => null,
  _layout: () => <ThemeProvider><NavigationShell access /></ThemeProvider>,
  '(tabs)/_layout': WebTabs, '(tabs)/index': Home, '(tabs)/workouts': Workouts,
  '(tabs)/food': Food, '(tabs)/progress': Progress, '(tabs)/insights': Insights,
  'settings/_layout': SettingsLayout, 'settings/index': Settings,
  'settings/appearance': Appearance, 'settings/[section]': Section,
  'workout/_layout': WorkoutLayout, 'workout/index': Workout, 'workout/start': Start,
  'food/log': FoodLog,
};

test('Home opens the workout modal and provides a working exit', async () => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: 'Start freestyle' }));
  expect(result.getPathname()).toBe('/workout');
  await fireEvent.press(screen.getByRole('button', { name: 'Close workout' }));
  expect(result.getPathname()).toBe('/');
});
test('avatar opens Settings and Appearance in the stack', async () => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Appearance' }));
  expect(result.getPathname()).toBe('/settings/appearance');
  await fireEvent.press(screen.getByRole('tab', { name: 'Light' }));
  expect(screen.getByRole('tab', { name: 'Light' })).toBeSelected();
});
test.each([
  ['insight://food/log', '/food/log', 'Back to Home'],
  ['insight://workout/start', '/workout', 'Close workout'],
])('cold link %s resolves and has an exit', async (initialUrl, expected, exit) => {
  // renderRouter's location bypasses native getInitialURL; apply the actual native intent hook.
  const result = await renderRouter(routes, { initialUrl: redirectSystemPath({ path: initialUrl, initial: true }) });
  expect(result.getPathname()).toBe(expected);
  await fireEvent.press(screen.getByRole('button', { name: exit }));
  expect(result.getPathname()).toBe('/');
});

test.each([
  ['Workouts', '/workouts', ['Routines', 'History', 'Cardio']],
  ['Progress', '/progress', ['Body', 'Photos', 'Goals & PRs']],
  ['Insights', '/insights', ['Trends', 'Recovery', 'Weekly report']],
] as const)('%s segments stay within their tab and offer Home', async (label, path, segments) => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: label }));
  for (const segment of segments) {
    await fireEvent.press(screen.getByRole('tab', { name: segment }));
    expect(result.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: segment })).toBeSelected();
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(result.getPathname()).toBe('/');
});
test('Food without a repository opens logging and returns Home', async () => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: 'Food' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Log food' }));
  expect(result.getPathname()).toBe('/food/log');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(result.getPathname()).toBe('/');
});

test('About exposes a Licenses placeholder', async () => {
  const result = await renderRouter(routes, { initialUrl: '/settings/about' });
  await fireEvent.press(screen.getByRole('button', { name: 'Licenses' }));
  expect(result.getPathname()).toBe('/settings/licenses');
  expect(screen.getByText('Lexend (SIL Open Font License 1.1) and RepDB. Full notices coming soon.')).toBeTruthy();
});

test.each(['/', '/settings', '/settings/appearance'])('rendered shell at %s labels every pressable', async initialUrl => {
  const result = await renderRouter(routes, { initialUrl });
  const pressables = result.container.queryAll(node => typeof node.props.onPress === 'function' ||
    typeof node.props.onResponderRelease === 'function');
  expect(pressables.length).toBeGreaterThanOrEqual(7);
  const text = (node: TestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join(' ');
  for (const node of pressables) {
    expect(node.props.accessibilityRole).toMatch(/^(button|tab)$/);
    expect((node.props.accessibilityLabel ?? text(node)).trim().length).toBeGreaterThan(0);
  }
});
