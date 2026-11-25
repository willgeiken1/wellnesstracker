import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { configureTileRoutes, configureTileToast, resetTileStores, tileEdit, tileStoreFor, type TileStorage } from '../src/features/tiles';
import { TileCustomizeSheet } from '../src/features/tiles/customize-sheet';
import { TileTraySheet } from '../src/features/tiles/tray-sheet';
import { TileGrid } from '../src/features/tiles/tile-grid';

// A small stand-in for Reanimated: values settle at once, styles are computed once.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const React = require('react');
  const id = (v: unknown) => v;
  const ease = Object.assign(() => 0, { bezier: () => id, inOut: () => id, ease: id, linear: id, out: () => id });
  return {
    __esModule: true,
    default: { View: RN.View, ScrollView: RN.ScrollView, Text: RN.Text, createAnimatedComponent: id },
    Easing: ease,
    cancelAnimation: () => {}, interpolate: (_v: number, _i: number[], o: number[]) => o[o.length - 1],
    measure: () => null, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f, scrollTo: () => {},
    useAnimatedRef: () => React.useRef(null), useAnimatedStyle: (f: () => unknown) => f(),
    useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: 0 }),
    useScrollOffset: () => ({ value: 0 }), useSharedValue: (v: unknown) => React.useRef({ value: v }).current,
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id,
  };
});
// Gestures are exercised on a device; here the detectors just draw their child.
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const gesture = () => ({});
  return { GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View,
    usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
});
// Skia draws the tile depth on a device; the tests only need the tile's contents.
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));

function fakeStorage(): TileStorage {
  const data: Record<string, unknown> = {};
  return { owner: 'ui-owner', localGet: <T,>(k: string) => data[k] as T | undefined, localSave: (k: string, v: unknown) => { data[k] = v; } } as TileStorage;
}
const wrap = (ui: ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('tile grid screens', () => {
  const routes = { tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() };
  const toasts: string[] = [];
  beforeEach(() => {
    jest.useFakeTimers();
    resetTileStores(); tileEdit.end(); toasts.length = 0;
    Object.values(routes).forEach(f => f.mockClear());
    configureTileRoutes(routes); configureTileToast(m => toasts.push(m));
  });
  afterEach(() => { jest.useRealTimers(); });

  it('draws a page of tiles with its headers, Edit page and Add a tile', async () => {
    await wrap(<TileGrid page="training" storage={fakeStorage()} />);
    expect(screen.getByText('Workout in progress')).toBeTruthy();
    expect(screen.getByText("Today's goal")).toBeTruthy();
    await fireEvent.press(screen.getByText('Add a tile'));
    expect(routes.tray).toHaveBeenCalledWith('training');
    await fireEvent.press(screen.getByText('Edit page'));
    expect(tileEdit.get().page).toBe('training');
  });

  it('in edit mode shows the Done bar, removes a tile and taps through to customize', async () => {
    const storage = fakeStorage();
    await wrap(<TileGrid page="food" storage={storage} />);
    await act(async () => { tileEdit.set('food', true); });
    expect(screen.getByText('Tap a tile to customize')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove Water tile'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tileStoreFor(storage, 'food').getState().tiles.some(e => e.id === 'water')).toBe(false);
    expect(toasts).toContain('Water is back in the tray');
    await fireEvent.press(screen.getByLabelText('Calories. Customize'));
    expect(routes.customize).toHaveBeenCalledWith('food', 'cal');
    expect(tileEdit.get().customizing).toBe('cal');
    // Closing the customize sheet clears the outline and brings the bar back.
    await act(async () => { tileEdit.customize('food', null); });
    await fireEvent.press(screen.getByText('Done'));
    expect(tileEdit.get().page).toBeNull();
  });

  it('shows an empty page when every tile is removed', async () => {
    const storage = fakeStorage();
    const store = tileStoreFor(storage, 'routines');
    store.getState().tiles.map(e => e.id).forEach(id => store.remove(id));
    await wrap(<TileGrid page="routines" storage={storage} />);
    expect(screen.getByText('No tiles on Routines')).toBeTruthy();
  });

  it('the tray lists tiles not on the page and adds one', async () => {
    const storage = fakeStorage();
    await wrap(<TileTraySheet page="training" storage={storage} />);
    expect(screen.getByText('Training tiles')).toBeTruthy();
    expect(screen.getByText(/2 of 11 tiles are not on Training yet\./)).toBeTruthy();
    expect(screen.getByText('Reset Training tiles')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add Plan days, Medium'));
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(routes.close).toHaveBeenCalled();
    expect(tileStoreFor(storage, 'training').getState().tiles.some(e => e.id === 'plan')).toBe(true);
  });

  it('the Home tray has its own copy, filters and footnote', async () => {
    await wrap(<TileTraySheet page="home" storage={fakeStorage()} />);
    expect(screen.getByText('Tile tray')).toBeTruthy();
    expect(screen.getByText('14 tiles to choose from, each in its styles. Pick a style and a size, then add it to Home.')).toBeTruthy();
    expect(screen.getAllByText('Recovery and sleep').length).toBeGreaterThan(1);
    expect(screen.getByText('Tiles read Apple Health and Oura where a number comes from them.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
    expect(screen.queryByText('Insight Score')).toBeNull();
  });

  it('the tray without a page says to open the page first', async () => {
    await wrap(<TileTraySheet page="nope" storage={fakeStorage()} />);
    expect(screen.getByText('No tiles yet')).toBeTruthy();
    expect(screen.getByText('Open the page first.')).toBeTruthy();
  });

  it('customize applies a size as it is picked and removes the tile', async () => {
    const storage = fakeStorage();
    await wrap(<TileCustomizeSheet page="home" id="next" storage={storage} />);
    expect(screen.getByText('Customize tile')).toBeTruthy();
    expect(screen.getByText('Slots')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Large'));
    expect(tileStoreFor(storage, 'home').getState().tiles.find(e => e.id === 'next')!.size).toBe('L');
    await fireEvent.press(screen.getByText('Remove from Home'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tileStoreFor(storage, 'home').getState().tiles.some(e => e.id === 'next')).toBe(false);
  });

  it('customize without a tile says so', async () => {
    await wrap(<TileCustomizeSheet page="training" id="none" storage={fakeStorage()} />);
    expect(screen.getByText('Workout in progress')).toBeTruthy();
    await wrap(<TileCustomizeSheet page={undefined} id="none" storage={fakeStorage()} />);
    expect(screen.getByText('No tile here')).toBeTruthy();
  });
});
