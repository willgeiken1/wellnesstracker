import { render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { ConnectedServices, EXAMPLE_DAY, ready, unlocks } from '../src/features/connections/screen';
import { SERVICES } from '../src/features/home-widgets/registry';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

test('lists every service with what it adds, read from the widget catalogue', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(SERVICES).toEqual(['oura', 'appleHealth', 'fitbit', 'whoop']);
  for (const service of SERVICES) expect(screen.getByTestId(`connect-${service}`)).toBeTruthy();
  expect(unlocks('oura')).toEqual(expect.arrayContaining(['Readiness', 'Sleep score', 'HRV']));
  expect(unlocks('appleHealth')).toEqual(['Steps', 'Sleep duration', 'HRV']);
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Steps · Sleep duration · HRV')).toBeTruthy();
});

test('services without a built connector say Coming later; the rest say Not connected', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(ready('oura')).toBe(true);
  expect(ready('fitbit')).toBe(false);
  expect(within(screen.getByTestId('connect-oura')).getByText('Not connected')).toBeTruthy();
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Not connected')).toBeTruthy();
  expect(within(screen.getByTestId('connect-fitbit')).getByText('Coming later')).toBeTruthy();
  expect(within(screen.getByTestId('connect-whoop')).getByText('Coming later')).toBeTruthy();
});

test('a connected service reads as Connected', async () => {
  await render(<ConnectedServices connected={['oura']} />, { wrapper });
  expect(within(screen.getByTestId('connect-oura')).getByText('Connected')).toBeTruthy();
  expect(screen.getByTestId('connect-oura').props.accessibilityLabel).toMatch(/^Oura, Connected\. Adds /);
});

test('the combined day is marked as an example and names a source on every row', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(screen.getByText('Example')).toBeTruthy();
  const day = screen.getByTestId('connect-example-day');
  for (const row of EXAMPLE_DAY) {
    expect(within(day).getByText(row.label)).toBeTruthy();
    expect(row.sources.length).toBeGreaterThan(0);
  }
  expect(within(day).getAllByText('Oura').length).toBeGreaterThan(1);
});

test('the preview offers nothing to press and says nothing is connected or sent', async () => {
  await render(<ConnectedServices />, { wrapper });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByText('Connecting opens in a later update. Nothing is connected or read yet.')).toBeTruthy();
  expect(screen.getByText('Health values stay on your phone. They are never sent to AI or analytics.')).toBeTruthy();
});
