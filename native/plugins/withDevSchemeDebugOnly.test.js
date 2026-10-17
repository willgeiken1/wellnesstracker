const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const xcode = require('xcode');
const { parse } = require('xcode/lib/parser/pbxproj');
const { AndroidConfig } = require('expo/config-plugins');
const plist = require('@expo/plist');
const pluginPath = path.join(__dirname, 'withDevSchemeDebugOnly.js');
const scheme = 'exp+insight-daily';
const target = '111111111111111111111111';

async function getPhase() {
  assert.ok(existsSync(pluginPath), 'debug-only scheme plugin must exist');
  const plugin = require(pluginPath);
  const project = xcode.project('synthetic.pbxproj');
  project.hash = { project: { objects: {
    PBXNativeTarget: { [target]: { name: 'InsightDaily', buildPhases: [] } },
    PBXBuildFile: {}, PBXFileReference: {},
  } } };
  let serialized;
  for (let i = 0; i < 2; i++) {
    const config = plugin({ name: 'Insight Daily', slug: 'insight-daily' });
    await config.mods.ios.xcodeproj({ ...config, modResults: project, modRequest: { projectName: 'InsightDaily' } });
    if (i) assert.equal(project.writeSync(), serialized);
    serialized = project.writeSync();
  }
  assert.equal(project.pbxNativeTargetSection()[target].buildPhases.length, 1);
  const phaseId = project.pbxNativeTargetSection()[target].buildPhases[0].value;
  const phase = parse(serialized).project.objects.PBXShellScriptBuildPhase[phaseId];
  assert.deepEqual(phase.inputPaths, ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"']);
  assert.deepEqual(phase.outputPaths, ['"$(DERIVED_FILE_DIR)/insight-dev-scheme-$(CONFIGURATION).stamp"']);
  return project.hash.project.objects.PBXShellScriptBuildPhase[phaseId].shellScript.slice(1, -1).replace(/\\"/g, '"');
}

test('iOS mod is idempotent and declares processed plist dependency', getPhase);

test('iOS built plist retains app schemes, strips dev scheme in all non-Debug configurations', {
  skip: process.platform !== 'darwin' ? 'requires macOS PlistBuddy' : false,
}, async () => {
  const script = await getPhase();
  const root = mkdtempSync(path.join(tmpdir(), 'insight-dev-scheme-'));
  const plistPath = path.join(root, 'Synthetic App.app', 'Info.plist');
  mkdirSync(path.dirname(plistPath));
  const run = (configuration, source = script) => execFileSync('/bin/sh', ['-c', source], {
    env: { ...process.env, CONFIGURATION: configuration, TARGET_BUILD_DIR: root,
      INFOPLIST_PATH: 'Synthetic App.app/Info.plist', DERIVED_FILE_DIR: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    for (const configuration of ['Debug', 'Release', 'Profile']) {
      // Include duplicates and a mixed entry so deleting the dev entry cannot lose app schemes.
      writeFileSync(plistPath, plist.default.build({ CFBundleURLTypes: [
        { CFBundleURLSchemes: [scheme] },
        { CFBundleURLSchemes: ['insight', scheme, 'com.insightwellness.app'] },
        { CFBundleURLSchemes: [scheme] },
      ], SyntheticUnrelated: 'preserved' }));
      if (configuration === 'Profile') execFileSync('/usr/bin/plutil', ['-convert', 'binary1', plistPath]);
      run(configuration);
      // Use real PlistBuddy to read either XML or the binary built-plist representation.
      execFileSync('/usr/bin/plutil', ['-convert', 'xml1', plistPath]);
      const result = plist.default.parse(readFileSync(plistPath, 'utf8'));
      const schemes = result.CFBundleURLTypes.flatMap(entry => entry.CFBundleURLSchemes);
      assert.ok(schemes.includes('insight'));
      assert.ok(schemes.includes('com.insightwellness.app'));
      assert.equal(schemes.includes(scheme), configuration === 'Debug');
      assert.equal(result.SyntheticUnrelated, 'preserved');
      assert.ok(existsSync(path.join(root, `insight-dev-scheme-${configuration}.stamp`)));
      run(configuration);
    }
    writeFileSync(plistPath, plist.default.build({}));
    run('Release');
    writeFileSync(plistPath, plist.default.build({ CFBundleURLTypes: [{ CFBundleURLSchemes: [scheme] }] }));
    assert.throws(() => run('Release', script.replaceAll('buddy "Delete', 'false "Delete')), 'failed deletion must stop the build');
    writeFileSync(plistPath, '<plist><dict>');
    assert.throws(() => run('Release'), 'invalid plist must fail closed');
    rmSync(plistPath);
    assert.throws(() => run('Release'), 'missing built plist must fail closed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const existingDebug of [false, true]) test(`Android moves dev scheme into debug only (existing overlay=${existingDebug}), idempotently`, async () => {
  assert.ok(existsSync(pluginPath));
  const plugin = require(pluginPath);
  const { withGeneratedAndroidScheme } = require('expo-dev-client/plugin/build/withGeneratedAndroidScheme');
  const root = mkdtempSync(path.join(tmpdir(), 'insight-debug-manifest-'));
  const debugPath = path.join(root, 'app/src/debug/AndroidManifest.xml');
  mkdirSync(path.dirname(debugPath), { recursive: true });
  if (existingDebug) writeFileSync(debugPath, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:usesCleartextTraffic="true" /></manifest>');
  const viewFilter = data => ({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }, { $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
    data: data.map(value => ({ $: { 'android:scheme': value } })),
  });
  const original = { manifest: { application: [{ activity: [{ $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' },
    'intent-filter': [viewFilter(['insight', 'com.insightwellness.app'])],
  }] }] } };
  try {
    let previous;
    for (let i = 0; i < 3; i++) {
      const config = plugin(withGeneratedAndroidScheme({ name: 'Insight Daily', slug: 'insight-daily' }));
      // Reapply to fresh upstream output, just as Expo regenerates the main manifest.
      const input = structuredClone(original);
      if (i === 2) input.manifest.application[0].activity[0]['intent-filter'].push(viewFilter([scheme]));
      const result = await config.mods.android.manifest({ ...config, modResults: input,
        modRequest: { platformProjectRoot: root } });
      const filters = result.modResults.manifest.application[0].activity[0]['intent-filter'];
      assert.equal(filters.length, 1, 'do not leave a broad VIEW filter with no data');
      assert.deepEqual(filters[0].data.map(d => d.$['android:scheme']), ['insight', 'com.insightwellness.app']);
      const debug = await AndroidConfig.Manifest.readAndroidManifestAsync(debugPath);
      if (existingDebug) assert.equal(debug.manifest.application[0].$['android:usesCleartextTraffic'], 'true');
      const debugSchemes = debug.manifest.application[0].activity.flatMap(a => a['intent-filter'].flatMap(f => f.data.map(d => d.$['android:scheme'])));
      assert.deepEqual(debugSchemes, [scheme]);
      const current = readFileSync(debugPath, 'utf8');
      if (i) assert.equal(current, previous);
      previous = current;
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
