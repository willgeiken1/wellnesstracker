import path from 'node:path';

/* Reminders are local notifications only (plan Q67): no push entitlement or remote-notification mode in either build. */
const app = require('../app.json').expo;

test('the store build adds expo-notifications with remote notifications off, so no push entitlement is asked for', () => {
  const entry = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications') as [string, { enableRemoteNotifications?: boolean }] | undefined;
  expect(entry).toBeDefined();
  expect(entry![1].enableRemoteNotifications).toBe(false);
  expect(JSON.stringify(app.ios)).not.toMatch(/aps-environment|remote-notification/);
});

test('the phone-only build takes out the push entitlement and background mode that prebuild adds by default', async () => {
  const plugin = require(path.resolve(__dirname, '../plugins/withNoPushEntitlement.js'));
  const config = plugin({ name: 'Synthetic', slug: 'synthetic' });
  const ent = await config.mods.ios.entitlements({ ...config, modResults: { 'aps-environment': 'development', 'com.apple.developer.applesignin': ['Default'] } });
  expect(ent.modResults).toEqual({ 'com.apple.developer.applesignin': ['Default'] });
  const only = await config.mods.ios.infoPlist({ ...config, modResults: { UIBackgroundModes: ['remote-notification'] } });
  expect(only.modResults.UIBackgroundModes).toBeUndefined();
  const kept = await config.mods.ios.infoPlist({ ...config, modResults: { UIBackgroundModes: ['remote-notification', 'audio'] } });
  expect(kept.modResults.UIBackgroundModes).toEqual(['audio']);
  const phone = require('../app.config.js');
  const prev = process.env.APP_VARIANT;
  process.env.APP_VARIANT = 'freeiphone';
  try { expect(phone({ config: { ...app } }).plugins).toContain('./plugins/withNoPushEntitlement'); } finally { process.env.APP_VARIANT = prev; }
});
