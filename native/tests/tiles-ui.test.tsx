import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { configureTileRoutes, configureTileToast, resetTileStores, tileEdit, tileStoreFor, type TileStorage } from '../src/features/tiles';
import { TileEditorSheet } from '../src/features/tiles/editor/editor-sheet';
import { TileTraySheet } from '../src/features/tiles/tray-sheet';
import { TileGrid } from '../src/features/tiles/tile-grid';
import { tileSheetOptions } from '../src/features/tiles/nav';
import { sheetScreenLayout } from '../src/features/navigation/sheet-frame';
import { StyleSheet } from 'react-native';

// Reanimated, gesture-handler and the Skia tile surface use the shared stand-ins from tests/setup.ts.
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
    expect(screen.getByText(/2 of 12 tiles are not on Training yet\./)).toBeTruthy();
    expect(screen.getByText('Reset Training tiles')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add Plan days, Medium'));
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(routes.close).toHaveBeenCalled();
    expect(tileStoreFor(storage, 'training').getState().tiles.some(e => e.id === 'plan')).toBe(true);
  });

  // The tray is a large sheet: on iOS its screen can hand it no height, which left Add a tile blank. It sits in the sheet frame.
  it('the tray still shows its tiles and adds one when its sheet gets no height', async () => {
    const storage = fakeStorage();
    await wrap(sheetScreenLayout({ options: tileSheetOptions.tray, children: <TileTraySheet page="training" storage={storage} /> }));
    const inner = screen.getByTestId('sheet-frame');
    await fireEvent(inner.parent!, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 0 } } });
    expect(StyleSheet.flatten(screen.getByTestId('sheet-frame').props.style).height).toBeGreaterThan(500);
    expect(screen.getByText('Training tiles')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add Plan days, Medium'));
    await act(async () => { jest.advanceTimersByTime(600); });
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
    await wrap(<TileEditorSheet page="home" id="next" storage={storage} />);
    expect(screen.getByText('Edit tile')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Slots/ })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Large'));
    expect(tileStoreFor(storage, 'home').getState().tiles.find(e => e.id === 'next')!.size).toBe('L');
    await fireEvent.press(screen.getByText('Remove from Home'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tileStoreFor(storage, 'home').getState().tiles.some(e => e.id === 'next')).toBe(false);
  });

  it('customize without a tile says so', async () => {
    // an unknown id falls back to the page's first tile, which is the split tile now
    await wrap(<TileEditorSheet page="training" id="none" storage={fakeStorage()} />);
    expect(screen.getByLabelText(/^Preview, .*, Large/)).toBeTruthy();
    await wrap(<TileEditorSheet page={undefined} id="none" storage={fakeStorage()} />);
    expect(screen.getByText('No tile here')).toBeTruthy();
  });
});
