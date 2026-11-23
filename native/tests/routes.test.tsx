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
import InsightsLink from '../src/app/insights';
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
  '(tabs)/food': Food, '(tabs)/progress': Progress, insights: InsightsLink,
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
  // Progress holds two views. Each view's sections are picked on the same screen, so the path never changes.
  ['Progress', '/progress', ['Tracking', 'Body', 'Photos', 'Goals & PRs', 'Insights', 'Trends', 'Recovery', 'Muscles', 'Weekly']],
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
test('the tab bar has four tabs and Insights is not one of them', async () => {
  await renderRouter(routes);
  for (const name of ['Home', 'Workouts', 'Food', 'Progress']) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Insights' })).toBeNull();
});
test.each([
  ['/insights', 'Trends'],
  ['/insights?section=muscles', 'Muscles'],
  // A section that is not one of the four is dropped, so the view opens on its first section.
  ['/insights?section=body', 'Trends'],
  ['/insights?section=nonsense', 'Trends'],
])('the old link %s lands on Progress with Insights chosen, on %s', async (initialUrl, section) => {
  const result = await renderRouter(routes, { initialUrl });
  expect(result.getPathname()).toBe('/progress');
  expect(screen.getByRole('tab', { name: 'Insights' })).toBeSelected();
  expect(screen.getByRole('tab', { name: section })).toBeSelected();
  expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
});
test.each([
  ['/progress?view=insights&section=weekly', 'Insights', 'Weekly'],
  ['/progress?section=muscles', 'Insights', 'Muscles'],
  ['/progress?view=tracking&section=goals', 'Tracking', 'Goals & PRs'],
  // A section from the other view, or a made-up view, is refused.
  ['/progress?view=tracking&section=weekly', 'Tracking', 'Body'],
  ['/progress?view=nonsense&section=nonsense', 'Tracking', 'Body'],
])('a link %s opens %s on %s, and a later choice by hand is kept', async (initialUrl, view, section) => {
  const result = await renderRouter(routes, { initialUrl });
  expect(screen.getByRole('tab', { name: view })).toBeSelected();
  expect(screen.getByRole('tab', { name: section })).toBeSelected();
  // The link is used once and cleared, so it cannot overwrite what the person picks next.
  expect(result.getSearchParams()).toEqual({});
  await fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'Recovery' }));
  expect(screen.getByRole('tab', { name: 'Recovery' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Progress' }));
  expect(screen.getByRole('tab', { name: 'Recovery' })).toBeSelected();
});
test('Food without a repository opens logging, says so plainly, and the normal back returns to Food', async () => {
  const result = await renderRouter(routes);
  await fireEvent.press(screen.getByRole('button', { name: 'Food' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Log food' }));
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
