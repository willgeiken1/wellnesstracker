import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { showToast } from '../src/features/shell/toast';
import { addDays, clock, demoState, nowOf, rById, type RoutinesState } from '../src/features/routines/model';
import { createRoutinesStore, refreshNow, type RoutinesStore } from '../src/features/routines/store';
import { RoutineDetail, RoutineHistory, RoutinesReorder } from '../src/features/routines/screens';
import { AddItem, Converter, NewRoutine, PauseRoutine } from '../src/features/routines/sheets';
import { setNotifierForTests } from '../src/features/reminders/notifier';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }), useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

/* The Routines screens and sheets, drawn against the sample routines at 4:12 PM on Sunday, November 22. */

const realNow = clock.now;
beforeAll(() => { clock.now = () => new Date(2026, 10, 22, 16, 12); refreshNow(); });
afterAll(() => { clock.now = realNow; });
beforeEach(() => { jest.clearAllMocks(); });

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function demoStore(): RoutinesStore {
  let stored: unknown;
  return createRoutinesStore({ get: () => stored, save: (s: RoutinesState) => { stored = JSON.parse(JSON.stringify(s)); }, seed: () => demoState() });
}

describe('routine detail', () => {
  // A build with notifications, so Remind me is a live switch.
  beforeEach(() => { setNotifierForTests({ permission: async () => 'granted', request: async () => 'granted', replace: async () => {} }); });
  afterEach(() => { setNotifierForTests(null); });
  it('shows the routine, its items for today and its settings', async () => {
    await render(<RoutineDetail store={demoStore()} rid="night" />, { wrapper });
    expect(screen.getByText('Night')).toBeTruthy();
    expect(screen.getByText('From 9:30 PM · Every day · 5 items')).toBeTruthy();
    for (const name of ['Magnesium glycinate', 'Glycine', 'Read', 'Screens off', 'Peptide B']) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText('M W F, not today')).toBeTruthy();
    for (const label of ['Add item to Night', 'Remind me', 'Pause for travel or a break', 'Last 30 days, item by item']) expect(screen.getByText(label)).toBeTruthy();
  });

  it('turns reminders off from its settings and says so', async () => {
    const store = demoStore();
    await render(<RoutineDetail store={store} rid="night" />, { wrapper });
    await act(async () => { fireEvent(screen.getByRole('switch'), 'valueChange', false); });
    expect(rById(store.read(), 'night')!.remind).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Night reminders off', expect.anything());
  });
});

describe('Remind me in a build without notifications', () => {
  it('shows as coming in a later version, not a switch that sits on with nothing arriving', async () => {
    await render(<RoutineDetail store={demoStore()} rid="night" />, { wrapper });
    expect(screen.getByText('Comes in a later version')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  });
});

describe('pause routine', () => {
  it('pauses the chosen routine for a week, with an undo', async () => {
    const store = demoStore();
    await render(<PauseRoutine store={store} routine="night" />, { wrapper });
    expect(screen.getByText('Going away or taking a break? Pause a routine and it waits for you. Paused days don’t count against your streak.')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('routines-pause-go')); });
    const back = addDays(nowOf().day, 7);
    expect(rById(store.read(), 'night')!.pauses).toEqual([{ from: nowOf().day, until: back, why: 'Travel' }]);
    expect(showToast).toHaveBeenCalledWith('Night paused until Sun, Nov 29', expect.objectContaining({ action: expect.anything() }));
  });
});

describe('new routine', () => {
  it('asks for a name first, then saves the routine', async () => {
    const store = demoStore();
    await render(<NewRoutine store={store} />, { wrapper });
    expect(screen.getByText('3:00 PM')).toBeTruthy();
    expect(screen.getByText('5:00 PM')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('routines-new-save')); });
    expect(showToast).toHaveBeenCalledWith('Add a name.', expect.objectContaining({ color: 'warning' }));
    expect(store.read().routines).toHaveLength(3);
    await act(async () => { fireEvent.changeText(screen.getByTestId('routines-new-name'), 'Afternoon'); });
    await act(async () => { fireEvent.press(screen.getByTestId('routines-new-save')); });
    const added = store.read().routines[3];
    expect(added).toMatchObject({ name: 'Afternoon', from: 15, to: 17, days: [1, 2, 3, 4, 5], color: 'food' });
    expect(showToast).toHaveBeenCalledWith('Afternoon saved', expect.anything());
  });
});

describe('add item', () => {
  it('needs an amount and a unit for a dose, then adds the item with an undo', async () => {
    const store = demoStore();
    await render(<AddItem store={store} type="Supplement" routine="night" />, { wrapper });
    await act(async () => { fireEvent.changeText(screen.getByTestId('routines-add-name'), 'Zinc'); });
    await act(async () => { fireEvent.press(screen.getByTestId('routines-add-save')); });
    expect(showToast).toHaveBeenCalledWith('Add a name, an amount, and a unit.', expect.objectContaining({ color: 'warning' }));
    await act(async () => { fireEvent.changeText(screen.getByTestId('routines-add-amount'), '15'); });
    await act(async () => { fireEvent.press(screen.getByLabelText('mg')); });
    expect(screen.getByText('Logs 15 mg each time.')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('routines-add-save')); });
    expect(store.read().items.find(i => i.name === 'Zinc')).toMatchObject({ dose: '15 mg', type: 'Supplement', routines: ['night'] });
    expect(showToast).toHaveBeenCalledWith('Item added.', expect.objectContaining({ action: expect.anything() }));
  });
});

describe('add item, on hand', () => {
  it('takes at most 99,999 on hand, in the field and when it saves', async () => {
    const store = demoStore();
    await render(<AddItem store={store} />, { wrapper });
    const hand = screen.getByLabelText('On hand, optional');
    expect(hand.props.maxLength).toBe(5);
    await act(async () => { fireEvent.changeText(hand, '1234567'); });
    expect(screen.getByLabelText('On hand, optional').props.value).toBe('99999');
    await act(async () => { fireEvent.changeText(screen.getByLabelText('On hand, optional'), '12a0'); });
    expect(screen.getByLabelText('On hand, optional').props.value).toBe('120');
    await act(async () => { fireEvent.changeText(screen.getByLabelText('On hand, optional'), '99999'); });
    await act(async () => { fireEvent.changeText(screen.getByTestId('routines-add-name'), 'Journal'); });
    await act(async () => { fireEvent.press(screen.getByTestId('routines-add-save')); });
    expect(store.read().items.find(i => i.name === 'Journal')).toMatchObject({ left: 99999 });
  });
});

describe('unit converter', () => {
  it('converts what was typed and says it is not a recommendation', async () => {
    await render(<Converter />, { wrapper });
    expect(screen.getByText('This converts units only. It is not a recommendation.')).toBeTruthy();
    expect(screen.getByText('1 mcg = 0.001 mg')).toBeTruthy();
    expect(screen.getByText('250 mcg ÷ 1,000 = 0.25 mg')).toBeTruthy();
    expect(screen.getByText('Copy result')).toBeTruthy();
  });
});

describe('edit routines', () => {
  it('lists the routines in order and brings a hidden one back', async () => {
    const store = demoStore();
    await render(<RoutinesReorder store={store} />, { wrapper });
    expect(screen.getByText('Drag to reorder. Routines show on the tab in this order.')).toBeTruthy();
    expect(screen.getByText('Supplement & enhancer stack')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText('Restore')); });
    expect(store.read().routines.map(r => r.id)).toEqual(['morning', 'midday', 'night', 'stack']);
    expect(showToast).toHaveBeenCalledWith('Supplement & enhancer stack is back', expect.objectContaining({ action: expect.anything() }));
  });

  it('moves a routine with the accessibility actions', async () => {
    const store = demoStore();
    await render(<RoutinesReorder store={store} />, { wrapper });
    await act(async () => { fireEvent(screen.getByLabelText('Reorder Morning. Swipe up or down to move it.'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }); });
    expect(store.read().routines.map(r => r.id)).toEqual(['midday', 'morning', 'night']);
    expect(showToast).toHaveBeenCalledWith('Morning moved to place 2', expect.anything());
  });
});

describe('routine history', () => {
  it('shows the last 30 days and every item', async () => {
    await render(<RoutineHistory store={demoStore()} initial="all" />, { wrapper });
    expect(screen.getByText('Last 30 days')).toBeTruthy();
    expect(screen.getByText('By item')).toBeTruthy();
    expect(screen.getByText('12 items')).toBeTruthy();
    expect(screen.getByText('Tap a day to read it.')).toBeTruthy();
  });
});

describe('routines tab', () => {
  it('draws the tab for the demo account', async () => {
    jest.mocked(useAuth).mockReturnValue({ repository: memoryRepository(), demo: true } as unknown as ReturnType<typeof useAuth>);
    const Routines = require('../src/app/(tabs)/routines').default as () => React.ReactElement;
    await render(<Routines />, { wrapper });
    expect(screen.getByTestId('routines-tab')).toBeTruthy();
    for (const tab of ['Supplements', 'Peptides', 'Medications']) expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    expect(router.push).not.toHaveBeenCalled();
  });
});
