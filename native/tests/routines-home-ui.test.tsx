import { configure, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, PixelRatio, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { Repository } from '../src/data/repository';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Home from '../src/app/(tabs)/index';
import { TILE_STACKS_AT } from '../src/features/home/routine-tiles';
import { HOME_TILES_KEY, addTile, defaultTiles, isRoutineTile, isSmall, loadTiles, removeTile, saveTiles, setWide, withNextUp, type HomeTiles, type RoutineTileId } from '../src/features/home/tiles';
import { NEXT_UP_TILE_ID, routineBlockTileId, routineItemTileId } from '../src/features/routines/model/home-tiles';
import { routineUuid } from '../src/features/routines/model/ids';
import { routinesHome } from '../src/i18n/en';
import { memoryRepository } from './workout-repository';
import { SAMPLE, SAMPLE_NOW, logOf, routinesRepository, seededRepository, stored } from './routines-repository';

/* Routine tiles on Home, with made-up routines only. */

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
// A row's words are hidden from VoiceOver where its Log button speaks them; the tests still read what is drawn.
configure({ defaultIncludeHiddenElements: true });
const NEXT: RoutineTileId = NEXT_UP_TILE_ID, MORNING = routineBlockTileId(SAMPLE.morning) as RoutineTileId, NIGHT = routineBlockTileId(SAMPLE.night) as RoutineTileId;
const WALK = routineItemTileId(SAMPLE.walk) as RoutineTileId, VIAL = routineItemTileId(SAMPLE.vial) as RoutineTileId;
function open(repo: Repository) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider><Home /></ThemeProvider>);
}
const place = (repo: Repository, tiles: HomeTiles) => saveTiles(repo, tiles);
const flat = (id: string) => StyleSheet.flatten(typeof screen.getByTestId(id).props.style === 'function' ? screen.getByTestId(id).props.style({ pressed: false }) : screen.getByTestId(id).props.style);
/** Jest's phone reports text at twice the size; these tests start at the ordinary size and raise it on purpose. */
let fontScale = 1;
beforeEach(() => {
  fontScale = 1;
  const real = Dimensions.get;
  jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...real(key), fontScale }));
  jest.spyOn(PixelRatio, 'getFontScale').mockImplementation(() => fontScale);
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.mocked(router.navigate).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the Home layout holds routine tiles', () => {
  test('a routine tile id is a tile, and anything else that looks like one is dropped from a saved layout', () => {
    const storage = (value: unknown) => ({ localGet: () => value as never, localSave: jest.fn() });
    const saved = { order: ['map', NEXT, MORNING, WALK, 'routine-block:', 'routine-item:', 'routine-nonsense', MORNING], wide: [MORNING, 'map', 'routine-item:'], v: 2 };
    expect(loadTiles(storage(saved))).toEqual({ order: ['map', NEXT, MORNING, WALK], wide: [MORNING] });
    expect([NEXT, MORNING, WALK].every(isRoutineTile)).toBe(true);
    expect(['map', 'next', 'routine', 'routine-block:', 7, null].some(isRoutineTile)).toBe(false);
    expect([NEXT, MORNING, WALK].every(id => isSmall(id))).toBe(true);
  });
  test('Next up and a routine start full width, one item starts half width, and a removed tile forgets its width', () => {
    const start = defaultTiles();
    const three = [NEXT, MORNING, WALK].reduce<HomeTiles>(addTile, start);
    expect(three.order.slice(-3)).toEqual([NEXT, MORNING, WALK]);
    expect(three.wide).toEqual([NEXT, MORNING]);
    expect(addTile(three, MORNING)).toBe(three);
    expect(setWide(three, WALK, true).wide).toEqual([NEXT, MORNING, WALK]);
    expect(setWide(three, MORNING, false).wide).toEqual([NEXT]);
    const without = removeTile(three, MORNING);
    expect(without).toEqual({ order: [...start.order, NEXT, WALK], wide: [NEXT] });
    expect(start).toEqual(defaultTiles());
  });
  test('Next up by itself goes first and full width, once', () => {
    const start = defaultTiles(), shown = withNextUp(start);
    expect(shown.order).toEqual([NEXT, ...start.order]);
    expect(shown.wide).toEqual([NEXT]);
    expect(withNextUp(shown)).toBe(shown);
  });
});

describe('Next up on Home', () => {
  test('with no routine item there is no routine tile, and Edit Home offers none', async () => {
    const repo = memoryRepository() as unknown as Repository;
    await open(repo);
    expect(screen.queryByTestId(`home-tile-${NEXT}`)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    expect(screen.queryByRole('header', { name: 'Routines' })).toBeNull();
    expect(screen.queryByTestId(`edit-off-${NEXT}`)).toBeNull();
  });
  test('it shows by itself once there is an item, names the next open one, and opening Home writes nothing', async () => {
    const repo = seededRepository();
    const before = repo.getRevision();
    await open(repo);
    const tile = screen.getByTestId(`home-tile-${NEXT}`);
    expect(within(tile).getByText('Next up')).toBeTruthy();
    expect(within(tile).getByText('Zzyq Stretch')).toBeTruthy();
    expect(within(tile).queryByText('Zzyq Walk')).toBeNull();
    expect(repo.getRevision()).toBe(before);
    expect(repo.localGet(HOME_TILES_KEY)).toBeUndefined();
    // The empty map and the first-meal button are still there for a new account.
    expect(screen.getByTestId('home-empty-map')).toBeTruthy();
  });
  test('Log ticks the item off, says so, and the tile moves on to the next one', async () => {
    const repo = seededRepository();
    await open(repo);
    const log = screen.getByRole('button', { name: 'Log Zzyq Stretch' });
    expect(StyleSheet.flatten(log.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(log);
    expect(logOf(repo, SAMPLE.stretch)?.status).toBe('done');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Logged Zzyq Stretch.');
    // The row reads what was saved on the item, amount and unit included; nothing is worked out.
    expect(screen.getByRole('button', { name: 'Log Zzyq Sample Vial · 3 units' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log Zzyq Stretch' })).toBeNull();
  });
  test('with everything done it says so and has no Log button', async () => {
    const repo = seededRepository();
    await open(repo);
    for (const name of ['Zzyq Stretch', 'Zzyq Sample Vial · 3 units', 'Zzyq Walk', 'Zzyq Wind Down']) await fireEvent.press(screen.getByRole('button', { name: `Log ${name}` }));
    const tile = screen.getByTestId(`home-tile-${NEXT}`);
    expect(within(tile).getByText('All done today')).toBeTruthy();
    expect(within(tile).queryByText('Log')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next up, All done today. Opens Routines.' })).toBeTruthy();
  });
  test('its header opens the Routines tab, unfolding the routine that holds the item', async () => {
    const repo = seededRepository(store => { store.prefs.collapsedBlocks = [SAMPLE.morning]; });
    await open(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Next up. Opens Routines.' }));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/routines', params: { view: 'routines' } });
    expect(stored(repo).prefs.collapsedBlocks ?? []).not.toContain(SAMPLE.morning);
  });
  test('taking it off in Edit Home keeps it off, and adding it back brings it back', async () => {
    const repo = seededRepository();
    await open(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    const sheet = within(screen.getByTestId('home-edit-sheet'));
    // It is listed first, like any tile on Home, under its own name.
    expect(within(sheet.getByTestId(`edit-on-${NEXT}`)).getByText('Next up')).toBeTruthy();
    await fireEvent.press(sheet.getByRole('button', { name: 'Remove, Next up' }));
    expect(stored(repo).prefs.homeNextHidden).toBe(true);
    expect(loadTiles(repo).order).not.toContain(NEXT);
    expect(screen.queryByTestId(`home-tile-${NEXT}`)).toBeNull();
    expect(sheet.getByText('Taking a routine tile off Home removes nothing from Routines.')).toBeTruthy();
    expect(stored(repo).items.filter(item => item.deletedAt === null)).toHaveLength(4);
    await fireEvent.press(sheet.getByRole('button', { name: 'Add, Next up' }));
    expect(stored(repo).prefs.homeNextHidden).toBeUndefined();
    expect(loadTiles(repo).order.at(-1)).toBe(NEXT);
    expect(screen.getByTestId(`home-tile-${NEXT}`)).toBeTruthy();
  });
  test('once taken off it stays off the next time Home opens', async () => {
    const repo = seededRepository(store => { store.prefs.homeNextHidden = true; });
    await open(repo);
    expect(screen.queryByTestId(`home-tile-${NEXT}`)).toBeNull();
    // It can still be added from Edit Home.
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    expect(screen.getByTestId(`edit-off-${NEXT}`)).toBeTruthy();
  });
});

describe('routine and item tiles', () => {
  test('Edit Home lists each routine and item by its own name, and adds a tile with the + beside it', async () => {
    const repo = seededRepository();
    await open(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    const sheet = within(screen.getByTestId('home-edit-sheet'));
    expect(sheet.getByRole('header', { name: 'Routines' })).toBeTruthy();
    expect(within(sheet.getByTestId(`edit-off-${MORNING}`)).getByText('Morning routine')).toBeTruthy();
    expect(within(sheet.getByTestId(`edit-off-${MORNING}`)).getByText('What is still open in this routine today.')).toBeTruthy();
    expect(within(sheet.getByTestId(`edit-off-${WALK}`)).getByText('One item, with a button to log it.')).toBeTruthy();
    // Titles only: a saved amount or unit is never part of what is listed.
    expect(sheet.queryByText(/3 units/)).toBeNull();
    // Six to pick from, so no search box yet.
    expect(sheet.queryByTestId('edit-routine-search')).toBeNull();
    await fireEvent.press(sheet.getByRole('button', { name: 'Add, Morning routine' }));
    await fireEvent.press(sheet.getByRole('button', { name: 'Add, Zzyq Walk' }));
    expect(loadTiles(repo)).toMatchObject({ order: [NEXT, ...defaultTiles().order, MORNING, WALK], wide: [NEXT, MORNING] });
    expect(sheet.getByTestId(`edit-on-${MORNING}`)).toBeTruthy();
    expect(sheet.queryByTestId(`edit-off-${MORNING}`)).toBeNull();
    // A routine tile can be made half width, and an item tile full width, with the switch every small tile has.
    await fireEvent.press(sheet.getByRole('switch', { name: 'Zzyq Walk, full width' }));
    expect(loadTiles(repo).wide).toEqual([NEXT, MORNING, WALK]);
  });
  test('a full-width routine tile lists what is still open, with the routine name as its heading, and logs from Home', async () => {
    const repo = seededRepository();
    place(repo, { order: [MORNING, NIGHT], wide: [MORNING, NIGHT] });
    await open(repo);
    const morning = within(screen.getByTestId(`home-tile-${MORNING}`));
    expect(morning.getByText('Morning routine')).toBeTruthy();
    for (const name of ['Zzyq Stretch', 'Zzyq Sample Vial · 3 units', 'Zzyq Walk']) expect(morning.getByText(name)).toBeTruthy();
    expect(morning.queryByText('Zzyq Wind Down')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Log Zzyq Walk' }));
    expect(logOf(repo, SAMPLE.walk)?.status).toBe('done');
    expect(within(screen.getByTestId(`home-tile-${MORNING}`)).queryByText('Zzyq Walk')).toBeNull();
    // Placed by hand, so Next up no longer shows by itself only when it was placed too; here it still does.
    expect(screen.getByTestId(`home-tile-${NEXT}`)).toBeTruthy();
  });
  test('a routine with more than four open items shows four and counts the rest', async () => {
    const repo = seededRepository((store) => {
      const extra = ['a', 'b', 'c'].map(key => routineUuid('test', 'extra', key));
      extra.forEach((id, i) => {
        store.items.push({ id, name: `Zzyq Extra ${key(i)}`, kind: 'check', compoundId: null, updatedAt: 10, deletedAt: null });
        store.placements.push({ id: routineUuid('place', SAMPLE.morning, id), blockId: SAMPLE.morning, itemId: id, order: 10 + i, updatedAt: 10, deletedAt: null });
      });
    });
    place(repo, { order: [MORNING], wide: [MORNING] });
    await open(repo);
    const tile = within(screen.getByTestId(`home-tile-${MORNING}`));
    expect(tile.getAllByText('Log')).toHaveLength(4);
    expect(tile.getByText('2 more')).toBeTruthy();
  });
  test('a half-width tile is one line that opens Routines; at large text it takes the whole row', async () => {
    const repo = seededRepository();
    place(repo, { order: [WALK, MORNING], wide: [] });
    const view = await open(repo);
    expect(flat(`home-tile-${WALK}`).width).toBe('48.5%');
    expect(screen.getByRole('button', { name: 'Routine, Zzyq Walk. Opens Routines.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Routine, Morning routine. Opens Routines.' })).toBeTruthy();
    expect(within(screen.getByTestId(`home-tile-${WALK}`)).queryByText('Log')).toBeNull();
    await fireEvent.press(screen.getByTestId(`home-tile-${WALK}`));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/routines', params: { view: 'routines' } });
    await view.unmount();
    fontScale = TILE_STACKS_AT;
    await open(repo);
    expect(flat(`home-tile-${WALK}`).width).toBe('100%');
  });
  test('an item that sits in no routine opens Routines on its type tab', async () => {
    const repo = seededRepository((store) => { store.placements = store.placements.filter(row => row.itemId !== SAMPLE.vial); });
    place(repo, { order: [VIAL], wide: [] });
    await open(repo);
    await fireEvent.press(screen.getByTestId(`home-tile-${VIAL}`));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/routines', params: { view: 'peptide' } });
  });
  test('a tile whose routine was deleted draws nothing, and Edit Home still lets it be taken off', async () => {
    const repo = seededRepository();
    const gone = routineBlockTileId(routineUuid('test', 'gone')) as RoutineTileId;
    place(repo, { order: [gone, MORNING], wide: [] });
    await open(repo);
    expect(screen.queryByTestId(`home-tile-${gone}`)).toBeNull();
    expect(screen.getByTestId(`home-tile-${MORNING}`)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    await fireEvent.press(within(screen.getByTestId('home-edit-sheet')).getByRole('button', { name: 'Remove, Routine' }));
    expect(loadTiles(repo).order).not.toContain(gone);
  });
  test('with seven or more tiles to pick from, a search box narrows them by title', async () => {
    const repo = seededRepository((store) => {
      store.items.push({ id: routineUuid('test', 'seventh'), name: 'Zzyq Seventh', kind: 'check', compoundId: null, type: 'other', updatedAt: 10, deletedAt: null });
    });
    await open(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    const sheet = within(screen.getByTestId('home-edit-sheet'));
    const search = sheet.getByLabelText('Search tiles');
    expect(StyleSheet.flatten(search.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.changeText(search, 'wind');
    expect(sheet.getByTestId(`edit-off-${routineItemTileId(SAMPLE.wind)}`)).toBeTruthy();
    expect(sheet.queryByTestId(`edit-off-${MORNING}`)).toBeNull();
    await fireEvent.changeText(search, 'units');
    expect(sheet.getByText('No tiles match that title.')).toBeTruthy();
  });
});

describe('the words', () => {
  test('are sentence case and carry no number, so no line can read as an amount', () => {
    for (const [key, line] of Object.entries(routinesHome)) {
      expect([key, /\d/.test(line)]).toEqual([key, false]);
      // Routines and Home are the names of tabs; nothing else after a sentence's first letter is a capital.
      const bare = line.replace(/\{\w+\}/g, '').replace(/\b(?:Routines|Home)\b/g, '').trim();
      for (const sentence of bare.split(/[.?!]\s+/)) expect([key, /[A-Z]/.test(sentence.trim().slice(1))]).toEqual([key, false]);
      expect([key, /\b(?:dose|take|mg|mcg|units?)\b/i.test(line)]).toEqual([key, false]);
    }
  });
  test('the sample items of "Look around first" are plain things to do', () => {
    expect([routinesHome.sampleStretch, routinesHome.sampleWalk, routinesHome.sampleRead, routinesHome.sampleLights]).toEqual(['Stretch', 'Morning walk', 'Read a few pages', 'Lights out']);
  });
});

function key(i: number) { return ['One', 'Two', 'Three'][i]; }
// The routine store asks two things more of a repository than Home does; a plain one still opens Home.
test('Home opens on a repository with no routine tables to speak of', async () => {
  await open(routinesRepository());
  expect(screen.getByRole('button', { name: 'Edit Home' })).toBeTruthy();
});
