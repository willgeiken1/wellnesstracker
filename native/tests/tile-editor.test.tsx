import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { configureTileRoutes, configureTileToast, resetTileStores, tileEdit, tileStoreFor, type TileStorage } from '../src/features/tiles';
import { TileEditorSheet } from '../src/features/tiles/editor/editor-sheet';
import { TileTraySheet } from '../src/features/tiles/tray-sheet';

// Reanimated, gesture-handler and the Skia tile surface use the shared stand-ins from tests/setup.ts.
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));

function fakeStorage(): TileStorage {
  const data: Record<string, unknown> = {};
  return { owner: 'editor-owner', localGet: <T,>(k: string) => data[k] as T | undefined, localSave: (k: string, v: unknown) => { data[k] = v; } } as TileStorage;
}
const wrap = (ui: ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>);
const tile = (storage: TileStorage, page: 'home' | 'training', id: string) => tileStoreFor(storage, page).getState().tiles.find(e => e.id === id);

describe('the tile editor', () => {
  const routes = { tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() };
  beforeEach(() => {
    jest.useFakeTimers();
    resetTileStores(); tileEdit.end();
    Object.values(routes).forEach(f => f.mockClear());
    configureTileRoutes(routes); configureTileToast(() => {});
  });
  afterEach(() => { jest.useRealTimers(); });

  it('changes a tile on the page as each choice is made, then reverts, resets and removes it', async () => {
    const storage = fakeStorage();
    tileStoreFor(storage, 'home').add('exercise', 'S', 'A');
    await wrap(<TileEditorSheet page="home" id="exercise" storage={storage} />);
    expect(screen.getByText('Edit tile')).toBeTruthy();
    expect(screen.getByTestId('te-revert', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);

    // Style, by its chip or the stage's next arrow.
    await fireEvent.press(screen.getByRole('radio', { name: 'Goal streak' }));
    expect(tile(storage, 'home', 'exercise')!.style).toBe('C');
    await fireEvent.press(screen.getByLabelText('Next style'));
    expect(tile(storage, 'home', 'exercise')!.style).toBe('D');

    // Size.
    await fireEvent.press(screen.getByRole('radio', { name: 'Medium' }));
    expect(tile(storage, 'home', 'exercise')!.size).toBe('M');

    // Its own clock, then back to the one Settings uses.
    await fireEvent.press(screen.getByRole('radio', { name: '24-hour clock' }));
    expect(tile(storage, 'home', 'exercise')!.options['u.clock']).toBe('24');
    await fireEvent.press(screen.getByText('Use Settings'));
    expect(tile(storage, 'home', 'exercise')!.options['u.clock']).toBeUndefined();

    // A colour of its own.
    await fireEvent.press(screen.getByRole('radio', { name: 'Water' }));
    expect(tile(storage, 'home', 'exercise')!.options.tint).toBe('water');

    // The goal steps down in Settings' own step.
    expect(screen.getByText('60 min')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lower daily training'));
    expect(screen.getByText('55 min')).toBeTruthy();

    // Revert puts the tile and its goal back as they were when the sheet opened.
    expect(screen.getByTestId('te-revert').props.accessibilityElementsHidden).toBe(false);
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(tile(storage, 'home', 'exercise')).toMatchObject({ style: 'A', size: 'S' });
    expect(tile(storage, 'home', 'exercise')!.options.tint).toBeUndefined();
    expect(screen.getByText('60 min')).toBeTruthy();

    // Reset tile returns it to how it starts; Remove sends it back to the tray.
    await fireEvent.press(screen.getByRole('radio', { name: 'Medium' }));
    await fireEvent.press(screen.getByText('Reset tile'));
    expect(tile(storage, 'home', 'exercise')!.size).toBe('S');
    await fireEvent.press(screen.getByText('Remove from Home'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tile(storage, 'home', 'exercise')).toBeUndefined();
  });

  it('a size a style does not come in is offered but cannot be picked', async () => {
    const storage = fakeStorage();
    tileStoreFor(storage, 'home').add('logMeal', 'S', 'A');
    await wrap(<TileEditorSheet page="home" id="logMeal" storage={storage} />);
    const large = screen.getByRole('radio', { name: /^Large/ });
    expect(large.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(large);
    expect(tile(storage, 'home', 'logMeal')!.size).toBe('S');
  });
});

describe('Add a tile', () => {
  const routes = { tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() };
  beforeEach(() => {
    jest.useFakeTimers();
    resetTileStores(); tileEdit.end();
    Object.values(routes).forEach(f => f.mockClear());
    configureTileRoutes(routes); configureTileToast(() => {});
  });
  afterEach(() => { jest.useRealTimers(); });

  it('draws every tile not on the page live, with how many styles it comes in', async () => {
    await wrap(<TileTraySheet page="home" storage={fakeStorage()} />);
    expect(screen.getByText('Add a tile')).toBeTruthy();
    expect(screen.getByTestId('tray-card-volume')).toBeTruthy();
    expect(screen.getByTestId('tray-stage-volume', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Volume. Weight lifted over 7, 14 or 30 days. 4 styles. Opens a preview to choose its style and size')).toBeTruthy();
    expect(screen.getByLabelText('Add Volume to Home as it is')).toBeTruthy();
  });

  it('opens a tile to pick its style, size and units before adding it, and remembers the pick on the way back', async () => {
    const storage = fakeStorage();
    await wrap(<TileTraySheet page="home" storage={storage} />);
    await fireEvent.press(screen.getByLabelText(/^Volume\. .*Opens a preview/));

    // The same preview as Edit tile, without what only a tile on the page has.
    expect(screen.getByLabelText('Back to all tiles')).toBeTruthy();
    expect(screen.getByText('Add to Home')).toBeTruthy();
    expect(screen.getByTestId('te-stage')).toBeTruthy();
    expect(screen.queryByText('Reset tile')).toBeNull();
    expect(screen.queryByText('Remove from Home')).toBeNull();
    expect(screen.queryByTestId('te-revert', { includeHiddenElements: true })).toBeNull();

    // Nothing reaches Home until Add.
    await fireEvent.press(screen.getByRole('radio', { name: 'Loaded bar' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Kilograms' }));
    expect(tile(storage, 'home', 'volume')).toBeUndefined();
    expect(screen.getByLabelText('Add Volume to Home, Loaded bar, Large')).toBeTruthy();

    // Back to the tiles, and in again: the pick is kept.
    await fireEvent.press(screen.getByLabelText('Back to all tiles'));
    expect(screen.getByTestId('tray-card-volume')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Volume\. .*Opens a preview/));
    expect(screen.getByRole('radio', { name: 'Loaded bar' }).props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByLabelText('Add Volume to Home, Loaded bar, Large'));
    expect(routes.close).toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tile(storage, 'home', 'volume')).toMatchObject({ style: 'B', size: 'L' });
    expect(tile(storage, 'home', 'volume')!.options['u.weight']).toBe('kg');
  });

  it('Add on a card puts the tile on the page as it is', async () => {
    const storage = fakeStorage();
    await wrap(<TileTraySheet page="training" storage={storage} />);
    await fireEvent.press(screen.getByLabelText('Add Plan days to Training as it is'));
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(tile(storage, 'training', 'plan')).toMatchObject({ style: 'A', size: 'M' });
  });
});
