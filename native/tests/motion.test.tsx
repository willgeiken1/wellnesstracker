import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';

afterEach(() => jest.restoreAllMocks());
test('Reduce Motion disables motion initially and responds to OS changes', async () => {
  let onChange: ((enabled: boolean) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    onChange = listener as (enabled: boolean) => void;
    return { remove };
  });
  const { result, unmount } = await renderHook(useTheme, { wrapper: ThemeProvider });
  expect(result.current.motion).toEqual({ micro: 0, sheet: 0 });
  await act(() => onChange?.(false));
  await waitFor(() => expect(result.current.motion).toEqual({ micro: 120, sheet: 220 }));
  await act(() => onChange?.(true));
  expect(result.current.motion).toEqual({ micro: 0, sheet: 0 });
  await unmount();
  expect(remove).toHaveBeenCalled();
});
