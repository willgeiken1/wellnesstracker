import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { ShellToast, showToast } from '../src/features/shell/toast';

jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());

const mount = () => render(<ThemeProvider><ShellToast bottom={0} /></ThemeProvider>);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a toast ends for every screen, not just the one that showed it', () => {
  test('after Undo is pressed, a screen opened later shows no toast and Undo cannot run again', async () => {
    const undo = jest.fn();
    await act(() => showToast('Set deleted', { action: { label: 'Undo', onAction: undo } }));
    const first = await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledTimes(1);
    await first.unmount();
    await mount();
    expect(screen.queryByTestId('shell-toast')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(undo).toHaveBeenCalledTimes(1);
  });
  test('after it fades, a screen opened later does not show it again', async () => {
    const undo = jest.fn();
    await act(() => showToast('Set deleted', { action: { label: 'Undo', onAction: undo } }));
    const first = await mount();
    await act(() => { jest.advanceTimersByTime(2600 + 400); });
    expect(screen.queryByTestId('shell-toast')).toBeNull();
    await first.unmount();
    await mount();
    expect(screen.queryByTestId('shell-toast')).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });
  test('a screen that opens while a toast is up shows it only for the time it has left', async () => {
    await act(() => showToast('Saved'));
    const first = await mount();
    await act(() => { jest.advanceTimersByTime(2000); });
    await first.unmount();
    await mount();
    expect(screen.getByTestId('shell-toast')).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(600 + 400); });
    expect(screen.queryByTestId('shell-toast')).toBeNull();
  });
});
