import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, LayoutAnimation } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { layoutMotion, useLayoutMotion } from '../src/components/layout-motion';
import { SetRow } from '../src/features/workout/set-row';
import tokens from '../src/design/tokens.json';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
let configure: jest.SpyInstance;
beforeEach(() => { configure = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test('rows ease to their new place over the sheet time, fading as they come and go', () => {
  const config = layoutMotion(tokens.motion.sheet);
  expect(config.duration).toBe(tokens.motion.sheet);
  expect(config.create).toMatchObject({ type: 'easeInEaseOut', property: 'opacity' });
  expect(config.delete).toMatchObject({ type: 'easeInEaseOut', property: 'opacity' });
  expect(config.update).toMatchObject({ type: 'easeInEaseOut' });
});

test('with motion allowed, the next layout glides', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const { result } = await renderHook(() => useLayoutMotion(), { wrapper });
  await new Promise(resolve => setTimeout(resolve, 0));
  result.current();
  expect(configure).toHaveBeenCalledTimes(1);
  expect(configure.mock.calls[0][0].duration).toBe(tokens.motion.sheet);
});

test('with Reduce Motion on, the list changes at once', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const { result } = await renderHook(() => useLayoutMotion(), { wrapper });
  await new Promise(resolve => setTimeout(resolve, 0));
  result.current();
  expect(configure).not.toHaveBeenCalled();
});

test('the set tag buttons fold in and out under the row', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await render(<SetRow exercise="Made-up Press" index={0} draft={{ weight: '', reps: '' } as any} previous="" hint="" onEdit={() => {}} onDone={() => {}} onRemove={() => {}} onTag={() => {}} />, { wrapper });
  await new Promise(resolve => setTimeout(resolve, 0));
  configure.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: /Set tag/i }));
  expect(configure).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: /Set tag/i }));
  expect(configure).toHaveBeenCalledTimes(2);
});
