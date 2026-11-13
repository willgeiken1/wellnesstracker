import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
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
test('the avatar opens Settings and its touch target is full size around the 40 pt circle', async () => {
  await render(<Screen title="Progress" tabHeader />, { wrapper });
  const avatar = screen.getByTestId('screen-avatar');
  expect(StyleSheet.flatten(avatar.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
  await fireEvent.press(avatar);
  expect(router.push).toHaveBeenCalledWith('/settings');
});
test('end space is added only on tab screens', async () => {
  const pad = async (props: object) => {
    const view = await render(<Screen title="X" {...props} />, { wrapper });
    const value = StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom;
    await view.unmount();
    return value;
  };
  expect(await pad({ tabHeader: true, endSpace: 64 }) - await pad({ tabHeader: true })).toBe(64);
  expect(await pad({ endSpace: 64 })).toBe(await pad({}));
});
