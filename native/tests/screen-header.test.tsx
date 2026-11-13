import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Screen } from '../src/components/screen';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('a tab screen puts the avatar at the left of its title, as Home does (REDESIGN 2.1)', async () => {
  await render(<Screen title="Progress" tabHeader />, { wrapper });
  const avatar = screen.getByTestId('screen-avatar'), tree = JSON.stringify(screen.toJSON());
  expect(tree.indexOf('"screen-avatar"')).toBeGreaterThan(-1);
  expect(tree.indexOf('"screen-avatar"')).toBeLessThan(tree.indexOf('"Progress"'));
  expect(avatar.props.accessibilityLabel).toBeTruthy();
});
test('a pushed screen has no avatar', async () => {
  await render(<Screen title="Settings" />, { wrapper });
  expect(screen.queryByTestId('screen-avatar')).toBeNull();
});
