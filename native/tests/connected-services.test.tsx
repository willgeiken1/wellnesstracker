import { render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { ConnectedServices, SHOWN, ready, unlocks } from '../src/features/connections/screen';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

test('lists only the services Insight can connect today, with what each adds, read from the widget catalogue', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(SHOWN).toEqual(['appleHealth', 'oura']);
  for (const service of SHOWN) { expect(ready(service)).toBe(true); expect(screen.getByTestId(`connect-${service}`)).toBeTruthy(); }
  for (const later of ['fitbit', 'whoop']) expect(screen.queryByTestId(`connect-${later}`)).toBeNull();
  expect(screen.queryByText(/WHOOP|Fitbit|Coming later/)).toBeNull();
  expect(unlocks('oura')).toEqual(expect.arrayContaining(['Readiness', 'Sleep score', 'HRV']));
  expect(unlocks('appleHealth')).toEqual(['Steps', 'Sleep duration', 'HRV']);
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Steps · Sleep duration · HRV')).toBeTruthy();
});

test('both read Not connected until connected', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(within(screen.getByTestId('connect-oura')).getByText('Not connected')).toBeTruthy();
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Not connected')).toBeTruthy();
});

test('a connected service reads as Connected', async () => {
  await render(<ConnectedServices connected={['oura']} />, { wrapper });
  expect(within(screen.getByTestId('connect-oura')).getByText('Connected')).toBeTruthy();
  expect(screen.getByTestId('connect-oura').props.accessibilityLabel).toMatch(/^Oura, Connected\. Adds /);
});

test('no made-up example day is shown', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(screen.queryByTestId('connect-example-day')).toBeNull();
  expect(screen.queryByTestId('connect-example-pattern')).toBeNull();
  expect(screen.queryByText('Example')).toBeNull();
});

test('without the connect cards it offers nothing to press and says where health values go', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByText('Health values stay on your phone. They are never sent to AI or analytics.')).toBeTruthy();
});
