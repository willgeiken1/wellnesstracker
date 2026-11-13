import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { saveFood, attributedDay, meals } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { addTile, defaultTiles, HOME_TILES_KEY, loadTiles, moveTile, offHome, removeTile, setWide, TILE_IDS } from '../src/features/home/tiles';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function open(repo = memoryRepository()) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return repo;
}
// Made-up sample data only.
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
function seeded() {
  const repo = memoryRepository(), day = attributedDay();
  saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day);
  const store = new WorkoutStore(repo), start = Date.now() - 600000, session = store.start(undefined, start), entry = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' }); store.toggleDone(entry.id, 0);
  store.finish(session.id, { startedAt: start, finishedAt: Date.now() - 60000, notes: '' });
  return open(repo);
}
const order = () => screen.getByTestId('home-tiles').children.map(child => {
  const node = child as { props: { testID?: string }; children: { props: { testID?: string } }[] };
  return node.props.testID ?? within(child as never).queryAllByTestId(/^home-(map|next)$/)[0]?.props.testID ?? 'week';
});
let hours: jest.SpyInstance;
beforeEach(() => { jest.mocked(router.navigate).mockClear(); hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10); });
afterEach(() => hours.mockRestore());

describe('home tile layout', () => {
  test('starts with every tile, in the starting order, none wide', () => {
    // The two Apple Health tiles start off Home; connecting Apple Health adds them.
    expect(defaultTiles()).toEqual({ order: TILE_IDS.filter(id => id !== 'steps' && id !== 'sleep'), wide: [] });
    expect(loadTiles(null)).toEqual(defaultTiles());
    expect(offHome(defaultTiles())).toEqual(['steps', 'sleep']);
  });
  test('add, remove, move and resize return new layouts and ignore no-ops', () => {
    const start = defaultTiles();
    const without = removeTile(start, 'week');
    expect(without.order).not.toContain('week');
    expect(offHome(without)).toEqual(['week', 'steps', 'sleep']);
    expect(removeTile(without, 'week')).toBe(without);
    expect(addTile(without, 'week').order.at(-1)).toBe('week');
    expect(addTile(start, 'week')).toBe(start);
    expect(moveTile(start, 'score', -1).order.slice(0, 2)).toEqual(['score', 'map']);
    expect(moveTile(start, 'map', -1)).toBe(start);
    expect(moveTile(start, 'weight', 1)).toBe(start);
    expect(setWide(start, 'calories', true).wide).toEqual(['calories']);
    expect(setWide(start, 'calories', false)).toBe(start);
    expect(setWide(start, 'map', true)).toBe(start);
    expect(start).toEqual(defaultTiles());
  });
  test('a damaged or stale save never breaks Home', () => {
    const storage = (value: unknown) => ({ localGet: () => value as never, localSave: jest.fn() });
    expect(loadTiles(storage('nonsense'))).toEqual(defaultTiles());
    expect(loadTiles(storage({ order: 'map' }))).toEqual(defaultTiles());
    expect(loadTiles(storage({ order: ['weight', 'gone', 'weight', 'map'], wide: ['map', 'weight', 7], v: 2 }))).toEqual({ order: ['weight', 'map'], wide: ['weight'] });
    expect(loadTiles(storage({ order: [], v: 2 }))).toEqual({ order: [], wide: [] });
    // A layout saved before the Score existed gets it once, under the map; a newer save keeps it off.
    expect(loadTiles(storage({ order: ['weight', 'map', 'next'] })).order).toEqual(['weight', 'map', 'score', 'next']);
    expect(loadTiles(storage({ order: ['next'] })).order).toEqual(['score', 'next']);
    expect(loadTiles({ localGet: () => { throw new Error('locked'); }, localSave: jest.fn() })).toEqual(defaultTiles());
  });
});

test('Edit opens a sheet listing what is on Home, and Done closes it', async () => {
  seeded();
  await render(<Home />, { wrapper });
  expect(screen.queryByText('On Home')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
  expect(screen.getByRole('header', { name: 'Edit Home' })).toBeTruthy();
  for (const id of defaultTiles().order) expect(screen.getByTestId(`edit-on-${id}`)).toBeTruthy();
  expect(screen.getByText('Every tile is on Home.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Move up, Today map' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Move down, Weight' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByText('On Home')).toBeNull();
});

test('removing, adding and reordering change Home at once and are saved on the phone', async () => {
  const repo = seeded();
  await render(<Home />, { wrapper });
  expect(screen.getByTestId('home-map')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove, Today map' }));
  expect(screen.queryByTestId('home-map')).toBeNull();
  expect(screen.getByTestId('edit-off-map')).toBeTruthy();
  expect(repo.localGet(HOME_TILES_KEY)).toMatchObject({ order: ['score', 'week', 'next', 'calories', 'protein', 'volume', 'weight'], v: 2 });
  await fireEvent.press(screen.getByRole('button', { name: 'Add, Today map' }));
  expect(screen.getByTestId('home-map')).toBeTruthy();
  expect((repo.localGet(HOME_TILES_KEY) as { order: string[] }).order.at(-1)).toBe('map');
  await fireEvent.press(screen.getByRole('button', { name: 'Move up, Volume' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Move up, Volume' }));
  expect((repo.localGet(HOME_TILES_KEY) as { order: string[] }).order).toEqual(['score', 'week', 'next', 'volume', 'calories', 'protein', 'weight', 'map']);
  const shown = order().filter(id => id.startsWith('home-tile-'));
  expect(shown).toEqual(['home-tile-volume', 'home-tile-calories', 'home-tile-protein']);
});

test('a small tile can be made full width and back', async () => {
  const repo = seeded();
  await render(<Home />, { wrapper });
  expect(screen.getByTestId('home-tile-calories')).toHaveStyle({ width: '48.5%' });
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
  const toggle = screen.getByRole('switch', { name: 'Calories, full width' });
  expect(toggle).not.toBeChecked();
  await fireEvent.press(toggle);
  expect(screen.getByRole('switch', { name: 'Calories, full width' })).toBeChecked();
  expect(screen.getByTestId('home-tile-calories')).toHaveStyle({ width: '100%' });
  expect(repo.localGet(HOME_TILES_KEY)).toMatchObject({ wide: ['calories'] });
  expect(screen.queryByRole('switch', { name: 'Today map, full width' })).toBeNull();
  await fireEvent.press(screen.getByRole('switch', { name: 'Calories, full width' }));
  expect(screen.getByTestId('home-tile-calories')).toHaveStyle({ width: '48.5%' });
});

test('a saved layout is used on the next open', async () => {
  const repo = seeded();
  repo.localSave(HOME_TILES_KEY, { order: ['next', 'weight', 'calories'], wide: ['calories'], v: 2 });
  await render(<Home />, { wrapper });
  expect(screen.queryByTestId('home-map')).toBeNull();
  expect(screen.getByTestId('home-next')).toBeTruthy();
  expect(screen.getByTestId('home-tile-calories')).toHaveStyle({ width: '100%' });
  expect(screen.queryByTestId('home-tile-protein')).toBeNull();
  // Weight is on Home but has no weigh-ins in this sample, so it stays hidden rather than showing a zero.
  expect(screen.queryByTestId('home-tile-weight')).toBeNull();
});

test('with every tile removed Home says so and offers Edit', async () => {
  const repo = seeded();
  repo.localSave(HOME_TILES_KEY, { order: [], wide: [], v: 2 });
  await render(<Home />, { wrapper });
  expect(screen.getByText('Home is empty')).toBeTruthy();
  await fireEvent.press(within(screen.getByTestId('home-nothing-on')).getByRole('button', { name: 'Edit Home' }));
  expect(screen.getByText('Nothing on Home. Add a tile below.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add, What is next' }));
  expect(screen.getByTestId('home-next')).toBeTruthy();
});

describe('a new account, before anything is logged', () => {
  test('starts with the empty map, what is next and the tiles note', async () => {
    open();
    await render(<Home />, { wrapper });
    expect(screen.getByTestId('home-empty-map')).toBeTruthy();
    expect(screen.getByTestId('home-next')).toBeTruthy();
    expect(screen.getByText('Tiles')).toBeTruthy();
  });
  test('keeps only what the person left on Home, in their order', async () => {
    const repo = open();
    repo.localSave(HOME_TILES_KEY, { order: ['next'], wide: [], v: 2 });
    await render(<Home />, { wrapper });
    expect(screen.getByTestId('home-next')).toBeTruthy();
    expect(screen.queryByTestId('home-empty-map')).toBeNull();
    expect(screen.queryByText('Tiles')).toBeNull();
  });
  test('removing the map in Edit takes it off Home straight away', async () => {
    open();
    await render(<Home />, { wrapper });
    await fireEvent.press(screen.getByTestId('home-edit'));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove, Today map' }));
    expect(screen.queryByTestId('home-empty-map')).toBeNull();
    expect(screen.getByTestId('home-next')).toBeTruthy();
  });
  test('with every tile removed it says Home is empty, the same as an account with data', async () => {
    const repo = open();
    repo.localSave(HOME_TILES_KEY, { order: [], wide: [], v: 2 });
    await render(<Home />, { wrapper });
    expect(screen.getByTestId('home-nothing-on')).toBeTruthy();
    expect(screen.queryByTestId('home-next')).toBeNull();
  });
});
