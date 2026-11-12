import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { contrast } from '../src/core/contrast';
import { ThemeProvider } from '../src/design/theme-provider';
import { SetRow } from '../src/features/workout/set-row';
import { Sheet, SHEET_DRAG_CLOSE } from '../src/features/workout/primitives';
import { SWIPE_COMMIT, SWIPE_REVEAL } from '../src/features/workout/swipe-stops';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
type Row = React.ComponentProps<typeof SetRow>;
const open = { weight: '135', reps: '5' } as Row['draft'], logged = { ...open, setId: 'made-up-set' } as Row['draft'];
const row = (props: Partial<Row> = {}) => <SetRow exerciseIndex={0} exercise="Sample lift" index={1} draft={open} previous="" hint="" onEdit={() => {}} onDone={() => {}} onRemove={() => {}} {...props} />;
const at = (x: number) => ({ nativeEvent: { contentOffset: { x, y: 0 } } });

describe('swiping a set row right to mark it done', () => {
  test('an open set rests beside a Done stop on a native horizontal scroll', async () => {
    await render(row(), { wrapper });
    expect(screen.getByTestId('set-swipe-0-1').props).toMatchObject({ horizontal: true, scrollEnabled: true, snapToOffsets: [0, SWIPE_REVEAL], contentOffset: { x: SWIPE_REVEAL, y: 0 } });
  });
  test('a deliberate swipe that settles on the stop marks the set done once', async () => {
    const onDone = jest.fn();
    await render(row({ onDone }), { wrapper });
    const swipe = screen.getByTestId('set-swipe-0-1');
    await fireEvent(swipe, 'scrollEndDrag', at(SWIPE_REVEAL - SWIPE_COMMIT));
    await fireEvent(swipe, 'momentumScrollEnd', at(0));
    await fireEvent(swipe, 'momentumScrollEnd', at(0));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('a short flick, or a swipe the other way, does nothing', async () => {
    const onDone = jest.fn();
    await render(row({ onDone }), { wrapper });
    const swipe = screen.getByTestId('set-swipe-0-1');
    await fireEvent(swipe, 'scrollEndDrag', at(SWIPE_REVEAL - 20));
    await fireEvent(swipe, 'momentumScrollEnd', at(0));
    await fireEvent(swipe, 'scrollEndDrag', at(SWIPE_REVEAL + SWIPE_COMMIT));
    await fireEvent(swipe, 'momentumScrollEnd', at(SWIPE_REVEAL));
    expect(onDone).not.toHaveBeenCalled();
  });
  test('a done set has nothing to swipe to, and the checkbox still toggles it', async () => {
    const onDone = jest.fn();
    await render(row({ draft: logged, onDone }), { wrapper });
    expect(screen.getByTestId('set-swipe-0-1').props).toMatchObject({ scrollEnabled: false, snapToOffsets: [0], contentOffset: { x: 0, y: 0 } });
    await fireEvent.press(screen.getByTestId('set-0-1-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('the revealed Done word is not an extra control: weight, reps, the number and the checkbox only', async () => {
    await render(row(), { wrapper });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
});

describe('dragging a sheet down by its handle', () => {
  // The responder system is driven the way the phone drives it: grant, move, release on the handle's host view.
  const touch = (pageX: number, pageY: number, timestamp: number, active = true) => {
    const one = { identifier: 1, pageX, pageY, locationX: pageX, locationY: pageY, timestamp, target: 1 };
    const bank = { touchActive: active, startPageX: 100, startPageY: 100, startTimeStamp: 1, currentPageX: pageX, currentPageY: pageY, currentTimeStamp: timestamp,
      previousPageX: 100, previousPageY: 100, previousTimeStamp: 1 };
    return { nativeEvent: { ...one, touches: active ? [one] : [], changedTouches: [one] }, persist() {},
      touchHistory: { touchBank: [bank], numberActiveTouches: active ? 1 : 0, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: timestamp } };
  };
  const drag = async (handle: ReturnType<typeof screen.getByTestId>, dy: number, dx = 0) => {
    const p = handle.props;
    const claimed = p.onStartShouldSetResponder?.(touch(100, 100, 1)) || p.onMoveShouldSetResponder?.(touch(100 + dx, 100 + dy, 2));
    if (!claimed) return false;
    p.onResponderGrant?.(touch(100, 100, 1));
    p.onResponderMove?.(touch(100 + dx, 100 + dy, 3));
    p.onResponderRelease?.(touch(100 + dx, 100 + dy, 4, false));
    return true;
  };
  const sheet = (onClose: () => void, tall = true) => <Sheet label="Made-up sheet" testID="demo-sheet" minimal tall={tall} onClose={onClose}><View /></Sheet>;

  test('a drag past the threshold closes it, a shorter or sideways one does not', async () => {
    const onClose = jest.fn();
    await render(sheet(onClose), { wrapper });
    const handle = screen.getByTestId('demo-sheet-handle');
    await drag(handle, SHEET_DRAG_CLOSE - 5);
    await drag(handle, SHEET_DRAG_CLOSE + 10, 200);
    expect(onClose).not.toHaveBeenCalled();
    await drag(handle, SHEET_DRAG_CLOSE + 40);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('the handle keeps one responder across re-renders and still calls the newest close', async () => {
    const first = jest.fn(), second = jest.fn();
    const view = await render(sheet(first), { wrapper });
    const before = screen.getByTestId('demo-sheet-handle').props.onResponderRelease;
    await view.rerender(sheet(second));
    const handle = screen.getByTestId('demo-sheet-handle');
    expect(handle.props.onResponderRelease).toBe(before);
    await drag(handle, SHEET_DRAG_CLOSE + 40);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1);
  });
  test.each([true, false])('the handle shows a grabber, takes the touch at once and refuses to give it up (tall: %s)', async tall => {
    const onClose = jest.fn();
    await render(sheet(onClose, tall), { wrapper });
    const handle = screen.getByTestId('demo-sheet-handle');
    expect(screen.getByTestId('demo-sheet-grabber')).toBeTruthy();
    expect(handle.props.onStartShouldSetResponder(touch(100, 100, 1))).toBe(true);
    expect(handle.props.onResponderTerminationRequest(touch(100, 100, 1))).toBe(false);
    await drag(handle, SHEET_DRAG_CLOSE + 40);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('on a short sheet the handle lies over the top padding only, so it covers no control', async () => {
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    await render(sheet(() => {}, false), { wrapper });
    const handle = StyleSheet.flatten(screen.getByTestId('demo-sheet-handle').props.style);
    const box = StyleSheet.flatten(screen.getByTestId('demo-sheet').props.style);
    expect(handle).toMatchObject({ position: 'absolute', top: 0 });
    expect(handle.minHeight).toBeLessThanOrEqual(box.paddingTop);
  });
  test('the handle is 44pt to a finger and its bar stands out from the sheet', async () => {
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    await render(sheet(() => {}, false), { wrapper });
    const handle = screen.getByTestId('demo-sheet-handle');
    // Only slop inside the sheet counts: the strip is at the sheet's top edge, so slop above it is clipped.
    const slop = handle.props.hitSlop as { top?: number; bottom: number };
    expect(slop.top ?? 0).toBe(0);
    expect(StyleSheet.flatten(handle.props.style).minHeight + slop.bottom).toBeGreaterThanOrEqual(44);
    const bar = StyleSheet.flatten(screen.getByTestId('demo-sheet-grabber').props.style);
    const box = StyleSheet.flatten(screen.getByTestId('demo-sheet').props.style);
    expect(contrast(bar.backgroundColor as string, box.backgroundColor as string)).toBeGreaterThanOrEqual(3);
  });
});
