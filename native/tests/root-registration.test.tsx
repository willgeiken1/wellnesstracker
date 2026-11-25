// Shell-only fixtures have no signed-in repository.
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: null }) }));
import { renderRouter, act } from 'expo-router/testing-library';
import { NavigationShell } from '../src/app/_layout';
import { ThemeProvider } from '../src/design/theme-provider';
import { tilePage } from '../src/features/tiles/registry';
import { isPending } from '../src/features/tiles/pending';
import { stylesOf } from '../src/features/tiles/model';
import { trainingNav, trainingRoutes } from '../src/features/workout/nav';

// Loading the app root registers every page's tiles, so Home's tray and each page draw real tiles on first open.
test.each(['home', 'training', 'food', 'progress'] as const)('the app root registers every %s tile', page => {
  const pending = tilePage(page).tiles.filter(def => stylesOf(def).some(v => {
    const r = v.render;
    return !r || isPending(r) || (typeof r === 'object' && Object.values(r).some(isPending));
  })).map(def => def.id);
  expect(pending).toEqual([]);
});

// Training's detail screens and sheets sit at the app root, outside the workout modal, so they open over the tab.
test('Training detail, exercise, plan and its sheets open at the app root', async () => {
  const page = () => null;
  const result = await renderRouter({
    _layout: () => <ThemeProvider><NavigationShell access /></ThemeProvider>,
    '(tabs)/_layout': () => null, '(tabs)/index': page, 'workout/_layout': page, 'workout/index': page,
    'training/detail': page, 'training/exercise': page, 'training/plan': page,
    'training/picker': page, 'training/rest': page, 'training/cardio': page,
  });
  expect(Object.values(trainingRoutes).filter(r => r !== '/workout' && r !== '/workout/summary').every(r => r.startsWith('/training/'))).toBe(true);
  await act(() => trainingNav.detail('w1'));
  expect(result.getPathname()).toBe('/training/detail');
  await act(() => trainingNav.rest());
  expect(result.getPathname()).toBe('/training/rest');
  const root = result.getRouterState?.();
  const names = JSON.stringify(root);
  // Both are root stack routes, not children of the workout modal.
  expect(names).toContain('"name":"training/detail"');
  expect(names).toContain('"name":"training/rest"');
  expect(names).not.toContain('"name":"workout"');
});
