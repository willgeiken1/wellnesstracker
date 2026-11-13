import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Alert, AppState, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ThemeProvider } from '../src/design/theme-provider';
import { ConnectedServices } from '../src/features/connections/screen';
import { HOME_TILES_KEY } from '../src/features/home/tiles';
import { FIRST_SYNC_DAYS, resetOuraAsk, type OuraSource } from '../src/features/health/oura';
import { useOura } from '../src/features/health/use-oura';
import { useHealthDays } from '../src/features/health/use-health-days';
import type { HealthSource } from '../src/features/health/source';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })) }));
const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const URL = 'https://cloud.ouraring.com/oauth/authorize?client_id=made-up';
/** A made-up account: `approve` is what happens on Oura's page while the browser is open. */
function fakes(start: 'signed-out' | 'off' | 'on' | 'expired', approve = true) {
  let state = start;
  const local = new Map<string, unknown>();
  const source = {
    status: jest.fn(async () => state === 'signed-out' ? null : { connected: state !== 'off', expired: state === 'expired', lastSync: null }),
    connectUrl: jest.fn(async () => URL), sync: jest.fn(async () => {}), days: jest.fn(async () => []),
    disconnect: jest.fn(async () => { state = 'off'; }),
  } satisfies OuraSource;
  jest.mocked(WebBrowser.openBrowserAsync).mockImplementation(async () => { if (approve && (state === 'off' || state === 'expired')) state = 'on'; return { type: 'cancel' } as never; });
  const storage = { localGet: (key: string) => local.get(key), localSave: (key: string, value: unknown) => { local.set(key, value); } };
  return { source, storage, local };
}
function Page({ source, storage }: { source: OuraSource | null; storage: ReturnType<typeof fakes>['storage'] }) {
  return <ConnectedServices oura={useOura(storage as never, source)} />;
}
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
beforeEach(() => { jest.clearAllMocks(); resetOuraAsk(); });

test('with no account to hold it, Oura is not offered and nothing is asked', async () => {
  const none = fakes('off');
  await render(<Page source={null} storage={none.storage} />, { wrapper });
  await settle();
  expect(screen.queryByTestId('connect-oura-card')).toBeNull();
  const out = fakes('signed-out');
  await render(<Page source={out.source} storage={out.storage} />, { wrapper });
  await settle();
  expect(screen.queryByTestId('connect-oura-card')).toBeNull();
  expect(out.source.sync).not.toHaveBeenCalled();
});

test('before connecting there is one Connect button, and nothing is opened, refreshed or read', async () => {
  const { source, storage, local } = fakes('off');
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  expect(screen.getByRole('button', { name: 'Connect Oura' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Disconnect Oura' })).toBeNull();
  expect(within(screen.getByTestId('connect-oura')).getByText('Not connected')).toBeTruthy();
  expect(screen.getByText(/Oura days are kept in your Insight account/)).toBeTruthy();
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  expect(source.sync).not.toHaveBeenCalled();
  expect(source.days).not.toHaveBeenCalled();
  expect(local.size).toBe(0);
});

test('Connect opens Oura\'s page; once approved the row reads Connected, the tiles go on Home by id only, and the first refresh runs', async () => {
  const { source, storage, local } = fakes('off');
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  await fireEvent.press(screen.getByTestId('connect-oura-button'));
  await settle();
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(URL);
  expect(within(screen.getByTestId('connect-oura')).getByText('Connected')).toBeTruthy();
  expect(source.sync).toHaveBeenCalledWith(FIRST_SYNC_DAYS);
  expect(JSON.stringify(local.get(HOME_TILES_KEY))).toMatch(/steps.*sleep|sleep.*steps/);
  expect(JSON.stringify([...local.values()])).not.toMatch(/\d{4,}/);
  expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect Oura' })).toBeTruthy();
});

test('two quick presses open Oura\'s page once', async () => {
  const { source, storage } = fakes('off');
  let close: () => void = () => {};
  jest.mocked(WebBrowser.openBrowserAsync).mockImplementation(() => new Promise(done => { close = () => done({ type: 'cancel' } as never); }));
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  const button = screen.getByTestId('connect-oura-button');
  await act(async () => { fireEvent.press(button); fireEvent.press(button); });
  await settle();
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
  await act(async () => { close(); });
  await settle();
  expect(screen.getByRole('button', { name: 'Connect Oura' }).props.accessibilityState?.disabled).toBeFalsy();
});

test('when Oura has signed Insight out, the row says Reconnect and Reconnect goes back through Oura\'s page', async () => {
  const { source, storage } = fakes('expired');
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  expect(within(screen.getByTestId('connect-oura')).getByText('Reconnect')).toBeTruthy();
  expect(screen.getByText(/Oura signed Insight out/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect Oura' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reconnect Oura' }));
  await settle();
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(URL);
  expect(within(screen.getByTestId('connect-oura')).getByText('Connected')).toBeTruthy();
  expect(source.sync).toHaveBeenCalledWith(FIRST_SYNC_DAYS);
  expect(screen.queryByText(/Oura signed Insight out/)).toBeNull();
});

test('closing Oura\'s page without approving changes nothing', async () => {
  const { source, storage, local } = fakes('off', false);
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  await fireEvent.press(screen.getByTestId('connect-oura-button'));
  await settle();
  expect(screen.getByRole('button', { name: 'Connect Oura' })).toBeTruthy();
  expect(source.sync).not.toHaveBeenCalled();
  expect(local.size).toBe(0);
  expect(screen.queryByTestId('connect-oura-failed')).toBeNull();
});

test('a page that is not Oura\'s is never opened, and the failure is said plainly', async () => {
  const { source, storage } = fakes('off');
  source.connectUrl.mockRejectedValue(new Error('made-up failure'));
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  await fireEvent.press(screen.getByTestId('connect-oura-button'));
  await settle();
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  expect(screen.getByText('Oura could not be reached just now. Try again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Connect Oura' }).props.accessibilityState?.disabled).toBeFalsy();
});

test('Check again refreshes; Disconnect asks first, and only the destructive answer disconnects', async () => {
  const { source, storage } = fakes('on');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Page source={source} storage={storage} />, { wrapper });
  await settle();
  await fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
  await settle();
  expect(source.sync).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Disconnect Oura' }));
  expect(source.disconnect).not.toHaveBeenCalled();
  const [title, body, buttons] = alert.mock.calls.at(-1)!;
  expect(title).toBe('Disconnect Oura?');
  expect(body).toMatch(/removes the Oura sign-in and your stored Oura days/);
  expect(buttons!.map(button => button.style)).toEqual(['cancel', 'destructive']);
  await act(async () => { buttons![0].onPress?.(); });
  expect(source.disconnect).not.toHaveBeenCalled();
  await act(async () => { buttons![1].onPress?.(); });
  await settle();
  expect(source.disconnect).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Connect Oura' })).toBeTruthy();
  alert.mockRestore();
});

describe('Home reads both sources', () => {
  function Probe({ apple, ring }: { apple: HealthSource | null; ring: OuraSource | null }) {
    const read = useHealthDays(true, apple, 1, ring);
    return <Text testID="read">{read ? `${read.steps?.[0]} steps, ${read.sleepHours?.[0]} h` : 'none'}</Text>;
  }
  const sub = () => jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: () => {} })) as never);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ringWith = (rows: () => Promise<{ day: string; sleepSeconds: number | null; steps: number | null }[]>): OuraSource =>
    ({ status: async () => ({ connected: true, lastSync: new Date().toISOString() }), connectUrl: async () => '', sync: async () => {}, days: rows, disconnect: async () => {} });
  test('Oura alone fills Steps and Sleep where Apple Health does not exist', async () => {
    const spy = sub();
    await render(<Probe apple={null} ring={ringWith(async () => [{ day: today(), sleepSeconds: 27000, steps: 6100 }])} />);
    await settle();
    expect(screen.getByTestId('read').props.children).toBe('6100 steps, 7.5 h');
    spy.mockRestore();
  });
  test('Oura failing never hides Apple Health', async () => {
    const spy = sub();
    const apple: HealthSource = { access: async () => 'asked', request: async () => {}, weights: async () => [], steps: async () => 4200, sleep: async () => [] };
    await render(<Probe apple={apple} ring={ringWith(async () => { throw new Error('made-up failure'); })} />);
    await settle();
    expect(String(screen.getByTestId('read').props.children)).toMatch(/^4200 steps/);
    spy.mockRestore();
  });
});
