import { fireEvent, render, screen } from '@testing-library/react-native';
import { useAuth } from '../src/auth/provider';
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
async function open(id: 'weight' | 'calories') {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  const storage = fakeStorage();
  tileStoreFor(storage, 'home').add(id, 'M', 'A');
  await render(<ThemeProvider><TileEditorSheet page="home" id={id} storage={storage} /></ThemeProvider>);
  return repo;
}

describe('Revert on a tile goal', () => {
  beforeEach(() => {
    resetTileStores(); tileEdit.end();
    configureTileRoutes({ tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() }); configureTileToast(() => {});
  });

  it('leaves a goal weight that was never set unset', async () => {
    const repo = await open('weight');
    expect(weightGoalKg(repo)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Raise goal weight'));
    expect(weightGoalKg(repo)).not.toBeNull();
    await fireEvent.press(screen.getByTestId('te-revert'));
    expect(weightGoalKg(repo)).toBeNull();
    expect(repo.list('goals')).toHaveLength(0);
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
