import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { ConnectedServices } from '../src/features/connections/screen';
import type { Repository } from '../src/data/repository';
import { appleHealth } from '../src/features/health/apple';
import type { HealthAccess, HealthSource, WeightSample } from '../src/features/health/source';
import { useAppleHealth } from '../src/features/health/use-apple-health';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
// Made-up readings only.
const samples: WeightSample[] = [1, 2, 3].map(n => ({ id: `AAAAAAAA-0000-4000-8000-00000000000${n}`, at: new Date(2026, 9, n, 7), kg: 80 + n / 10 }));
function fakes(start: HealthAccess, list = samples) {
  let access = start;
  const saved = new Map<string, unknown>();
  const source: HealthSource = {
    access: jest.fn(async () => access),
    request: jest.fn(async () => { access = 'asked'; }),
    weights: jest.fn(async () => list),
  };
  const repo = { list: () => [], get: (_: string, id: string) => saved.get(id), save: (_: string, data: unknown, id: string) => { saved.set(id, data); } } as unknown as Repository;
  return { source, repo, saved };
}
function Page({ repo, source }: { repo: Repository | null; source: HealthSource | null }) {
  return <ConnectedServices apple={useAppleHealth(repo, source)} />;
}
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

test('before connecting, nothing is read and the page offers one Connect button', async () => {
  const { source, repo, saved } = fakes('ask');
  await render(<Page repo={repo} source={source} />, { wrapper });
  await settle();
  expect(screen.getByRole('button', { name: 'Connect Apple Health' })).toBeTruthy();
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Not connected')).toBeTruthy();
  expect(source.request).not.toHaveBeenCalled();
  expect(source.weights).not.toHaveBeenCalled();
  expect(saved.size).toBe(0);
});

test('Connect asks once, brings the weights in and says how many', async () => {
  const { source, repo, saved } = fakes('ask');
  await render(<Page repo={repo} source={source} />, { wrapper });
  await settle();
  await fireEvent.press(screen.getByTestId('connect-apple-button'));
  await settle();
  expect(source.request).toHaveBeenCalledTimes(1);
  expect(saved.size).toBe(3);
  expect(screen.getByText('3 weights added.')).toBeTruthy();
  expect(within(screen.getByTestId('connect-appleHealth')).getByText('Connected')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check for new weights' })).toBeTruthy();
});

test('once connected, opening the page picks up new weights without asking again', async () => {
  const { source, repo, saved } = fakes('asked');
  await render(<Page repo={repo} source={source} />, { wrapper });
  await settle();
  expect(source.request).not.toHaveBeenCalled();
  expect(saved.size).toBe(3);
  expect(screen.getByText('3 weights added.')).toBeTruthy();
});

test('a failed read says so plainly and can be retried', async () => {
  const { source, repo } = fakes('asked');
  (source.weights as jest.Mock).mockRejectedValueOnce(new Error('made-up failure'));
  await render(<Page repo={repo} source={source} />, { wrapper });
  await settle();
  expect(screen.getByTestId('connect-apple-failed')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('connect-apple-button'));
  await settle();
  expect(screen.queryByTestId('connect-apple-failed')).toBeNull();
});

test('with no Apple Health on the device the page stays the plain preview', async () => {
  const { repo } = fakes('ask');
  await render(<Page repo={repo} source={null} />, { wrapper });
  await settle();
  expect(screen.queryByTestId('connect-apple-card')).toBeNull();
  expect(screen.getByText('Connecting opens in a later update. Nothing is connected or read yet.')).toBeTruthy();
});

test('the Apple adapter is absent where the native module is missing', () => {
  expect(appleHealth()).toBeNull();
});
