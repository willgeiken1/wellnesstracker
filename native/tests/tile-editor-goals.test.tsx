import { fireEvent, render, screen } from '@testing-library/react-native';
import { useAuth } from '../src/auth/provider';
import { attributedDay } from '../src/features/food/model';
import { pickFoodDay, resetFoodDay } from '../src/features/food/selection';
import { ThemeProvider } from '../src/design/theme-provider';
import { readStoredGoals, saveGoalWeight, weightGoalKg } from '../src/features/settings/goals-data';
import { configureTileRoutes, configureTileToast, resetTileStores, tileEdit, tileStoreFor, type TileStorage } from '../src/features/tiles';
import { TileEditorSheet } from '../src/features/tiles/editor/editor-sheet';
import { memoryRepository } from './workout-repository';

// Made-up goals only. Reanimated, gesture-handler and the Skia tile surface use the shared stand-ins from tests/setup.ts.
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));

function fakeStorage(): TileStorage {
  const data: Record<string, unknown> = {};
  return { owner: 'goals-owner', localGet: <T,>(k: string) => data[k] as T | undefined, localSave: (k: string, v: unknown) => { data[k] = v; } } as TileStorage;
}
async function open(id: string, page: 'home' | 'food' | 'progress' = 'home', options?: Record<string, string>) {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  const storage = fakeStorage();
  tileStoreFor(storage, page).add(id, 'M', 'A', options);
  await render(<ThemeProvider><TileEditorSheet page={page} id={id} storage={storage} /></ThemeProvider>);
  return repo;
}

describe('Revert on a tile goal', () => {
  beforeEach(() => {
    resetTileStores(); tileEdit.end();
    configureTileRoutes({ tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() }); configureTileToast(() => {});
  });
  afterEach(() => { resetFoodDay(); });

  it('leaves a goal weight that was never set unset', async () => {
    const repo = await open('weight');
    expect(weightGoalKg(repo)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Raise goal weight'));
    expect(weightGoalKg(repo)).not.toBeNull();
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(weightGoalKg(repo)).toBeNull();
    expect(repo.list('goals')).toHaveLength(0);
  });

  it('keeps Revert available when a new goal weight is stepped back to the number it showed', async () => {
    const repo = await open('weight');
    await fireEvent.press(screen.getByLabelText('Raise goal weight'));
    await fireEvent.press(screen.getByLabelText('Lower goal weight'));
    expect(repo.list('goals')).toHaveLength(1);
    expect(screen.getByTestId('te-revert').props.accessibilityElementsHidden).toBe(false);
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(repo.list('goals')).toHaveLength(0);
    expect(screen.getByTestId('te-revert', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('hides Revert again when a goal that was set is stepped back to the same value', async () => {
    const repo = memoryRepository();
    saveGoalWeight(repo, 176, 'lb');
    jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
    const storage = fakeStorage();
    tileStoreFor(storage, 'home').add('weight', 'M', 'A');
    await render(<ThemeProvider><TileEditorSheet page="home" id="weight" storage={storage} /></ThemeProvider>);
    await fireEvent.press(screen.getByLabelText('Raise goal weight'));
    await fireEvent.press(screen.getByLabelText('Lower goal weight'));
    expect(screen.getByTestId('te-revert', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('puts a goal weight that was set back as it was typed', async () => {
    const repo = memoryRepository();
    saveGoalWeight(repo, 80, 'kg');
    jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
    const storage = fakeStorage();
    tileStoreFor(storage, 'home').add('weight', 'M', 'A');
    await render(<ThemeProvider><TileEditorSheet page="home" id="weight" storage={storage} /></ThemeProvider>);
    await fireEvent.press(screen.getByLabelText('Raise goal weight'));
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(repo.list('goals').map(r => r.data)).toEqual([{ kind: 'weight', target_value: 80, target_unit: 'kg', target_day: null }]);
  });

  it('leaves food targets that were never set as they were', async () => {
    const repo = await open('calories');
    const before = readStoredGoals(repo);
    expect(before.food).toBeNull();
    await fireEvent.press(screen.getByLabelText('Raise daily calories'));
    expect(repo.list('food_targets')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(repo.list('food_targets')).toHaveLength(0);
    expect(readStoredGoals(repo)).toEqual(before);
  });
});

describe('which goal a tile edits', () => {
  beforeEach(() => {
    resetTileStores(); tileEdit.end();
    configureTileRoutes({ tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() }); configureTileToast(() => {});
  });
  afterEach(() => { resetFoodDay(); });

  it('offers the goal that Progress\'s Goal tile is showing', async () => {
    await open('goal', 'progress', { goal: 'sleep' });
    expect(screen.getByLabelText('Raise sleep goal')).toBeTruthy();
    expect(screen.queryByLabelText('Raise goal weight')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Weight' }));
    expect(screen.getByLabelText('Raise goal weight')).toBeTruthy();
  });

  it('offers no goal while it shows the training plan', async () => {
    await open('goal', 'progress', { goal: 'plan' });
    expect(screen.queryByLabelText('Raise goal weight')).toBeNull();
    expect(screen.queryByLabelText('Raise sleep goal')).toBeNull();
  });

  it('changes the targets of the day Food is showing, and Revert puts that day back', async () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = attributedDay(d);
    pickFoodDay(yesterday);
    const repo = await open('cal', 'food');
    await fireEvent.press(screen.getByLabelText('Raise daily calories'));
    expect(repo.list('food_targets').map(r => r.data.day)).toEqual([yesterday]);
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(repo.list('food_targets')).toHaveLength(0);
  });
});
