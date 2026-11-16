import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { EditHome } from '../src/features/home/edit-sheet';
import { defaultTiles } from '../src/features/home/tiles';
import { appleHealth } from '../src/features/health/apple';
import { oura } from '../src/features/health/oura-client';

jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn(() => null) }));
jest.mock('../src/features/health/oura-client', () => ({ oura: jest.fn(() => null) }));
const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const present = {} as never;
const open = () => render(<EditHome visible tiles={defaultTiles()} onChange={() => {}} onClose={() => {}} />, { wrapper });

test.each([
  ['Apple Health', true, false],
  ['an Oura account', false, true],
  ['both', true, true],
])('Edit Home offers Steps and Sleep where %s can exist', async (_name, apple, ring) => {
  jest.mocked(appleHealth).mockReturnValue(apple ? present : null);
  jest.mocked(oura).mockReturnValue(ring ? present : null);
  await open();
  expect(screen.getByTestId('edit-off-steps')).toBeTruthy();
  expect(screen.getByTestId('edit-off-sleep')).toBeTruthy();
});

test('with neither, Steps and Sleep are not offered', async () => {
  jest.mocked(appleHealth).mockReturnValue(null);
  jest.mocked(oura).mockReturnValue(null);
  await open();
  expect(screen.queryByTestId('edit-off-steps')).toBeNull();
  expect(screen.queryByTestId('edit-off-sleep')).toBeNull();
});
