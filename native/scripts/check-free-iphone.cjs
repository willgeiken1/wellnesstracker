// Run from native/: node scripts/check-free-iphone.cjs [--prebuild]
// Only source/assets are copied. No host dotenv, generated projects, credentials or data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-free-iphone-'));
const project = path.join(temp, 'app');
fs.mkdirSync(project);
for (const entry of ['src', 'assets', 'fixtures', 'plugins', 'scripts', 'app.json', 'app.config.js', 'metro.config.js', 'package.json', 'package-lock.json', 'tsconfig.json']) {
  fs.cpSync(path.join(root, entry), path.join(project, entry), { recursive: true, filter: source => !path.basename(source).startsWith('.env') });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'dir');
// Do not inspect or inline any inherited service configuration.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/SUPABASE|EXPO_PUBLIC_|SENTRY|POSTHOG/.test(key)));
Object.assign(env, { APP_VARIANT: 'freeiphone', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1', CI: '1',
  __UNSAFE_EXPO_HOME_DIRECTORY: path.join(temp, 'expo-home'),
  EXPO_PUBLIC_SUPABASE_URL: 'https://synthetic-backend-canary.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_canary' });
function expo(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), ...args], { cwd: project, env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  // Output is from a source-only copy with synthetic configuration.
  if (result.status !== 0) { process.stderr.write(result.stdout || ''); process.stderr.write(result.stderr || ''); throw new Error('Expo inspection failed.'); }
  return result.stdout;
}
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const resolved = JSON.parse(expo(['config', '--type', 'public', '--json']));
assert.equal(resolved.extra.phoneOnly, true);
assert.deepEqual(resolved.ios.entitlements, {});
const blocked = /pvodxxmfgflvgvbdotlv|supabase\.co|synthetic-backend-canary|sb_publishable_|EXPO_PUBLIC_SUPABASE/i;
assert(!blocked.test(JSON.stringify(resolved)), 'Backend config present');
expo(['export', '--platform', 'ios', '--output-dir', 'bundle', '--no-bytecode', '--source-maps', '--clear']);
for (const file of files(path.join(project, 'bundle'))) {
  assert(!blocked.test(fs.readFileSync(file).toString()), 'Backend value present in bundle');
  if (file.endsWith('.map')) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sources = value => [...(value.sources || []), ...(value.sections || []).flatMap(section => sources(section.map))];
    assert(sources(map).length > 0, 'Source map is empty');
    assert(!sources(map).some(source => /src\/auth\/|src\/data\/sync\/(?!flags\.ts$)|@supabase\/|@sentry\/|sentry-expo(?:\/|$)|posthog-/.test(source)), 'Backend or telemetry module present in bundle');
  }
}
console.log('PASS: phone-only config and iOS bundle/source maps contain no backend values, auth, telemetry or sync modules except pure flags.ts (synthetic canaries).');
if (process.argv.includes('--prebuild')) {
  expo(['prebuild', '--platform', 'ios', '--no-install', '--clean']);
  const iosFiles = files(path.join(project, 'ios'));
  const entitlements = iosFiles.filter(file => file.endsWith('.entitlements'));
  assert.equal(entitlements.length, 1);
  for (const file of entitlements) assert(!/healthkit|application-groups|aps-environment|icloud|associated-domains/i.test(fs.readFileSync(file, 'utf8')));
  const info = iosFiles.find(file => file.endsWith('/Info.plist'));
  assert(info);
  assert(!/NSHealth|NSSupportsLiveActivities|remote-notification/.test(fs.readFileSync(info, 'utf8')));
  assert(/EXDevClientEmbeddedBundle/.test(fs.readFileSync(info, 'utf8')));
  const pbx = iosFiles.find(file => file.endsWith('project.pbxproj'));
  const projectText = fs.readFileSync(pbx, 'utf8');
  assert(projectText.includes('export FORCE_BUNDLING=1'));
  assert(projectText.includes('export APP_VARIANT=freeiphone'));
  assert(!projectText.includes('export SKIP_BUNDLING=1'));
  if (process.platform === 'darwin') {
    const decoded = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', pbx], { encoding: 'utf8' });
    assert.equal(decoded.status, 0, 'Generated Xcode project is invalid');
    const objects = JSON.parse(decoded.stdout).objects;
    const phase = Object.values(objects).find(value => value.isa === 'PBXShellScriptBuildPhase' && value.name === 'Bundle React Native code and images');
    assert(phase.shellScript.startsWith('export APP_VARIANT=freeiphone'));
    assert(phase.shellScript.includes('EXPO_NO_TELEMETRY=1\n'));
    assert.equal(spawnSync('/bin/bash', ['-n'], { input: phase.shellScript }).status, 0, 'Generated bundle script is invalid');
  }
  assert(!/com\.apple\.product-type\.app-extension|\.appex|com\.apple\.HealthKit|com\.apple\.ApplicationGroups|com\.apple\.Push/.test(projectText));
  console.log('PASS: unsigned iOS prebuild has one app entitlement file, no restricted capabilities, no Health/Live Activity/background-push plist keys, and no extension target.');
}
console.log(`Inspection artifacts: ${temp}`);
