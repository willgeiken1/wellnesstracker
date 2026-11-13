// Shell-only fixtures have no signed-in repository; feature behavior is covered by body-ui.
jest.mock('../src/auth/provider',()=>({useAuth:()=>({repository:null})}));
jest.mock('../src/features/workout/use-workout',()=>({useWorkout:()=>({store:null,auth:{pending:0,syncStatus:'idle'}})}));
import type { TestInstance } from 'test-renderer';
import { renderRouter, screen, fireEvent, act } from 'expo-router/testing-library';
import { router } from 'expo-router';
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
import MusclePage from '../src/app/muscle/[key]';

// Exercise real routing with the JS fallback; native tab declarations are covered separately.
const routes = {
  'sign-in': () => null,
  _layout: () => <ThemeProvider><NavigationShell access /></ThemeProvider>,
  '(tabs)/_layout': WebTabs, '(tabs)/index': Home, '(tabs)/workouts': Workouts,
  '(tabs)/food': Food, '(tabs)/progress': Progress, '(tabs)/insights': Insights,
  'settings/_layout': SettingsLayout, 'settings/index': Settings,
  'settings/appearance': Appearance, 'settings/[section]': Section,
  'workout/_layout': WorkoutLayout, 'workout/index': Workout, 'workout/start': Start,
  'food/log': FoodLog, 'muscle/[key]': MusclePage,
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
  // A cold food link has nothing to go back to, so its header offers Close, which lands on the Food tab.
  ['insight://food/log', '/food/log', 'Close', '/food'],
  ['insight://workout/start', '/workout', 'Close workout', '/'],
])('cold link %s resolves and has an exit', async (initialUrl, expected, exit, landing) => {
  // renderRouter's location bypasses native getInitialURL; apply the actual native intent hook.
  const result = await renderRouter(routes, { initialUrl: redirectSystemPath({ path: initialUrl, initial: true }) });
  expect(result.getPathname()).toBe(expected);
  await fireEvent.press(screen.getByRole('button', { name: exit }));
  expect(result.getPathname()).toBe(landing);
});

test.each([
  ['Workouts', '/workouts', ['Routines', 'History', 'Cardio']],
  // Goals & PRs is a real screen now; Photos is the one still waiting, so it is the one that says so.
  ['Progress', '/progress', ['Body', 'Goals & PRs', 'Photos']],
  // Trends, Muscles and Weekly are real screens now; Recovery is the one still waiting, so it is the one that says so.
  ['Insights', '/insights', ['Trends', 'Muscles', 'Weekly', 'Recovery']],
] as const)('%s segments stay within their tab, with no Back to Home button: the tab bar goes Home', async (label, path, segments) => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: label }));
  for (const segment of segments) {
    await fireEvent.press(screen.getByRole('tab', { name: segment }));
    expect(result.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: segment })).toBeSelected();
  }
  expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
  expect(result.getPathname()).toBe('/');
});
test('Food without a repository waits quietly; the log page says so plainly, and the normal back returns to Food', async () => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: 'Food' }));
  // Nothing to log into yet: a quiet loading panel, never an empty state with a "coming soon" badge.
  expect(await screen.findByTestId('food-loading', {}, { timeout: 2000 })).toBeTruthy();
  expect(screen.queryByText(/coming soon/i)).toBeNull();
  await act(() => router.push('/food/log'));
  expect(result.getPathname()).toBe('/food/log');
  expect(screen.getByText('Food log unavailable')).toBeTruthy();
  // Pushed from the Food tab, the screen relies on the header back: no Close and no "Back to Home" button.
  expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  await act(() => router.back());
  expect(result.getPathname()).toBe('/food');
});

test('the food log page repeats no title: the stack header carries the only one', async () => {
  await renderRouter(routes, { initialUrl: '/food/log' });
  // The native header title is not part of the rendered tree, so any title text found here would be a second one.
  expect(screen.queryByText('Log food')).toBeNull();
  expect(screen.queryByText('Food log')).toBeNull();
});

test('About opens Licenses, which lists the font, the credits and the packages with no "coming soon"', async () => {
  const result = await renderRouter(routes, { initialUrl: '/settings/about' });
  await fireEvent.press(screen.getByRole('button', { name: 'Licenses' }));
  expect(result.getPathname()).toBe('/settings/licenses');
  expect(screen.getByRole('button', { name: 'Lexend' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Exercise data by RepDB' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'react-native' })).toBeTruthy();
  expect(screen.queryByText(/coming soon/i)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Lexend' }));
  expect(screen.getByText(/SIL OPEN FONT LICENSE Version 1\.1/)).toBeTruthy();
  expect(screen.getAllByText(/Reserved Font Name/).length).toBeGreaterThan(0);
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

test('Licenses credits the ColorBrewer Blues palette, with the Apache licence in full',async()=>{
 await renderRouter(routes,{initialUrl:'/settings/licenses'});
 await fireEvent.press(screen.getByRole('button',{name:'Body map colours'}));
 expect(screen.getByText(/ColorBrewer Blues.*Cynthia Brewer.*Penn State.*Apache-2.0/)).toBeTruthy();
 expect(screen.getByText(/Apache License Version 2\.0, January 2004/)).toBeTruthy();
});
test('unknown muscle route offers a friendly not-found message',async()=>{
 await renderRouter(routes,{initialUrl:'/muscle/unknown'});
 expect(screen.getByText('Muscle not found. Choose a muscle from the map or list.')).toBeTruthy();
 expect(screen.queryByText('More muscle details are coming in a later version.')).toBeNull();
});
