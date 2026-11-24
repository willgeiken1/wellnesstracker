import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Routines from '../src/app/(tabs)/routines';
import AddItemRoute from '../src/app/routines/add-item';
import EditRoutineRoute from '../src/app/routines/edit/[id]';
import RoutineItemRoute from '../src/app/routines/item';
import type { Repository } from '../src/data/repository';
import { routineRoutes } from '../src/features/routines-ui/entry-points';
import { routineLogId } from '../src/features/routines/model/ids';
import { projectRoutineStore } from '../src/features/routines/model/shape';
import { SAMPLE, SAMPLE_DAY, SAMPLE_NOW, logOf, seededRepository, stored, vialLog } from './routines-repository';

/* Each route file reads its own params and hands them to its screen. These draw the route files themselves,
   with the params a link would carry. Made-up routines only. */

let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setOptions: jest.fn(), setParams: jest.fn() }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
type Link = { pathname: string; params: Record<string, string> };
const paramsOf = (href: unknown) => (href as Link).params;
let repo: Repository;
function show(page: React.ReactElement, params: typeof mockParams, patch?: Parameters<typeof seededRepository>[0]) {
  mockParams = params;
  repo = seededRepository(patch);
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider>{page}</ThemeProvider>);
}
const shown = () => projectRoutineStore(stored(repo))!.blocks;
const checked = (role: 'radio' | 'checkbox', name: string) => screen.getByRole(role, { name }).props.accessibilityState.checked;

beforeEach(() => {
  mockParams = {};
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.mocked(router.push).mockClear(); jest.mocked(router.back).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the item route', () => {
  const past = routineLogId(SAMPLE.vial, '2026-11-21');
  const twoLogs = (store: { logs: unknown[] }) => { store.logs = [vialLog('2026-11-21', { amount: 1.5 }), vialLog(SAMPLE_DAY)]; };

  test('opens the log its logId names, and saves the edit on that log', async () => {
    await show(<RoutineItemRoute />, paramsOf(routineRoutes.item(SAMPLE.vial, past)), twoLogs);
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 21, 2026');
    expect(screen.getByTestId('log-amount').props.value).toBe('1.5');
    await fireEvent.changeText(screen.getByTestId('log-amount'), '2');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial, '2026-11-21')).toMatchObject({ amount: 2 });
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ amount: 3 });
  });
  test('with no logId it opens today\'s log', async () => {
    await show(<RoutineItemRoute />, paramsOf(routineRoutes.item(SAMPLE.vial)), twoLogs);
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 23, 2026');
    expect(screen.getByTestId('log-amount').props.value).toBe('3');
  });
});

describe('the edit routine route', () => {
  test('opens the routine its id names, and Save changes that routine without making a second', async () => {
    await show(<EditRoutineRoute />, paramsOf(routineRoutes.editRoutine(SAMPLE.night)));
    expect(screen.getByRole('header', { name: 'Edit routine' })).toBeTruthy();
    expect(screen.getByTestId('routine-name').props.value).toBe('Night routine');
    await fireEvent.changeText(screen.getByTestId('routine-name'), 'Late routine');
    await fireEvent.press(screen.getByTestId('routine-save'));
    expect(shown().map(row => [row.id, row.name])).toEqual([[SAMPLE.morning, 'Morning routine'], [SAMPLE.night, 'Late routine']]);
    expect(stored(repo).blocks).toHaveLength(2);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('the add item route', () => {
  test('Add item on a type tab carries that type, and the form opens with it picked', async () => {
    const tab = await show(<Routines />, {});
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
    await fireEvent.press(screen.getByTestId('routines-add'));
    expect(router.push).toHaveBeenCalledTimes(1);
    const link = jest.mocked(router.push).mock.calls[0][0] as unknown as Link;
    expect(link).toEqual({ pathname: '/routines/add-item', params: { type: 'peptide' } });
    await tab.unmount();

    await show(<AddItemRoute />, link.params);
    expect(screen.getByRole('header', { name: 'Add item' })).toBeTruthy();
    expect(checked('radio', 'Peptide')).toBe(true);
    // The type is enough: it is in no routine until one is picked.
    expect(checked('checkbox', 'Morning routine')).toBe(false);
    await fireEvent.changeText(screen.getByTestId('item-name'), 'Zzyq New Check');
    await fireEvent.press(screen.getByTestId('item-kind-check'));
    await fireEvent.press(screen.getByTestId('item-save'));
    expect(stored(repo).items.find(row => row.name === 'Zzyq New Check')).toMatchObject({ type: 'peptide' });
  });
  test('Add item on the day tab carries no type, and the form opens with none', async () => {
    const tab = await show(<Routines />, {});
    await fireEvent.press(screen.getByTestId('routines-add'));
    const link = jest.mocked(router.push).mock.calls[0][0] as unknown as Link;
    expect(link).toEqual({ pathname: '/routines/add-item', params: {} });
    await tab.unmount();
    await show(<AddItemRoute />, link.params);
    expect(checked('radio', 'Peptide')).toBe(false);
  });
  test('the route takes an item, a type or the converter step, and nothing else picks a routine', async () => {
    // The link to Add item has no routine in it, whatever it is handed.
    expect(routineRoutes.addItem({ type: 'peptide', blockId: SAMPLE.morning } as { type: string })).toEqual({ pathname: '/routines/add-item', params: { type: 'peptide' } });
    expect(routineRoutes.addItem()).toEqual({ pathname: '/routines/add-item', params: {} });
    // An old link that still carries one opens the plain form: no routine is picked for the new item.
    await show(<AddItemRoute />, { blockId: SAMPLE.morning });
    expect(checked('checkbox', 'Morning routine')).toBe(false);
    expect(checked('checkbox', 'Night routine')).toBe(false);
  });
  test('with an itemId it opens that item to edit', async () => {
    await show(<AddItemRoute />, paramsOf(routineRoutes.editItem(SAMPLE.stretch)));
    expect(screen.getByRole('header', { name: 'Edit item' })).toBeTruthy();
    expect(screen.getByTestId('item-name').props.value).toBe('Zzyq Stretch');
    expect(checked('checkbox', 'Morning routine')).toBe(true);
  });
});
