// These tests cover the AI features, which stay in the code for a later update; the launch build hides them.
jest.mock('../src/features/ai-launch', () => ({ AI_FEATURES_ENABLED: true }));
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { DEFAULT_PALETTE, createTheme, paletteName, palettes } from '../src/design/tokens';
import { WorkoutStore } from '../src/data/workout/store';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Settings from '../src/app/settings/index';
import SettingsLayout from '../src/app/settings/_layout';
import Section from '../src/app/settings/[section]';
import { GROUPS, SECTION_IDS, searchSettings } from '../src/features/settings/sections';
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
const mockBrowser = jest.fn(async (_url: string) => ({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockBrowser(url) }));
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
  test('shows the large title, search, the profile card and the four groups of sections in the mockup order', async () => {
    await show(<Settings />);
    expect(screen.getAllByRole('header', { name: 'Settings' }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Search settings')).toBeTruthy();
    expect(screen.getByTestId('settings-profile')).toBeTruthy();
    expect(GROUPS.map(group => group.length)).toEqual([2, 3, 3, 2]);
    for (const id of SECTION_IDS) expect(screen.getByTestId(`settings-row-${id}`)).toBeTruthy();
    expect(screen.queryByText(/Plus|Upgrade|Subscribe/)).toBeNull();
  });
  test('every row opens its own page, Appearance on its own route', async () => {
    await show(<Settings />);
    await fireEvent.press(screen.getByTestId('settings-row-appearance'));
    expect(router.push).toHaveBeenLastCalledWith('/settings/appearance');
    for (const id of SECTION_IDS.filter(id => id !== 'appearance')) {
      await fireEvent.press(screen.getByTestId(`settings-row-${id}`));
      expect(router.push).toHaveBeenLastCalledWith({ pathname: '/settings/[section]', params: { section: id } });
    }
    await fireEvent.press(screen.getByTestId('settings-profile'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/settings/[section]', params: { section: 'account' } });
  });
  test('search finds sections and single settings, and says when nothing matches', async () => {
    await show(<Settings />);
    await fireEvent.changeText(screen.getByLabelText('Search settings'), 'rest');
    expect(screen.getAllByText('Default rest').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('settings-profile')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search settings'), 'zzzz');
    expect(screen.getByText('No settings match “zzzz”')).toBeTruthy();
    expect(screen.getByText('Try a word like theme, Oura, rest or export.')).toBeTruthy();
    expect(searchSettings('oura').map(hit => hit.section)).toContain('connections');
    expect(searchSettings('x'.repeat(3))).toEqual([]);
    expect(searchSettings('e').length).toBeLessThanOrEqual(14);
  });
  test('the profile card states only what is known', async () => {
    const phone = await show(<Settings />, { ...base(), phoneOnly: true });
    expect(screen.getAllByText(/Saved on this phone|No account or sync/).length).toBeGreaterThan(0);
    await phone.unmount();
    await show(<Settings />, { ...base(), demo: true });
    expect(screen.getAllByText(/Example data|Nothing here is saved/).length).toBeGreaterThan(0);
  });
});

describe('Settings stack', () => {
  test('every screen draws its own bar and keeps a title for VoiceOver', async () => {
    await show(<SettingsLayout />);
    const index = mockScreens.find(item => item.name === 'index')!;
    expect(index.options.title).toBe('Settings');
    expect(mockScreens.every(item => item.name !== 'index' || item.options.title)).toBe(true);
  });
});

describe('Settings pages', () => {
  test.each([
    ['goals', 'Goals and targets'], ['connections', 'Connections'], ['account', 'Account and sync'], ['reminders', 'Reminders'],
    ['privacy', 'Privacy and security'], ['units', 'Units and formats'], ['workout', 'Workout settings'], ['data', 'Your data'], ['about', 'About'],
    ['privacy-center', 'Privacy center'], ['delete-account', 'Delete account'],
  ])('%s opens with its own bar title', async (section, title) => {
    mockSection = section;
    await show(<Section />, { ...base(), repository: memoryRepository() });
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Plus|Upgrade|Coming soon/)).toBeNull();
  });
  test('About shows the version and opens Acknowledgements', async () => {
    mockSection = 'about';
    await show(<Section />);
    // As iOS writes it: a zero patch number is left off.
    expect(screen.getByText('Version 1.0 (1)')).toBeTruthy();
    expect(screen.getAllByText('1.0 (1)').length).toBeGreaterThan(0);
    expect(screen.queryByText(/1\.0\.0/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Acknowledgements' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'licenses' } });
  });
  test('versionLabel drops only a zero patch number', () => {
    const { versionLabel } = require('../src/features/settings/home') as typeof import('../src/features/settings/home');
    expect(versionLabel('1.0.0', '1')).toBe('1.0 (1)');
    expect(versionLabel('1.2.0', '7')).toBe('1.2 (7)');
    expect(versionLabel('1.2.3', '7')).toBe('1.2.3 (7)');
    expect(versionLabel('2.0', '3')).toBe('2.0 (3)');
    expect(versionLabel(undefined, undefined)).toBe('1.0 (1)');
  });
  test('About links the published privacy policy, terms and support pages, and says when one fails to open', async () => {
    mockSection = 'about';
    await show(<Section />);
    for (const [name, page] of [['Privacy policy', 'insight-daily-privacy'], ['Terms of use', 'insight-daily-terms'], ['Help and support', 'insight-daily-support']]) {
      await fireEvent.press(screen.getByRole('button', { name }));
      expect(mockBrowser).toHaveBeenLastCalledWith(`https://willgeiken1.github.io/wellnesstracker/${page}`);
    }
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
    expect(screen.queryByTestId('settings-about-link-failed')).toBeNull();
    const { Linking } = require('react-native') as typeof import('react-native');
    const safari = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('synthetic'));
    mockBrowser.mockRejectedValueOnce(new Error('synthetic'));
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
    expect(await screen.findByTestId('settings-about-link-failed')).toHaveTextContent(t('linkFailed'));
    safari.mockRestore();
  });
  test('Goals saves the calorie and protein targets as food targets, and the goal weight where Progress reads it', async () => {
    const repo = memoryRepository();
    mockSection = 'goals';
    await show(<Section />, { ...base(), repository: repo });
    await fireEvent.press(screen.getAllByRole('button', { name: 'More' })[0]);
    expect(Math.round(Number(repo.list('food_targets').at(-1)?.data.energy_kj) / 4.184)).toBe(2050);
    await fireEvent.press(screen.getAllByRole('button', { name: 'More' })[1]);
    expect(repo.list('food_targets').at(-1)?.data.protein_g).toBe(105);
    const goalStepper = screen.getAllByRole('button', { name: 'More' });
    await fireEvent.press(goalStepper[goalStepper.length - 1]);
    const goal = repo.list('goals').find(r => r.data.kind === 'weight');
    expect(goal?.data).toMatchObject({ kind: 'weight', target_value: 178.5, target_unit: 'lb' });
  });
  test('Reminders counts what is on in its intro', async () => {
    mockSection = 'reminders';
    await show(<Section />);
    // Every reminder starts off; At most 2 a day is a limit and stays on.
    expect(screen.getByText(/0 are on, and you will get at most 2 a day\./)).toBeTruthy();
  });
  test('Delete account offers Save a backup first whenever there is a log of your own to back up', async () => {
    mockSection = 'delete-account';
    const signedIn = await show(<Section />, { ...base(), repository: memoryRepository(), session: { user: { id: 'fixture' } } as AuthState['session'] } as AuthState);
    expect(screen.getByRole('button', { name: 'Save a backup first' })).not.toBeDisabled();
    await signedIn.unmount();
    const phone = await show(<Section />, { ...base(), phoneOnly: true, repository: memoryRepository() });
    expect(screen.getByRole('button', { name: 'Save a backup first' })).not.toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save a backup first' }));
    const { exportPhoneBackup } = require('../src/phone-only/export') as typeof import('../src/phone-only/export');
    expect(exportPhoneBackup).toHaveBeenCalledTimes(1);
    await phone.unmount();
    // Example data is not yours, so there is nothing of yours to back up (Account hides Export backup there too).
    await show(<Section />, { ...base(), demo: true, repository: memoryRepository() });
    expect(screen.getByRole('button', { name: 'Save a backup first' })).toBeDisabled();
  });
  test('Delete account asks twice and only unlocks once DELETE is typed', async () => {
    const deleteAccount = jest.fn(async () => {});
    mockSection = 'delete-account';
    await show(<Section />, { ...base(), repository: memoryRepository(), session: { user: { id: 'fixture' } } as AuthState['session'], deleteAccount } as AuthState);
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delete-continue'));
    expect(screen.getAllByText('Type DELETE to confirm').length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId('delete-type'), 'delet');
    expect(screen.getByTestId('delete-final')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-type'), 'delete');
    expect(screen.getByTestId('delete-final')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId('delete-final'));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
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
