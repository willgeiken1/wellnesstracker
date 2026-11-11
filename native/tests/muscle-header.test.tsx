import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import MusclePage from '../src/app/muscle/[key]';
import { muscleByKey } from '../src/features/atlas/muscles';

const mockScreen = jest.fn((_props: { options: Record<string, unknown> }) => null);
let mockKey = '';
jest.mock('expo-router', () => ({
  Stack: { Screen: (props: { options: Record<string, unknown> }) => mockScreen(props) },
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ key: mockKey }),
}));

test.each([[...muscleByKey.keys()][0], 'not-a-muscle'])('muscle page %s sets its own header instead of showing the route name', async key => {
  mockKey = key; mockScreen.mockClear();
  await render(<ThemeProvider><MusclePage /></ThemeProvider>);
  const options = mockScreen.mock.calls.at(-1)![0].options;
  expect(options.title).toBe('');
  expect(options.headerBackButtonDisplayMode).toBe('minimal');
  expect(JSON.stringify(options)).not.toContain('[key]');
  expect(screen.getByRole('header')).toHaveTextContent(muscleByKey.get(key)?.name ?? 'Muscles this week');
});

test('a muscle whose scientific name is its everyday name shows the name once', async () => {
  const same = [...muscleByKey.values()].find(m => m.scientific === m.name), different = [...muscleByKey.values()].find(m => m.scientific !== m.name);
  if (same) { mockKey = same.key; const view = await render(<ThemeProvider><MusclePage /></ThemeProvider>); expect(screen.getAllByText(same.name)).toHaveLength(1); await view.unmount(); }
  if (different) { mockKey = different.key; await render(<ThemeProvider><MusclePage /></ThemeProvider>); expect(screen.getByText(different.scientific)).toBeTruthy(); }
  expect(same ?? different).toBeTruthy();
});
