import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme, palettes } from '../src/design/tokens';
import { WorkoutStore } from '../src/data/workout/store';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Settings from '../src/app/settings/index';
import SettingsLayout from '../src/app/settings/_layout';
import Section from '../src/app/settings/[section]';
import { settingsGroups, settingsSections, searchSettings } from '../src/features/settings/sections';
import { ThemedSwitch, restClock } from '../src/features/settings/parts';
import { WorkoutSettings } from '../src/features/workout/settings';
import { RestOptions } from '../src/features/workout/rest-options';
import { FoodAiPrivacy } from '../src/features/food/ai/privacy';
import { aiState, setThumbnails } from '../src/features/food/ai/service';
import { Account as PhoneAccount } from '../src/phone-only/screens';
import { t } from '../src/i18n/en';

let mockSection = 'about';
let mockScreens: { name: string; options: Record<string, unknown> }[] = [];
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Screen = (props: { name: string; options: Record<string, unknown> }) => { mockScreens.push(props); return null; };
  return { Stack, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ section: mockSection }) };
});
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../src/phone-only/provider', () => ({ useAuth: () => mockPhoneAuth }));
jest.mock('../src/phone-only/export', () => ({ exportPhoneBackup: jest.fn(async () => {}) }));
let mockPhoneAuth: Partial<AuthState> = {};

const base = (): AuthState => ({ session: null, demo: false, ready: true, configured: true, configError: null, repository: null, pending: 0, conflicts: 0,
  syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });
const show = (ui: React.ReactNode, auth: AuthState = base()) =>
  render(<AuthContext.Provider value={auth}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);
beforeEach(() => { jest.clearAllMocks(); mockScreens = []; Constants.expoConfig!.extra!.phoneOnly = false; });

describe('Settings home', () => {
  test('shows search, the profile card and every destination in its group, with no Back to Home button', async () => {
    await show(<Settings />);
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByLabelText('Search settings')).toBeTruthy();
    expect(screen.getByTestId('settings-profile')).toBeTruthy();
    for (const title of ['You', 'App', 'Data & privacy', 'About']) expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(settingsSections.map(row => row.route)).toEqual(['account', 'profile', 'appearance', 'workout', 'score', 'health', 'notifications', 'privacy', 'data', 'about']);
    for (const row of settingsSections) expect(screen.getByRole('button', { name: t(row.label) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull();
  });
  test('every row opens its own page', async () => {
    await show(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Appearance' }));
    expect(router.push).toHaveBeenLastCalledWith('/settings/appearance');
    await fireEvent.press(screen.getByRole('button', { name: 'Account' }));
    expect(router.push).toHaveBeenLastCalledWith('/settings/account');
    for (const route of ['profile', 'workout', 'health', 'notifications', 'privacy', 'data', 'about'] as const) {
      await fireEvent.press(screen.getByTestId(`settings-row-${route}`));
      expect(router.push).toHaveBeenLastCalledWith({ pathname: '/settings/[section]', params: { section: route } });
    }
    await fireEvent.press(screen.getByTestId('settings-profile'));
    expect(router.push).toHaveBeenLastCalledWith('/settings/account');
  });
  test('search filters rows by label, also finds a setting by what it holds, and says when nothing matches', async () => {
    await show(<Settings />);
    await fireEvent.changeText(screen.getByLabelText('Search settings'), 'priv');
    expect(screen.getByRole('button', { name: 'Privacy' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull();
    expect(screen.queryByTestId('settings-profile')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search settings'), 'REST');
    expect(screen.getByRole('button', { name: 'Workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Privacy' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search settings'), 'zzzz');
    expect(screen.getByTestId('settings-no-match')).toHaveTextContent('No setting matches. Try "rest" or "units".');
    await fireEvent.changeText(screen.getByLabelText('Search settings'), '  ');
    expect(screen.getAllByRole('button').length).toBe(settingsSections.length + 1);
    expect(searchSettings('units', row => t(row.label)).flatMap(group => group.rows.map(row => row.route))).toEqual(['profile']);
    expect(settingsGroups.map(group => group.rows.length)).toEqual([2, 5, 2, 1]);
  });
  test('the profile card states only what is known', async () => {
    const signedIn = await show(<Settings />, { ...base(), session: { user: { id: 'fixture', email: 'fixture@example.test' } } as AuthState['session'], pending: 2 });
    expect(screen.getByTestId('settings-profile')).toHaveProp('accessibilityLabel', 'fixture@example.test, Changes waiting to sync');
    await signedIn.unmount();
    const phone = await show(<Settings />, { ...base(), phoneOnly: true });
    expect(screen.getByText('Saved on this phone')).toBeTruthy();
    expect(screen.getByText('No account or sync')).toBeTruthy();
    await phone.unmount();
    await show(<Settings />, { ...base(), demo: true });
    expect(screen.getByText('Example data')).toBeTruthy();
  });
  test('the appearance row shows the current theme name', async () => {
    await show(<Settings />);
    expect(screen.getByTestId('settings-row-appearance')).toHaveProp('accessibilityValue', { text: 'Sea Glass Tide' });
  });
});

describe('Settings stack', () => {
  test('the bar carries no second title, and Settings home gets a labelled back button that leaves Settings', async () => {
    await show(<SettingsLayout />);
    const index = mockScreens.find(item => item.name === 'index')!;
    expect(index.options.title).toBe('Settings');
    await show((index.options.headerLeft as () => React.ReactNode)());
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('Settings pages', () => {
  test.each([
    ['about', 'About'], ['licenses', 'Licenses'], ['notifications', 'Notifications'],
  ])('%s has one title and no Back to Settings button', async (section, title) => {
    mockSection = section;
    await show(<Section />);
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(mockScreens.at(-1)!.options.title).toBe(title);
    expect(screen.queryByRole('button', { name: 'Back to Settings' })).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
  test('About shows the version and opens Licenses', async () => {
    mockSection = 'about';
    await show(<Section />);
    expect(screen.getByText('1.0.0')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Licenses' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'licenses' } });
  });
  test('Health without Health access says so plainly', async () => {
    Constants.expoConfig!.extra!.phoneOnly = true;
    mockSection = 'health';
    await show(<Section />);
    expect(screen.getByTestId('settings-health-empty')).toHaveTextContent(/No data from Health yet/);
    expect(screen.queryByText(/build/i)).toBeNull();
  });
  test('Notifications states that there are no reminders', async () => {
    mockSection = 'notifications';
    await show(<Section />);
    expect(screen.getByTestId('settings-notifications-empty')).toHaveTextContent(/No reminders yet/);
  });
});

describe('Workout settings', () => {
  const open = async () => {
    const repo = memoryRepository();
    await show(<WorkoutSettings />, { ...base(), repository: repo });
    return repo;
  };
  test('one title, and the rest chips mark the chosen length', async () => {
    const repo = await open();
    expect(screen.getAllByRole('header', { name: 'Workout' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '90 seconds' })).toBeSelected();
    expect(screen.getByRole('button', { name: '60 seconds' })).not.toBeSelected();
    expect(screen.getByText('1:30')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '120 seconds' }));
    expect(screen.getByRole('button', { name: '120 seconds' })).toBeSelected();
    expect(screen.getByRole('button', { name: '90 seconds' })).not.toBeSelected();
    expect(repo.list('settings').at(-1)?.data.rest_seconds).toBe(120);
  });
  test('the other choices mark what is chosen too, in the accent colour', async () => {
    await open();
    const colors = (['light', 'dark'] as const).map(mode => createTheme(mode));
    const fill = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;
    expect(screen.getByRole('button', { name: 'Bar' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Unwind' })).toBeSelected();
    expect(colors.map(theme => theme.accent)).toContain(fill('Unwind'));
    expect(colors.map(theme => theme['surface-2'])).toContain(fill('Converge'));
    await fireEvent.press(screen.getByRole('button', { name: 'Converge' }));
    expect(screen.getByRole('button', { name: 'Converge' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Unwind' })).not.toBeSelected();
    expect(colors.map(theme => theme.accent)).toContain(fill('Converge'));
    // The long summary choices are a list with a check on the chosen one.
    expect(screen.getAllByTestId('chip-selected-mark')).toHaveLength(1);
  });
  test('summary length keeps working from Settings and stays on this phone', async () => {
    const repo = await open(), save = jest.spyOn(repo, 'save');
    expect(screen.getByRole('button', { name: t('workoutAiCoach') })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: t('workoutAiShort') }));
    expect(repo.localGet('workoutAiLength')).toBe('short');
    expect(screen.getByRole('button', { name: t('workoutAiShort') })).toBeSelected();
    expect(save).not.toHaveBeenCalled();
  });
  test('there is one plate Save', async () => {
    await open();
    expect(screen.getAllByRole('button', { name: /Save plates/ })).toHaveLength(1);
  });
  test('without local data it says so under the same single title', async () => {
    await show(<WorkoutSettings />);
    expect(screen.getByRole('header', { name: 'Workout' })).toBeTruthy();
    expect(screen.getByText('Local data is unavailable. Please restart the app.')).toBeTruthy();
  });
});

test('exercise rest chips mark the chosen length and style and report a change', async () => {
  const change = jest.fn();
  await show(<RestOptions value={{ seconds: 120, style: 'converge' }} onChange={change} />);
  expect(screen.getByRole('button', { name: '120 seconds' })).toBeSelected();
  expect(screen.getByRole('button', { name: '30 seconds' })).not.toBeSelected();
  expect(screen.getByRole('button', { name: 'Converge' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: '180 seconds' }));
  expect(change).toHaveBeenCalledWith({ seconds: 180, style: 'converge' });
  expect([30, 60, 90, 180].map(restClock)).toEqual(['0:30', '1:00', '1:30', '3:00']);
});

describe('Switches', () => {
  test('use theme colours for track and thumb', async () => {
    await show(<><ThemedSwitch label="Off" value={false} onValueChange={() => {}} /><ThemedSwitch label="On" value onValueChange={() => {}} /></>);
    const off = screen.getByRole('switch', { name: 'Off' }), on = screen.getByRole('switch', { name: 'On' });
    const colors = (['light', 'dark'] as const).map(mode => createTheme(mode)).find(theme => theme['text-muted'] === off.props.tintColor)!;
    expect(colors).toBeTruthy();
    expect(off.props).toMatchObject({ tintColor: colors['text-muted'], onTintColor: colors.accent, thumbTintColor: colors.surface, value: false });
    expect(on.props).toMatchObject({ onTintColor: colors.accent, thumbTintColor: colors['on-accent'], value: true });
  });
  test('the off track and its thumb stand out on every theme, light and dark', () => {
    const channel = (hex: string, at: number) => { const v = parseInt(hex.slice(at, at + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const light = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const contrast = (a: string, b: string) => { const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    for (const palette of palettes) for (const mode of ['light', 'dark'] as const) {
      const colors = createTheme(mode, palette);
      // 3:1 is the bar for a control's shape against what is around it.
      expect(contrast(colors['text-muted'], colors.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(colors['on-accent'], colors.accent)).toBeGreaterThanOrEqual(3);
    }
  });
  test('privacy toggles are system switches that store exactly what they stored before', async () => {
    const repo = memoryRepository();
    await show(<FoodAiPrivacy repo={repo} />);
    const thumbs = screen.getByRole('switch', { name: 'Keep meal thumbnails on this phone' });
    const before = aiState(repo).thumbnails;
    await fireEvent(thumbs, 'valueChange', !before);
    const expected = memoryRepository(); setThumbnails(expected, !before);
    expect(aiState(repo).thumbnails).toBe(aiState(expected).thumbnails);
    // Turning AI on still asks first: nothing is stored until the person agrees.
    await fireEvent(screen.getByRole('switch', { name: 'Allow meal estimates and workout summaries to be sent to Anthropic' }), 'valueChange', true);
    expect(aiState(repo).consent).toBe(false);
    expect(screen.getByRole('button', { name: 'Allow AI estimates and summaries' })).toBeTruthy();
  });
});

describe('Account on a phone without sync', () => {
  test('uses plain words and one backup action that still exports', async () => {
    const { exportPhoneBackup } = require('../src/phone-only/export') as typeof import('../src/phone-only/export');
    const repository = memoryRepository();
    mockPhoneAuth = { ...base(), phoneOnly: true, repository };
    await render(<ThemeProvider><PhoneAccount /></ThemeProvider>);
    expect(screen.getByRole('header', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('Back up your data')).toBeTruthy();
    expect(screen.queryByText(/JSON|build|push/i)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportPhoneBackup).toHaveBeenCalledWith(repository);
    await fireEvent.press(screen.getByRole('button', { name: 'Look around first' }));
    expect(mockPhoneAuth.lookAround).toHaveBeenCalled();
  });
  test('example data offers the way back to the real log', async () => {
    mockPhoneAuth = { ...base(), phoneOnly: true, demo: true };
    await render(<ThemeProvider><PhoneAccount /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Return to my log' }));
    expect(mockPhoneAuth.signOut).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Export backup' })).toBeNull();
  });
});
