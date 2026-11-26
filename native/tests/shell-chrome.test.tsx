import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, Text } from 'react-native';
import { router } from 'expo-router';
import { impactAsync } from 'expo-haptics';
import { ThemeProvider } from '../src/design/theme-provider';
import { ShellChrome } from '../src/features/shell/shell';
import { TabBarSheet } from '../src/features/shell/tab-bar-sheet';
import { ProfileButton } from '../src/features/shell/profile-button';
import { SHELL_PREFS_KEY, resetMemoryPrefs } from '../src/features/shell/prefs';
import { setQuickActions, useQuickActions, useShellEditMode } from '../src/features/shell/registry';
import { PAGES, type PageKey } from '../src/features/shell/pages';
import Routines from '../src/app/(tabs)/routines';
import InsightsRoute from '../src/app/(tabs)/insights';
import { memoryRepository } from './workout-repository';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined), impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text: Host } = require('react-native');
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() }, useIsFocused: () => true,
    Redirect: ({ href }: { href: string }) => React.createElement(Host, { testID: 'redirect' }, href),
  };
});
let mockRepo: ReturnType<typeof memoryRepository> | null = null;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: mockRepo }) }));

/** The shell over one tab page, with the tab bar's own page switching standing in for the navigator. */
function Harness({ start = 'index', children }: { start?: string; children?: React.ReactNode }) {
  const [route, setRoute] = useState(start);
  return <ThemeProvider>
    <Text testID="route">{route}</Text>
    {children}
    <ShellChrome route={route} goTo={(page: PageKey) => setRoute(PAGES.find(p => p.key === page)!.route)} />
  </ThemeProvider>;
}
const plus = () => screen.getByTestId('dock-plus');
const tab = (name: string) => screen.getByRole('tab', { name });
beforeEach(() => {
  mockRepo = memoryRepository();
  resetMemoryPrefs();
  (router.push as jest.Mock).mockClear();
  (impactAsync as jest.Mock).mockClear();
  for (const page of PAGES) setQuickActions(page.key, null);
});

describe('the + button and its quick actions', () => {
  test('the + names the page it acts for, opens the page\'s four actions, and closes again', async () => {
    await render(<Harness />);
    expect(plus().props.accessibilityLabel).toBe('Home quick actions');
    await fireEvent.press(plus());
    expect(plus().props.accessibilityLabel).toBe('Close quick actions');
    expect(plus().props.accessibilityState.expanded).toBe(true);
    expect(screen.getAllByRole('menuitem').map(item => item.props.testID)).toEqual(['fan-customize', 'fan-edit', 'fan-add', 'fan-water', 'fan-meal']);
    expect(screen.getByTestId('fan-water').props.accessibilityLabel).toBe('Log water, Today');
    await fireEvent.press(plus());
    expect(plus().props.accessibilityState.expanded).toBe(false);
  });
  test('an action runs the page\'s own handler, with the page\'s live name and hint', async () => {
    const run = jest.fn();
    setQuickActions('home', { water: { run, label: 'Log water', hint: '1.2 of 2.5 L today' } });
    await render(<Harness />);
    await fireEvent.press(plus());
    expect(screen.getByTestId('fan-water').props.accessibilityLabel).toBe('Log water, 1.2 of 2.5 L today');
    await fireEvent.press(screen.getByTestId('fan-water'));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(plus().props.accessibilityState.expanded).toBe(false);
  });
  test('with no handler, an action opens its default page, or says plainly that it is not here yet', async () => {
    await render(<Harness />);
    await fireEvent.press(plus());
    await fireEvent.press(screen.getByTestId('fan-meal'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/food/log'));
    await fireEvent.press(plus());
    await fireEvent.press(screen.getByTestId('fan-add'));
    await waitFor(() => expect(screen.getByText('This isn’t available yet')).toBeTruthy());
  });
  test('each page has its own actions, and switching tabs closes the open ones', async () => {
    await render(<Harness />);
    await fireEvent.press(plus());
    await fireEvent.press(tab('Training'));
    expect(screen.getByTestId('route')).toHaveTextContent('workouts');
    expect(plus().props.accessibilityLabel).toBe('Training quick actions');
    await fireEvent.press(plus());
    expect(screen.getByTestId('fan-start')).toBeTruthy();
    expect(screen.getByTestId('fan-cardio')).toBeTruthy();
    expect(screen.queryByTestId('fan-water')).toBeNull();
  });
  test('a page registers its handlers while it is mounted, and they leave with it', async () => {
    const run = jest.fn();
    function Page() { useQuickActions('home', { edit: { run } }); return null; }
    function Toggle() { const [on, setOn] = useState(true); return <><Text accessibilityRole="button" onPress={() => setOn(false)}>Leave</Text>{on && <Page />}</>; }
    await render(<Harness><Toggle /></Harness>);
    await fireEvent.press(plus());
    await fireEvent.press(screen.getByTestId('fan-edit'));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('Leave'));
    await fireEvent.press(plus());
    await fireEvent.press(screen.getByTestId('fan-edit'));
    await waitFor(() => expect(screen.getByText('This isn’t available yet')).toBeTruthy());
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('edit mode', () => {
  test('while a page edits, the + is its Done button and touch and hold on the bar is off', async () => {
    const done = jest.fn();
    function Page() { const [editing, setEditing] = useState(true); useShellEditMode('home', editing, () => { done(); setEditing(false); }); return null; }
    await render(<Harness><Page /></Harness>);
    expect(plus().props.accessibilityLabel).toBe('Done editing tiles');
    expect(tab('Home').props.onLongPress).toBeUndefined();
    await fireEvent.press(plus());
    expect(done).toHaveBeenCalledTimes(1);
    expect(plus().props.accessibilityLabel).toBe('Home quick actions');
    expect(screen.queryByTestId('fan-edit')).toBeNull();
  });
  test('edit mode on another page leaves this page\'s + alone', async () => {
    function Page() { useShellEditMode('food', true, () => {}); return null; }
    await render(<Harness><Page /></Harness>);
    expect(plus().props.accessibilityLabel).toBe('Home quick actions');
  });
});

describe('Customize', () => {
  test('turning actions on and off keeps one at least and five at most, and Done saves them in the order turned on', async () => {
    await render(<Harness />);
    await fireEvent.press(plus());
    await fireEvent.press(screen.getByTestId('fan-customize'));
    expect(screen.getByTestId('customize-sheet')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Show Start next workout'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Show Log weight'), 'valueChange', true);
    expect(screen.getByText('Five is the most that fit')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Show Edit tiles'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRepo!.localGet(SHELL_PREFS_KEY)).toEqual({ hidden: {}, actions: { home: ['add', 'water', 'meal', 'start'] } });
    // Done brings the actions back up, in the new order.
    await waitFor(() => expect(plus().props.accessibilityState.expanded).toBe(true));
    expect(screen.getAllByRole('menuitem').map(item => item.props.testID).slice(1)).toEqual(['fan-add', 'fan-water', 'fan-meal', 'fan-start']);
  });
  test('the last action cannot be turned off, and Reset to default brings the four back', async () => {
    mockRepo!.localSave(SHELL_PREFS_KEY, { actions: { home: ['water'] } });
    await render(<Harness />);
    await fireEvent.press(plus());
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('fan-customize'));
    await fireEvent(screen.getByLabelText('Show Log water'), 'valueChange', false);
    expect(screen.getByText('Keep at least one action')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reset to default' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRepo!.localGet(SHELL_PREFS_KEY)).toEqual({ hidden: {}, actions: { home: ['edit', 'add', 'water', 'meal'] } });
  });
});

describe('choosing the tabs on the bar', () => {
  test('touch and hold the bar opens the Tab bar sheet, with a light buzz', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    await render(<Harness start="food" />);
    await fireEvent(tab('Food'), 'longPress');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/tab-bar', params: { from: 'food' } });
    expect(impactAsync).toHaveBeenCalledWith('light');
  });
  test('a tab turned off in the sheet leaves the bar and stays off, and Home has no switch', async () => {
    const view = await render(<ThemeProvider><TabBarSheet current="home" onDone={() => {}} onOpen={() => {}} /></ThemeProvider>);
    expect(screen.queryByLabelText('Show Home on the bar')).toBeNull();
    expect(screen.getByText('Always on the bar')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Show Routines on the bar'), 'valueChange', false);
    expect(mockRepo!.localGet(SHELL_PREFS_KEY)).toEqual({ hidden: { routines: true }, actions: {} });
    expect(screen.getByRole('button', { name: 'Open Routines' })).toBeTruthy();
    await view.unmount();
    // Drawn again from what was saved: Routines is gone from the bar, the other four stay.
    await render(<Harness />);
    expect(screen.getAllByRole('tab').map(node => node.props.accessibilityLabel)).toEqual(['Home', 'Training', 'Food', 'Progress']);
  });
  test('a hidden page opens from the sheet, and shows on the bar while it is open', async () => {
    mockRepo!.localSave(SHELL_PREFS_KEY, { hidden: { food: true } });
    const open = jest.fn();
    const view = await render(<ThemeProvider><TabBarSheet current="food" onDone={() => {}} onOpen={open} /></ThemeProvider>);
    expect(screen.getByText('Hidden, open now')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Food' }));
    expect(open).toHaveBeenCalledWith('food');
    await view.unmount();
    await render(<Harness start="food" />);
    expect(tab('Food').props.accessibilityState.selected).toBe(true);
  });
});

describe('the frame around the pages', () => {
  test('the profile avatar is a labelled button that opens Settings', async () => {
    await render(<ThemeProvider><ProfileButton name="Sample" /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
    expect(screen.getByText('S')).toBeTruthy();
  });
  // The Routines page replaced the placeholder: it draws under the shell, its + is its own, and Add item opens the add sheet.
  test('Routines is a tab with its own page, + actions and Add item', async () => {
    await render(<Harness start="routines"><Routines /></Harness>);
    expect(screen.getByTestId('routines-tab')).toBeTruthy();
    expect(plus().props.accessibilityLabel).toBe('Routines quick actions');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Add item' })[0]);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/routines/add', params: {} });
  });
  test('Routines without an account says how to see it, calmly', async () => {
    mockRepo = null;
    await render(<Harness start="routines"><Routines /></Harness>);
    expect(screen.getByText('Sign in or look around first to see your routines.')).toBeTruthy();
  });
  test('the old Insights address goes to Progress', async () => {
    await render(<InsightsRoute />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/progress');
  });
});
