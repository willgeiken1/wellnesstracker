import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(__dirname, '..');
const base = require('../app.json').expo;
const configPath = path.join(root, 'app.config.js');
function resolve(config = base, variant?: string) {
  const before = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant; else delete process.env.APP_VARIANT;
  try { return fs.existsSync(configPath) ? require(configPath)({ config }) : config; }
  finally { if (before === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = before; }
}
/** The one approved change to every variant: the app icon set from Settings, Appearance (expo-alternate-app-icons,
 * Lit Peaks in the default palette as the primary icon). Nothing else may differ from app.json. */
const appIcons = require('../plugins/app-icons');
const withIcons = (config: typeof base) => ({ ...config, ios: { ...config.ios, icon: appIcons.PRIMARY_ART }, plugins: [...config.plugins, appIcons.plugin] });
test('default configuration is deeply unchanged, including existing capabilities', () => {
  expect(resolve()).toEqual(withIcons(base));
  const future = { ...base, ios: { ...base.ios, entitlements: { 'com.apple.developer.healthkit': true, 'com.apple.security.application-groups': ['group.fixture'], 'aps-environment': 'development' } }, extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'Widgets' }] } } } } } };
  expect(resolve(future)).toEqual(withIcons(future));
});
test('the app icon set is the three approved styles, every palette, Dark and Light, with art on disk', () => {
  expect(appIcons.PRIMARY_ART).toBe('./assets/icon/lit/orchidEvening-dark.png');
  const palettes = Object.keys(require('../src/design/tokens.json').palettes).length;
  expect(appIcons.icons).toHaveLength(3 * palettes * 2 - 1);
  for (const icon of appIcons.icons as { name: string; ios: Record<string, string> }[]) {
    expect(icon.name).toMatch(/^(LitPeaks|DuskGlow|ClearNight)[A-Z]\w*(Dark|Light)$/);
    for (const art of Object.values(icon.ios)) expect(fs.existsSync(path.join(root, art))).toBe(true);
  }
  expect(fs.existsSync(path.join(root, appIcons.PRIMARY_ART))).toBe(true);
});
test('freeiphone strips capabilities/extensions and backend configuration, even if added to default later', () => {
  const dangerous = { ...base, ios: { ...base.ios, usesAppleSignIn: true, associatedDomains: ['applinks:fixture.invalid'], entitlements: { 'com.apple.developer.healthkit': true, 'com.apple.security.application-groups': ['group.fixture'], 'aps-environment': 'development' }, infoPlist: { UIBackgroundModes: ['remote-notification'], NSHealthShareUsageDescription: 'fixture', NSSupportsLiveActivities: true } }, plugins: [...base.plugins, '@kingstinct/react-native-healthkit', 'expo-widgets', 'expo-notifications'], extra: { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'synthetic', eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'Widgets' }] } } } } } };
  const result = resolve(dangerous, 'freeiphone');
  expect(result.ios.entitlements).toEqual({});
  expect(result.ios.usesAppleSignIn).toBeUndefined();
  expect(result.ios.associatedDomains).toBeUndefined();
  expect(result.ios.infoPlist?.UIBackgroundModes).toBeUndefined();
  expect(result.extra).toEqual({ appVariant: 'freeiphone', phoneOnly: true, capabilities: { health: false, widgets: false, push: false } });
  expect(JSON.stringify(result)).not.toMatch(/healthkit|application-groups|aps-environment|expo-widgets|expo-notifications|supabase|pvodxxmfgflvgvbdotlv/i);
});
test('free-iphone EAS profile selects the same variant with development signing', () => {
  const file = path.join(root, 'eas.json');
  const profile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).build['free-iphone'] : {};
  expect(profile).toMatchObject({ developmentClient: true, env: { APP_VARIANT: 'freeiphone', EXPO_NO_DOTENV: '1' }, ios: { buildConfiguration: 'Debug' } });
});
test('freeiphone enables an embedded dev-client bundle and the variant-only bundling plugin', () => {
  const result = resolve(base, 'freeiphone');
  expect(result.plugins).toContainEqual(['expo-dev-client', { launchMode: 'most-recent', embeddedBundle: true }]);
  expect(result.plugins).toContain('./plugins/withPhoneOnlyBundle');
});
test('Sign in with Apple and plain photo permission text are in the store build; the phone-only build has no accounts, so neither the capability nor its plugin', () => {
  const store = resolve();
  expect(store.ios.usesAppleSignIn).toBe(true);
  expect(store.plugins).toContain('expo-apple-authentication');
  const picker = store.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-image-picker')[1];
  expect(picker.photosPermission).toMatch(/profile photo/);
  expect(picker.cameraPermission).not.toMatch(/estimate/i);
  const phone = resolve(base, 'freeiphone');
  expect(phone.ios.usesAppleSignIn).toBeUndefined();
  expect(JSON.stringify(phone)).not.toMatch(/apple-authentication|applesignin/i);
});
