import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Text } from 'react-native';
import * as ReactNative from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { NavigationShell } from '../src/app/_layout';
import WorkoutLayout from '../src/app/workout/_layout';
import ActiveWorkout from '../src/app/workout/index';
import Summary from '../src/app/workout/summary';
import LoggerFixtureRoute from '../src/app/dev/logger-fixture';
import { redirectSystemPath } from '../src/app/+native-intent';
import { useAuth } from '../src/auth/provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { createLoggerFixture } from '../src/features/workout/devFixture';
import { displayWeight } from '../src/core/workout/rules';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/features/workout/haptics', () => ({tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn()}));

const routes = {
  'sign-in': () => null,
  _layout: () => <ThemeProvider><NavigationShell access /></ThemeProvider>,
  '(tabs)/index': () => <Text>Home</Text>,
  'dev/logger-fixture': LoggerFixtureRoute,
  'workout/_layout': WorkoutLayout,
  'workout/index': ActiveWorkout,
  'workout/summary': Summary,
  'auth/index': () => null,
  'settings/index': () => null,
  'food/log': () => null,
  'onboarding/index': () => null,
};

test('warm fixture links logger → keypad → rest → summary → logger show only their requested presentation', async () => {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({repository: repo, ready: true, demo: true, session: null, pending: 0, syncStatus: 'idle'} as ReturnType<typeof useAuth>);
  const link = (state: string) => redirectSystemPath({path: `insight://dev/logger-fixture?state=${state}`, initial: false});
  const appearance = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
  const view = await renderRouter(routes, {initialUrl: link('logger')});
  for (const mode of ['dark', 'light'] as const) {
  appearance.mockReturnValue(mode);
  for (const [index, state] of ['logger','keypad','rest','summary','logger','logger'].entries()) {
    if (index || mode === 'light') await act(() => router.replace(link(state) as '/'));
    await waitFor(() => expect(view.getPathname()).toBe('/dev/logger-fixture'));
    await waitFor(() => expect(state === 'summary' ? screen.queryByText('Saved to History') : screen.queryByTestId('finish-button')).toBeTruthy());
    expect(!!screen.queryByTestId('keypad-sheet')).toBe(state === 'keypad');
    expect(!!screen.queryByTestId('rest-sheet')).toBe(state === 'rest');
    expect(!!screen.queryByText('Saved to History')).toBe(state === 'summary');
    expect(screen.queryByRole('button', {name: 'Expand rest timer'})).toBeNull();
    if (state === 'keypad') expect(screen.getAllByText('185 × 7').length).toBeGreaterThan(0);
    if (state === 'logger') {
      expect(screen.getByTestId('set-2-2-reps')).toHaveTextContent('8');
      expect(screen.getByTestId('set-2-3-reps')).toHaveTextContent('8');
      const store = new WorkoutStore(repo), bench = store.entries(store.active()!.id)[2];
      expect(store.drafts(bench.id)[2].reps).toBe('');
      // Deliberately dirty the presentation; the identical logger link must reset it.
      if (index === 4) await fireEvent.press(screen.getByTestId('set-2-2-weight'));
    }
    if (state === 'summary') {
      expect(screen.getByText('New PR')).toBeTruthy();
      expect(screen.getByText('7 tokens ›')).toBeTruthy();
      expect(screen.getByText('Workout complete')).toBeTruthy();
      expect(screen.getByText('58:12')).toBeTruthy();
      expect(screen.queryByText('AI summary')).toBeNull();
    }

  }
  }
  appearance.mockRestore();
});

test('fixture previous values win over newer unrelated demo history without modifying it', () => {
  const store = new WorkoutStore(memoryRepository()), now = Date.now();
  const prior = store.start(undefined, now - 4000000), entry = store.addExercise(prior.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, {weight:'140', reps:'5'});
  store.toggleDone(entry.id, 0, now);
  store.finish(prior.id, {startedAt: now - 4000000, finishedAt: now - 3000000, notes:''}, now);
  for (const state of ['logger', 'keypad', 'rest', 'summary', 'logger'] as const) {
    const fixture = createLoggerFixture(store, {isDev:true, demo:true, signedIn:false}, state, true, now)!;
    const previous = store.previous(store.repo.get('entries', fixture.benchId)!);
    expect(previous.map(s => `${displayWeight(Number(s.data.weight_kg),'lb')} × ${s.data.reps}`)).toEqual(['185 × 8','185 × 8','185 × 7','185 × 6']);
  }
  expect(store.sets(entry.id)[0].data.reps).toBe(5);
});


test('opening a fixture while the normal logger keypad is open removes its native presenter', async () => {
 const repo=memoryRepository(), store=new WorkoutStore(repo);
 createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},'logger');
 jest.mocked(useAuth).mockReturnValue({repository:repo,ready:true,demo:true,session:null,pending:0,syncStatus:'idle'} as ReturnType<typeof useAuth>);
 await renderRouter(routes,{initialUrl:'/workout'});
 await fireEvent.press(screen.getByTestId('set-2-2-weight'));
 expect(screen.getByTestId('keypad-sheet')).toBeTruthy();
 const path=redirectSystemPath({path:'insight://dev/logger-fixture?state=summary',initial:false});
 await act(() => router.push(path as '/'));
 await waitFor(() => expect(screen.getByText('Saved to History')).toBeTruthy());
 expect(screen.queryByTestId('keypad-sheet',{includeHiddenElements:true})).toBeNull();
 expect(screen.queryByTestId('rest-sheet',{includeHiddenElements:true})).toBeNull();
});
