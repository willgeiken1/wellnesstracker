import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';
import PaywallRoute from '../src/app/paywall';
import { redirectSystemPath } from '../src/app/+native-intent';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({ Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null; } }));

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
});

test.each([true, false])('the old paywall path goes Home and shows nothing (dev %s)', async (dev) => {
  const global_ = global as unknown as { __DEV__: boolean };
  const was = global_.__DEV__;
  global_.__DEV__ = dev;
  try {
    mockRedirect.mockClear();
    const view = await render(<PaywallRoute />);
    expect(mockRedirect).toHaveBeenCalledWith('/');
    expect(view.toJSON()).toBeNull();
  } finally { global_.__DEV__ = was; }
});

test('links to the paywall land Home', () => {
  for (const path of ['insight://paywall', 'insight:///paywall', 'INSIGHT://Paywall/']) expect(redirectSystemPath({ path, initial: true })).toBe('/');
});

test('the app has no paywall or Plus code left, and nothing routes to them', () => {
  const src = join(__dirname, '..', 'src');
  const offenders = files(src).filter(file => /features\/(paywall|plus)\//.test(readFileSync(file, 'utf8'))
    || /router\.(push|replace|navigate)\([^)]*paywall/i.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
  expect(() => statSync(join(src, 'features', 'paywall'))).toThrow();
  expect(() => statSync(join(src, 'features', 'plus'))).toThrow();
});
