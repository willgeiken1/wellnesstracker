import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { TabPlaceholder } from '../src/features/shell/placeholder';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;

test('an unbuilt tab is one title and one plain line, with no badge, milestone code or Back to Home button', async () => {
  await render(wrap(<TabPlaceholder title="insights" />));
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.getByRole('header', { name: 'Insights' })).toBeTruthy();
  expect(within(screen.getByTestId('tab-empty')).getByText("This part of Insight isn't built yet.")).toBeTruthy();
  expect(screen.queryByText(/M2|M3|placeholder|coming soon/i)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull();
});

test('with sections, the chosen section is named in the empty state', async () => {
  await render(wrap(<TabPlaceholder title="progress" segments={['body', 'photos']} />));
  const empty = within(screen.getByTestId('tab-empty'));
  expect(empty.getByRole('header', { name: 'Body' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Photos' }));
  expect(screen.getByRole('tab', { name: 'Photos' })).toBeSelected();
  expect(within(screen.getByTestId('tab-empty')).getByRole('header', { name: 'Photos' })).toBeTruthy();
});
