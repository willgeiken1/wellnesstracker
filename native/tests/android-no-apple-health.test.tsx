import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Platform } from 'react-native';
import { RING_TILES, addHealthTiles, homeLayout } from '../src/features/home/tiles';
import { appleHealth } from '../src/features/health/apple';
import { oura } from '../src/features/health/oura-client';
import { android, en, setAndroidCopy, t } from '../src/i18n/en';

// Android has no Apple Health in v1 (Health Connect comes later): nothing there may name it or offer what only it fills.
jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn(() => null) }));
jest.mock('../src/features/health/oura-client', () => ({ oura: jest.fn(() => null) }));

beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
afterEach(() => setAndroidCopy(false));

test('Android copy never names Apple Health, and iPhone copy is unchanged (the app sets it from Platform.OS at start)', () => {
  setAndroidCopy(true);
  for (const [key, text] of Object.entries(android)) {
    expect(text).not.toMatch(/Apple Health|iPhone/);
    expect(t(key as keyof typeof en)).toBe(text);
  }
  setAndroidCopy(false);
  for (const key of Object.keys(android)) expect(t(key as keyof typeof en)).toBe(en[key as keyof typeof en]);
});

test('Connections lists only Oura on Android', () => {
  jest.isolateModules(() => {
    jest.replaceProperty((require('react-native') as typeof import('react-native')).Platform, 'OS', 'android');
    const { SHOWN } = require('../src/features/connections/screen') as typeof import('../src/features/connections/screen');
    expect(SHOWN).toEqual(['oura']);
  });
});

test('on Android the tile tray offers Steps and Sleep but none of the Apple Health tiles, and Home does not start with them', () => {
  jest.isolateModules(() => {
    jest.replaceProperty((require('react-native') as typeof import('react-native')).Platform, 'OS', 'android');
    const { tilePage } = require('../src/features/tiles/registry') as typeof import('../src/features/tiles/registry');
    const home = tilePage('home'), offered = home.tiles.map(d => d.id), starts = home.defaults.map(([id]) => id);
    for (const id of RING_TILES) expect(offered).toContain(id);
    for (const id of ['active', 'exercise', 'bodyFat', 'mindful']) {
      expect(offered).not.toContain(id);
      expect(starts).not.toContain(id);
    }
  });
});

test('addHealthTiles adds only the tiles it is given', () => {
  let saved: unknown = null;
  const storage = { owner: 'android-owner', localGet: () => saved, localSave: (_key: string, value: unknown) => { saved = value; } };
  addHealthTiles(storage as never, RING_TILES);
  const order = homeLayout(storage as never).map(e => e.id);
  expect(order).toEqual(expect.arrayContaining(['steps', 'sleep']));
  expect(order).not.toContain('active');
});

test('the Android welcome offers Oura now, not in a later update', () => {
  setAndroidCopy(true);
  expect(t('welcomeHealthBody')).toMatch(/Oura/);
  expect(t('welcomeHealthBody')).not.toMatch(/later update|Fitbit|WHOOP/);
});

test('the deletion page says what is not deleted, matching the privacy policy', () => {
  const page = readFileSync(join(__dirname, '../../insight-wellness-delete-account.md'), 'utf8');
  expect(page).not.toMatch(/nothing is kept/i);
  expect(page).toMatch(/## What isn't deleted[\s\S]*Sentry[\s\S]*PostHog/);
  const policy = readFileSync(join(__dirname, '../../insight-daily-privacy.md'), 'utf8');
  for (const service of ['Sentry', 'PostHog']) expect(policy).toMatch(service);
});

test('the privacy policy covers Android and agrees with the deletion page', () => {
  const policy = readFileSync(join(__dirname, '../../insight-daily-privacy.md'), 'utf8');
  expect(policy).toMatch(/iPhone and Android app/);
  expect(policy).toMatch(/Android app doesn't read Health Connect/);
  expect(policy).toContain('(insight-wellness-delete-account)');
  expect(policy).toMatch(/sent to Sentry and usage events already sent to PostHog aren't removed when you delete your account/);
});

test('the privacy policy keeps its effective date, retention periods and contact line', () => {
  const policy = readFileSync(join(__dirname, '../../insight-daily-privacy.md'), 'utf8');
  expect(policy).toMatch(/^_Effective November 18, 2026_$/m);
  expect(policy).toContain('Sentry keeps crash reports for 30 days and PostHog keeps usage events for one year.');
  expect(policy).toMatch(/## Contact\n\ninsight\.wellnessos@gmail\.com\n?$/);
});
